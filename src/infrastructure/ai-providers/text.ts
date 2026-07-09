import type { ApiResponse } from "@/domain/schemas";
import type { StreamChunk, ToolDef } from "@/domain/ports/ai-provider-port";
import { apiCallWithRetry, apiCallStream } from "./core";
import { ApiClientError } from "./errors";
import { resolveCapability, safeTruncatePrompt } from "./config";
import type { TextGenerationRequestBody } from "./types";
import { extractErrorMessage } from "@/shared/error-logger";

export async function generateText(
  prompt: string,
  options?: {
    maxTokens?: number;
    temperature?: number;
    providerId?: string;
    modelId?: string;
  },
): Promise<ApiResponse<{ text: string }>> {
  try {
    const { truncated: safePrompt, wasTruncated } = safeTruncatePrompt(prompt);

    const requestBody: TextGenerationRequestBody = {
      prompt: safePrompt,
      maxTokens: options?.maxTokens ?? 300,
      temperature: options?.temperature ?? 0.7,
      promptWasTruncated: wasTruncated,
    };

    if (options?.providerId && options?.modelId) {
      requestBody.providerId = options.providerId;
      requestBody.modelId = options.modelId;
    } else {
      const { provider, model } = await resolveCapability("text");
      requestBody.providerId = provider.id;
      requestBody.modelId = model.id;
    }

    const result = await apiCallWithRetry<ApiResponse<{ text: string }>>(
      "generate-text",
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

/**
 * 流式文本生成（Task 1.0）。
 * 调用 /api/generate-text-stream（SSE）端点，通过 onChunk 回调实时返回增量内容。
 * 流结束后返回完整的累积文本。
 *
 * 用于 Agent Loop 的实时推理输出。
 */
export async function generateTextStream(
  prompt: string,
  options?: {
    maxTokens?: number;
    temperature?: number;
    providerId?: string;
    modelId?: string;
    tools?: ToolDef[];
    onChunk: (chunk: StreamChunk) => void;
    /** P1-1 修复：外部 abort 信号，让 Agent Loop 的取消按钮在 LLM 推理期间生效 */
    signal?: AbortSignal;
  },
): Promise<ApiResponse<{ text: string }>> {
  try {
    if (!options?.onChunk) {
      throw new Error("options.onChunk is required for generateTextStream");
    }
    const { onChunk } = options;

    const { truncated: safePrompt, wasTruncated } = safeTruncatePrompt(prompt);

    const requestBody: TextGenerationRequestBody & { tools?: ToolDef[] } = {
      prompt: safePrompt,
      maxTokens: options?.maxTokens ?? 300,
      temperature: options?.temperature ?? 0.7,
      promptWasTruncated: wasTruncated,
    };

    if (options?.providerId && options?.modelId) {
      requestBody.providerId = options.providerId;
      requestBody.modelId = options.modelId;
    } else {
      const { provider, model } = await resolveCapability("text");
      requestBody.providerId = provider.id;
      requestBody.modelId = model.id;
    }

    if (options?.tools && options.tools.length > 0) {
      requestBody.tools = options.tools;
    }

    return await apiCallStream<StreamChunk, ApiResponse<{ text: string }>>(
      "generate-text-stream",
      {
        method: "POST",
        body: JSON.stringify(requestBody),
      },
      {
        onChunk: (chunk) => onChunk(chunk),
        signal: options?.signal,
      },
    );
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    throw new Error(extractErrorMessage(error));
  }
}
