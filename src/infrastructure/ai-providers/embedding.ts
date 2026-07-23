/**
 * Embedding Provider 实现
 *
 * 通过本地 Electron HTTP 服务 `/api/generate-embedding` 调用 OpenAI 兼容的 `/embeddings` 接口。
 * 用于记忆系统语义检索与相似度匹配。
 *
 * 设计要点：
 * - 单条与批量接口分离：单条用 generateEmbedding，批量用 generateEmbeddings
 * - 批量限制 64 条/请求，超出自动分批
 * - 向量缓存由调用方负责（避免 provider 层引入缓存状态）
 */
import type { ApiResponse } from "@/domain/schemas/api";
import { apiCallWithRetry } from "./core";
import { ApiClientError } from "./errors";
import { resolveCapability } from "./config";
import { extractErrorMessage } from "@/shared/error-logger";
import { GenerationError } from "@/domain/types/result";

/** 单批最大文本数（OpenAI 限制 2048，保守取 64 避免超时） */
const MAX_BATCH_SIZE = 64;

interface EmbeddingRequestBody {
  input: string | string[];
  providerId?: string;
  modelId?: string;
}

interface EmbeddingResponse {
  embedding?: number[];
  embeddings?: number[][];
}

/**
 * 生成单段文本的向量嵌入
 */
export async function generateEmbedding(
  input: string,
  options?: {
    providerId?: string;
    modelId?: string;
  },
): Promise<ApiResponse<{ embedding: number[] }>> {
  try {
    const requestBody: EmbeddingRequestBody = { input };

    if (options?.providerId && options?.modelId) {
      requestBody.providerId = options.providerId;
      requestBody.modelId = options.modelId;
    } else {
      const { provider, model } = await resolveCapability("embedding");
      requestBody.providerId = provider.id;
      requestBody.modelId = model.id;
    }

    const result = await apiCallWithRetry<ApiResponse<EmbeddingResponse>>(
      "generate-embedding",
      {
        method: "POST",
        body: JSON.stringify(requestBody),
      },
    );

    if (!result.success) {
      return { success: false, error: result.error, message: result.message };
    }

    const embedding = result.data?.embedding;
    if (!embedding || !Array.isArray(embedding)) {
      return {
        success: false,
        error: "embedding_response_invalid: missing embedding array",
      };
    }

    return { success: true, data: { embedding } };
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    throw new GenerationError(extractErrorMessage(error), "text");
  }
}

/**
 * 批量生成向量嵌入（自动分批）
 *
 * @param inputs 文本数组
 * @returns embeddings 与输入顺序一一对应；若部分批次失败，整批返回失败
 */
export async function generateEmbeddings(
  inputs: string[],
  options?: {
    providerId?: string;
    modelId?: string;
  },
): Promise<ApiResponse<{ embeddings: number[][] }>> {
  try {
    if (inputs.length === 0) {
      return { success: true, data: { embeddings: [] } };
    }

    const allEmbeddings: number[][] = [];

    // 分批处理
    for (let i = 0; i < inputs.length; i += MAX_BATCH_SIZE) {
      const batch = inputs.slice(i, i + MAX_BATCH_SIZE);
      const requestBody: EmbeddingRequestBody = { input: batch };

      if (options?.providerId && options?.modelId) {
        requestBody.providerId = options.providerId;
        requestBody.modelId = options.modelId;
      } else {
        const { provider, model } = await resolveCapability("embedding");
        requestBody.providerId = provider.id;
        requestBody.modelId = model.id;
      }

      const result = await apiCallWithRetry<ApiResponse<EmbeddingResponse>>(
        "generate-embedding",
        {
          method: "POST",
          body: JSON.stringify(requestBody),
        },
      );

      if (!result.success) {
        return { success: false, error: result.error, message: result.message };
      }

      const batchEmbeddings = result.data?.embeddings;
      if (!batchEmbeddings || !Array.isArray(batchEmbeddings)) {
        return {
          success: false,
          error: "embedding_response_invalid: missing embeddings array",
        };
      }

      if (batchEmbeddings.length !== batch.length) {
        return {
          success: false,
          error: `embedding_count_mismatch: expected ${batch.length}, got ${batchEmbeddings.length}`,
        };
      }

      allEmbeddings.push(...batchEmbeddings);
    }

    return { success: true, data: { embeddings: allEmbeddings } };
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    throw new GenerationError(extractErrorMessage(error), "text");
  }
}
