/**
 * api-gateway.ts
 *
 * AI provider API 网关入口。聚合 text/image/audio/video 各类生成函数，
 * 通过 re-export 形式保持原有公共 API 不变（`import * as apiGateway from "./api-gateway"`）。
 *
 * 文件结构（拆分以控制单文件行数 ≤500）：
 *  - api-gateway-text.ts：generateText / generateTextStream / generateChat / generateChatStream / generateEmbedding
 *  - api-gateway-image.ts：generateImage / generateKeyframe / generateFramePair / analyzeImage
 *  - api-gateway-av.ts：generateAudio / transcribeAudio
 *  - api-gateway-helpers.ts：从 generateVideo 提取的子函数（prepareImage / 解析 / 构建请求体等）
 *  - api-gateway-utils.ts：通用工具（resolveApiConfig / getAuthHeaders / SSRF / 文件上传等）
 *  - api-gateway-retry.ts：withRetry / isRetryableError
 *  - api-gateway-error-codes.ts：API_ERROR_CODES
 *
 * 本文件保留：generateVideo（使用 helpers 重构，降低 complexity 与行数）、videoStatus、
 * 以及 createApiGatewayAdapter 适配器。
 */
import { getLogger } from "./logging/logger";
import { pluginRegistry } from "./plugins";
import { API_ERROR_CODES } from "./api-gateway-error-codes";
import {
  type ApiResult,
  resolveApiConfig,
  getAuthHeaders,
  extractTaskId,
  extractVideoUrl,
  extractStatus,
  handleUpload,
  getUploadedFile,
} from "./api-gateway-utils";
import { makeRequest } from "./http-request";
import { withRetry, isRetryableError } from "./api-gateway-retry";
import {
  parseReferenceVideo,
  logVideoCapabilityCheck,
  prepareVideoFirstFrame,
  prepareVideoLastFrame,
  prepareVideoReferenceVideo,
  prepareVideoCharacterRefs,
  prepareVideoSceneRef,
  buildVideoRequestBody,
  isVideoRetryableError,
} from "./api-gateway-helpers";
import {
  generateImage,
  generateKeyframe,
  generateFramePair,
  analyzeImage,
} from "./api-gateway-image";
import {
  generateText,
  generateTextStream,
  generateChat,
  generateChatStream,
  generateEmbedding,
} from "./api-gateway-text";
import {
  generateAudio,
  transcribeAudio,
} from "./api-gateway-av";

const logger = getLogger("api-gateway");

async function generateVideo(body: Record<string, unknown>): Promise<ApiResult> {
  const {
    prompt,
    imageUrl: bodyImageUrl,
    firstFrameUrl,
    lastFrameUrl,
    duration = 5,
    characterRef: characterRefRaw,
    characterRefs: characterRefsRaw,
    sceneRef,
    referenceVideo: rawReferenceVideo,
    format: _bodyFormat,
    mimicryLevel,
  } = body as Record<string, unknown>;

  const { referenceVideoUrl, effectiveMimicryLevel } = parseReferenceVideo(
    rawReferenceVideo,
    mimicryLevel as string | undefined,
  );

  const {
    effectiveApiUrl,
    effectiveApiKey,
    effectiveModel,
    resolvedProviderId,
    resolvedProviderModelId,
    resolvedProviderFormat,
    resolvedPlugin,
  } = await resolveApiConfig(body, "video");

  if (!effectiveApiKey) {
    return {
      success: false,
      error: { code: API_ERROR_CODES.API_NOT_CONFIGURED, message: "video" },
      code: API_ERROR_CODES.API_NOT_CONFIGURED,
      httpStatus: 400,
    };
  }

  if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
    return {
      success: false,
      error: "empty_prompt",
      code: API_ERROR_CODES.EMPTY_PROMPT,
      httpStatus: 400,
    };
  }

  const plugin = resolvedPlugin || pluginRegistry.select(effectiveApiUrl || "", effectiveModel);
  if (!plugin) {
    return { success: false, error: "unknown_provider", code: API_ERROR_CODES.UNKNOWN_PROVIDER, httpStatus: 400 };
  }

  logVideoCapabilityCheck(plugin, effectiveModel, lastFrameUrl, characterRefsRaw, characterRefRaw, sceneRef);

  const safeDuration = Math.min(
    Math.max((duration as number) || 5, 1),
    plugin.videoCapabilities.maxDuration,
  );

  const apiConfig = { apiKey: effectiveApiKey, apiUrl: effectiveApiUrl || "" };

  // 各类参考资源准备 — 通过 helper 函数封装支持能力检查、警告、截断等逻辑
  const effectiveFirstFrame = await prepareVideoFirstFrame(
    plugin,
    firstFrameUrl as string | undefined,
    bodyImageUrl as string | undefined,
    apiConfig,
  );
  const effectiveLastFrame = await prepareVideoLastFrame(
    plugin,
    lastFrameUrl as string | undefined,
    apiConfig,
  );
  const effectiveRefVideoUrl = await prepareVideoReferenceVideo(plugin, referenceVideoUrl, apiConfig);
  const effectiveCharacterRefs = await prepareVideoCharacterRefs(
    plugin,
    characterRefsRaw,
    characterRefRaw,
    apiConfig,
  );
  const effectiveSceneRef = await prepareVideoSceneRef(plugin, sceneRef, apiConfig);

  const buildResult = await buildVideoRequestBody(plugin, {
    prompt: prompt as string,
    model: effectiveModel,
    firstFrameUrl: effectiveFirstFrame,
    lastFrameUrl: effectiveLastFrame,
    referenceVideoUrl: effectiveRefVideoUrl,
    referenceVideoMimicryLevel: effectiveMimicryLevel,
    duration: safeDuration,
    characterRefs: effectiveCharacterRefs.length > 0 ? effectiveCharacterRefs : undefined,
    sceneRef: effectiveSceneRef,
  });

  if (!buildResult.ok) {
    return buildResult.error;
  }

  const { body: reqBody, endpoint, extraHeaders } = buildResult.result;

  try {
    const requestUrl = plugin.appendAuthToUrl
      ? plugin.appendAuthToUrl(`${effectiveApiUrl}${endpoint}`, effectiveApiKey)
      : `${effectiveApiUrl}${endpoint}`;
    const requestHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...await getAuthHeaders(plugin, effectiveApiKey, endpoint),
      ...(extraHeaders || {}),
    };

    const response = (await withRetry(
      () => makeRequest(requestUrl, {
        method: "POST",
        headers: requestHeaders,
        body: JSON.stringify(reqBody),
        timeout: 300000,
      }),
      {
        maxRetries: 1,
        retryableCheck: isVideoRetryableError,
      },
    )) as Record<string, unknown>;

    const taskId = await extractTaskId(plugin, response);
    const videoUrl = await extractVideoUrl(plugin, response);

    return {
      success: true,
      data: {
        taskId,
        videoUrl,
        providerId: resolvedProviderId,
        providerModelId: resolvedProviderModelId,
        providerFormat: resolvedProviderFormat,
      },
    };
  } catch (error) {
    logger.error("Video generation error", error instanceof Error ? error : undefined);
    return {
      success: false,
      error: (error as Error).message,
      httpStatus: (error as Error & { statusCode?: number }).statusCode || 500,
    };
  }
}

async function videoStatus(body: Record<string, unknown>): Promise<ApiResult> {
  const { taskId } = body as Record<string, unknown>;

  if (!taskId) {
    return {
      success: false,
      error: "missing_task_id",
      code: API_ERROR_CODES.MISSING_TASK_ID,
      httpStatus: 400,
    };
  }

  if (!/^[a-zA-Z0-9_\-.:]+$/.test(taskId as string)) {
    return {
      success: false,
      error: "invalid_task_id",
      code: API_ERROR_CODES.INVALID_TASK_ID,
      httpStatus: 400,
    };
  }

  const { effectiveApiUrl, effectiveApiKey, effectiveModel, resolvedPlugin } = await resolveApiConfig(
    body,
    "video",
  );

  if (!effectiveApiKey || !effectiveApiUrl) {
    return {
      success: false,
      error: { code: API_ERROR_CODES.API_NOT_CONFIGURED, message: "video" },
      code: API_ERROR_CODES.API_NOT_CONFIGURED,
      httpStatus: 400,
    };
  }

  const plugin = resolvedPlugin || pluginRegistry.select(effectiveApiUrl, effectiveModel);
  if (!plugin) {
    return { success: false, error: "unknown_provider", code: API_ERROR_CODES.UNKNOWN_PROVIDER, httpStatus: 400 };
  }

  const endpoint = plugin.getVideoStatusEndpoint(effectiveApiUrl, taskId as string, effectiveModel);

  try {
    const statusUrl = plugin.appendAuthToUrl
      ? plugin.appendAuthToUrl(`${effectiveApiUrl}${endpoint}`, effectiveApiKey)
      : `${effectiveApiUrl}${endpoint}`;
    const statusHeaders: Record<string, string> = {
      ...await getAuthHeaders(plugin, effectiveApiKey, endpoint),
    };

    const statusMethod = plugin.getStatusMethod ? plugin.getStatusMethod() : "GET";
    const response = (await withRetry(
      () => makeRequest(statusUrl, {
        method: statusMethod,
        headers: statusHeaders,
        timeout: 30000,
      }),
      { maxRetries: 2, retryableCheck: isRetryableError },
    )) as Record<string, unknown>;

    const statusInfo = await extractStatus(plugin, response);

    const videoUrl: string | undefined = await extractVideoUrl(plugin, response);

    return {
      success: true,
      data: {
        status: statusInfo?.status ?? String((response as Record<string, unknown>).status || "generating"),
        videoUrl,
        progress: statusInfo?.progress,
        message: statusInfo?.message,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
      httpStatus: (error as Error & { statusCode?: number }).statusCode || 500,
    };
  }
}

export {
  generateText,
  generateTextStream,
  generateChat,
  generateChatStream,
  generateEmbedding,
  generateAudio,
  transcribeAudio,
  handleUpload,
  getUploadedFile,
  analyzeImage,
  generateImage,
  generateKeyframe,
  generateFramePair,
  generateVideo,
  videoStatus,
};

/**
 * ApiGateway 适配器：将模块导出函数封装为符合 shared-logic ApiGateway 接口的对象。
 * 避免 route-groups 中使用 `apiGateway as unknown as ApiGateway` 类型断言。
 *
 * 注意：api-gateway 函数返回 ApiResult（data: Record<string, unknown>），
 * 而 ApiGateway 接口期望具体的 data 形状。运行时数据形状兼容，
 * 此适配器通过类型收窄提供编译时类型安全。
 */
export function createApiGatewayAdapter(): import("@shared-logic/story/storyboard-generation").ApiGateway {
  return {
    generateKeyframe: async (params) => {
      const result = await generateKeyframe(params);
      return {
        success: result.success,
        data: result.data as { imageUrl: string; prompt?: string; generatedAt?: string } | undefined,
        error: result.error as import("@shared-logic/story/storyboard-generation").ApiError | undefined,
      };
    },
    generateImage: async (params) => {
      const result = await generateImage(params);
      return {
        success: result.success,
        data: result.data as { imageUrl: string } | undefined,
        error: result.error as import("@shared-logic/story/storyboard-generation").ApiError | undefined,
      };
    },
    generateFramePair: async (params) => {
      const result = await generateFramePair(params);
      return {
        success: result.success,
        data: result.data as {
          firstFrame: { imageUrl: string; prompt?: string };
          lastFrame: { imageUrl: string; prompt?: string };
          generatedAt: number;
        } | undefined,
        error: result.error as import("@shared-logic/story/storyboard-generation").ApiError | undefined,
      };
    },
    generateVideo: async (params) => {
      const result = await generateVideo(params);
      return {
        success: result.success,
        data: result.data as { taskId: string; videoUrl?: string; status?: string } | undefined,
        error: result.error as import("@shared-logic/story/storyboard-generation").ApiError | undefined,
      };
    },
    analyzeImage: async (params) => {
      const result = await analyzeImage(params);
      return {
        success: result.success,
        data: result.data as { analysis?: string } | undefined,
        error: result.error as import("@shared-logic/story/storyboard-generation").ApiError | undefined,
      };
    },
    videoStatus: async (params) => {
      const result = await videoStatus(params);
      return {
        success: result.success,
        data: result.data as { status?: string; videoUrl?: string } | undefined,
        error: result.error as import("@shared-logic/story/storyboard-generation").ApiError | undefined,
      };
    },
  };
}
