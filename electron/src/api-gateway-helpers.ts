/**
 * api-gateway-helpers.ts
 *
 * 从 generateVideo 中提取的单一职责小函数，用于降低 generateVideo 的圈复杂度
 * 与函数行数。每个 helper 仅负责一个明确的子任务（prepareImage / 解析 / 日志 / 构建请求体等），
 * 参数尽量最小化，不依赖外部状态。
 *
 * 查表模式（Set lookup）替代原始 if-else 链（如 isLocalVideoUrl）。
 */
import { getLogger } from "./logging/logger";
import type { AIProviderPlugin } from "./plugins";
import { API_ERROR_CODES } from "./api-gateway-error-codes";
import {
  type ApiResult,
  buildVideoRequest,
} from "./api-gateway-utils";
import { isRetryableError } from "./api-gateway-retry";

const logger = getLogger("api-gateway");

/** 本地资源 URL 前缀集合（用于判定 referenceVideo 是否需要走 prepareImage） */
const LOCAL_VIDEO_URL_PREFIXES: readonly string[] = [
  "blob:",
  "data:",
  "file://",
  "/",
  "vcache://",
];

export interface ParsedReferenceVideo {
  referenceVideoUrl: string | undefined;
  effectiveMimicryLevel: string | undefined;
}

/**
 * 从 body 中解析 referenceVideo 字段。
 * 支持两种格式：
 *  - string：直接作为 URL
 *  - object：{ videoUrl, mimicryLevel }
 */
export function parseReferenceVideo(
  rawReferenceVideo: unknown,
  mimicryLevel: string | undefined,
): ParsedReferenceVideo {
  if (!rawReferenceVideo) {
    return { referenceVideoUrl: undefined, effectiveMimicryLevel: mimicryLevel };
  }
  if (typeof rawReferenceVideo === "object") {
    const obj = rawReferenceVideo as Record<string, unknown>;
    const videoUrl = obj.videoUrl as string | undefined;
    const refMimicry = obj.mimicryLevel as string | undefined;
    return {
      referenceVideoUrl: videoUrl,
      effectiveMimicryLevel: refMimicry || mimicryLevel,
    };
  }
  return {
    referenceVideoUrl: rawReferenceVideo as string,
    effectiveMimicryLevel: mimicryLevel,
  };
}

/**
 * 判断 URL 是否为本地资源（blob:/data:/file:///绝对路径/vcache://）。
 * 用数组查表替代原始的多重 || 短路判断，降低圈复杂度。
 */
export function isLocalVideoUrl(url: string): boolean {
  for (const prefix of LOCAL_VIDEO_URL_PREFIXES) {
    if (url.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * 记录 plugin 视频能力与请求参数的对比日志。
 * 仅在非生产环境或有特殊参数（lastFrame/characterRefs/sceneRef）时输出，避免噪音。
 */
export function logVideoCapabilityCheck(
  plugin: AIProviderPlugin,
  effectiveModel: string | undefined,
  lastFrameUrl: unknown,
  characterRefsRaw: unknown,
  characterRefRaw: unknown,
  sceneRef: unknown,
): void {
  if (process.env.NODE_ENV === "production" && !lastFrameUrl && !characterRefsRaw && !sceneRef) {
    return;
  }
  const pluginVCaps = plugin.videoCapabilities;
  const charRefsCount = Array.isArray(characterRefsRaw)
    ? characterRefsRaw.length
    : characterRefRaw
      ? 1
      : 0;
  logger.debug(
    `[CapabilityCheck] plugin=${plugin.id} model=${effectiveModel} ` +
      `supportsLastFrame=${pluginVCaps.supportsLastFrame} ` +
      `supportsCharacterRef=${pluginVCaps.supportsCharacterRef ?? false} ` +
      `supportsSceneRef=${pluginVCaps.supportsSceneRef ?? false} ` +
      `maxDuration=${pluginVCaps.maxDuration} ` +
      `maxCharacterRefs=${pluginVCaps.maxCharacterRefs ?? "default"} ` +
      `| request: lastFrame=${!!lastFrameUrl} charRefs=${charRefsCount} sceneRef=${!!sceneRef}`,
  );
}

/**
 * 准备视频生成的首帧图像（firstFrameUrl 优先，回退到 bodyImageUrl）。
 */
export async function prepareVideoFirstFrame(
  plugin: AIProviderPlugin,
  firstFrameUrl: string | undefined,
  bodyImageUrl: string | undefined,
  apiConfig: { apiKey: string; apiUrl: string },
): Promise<string | undefined> {
  const url = firstFrameUrl || bodyImageUrl;
  if (!url) return undefined;
  return plugin.prepareImage(url, "firstFrame", apiConfig);
}

/**
 * 准备视频生成的尾帧图像。
 * 若 plugin 不支持 lastFrame，记录警告并返回 undefined。
 */
export async function prepareVideoLastFrame(
  plugin: AIProviderPlugin,
  lastFrameUrl: string | undefined,
  apiConfig: { apiKey: string; apiUrl: string },
): Promise<string | undefined> {
  if (!plugin.videoCapabilities.supportsLastFrame) {
    if (lastFrameUrl) {
      logger.warn(`Provider ${plugin.id} does not support last frame, ignoring lastFrameUrl`);
    }
    return undefined;
  }
  if (!lastFrameUrl) return undefined;
  return plugin.prepareImage(lastFrameUrl, "lastFrame", apiConfig);
}

/**
 * 准备视频生成的参考视频 URL。
 * 本地 URL（blob/data/file 等）走 plugin.prepareImage 上传到 provider 可访问的位置；
 * 远程 URL 直接使用。
 */
export async function prepareVideoReferenceVideo(
  plugin: AIProviderPlugin,
  referenceVideoUrl: string | undefined,
  apiConfig: { apiKey: string; apiUrl: string },
): Promise<string | undefined> {
  if (!referenceVideoUrl) return undefined;
  if (isLocalVideoUrl(referenceVideoUrl)) {
    return plugin.prepareImage(referenceVideoUrl, "referenceVideo", apiConfig);
  }
  return referenceVideoUrl;
}

/**
 * 准备视频生成的角色参考图数组。
 * - 若 plugin 不支持 characterRef，记录警告并返回空数组
 * - 超出 maxCharacterRefs 时截断并记录警告
 * - prepareImage 返回 falsy 的项被过滤
 */
export async function prepareVideoCharacterRefs(
  plugin: AIProviderPlugin,
  characterRefsRaw: unknown,
  characterRefRaw: unknown,
  apiConfig: { apiKey: string; apiUrl: string },
): Promise<string[]> {
  if (plugin.videoCapabilities.supportsCharacterRef === false) {
    if (characterRefsRaw || characterRefRaw) {
      logger.warn(`Provider ${plugin.id} does not support characterRef, ignoring`);
    }
    return [];
  }
  const rawRefs = (
    Array.isArray(characterRefsRaw)
      ? characterRefsRaw
      : characterRefRaw
        ? [characterRefRaw]
        : []
  ) as string[];
  const maxRefs = plugin.videoCapabilities.maxCharacterRefs ?? rawRefs.length;
  const limitedRefs = rawRefs.slice(0, maxRefs);
  if (rawRefs.length > maxRefs) {
    logger.warn(`Provider ${plugin.id} supports max ${maxRefs} character refs, ${rawRefs.length} provided, truncating`);
  }
  const result: string[] = [];
  for (const ref of limitedRefs) {
    const prepared = await plugin.prepareImage(ref, "characterRef", apiConfig);
    if (prepared) result.push(prepared);
  }
  return result;
}

/**
 * 准备视频生成的场景参考图。
 * 若 plugin 不支持 sceneRef，记录警告并返回 undefined。
 */
export async function prepareVideoSceneRef(
  plugin: AIProviderPlugin,
  sceneRef: unknown,
  apiConfig: { apiKey: string; apiUrl: string },
): Promise<string | undefined> {
  if (!sceneRef) return undefined;
  if (plugin.videoCapabilities.supportsSceneRef === false) {
    logger.warn(`Provider ${plugin.id} does not support sceneRef, ignoring`);
    return undefined;
  }
  return plugin.prepareImage(sceneRef as string, "sceneRef", apiConfig);
}

export interface VideoRequestBodyResult {
  body: unknown;
  endpoint: string;
  extraHeaders?: Record<string, string>;
}

export interface BuildVideoRequestBodyParams {
  prompt: string;
  model: string | undefined;
  firstFrameUrl: string | undefined;
  lastFrameUrl: string | undefined;
  referenceVideoUrl: string | undefined;
  referenceVideoMimicryLevel: string | undefined;
  duration: number;
  characterRefs: string[] | undefined;
  sceneRef: string | undefined;
}

export type BuildVideoRequestBodyOutcome =
  | { ok: true; result: VideoRequestBodyResult }
  | { ok: false; error: ApiResult };

/**
 * 调用 plugin.buildVideoRequest 构建请求体。
 * 失败时返回结构化的错误 ApiResult，调用方直接 return 即可。
 *
 * characterRef 字段从 characterRefs[0] 派生（保持向后兼容）。
 */
export async function buildVideoRequestBody(
  plugin: AIProviderPlugin,
  params: BuildVideoRequestBodyParams,
): Promise<BuildVideoRequestBodyOutcome> {
  try {
    const result = await buildVideoRequest(plugin, {
      prompt: params.prompt,
      model: params.model,
      firstFrameUrl: params.firstFrameUrl,
      lastFrameUrl: params.lastFrameUrl,
      referenceVideoUrl: params.referenceVideoUrl,
      referenceVideoMimicryLevel: params.referenceVideoMimicryLevel,
      duration: params.duration,
      characterRefs: params.characterRefs,
      characterRef:
        params.characterRefs && params.characterRefs.length > 0
          ? params.characterRefs[0]
          : undefined,
      sceneRef: params.sceneRef,
    });
    return { ok: true, result };
  } catch (e) {
    logger.error("Video buildRequest error", e instanceof Error ? e : undefined);
    return {
      ok: false,
      error: {
        ok: false,
        success: false,
        error: { code: API_ERROR_CODES.PLUGIN_ERROR, message: (e as Error).message },
        code: API_ERROR_CODES.PLUGIN_ERROR,
        httpStatus: 500,
      },
    };
  }
}

/**
 * 视频生成请求的可重试错误判定。
 * - HTTP 429（限流）或 5xx（>=502，服务端错误）→ 可重试
 * - 其它情况 fallback 到通用 isRetryableError（网络错误码、消息模式等）
 */
export function isVideoRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const httpStatus = (error as Error & { statusCode?: number }).statusCode;
  if (httpStatus !== undefined) {
    return httpStatus === 429 || httpStatus >= 502;
  }
  return isRetryableError(error);
}
