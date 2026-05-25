import { apiCallWithRetry, ApiClientError, getErrorMessage } from "./core";
import { resolveCapability } from "./config";
import { generateText } from "./text";
import { generateImage, analyzeImage } from "./image";
import { generateVideo } from "./video";
import type { ApiResponse, VideoGenerationResult } from "@/domain/schemas";
import { extractErrorMessage } from "@/shared/error-logger";

export async function generateVideoWithMultiAPI(
  prompt: string,
  options?: {
    duration?: number;
    textProviderId?: string;
    textModelId?: string;
    imageProviderId?: string;
    imageModelId?: string;
    visionProviderId?: string;
    visionModelId?: string;
    videoProviderId?: string;
    videoModelId?: string;
    onProgress?: (step: string, progress: number) => void;
  },
): Promise<ApiResponse<VideoGenerationResult>> {
  try {
    options?.onProgress?.("生成视频描述", 0.1);
    const descriptionResponse = await generateText(
      `请根据以下提示生成详细的视频描述，包括场景、角色、动作和情感：\n${prompt}\n\n要求：\n1. 描述要详细具体\n2. 适合用于视频生成\n3. 控制在200字以内`,
      {
        maxTokens: 500,
        temperature: 0.7,
        providerId: options?.textProviderId,
        modelId: options?.textModelId,
      },
    );

    if (!descriptionResponse.data?.text) {
      throw new Error("生成视频描述失败");
    }

    const detailedDescription = descriptionResponse.data.text;
    options?.onProgress?.("生成视频描述", 0.25);

    options?.onProgress?.("生成视频素材", 0.3);
    const imageResponse = await generateImage(
      `根据以下描述生成一张高质量的视频封面图：\n${detailedDescription}\n\n要求：\n1. 画面精美，适合作为视频素材\n2. 清晰的主体和背景\n3. 符合描述的场景和氛围`,
      "scene",
      {
        providerId: options?.imageProviderId,
        modelId: options?.imageModelId,
      },
    );

    if (!imageResponse.data?.imageUrl) {
      throw new Error("生成视频素材图片失败");
    }

    const imageUrl = imageResponse.data.imageUrl;
    options?.onProgress?.("生成视频素材", 0.5);

    options?.onProgress?.("分析素材内容", 0.55);
    const analysisResponse = await analyzeImage(
      imageUrl,
      "scene",
      `请分析这张图片的内容，包括：\n1. 场景类型\n2. 主要元素\n3. 色彩风格\n4. 适合的视频风格和节奏`,
      {
        providerId: options?.visionProviderId,
        modelId: options?.visionModelId,
      },
    );

    if (!analysisResponse.data?.analysis) {
      throw new Error("分析素材内容失败");
    }

    const analysis = analysisResponse.data.analysis;
    options?.onProgress?.("分析素材内容", 0.7);

    options?.onProgress?.("生成视频", 0.75);
    const videoResponse = await generateVideo(
      `${detailedDescription}\n\n视频风格参考：${analysis}`,
      {
        firstFrameUrl: imageUrl,
        duration: options?.duration || 5,
        providerId: options?.videoProviderId,
        modelId: options?.videoModelId,
      },
    );

    options?.onProgress?.("生成视频", 1.0);

    return videoResponse;
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    throw new Error(extractErrorMessage(error));
  }
}

export async function testConnection(
  capability: import("@/infrastructure/ai-providers/api-config/types").ApiCapability,
  providerId?: string,
  modelId?: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const { provider, model } = await resolveCapability(
      capability,
      undefined,
      providerId,
      modelId,
    );

    const response = await apiCallWithRetry<{
      success: boolean;
      error?: string;
    }>("test-connection", {
      method: "POST",
      body: JSON.stringify({
        capability,
        providerId: provider.id,
        modelId: model.id,
      }),
    });

    return {
      success: response.success,
      message: response.success ? "连接成功" : response.error || "未知错误",
    };
  } catch (error) {
    return {
      success: false,
      message: getErrorMessage(error),
    };
  }
}
