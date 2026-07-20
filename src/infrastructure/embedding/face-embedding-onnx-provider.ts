/**
 * Face Embedding ONNX Provider（基于 transformers.js image-feature-extraction）
 *
 * 职责：
 *   1. 加载本地 ONNX face embedding 模型（如 MobileFaceNet / ArcFace / FaceNet）
 *   2. 提供 extractEmbedding(imageUrl) → 向量（用于 QC 中的相似度比对）
 *   3. 模型懒加载，失败返回 null（由调用方降级到 VLM/noop）
 *
 * 与 local-embedding-provider.ts 的差异：
 *   - text embedding 使用 `feature-extraction` pipeline（输入是文本，依赖 tokenizer.json）
 *   - face embedding 使用 `image-feature-extraction` pipeline（输入是图片 URL/path，依赖 preprocessor_config.json）
 *   - 不与 model-manager 的多模型 registry 共用（face 模型独立路径，避免与 text 模型切换冲突）
 *
 * 类型设计：
 *   - 使用本地精简类型（LocalTensor / LocalImagePipeline / LocalPipelineFn）
 *   - 避免从 @huggingface/transformers 使用 import type（该包为可选依赖，未安装时会导致 vitest 模块解析失败）
 *   - 动态 import 保留（避免 renderer 启动时强制加载 WASM）
 *
 * 限制（MVP）：
 *   - 不含 face detection 前置（对已 crop 的角色参考图效果良好，对视频抽帧准确度较低）
 *   - 推理在 renderer 主线程（未来可迁移到 Worker 或主进程）
 *   - 模型文件由用户提供，通过 faceEmbeddingModelPath 配置指定本地目录
 */

import { errorLogger } from "@/shared/error-logger";
import { ok, err, type Result } from "@/domain/types/result";
import { fileExists, readFile } from "@/shared/file-http";
import {
  ONNX_FILE_CANDIDATES,
  MIN_ONNX_SIZE,
} from "./model-manager-types";

// ============= transformers.js 本地类型定义 =============
// 不使用 `import type` from "@huggingface/transformers"，因为该包是可选依赖
// （仅在用户配置 face ONNX 模型时才需要）。vitest 预扫描会尝试解析所有 import 语句，
// 包括 `import type`，未安装时会导致模块解析失败，影响依赖链上的所有测试。
// 此处定义模块内使用的精简类型，与 local-embedding-provider.ts 模式一致。

/** transformers.js Tensor 类型（本地精简版） */
interface LocalTensor {
  data: Float32Array | Float64Array | number[];
  dims: number[];
  type: string;
  tolist(): number[][];
}

/** transformers.js image-feature-extraction pipeline 类型（本地精简版） */
interface LocalImagePipeline {
  (
    image: string | Blob | unknown,
    options?: {
      pooling?: "mean" | "max" | "cls";
      normalize?: boolean;
    },
  ): Promise<LocalTensor>;
}

/** transformers.js pipeline 函数类型（本地精简版） */
type LocalPipelineFn = (
  task: string,
  modelId: string,
  options?: {
    dtype?: string;
    local_files_only?: boolean;
    progress_callback?: (progress: unknown) => void;
  },
) => Promise<LocalImagePipeline>;

/** 已加载的 pipeline */
interface LoadedPipeline {
  pipeline: LocalImagePipeline;
  modelPath: string;
}

/**
 * Face embedding runner 接口（供 modules 层调用）。
 *
 * 抽象 ONNX 推理细节，调用方通过此接口获取 embedding，
 * 不直接接触 transformers.js 类型。
 */
export interface OnnxFaceEmbeddingRunner {
  /** 模型是否可用（transformers.js 已安装 + pipeline 可构建） */
  isAvailable(): Promise<boolean>;
  /** 提取图片的 face embedding */
  extractEmbedding(imageUrl: string): Promise<
    Result<{
      embedding: number[];
      dimensions: number;
      faceDetected: boolean;
    }>
  >;
}

// ─── 模块级缓存 ───────────────────────────────────────────────────────────────

/** modelPath → LoadedPipeline 缓存（避免重复加载） */
const _pipelineCache = new Map<string, LoadedPipeline>();

/** modelPath → 加载中 Promise（避免并发加载同一模型） */
const _loadingPromises = new Map<string, Promise<LoadedPipeline | null>>();

/** transformers.js 是否可动态 import（缓存 isAvailable 结果） */
let _transformersAvailable: boolean | null = null;

// ─── 内部函数 ─────────────────────────────────────────────────────────────────

/**
 * 检测 transformers.js 是否可加载（缓存结果）。
 *
 * 仅验证 `pipeline` 函数存在，不真正构建 pipeline。
 * 用于 OnnxFaceEmbeddingRunner.isAvailable() 的轻量级检查。
 */
async function isTransformersAvailable(): Promise<boolean> {
  if (_transformersAvailable !== null) return _transformersAvailable;
  try {
    // 通过变量拼接绕过 vite/rollup 静态分析：bundler 无法解析变量值，
    // 会跳过该 import 的打包，未安装时运行时 fallback 到 false。
    const pkgName = "@huggingface/" + "transformers";
    const transformers = (await import(/* @vite-ignore */ pkgName)) as {
      pipeline?: unknown;
    };
    _transformersAvailable = typeof transformers.pipeline === "function";
  } catch {
    _transformersAvailable = false;
  }
  return _transformersAvailable;
}

/**
 * 懒加载 transformers.js 并构建 image-feature-extraction pipeline。
 *
 * 使用动态 import 避免未安装依赖时阻塞 typecheck。
 * 模型加载较慢（首次 2-5 秒），加载后缓存复用。
 */
async function loadPipeline(modelPath: string): Promise<LoadedPipeline | null> {
  // 已加载则直接返回
  const cached = _pipelineCache.get(modelPath);
  if (cached) return cached;

  // 正在加载则等待
  const loading = _loadingPromises.get(modelPath);
  if (loading) return loading;

  const promise = (async (): Promise<LoadedPipeline | null> => {
    try {
      // 1. 验证 transformers.js 可用
      if (!(await isTransformersAvailable())) {
        errorLogger.warn("[face-embedding-onnx] transformers.js 未安装，face embedding 不可用");
        return null;
      }

      // 2. 动态 import transformers.js
      const pkgName = "@huggingface/" + "transformers";
      const transformers = (await import(/* @vite-ignore */ pkgName)) as {
        pipeline: LocalPipelineFn;
      };

      // 3. 构建 pipeline（使用本地文件路径）
      //    image-feature-extraction 接受本地目录路径，自动加载 model.onnx + preprocessor_config.json
      const pipeline = await transformers.pipeline(
        "image-feature-extraction",
        modelPath,
        {
          dtype: "fp32",
          local_files_only: true,
        },
      );

      const loaded: LoadedPipeline = { pipeline, modelPath };
      _pipelineCache.set(modelPath, loaded);
      return loaded;
    } catch (error) {
      errorLogger.warn(
        `[face-embedding-onnx] 加载模型失败 path=${modelPath}:`,
        error instanceof Error ? error.message : error,
      );
      return null;
    } finally {
      _loadingPromises.delete(modelPath);
    }
  })();

  _loadingPromises.set(modelPath, promise);
  return promise;
}

/**
 * 把 transformers.js 的 Tensor 输出转换为 number[]。
 *
 * image-feature-extraction pooling 后输出：
 *   - dims=[1, embedDim]，data 是 Float32Array
 *   - 直接展平为一维数组即可
 */
function tensorToEmbedding(tensor: LocalTensor): number[] {
  const data = tensor.data;
  if (data instanceof Float32Array || data instanceof Float64Array) {
    return Array.from(data);
  }
  if (Array.isArray(data)) {
    return [...data];
  }
  // 兜底：ArrayLike 转数组
  return Array.from(data as ArrayLike<number>);
}

// ─── 公开 API ─────────────────────────────────────────────────────────────────

/**
 * 创建 ONNX face embedding runner。
 *
 * @param modelPath 本地 ONNX 模型目录路径（包含 model.onnx + preprocessor_config.json）
 * @returns runner 实例；modelPath 为空时返回 null
 *
 * 注意：此函数不立即加载模型，首次 extractEmbedding 调用时才触发 pipeline 构建。
 * isAvailable() 只做轻量级检查（transformers.js 是否可加载），不构建 pipeline。
 */
export function createOnnxFaceEmbeddingProvider(
  modelPath: string,
): OnnxFaceEmbeddingRunner | null {
  if (!modelPath) return null;

  return {
    async isAvailable(): Promise<boolean> {
      return isTransformersAvailable();
    },

    async extractEmbedding(imageUrl: string): Promise<
      Result<{
        embedding: number[];
        dimensions: number;
        faceDetected: boolean;
      }>
    > {
      try {
        const loaded = await loadPipeline(modelPath);
        if (!loaded) {
          return err(
            new (class extends Error {
              code = "MODEL_UNAVAILABLE";
            })("face embedding model 未加载（transformers.js 未安装或模型路径无效）"),
          );
        }

        // transformers.js pipeline 接受 URL/本地路径/Blob/RawImage
        // 对于本地文件路径（如 generateThumbnail 输出），直接传入即可
        const tensor = await loaded.pipeline(imageUrl, {
          pooling: "mean",
          normalize: true,
        });

        const embedding = tensorToEmbedding(tensor);
        if (embedding.length === 0) {
          return err(
            new (class extends Error {
              code = "EMPTY_EMBEDDING";
            })("ONNX face embedding 返回空向量"),
          );
        }

        // 推断 dimensions（pooling 后 dims=[1, embedDim]）
        const dims = tensor.dims;
        const dimensions = dims.length >= 2 ? dims[dims.length - 1]! : embedding.length;

        // MVP：无 face detection 前置，假设图中有脸（保守 true，让 QC 流程继续）
        // 未来接入 face detection 后，可在此处检测并返回真实 faceDetected
        return ok({
          embedding,
          dimensions,
          faceDetected: true,
        });
      } catch (e) {
        return err(
          new (class extends Error {
            code = "EXTRACT_FAILED";
          })(`ONNX face extraction failed: ${e instanceof Error ? e.message : String(e)}`),
        );
      }
    },
  };
}

/**
 * 清理 face embedding pipeline 缓存（用于配置变更或测试）。
 *
 * 不影响 text embedding 的 local-embedding-provider 缓存。
 */
export function clearOnnxFaceEmbeddingCache(): void {
  _pipelineCache.clear();
  _loadingPromises.clear();
  _transformersAvailable = null;
}

// ─── 模型目录预校验（供 UI "测试模型" 按钮调用）────────────────────────────────

/** face 模型目录预校验结果 */
export interface FaceModelIntegrityResult {
  /** 校验是否通过 */
  ok: boolean;
  /** 错误消息（ok=false 时填充，供 UI 直接展示） */
  error: string | null;
  /** 检测到的 ONNX 文件名（如 "model.onnx"） */
  onnxFileName: string | null;
  /** 从 config.json 解析出的模型名（若存在） */
  modelName: string | null;
  /** 从 config.json 解析出的 embedding 维度（若存在） */
  dimensions: number | null;
}

/** 校验步骤统一返回类型 */
interface StepResult {
  ok: boolean;
  error: string | null;
}

/** ONNX 文件查找 + 大小校验步骤返回类型 */
interface OnnxStepResult extends StepResult {
  onnxFileName: string | null;
}

/** config.json 解析步骤返回类型 */
interface ConfigStepResult extends StepResult {
  modelName: string | null;
  dimensions: number | null;
}

/**
 * 在目录中查找 ONNX 文件并校验大小。
 *
 * 按 ONNX_FILE_CANDIDATES 顺序探测，找到第一个存在的文件后校验大小 ≥ MIN_ONNX_SIZE。
 */
async function checkOnnxFile(dir: string): Promise<OnnxStepResult> {
  let onnxFileName: string | null = null;
  for (const candidate of ONNX_FILE_CANDIDATES) {
    if (await fileExists(`${dir}/${candidate}`)) {
      onnxFileName = candidate;
      break;
    }
  }
  if (!onnxFileName) {
    return {
      ok: false,
      error: `目录中未找到 ONNX 模型文件（期望 model.onnx 或量化变体）：${dir}`,
      onnxFileName: null,
    };
  }

  const onnxPath = `${dir}/${onnxFileName}`;
  const onnxResult = await readFile(onnxPath);
  if (!onnxResult?.success || !onnxResult.data) {
    return {
      ok: false,
      error: `无法读取 ONNX 文件：${onnxPath}`,
      onnxFileName,
    };
  }
  const onnxBytes = new Uint8Array(onnxResult.data);
  if (onnxBytes.length < MIN_ONNX_SIZE) {
    return {
      ok: false,
      error: `ONNX 文件过小（${onnxBytes.length} 字节，期望 ≥ ${MIN_ONNX_SIZE}）`,
      onnxFileName,
    };
  }

  return { ok: true, error: null, onnxFileName };
}

/**
 * 校验 preprocessor_config.json 存在且为合法 JSON。
 *
 * face 模型使用 image-feature-extraction pipeline，依赖 preprocessor_config.json
 * 而非 tokenizer.json。文件存在但 JSON 解析失败时返回错误。
 */
async function checkPreprocessor(dir: string): Promise<StepResult> {
  const preprocessorPath = `${dir}/preprocessor_config.json`;
  if (!(await fileExists(preprocessorPath))) {
    return {
      ok: false,
      error: `缺少 preprocessor_config.json（face 模型必需）：${dir}`,
    };
  }
  const preprocessorResult = await readFile(preprocessorPath);
  if (!preprocessorResult?.success || !preprocessorResult.data) {
    return {
      ok: false,
      error: `无法读取 preprocessor_config.json：${preprocessorPath}`,
    };
  }
  try {
    const text = new TextDecoder().decode(preprocessorResult.data);
    JSON.parse(text);
  } catch (e) {
    return {
      ok: false,
      error: `preprocessor_config.json 不是合法 JSON：${e instanceof Error ? e.message : String(e)}`,
    };
  }
  return { ok: true, error: null };
}

/**
 * 校验 config.json 完整性（合法 JSON + modelName 字符串 + dimensions 正整数）。
 *
 * @param configPath config.json 完整路径（已确认存在）
 */
async function checkConfigFields(configPath: string): Promise<ConfigStepResult> {
  const configResult = await readFile(configPath);
  if (!configResult?.success || !configResult.data) {
    return {
      ok: false,
      error: `无法读取 config.json：${configPath}`,
      modelName: null,
      dimensions: null,
    };
  }
  let configObj: Record<string, unknown>;
  try {
    const text = new TextDecoder().decode(configResult.data);
    configObj = JSON.parse(text) as Record<string, unknown>;
  } catch (e) {
    return {
      ok: false,
      error: `config.json 不是合法 JSON：${e instanceof Error ? e.message : String(e)}`,
      modelName: null,
      dimensions: null,
    };
  }
  const modelName =
    typeof configObj.modelName === "string" && configObj.modelName.trim()
      ? configObj.modelName
      : null;
  if (!modelName) {
    return {
      ok: false,
      error: "config.json 缺少 modelName（非空字符串）",
      modelName: null,
      dimensions: null,
    };
  }
  const dims = Number(configObj.dimensions);
  if (!Number.isFinite(dims) || dims <= 0 || !Number.isInteger(dims)) {
    return {
      ok: false,
      error: "config.json dimensions 必须是正整数",
      modelName,
      dimensions: null,
    };
  }
  return { ok: true, error: null, modelName, dimensions: dims };
}

/**
 * 预校验 face embedding 模型目录完整性。
 *
 * 与 text embedding 的 verifyTokenizerIntegrity 不同，face 模型使用
 * `image-feature-extraction` pipeline，依赖 `preprocessor_config.json`
 * 而非 `tokenizer.json`。本函数校验：
 *   1. 目录存在（通过 config.json 探测）
 *   2. 目录中包含 ONNX 文件（model.onnx 或量化变体）+ 大小 ≥ MIN_ONNX_SIZE
 *   3. 目录中包含 preprocessor_config.json（合法 JSON）
 *   4. 目录中包含 config.json（含 modelName 字符串 + dimensions 正整数）
 *
 * 注意：本函数只做静态文件校验，不加载 transformers.js / 不构建 pipeline。
 * 用户在 UI 配置 faceEmbeddingModelPath 时调用，立即得到反馈。
 */
export async function verifyFaceModelIntegrity(
  dir: string,
): Promise<FaceModelIntegrityResult> {
  if (!dir || typeof dir !== "string") {
    return { ok: false, error: "模型路径为空", onnxFileName: null, modelName: null, dimensions: null };
  }

  // 1. 目录存在性检查（通过 fileExists 探测 config.json）
  const configPath = `${dir}/config.json`;
  if (!(await fileExists(configPath))) {
    return {
      ok: false,
      error: `目录不存在或缺少 config.json：${dir}`,
      onnxFileName: null,
      modelName: null,
      dimensions: null,
    };
  }

  // 2. ONNX 文件查找 + 大小校验
  const onnxStep = await checkOnnxFile(dir);
  if (!onnxStep.ok) {
    return {
      ok: false,
      error: onnxStep.error,
      onnxFileName: onnxStep.onnxFileName,
      modelName: null,
      dimensions: null,
    };
  }
  const onnxFileName = onnxStep.onnxFileName!;

  // 3. preprocessor_config.json 校验
  const preprocessorStep = await checkPreprocessor(dir);
  if (!preprocessorStep.ok) {
    return {
      ok: false,
      error: preprocessorStep.error,
      onnxFileName,
      modelName: null,
      dimensions: null,
    };
  }

  // 4. config.json 字段校验
  const configStep = await checkConfigFields(configPath);
  if (!configStep.ok) {
    return {
      ok: false,
      error: configStep.error,
      onnxFileName,
      modelName: configStep.modelName,
      dimensions: configStep.dimensions,
    };
  }

  return {
    ok: true,
    error: null,
    onnxFileName,
    modelName: configStep.modelName,
    dimensions: configStep.dimensions,
  };
}
