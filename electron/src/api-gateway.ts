import { getLogger } from "./logging/logger";
import { pluginRegistry } from "./plugins";
import { API_ERROR_CODES } from "./api-gateway-error-codes";
import {
  type ApiResult,
  resolveApiConfig,
  buildVideoRequest,
  getAuthHeaders,
  makeRequest,
  extractTaskId,
  extractVideoUrl,
  extractStatus,
  handleUpload,
  getUploadedFile,
} from "./api-gateway-utils";
import {
  generateImage,
  generateKeyframe,
  generateFramePair,
  analyzeImage,
} from "./api-gateway-image";
import { withRetry, isRetryableError } from "./api-gateway-retry";

const logger = getLogger("api-gateway");

async function generateText(body: Record<string, unknown>): Promise<ApiResult> {
  const { prompt, maxTokens, temperature } = body as Record<string, unknown>;
  const { effectiveApiUrl, effectiveApiKey, effectiveModel, resolvedPlugin } = await resolveApiConfig(
    body,
    "text",
  );

  if (!effectiveApiKey) {
    return {
      success: false,
      error: { code: API_ERROR_CODES.API_NOT_CONFIGURED, message: "text" },
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

  const safeMaxTokens = Math.min(Math.max(1, (maxTokens as number) || 4096), 16384);
  const safeTemperature = Math.min(Math.max(0, (temperature as number) ?? 0.7), 2);

  try {
    const plugin = resolvedPlugin || pluginRegistry.select(effectiveApiUrl || "", effectiveModel);
    if (!plugin) {
      return { success: false, error: "unknown_provider", code: API_ERROR_CODES.UNKNOWN_PROVIDER, httpStatus: 400 };
    }

    const { body: reqBody, endpoint } = plugin.buildTextRequest({
      prompt: prompt as string,
      model: effectiveModel,
      maxTokens: safeMaxTokens,
      temperature: safeTemperature,
    });

    const requestUrl = plugin.appendAuthToUrl
      ? plugin.appendAuthToUrl(`${effectiveApiUrl}${endpoint}`, effectiveApiKey)
      : `${effectiveApiUrl}${endpoint}`;
    const requestHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...await getAuthHeaders(plugin, effectiveApiKey, endpoint),
    };

    const response = (await withRetry(
      () => makeRequest(requestUrl, {
        method: "POST",
        headers: requestHeaders,
        body: JSON.stringify(reqBody),
      }),
      { maxRetries: 1, retryableCheck: isRetryableError },
    )) as Record<string, unknown>;

    const text = plugin.extractTextContent
      ? plugin.extractTextContent(response)
      : ((((response.choices as Record<string, unknown>[])?.[0] as Record<string, unknown>)?.message as Record<string, unknown>)?.content as string) || "";

    return { success: true, data: { text } };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
      httpStatus: (error as Error & { statusCode?: number }).statusCode || 500,
    };
  }
}

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

  const referenceVideoUrl = rawReferenceVideo
    ? typeof rawReferenceVideo === "object"
      ? ((rawReferenceVideo as Record<string, unknown>).videoUrl as string | undefined)
      : (rawReferenceVideo as string)
    : undefined;
  const referenceVideoMimicryLevel = rawReferenceVideo && typeof rawReferenceVideo === "object"
    ? ((rawReferenceVideo as Record<string, unknown>).mimicryLevel as string | undefined)
    : undefined;
  const effectiveMimicryLevel = referenceVideoMimicryLevel || (mimicryLevel as string | undefined);

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

  const safeDuration = Math.min(
    Math.max((duration as number) || 5, 1),
    plugin.videoCapabilities.maxDuration,
  );

  const apiConfig = { apiKey: effectiveApiKey, apiUrl: effectiveApiUrl || "" };

  const effectiveFirstFrame = await plugin.prepareImage(
    (firstFrameUrl as string) || (bodyImageUrl as string),
    "firstFrame",
    apiConfig,
  );

  const effectiveLastFrame = plugin.videoCapabilities.supportsLastFrame
    ? await plugin.prepareImage(lastFrameUrl as string, "lastFrame", apiConfig)
    : undefined;

  if (lastFrameUrl && !plugin.videoCapabilities.supportsLastFrame) {
    logger.warn(
      `Provider ${plugin.id} does not support last frame, ignoring lastFrameUrl`,
    );
  }

  const isLocalRefVideo = referenceVideoUrl && (
    referenceVideoUrl.startsWith("blob:") ||
    referenceVideoUrl.startsWith("data:") ||
    referenceVideoUrl.startsWith("file://") ||
    referenceVideoUrl.startsWith("/") ||
    referenceVideoUrl.startsWith("vcache://")
  );
  const effectiveRefVideoUrl = isLocalRefVideo
    ? await plugin.prepareImage(referenceVideoUrl, "referenceVideo", apiConfig)
    : referenceVideoUrl;

  const effectiveCharacterRefs: string[] = [];
  if (plugin.videoCapabilities.supportsCharacterRef !== false) {
    const rawRefs = (Array.isArray(characterRefsRaw) ? characterRefsRaw : characterRefRaw ? [characterRefRaw] : []) as string[];
    const maxRefs = plugin.videoCapabilities.maxCharacterRefs ?? rawRefs.length;
    const limitedRefs = rawRefs.slice(0, maxRefs);
    for (const ref of limitedRefs) {
      const prepared = await plugin.prepareImage(ref, "characterRef", apiConfig);
      if (prepared) effectiveCharacterRefs.push(prepared);
    }
    if (rawRefs.length > maxRefs) {
      logger.warn(`Provider ${plugin.id} supports max ${maxRefs} character refs, ${rawRefs.length} provided, truncating`);
    }
  } else if (characterRefsRaw || characterRefRaw) {
    logger.warn(`Provider ${plugin.id} does not support characterRef, ignoring`);
  }

  let effectiveSceneRef: string | undefined;
  if (sceneRef && plugin.videoCapabilities.supportsSceneRef !== false) {
    effectiveSceneRef = await plugin.prepareImage(sceneRef as string, "sceneRef", apiConfig);
  }

  if (sceneRef && plugin.videoCapabilities.supportsSceneRef === false) {
    logger.warn(`Provider ${plugin.id} does not support sceneRef, ignoring`);
  }

  let reqBody: unknown;
  let endpoint: string;
  let extraHeaders: Record<string, string> | undefined;

  try {
    ({ body: reqBody, endpoint, extraHeaders } = await buildVideoRequest(plugin, {
      prompt: prompt as string,
      model: effectiveModel,
      firstFrameUrl: effectiveFirstFrame,
      lastFrameUrl: effectiveLastFrame,
      referenceVideoUrl: effectiveRefVideoUrl,
      referenceVideoMimicryLevel: effectiveMimicryLevel,
      duration: safeDuration,
      characterRefs: effectiveCharacterRefs.length > 0 ? effectiveCharacterRefs : undefined,
      characterRef: effectiveCharacterRefs.length > 0 ? effectiveCharacterRefs[0] : undefined,
      sceneRef: effectiveSceneRef,
    }));
  } catch (e) {
    logger.error("Video buildRequest error", e instanceof Error ? e : undefined);
    return {
      ok: false,
      success: false,
      error: { code: API_ERROR_CODES.PLUGIN_ERROR, message: (e as Error).message },
      code: API_ERROR_CODES.PLUGIN_ERROR,
      httpStatus: 500,
    };
  }

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
        retryableCheck: (error) => {
          if (!(error instanceof Error)) return false;
          const httpStatus = (error as Error & { statusCode?: number }).statusCode;
          if (httpStatus !== undefined) {
            return httpStatus === 429 || httpStatus >= 502;
          }
          return isRetryableError(error);
        },
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
