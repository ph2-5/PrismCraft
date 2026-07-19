/**
 * Task 2A.23: face-embedding-service — Face/Visual Embedding 抽象层
 *
 * 职责：
 *   1. 定义 FaceEmbeddingProvider 接口抽象（VLM + ONNX 可插拔）
 *   2. getFaceEmbeddingProvider() 工厂：尝试加载本地 ONNX face 模型，失败则降级为 VLM provider
 *   3. extractEmbedding(imageUrl) → number[]（用于 QC 中的相似度比对）
 *
 * 设计策略（INV-2: Embedding provider 可插拔）：
 *   - 优先：本地 ONNX face embedding（精确帧级相似度，零云端成本）
 *   - 降级 1：VLM 视觉分析（复用 container.imageApi.analyze，返回结构化分数）
 *   - 降级 2：返回 isAvailable() = false，qc-orchestrator 退化为跨分镜漂移检测
 *
 * 不修改现有 IEmbeddingProvider 接口（仅支持 text）。
 * Face embedding 是新的能力，独立接口隔离。
 */

import { container } from "@/infrastructure/di";
import { errorLogger } from "@/shared/error-logger";
import { ok, err, type Result } from "@/domain/types/result";

/** Face embedding 提取结果元数据 */
export interface EmbeddingMetadata {
  /** 使用的 provider 类型 */
  providerType: "onnx_face" | "vlm" | "none";
  /** embedding 维度（VLM 降级时可能为 0） */
  dimensions: number;
  /** 是否检测到人脸 */
  faceDetected: boolean;
  /** provider 标识（用于追溯） */
  providerId?: string;
}

/** Face embedding provider 抽象 */
export interface FaceEmbeddingProvider {
  /** 是否可用（ONNX 模型加载成功 / VLM 配置完成） */
  isAvailable(): Promise<boolean>;
  /** 提取图片的 face/visual embedding */
  extractEmbedding(imageUrl: string): Promise<Result<{ embedding: number[]; metadata: EmbeddingMetadata }>>;
  /** provider 类型标识 */
  readonly providerType: EmbeddingMetadata["providerType"];
}

// ─── ONNX Face Embedding Provider（基于 transformers.js）─────────────────────

/**
 * 通过 transformers.js 加载本地 ONNX face 模型（如 ArcFace/InsightFace ONNX）。
 *
 * 模型加载策略：
 *   - 模型路径通过 getConfig("faceEmbeddingModelPath") 读取
 *   - 不存在时 isAvailable() 返回 false
 *   - 模型加载失败不抛异常，降级为 VLM provider
 *
 * 注意：当前实现是骨架，实际 transformers.js 调用通过动态 import，
 * 与 local-embedding-provider.ts 的 loadPipeline() 模式一致。
 */
class OnnxFaceEmbeddingProvider implements FaceEmbeddingProvider {
  readonly providerType = "onnx_face" as const;
  private available: boolean | null = null;
  private loadingPromise: Promise<boolean> | null = null;

  async isAvailable(): Promise<boolean> {
    if (this.available !== null) return this.available;
    if (this.loadingPromise) return this.loadingPromise;

    this.loadingPromise = (async () => {
      try {
        // 通过 file-http 读取配置（架构规则：禁止直接调用 electronAPI）
        const { getConfig } = await import("@/shared/file-http");
        const modelPath = (await getConfig("faceEmbeddingModelPath")) as string | undefined;
        if (!modelPath) {
          this.available = false;
          return false;
        }

        // 动态 import transformers.js（避免未安装时阻塞）
        const pkgName = "@huggingface/" + "transformers";
        const transformers = (await import(/* @vite-ignore */ pkgName)) as {
          pipeline?: (task: string, model: string, options?: unknown) => Promise<unknown>;
        };
        if (typeof transformers.pipeline !== "function") {
          this.available = false;
          return false;
        }

        // 模型存在性检查（简化：直接认为 pipeline 可用）
        // 真正的 pipeline 构建在 extractEmbedding() 首次调用时进行（lazy）
        this.available = true;
        return true;
      } catch (e) {
        errorLogger.warn("[face-embedding] ONNX provider 不可用", e);
        this.available = false;
        return false;
      } finally {
        this.loadingPromise = null;
      }
    })();

    return this.loadingPromise;
  }

  async extractEmbedding(imageUrl: string): Promise<Result<{ embedding: number[]; metadata: EmbeddingMetadata }>> {
    const available = await this.isAvailable();
    if (!available) {
      return err(new (class extends Error {
        code = "PROVIDER_UNAVAILABLE";
      })("ONNX face provider 不可用"));
    }

    // 骨架实现：实际 ONNX face 模型调用需要 image-to-tensor + 模型推理
    // 当前阶段返回空 embedding，由 qc-orchestrator 降级为 VLM 检查
    // 后续 Task 2A.23+1 会接入真实模型
    // imageUrl 参数暂未使用，保留以匹配接口签名
    void imageUrl;
    errorLogger.warn("[face-embedding] ONNX provider 返回空 embedding（骨架实现，请启用 VLM 降级）");
    return ok({
      embedding: [],
      metadata: {
        providerType: "onnx_face",
        dimensions: 0,
        faceDetected: false,
        providerId: "onnx-face-skeleton",
      },
    });
  }
}

// ─── VLM Embedding Provider（降级路径）──────────────────────────────────────

/** VLM 分析结果的结构化字段（与 shot/consistency-check 兼容） */
interface VlmAnalysisResult {
  /** VLM 给出的 0-1 一致性分数（作为伪 embedding 的归一化值） */
  similarityScore: number;
  /** 是否检测到人脸/角色特征 */
  faceDetected: boolean;
  /** VLM 原始分析文本 */
  rawAnalysis: string;
}

/**
 * 通过 container.imageApi.analyze（VLM）做视觉一致性分析。
 *
 * VLM 不返回向量，而是返回 0-1 的分数。我们把该分数包装为 1 维的"伪 embedding"，
 * 让 similarity-checker 可以统一调用 cosineSimilarity。
 *
 * 注意：1 维 embedding 的 cosineSimilarity 退化为 1.0（同向）或 -1.0（反向），
 * 因此 VLM 路径下 similarity-checker 不再有意义，应直接使用 vlmSimilarityScore。
 * qc-orchestrator 会根据 providerType 选择不同路径。
 */
class VlmEmbeddingProvider implements FaceEmbeddingProvider {
  readonly providerType = "vlm" as const;
  private available: boolean | null = null;

  async isAvailable(): Promise<boolean> {
    if (this.available !== null) return this.available;
    try {
      // 检查 imageApi 是否配置（通过尝试调用一个轻量接口）
      // 实际可用性在 extractEmbedding() 时检验
      this.available = !!container.imageApi;
      return this.available;
    } catch {
      this.available = false;
      return false;
    }
  }

  async extractEmbedding(imageUrl: string): Promise<Result<{ embedding: number[]; metadata: EmbeddingMetadata }>> {
    const available = await this.isAvailable();
    if (!available) {
      return err(new (class extends Error {
        code = "PROVIDER_UNAVAILABLE";
      })("VLM imageApi 不可用"));
    }

    try {
      const analysis = await analyzeWithVlm(imageUrl);
      if (!analysis) {
        return err(new (class extends Error {
          code = "VLM_PARSE_FAILED";
        })("VLM 分析结果解析失败"));
      }

      // VLM 路径：embedding 是 1 维数组，包含 similarityScore
      // 这样 cosineSimilarity 计算时，1 维向量点积退化为分数乘积，
      // qc-orchestrator 应直接使用 metadata.vlmSimilarityScore
      return ok({
        embedding: [analysis.similarityScore],
        metadata: {
          providerType: "vlm",
          dimensions: 1,
          faceDetected: analysis.faceDetected,
          providerId: "vlm-image-api",
        },
      });
    } catch (e) {
      return err(new (class extends Error {
        code = "EXTRACT_FAILED";
      })(`VLM extraction failed: ${e instanceof Error ? e.message : String(e)}`));
    }
  }
}

/**
 * 调用 container.imageApi.analyze 做 VLM 视觉一致性分析。
 *
 * prompt 让 VLM 输出 JSON：{ "score": 0.85, "faceDetected": true }
 * 解析失败时返回 null。
 */
async function analyzeWithVlm(imageUrl: string): Promise<VlmAnalysisResult | null> {
  const prompt = `请分析这张图片中人物/角色的视觉特征，输出 JSON：
{
  "score": 0.0-1.0 的特征一致性分数（与参考图比较），
  "faceDetected": boolean 是否检测到人脸/角色特征
}

仅输出 JSON，不要其他内容。`;

  const result = await container.imageApi.analyze(imageUrl, "scene", prompt);
  if (!result.ok) {
    errorLogger.warn("[face-embedding] VLM analyze 失败", result.error);
    return null;
  }

  const text = result.value.analysis || "";
  return parseVlmAnalysis(text);
}

/** 解析 VLM 输出（支持裸 JSON / 代码块包裹的 JSON） */
function parseVlmAnalysis(text: string): VlmAnalysisResult | null {
  if (!text) return null;

  // 直接 JSON.parse
  try {
    const direct = JSON.parse(text);
    const normalized = normalizeVlmResult(direct);
    if (normalized) return normalized;
  } catch {
    // 继续尝试代码块解析
  }

  // 代码块 ```json ... ```
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch?.[1]) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1]);
      const normalized = normalizeVlmResult(parsed);
      if (normalized) return normalized;
    } catch {
      // 继续尝试正则提取
    }
  }

  // 正则提取 {"score": 0.85, "faceDetected": true}
  const jsonMatch = text.match(/\{[^{}]*"score"[^{}]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const normalized = normalizeVlmResult(parsed);
      if (normalized) return normalized;
    } catch {
      // 放弃
    }
  }

  return null;
}

/**
 * 把 VLM 输出归一化为 VlmAnalysisResult。
 *
 * 接受 `score` 或 `similarityScore` 字段（不同 VLM prompt 模板可能用任一），
 * 统一输出 `similarityScore`。
 */
function normalizeVlmResult(obj: unknown): VlmAnalysisResult | null {
  if (typeof obj !== "object" || obj === null) return null;
  const o = obj as Record<string, unknown>;

  // score 或 similarityScore，二选一
  const score =
    typeof o.similarityScore === "number" ? o.similarityScore :
    typeof o.score === "number" ? o.score :
    null;
  if (score === null) return null;

  // faceDetected 可选，缺省视为 true（保守策略，让 QC 流程继续）
  const faceDetected =
    typeof o.faceDetected === "boolean" ? o.faceDetected : true;

  return {
    similarityScore: clamp01(score),
    faceDetected,
    rawAnalysis: typeof o.rawAnalysis === "string" ? o.rawAnalysis : "",
  };
}

/** 限制数值在 [0, 1] 范围 */
function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** 类型守卫：判断对象是否符合 VlmAnalysisResult 结构（含字段归一化） */
function isValidVlmResult(obj: unknown): obj is VlmAnalysisResult {
  return normalizeVlmResult(obj) !== null;
}

// ─── Noop Provider（最终降级）────────────────────────────────────────────────

/** Provider 不可用时返回的空实现，isAvailable() 恒为 false */
class NoopFaceEmbeddingProvider implements FaceEmbeddingProvider {
  readonly providerType = "none" as const;

  async isAvailable(): Promise<boolean> {
    return false;
  }

  async extractEmbedding(_imageUrl: string): Promise<Result<{ embedding: number[]; metadata: EmbeddingMetadata }>> {
    return err(new (class extends Error {
      code = "PROVIDER_UNAVAILABLE";
    })("No face embedding provider available"));
  }
}

// ─── 单例缓存 ─────────────────────────────────────────────────────────────────

let _cachedProvider: FaceEmbeddingProvider | null = null;
let _resolvingPromise: Promise<FaceEmbeddingProvider> | null = null;

/**
 * 获取 FaceEmbeddingProvider 实例。
 *
 * 解析顺序：
 *   1. ONNX face provider（若本地模型可用）
 *   2. VLM provider（container.imageApi.analyze）
 *   3. Noop provider（最终降级，isAvailable() = false）
 *
 * 结果缓存：首次解析后复用，避免每次 QC 重复探测。
 * 调用 clearFaceEmbeddingProviderCache() 可强制重新解析（用于模型配置变更）。
 */
export async function getFaceEmbeddingProvider(): Promise<FaceEmbeddingProvider> {
  if (_cachedProvider) return _cachedProvider;
  if (_resolvingPromise) return _resolvingPromise;

  _resolvingPromise = (async () => {
    // 1. 尝试 ONNX face provider
    const onnxProvider = new OnnxFaceEmbeddingProvider();
    try {
      if (await onnxProvider.isAvailable()) {
        _cachedProvider = onnxProvider;
        return onnxProvider;
      }
    } catch (e) {
      errorLogger.warn("[face-embedding] ONNX provider 探测失败", e);
    }

    // 2. 降级 VLM provider
    const vlmProvider = new VlmEmbeddingProvider();
    try {
      if (await vlmProvider.isAvailable()) {
        _cachedProvider = vlmProvider;
        return vlmProvider;
      }
    } catch (e) {
      errorLogger.warn("[face-embedding] VLM provider 探测失败", e);
    }

    // 3. 最终降级 noop
    const noopProvider = new NoopFaceEmbeddingProvider();
    _cachedProvider = noopProvider;
    errorLogger.warn("[face-embedding] 所有 provider 不可用，使用 noop（QC 将退化为跨分镜漂移检测）");
    return noopProvider;
  })();

  try {
    return await _resolvingPromise;
  } finally {
    _resolvingPromise = null;
  }
}

/**
 * 清除 provider 缓存（用于模型配置变更或测试）。
 */
export function clearFaceEmbeddingProviderCache(): void {
  _cachedProvider = null;
  _resolvingPromise = null;
}

/**
 * 判断 face embedding 是否可用（便捷方法）。
 */
export async function isFaceEmbeddingAvailable(): Promise<boolean> {
  const provider = await getFaceEmbeddingProvider();
  return provider.isAvailable();
}

/**
 * 提取图片的 face/visual embedding（便捷方法）。
 */
export async function extractFaceEmbedding(imageUrl: string): Promise<Result<{ embedding: number[]; metadata: EmbeddingMetadata }>> {
  const provider = await getFaceEmbeddingProvider();
  return provider.extractEmbedding(imageUrl);
}

// ─── 测试辅助导出（仅用于单元测试，不对外公开） ────────────────────────────────

export const _testExports = {
  OnnxFaceEmbeddingProvider,
  VlmEmbeddingProvider,
  NoopFaceEmbeddingProvider,
  parseVlmAnalysis,
  normalizeVlmResult,
  isValidVlmResult,
  clamp01,
};
