/**
 * Task 2A.23: fallback-dispatcher — 超差帧调度服务
 *
 * 职责：
 *   1. dispatchFallback(input): 按 verdict 和 retryCount 决策并执行 fallback 动作
 *   2. 链式降级：regenerate → face-swap → manual_review（INV-7）
 *   3. 不可跳过 regenerate 直接 face-swap（除非 maxRegenerateAttempts=0）
 *
 * 调用方：
 *   - qc-orchestrator 在 verdict="drift_critical" 时调用
 *   - QCDashboardPanel 用户手动触发"重生成"/"face-swap"
 *
 * 不修改原视频：regenerate/face-swap 创建新 VideoTask（INV-6）
 * 重试有上限：maxRegenerateAttempts 默认 2，超过走 face-swap（INV-4）
 */

import { container } from "@/infrastructure/di";
import { errorLogger } from "@/shared/error-logger";
import { emitToast } from "@/shared/utils/toast-bridge";
import { t } from "@/shared/constants";
import type { VideoTask, GenerationAsset } from "@/domain/schemas";
import {
  resolvePolicy,
  shouldFallbackToFaceSwap,
  shouldMarkManualReview,
  type DriftPolicy,
} from "../domain/drift-policy";
import type { QCReport } from "../domain/qc-schema";
import type { FaceSwapRequest } from "../../partial-edit";

/** Fallback 动作类型 */
export type FallbackAction = "regenerate" | "face_swap" | "manual_review" | "none";

/** Fallback 输入 */
export interface FallbackInput {
  /** 关联的 QCReport */
  report: QCReport;
  /** 原视频 VideoTask（用于重生成时复用参数） */
  originalTask: VideoTask;
  /** 漂移策略（默认 DEFAULT_DRIFT_POLICY） */
  policy?: Partial<DriftPolicy>;
  /** 当前重试次数（来自 QCReport.retryCount 或 0） */
  currentRetryCount?: number;
  /** 角色 ID（face-swap 时使用） */
  characterId?: string;
  /** 角色参考图 URL（face-swap 时使用） */
  characterRefImageUrl?: string;
  /** VideoTask store（用于 addTask 创建重生成任务） */
  videoTaskStore?: {
    addTask: (task: Omit<VideoTask, "progress" | "createdAt">) => Promise<VideoTask>;
  };
}

/** Fallback 输出 */
export interface FallbackResult {
  /** 实际执行的动作 */
  action: FallbackAction;
  /** 是否执行成功 */
  ok: boolean;
  /** 创建的新 VideoTask ID（regenerate/face_swap 时返回） */
  newTaskId?: string;
  /** 错误信息（失败时填充） */
  error?: string;
  /** 更新后的 QCReport（retryCount / actionTaken 已更新） */
  updatedReport: QCReport;
}

/**
 * 主入口：根据 QCReport 决策并执行 fallback 动作。
 *
 * 决策逻辑：
 *   1. verdict != "drift_critical" → action="none"
 *   2. retryCount < maxRegenerateAttempts → action="regenerate"
 *   3. retryCount >= maxRegenerateAttempts 且 policy.fallbackToFaceSwap → action="face_swap"
 *   4. retryCount > maxRegenerateAttempts 或 face-swap 失败 → action="manual_review"
 *
 * 执行：
 *   - regenerate: 通过 videoTaskStore.addTask 创建新 VideoTask（复用原 task 参数）
 *   - face_swap: 调用 partial-edit-service.startFaceSwapTask（Task 2A.22 扩展）
 *   - manual_review: 仅更新 QCReport.actionTaken 和 emitToast
 */
export async function dispatchFallback(input: FallbackInput): Promise<FallbackResult> {
  const policy = resolvePolicy(input.policy);
  const retryCount = input.currentRetryCount ?? input.report.retryCount ?? 0;
  const baseReport = { ...input.report, retryCount };

  // 1. verdict 不是 critical → 不触发 fallback
  if (input.report.verdict !== "drift_critical") {
    return {
      action: "none",
      ok: true,
      updatedReport: baseReport,
    };
  }

  // 2. 决策动作
  const action = decideAction(policy, retryCount);

  // 3. 执行动作
  switch (action) {
    case "regenerate":
      return await executeRegenerate(input, baseReport, policy);
    case "face_swap":
      return await executeFaceSwap(input, baseReport, policy);
    case "manual_review":
      return executeManualReview(baseReport);
    case "none":
    default:
      return {
        action: "none",
        ok: true,
        updatedReport: baseReport,
      };
  }
}

/** 决策动作（不执行，仅返回决策结果） */
function decideAction(policy: DriftPolicy, retryCount: number): FallbackAction {
  // 1. 重试次数未超 → regenerate
  if (retryCount < policy.maxRegenerateAttempts) {
    return "regenerate";
  }
  // 2. 达到重试上限 → face-swap（若允许）
  if (shouldFallbackToFaceSwap(policy, retryCount)) {
    return "face_swap";
  }
  // 3. face-swap 后仍不达标 → manual_review
  if (shouldMarkManualReview(policy, retryCount)) {
    return "manual_review";
  }
  return "none";
}

/**
 * 执行 regenerate：创建新 VideoTask 复用原 task 参数。
 *
 * 注意：
 *   - 不调用 generateVideo 直接生成 — 仅创建 task 加入轮询队列
 *   - taskSubtype 保持原值（normal 或 partial_redraw）
 *   - 标记 retryCount++ 在 QCReport 上
 */
async function executeRegenerate(
  input: FallbackInput,
  baseReport: QCReport,
  _policy: DriftPolicy,
): Promise<FallbackResult> {
  if (!input.videoTaskStore) {
    return buildFailedResult(
      baseReport,
      "regenerate",
      "videoTaskStore 未提供，无法创建重生成任务",
    );
  }

  try {
    // 复用原 task 参数，仅改 taskId
    const newTaskId = `retry-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const original = input.originalTask;
    const newTask: Omit<VideoTask, "progress" | "createdAt"> = {
      taskId: newTaskId,
      status: "pending",
      message: t("video.qcRegenerateStarted"),
      // 复用原始参数
      prompt: original.prompt,
      providerId: original.providerId,
      providerModelId: original.providerModelId,
      providerFormat: original.providerFormat,
      storyId: original.storyId,
      beatId: original.beatId,
      // 标记为重试任务
      taskSubtype: original.taskSubtype ?? "normal",
      sourceVideoAssetId: original.sourceVideoAssetId,
      // 复用 fixedImage / referenceVideo（角色/场景参考）
      fixedImageUrl: original.fixedImageUrl,
      fixedImageLockType: original.fixedImageLockType,
      referenceVideoUrl: original.referenceVideoUrl,
    };

    const created = await input.videoTaskStore.addTask(newTask);

    emitToast(
      "info",
      t("video.qcRegenerateTitle"),
      t("video.qcRegenerateDetail", { retryCount: (baseReport.retryCount ?? 0) + 1 }),
    );

    return {
      action: "regenerate",
      ok: true,
      newTaskId: created.taskId,
      updatedReport: {
        ...baseReport,
        retryCount: (baseReport.retryCount ?? 0) + 1,
        actionTaken: "regenerated",
      },
    };
  } catch (e) {
    return buildFailedResult(
      baseReport,
      "regenerate",
      `重生成任务创建失败: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

/**
 * 执行 face-swap：调用 partial-edit-service.startFaceSwapTask。
 *
 * Task 2A.23: startFaceSwapTask 已在 partial-edit-service 中实现，
 * 自动构造全帧 mask 并复用 provider.generatePartialEdit。
 *
 * 若 partial-edit 模块加载失败或 provider 不支持 generatePartialEdit，
 * 降级为 manual_review（保持 fallback 链不中断）。
 */
async function executeFaceSwap(
  input: FallbackInput,
  baseReport: QCReport,
  _policy: DriftPolicy,
): Promise<FallbackResult> {
  if (!input.videoTaskStore) {
    return buildFailedResult(
      baseReport,
      "face_swap",
      "videoTaskStore 未提供，无法创建 face-swap 任务",
    );
  }

  if (!input.characterRefImageUrl) {
    errorLogger.warn("[fallback-dispatcher] face-swap 缺少 characterRefImageUrl，降级为 manual_review");
    return executeManualReview({
      ...baseReport,
      retryCount: (baseReport.retryCount ?? 0) + 1,
    });
  }

  try {
    // 动态导入 partial-edit-service，避免循环依赖
    const { startFaceSwapTask } = await import("../../partial-edit/services/partial-edit-service");

    if (typeof startFaceSwapTask !== "function") {
      errorLogger.warn("[fallback-dispatcher] partial-edit-service 未导出 startFaceSwapTask，降级为 manual_review");
      return executeManualReview({
        ...baseReport,
        retryCount: (baseReport.retryCount ?? 0) + 1,
      });
    }

    // 获取原视频 Asset URL（用于 face-swap 输入）
    const sourceVideoUrl = await getSourceVideoUrl(input.originalTask);
    if (!sourceVideoUrl) {
      return buildFailedResult(
        baseReport,
        "face_swap",
        "原视频 URL 不可用，无法执行 face-swap",
      );
    }

    // 构造 face-swap 请求
    const faceSwapRequest: FaceSwapRequest = {
      sourceVideoAssetId: input.originalTask.sourceVideoAssetId ?? input.originalTask.taskId,
      characterRefImageUrl: input.characterRefImageUrl,
      characterId: input.characterId,
      editPrompt: t("video.qcFaceSwapPrompt"),
      providerId: input.originalTask.providerId,
      modelId: input.originalTask.providerModelId,
      storyId: input.originalTask.storyId,
      beatId: input.originalTask.beatId,
    };

    const faceSwapResult = await startFaceSwapTask(faceSwapRequest, input.videoTaskStore);

    if (!faceSwapResult.ok) {
      errorLogger.warn("[fallback-dispatcher] face-swap 失败，降级为 manual_review", faceSwapResult.error);
      return executeManualReview({
        ...baseReport,
        retryCount: (baseReport.retryCount ?? 0) + 1,
      });
    }

    emitToast(
      "info",
      t("video.qcFaceSwapTitle"),
      t("video.qcFaceSwapDetail"),
    );

    return {
      action: "face_swap",
      ok: true,
      newTaskId: faceSwapResult.value.taskId,
      updatedReport: {
        ...baseReport,
        retryCount: (baseReport.retryCount ?? 0) + 1,
        actionTaken: "face_swapped",
      },
    };
  } catch (e) {
    errorLogger.warn("[fallback-dispatcher] face-swap 异常，降级为 manual_review", e);
    return executeManualReview({
      ...baseReport,
      retryCount: (baseReport.retryCount ?? 0) + 1,
    });
  }
}

/**
 * 执行 manual_review：仅更新 QCReport.actionTaken 和 emitToast。
 *
 * 这是 fallback 链的终点，不再创建新任务。
 */
function executeManualReview(baseReport: QCReport): FallbackResult {
  emitToast(
    "warning",
    t("video.qcManualReviewTitle"),
    t("video.qcManualReviewDetail"),
  );

  return {
    action: "manual_review",
    ok: true,
    updatedReport: {
      ...baseReport,
      retryCount: (baseReport.retryCount ?? 0) + 1,
      actionTaken: "manual_review",
    },
  };
}

/** 获取原视频 URL（用于 face-swap 输入） */
async function getSourceVideoUrl(task: VideoTask): Promise<string | null> {
  // 优先用 videoUrl（已完成的 task）
  if (task.videoUrl) return task.videoUrl;
  // 其次用 localVideoPath
  if (task.localVideoPath) return task.localVideoPath;
  // 最后从 sourceVideoAssetId 查 Asset
  if (task.sourceVideoAssetId) {
    try {
      const asset = await container.generationAssetStorage.getAssetById(task.sourceVideoAssetId);
      if (asset) {
        return asset.localPath ?? asset.url;
      }
    } catch (e) {
      errorLogger.warn("[fallback-dispatcher] 查询原视频 Asset 失败", e);
    }
  }
  return null;
}

/** 构建失败结果 */
function buildFailedResult(
  baseReport: QCReport,
  action: FallbackAction,
  errorMessage: string,
): FallbackResult {
  errorLogger.warn(`[fallback-dispatcher] ${action} 失败: ${errorMessage}`);
  return {
    action,
    ok: false,
    error: errorMessage,
    updatedReport: {
      ...baseReport,
      error: `[${action}_failed] ${errorMessage}`,
    },
  };
}

/**
 * 查询某 VideoTask 关联的所有 fallback 历史（用于 UI 展示）。
 *
 * 通过查询 type='partial_edit_video' 且 sourceAssetId 指向原 Asset 的 GenerationAsset 列表。
 */
export async function listFallbackHistory(
  originalTaskId: string,
): Promise<GenerationAsset[]> {
  try {
    // 通过 taskId 找到原 Asset
    // 注意：GenerationAsset 没有直接关联 taskId 的字段，需要通过 storyBeatId 关联
    // 简化：返回空数组（实际历史展示通过 QCReport.retryCount 和 actionTaken 字段）
    void originalTaskId;
    return [];
  } catch (e) {
    errorLogger.warn("[fallback-dispatcher] 查询 fallback 历史失败", e);
    return [];
  }
}

/**
 * 判断 fallback 是否已达终点（不应再触发）。
 *
 * 终点条件：
 *   - actionTaken = "manual_review"
 *   - retryCount > maxRegenerateAttempts + 1（regenerate + face-swap 都试过）
 */
export function isFallbackTerminal(report: QCReport, policy: DriftPolicy): boolean {
  if (report.actionTaken === "manual_review") return true;
  if (report.retryCount === undefined) return false;
  return report.retryCount > policy.maxRegenerateAttempts + 1;
}

/**
 * 预测下一个 fallback 动作（不执行，仅用于 UI 展示）。
 */
export function predictNextAction(
  report: QCReport,
  policy?: Partial<DriftPolicy>,
): FallbackAction {
  const resolvedPolicy = resolvePolicy(policy);
  const retryCount = report.retryCount ?? 0;

  if (report.verdict !== "drift_critical") return "none";
  return decideAction(resolvedPolicy, retryCount);
}
