import type { ApiResponse, ImageGenerationResult } from "@/domain/schemas";
import { apiCallWithRetry } from "./core";
import { ApiClientError } from "./errors";
import { resolveCapability, safeTruncatePrompt } from "./config";
import { imageToBase64 as normalizeImageToBase64 } from "@/infrastructure/ai-providers/image-normalization";
import type { ImageGenerationRequestBody } from "./types";
import { errorLogger, extractErrorMessage } from "@/shared/error-logger";
import { resolveImageSize, type ImageSizePurpose } from "./model-capabilities";

async function validateImageSize(
  imageUrl: string,
): Promise<{ width: number; height: number }> {
  if (typeof window !== "undefined" && window.Image) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const cleanup = () => {
        img.onload = null;
        img.onerror = null;
        img.src = "";
      };
      img.onload = () => {
        resolve({ width: img.width, height: img.height });
        cleanup();
      };
      img.onerror = () => {
        reject(new Error("图片加载失败，无法验证尺寸"));
        cleanup();
      };
      img.src = imageUrl;
    });
  }
  return { width: 14, height: 14 };
}

export async function generateImage(
  prompt: string,
  type: string = "character",
  options?: {
    size?: string;
    providerId?: string;
    modelId?: string;
    purpose?: ImageSizePurpose;
  },
): Promise<ApiResponse<ImageGenerationResult>> {
  try {
    const { truncated: safePrompt, wasTruncated } = safeTruncatePrompt(prompt);

    let resolvedProviderId = options?.providerId;
    let resolvedModelId = options?.modelId;

    if (!resolvedProviderId || !resolvedModelId) {
      const { provider, model } = await resolveCapability("image");
      resolvedProviderId = provider.id;
      resolvedModelId = model.id;
    }

    const resolvedSize = resolveImageSize(
      resolvedModelId,
      options?.purpose || (type as ImageSizePurpose),
      options?.size,
    );

    const requestBody: ImageGenerationRequestBody = {
      prompt: safePrompt,
      type,
      size: resolvedSize,
      promptWasTruncated: wasTruncated,
      providerId: resolvedProviderId,
      modelId: resolvedModelId,
    };

    const result = await apiCallWithRetry<ApiResponse<ImageGenerationResult>>(
      "generate-image",
      {
        method: "POST",
        body: JSON.stringify(requestBody),
      },
    );

    return result;
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    throw new Error(extractErrorMessage(error));
  }
}

export async function analyzeImage(
  imageUrl: string,
  type: "character" | "scene" = "character",
  prompt?: string,
  options?: {
    providerId?: string;
    modelId?: string;
  },
): Promise<
  ApiResponse<{
    analysis: string;
    analyzed?: Record<string, unknown>;
  }>
> {
  try {
    const { width, height } = await validateImageSize(imageUrl);
    const MIN_SIZE = 14;

    if (width < MIN_SIZE || height < MIN_SIZE) {
      return {
        success: false,
        error: `图片尺寸过小。最小允许尺寸: ${MIN_SIZE}像素。当前尺寸: 宽度 = ${width}, 高度 = ${height}。`,
        data: undefined,
      };
    }
  } catch (error) {
    errorLogger.warn("图片尺寸验证失败:", error);
  }

  let finalImageUrl = imageUrl;
  try {
    if (typeof window !== "undefined") {
      finalImageUrl = await normalizeImageToBase64(imageUrl);
    }
  } catch (error) {
    errorLogger.warn("图片转 base64 失败，使用原始 URL:", error);
  }

  try {
    const analysisPrompt =
      prompt ||
      (type === "character"
        ? `请分析这张图片中的角色，提取角色信息。`
        : `请分析这张图片中的场景，提取场景信息。`);

    const requestBody: Record<string, unknown> = {
      imageUrl: finalImageUrl,
      prompt: analysisPrompt,
      type,
      providerId: options?.providerId,
      modelId: options?.modelId,
    };

    const result = await apiCallWithRetry<
      ApiResponse<{
        analysis: string;
        analyzed?: Record<string, unknown>;
      }>
    >("analyze-image", {
      method: "POST",
      body: JSON.stringify(requestBody),
    });

    return result;
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    throw new Error((error as Error).message);
  }
}
