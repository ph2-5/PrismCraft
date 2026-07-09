/**
 * 本地 Embedding Provider（基于 transformers.js + ONNX）
 *
 * 职责：
 * - 加载本地 ONNX 模型（通过 @huggingface/transformers）
 * - 实现 IEmbeddingProvider 接口
 * - 提供单条/批量 embedding 生成
 * - 模型懒加载（首次调用时加载，后续复用）
 *
 * 使用方式：
 * - 先通过 model-manager 检测模型是否可用
 * - 调用 getLocalEmbeddingProvider() 获取 provider 实例
 * - provider.generateEmbedding(text) 生成向量
 *
 * 类型设计：
 * - 使用 transformers.js 真实类型（pipeline / FeatureExtractionPipeline / Tensor）
 * - 动态 import 仍保留（避免主进程/renderer 启动时强制加载 WASM）
 * - 类型通过 `import type` 静态导入，运行时动态加载
 *
 * 注意：
 * - 推理在主线程进行（Electron renderer），200 条短文本约 1-3 秒
 * - 若需 Web Worker 异步推理，可在后续优化中迁移
 */

import type { IEmbeddingProvider } from "@/domain/ports";
import type { ApiResponse } from "@/domain/schemas";
import {
  getActiveModelEntry,
  _setActiveModelChangeCallback,
  type LocalModelEntry,
} from "./model-manager";
import { errorLogger } from "@/shared/error-logger";

// transformers.js 真实类型（仅类型导入，不进 bundle）
import type {
  pipeline as PipelineFn,
  FeatureExtractionPipeline,
  Tensor,
} from "@huggingface/transformers";

/** 单批最大文本数（避免内存溢出） */
const MAX_BATCH_SIZE = 32;

/** transformers.js pipeline 函数类型（仅 feature-extraction 任务） */
type PipelineFunction = typeof PipelineFn<"feature-extraction">;

/** 已加载的 pipeline 与对应模型信息 */
interface LoadedPipeline {
  pipeline: FeatureExtractionPipeline;
  info: LocalModelEntry;
}

/** 模块级缓存：已加载的 pipeline 和模型信息 */
let _loaded: LoadedPipeline | null = null;
let _loadingPromise: Promise<LoadedPipeline | null> | null = null;

/**
 * 懒加载 transformers.js 并构建 feature-extraction pipeline
 *
 * 使用动态 import 避免未安装依赖时阻塞 typecheck。
 * 模型加载较慢（首次 2-5 秒），加载后缓存复用。
 */
async function loadPipeline(): Promise<LoadedPipeline | null> {
  // 已加载则直接返回
  if (_loaded) {
    return _loaded;
  }

  // 正在加载则等待
  if (_loadingPromise) {
    return _loadingPromise;
  }

  _loadingPromise = (async () => {
    try {
      // 1. 获取当前 active 模型条目（M5：多模型管理）
      const entry = await getActiveModelEntry();
      if (!entry) {
        return null;
      }

      // 2. 动态 import transformers.js（避免未安装时阻塞）
      let transformers: { pipeline: PipelineFunction };
      try {
        transformers = await import("@huggingface/transformers");
      } catch {
        errorLogger.warn("[local-embedding] transformers.js 未安装，本地 embedding 不可用");
        return null;
      }

      // 3. 构建 pipeline（使用本地文件路径）
      // transformers.js v3+ 支持直接指定本地目录路径
      const modelDir = entry.directory;
      const pipeline = (await transformers.pipeline(
        "feature-extraction",
        modelDir,
        {
          // 指定 ONNX 后端
          dtype: "fp32",
          // 允许本地文件
          local_files_only: true,
        },
      )) as FeatureExtractionPipeline;

      _loaded = { pipeline, info: entry };
      return _loaded;
    } catch (error) {
      errorLogger.warn("[local-embedding] 加载模型失败:", error instanceof Error ? error.message : error);
      return null;
    } finally {
      _loadingPromise = null;
    }
  })();

  return _loadingPromise;
}

/**
 * 将 transformers.js 的 Tensor 输出转换为 number[][]
 *
 * Tensor.data 的类型是 AnyTypedArray | any[]：
 * - 单条输入：data 通常是 Float32Array，dims=[seqLen, embedDim]（pooling 后 [1, embedDim]）
 * - 批量输入：data 仍是扁平 Float32Array，dims=[batchSize, seqLen, embedDim]
 *
 * 通过 dims 推断 batchSize，按 dimensions 切分。
 */
function tensorToEmbeddings(
  tensor: Tensor,
  dimensions: number,
): number[][] {
  const data = tensor.data;
  const dims = tensor.dims;

  // pooling 后 dims 形如 [batchSize, embedDim]
  // 兼容历史 [embedDim] 与 [1, embedDim] 形状
  const batchSize = dims.length >= 2 ? dims[0]! : 1;
  const total = data.length;

  // 按 batchSize 切分
  const result: number[][] = [];
  const stride = Math.max(1, Math.floor(total / batchSize));

  if (data instanceof Float32Array || data instanceof Float64Array) {
    for (let b = 0; b < batchSize; b++) {
      const row: number[] = [];
      const offset = b * stride;
      for (let i = 0; i < dimensions && offset + i < total; i++) {
        row.push(data[offset + i]!);
      }
      result.push(row);
    }
  } else {
    // AnyTypedArray 或 any[]：按索引访问
    const arr = Array.isArray(data) ? data : Array.from(data as ArrayLike<number>);
    for (let b = 0; b < batchSize; b++) {
      const row: number[] = [];
      const offset = b * stride;
      for (let i = 0; i < dimensions && offset + i < arr.length; i++) {
        row.push(arr[offset + i]!);
      }
      result.push(row);
    }
  }

  return result;
}

/**
 * 获取本地 Embedding Provider 实例
 *
 * 返回 null 表示本地模型不可用（未安装 transformers.js 或无模型文件）。
 * 调用方应退回到 API 模式或关键词匹配。
 */
export async function getLocalEmbeddingProvider(): Promise<IEmbeddingProvider | null> {
  const loaded = await loadPipeline();
  if (!loaded) {
    return null;
  }

  const { pipeline, info } = loaded;

  const provider: IEmbeddingProvider = {
    async generateEmbedding(
      input: string,
      _options?: { providerId?: string; modelId?: string },
    ): Promise<ApiResponse<{ embedding: number[] }>> {
      try {
        const tensor = await pipeline(input, { pooling: "mean", normalize: true });
        const embeddings = tensorToEmbeddings(tensor, info.dimensions);
        if (embeddings.length === 0 || !embeddings[0]) {
          return { success: false, error: "embedding_output_empty" };
        }
        return { success: true, data: { embedding: embeddings[0]! } };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { success: false, error: `local_embedding_failed: ${message}` };
      }
    },

    generateEmbeddings: async function (
      inputs: string[],
      _options?: { providerId?: string; modelId?: string },
    ): Promise<ApiResponse<{ embeddings: number[][] }>> {
      try {
        // 分批处理（避免内存溢出）
        const allEmbeddings: number[][] = [];
        for (let i = 0; i < inputs.length; i += MAX_BATCH_SIZE) {
          const batch = inputs.slice(i, i + MAX_BATCH_SIZE);
          const tensor = await pipeline(batch, { pooling: "mean", normalize: true });
          const batchEmbeddings = tensorToEmbeddings(tensor, info.dimensions);
          allEmbeddings.push(...batchEmbeddings);
        }
        return { success: true, data: { embeddings: allEmbeddings } };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { success: false, error: `local_embeddings_batch_failed: ${message}` };
      }
    },
  };

  return provider;
}

/**
 * 预热本地模型（可选调用，提前加载避免首次调用延迟）
 */
export async function preloadLocalModel(): Promise<boolean> {
  const loaded = await loadPipeline();
  return loaded !== null;
}

/**
 * 清理模型缓存（切换模型或释放内存时调用）
 */
export function clearLocalModelCache(): void {
  _loaded = null;
  _loadingPromise = null;
}

/**
 * 注册 active 模型变更回调
 *
 * 当 model-manager 切换/删除 active 模型时，自动清空 pipeline 缓存，
 * 下次调用 getLocalEmbeddingProvider 会重新加载新模型。
 *
 * 在模块加载时注册一次（幂等）。
 */
_setActiveModelChangeCallback(() => clearLocalModelCache());
