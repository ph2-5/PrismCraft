import { getLogger } from "./logging/logger";
import { pluginRegistry } from "./plugins";
import { extractJsonObject } from "@shared-logic/json";
import { API_ERROR_CODES } from "./api-gateway-error-codes";
import {
  type ApiResult,
  resolveApiConfig,
  buildImageRequest,
  getAuthHeaders,
  makeRequest,
  extractImageUrl,
  cacheRemoteImageLocally,
} from "./api-gateway-utils";

const logger = getLogger("api-gateway-image");

async function analyzeImage(body: Record<string, unknown>): Promise<ApiResult> {
  const { imageUrl, prompt, type } = body as Record<string, unknown>;
  const { effectiveApiUrl, effectiveApiKey, effectiveModel, resolvedPlugin } = await resolveApiConfig(
    body,
    "vision",
  );

  if (!effectiveApiKey) {
    return {
      success: false,
      error: { code: API_ERROR_CODES.API_NOT_CONFIGURED, message: "vision" },
      code: API_ERROR_CODES.API_NOT_CONFIGURED,
      httpStatus: 400,
    };
  }

  const defaultPrompt =
    type === "character"
      ? `分析这张图片中的角色，提取以下信息并以 JSON 格式返回：
{
  "name": "角色名称",
  "gender": "性别",
  "age": "年龄数字",
  "style": "艺术风格",
  "personality": ["性格特征1", "性格特征2"],
  "appearance": {
    "hairColor": "发色",
    "hairStyle": "发型",
    "eyeColor": "眼睛颜色",
    "height": "身高描述",
    "build": "体型",
    "clothing": "服装描述"
  },
  "description": "角色整体描述"
}`
      : `分析这张图片中的场景，提取以下信息并以 JSON 格式返回：
{
  "name": "场景名称",
  "type": "场景类型",
  "timeOfDay": "时间（早晨/中午/傍晚/夜晚）",
  "weather": "天气",
  "mood": "氛围/情绪",
  "elements": ["元素1", "元素2", "元素3"],
  "colorPalette": "色调描述",
  "description": "场景整体描述"
}`;

  try {
    const plugin = resolvedPlugin || pluginRegistry.select(effectiveApiUrl || "", effectiveModel);
    if (!plugin) {
      return { success: false, error: "unknown_provider", code: API_ERROR_CODES.UNKNOWN_PROVIDER, httpStatus: 400 };
    }

    const accessibleImageUrl = await plugin.prepareImage(
      imageUrl as string,
      "analysisTarget",
      { apiKey: effectiveApiKey, apiUrl: effectiveApiUrl || "" },
    ) || (imageUrl as string);

    const { body: reqBody, endpoint } = plugin.buildVisionRequest({
      prompt: (prompt as string) || defaultPrompt,
      model: effectiveModel,
      imageUrl: accessibleImageUrl,
      maxTokens: 4096,
    });

    const requestUrl = plugin.appendAuthToUrl
      ? plugin.appendAuthToUrl(`${effectiveApiUrl}${endpoint}`, effectiveApiKey)
      : `${effectiveApiUrl}${endpoint}`;
    const requestHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...await getAuthHeaders(plugin, effectiveApiKey, endpoint),
    };

    const response = (await makeRequest(requestUrl, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(reqBody),
    })) as Record<string, unknown>;

    const analysis = plugin.extractTextContent
      ? plugin.extractTextContent(response)
      : ((((response.choices as Record<string, unknown>[])?.[0] as Record<string, unknown>)?.message as Record<string, unknown>)?.content as string) || "";

    let analyzed: Record<string, unknown> | null = null;
    const jsonStr = extractJsonObject(analysis);
    if (jsonStr) {
      try {
        analyzed = JSON.parse(jsonStr);
      } catch (e) {
        logger.warn(`Failed to parse JSON from analysis response: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return {
      success: true,
      data: {
        analysis,
        analyzed,
        description: analysis,
        tags: [],
      },
    };
  } catch (error) {
    logger.error("Analyze error", error instanceof Error ? error : undefined);
    return {
      success: false,
      error: (error as Error).message,
      httpStatus: 500,
    };
  }
}

async function generateImage(body: Record<string, unknown>): Promise<ApiResult> {
  const {
    prompt,
    type: _type,
    size = "1024x1024",
    referenceImageUrl,
    characterImageUrl,
    sceneImageUrl,
    previousFrameUrl,
  } = body as Record<string, unknown>;

  const { effectiveApiUrl, effectiveApiKey, effectiveModel, resolvedPlugin } = await resolveApiConfig(
    body,
    "image",
  );

  if (!effectiveApiKey && effectiveApiUrl?.includes("pollinations")) {
    if (!prompt || typeof prompt !== "string") {
      return { success: false, error: "empty_prompt", code: API_ERROR_CODES.EMPTY_PROMPT, httpStatus: 400 };
    }
    const width = (size as string).split("x")[0] || "1024";
    const height = (size as string).split("x")[1] || "1024";
    const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(
      prompt as string,
    )}?width=${width}&height=${height}&seed=${Date.now()}&nologo=true`;

    return { success: true, data: { imageUrl } };
  }

  if (!effectiveApiKey) {
    return {
      success: false,
      error: { code: API_ERROR_CODES.API_NOT_CONFIGURED, message: "image" },
      code: API_ERROR_CODES.API_NOT_CONFIGURED,
      httpStatus: 400,
    };
  }

  const plugin = resolvedPlugin || pluginRegistry.select(effectiveApiUrl || "", effectiveModel);
  if (!plugin) {
    return { success: false, error: "unknown_provider", code: API_ERROR_CODES.UNKNOWN_PROVIDER, httpStatus: 400 };
  }

  const allRefImages = (await Promise.all(
    [referenceImageUrl, characterImageUrl, sceneImageUrl, previousFrameUrl]
      .filter(Boolean)
      .map((url: unknown) => plugin.prepareImage(url as string, "referenceImage", { apiKey: effectiveApiKey, apiUrl: effectiveApiUrl || "" }))
  )).filter((url): url is string => url !== undefined);

  try {
    const { body: reqBody, endpoint } = await buildImageRequest(plugin, {
      prompt: prompt as string,
      model: effectiveModel,
      size: size as string,
      referenceImages: allRefImages,
      characterRef: characterImageUrl as string | undefined,
      sceneRef: sceneImageUrl as string | undefined,
    });

    const requestUrl = plugin.appendAuthToUrl
      ? plugin.appendAuthToUrl(`${effectiveApiUrl}${endpoint}`, effectiveApiKey)
      : `${effectiveApiUrl}${endpoint}`;
    const requestHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...await getAuthHeaders(plugin, effectiveApiKey, endpoint),
    };

    const response = (await makeRequest(requestUrl, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(reqBody),
    })) as Record<string, unknown>;

    const imageUrl = await extractImageUrl(plugin, response);
    if (imageUrl) {
      const localPath = await cacheRemoteImageLocally(imageUrl);
      return { success: true, data: { imageUrl: localPath } };
    } else {
      return { success: false, error: "API 返回格式不正确", httpStatus: 500 };
    }
  } catch (error) {
    logger.error("Image generation error", error instanceof Error ? error : undefined);
    return {
      success: false,
      error: (error as Error).message,
      httpStatus: (error as Error & { statusCode?: number }).statusCode || 500,
    };
  }
}

async function generateKeyframe(body: Record<string, unknown>): Promise<ApiResult> {
  const {
    content,
    prompt,
    size,
    type: _type,
    referenceImageUrl,
    characterRef,
    characterRefs,
    sceneRef,
    characterImageUrl: _legacyCharacterImageUrl,
    sceneImageUrl: _legacySceneImageUrl,
    previousFrameUrl,
    prevKeyframe,
  } = body as Record<string, unknown>;

  const effectiveCharacterRef = characterRef || _legacyCharacterImageUrl || (Array.isArray(characterRefs) && characterRefs.length > 0 ? characterRefs[0] : undefined);
  const effectiveSceneRef = sceneRef || _legacySceneImageUrl;
  const effectivePrevFrame = previousFrameUrl || prevKeyframe;

  const { effectiveApiUrl, effectiveModel, resolvedPlugin } = await resolveApiConfig(
    body,
    "image",
  );

  try {
    const plugin = resolvedPlugin || pluginRegistry.select(effectiveApiUrl || "", effectiveModel);
    if (!plugin) {
      return { success: false, error: "unknown_provider", code: API_ERROR_CODES.UNKNOWN_PROVIDER, httpStatus: 400 };
    }
    const supportsRef = plugin.imageCapabilities.supportsReferenceImage;

    let enrichedPrompt = (content as string) || (prompt as string) || "";

    if (!supportsRef) {
      if (effectiveCharacterRef) enrichedPrompt = `[参考角色] ${enrichedPrompt}`;
      if (effectiveSceneRef) enrichedPrompt = `[参考场景] ${enrichedPrompt}`;
      if (effectivePrevFrame) enrichedPrompt = `[上一帧参考] ${enrichedPrompt}`;
      if (referenceImageUrl) enrichedPrompt = `[参考图] ${enrichedPrompt}`;
      logger.warn("Format does not support reference images, appended to prompt text");
    }

    return generateImage({
      ...body,
      prompt: enrichedPrompt,
      characterImageUrl: supportsRef ? effectiveCharacterRef : undefined,
      sceneImageUrl: supportsRef ? effectiveSceneRef : undefined,
      referenceImageUrl: supportsRef ? referenceImageUrl : undefined,
      previousFrameUrl: supportsRef ? effectivePrevFrame : undefined,
      size: size || "1024x1024",
    });
  } catch (e) {
    logger.error("Keyframe buildRequest error", e instanceof Error ? e : undefined);
    return {
      ok: false,
      success: false,
      error: { code: API_ERROR_CODES.PLUGIN_ERROR, message: (e as Error).message },
      httpStatus: 500,
    };
  }
}

async function generateFramePair(body: Record<string, unknown>): Promise<ApiResult> {
  const {
    prompt,
    firstFramePrompt,
    lastFramePrompt,
    keyframeUrl,
    keyframePrompt,
    characterRef,
    characterRefs,
    sceneRef,
    characterImageUrl: _legacyCharacterImageUrl,
    sceneImageUrl: _legacySceneImageUrl,
    size,
  } = body as Record<string, unknown>;

  const effectiveCharacterRef = characterRef || _legacyCharacterImageUrl || (Array.isArray(characterRefs) && characterRefs.length > 0 ? characterRefs[0] : undefined);
  const effectiveSceneRef = sceneRef || _legacySceneImageUrl;

  const { effectiveApiUrl, effectiveModel, resolvedPlugin } = await resolveApiConfig(
    body,
    "image",
  );

  try {
    const plugin = resolvedPlugin || pluginRegistry.select(effectiveApiUrl || "", effectiveModel);
    if (!plugin) {
      return { success: false, error: "unknown_provider", code: API_ERROR_CODES.UNKNOWN_PROVIDER, httpStatus: 400 };
    }
    const supportsRef = plugin.imageCapabilities.supportsReferenceImage;

    const effectiveKeyframeUrl = supportsRef ? (keyframeUrl as string | undefined) : undefined;
    const effectiveKeyframePrompt = keyframePrompt as string | undefined;

    const firstRef = supportsRef ? effectiveCharacterRef : undefined;
    const secondRef = supportsRef ? effectiveSceneRef : undefined;

    let firstFrameEnrichedPrompt = (firstFramePrompt as string) || `首帧: ${prompt}`;
    let lastFrameEnrichedPrompt = (lastFramePrompt as string) || `尾帧: ${prompt}`;

    if (effectiveKeyframePrompt) {
      const keyframeContext = `\n[预览图提示词参考] ${effectiveKeyframePrompt}`;
      firstFrameEnrichedPrompt += keyframeContext;
      lastFrameEnrichedPrompt += keyframeContext;
    }

    if (!supportsRef) {
      if (effectiveCharacterRef) {
        firstFrameEnrichedPrompt = `[参考角色] ${firstFrameEnrichedPrompt}`;
        lastFrameEnrichedPrompt = `[参考角色] ${lastFrameEnrichedPrompt}`;
      }
      if (effectiveSceneRef) {
        firstFrameEnrichedPrompt = `[参考场景] ${firstFrameEnrichedPrompt}`;
        lastFrameEnrichedPrompt = `[参考场景] ${lastFrameEnrichedPrompt}`;
      }
      if (keyframeUrl) {
        firstFrameEnrichedPrompt = `[参考预览图 ${keyframeUrl}] ${firstFrameEnrichedPrompt}`;
        lastFrameEnrichedPrompt = `[参考预览图 ${keyframeUrl}] ${lastFrameEnrichedPrompt}`;
      }
    }

    const firstResult = await generateImage({
      ...body,
      prompt: firstFrameEnrichedPrompt,
      characterImageUrl: firstRef,
      sceneImageUrl: secondRef,
      referenceImageUrl: effectiveKeyframeUrl,
      size: size || "1024x1024",
    });

    if (!firstResult.success) {
      return firstResult;
    }

    const lastResult = await generateImage({
      ...body,
      prompt: lastFrameEnrichedPrompt,
      characterImageUrl: firstRef,
      sceneImageUrl: secondRef,
      referenceImageUrl: effectiveKeyframeUrl,
      size: size || "1024x1024",
    });

    return {
      success: true,
      data: {
        firstFrameUrl: (firstResult.data as Record<string, unknown>)?.imageUrl,
        lastFrameUrl: lastResult.success ? (lastResult.data as Record<string, unknown>)?.imageUrl : null,
        lastFrameError: lastResult.success ? null : lastResult.error,
      },
    };
  } catch (e) {
    logger.error("FramePair buildRequest error", e instanceof Error ? e : undefined);
    return {
      ok: false,
      success: false,
      error: { code: API_ERROR_CODES.PLUGIN_ERROR, message: (e as Error).message },
      httpStatus: 500,
    };
  }
}

export {
  analyzeImage,
  generateImage,
  generateKeyframe,
  generateFramePair,
};
