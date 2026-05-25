import type { ApiResponse } from "@/domain/schemas";
import { apiCallWithRetry } from "./core";
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
