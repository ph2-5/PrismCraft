/**
 * Video Tools 辅助函数（Video Tools Helpers）
 *
 * 从 video-tools.ts 拆出，避免主文件超过 max-lines 限制。
 * 包含：
 * - 参数解析（parseCreateVideoTaskArgs / parseBatchTaskItem）
 * - 任务记录构造（buildVideoTaskRecord）
 * - 列表项映射（toListItem / truncatePrompt）
 * - 单任务提交（submitSingleBatchTask）
 * - 任务重提交（resubmitVideoTaskWithSameParams）
 *
 * 架构规则：本文件通过 DI container 访问 videoProvider / videoTaskStorage，
 * 与 video-tools.ts 共享特权访问声明（详见 MODULE.md）。
 */

import { container } from "@/infrastructure/di";
import { errorLogger } from "@/shared/error-logger";
import type { VideoTask } from "@/domain/schemas";

// ============= 通用工具 =============

/** 截断 prompt 到指定长度，避免 token 浪费 */
export function truncatePrompt(prompt: string | undefined, maxLen = 100): string | undefined {
  if (!prompt) return undefined;
  return prompt.length > maxLen ? `${prompt.slice(0, maxLen)}…` : prompt;
}

/** 将 VideoTask 映射为列表精简项 */
export function toListItem(task: VideoTask) {
  return {
    taskId: task.taskId,
    prompt: truncatePrompt(task.prompt),
    status: task.status,
    progress: task.progress,
    createdAt: task.createdAt,
    videoUrl: task.videoUrl,
    storyId: task.storyId,
    beatId: task.beatId,
  };
}

// ============= create_video_task 辅助 =============

/** 解析 createVideoTask 工具参数 */
export function parseCreateVideoTaskArgs(args: Record<string, unknown>): {
  firstFrameUrl?: string;
  lastFrameUrl?: string;
  characterRef?: string;
  sceneRef?: string;
  duration?: number;
  providerId?: string;
  modelId?: string;
  storyId?: string;
  beatId?: string;
} {
  return {
    firstFrameUrl: args.firstFrameUrl ? String(args.firstFrameUrl) : undefined,
    lastFrameUrl: args.lastFrameUrl ? String(args.lastFrameUrl) : undefined,
    characterRef: args.characterRef ? String(args.characterRef) : undefined,
    sceneRef: args.sceneRef ? String(args.sceneRef) : undefined,
    duration: args.duration != null ? Number(args.duration) : undefined,
    providerId: args.providerId ? String(args.providerId) : undefined,
    modelId: args.modelId ? String(args.modelId) : undefined,
    storyId: args.storyId ? String(args.storyId) : undefined,
    beatId: args.beatId ? String(args.beatId) : undefined,
  };
}

/** 构造 VideoTask 记录（含 parameters 子对象） */
export function buildVideoTaskRecord(
  taskId: string,
  prompt: string,
  params: ReturnType<typeof parseCreateVideoTaskArgs>,
  providerData: { status?: string; providerId?: string; providerModelId?: string; providerFormat?: string; videoUrl?: string; promptWasTruncated?: boolean },
): Partial<VideoTask> & { taskId: string } {
  const nowIso = new Date().toISOString();
  const parameters: Record<string, unknown> = {};
  if (params.lastFrameUrl) parameters.lastFrameUrl = params.lastFrameUrl;
  if (params.duration != null) parameters.duration = params.duration;
  if (params.characterRef) parameters.characterRef = params.characterRef;
  if (params.sceneRef) parameters.sceneRef = params.sceneRef;

  return {
    taskId,
    status: (providerData.status as VideoTask["status"]) || "pending",
    progress: 0,
    message: "任务已提交",
    createdAt: nowIso,
    updatedAt: nowIso,
    prompt,
    fixedImageUrl: params.firstFrameUrl,
    providerId: providerData.providerId || params.providerId,
    providerModelId: providerData.providerModelId || params.modelId,
    providerFormat: providerData.providerFormat,
    storyId: params.storyId,
    beatId: params.beatId,
    parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
    promptWasTruncated: providerData.promptWasTruncated,
  };
}

// ============= recover_video_task 辅助 =============

/** 用相同参数重新提交视频生成请求，创建新任务记录 */
export async function resubmitVideoTaskWithSameParams(
  task: VideoTask,
  oldTaskId: string,
  storage: typeof container.videoTaskStorage,
): Promise<{ success: true; data: { taskId: string; oldTaskId: string; status: string; retry: boolean; message: string } } | { success: false; error: string }> {
  const params = task.parameters || {};
  const result = await container.videoProvider.generateVideoWithFrames({
    prompt: task.prompt || "",
    firstFrameUrl: task.fixedImageUrl,
    lastFrameUrl: params.lastFrameUrl as string | undefined,
    characterRef: params.characterRef as string | undefined,
    sceneRef: params.sceneRef as string | undefined,
    duration: params.duration as number | undefined,
    providerId: task.providerId,
    modelId: task.providerModelId,
  });

  if (!result.success || !result.data) {
    return { success: false, error: result.error || "重新提交生成请求失败" };
  }

  const newTaskId = result.data.taskId;
  if (!newTaskId) {
    return { success: false, error: "provider 未返回新 taskId" };
  }

  const nowIso = new Date().toISOString();
  const newTaskRecord: Partial<VideoTask> & { taskId: string } = {
    taskId: newTaskId,
    status: (result.data.status as VideoTask["status"]) || "pending",
    progress: 0,
    message: "用户重试，已重新提交",
    createdAt: nowIso,
    updatedAt: nowIso,
    prompt: task.prompt,
    fixedImageUrl: task.fixedImageUrl,
    providerId: result.data.providerId || task.providerId,
    providerModelId: result.data.providerModelId || task.providerModelId,
    providerFormat: result.data.providerFormat || task.providerFormat,
    storyId: task.storyId,
    storyTitle: task.storyTitle,
    beatId: task.beatId,
    beatTitle: task.beatTitle,
    parameters: task.parameters,
    recoveryAttempts: 0,
  };

  try {
    await storage.createVideoTask(newTaskRecord);
  } catch (e) {
    return {
      success: false,
      error: `新任务已提交但本地存储失败：${e instanceof Error ? e.message : String(e)}`,
    };
  }

  return {
    success: true,
    data: {
      taskId: newTaskId,
      oldTaskId,
      status: (result.data.status as string) || "pending",
      retry: true,
      message: "已用相同参数重新提交生成请求",
    },
  };
}

// ============= batch_create_video_tasks 辅助 =============

/** 解析批量任务单个 item，返回标准化参数对象 */
export function parseBatchTaskItem(item: unknown): {
  prompt: string;
  firstFrameUrl?: string;
  lastFrameUrl?: string;
  storyId?: string;
  beatId?: string;
  duration?: number;
} {
  const it = (item ?? {}) as Record<string, unknown>;
  return {
    prompt: it.prompt ? String(it.prompt) : "",
    firstFrameUrl: it.firstFrameUrl ? String(it.firstFrameUrl) : undefined,
    lastFrameUrl: it.lastFrameUrl ? String(it.lastFrameUrl) : undefined,
    storyId: it.storyId ? String(it.storyId) : undefined,
    beatId: it.beatId ? String(it.beatId) : undefined,
    duration: it.duration != null ? Number(it.duration) : undefined,
  };
}

/** 提交单个批量任务到 provider 并持久化到本地存储 */
export async function submitSingleBatchTask(
  parsed: ReturnType<typeof parseBatchTaskItem>,
  providerId: string | undefined,
  modelId: string | undefined,
  storage: typeof container.videoTaskStorage,
): Promise<{ ok: true; taskId: string; status: string } | { ok: false; error: string }> {
  const { prompt, firstFrameUrl, lastFrameUrl, storyId, beatId, duration } = parsed;

  try {
    const result = await container.videoProvider.generateVideoWithFrames({
      prompt,
      firstFrameUrl,
      lastFrameUrl,
      duration,
      providerId,
      modelId,
    });

    if (!result.success || !result.data) {
      return { ok: false, error: result.error || "视频生成请求失败" };
    }

    const taskId = result.data.taskId;
    if (!taskId) {
      return { ok: false, error: "provider 未返回 taskId" };
    }

    // 持久化任务记录
    const nowIso = new Date().toISOString();
    const parameters: Record<string, unknown> = {};
    if (lastFrameUrl) parameters.lastFrameUrl = lastFrameUrl;
    if (duration != null) parameters.duration = duration;

    const taskStatus: VideoTask["status"] = (result.data.status as VideoTask["status"]) || "pending";
    const taskRecord: Partial<VideoTask> & { taskId: string } = {
      taskId,
      status: taskStatus,
      progress: 0,
      message: "批量任务已提交",
      createdAt: nowIso,
      updatedAt: nowIso,
      prompt,
      fixedImageUrl: firstFrameUrl,
      providerId: result.data.providerId || providerId,
      providerModelId: result.data.providerModelId || modelId,
      providerFormat: result.data.providerFormat,
      storyId,
      beatId,
      parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
    };

    try {
      await storage.createVideoTask(taskRecord);
    } catch (e) {
      // 持久化失败：任务已在 provider 侧创建（消耗 API 配额），
      // 但本地无记录，用户无法追踪或取消。记录 error 级别日志便于排查，
      // 同时将任务从 created 移到 failed，明确告知调用方持久化失败。
      errorLogger.error("[video-tools] createVideoTask 持久化失败，云端任务可能仍在运行", {
        taskId, beatId, providerTaskId: taskId, error: e,
      });
      return {
        ok: false,
        error: `Task created on provider but local persistence failed: ${e instanceof Error ? e.message : String(e)}`,
      };
    }

    return { ok: true, taskId, status: taskStatus };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
