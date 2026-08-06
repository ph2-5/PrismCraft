import type { Result } from "@/domain/types";
import { ok, err, AppError } from "@/domain/types";
import { container } from "@/infrastructure/di";
import type { ConsistencyCheckResult, StoryBeat, StoryElement } from "@/domain/schemas";
import { errorLogger } from "@/shared/error-logger";
import { t } from "@/shared/constants/messages";
import {
  registerQualityChecker,
  registerBuiltinCheckers,
  QualityGateRunner,
  type QualityCheckerDeps,
  type QualityCheckInput,
  type QualityReport,
} from "@/shared-logic/quality-gate";
import { createVisualConsistencyCheckerFactory, VISUAL_CONSISTENCY_CHECKER_ID } from "./visual-consistency-checker";

export interface ConsistencyCheckInput {
  beat: StoryBeat;
  elements: StoryElement[];
  generatedImageUrl?: string;
  structuredOutput?: ConsistencyAnalysisResult;
}

// ─────────────────────────────────────────────────────────────
// P1：模型无关质检层接入（v0.2 设计 §4.1 API 演进策略）
// 新 API checkWithQualityGate（全量报告）；旧 API checkVisualConsistency
// 标记 @deprecated 并内部映射到新 API，仅供存量调用方过渡。
// ─────────────────────────────────────────────────────────────

let vlmCheckerRegistered = false;

/** 惰性注册质检器（避免模块加载副作用 R188；幂等）：rule 内置 + VLM */
function ensureVlmCheckerRegistered(): void {
  if (vlmCheckerRegistered) return;
  registerBuiltinCheckers();
  registerQualityChecker(VISUAL_CONSISTENCY_CHECKER_ID, createVisualConsistencyCheckerFactory());
  vlmCheckerRegistered = true;
}

export interface QualityGateCheckInput extends ConsistencyCheckInput {
  providerId?: string;
  modelId?: string;
}

/** 从元素 image bindings 提取 gate references（角色/场景） */
function collectGateReferences(elements: StoryElement[]): QualityCheckInput["references"] {
  const refs: QualityCheckInput["references"] = [];
  for (const el of elements) {
    const imageBinding = el.bindings?.find((b) => b.type === "image");
    if (imageBinding?.url) {
      refs.push({ imageUrl: imageBinding.url, role: el.type === "character" ? "character" : "scene" });
    }
  }
  return refs;
}

/**
 * 生成后质检（新 API，v0.2 设计 §4.1）
 * 全量信息：多 checker 明细（rule + vlm）+ standardsUsed + feedback。
 * 失败语义：runner 编排器绝不 throw（R192），VLM 单点失败以 ok:false 项呈现。
 */
export async function checkWithQualityGate(
  input: QualityGateCheckInput,
): Promise<Result<QualityReport>> {
  ensureVlmCheckerRegistered();

  const gateInput: QualityCheckInput = {
    kind: "character_consistency",
    generated: { imageUrl: input.generatedImageUrl },
    references: collectGateReferences(input.elements),
    featureAnchors: input.beat.featureAnchoring as Record<string, unknown> | undefined,
    provenance: {
      providerId: input.providerId ?? "unknown",
      modelId: input.modelId ?? "unknown",
    },
  };

  const deps: QualityCheckerDeps = {
    analyzeImage: async (url, prompt) => {
      try {
        const res = await container.imageApi.analyze(url, "scene", prompt, undefined, undefined, undefined);
        return res.ok
          ? { ok: true, text: res.value.analysis }
          : { ok: false, error: res.error instanceof Error ? res.error.message : String(res.error) };
      } catch (e) {
        // VLM 调用抛异常 → 转为 ok:false（checker 呈现失败项，保持旧失败语义）
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
    log: (msg, level) => {
      if (level === "error") errorLogger.error(msg);
      else errorLogger.warn(msg);
    },
  };

  const report = await new QualityGateRunner({
    kinds: ["character_consistency", "scene_consistency", "artifact"],
  }).run(gateInput, deps);

  return ok(report);
}

/** 从 QualityReport 映射回旧 ConsistencyCheckResult（存量调用方过渡用） */
function mapReportToLegacy(report: QualityReport, elements: StoryElement[]): ConsistencyCheckResult {
  const vlmItem = report.items.find((i) => i.ok && i.category === "vlm");
  const payload = vlmItem?.ok
    ? (vlmItem.payload as {
        scores?: Array<{ name: string; score: number; issues: string[] }>;
        overallScore?: number;
        recommendation?: "accept" | "regenerate" | "adjust";
      } | undefined)
    : undefined;

  const characterScores = (payload?.scores ?? []).map((s) => {
    const el = elements.find((e) => e.name === s.name || s.name.includes(e.name));
    return {
      elementId: el?.id ?? s.name,
      elementName: s.name,
      score: s.score,
      issues: s.issues ?? [],
    };
  });

  const overallScore = payload?.overallScore ?? (vlmItem?.ok ? vlmItem.score : 0);
  // 与旧 mapAnalysisToResult 语义一致：recommendation 优先取 VLM 解析结果，否则按分数推导
  const recommendation = payload?.recommendation
    ?? (overallScore >= 0.8 ? "accept" : overallScore >= 0.6 ? "adjust" : "regenerate");

  return {
    passed: overallScore >= 0.6,
    characterScores,
    overallScore,
    recommendation,
  };
}

/** @deprecated 请改用 {@link checkWithQualityGate}（v0.2 设计 §4.1，P2 清理存量调用方后移除） */
export async function checkVisualConsistency(
  input: ConsistencyCheckInput,
): Promise<Result<ConsistencyCheckResult>> {
  const { beat, elements, generatedImageUrl, structuredOutput } = input;

  if (!generatedImageUrl && !structuredOutput) {
    return ok({
      passed: false,
      characterScores: [],
      overallScore: 0,
      recommendation: "adjust",
    });
  }

  const boundElements = elements.filter(
    (el) => beat.elementIds?.includes(el.id) || (beat.elementBindings && el.id in beat.elementBindings),
  );

  if (boundElements.length === 0) {
    return ok({
      passed: true,
      characterScores: [],
      overallScore: 1.0,
      recommendation: "accept",
    });
  }

  if (structuredOutput) {
    return ok(parseConsistencyAnalysisFromStructured(structuredOutput, boundElements));
  }

  try {
    // 走新 API（模型无关质检层）：rule checkers + VLM 视觉比对
    const reportResult = await checkWithQualityGate(input);
    if (!reportResult.ok) {
      return err(new AppError("CONSISTENCY_CHECK_FAILED", t("error.consistencyCheckFailed"), reportResult.error));
    }

    // VLM 单点失败 → 保持旧失败语义（返回 err 而非假成功）
    const vlmFailed = reportResult.value.items.find((i) => !i.ok);
    if (vlmFailed) {
      return err(new AppError("CONSISTENCY_CHECK_FAILED", t("error.consistencyCheckFailed"), vlmFailed.error));
    }

    return ok(mapReportToLegacy(reportResult.value, boundElements));
  } catch (e) {
    return err(new AppError("CONSISTENCY_CHECK_ERROR", t("error.consistencyCheckError"), e));
  }
}

interface ConsistencyAnalysisScore {
  name: string;
  score: number;
  issues: string[];
}

interface ConsistencyAnalysisResult {
  scores: ConsistencyAnalysisScore[];
  overallScore: number;
  recommendation: "accept" | "regenerate" | "adjust";
}

function buildUnparseableResult(elements: StoryElement[]): ConsistencyCheckResult {
  return {
    passed: false,
    characterScores: elements.map((el) => ({
      elementId: el.id,
      elementName: el.name,
      score: 0.5,
      issues: [t("error.consistencyParseFailed")],
    })),
    overallScore: 0.5,
    recommendation: "adjust",
  };
}

function mapAnalysisToResult(parsed: ConsistencyAnalysisResult, elements: StoryElement[]): ConsistencyCheckResult {
  const scores = parsed.scores || [];

  const characterScores = elements.map((el) => {
    const matched = scores.find(
      (s) => s.name === el.name || s.name.includes(el.name),
    );
    return {
      elementId: el.id,
      elementName: el.name,
      score: matched?.score ?? 0.7,
      issues: matched?.issues || [],
    };
  });

  const overallScore = parsed.overallScore ?? characterScores.reduce((s, c) => s + c.score, 0) / characterScores.length;

  return {
    passed: overallScore >= 0.6,
    characterScores,
    overallScore,
    recommendation: parsed.recommendation || (overallScore >= 0.8 ? "accept" : overallScore >= 0.6 ? "adjust" : "regenerate"),
  };
}

export function parseConsistencyAnalysisFromStructured(
  data: ConsistencyAnalysisResult,
  elements: StoryElement[],
): ConsistencyCheckResult {
  if (!data || !Array.isArray(data.scores)) {
    return buildUnparseableResult(elements);
  }
  return mapAnalysisToResult(data, elements);
}
