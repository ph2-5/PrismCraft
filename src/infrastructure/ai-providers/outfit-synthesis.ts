import type { ApiResponse } from "@/domain/schemas";
import { apiCallWithRetry } from "./core";
import { ApiClientError } from "./errors";
import { resolveCapability, safeTruncatePrompt } from "./config";
import { extractErrorMessage } from "@/shared/error-logger";

export interface OutfitSynthesisParams {
  characterImageUrl: string;
  outfitDescription: string;
  outfitImageUrl?: string;
  characterName?: string;
  style?: string;
  preserveFeatures?: string[];
}

export interface OutfitSynthesisResult {
  imageUrl: string;
  originalCharacterImage: string;
  outfitDescription: string;
}

function buildOutfitSynthesisPrompt(params: OutfitSynthesisParams): string {
  const {
    characterName,
    outfitDescription,
    style,
    preserveFeatures = [],
  } = params;

  const namePart = characterName ? `角色"${characterName}"` : "该角色";
  const stylePart = style ? `，保持${style}风格` : "";

  const preservePart =
    preserveFeatures.length > 0
      ? `必须严格保留以下特征：${preserveFeatures.join("、")}。`
      : "";

  const outfitImagePart = params.outfitImageUrl
    ? `参考右侧服装图片的风格和款式，`
    : "";

  return `${outfitImagePart}为${namePart}换装：${outfitDescription}${stylePart}。${preservePart}要求：
1. 保持角色的面部特征、发型、体型完全一致
2. 只改变服装和配饰，不改变角色本身
3. 服装要贴合角色身体，自然合理
4. 保持整体风格统一
5. 全身立绘，白色背景
6. 高质量，细节清晰`;
}

export async function synthesizeOutfit(
  params: OutfitSynthesisParams,
  options?: {
    size?: string;
    providerId?: string;
    modelId?: string;
  },
): Promise<ApiResponse<OutfitSynthesisResult>> {
  try {
    const prompt = buildOutfitSynthesisPrompt(params);
    const { truncated: safePrompt } = safeTruncatePrompt(prompt);

    const requestBody: Record<string, unknown> = {
      prompt: safePrompt,
      type: "outfit-synthesis",
      size: options?.size || "1920x1920",
      referenceImageUrl: params.outfitImageUrl,
      characterImageUrl: params.characterImageUrl,
    };

    if (options?.providerId && options?.modelId) {
      requestBody.providerId = options.providerId;
      requestBody.modelId = options.modelId;
    } else {
      const { provider, model } = await resolveCapability("image");
      requestBody.providerId = provider.id;
      requestBody.modelId = model.id;
    }

    const result = await apiCallWithRetry<
      ApiResponse<{
        imageUrl: string;
        originalCharacterImage: string;
        outfitDescription: string;
      }>
    >("generate-image", {
      method: "POST",
      body: JSON.stringify(requestBody),
    });

    return result;
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    throw new Error(extractErrorMessage(error));
  }
}

export async function batchSynthesizeOutfits(
  characterImageUrl: string,
  outfits: Array<{
    outfitId: string;
    outfitName: string;
    outfitDescription: string;
    outfitImageUrl?: string;
  }>,
  options?: {
    characterName?: string;
    style?: string;
    preserveFeatures?: string[];
    onProgress?: (completed: number, total: number) => void;
  },
): Promise<
  Array<{
    outfitId: string;
    imageUrl: string;
    success: boolean;
    error?: string;
  }>
> {
  const results: Array<{
    outfitId: string;
    imageUrl: string;
    success: boolean;
    error?: string;
  }> = [];

  for (let i = 0; i < outfits.length; i++) {
    const outfit = outfits[i];
    try {
      const result = await synthesizeOutfit({
        characterImageUrl,
        outfitDescription: outfit.outfitDescription,
        outfitImageUrl: outfit.outfitImageUrl,
        characterName: options?.characterName,
        style: options?.style,
        preserveFeatures: options?.preserveFeatures,
      });

      if (result.success && result.data) {
        results.push({
          outfitId: outfit.outfitId,
          imageUrl: result.data.imageUrl,
          success: true,
        });
      } else {
        results.push({
          outfitId: outfit.outfitId,
          imageUrl: "",
          success: false,
          error: result.error || "合成失败",
        });
      }
    } catch (error) {
      results.push({
        outfitId: outfit.outfitId,
        imageUrl: "",
        success: false,
        error: (error as Error).message,
      });
    }

    options?.onProgress?.(i + 1, outfits.length);
  }

  return results;
}
