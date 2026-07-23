/**
 * Audio Provider 实现
 *
 * 通过本地 Electron HTTP 服务调用 OpenAI 兼容的音频接口：
 * - `/api/generate-audio` (TTS)：转发到 `/audio/speech`
 * - `/api/transcribe-audio` (STT)：转发到 `/audio/transcriptions`
 *
 * 设计要点：
 * - TTS 返回音频二进制，由 api-gateway 落盘到本地缓存后返回 URL
 * - STT 接收音频 URL，由 api-gateway 下载后转写
 * - 音色/格式等参数透传，未配置时使用 provider 默认值
 */
import type { ApiResponse } from "@/domain/schemas/api";
import { apiCallWithRetry } from "./core";
import { ApiClientError } from "./errors";
import { resolveCapability } from "./config";
import { extractErrorMessage } from "@/shared/error-logger";
import { GenerationError } from "@/domain/types/result";

interface TtsRequestBody {
  text: string;
  voice?: string;
  format?: string;
  speed?: number;
  providerId?: string;
  modelId?: string;
}

interface TtsResponse {
  audioUrl?: string;
  duration?: number;
}

interface SttRequestBody {
  audioUrl: string;
  language?: string;
  providerId?: string;
  modelId?: string;
}

interface SttResponse {
  text?: string;
  segments?: Array<{ start: number; end: number; text: string }>;
}

/**
 * 文字转语音（TTS）
 *
 * @returns audioUrl 本地缓存 URL（由 api-gateway 落盘到 cache 目录）
 */
export async function synthesizeSpeech(
  text: string,
  options?: {
    voice?: string;
    format?: string;
    speed?: number;
    providerId?: string;
    modelId?: string;
  },
): Promise<ApiResponse<{ audioUrl: string; duration?: number }>> {
  try {
    if (!text || text.trim().length === 0) {
      return { success: false, error: "empty_text" };
    }

    const requestBody: TtsRequestBody = { text };

    if (options?.voice) requestBody.voice = options.voice;
    if (options?.format) requestBody.format = options.format;
    if (typeof options?.speed === "number") requestBody.speed = options.speed;

    if (options?.providerId && options?.modelId) {
      requestBody.providerId = options.providerId;
      requestBody.modelId = options.modelId;
    } else {
      const { provider, model } = await resolveCapability("audio");
      requestBody.providerId = provider.id;
      requestBody.modelId = model.id;
    }

    const result = await apiCallWithRetry<ApiResponse<TtsResponse>>(
      "generate-audio",
      {
        method: "POST",
        body: JSON.stringify(requestBody),
      },
    );

    if (!result.success) {
      return { success: false, error: result.error, message: result.message };
    }

    const audioUrl = result.data?.audioUrl;
    if (!audioUrl) {
      return {
        success: false,
        error: "tts_response_invalid: missing audioUrl",
      };
    }

    return {
      success: true,
      data: { audioUrl, duration: result.data.duration },
    };
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    throw new GenerationError(extractErrorMessage(error), "text");
  }
}

/**
 * 语音转文字（STT / 转写）
 *
 * @param audioUrl 音频文件 URL（本地路径或远程 URL）
 */
export async function transcribeAudio(
  audioUrl: string,
  options?: {
    language?: string;
    providerId?: string;
    modelId?: string;
  },
): Promise<ApiResponse<{ text: string; segments?: Array<{ start: number; end: number; text: string }> }>> {
  try {
    if (!audioUrl) {
      return { success: false, error: "empty_audio_url" };
    }

    const requestBody: SttRequestBody = { audioUrl };

    if (options?.language) requestBody.language = options.language;

    if (options?.providerId && options?.modelId) {
      requestBody.providerId = options.providerId;
      requestBody.modelId = options.modelId;
    } else {
      const { provider, model } = await resolveCapability("audio");
      requestBody.providerId = provider.id;
      requestBody.modelId = model.id;
    }

    const result = await apiCallWithRetry<ApiResponse<SttResponse>>(
      "transcribe-audio",
      {
        method: "POST",
        body: JSON.stringify(requestBody),
      },
    );

    if (!result.success) {
      return { success: false, error: result.error, message: result.message };
    }

    const text = result.data?.text;
    if (typeof text !== "string") {
      return {
        success: false,
        error: "stt_response_invalid: missing text",
      };
    }

    return {
      success: true,
      data: { text, segments: result.data.segments },
    };
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    throw new GenerationError(extractErrorMessage(error), "text");
  }
}
