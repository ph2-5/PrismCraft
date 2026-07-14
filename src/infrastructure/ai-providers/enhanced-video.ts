import { apiCallWithRetry, ApiClientError } from "./core";
import { resolveCapability, safeTruncatePrompt } from "./config";
import { imageToBase64 } from "./utils";
import type { ApiResponse, EnhancedVideoGenerationParams, VideoGenerationResult } from "@/domain/schemas";
import { generateVideo } from "./video-service";
import { errorLogger, extractErrorMessage } from "@/shared/error-logger";
import { t } from "@/shared/constants";

const DEFAULT_CONSISTENCY_STRENGTH = 0.8;

// ============= 辅助函数（内部使用，不导出） =============

/** 将图片 URL 转为 Base64（浏览器环境），主进程直接返回 URL；失败时回退到原 URL */
async function convertImageToBase64Safe(
  imageUrl: string,
  errorCode: string,
  errorMessage: string,
): Promise<string> {
  try {
    if (typeof window !== "undefined") {
      return await imageToBase64(imageUrl);
    }
    return imageUrl;
  } catch {
    errorLogger.warn(
      { code: errorCode, message: errorMessage },
      "EnhancedVideo",
    );
    return imageUrl;
  }
}

/** 解析固定图片的 Base64（仅在未启用特征锚定时生效） */
async function resolveFixedImage(
  params: EnhancedVideoGenerationParams,
  isFeatureAnchored: boolean,
): Promise<string | undefined> {
  if (isFeatureAnchored || !params.fixedImage?.enabled || !params.fixedImage.imageUrl) {
    return undefined;
  }
  return await convertImageToBase64Safe(
    params.fixedImage.imageUrl,
    "ENHANCED_VIDEO_IMAGE_TO_BASE64_FAILED",
    t("error.fixedImageBase64Failed"),
  );
}

/** 解析特征锚定主图的 Base64 */
async function resolveFeatureAnchorImage(
  params: EnhancedVideoGenerationParams,
): Promise<string | undefined> {
  const allAnchors = [
    ...(params.featureAnchoring?.characterAnchors || []),
    ...(params.featureAnchoring?.propAnchors || []),
  ];
  const primaryAnchor = allAnchors[0];
  const anchorImageUrl =
    primaryAnchor?.referenceImageUrl ||
    params.featureAnchoring?.previewImageUrl;
  if (!anchorImageUrl) return undefined;
  return await convertImageToBase64Safe(
    anchorImageUrl,
    "ENHANCED_VIDEO_ANCHOR_IMAGE_TO_BASE64_FAILED",
    t("error.featureAnchorBase64Failed"),
  );
}

/** 将图片锚定信息写入 requestBody（特征锚定优先于固定图片） */
function applyImageAnchorToBody(
  requestBody: Record<string, unknown>,
  params: EnhancedVideoGenerationParams,
  isFeatureAnchored: boolean,
  featureAnchorBase64: string | undefined,
  fixedImageBase64: string | undefined,
): void {
  if (isFeatureAnchored && featureAnchorBase64) {
    requestBody.firstFrameUrl = featureAnchorBase64;
    requestBody.featureAnchoring = {
      enabled: true,
      disableFrameBinding: true,
      featureConsistencyStrength:
        params.featureAnchoring?.featureConsistencyStrength ?? DEFAULT_CONSISTENCY_STRENGTH,
      characterAnchors: params.featureAnchoring?.characterAnchors.map((a) => ({
        elementId: a.elementId,
        featureTags: a.featureTags,
        weight: a.weight,
      })),
      previewImageUrl: params.featureAnchoring?.previewImageUrl,
    };
  } else if (params.fixedImage?.enabled && fixedImageBase64) {
    requestBody.fixedImage = {
      imageUrl: fixedImageBase64,
      lockType: params.fixedImage.lockType,
    };
  }
}

/** 将可选字段（参考视频、模板）写入 requestBody */
function applyOptionalBodyFields(
  requestBody: Record<string, unknown>,
  params: EnhancedVideoGenerationParams,
): void {
  if (params.referenceVideo?.enabled && params.referenceVideo.videoUrl) {
    requestBody.referenceVideo = {
      enabled: true,
      videoUrl: params.referenceVideo.videoUrl,
      mimicryLevel: params.referenceVideo.mimicryLevel,
    };
  }
  if (params.template?.enabled) {
    requestBody.template = params.template;
  }
}

/** 解析 provider/model：优先使用参数指定的，否则自动解析 */
async function resolveProviderModel(
  requestBody: Record<string, unknown>,
  params: EnhancedVideoGenerationParams,
): Promise<void> {
  if (params.providerId && params.modelId) {
    requestBody.providerId = params.providerId;
    requestBody.modelId = params.modelId;
  } else {
    const { provider, model } = await resolveCapability("video");
    requestBody.providerId = provider.id;
    requestBody.modelId = model.id;
  }
}

export async function generateEnhancedVideo(
  params: EnhancedVideoGenerationParams,
): Promise<ApiResponse<VideoGenerationResult>> {
  const isFeatureAnchored = Boolean(params.featureAnchoring?.enabled);

  const fixedImageBase64 = await resolveFixedImage(params, isFeatureAnchored);
  const featureAnchorImageBase64 = isFeatureAnchored
    ? await resolveFeatureAnchorImage(params)
    : undefined;

  const { truncated: safePrompt, wasTruncated } = safeTruncatePrompt(params.prompt);

  const requestBody: Record<string, unknown> = {
    prompt: safePrompt,
    duration: params.duration ?? 5,
    promptWasTruncated: wasTruncated,
  };

  applyImageAnchorToBody(
    requestBody,
    params,
    isFeatureAnchored,
    featureAnchorImageBase64,
    fixedImageBase64,
  );
  applyOptionalBodyFields(requestBody, params);
  await resolveProviderModel(requestBody, params);

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
      result.data.originalPromptLength = params.prompt.length;
    }
    return result;
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    throw new Error(extractErrorMessage(error));
  }
}

export { generateVideo };