/**
 * @huggingface/transformers 类型声明
 *
 * 此文件为可选依赖 @huggingface/transformers 提供最小类型声明，
 * 使 typecheck 在未安装该包时也能通过。
 *
 * 实际使用时通过动态 import 加载（local-embedding-provider.ts），
 * 未安装时运行时会 fallback 到 warn 并返回 null。
 */

declare module "@huggingface/transformers" {
  /** pipeline 函数类型（支持泛型任务） */
  export function pipeline<T extends string>(
    task: T,
    modelId: string,
    options?: {
      dtype?: string;
      local_files_only?: boolean;
      progress_callback?: (progress: unknown) => void;
    },
  ): Promise<Pipeline>;

  /** 特征提取 pipeline */
  export interface FeatureExtractionPipeline {
    (
      texts: string | string[],
      options?: {
        pooling?: "mean" | "max" | "cls";
        normalize?: boolean;
      },
    ): Promise<Tensor>;
  }

  /** 通用 pipeline 类型 */
  export type Pipeline = FeatureExtractionPipeline;

  /** Tensor 类型 */
  export class Tensor {
    data: Float32Array | Float64Array | number[];
    dims: number[];
    type: string;
    tolist(): number[][];
  }
}
