/**
 * visual-consistency-checker.ts — VLM 视觉一致性质检器（quality-gate P1）
 *
 * 设计来源：docs/DESIGN-QUALITY-GATE.md §3/§4.1
 * 将原有 checkVisualConsistency 的 VLM 多图比对逻辑包装为 QualityChecker：
 * - category: vlm（远程视觉大模型比对）
 * - I/O 全部通过 QualityCheckerDeps.analyzeImage 注入（shared-logic 零依赖约束）
 * - payload 携带逐元素分数（旧 API 映射回 ConsistencyCheckResult 用）
 */
import type { QualityChecker, QualityCheckerDeps, QualityCheckInput, QualityCheckResult } from "@/shared-logic/quality-gate";
import { safeJsonParse } from "@/shared/utils/safe-json";
import { extractJsonObject } from "@/shared-logic/json";

export const VISUAL_CONSISTENCY_CHECKER_ID = "vlm.visual-consistency";

interface VlmScoreEntry {
  name: string;
  score: number;
  issues: string[];
}

interface VlmAnalysis {
  scores: VlmScoreEntry[];
  overallScore: number;
  recommendation?: "accept" | "regenerate" | "adjust";
}

/** 构建 VLM 比对 prompt（基于 gate 的 references + featureAnchors） */
function buildGateConsistencyPrompt(input: QualityCheckInput): string {
  const refDescriptions = input.references
    .map((r, i) => `- 参考素材${i + 1}（${r.role}）: ${r.imageUrl}`)
    .join("\n");
  const anchorKeys = Object.keys(input.featureAnchors ?? {});

  const referenceSection = input.references.length > 0
    ? `\n参考图说明：已提供 ${input.references.length} 张参考图（角色/场景的原始设计图），请严格比对生成图与参考图中的元素一致性，重点关注外观特征、配色、风格的差异。\n${refDescriptions}\n`
    : "";

  return `请分析这张图片中以下元素的一致性：

${input.references.length > 0 ? input.references.map((r) => `- ${r.role}（${r.imageUrl}）`).join("\n") : "（未提供参考素材）"}
${anchorKeys.length > 0 ? `特征锚定配置：${anchorKeys.join("、")}` : ""}${referenceSection}
请评估每个元素的外观一致性，给出0-1的分数，并指出不一致的地方。
请用以下JSON格式回复：
{
  "scores": [
    {"name": "元素名", "score": 0.8, "issues": ["问题描述"]}
  ],
  "overallScore": 0.8,
  "recommendation": "accept" | "regenerate" | "adjust"
}`;
}

function tryParseVlmAnalysis(text: string): VlmAnalysis | null {
  const candidates: unknown[] = [];
  const direct = safeJsonParse<VlmAnalysis | null>(text, null);
  if (direct && typeof direct === "object" && "scores" in direct) candidates.push(direct);
  const codeBlock = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlock) {
    const parsed = safeJsonParse<VlmAnalysis | null>(codeBlock[1], null);
    if (parsed && typeof parsed === "object" && "scores" in parsed) candidates.push(parsed);
  }
  const jsonStr = extractJsonObject(text);
  if (jsonStr) {
    const parsed = safeJsonParse<VlmAnalysis | null>(jsonStr, null);
    if (parsed && typeof parsed === "object" && "scores" in parsed) candidates.push(parsed);
  }
  return candidates.length > 0 ? (candidates[0] as VlmAnalysis) : null;
}

function classifyScore(score: number): "pass" | "warn" | "fail" {
  if (score >= 0.6) return "pass";
  if (score >= 0.45) return "warn";
  return "fail";
}

export function createVisualConsistencyCheckerFactory(): () => QualityChecker {
  return () => {
    const checker: QualityChecker = {
      id: VISUAL_CONSISTENCY_CHECKER_ID,
      category: "vlm",
      supports: ["character_consistency", "scene_consistency"],
      async run(input: QualityCheckInput, deps: QualityCheckerDeps = {}): Promise<QualityCheckResult> {
        if (!input.generated.imageUrl) {
          return { ok: false, checkerId: checker.id, category: "vlm", error: "无生成图" };
        }
        if (!deps.analyzeImage) {
          return { ok: false, checkerId: checker.id, category: "vlm", error: "VLM 不可用（analyzeImage 未注入）" };
        }

        const prompt = buildGateConsistencyPrompt(input);
        const res = await deps.analyzeImage(input.generated.imageUrl, prompt);
        if (!res.ok || !res.text) {
          return { ok: false, checkerId: checker.id, category: "vlm", error: res.error ?? "VLM 分析失败" };
        }

        const analysis = tryParseVlmAnalysis(res.text);
        if (!analysis) {
          // VLM 返回无法解析 → 低分项（保留旧语义：unparseable 非 err）
          return {
            ok: true,
            checkerId: checker.id,
            category: "vlm",
            verdict: "fail",
            score: 0.5,
            evidence: "VLM 返回无法解析",
            payload: { scores: [], overallScore: 0.5, recommendation: "adjust" },
          };
        }

        const scores = Array.isArray(analysis.scores) ? analysis.scores : [];
        // overallScore 缺失时从逐元素分数取平均（与旧 mapAnalysisToResult 语义一致）
        const avgScore = scores.length > 0
          ? scores.reduce((s, e) => s + e.score, 0) / scores.length
          : 0;
        const overallScore = Math.max(0, Math.min(1, typeof analysis.overallScore === "number" ? analysis.overallScore : avgScore));
        const issues = scores.flatMap((s) => s.issues ?? []);

        return {
          ok: true,
          checkerId: checker.id,
          category: "vlm",
          verdict: classifyScore(overallScore),
          score: overallScore,
          evidence: issues.length > 0 ? issues.join("；") : "视觉一致性通过（VLM 比对无显著差异）",
          payload: {
            scores: scores.map((s) => ({
              name: s.name,
              score: Math.max(0, Math.min(1, s.score)),
              issues: s.issues ?? [],
            })),
            overallScore,
            recommendation: analysis.recommendation,
          },
        };
      },
    };
    return checker;
  };
}
