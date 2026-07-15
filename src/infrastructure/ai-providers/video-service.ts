/**
 * @file Video Service — 视频生成 HTTP 通信层
 *
 * 职责：
 * - 封装视频生成相关 HTTP API 调用（generateVideo / generateFramePair / generateKeyframe / getVideoStatus）
 * - 处理首尾帧/参考图的 base64 归一化（blob:、data:、file:// 等本地 URL 统一转 base64）
 * - 依赖 model-capabilities 做能力自适应（首尾帧支持、参考图数量上限等）
 * - 与主进程 `/api/generation/*` 路由通信，支持 apiCallWithRetry 重试
 *
 * 调用方：
 * - 渲染层 video 模块（useVideoGenerator / beat-video-generator）
 * - story-pipeline 的视频生成步骤
 *
 * 不做：
 * - 不做业务逻辑（如分镜编排、批量生成），由上层模块负责
 * - 不直接访问 IPC，统一走 HTTP API
 */

import type { ApiResponse, VideoGenerationResult } from "@/domain/schemas";
import { AppError } from "@/domain/types";
import { errorLogger, extractErrorMessage } from "@/shared/error-logger";
import { apiCallWithRetry, ApiClientError } from "./core";
import { resolveCapability, safeTruncatePrompt } from "./config";
import { imageToBase64 } from "./utils";
import { getModelCapabilities, adjustReferenceImages } from "./model-capabilities-utils";
import { ReferencePriority } from "./model-capabilities-types";
import type {
  VideoGenerationRequestBody,
  FramePairGenerationRequestBody,
  KeyframeGenerationRequestBody,
  VideoStatusRequestBody,
} from "./types";

/**
 * Task 3.2 Step 2：视频生成有效参数（能力过滤后的）。
 *
 * 调用方不再需要手动查询 getVideoGenerationStrategy 判断 useCharacterRef/useSceneRef，
 * 统一通过此函数获取过滤后的参数 + 策略元信息（promptLanguage / supportsReferenceVideo）。
 */
export interface EffectiveVideoParams {
  modelId: string;
  prompt: string;
  firstFrameUrl?: string;
  lastFrameUrl?: string;
  characterRefs?: string[];
  sceneRef?: string;
  /** 提示词语言（从模型能力解析） */
  promptLanguage: "en" | "zh" | "auto";
  /** 是否支持参考视频续写 */
  supportsReferenceVideo: boolean;
}

/**
 * Task 3.2 Step 2：根据模型能力过滤视频生成参数。
 *
 * 过滤规则：
 * - `!supportsLastFrame` → 移除 lastFrameUrl
 * - `!supportsCharacterRef` → 移除 characterRefs
 * - `!supportsSceneRef` → 移除 sceneRef
 * - `characterRefs.length > maxReferences` → 截断（复用 adjustReferenceImages，激活 Dead Code）
 *
 * 同时返回 promptLanguage 和 supportsReferenceVideo，调用方无需再查询 strategy。
 */
export function getEffectiveVideoParams(params: {
  modelId: string;
  prompt: string;
  firstFrameUrl?: string;
  lastFrameUrl?: string;
  characterRefs?: string[];
  sceneRef?: string;
}): EffectiveVideoParams {
  const caps = getModelCapabilities(params.modelId);

  const effectiveLastFrameUrl = caps.supportsLastFrame ? params.lastFrameUrl : undefined;

  // 与 getVideoGenerationStrategy 保持一致：bake_into_first / none 模式不传递 characterRefs
  // bake_into_first 意味着参考图已在首帧生成阶段烘焙，视频生成阶段无需再传递
  const charMode = caps.characterRefMode ?? (caps.supportsCharacterRef ? "text_append" : "none");
  const sceneMode = caps.sceneRefMode ?? (caps.supportsSceneRef ? "text_append" : "none");
  const useCharRef = charMode !== "none" && charMode !== "bake_into_first";
  const useSceneRef = sceneMode !== "none" && sceneMode !== "bake_into_first";

  // Task 3.2 Step 6：复用 adjustReferenceImages 做截断 + warn，激活 Dead Code。
  // 将 URL 列表包装成 ReferenceImageItem（character 类型 + 递增 priority），过滤后提取 URL。
  let effectiveCharacterRefs: string[] | undefined;
  if (useCharRef && params.characterRefs?.length) {
    const refItems = params.characterRefs.map((url, idx) => ({
      url,
      priority: ReferencePriority.CHARACTER_REF + idx,
      type: "character" as const,
    }));
    const adjusted = adjustReferenceImages(refItems, params.modelId, "video");
    effectiveCharacterRefs = adjusted.length > 0 ? adjusted.map((r) => r.url) : undefined;
  }

  const effectiveSceneRef = useSceneRef ? params.sceneRef : undefined;

  return {
    modelId: params.modelId,
    prompt: params.prompt,
    firstFrameUrl: params.firstFrameUrl,
    lastFrameUrl: effectiveLastFrameUrl,
    characterRefs: effectiveCharacterRefs,
    sceneRef: effectiveSceneRef,
    promptLanguage: caps.promptLanguage ?? "auto",
    supportsReferenceVideo: caps.supportsReferenceVideo ?? false,
  };
}

function isLocalUrl(url: string): boolean {
  return url.startsWith("blob:") || url.startsWith("data:") || url.startsWith("file://") || url.startsWith("/");
}

async function normalizeImageToBase64(url?: string): Promise<string | undefined> {
  if (!url) return undefined;
  try {
    if (typeof window !== "undefined") {
      return await imageToBase64(url);
    }
    return url;
  } catch (error) {
    errorLogger.warn(
      new AppError("IMAGE_BASE64_ERROR", "图片转 base64 失败，使用原始URL", error),
      "VideoService",
    );
    return url;
  }
}

export async function generateVideo(
  prompt: string,
  options?: {
    firstFrameUrl?: string;
    lastFrameUrl?: string;
    characterRefs?: string[];
    sceneRef?: string;
    duration?: number;
    referenceVideo?: { enabled: boolean; videoUrl: string; mimicryLevel?: string };
    providerId?: string;
    modelId?: string;
    format?: string;
  },
): Promise<ApiResponse<VideoGenerationResult>> {
  const finalFirstFrameUrl = await normalizeImageToBase64(options?.firstFrameUrl);
  const finalLastFrameUrl = await normalizeImageToBase64(options?.lastFrameUrl);

  const { truncated: safePrompt, wasTruncated } = safeTruncatePrompt(prompt);

  const requestBody: VideoGenerationRequestBody = {
    prompt: safePrompt,
    firstFrameUrl: finalFirstFrameUrl,
    lastFrameUrl: finalLastFrameUrl,
    characterRefs: options?.characterRefs,
    sceneRef: options?.sceneRef,
    duration: options?.duration ?? 5,
    promptWasTruncated: wasTruncated,
  };

  if (options?.referenceVideo?.enabled && options.referenceVideo.videoUrl) {
    const refUrl = options.referenceVideo.videoUrl;
    if (isLocalUrl(refUrl)) {
      errorLogger.warn(
        new AppError("LOCAL_URL_SKIPPED", `[VideoService] referenceVideo URL is local, skipping (API providers cannot access local URLs): ${refUrl.substring(0, 50)}`),
        "VideoService",
      );
    } else {
      requestBody.referenceVideo = {
        enabled: true,
        videoUrl: refUrl,
        mimicryLevel: options.referenceVideo.mimicryLevel ?? "medium",
      };
    }
  }

  if (options?.providerId && options?.modelId) {
    requestBody.providerId = options.providerId;
    requestBody.modelId = options.modelId;
    requestBody.format = options.format;
  } else {
    const { provider, model } = await resolveCapability("video");
    requestBody.providerId = provider.id;
    requestBody.modelId = model.id;
  }

  try {
    const result = await apiCallWithRetry<ApiResponse<VideoGenerationResult>>(
      "generate-video",
      {
        method: "POST",
        body: JSON.stringify(requestBody),
        timeout: 600000,
      },
    );
    if (result.success && result.data && wasTruncated) {
      result.data.promptWasTruncated = true;
      result.data.originalPromptLength = prompt.length;
    }
    return result;
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    throw new Error(extractErrorMessage(error));
  }
}

export async function generateKeyframe(params: {
  characterRefs?: string[];
  sceneRef?: string;
  prevKeyframe?: string;
  shotRequirement?: {
    shotType?: string;
    cameraAngle?: string;
    cameraMovement?: string;
    action?: string;
  };
  content?: string;
  providerId?: string;
  modelId?: string;
  format?: string;
}): Promise<
  ApiResponse<{
    imageUrl: string;
    prompt: string;
    generatedAt: number;
    referencedPrevKeyframe: boolean;
    referenceCount: number;
  }>
> {
  const requestBody: KeyframeGenerationRequestBody = {
    characterRef: params.characterRefs?.[0],
    characterRefs: params.characterRefs,
    sceneRef: params.sceneRef,
    prevKeyframe: params.prevKeyframe,
    shotRequirement: params.shotRequirement,
    content: params.content,
  };

  if (params.providerId && params.modelId) {
    requestBody.providerId = params.providerId;
    requestBody.modelId = params.modelId;
    requestBody.format = params.format;
  } else {
    const { provider, model } = await resolveCapability("image");
    requestBody.providerId = provider.id;
    requestBody.modelId = model.id;
  }

  return apiCallWithRetry<
    ApiResponse<{
      imageUrl: string;
      prompt: string;
      generatedAt: number;
      referencedPrevKeyframe: boolean;
      referenceCount: number;
    }>
  >("generate-keyframe", {
    method: "POST",
    body: JSON.stringify(requestBody),
    timeout: 120000,
  });
}

export async function generateFramePair(params: {
  keyframeUrl: string;
  keyframePrompt?: string;
  characterRefs?: string[];
  sceneRef?: string;
  prevLastFrameUrl?: string;
  actionDescription?: string;
  duration?: number;
  providerId?: string;
  modelId?: string;
  format?: string;
}): Promise<
  ApiResponse<{
    firstFrame: {
      imageUrl: string;
      prompt: string;
      derivedFrom: string;
    };
    lastFrame: {
      imageUrl: string;
      prompt: string;
      derivedFrom: string;
    };
    generatedAt: number;
  }>
> {
  const requestBody: FramePairGenerationRequestBody = {
    keyframeUrl: params.keyframeUrl,
    keyframePrompt: params.keyframePrompt,
    characterRef: params.characterRefs?.[0],
    characterRefs: params.characterRefs,
    sceneRef: params.sceneRef,
    prevLastFrameUrl: params.prevLastFrameUrl,
    actionDescription: params.actionDescription,
    duration: params.duration,
  };

  if (params.providerId && params.modelId) {
    requestBody.providerId = params.providerId;
    requestBody.modelId = params.modelId;
    requestBody.format = params.format;
  } else {
    const { provider, model } = await resolveCapability("image");
    requestBody.providerId = provider.id;
    requestBody.modelId = model.id;
  }

  return apiCallWithRetry<
    ApiResponse<{
      firstFrame: {
        imageUrl: string;
        prompt: string;
        derivedFrom: string;
      };
      lastFrame: {
        imageUrl: string;
        prompt: string;
        derivedFrom: string;
      };
      generatedAt: number;
    }>
  >("generate-frame-pair", {
    method: "POST",
    body: JSON.stringify(requestBody),
    timeout: 240000,
  });
}

export async function queryVideoStatus(
  taskId: string,
  options?: {
    providerId?: string;
    modelId?: string;
    format?: string;
  },
): Promise<
  ApiResponse<{
    status: "pending" | "generating" | "completed" | "failed";
    videoUrl?: string;
    progress?: number;
    message?: string;
  }>
> {
  const requestBody: VideoStatusRequestBody = { taskId };

  if (options?.providerId) {
    const { provider, model } = await resolveCapability(
      "video",
      undefined,
      options.providerId,
      options.modelId,
    );
    requestBody.providerId = provider.id;
    requestBody.modelId = model.id;
  } else {
    const { provider, model } = await resolveCapability("video");
    requestBody.providerId = provider.id;
    requestBody.modelId = model.id;
  }

  return apiCallWithRetry<
    ApiResponse<{
      status: "pending" | "generating" | "completed" | "failed";
      videoUrl?: string;
      progress?: number;
      message?: string;
    }>
  >("video-status", {
    method: "POST",
    body: JSON.stringify(requestBody),
  });
}