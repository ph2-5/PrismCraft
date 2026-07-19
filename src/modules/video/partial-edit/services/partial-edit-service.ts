/**
 * Task 2A.22: partial-edit-service — 局部重绘编排服务
 *
 * 职责：
 *   1. 校验 PartialEditRequest
 *   2. mask → base64 PNG（mask-encoder.ts）
 *   3. editPrompt → 完整 prompt（prompt-builder.ts）
 *   4. 调用 provider.generatePartialEdit → 获取 taskId
 *   5. 创建 VideoTask（taskSubtype='partial_redraw'）并加入 VideoTaskManager 轮询队列
 *   6. 任务完成后存为新 GenerationAsset（type='partial_edit_video', sourceAssetId=原 Asset ID）
 *
 * 复用现有 VideoTaskManager：
 *   - 使用 useVideoTaskStore.getState().addTask() 创建任务（绕过 createTask 的重复检测）
 *   - taskSubtype='partial_redraw' 让 UI 分组显示
 *   - 轮询/恢复由现有 polling-engine 处理
 *
 * 不改 generateVideo() — 隔离新功能（Task 2A.22 规格 line 5935）。
 */

import { container } from "@/infrastructure/di";
import { errorLogger } from "@/shared/error-logger";
import { emitToast } from "@/shared/utils/toast-bridge";
import { t } from "@/shared/constants";
import type { VideoTask } from "@/domain/schemas";
import {
  validatePartialEditRequest,
  type PartialEditRequest,
  type PartialEditResult,
} from "../domain/edit-schema";
import {
  computeMaskBounds,
  isValidMaskConfig,
} from "../domain/mask-types";
import { encodeMask, isMaskSizeValid, type MaskEncodeSuccess } from "./mask-encoder";
import { buildPartialEditPrompt } from "./prompt-builder";

/** partial-edit-service 错误类型 */
export type PartialEditServiceError =
  | { kind: "validation"; message: string; errors: Array<{ field: string; reason: string }> }
  | { kind: "mask_encode"; message: string }
  | { kind: "mask_too_large"; message: string; sizeBytes: number; maxBytes: number }
  | { kind: "source_video_not_found"; message: string; sourceVideoAssetId: string }
  | { kind: "provider_not_supported"; message: string; providerId?: string }
  | { kind: "provider_call_failed"; message: string; cause?: unknown }
  | { kind: "asset_create_failed"; message: string; cause?: unknown };

/** 创建任务返回值 */
export type PartialEditServiceResult =
  | { ok: true; value: PartialEditResult }
  | { ok: false; error: PartialEditServiceError };

/** 获取原视频 Asset 的 URL */
async function getSourceVideoUrl(sourceVideoAssetId: string): Promise<string | null> {
  const storage = container.generationAssetStorage;
  const asset = await storage.getAssetById(sourceVideoAssetId);
  if (!asset) {
    errorLogger.error("[partial-edit-service] source video asset not found", { sourceVideoAssetId });
    return null;
  }
  // 优先用 localPath（本地缓存），否则用 url
  return asset.localPath ?? asset.url;
}

/**
 * 启动一次局部重绘任务。
 *
 * @param request 局部重绘请求
 * @param videoTaskStore VideoTaskManager store（用于 addTask）
 * @returns 成功返回 PartialEditResult，失败返回 PartialEditServiceError
 */
export async function startPartialEditTask(
  request: PartialEditRequest,
  videoTaskStore: {
    addTask: (task: Omit<VideoTask, "progress" | "createdAt">) => Promise<VideoTask>;
  },
): Promise<PartialEditServiceResult> {
  // ── Step 1: 校验请求 ──────────────────────────────────────────────────────
  const validationErrors = validatePartialEditRequest(request);
  if (validationErrors.length > 0) {
    return {
      ok: false,
      error: {
        kind: "validation",
        message: "PartialEditRequest 校验失败",
        errors: validationErrors,
      },
    };
  }

  if (!isValidMaskConfig(request.mask)) {
    return {
      ok: false,
      error: {
        kind: "validation",
        message: "MaskConfig 校验失败：至少需要 1 个合法 shape",
        errors: [{ field: "mask", reason: "MaskConfig 无效" }],
      },
    };
  }

  // ── Step 2: 编码 mask 为 base64 PNG ────────────────────────────────────────
  const maskEncodeResult = await encodeMask(request.mask);
  if (!maskEncodeResult.ok) {
    return {
      ok: false,
      error: {
        kind: "mask_encode",
        message: maskEncodeResult.error.message,
      },
    };
  }
  const encodedMask: MaskEncodeSuccess = maskEncodeResult.value;

  // ── Step 3: 校验 mask 大小 ────────────────────────────────────────────────
  if (!isMaskSizeValid(encodedMask.base64)) {
    const sizeBytes = Math.ceil(encodedMask.base64.length * 3 / 4);
    return {
      ok: false,
      error: {
        kind: "mask_too_large",
        message: `Mask PNG 体积过大（${(sizeBytes / 1024).toFixed(1)}KB），超过 1MB 限制`,
        sizeBytes,
        maxBytes: 1024 * 1024,
      },
    };
  }

  // ── Step 4: 获取原视频 URL ─────────────────────────────────────────────────
  const sourceVideoUrl = await getSourceVideoUrl(request.sourceVideoAssetId);
  if (!sourceVideoUrl) {
    return {
      ok: false,
      error: {
        kind: "source_video_not_found",
        message: `原视频 Asset 不存在：${request.sourceVideoAssetId}`,
        sourceVideoAssetId: request.sourceVideoAssetId,
      },
    };
  }

  // ── Step 5: 构建完整 prompt ───────────────────────────────────────────────
  const fullPrompt = buildPartialEditPrompt(request.editPrompt, {
    strictness: "strict",
    preserveUnmasked: request.preserveUnmasked,
    duration: request.duration,
  });

  // ── Step 6: 检查 provider 是否支持 generatePartialEdit ──────────────────────
  const provider = container.videoProvider;
  if (typeof provider.generatePartialEdit !== "function") {
    return {
      ok: false,
      error: {
        kind: "provider_not_supported",
        message: "当前 videoProvider 不支持 generatePartialEdit（需要 supportsPartialEdit=true 的模型，如 Seedance 2.5）",
        providerId: request.providerId,
      },
    };
  }

  // ── Step 7: 调用 provider.generatePartialEdit ──────────────────────────────
  let providerResult;
  try {
    providerResult = await provider.generatePartialEdit({
      sourceVideoUrl,
      maskBase64: encodedMask.base64,
      prompt: fullPrompt,
      videoTimestamp: request.mask.videoTimestamp,
      preserveUnmasked: request.preserveUnmasked,
      providerId: request.providerId,
      modelId: request.modelId,
      duration: request.duration,
    });
  } catch (e) {
    return {
      ok: false,
      error: {
        kind: "provider_call_failed",
        message: e instanceof Error ? e.message : String(e),
        cause: e,
      },
    };
  }

  if (!providerResult.success || !providerResult.data) {
    return {
      ok: false,
      error: {
        kind: "provider_call_failed",
        message: providerResult.error || "Provider 返回失败结果",
      },
    };
  }

  // ── Step 8: 校验 taskId 合法性 ────────────────────────────────────────────
  const taskId = providerResult.data.taskId;
  if (typeof taskId !== "string" || taskId.length === 0 || taskId.length > 256) {
    return {
      ok: false,
      error: {
        kind: "provider_call_failed",
        message: `Provider 返回的 taskId 无效：${taskId}`,
      },
    };
  }

  // ── Step 9: 计算 maskBounds（用于持久化时快速查询） ────────────────────────
  const maskBounds = computeMaskBounds(request.mask);

  // ── Step 10: 创建 VideoTask 并加入 store ──────────────────────────────────
  const newTask: Omit<VideoTask, "progress" | "createdAt"> = {
    taskId,
    status: "pending",
    message: t("video.partialEditTaskSubmitted"),
    // Task 2A.22 扩展字段
    taskSubtype: "partial_redraw",
    sourceVideoAssetId: request.sourceVideoAssetId,
    maskData: encodedMask.base64,
    maskBounds: maskBounds ?? undefined,
    editPrompt: request.editPrompt,
    // provider 信息
    prompt: fullPrompt,
    providerId: providerResult.data.providerId ?? request.providerId,
    providerModelId: providerResult.data.providerModelId ?? request.modelId,
    providerFormat: providerResult.data.providerFormat,
    // 关联信息
    storyId: request.storyId,
    beatId: request.beatId,
  };

  let createdTask: VideoTask;
  try {
    createdTask = await videoTaskStore.addTask(newTask);
  } catch (e) {
    return {
      ok: false,
      error: {
        kind: "provider_call_failed",
        message: `添加 VideoTask 失败：${e instanceof Error ? e.message : String(e)}`,
        cause: e,
      },
    };
  }

  // ── Step 11: 发出 toast 通知 ──────────────────────────────────────────────
  emitToast(
    "success",
    t("video.partialEditTaskSubmittedTitle"),
    t("video.partialEditTaskSubmittedDetail", { taskId: taskId.slice(0, 8) }),
  );

  if (providerResult.data.promptWasTruncated) {
    errorLogger.warn(
      `[partial-edit-service] 提示词已被截断，原始长度: ${providerResult.data.originalPromptLength} 字符`,
    );
  }

  return {
    ok: true,
    value: {
      taskId: createdTask.taskId,
      sourceVideoAssetId: request.sourceVideoAssetId,
      createdAt: createdTask.createdAt,
    },
  };
}

/**
 * 把已完成的局部重绘 VideoTask 保存为 GenerationAsset。
 *
 * 在 VideoTask 进入 completed 状态时调用：
 * - 创建 type='partial_edit_video' 的 GenerationAsset
 * - sourceAssetId 指向原视频 Asset
 * - 继承原 Asset 的 storyBeatId / characterId / sceneId 等关联关系
 *
 * @param task 已完成的局部重绘 VideoTask
 * @returns 成功返回 GenerationAsset，失败返回 null
 */
export async function savePartialEditAsset(task: VideoTask): Promise<{
  ok: true;
  assetId: string;
} | {
  ok: false;
  error: PartialEditServiceError;
}> {
  if (task.taskSubtype !== "partial_redraw") {
    return {
      ok: false,
      error: {
        kind: "validation",
        message: `taskSubtype 不是 'partial_redraw'：${task.taskSubtype ?? "undefined"}`,
        errors: [{ field: "taskSubtype", reason: "必须是 partial_redraw" }],
      },
    };
  }

  if (task.status !== "completed" || !task.videoUrl) {
    return {
      ok: false,
      error: {
        kind: "validation",
        message: `任务未完成或无 videoUrl：status=${task.status}, videoUrl=${task.videoUrl ?? "null"}`,
        errors: [{ field: "status", reason: "必须为 completed 且有 videoUrl" }],
      },
    };
  }

  if (!task.sourceVideoAssetId) {
    return {
      ok: false,
      error: {
        kind: "validation",
        message: "任务缺少 sourceVideoAssetId",
        errors: [{ field: "sourceVideoAssetId", reason: "不能为空" }],
      },
    };
  }

  // 从原 Asset 继承关联关系
  const sourceAsset = await container.generationAssetStorage.getAssetById(task.sourceVideoAssetId);
  if (!sourceAsset) {
    return {
      ok: false,
      error: {
        kind: "source_video_not_found",
        message: `原视频 Asset 不存在：${task.sourceVideoAssetId}`,
        sourceVideoAssetId: task.sourceVideoAssetId,
      },
    };
  }

  try {
    const assetId = `gen-asset-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    await container.generationAssetStorage.createAsset({
      id: assetId,
      type: "partial_edit_video",
      sourceType: "ai_generated",
      url: task.videoUrl,
      localPath: task.localVideoPath,
      prompt: task.editPrompt ?? task.prompt,
      modelId: task.providerModelId,
      providerId: task.providerId,
      metadata: {
        maskBounds: task.maskBounds,
        videoTimestamp: undefined, // 从 maskData 无法反推，需从 task 创建时记录
        originalTaskId: task.taskId,
      },
      // 继承原 Asset 的关联关系
      storyBeatId: sourceAsset.storyBeatId,
      subShotId: sourceAsset.subShotId,
      characterId: sourceAsset.characterId,
      characterVariantId: sourceAsset.characterVariantId,
      sceneId: sourceAsset.sceneId,
      sceneVariantId: sourceAsset.sceneVariantId,
      projectId: sourceAsset.projectId,
      // Task 2A.22: 关联原视频
      sourceAssetId: task.sourceVideoAssetId,
    });
    return { ok: true, assetId };
  } catch (e) {
    return {
      ok: false,
      error: {
        kind: "asset_create_failed",
        message: e instanceof Error ? e.message : String(e),
        cause: e,
      },
    };
  }
}

/**
 * 查询某原视频的所有局部重绘历史。
 *
 * @param sourceVideoAssetId 原视频 Asset ID
 * @returns 局部重绘 Asset 列表（按创建时间倒序）
 */
export async function listPartialEditHistory(
  sourceVideoAssetId: string,
): Promise<import("@/domain/schemas").GenerationAsset[]> {
  return container.generationAssetStorage.getAssetsBySourceAssetId(sourceVideoAssetId);
}
