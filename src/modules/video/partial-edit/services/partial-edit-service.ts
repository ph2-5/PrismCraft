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
  validateFaceSwapRequest,
  type PartialEditRequest,
  type PartialEditResult,
  type FaceSwapRequest,
} from "../domain/edit-schema";
import {
  computeMaskBounds,
  createEmptyMaskConfig,
  createRectangle,
  addShape,
  isValidMaskConfig,
  type MaskConfig,
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

/** provider.generatePartialEdit 成功返回的 data 类型（去掉 success/error 后的有效载荷） */
type ProviderPartialEditData = NonNullable<
  Awaited<ReturnType<NonNullable<typeof container.videoProvider.generatePartialEdit>>>["data"]
>;

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

/** 构造 mask_too_large 错误对象 */
function buildMaskTooLargeError(sizeBytes: number): PartialEditServiceError {
  return {
    kind: "mask_too_large",
    message: `Mask PNG 体积过大（${(sizeBytes / 1024).toFixed(1)}KB），超过 1MB 限制`,
    sizeBytes,
    maxBytes: 1024 * 1024,
  };
}

/** 构造 source_video_not_found 错误对象 */
function buildSourceVideoNotFoundError(sourceVideoAssetId: string): PartialEditServiceError {
  return {
    kind: "source_video_not_found",
    message: `原视频 Asset 不存在：${sourceVideoAssetId}`,
    sourceVideoAssetId,
  };
}

/** 构造 provider_not_supported 错误对象 */
function buildProviderNotSupportedError(providerId: string | undefined, isFaceSwap: boolean): PartialEditServiceError {
  const hint = isFaceSwap
    ? "（face-swap 需要 supportsPartialEdit=true 的模型）"
    : "（需要 supportsPartialEdit=true 的模型，如 Seedance 2.5）";
  return {
    kind: "provider_not_supported",
    message: `当前 videoProvider 不支持 generatePartialEdit${hint}`,
    providerId,
  };
}

/** 构造 provider_call_failed 错误对象 */
function buildProviderCallFailedError(message: string, cause?: unknown): PartialEditServiceError {
  return { kind: "provider_call_failed", message, cause };
}

/**
 * 编码 mask 为 base64 PNG 并校验大小。
 * 成功返回 encodedMask，失败返回错误。
 */
async function encodeAndValidateMask(mask: MaskConfig): Promise<
  { ok: true; encodedMask: MaskEncodeSuccess } | { ok: false; error: PartialEditServiceError }
> {
  const maskEncodeResult = await encodeMask(mask);
  if (!maskEncodeResult.ok) {
    return { ok: false, error: { kind: "mask_encode", message: maskEncodeResult.error.message } };
  }
  const encodedMask: MaskEncodeSuccess = maskEncodeResult.value;
  if (!isMaskSizeValid(encodedMask.base64)) {
    const sizeBytes = Math.ceil(encodedMask.base64.length * 3 / 4);
    return { ok: false, error: buildMaskTooLargeError(sizeBytes) };
  }
  return { ok: true, encodedMask };
}

/** 调用 provider.generatePartialEdit（含支持性检查、异常处理、taskId 校验），返回 taskId + data 或 error */
async function callProviderPartialEdit(
  provider: typeof container.videoProvider,
  params: {
    sourceVideoUrl: string;
    maskBase64: string;
    prompt: string;
    videoTimestamp: number;
    preserveUnmasked: boolean;
    providerId?: string;
    modelId?: string;
    duration?: number;
  },
  isFaceSwap: boolean,
): Promise<
  | { ok: true; taskId: string; data: ProviderPartialEditData }
  | { ok: false; error: PartialEditServiceError }
> {
  // 局部变量保留 narrowing（跨函数调用 typeof 检查后，TS 无法在 provider.generatePartialEdit 上保持 narrowing）
  const generateFn = provider.generatePartialEdit;
  if (typeof generateFn !== "function") {
    return { ok: false, error: buildProviderNotSupportedError(params.providerId, isFaceSwap) };
  }
  let providerResult;
  try {
    providerResult = await generateFn(params);
  } catch (e) {
    return { ok: false, error: buildProviderCallFailedError(e instanceof Error ? e.message : String(e), e) };
  }
  if (!providerResult.success || !providerResult.data) {
    return { ok: false, error: buildProviderCallFailedError(providerResult.error || "Provider 返回失败结果") };
  }
  const taskId = providerResult.data.taskId;
  if (typeof taskId !== "string" || taskId.length === 0 || taskId.length > 256) {
    return { ok: false, error: buildProviderCallFailedError(`Provider 返回的 taskId 无效：${taskId}`) };
  }
  return { ok: true, taskId, data: providerResult.data };
}

/** 调用 videoTaskStore.addTask，处理异常 */
async function createVideoTask(
  videoTaskStore: { addTask: (task: Omit<VideoTask, "progress" | "createdAt">) => Promise<VideoTask> },
  taskData: Omit<VideoTask, "progress" | "createdAt">,
): Promise<
  | { ok: true; task: VideoTask }
  | { ok: false; error: PartialEditServiceError }
> {
  try {
    const task = await videoTaskStore.addTask(taskData);
    return { ok: true, task };
  } catch (e) {
    return {
      ok: false,
      error: buildProviderCallFailedError(`添加 VideoTask 失败：${e instanceof Error ? e.message : String(e)}`, e),
    };
  }
}

/** 提示词截断警告日志（统一处理） */
function logPromptTruncationIfAny(providerData: { promptWasTruncated?: boolean; originalPromptLength?: number }, isFaceSwap: boolean): void {
  if (providerData.promptWasTruncated) {
    const label = isFaceSwap ? "face-swap " : "";
    errorLogger.warn(
      `[partial-edit-service] ${label}提示词已被截断，原始长度: ${providerData.originalPromptLength} 字符`,
    );
  }
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
    return { ok: false, error: { kind: "validation", message: "PartialEditRequest 校验失败", errors: validationErrors } };
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

  // ── Step 2-3: 编码 mask 为 base64 PNG 并校验大小 ────────────────────────────
  const maskResult = await encodeAndValidateMask(request.mask);
  if (!maskResult.ok) return { ok: false, error: maskResult.error };
  const { encodedMask } = maskResult;

  // ── Step 4: 获取原视频 URL ─────────────────────────────────────────────────
  const sourceVideoUrl = await getSourceVideoUrl(request.sourceVideoAssetId);
  if (!sourceVideoUrl) {
    return { ok: false, error: buildSourceVideoNotFoundError(request.sourceVideoAssetId) };
  }

  // ── Step 5: 构建完整 prompt ───────────────────────────────────────────────
  const fullPrompt = buildPartialEditPrompt(request.editPrompt, {
    strictness: "strict",
    preserveUnmasked: request.preserveUnmasked,
    duration: request.duration,
  });

  // ── Step 6-8: 检查 provider 支持并调用 generatePartialEdit（含 taskId 校验） ──
  const provider = container.videoProvider;
  const callResult = await callProviderPartialEdit(
    provider,
    {
      sourceVideoUrl,
      maskBase64: encodedMask.base64,
      prompt: fullPrompt,
      videoTimestamp: request.mask.videoTimestamp,
      preserveUnmasked: request.preserveUnmasked,
      providerId: request.providerId,
      modelId: request.modelId,
      duration: request.duration,
    },
    false,
  );
  if (!callResult.ok) return { ok: false, error: callResult.error };
  const providerData = callResult.data;

  // ── Step 9-10: 计算 maskBounds 并创建 VideoTask ──────────────────────────────
  const maskBounds = computeMaskBounds(request.mask);
  const newTask: Omit<VideoTask, "progress" | "createdAt"> = {
    taskId: callResult.taskId,
    status: "pending",
    message: t("video.partialEditTaskSubmitted"),
    taskSubtype: "partial_redraw",
    sourceVideoAssetId: request.sourceVideoAssetId,
    maskData: encodedMask.base64,
    maskBounds: maskBounds ?? undefined,
    editPrompt: request.editPrompt,
    prompt: fullPrompt,
    providerId: providerData.providerId ?? request.providerId,
    providerModelId: providerData.providerModelId ?? request.modelId,
    providerFormat: providerData.providerFormat,
    storyId: request.storyId,
    beatId: request.beatId,
  };
  const taskResult = await createVideoTask(videoTaskStore, newTask);
  if (!taskResult.ok) return { ok: false, error: taskResult.error };
  const createdTask = taskResult.task;

  // ── Step 11: 发出 toast 通知 ──────────────────────────────────────────────
  emitToast(
    "success",
    t("video.partialEditTaskSubmittedTitle"),
    t("video.partialEditTaskSubmittedDetail", { taskId: callResult.taskId.slice(0, 8) }),
  );
  logPromptTruncationIfAny(providerData, false);

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

// ─── Task 2A.23: Face-swap 实现 ─────────────────────────────────────────────

/**
 * 全帧 mask 的默认边界（覆盖整个画面）。
 *
 * face-swap 不知道角色面部在画面中的具体位置，所以采用全帧 mask：
 *   - 让 provider 在整段视频上做面部替换
 *   - preserveUnmasked=true 保证非面部区域（背景、服装）不变
 *
 * 这里的数值是相对坐标系（0-1000），mask-encoder 会按视频实际尺寸缩放。
 */
const FULL_FRAME_MASK_BOUNDS = { x: 0, y: 0, width: 1000, height: 1000 };

/**
 * 构造全帧 mask（用于 face-swap）。
 *
 * face-swap 不要求用户提供 mask，自动构造一个覆盖整个画面的矩形 mask。
 * 这样 provider.generatePartialEdit 会对整段视频应用 face-swap prompt，
 * 配合 preserveUnmasked=true 保护背景。
 */
function buildFullFrameMask(videoTimestamp: number = 0): MaskConfig {
  const empty = createEmptyMaskConfig(videoTimestamp);
  return addShape(empty, createRectangle(
    FULL_FRAME_MASK_BOUNDS.x,
    FULL_FRAME_MASK_BOUNDS.y,
    FULL_FRAME_MASK_BOUNDS.width,
    FULL_FRAME_MASK_BOUNDS.height,
  ));
}

/**
 * Task 2A.23: 启动 face-swap 任务。
 *
 * 与 startPartialEditTask 的区别：
 *   1. 自动构造全帧 mask（调用方不需要传 mask）
 *   2. taskSubtype='face_swap'（UI 分组显示）
 *   3. 在 prompt 中附加角色参考图 URL，让 provider 知道用什么图替换面部
 *   4. 仅在 drift_critical 时由 fallback-dispatcher 调用
 *
 * 复用 provider.generatePartialEdit — 不引入新 provider 接口。
 *
 * @param request face-swap 请求
 * @param videoTaskStore VideoTaskManager store（用于 addTask）
 * @returns 成功返回 { taskId }，失败返回错误
 */
export async function startFaceSwapTask(
  request: FaceSwapRequest,
  videoTaskStore: {
    addTask: (task: Omit<VideoTask, "progress" | "createdAt">) => Promise<VideoTask>;
  },
): Promise<{ ok: true; value: { taskId: string } } | { ok: false; error: PartialEditServiceError }> {
  // ── Step 1: 校验请求 ──────────────────────────────────────────────────────
  const validationErrors = validateFaceSwapRequest(request);
  if (validationErrors.length > 0) {
    return { ok: false, error: { kind: "validation", message: "FaceSwapRequest 校验失败", errors: validationErrors } };
  }

  // ── Step 2: 构造全帧 mask ─────────────────────────────────────────────────
  const mask: MaskConfig = buildFullFrameMask(request.duration ?? 0);
  if (!isValidMaskConfig(mask)) {
    return {
      ok: false,
      error: {
        kind: "validation",
        message: "自动构造的全帧 mask 无效",
        errors: [{ field: "mask", reason: "MaskConfig 无效" }],
      },
    };
  }

  // ── Step 3-4: 编码 mask 为 base64 PNG 并校验大小 ────────────────────────────
  const maskResult = await encodeAndValidateMask(mask);
  if (!maskResult.ok) return { ok: false, error: maskResult.error };
  const { encodedMask } = maskResult;

  // ── Step 5: 获取原视频 URL ─────────────────────────────────────────────────
  const sourceVideoUrl = await getSourceVideoUrl(request.sourceVideoAssetId);
  if (!sourceVideoUrl) {
    return { ok: false, error: buildSourceVideoNotFoundError(request.sourceVideoAssetId) };
  }

  // ── Step 6: 构建完整 prompt（附加角色参考图 URL） ──────────────────────────
  // face-swap prompt 在用户指令基础上附加参考图 URL，让 provider 知道目标面部
  const faceSwapPromptSuffix = `[Face-swap target reference image]: ${request.characterRefImageUrl}`;
  const fullPrompt = buildPartialEditPrompt(request.editPrompt, {
    strictness: "strict",
    preserveUnmasked: true,
    duration: request.duration,
  });
  const finalPrompt = `${fullPrompt}\n${faceSwapPromptSuffix}`;

  // ── Step 7-9: 检查 provider 支持并调用 generatePartialEdit（含 taskId 校验） ──
  const provider = container.videoProvider;
  const callResult = await callProviderPartialEdit(
    provider,
    {
      sourceVideoUrl,
      maskBase64: encodedMask.base64,
      prompt: finalPrompt,
      videoTimestamp: 0, // 全帧 mask，timestamp 无意义
      preserveUnmasked: true,
      providerId: request.providerId,
      modelId: request.modelId,
      duration: request.duration,
    },
    true,
  );
  if (!callResult.ok) return { ok: false, error: callResult.error };
  const providerData = callResult.data;

  // ── Step 10-11: 计算 maskBounds 并创建 VideoTask（taskSubtype='face_swap'） ───
  const maskBounds = computeMaskBounds(mask);
  const newTask: Omit<VideoTask, "progress" | "createdAt"> = {
    taskId: callResult.taskId,
    status: "pending",
    message: t("video.qcFaceSwapStarted"),
    taskSubtype: "face_swap",
    sourceVideoAssetId: request.sourceVideoAssetId,
    maskData: encodedMask.base64,
    maskBounds: maskBounds ?? undefined,
    editPrompt: request.editPrompt,
    prompt: finalPrompt,
    providerId: providerData.providerId ?? request.providerId,
    providerModelId: providerData.providerModelId ?? request.modelId,
    providerFormat: providerData.providerFormat,
    storyId: request.storyId,
    beatId: request.beatId,
    fixedImageUrl: request.characterRefImageUrl,
    fixedImageLockType: "character",
  };
  const taskResult = await createVideoTask(videoTaskStore, newTask);
  if (!taskResult.ok) return { ok: false, error: taskResult.error };
  const createdTask = taskResult.task;

  // ── Step 12: 发出 toast 通知 ──────────────────────────────────────────────
  emitToast(
    "info",
    t("video.qcFaceSwapTitle"),
    t("video.qcFaceSwapDetail"),
  );
  logPromptTruncationIfAny(providerData, true);

  return {
    ok: true,
    value: { taskId: createdTask.taskId },
  };
}
