import { apiCallWithRetry, ApiClientError } from "./core";
import { resolveCapability, safeTruncatePrompt } from "./config";
import { imageToBase64 } from "./utils";
import type { ApiResponse, EnhancedVideoGenerationParams, VideoGenerationResult } from "@/domain/schemas";
import { generateVideo } from "./video-service";
import { errorLogger, extractErrorMessage } from "@/shared/error-logger";

const DEFAULT_CONSISTENCY_STRENGTH = 0.8;

export async function generateEnhancedVideo(
  params: EnhancedVideoGenerationParams,
): Promise<ApiResponse<VideoGenerationResult>> {
  const isFeatureAnchored = params.featureAnchoring?.enabled;

  let fixedImageBase64: string | undefined;
  if (
    !isFeatureAnchored &&
    params.fixedImage?.enabled &&
    params.fixedImage.imageUrl
  ) {
    try {
      if (typeof window !== "undefined") {
        fixedImageBase64 = await imageToBase64(params.fixedImage.imageUrl);
      } else {
        fixedImageBase64 = params.fixedImage.imageUrl;
      }
    } catch {
      errorLogger.warn(
        { code: "ENHANCED_VIDEO_IMAGE_TO_BASE64_FAILED", message: "固定形象图转 base64 失败，使用原始 URL" },
        "EnhancedVideo",
      );
      fixedImageBase64 = params.fixedImage.imageUrl;
    }
  }

  let featureAnchorImageBase64: string | undefined;
  if (isFeatureAnchored) {
    const allAnchors = [
      ...(params.featureAnchoring?.characterAnchors || []),
      ...(params.featureAnchoring?.propAnchors || []),
    ];
    const primaryAnchor = allAnchors[0];
    const anchorImageUrl =
      primaryAnchor?.referenceImageUrl ||
      params.featureAnchoring?.previewImageUrl;
    if (anchorImageUrl) {
      try {
        if (typeof window !== "undefined") {
          featureAnchorImageBase64 = await imageToBase64(anchorImageUrl);
        } else {
          featureAnchorImageBase64 = anchorImageUrl;
        }
      } catch {
        errorLogger.warn(
        { code: "ENHANCED_VIDEO_ANCHOR_IMAGE_TO_BASE64_FAILED", message: "特征锚定图转 base64 失败，使用原始 URL" },
        "EnhancedVideo",
      );
        featureAnchorImageBase64 = anchorImageUrl;
      }
    }
  }

  const { truncated: safePrompt, wasTruncated } = safeTruncatePrompt(params.prompt);

  const requestBody: Record<string, unknown> = {
    prompt: safePrompt,
    duration: params.duration ?? 5,
    promptWasTruncated: wasTruncated,
  };

  if (isFeatureAnchored && featureAnchorImageBase64) {
    requestBody.firstFrameUrl = featureAnchorImageBase64;
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

  if (params.providerId && params.modelId) {
    requestBody.providerId = params.providerId;
    requestBody.modelId = params.modelId;
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
      result.data.originalPromptLength = params.prompt.length;
    }
    return result;
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    throw new Error(extractErrorMessage(error));
  }
}

export { generateVideo };