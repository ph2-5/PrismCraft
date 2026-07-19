/**
 * Task 2A.23: qc-orchestrator — 一致性 QC 编排服务
 *
 * 职责：
 *   1. runQualityCheck(input): QC 主入口，编排完整 QC 流程
 *   2. 流程：抽帧 → embedding 提取 → 相似度比对 → 判定 → 生成 QCReport
 *   3. 异步非阻塞（INV-1）：QC 失败不影响 VideoTask 完成回调
 *   4. Embedding 可插拔（INV-2）：face embedding 不可用时降级为 VLM 单点检查
 *
 * 调用方：
 *   - polling-task-handler.ts 在 VideoTask completed 时触发
 *   - QCDashboardPanel 用户手动触发"重新检查"
 *
 * 不修改原视频：仅读取视频帧，QC 结果作为新 QCReport 存于 StoryBeat.qcReport（INV-6）
 */

import { errorLogger } from "@/shared/error-logger";
import { generateThumbnail } from "@/modules/ffmpeg-runner";
import {
  createEmptyQCReport,
  computeAggregates,
  determineVerdict,
  type QCReport,
  type FrameScore,
} from "../domain/qc-schema";
import {
  resolvePolicy,
  shouldFallbackToFaceSwap,
  type DriftPolicy,
} from "../domain/drift-policy";
import {
  getFaceEmbeddingProvider,
  type EmbeddingMetadata,
} from "./face-embedding-service";
import {
  checkFrameConsistency,
  computeFrameStats,
  type FrameEmbeddingInput,
} from "./similarity-checker";

/** QC 输入 */
export interface QCInput {
  /** 关联的 VideoTask ID */
  videoTaskId: string;
  /** 视频 URL（用于抽帧） */
  videoUrl: string;
  /** 视频时长（秒，用于计算抽帧时间点） */
  durationSec: number;
  /** 角色参考图 URL（用于生成 reference embedding） */
  characterRefImageUrl?: string;
  /** 关联的角色 ID（用于报告） */
  characterId?: string;
  /** 关联的 StoryBeat ID（用于持久化 QCReport） */
  beatId?: string;
  /** 漂移策略覆盖（默认使用 DEFAULT_DRIFT_POLICY） */
  policy?: Partial<DriftPolicy>;
  /** 使用的分镜策略（用于报告） */
  strategy?: string;
}

/** QC 输出 — 包装 QCReport + 内部状态用于 fallback 决策 */
export interface QCOutput {
  report: QCReport;
  /** 是否需要触发 fallback（drift_critical） */
  needsFallback: boolean;
  /** 实际使用的 provider 类型 */
  providerType: EmbeddingMetadata["providerType"];
  /** 抽帧的图片 URL 列表（用于 UI 展示和 debug） */
  sampledFrameUrls: string[];
}

/** QC 内部错误（用于日志和 fallback 决策，不对外抛出） */
export type QCErrorKind =
  | "duration_invalid"
  | "frame_extract_failed"
  | "reference_extract_failed"
  | "no_frame_extracted"
  | "provider_unavailable";

/** 抽帧结果 */
interface ExtractedFrame {
  /** 帧索引（0-based） */
  frameIndex: number;
  /** 时间戳（秒） */
  timestamp: number;
  /** 帧图片本地路径（generateThumbnail 返回） */
  imageUrl: string;
}

/**
 * 主入口：运行一次完整 QC 流程。
 *
 * 步骤：
 *   1. 解析 policy（合并默认值）
 *   2. 按 sampleFrameRate 抽帧
 *   3. 提取参考 embedding（来自 characterRefImageUrl）
 *   4. 提取每帧 embedding
 *   5. 计算帧级相似度
 *   6. 计算 aggregates（averageScore / minScore）
 *   7. 判定 verdict
 *   8. 生成 QCReport
 *
 * 失败不抛出 — 任何步骤失败都生成 error QCReport（INV-1: QC 异步非阻塞）。
 */
export async function runQualityCheck(input: QCInput): Promise<QCOutput> {
  const policy = resolvePolicy(input.policy);
  const startTime = Date.now();

  // 验证输入
  if (input.durationSec <= 0 || !input.videoUrl) {
    return buildErrorOutput(
      input,
      "duration_invalid",
      `durationSec=${input.durationSec}, videoUrl=${input.videoUrl ? "(set)" : "(empty)"}`,
    );
  }

  // 获取 face embedding provider（ONNX → VLM → noop 降级）
  const provider = await getFaceEmbeddingProvider();
  const providerAvailable = await provider.isAvailable();
  if (!providerAvailable) {
    errorLogger.warn(`[qc-orchestrator] face embedding provider 不可用，QC 退化为空报告`);
    return buildErrorOutput(
      input,
      "provider_unavailable",
      "No face embedding provider available",
    );
  }

  // ── Step 1: 抽帧 ──────────────────────────────────────────────────────────
  const frames = await extractFrames(
    input.videoUrl,
    input.durationSec,
    policy.sampleFrameRate,
  );
  if (frames.length === 0) {
    return buildErrorOutput(input, "no_frame_extracted", "抽帧失败或视频时长过短");
  }

  // ── Step 2: 提取参考 embedding（若提供角色参考图） ─────────────────────────
  let referenceEmbedding: number[] = [];
  if (input.characterRefImageUrl) {
    const refResult = await provider.extractEmbedding(input.characterRefImageUrl);
    if (refResult.ok) {
      referenceEmbedding = refResult.value.embedding;
      // metadata 已记录到 provider 内部，QCReport 不需要存储参考图 metadata
    } else {
      errorLogger.warn("[qc-orchestrator] 参考 embedding 提取失败", refResult.error);
      // 参考图失败不终止 QC — 退化为参考 embedding 为空，所有帧相似度为 0
    }
  }

  // ── Step 3: 提取每帧 embedding ─────────────────────────────────────────────
  const frameEmbeddings: FrameEmbeddingInput[] = [];
  for (const frame of frames) {
    const frameResult = await provider.extractEmbedding(frame.imageUrl);
    if (frameResult.ok) {
      frameEmbeddings.push({
        frameIndex: frame.frameIndex,
        timestamp: frame.timestamp,
        embedding: frameResult.value.embedding,
        faceDetected: frameResult.value.metadata.faceDetected,
      });
    } else {
      // 单帧失败不阻塞整体，记录为空 embedding（similarity-checker 会处理）
      frameEmbeddings.push({
        frameIndex: frame.frameIndex,
        timestamp: frame.timestamp,
        embedding: [],
        faceDetected: false,
      });
    }
  }

  // ── Step 4: 计算帧级相似度 ─────────────────────────────────────────────────
  let frameScores: FrameScore[];
  if (referenceEmbedding.length === 0) {
    // 参考 embedding 缺失，所有帧相似度记为 0
    frameScores = frameEmbeddings.map((f) => ({
      frameIndex: f.frameIndex,
      timestamp: f.timestamp,
      cosineSimilarity: 0,
      faceDetected: f.faceDetected ?? false,
    }));
  } else {
    frameScores = checkFrameConsistency(frameEmbeddings, referenceEmbedding);
  }

  // ── Step 5: 计算聚合统计 ───────────────────────────────────────────────────
  const { averageScore, minScore } = computeAggregates(frameScores);

  // ── Step 6: 判定 verdict ──────────────────────────────────────────────────
  const verdict = determineVerdict(minScore, policy);
  const needsFallback = verdict === "drift_critical";

  // ── Step 7: 生成 QCReport ─────────────────────────────────────────────────
  const report: QCReport = {
    videoTaskId: input.videoTaskId,
    characterId: input.characterId,
    totalFrames: estimateTotalFrames(input.durationSec),
    sampledFrames: frames.length,
    frameScores,
    averageScore,
    minScore,
    verdict,
    actionTaken: "none",
    createdAt: new Date().toISOString(),
    strategy: input.strategy,
    retryCount: 0,
  };

  const elapsed = Date.now() - startTime;
  errorLogger.info(
    `[qc-orchestrator] QC 完成 taskId=${input.videoTaskId} elapsed=${elapsed}ms ` +
    `frames=${frames.length} avg=${averageScore.toFixed(3)} min=${minScore.toFixed(3)} ` +
    `verdict=${verdict} provider=${provider.providerType}`,
  );

  return {
    report,
    needsFallback,
    providerType: provider.providerType,
    sampledFrameUrls: frames.map((f) => f.imageUrl),
  };
}

/**
 * 按采样率抽帧。
 *
 * 使用 generateThumbnail 在指定时间点生成 JPG。
 * 抽帧间隔 = 1 / sampleFrameRate（秒）。
 */
async function extractFrames(
  videoUrl: string,
  durationSec: number,
  sampleFrameRate: number,
): Promise<ExtractedFrame[]> {
  const frames: ExtractedFrame[] = [];
  const interval = 1 / sampleFrameRate;
  // 至少抽 1 帧，至多抽 30 帧（避免长视频抽帧过多）
  const maxFrames = Math.min(30, Math.max(1, Math.floor(durationSec * sampleFrameRate)));

  for (let i = 0; i < maxFrames; i++) {
    const timestamp = i * interval;
    if (timestamp >= durationSec) break;

    try {
      const result = await generateThumbnail(videoUrl, timestamp, 224);
      if (result.success && result.outputPath) {
        frames.push({
          frameIndex: i,
          timestamp,
          imageUrl: result.outputPath,
        });
      } else {
        errorLogger.warn(
          `[qc-orchestrator] 抽帧失败 frame=${i} t=${timestamp}s`,
          result.error,
        );
      }
    } catch (e) {
      errorLogger.warn(
        `[qc-orchestrator] 抽帧异常 frame=${i} t=${timestamp}s`,
        e,
      );
    }
  }

  return frames;
}

/** 估算视频总帧数（用于 QCReport.totalFrames 字段） */
function estimateTotalFrames(durationSec: number): number {
  // 假设原始视频 24fps，totalFrames = duration * 24
  // sampleFrameRate 仅用于抽帧采样，不影响 totalFrames 估算
  return Math.floor(durationSec * 24);
}

/** 构建错误 QCReport 输出 */
function buildErrorOutput(
  input: QCInput,
  errorKind: QCErrorKind,
  errorMessage: string,
): QCOutput {
  const report = createEmptyQCReport(input.videoTaskId);
  report.characterId = input.characterId;
  report.error = `[${errorKind}] ${errorMessage}`;
  report.verdict = "pass"; // 错误情况不触发 fallback
  report.createdAt = new Date().toISOString();
  report.strategy = input.strategy;

  errorLogger.warn(
    `[qc-orchestrator] QC 失败 taskId=${input.videoTaskId} kind=${errorKind} msg=${errorMessage}`,
  );

  return {
    report,
    needsFallback: false,
    providerType: "none",
    sampledFrameUrls: [],
  };
}

/**
 * 判断是否需要触发 fallback。
 *
 * 仅当 verdict = "drift_critical" 时返回 true。
 * drift_warning 仅记录，不触发动作。
 */
export function shouldTriggerFallback(report: QCReport): boolean {
  return report.verdict === "drift_critical" && !report.error;
}

/**
 * 计算 fallback 决策（用于 fallback-dispatcher）。
 *
 * @returns "regenerate" | "face_swap" | "manual_review" | "none"
 */
export function decideFallbackAction(
  report: QCReport,
  policy: DriftPolicy,
  currentRetryCount: number,
): "regenerate" | "face_swap" | "manual_review" | "none" {
  if (!shouldTriggerFallback(report)) return "none";

  // 1. 重试次数未超 → regenerate
  if (currentRetryCount < policy.maxRegenerateAttempts) {
    return "regenerate";
  }

  // 2. 重试次数达到上限 → face-swap（若 policy 允许）
  if (shouldFallbackToFaceSwap(policy, currentRetryCount)) {
    return "face_swap";
  }

  // 3. face-swap 后仍不达标 → manual_review（若 policy 允许）
  if (policy.autoMarkManualReview) {
    return "manual_review";
  }

  return "none";
}

/**
 * 获取帧级统计信息（UI 便捷方法）。
 */
export function getFrameStats(report: QCReport, threshold: number) {
  return computeFrameStats(report.frameScores, threshold);
}

/**
 * 判断 QCReport 是否需要立即触发 fallback 动作（带 policy 上下文）。
 *
 * 与 shouldTriggerFallback 不同，此函数考虑重试次数：
 * - retryCount 已达上限 → 仍触发 fallback（但动作变为 face-swap 或 manual_review）
 * - retryCount 超过上上限 → 标记 manual_review，停止 fallback
 */
export function shouldDispatchFallback(
  report: QCReport,
  policy: DriftPolicy,
): boolean {
  if (!shouldTriggerFallback(report)) return false;
  if (report.retryCount === undefined) return true;
  // 重试次数超过 maxRegenerateAttempts + 1（face-swap 也试过）→ 停止 fallback
  return report.retryCount <= policy.maxRegenerateAttempts + 1;
}
