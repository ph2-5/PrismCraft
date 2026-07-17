/**
 * @file Story Generation Pipeline — 故事生成流水线
 *
 * 职责：
 * - 将用户输入的故事文本转化为结构化分镜（StoryBeat[]）
 * - 多轮重试 + LLM 调用 + 计划解析 + 后验证自动修复
 * - 能力自适应：根据模型是否支持首尾帧，自动剥离不支持的字段
 * - 参考图质量检查 + 分镜参数自动修正（applyShotParamsAutoFix）
 * - 通过 PipelineProgress 向 UI 推送进度（validating/generating/post_validating/completed/failed）
 *
 * 流程：
 *   validating → generating（LLM 调用，maxRetries 次重试）
 *              → post_validating（后验证 + 自动修复）
 *              → completed / failed
 *
 * 依赖：
 * - story-generation-pipeline-parts：拆分出的辅助函数（保持本文件复杂度可控）
 * - shot-validator：分镜验证器
 * - textProvider（通过 callTextProvider 间接调用）
 *
 * 调用方：
 * - useStoryGeneration hook（story 模块）
 * - Agent 工具（story-tools.ts 的 generate_storyboard）
 *
 * 关键不变式：
 * - 失败时必须推送 failed 阶段进度，确保 UI 状态收敛
 * - LLM 调用失败不中断流水线，进入下一轮重试
 * - 后验证自动修复仅修改可修复字段，不改变分镜数量
 */

import {
  formatValidationResult,
  type ValidationResult,
} from "./shot-validator";
import type {
  Character,
  Scene,
  Story,
  StoryBeat,
  StoryElement,
} from "@/domain/schemas";
import { t } from "@/shared/constants";
import {
  notifyProgress,
  resolvePromptLanguage,
  resolveModelSupportsLastFrame,
  buildEnrichedPrompt,
  callTextProvider,
  parseAndValidatePlan,
  handleAttemptError,
  applyPostValidationAutoFix,
  handlePlanValidationErrors,
  stripUnsupportedLastFramePrompts,
  applyShotParamsAutoFix,
  checkReferenceImageQuality,
  convertToStoryBeats,
} from "./story-generation-pipeline-parts";

export interface PipelineProgress {
  stage:
    | "validating"
    | "generating"
    | "post_validating"
    | "completed"
    | "failed";
  message: string;
  progress: number;
  validationResults?: ValidationResult[];
  autoFixedCount?: number;
  retryCount?: number;
  fixDetails?: string[];
}

export interface PipelineOptions {
  maxRetries: number;
  autoFix: boolean;
  fewShotCount: number;
  strictMode: boolean;
  showFixDetails: boolean;
  enhancedGeneration: boolean;
  videoModelId?: string;
  promptLanguage?: "en" | "zh" | "auto";
  onProgress?: (progress: PipelineProgress) => void;
  /**
   * 用户补充的额外指令，会拼接到 buildStoryPlanPrompt 生成的基础 prompt 之后。
   * 用于让底部输入栏收集的"用户描述"参与到 AI 故事规划中。
   */
  userPrompt?: string;
}

export const DEFAULT_OPTIONS: PipelineOptions = {
  maxRetries: 5,
  autoFix: true,
  fewShotCount: 3,
  strictMode: false,
  showFixDetails: true,
  enhancedGeneration: true,
};

export const STRICT_OPTIONS: PipelineOptions = {
  maxRetries: 8,
  autoFix: false,
  fewShotCount: 3,
  strictMode: true,
  showFixDetails: true,
  enhancedGeneration: true,
};

export async function generateStoryPlanWithValidation(
  story: Partial<Story>,
  characters: Character[],
  scenes: Scene[],
  elements: StoryElement[] = [],
  options: Partial<PipelineOptions> = {},
  globalEnhancedGeneration: boolean = true,
): Promise<{
  beats: StoryBeat[];
  validationResults: ValidationResult[];
  autoFixedCount: number;
  retryCount: number;
  fixDetails: string[];
}> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const validationResults: ValidationResult[] = [];
  let retryCount = 0;

  const resolvedLanguage = resolvePromptLanguage(opts);
  const modelSupportsLastFrame = resolveModelSupportsLastFrame(opts);

  notifyProgress(opts.onProgress, {
    stage: "generating",
    message: "正在生成故事规划...",
    progress: 0.1,
  });

  const enrichedPrompt = buildEnrichedPrompt(
    story,
    characters,
    scenes,
    elements,
    opts,
    resolvedLanguage,
  );

  const { rawBeats, planValidation, retryCount: finalRetryCount } =
    await runGenerationLoop({
      opts,
      enrichedPrompt,
      resolvedLanguage,
      validationResults,
      initialRetryCount: retryCount,
    });
  retryCount = finalRetryCount;

  if (!rawBeats || !planValidation) {
    throw new Error(t("error.storyPlanGenFailed"));
  }

  notifyProgress(opts.onProgress, {
    stage: "post_validating",
    message: t("pipeline.postValidating"),
    progress: 0.6,
  });

  const { autoFixedCount, fixDetails } =
    applyPostValidationAutoFix(planValidation);

  handlePlanValidationErrors(
    planValidation,
    opts,
    validationResults,
    fixDetails,
  );

  const beats = convertToStoryBeats(
    planValidation.data as Record<string, unknown>[],
    story,
    globalEnhancedGeneration,
  );

  stripUnsupportedLastFramePrompts(beats, modelSupportsLastFrame);

  const shotFixAccumulator = {
    autoFixedCount,
    fixDetails,
    validationResults,
  };
  applyShotParamsAutoFix(beats, opts, shotFixAccumulator);

  await checkReferenceImageQuality(elements, shotFixAccumulator.fixDetails);

  notifyProgress(opts.onProgress, {
    stage: "completed",
    message: t("pipeline.completed", {
      count: beats.length,
      fixed: shotFixAccumulator.autoFixedCount,
    }),
    progress: 1,
    validationResults,
    autoFixedCount: shotFixAccumulator.autoFixedCount,
    retryCount,
    fixDetails: shotFixAccumulator.fixDetails,
  });

  return {
    beats,
    validationResults,
    autoFixedCount: shotFixAccumulator.autoFixedCount,
    retryCount,
    fixDetails: shotFixAccumulator.fixDetails,
  };
}

interface GenerationLoopParams {
  opts: PipelineOptions;
  enrichedPrompt: string;
  resolvedLanguage: "en" | "zh";
  validationResults: ValidationResult[];
  initialRetryCount: number;
}

interface GenerationLoopResult {
  rawBeats: unknown[] | null;
  planValidation: ValidationResult | null;
  retryCount: number;
}

async function runGenerationLoop(
  params: GenerationLoopParams,
): Promise<GenerationLoopResult> {
  const { opts, enrichedPrompt, resolvedLanguage, validationResults } = params;
  let rawBeats: unknown[] | null = null;
  let lastValidationErrors: string[] | undefined;
  let planValidation: ValidationResult | null = null;
  let retryCount = params.initialRetryCount;

  const maxAttempts = opts.enhancedGeneration ? opts.maxRetries + 1 : 1;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await callTextProvider({
        attempt,
        maxAttempts,
        enrichedPrompt,
        lastValidationErrors,
        enhancedGeneration: opts.enhancedGeneration,
        resolvedLanguage,
      });

      if ("error" in result) {
        throw new Error(result.error);
      }

      const parsed = parseAndValidatePlan(result.text);
      if (!parsed) {
        throw new Error(t("error.storyPlanParseFailed"));
      }

      rawBeats = parsed.rawBeats;
      planValidation = parsed.validation;
      validationResults.push(planValidation);

      if (!opts.enhancedGeneration || planValidation.errors.length === 0) {
        break;
      }

      lastValidationErrors = planValidation.errors.map((e) => e.message);
      retryCount++;

      notifyProgress(opts.onProgress, {
        stage: "generating",
        message: t("pipeline.validatingRetry", { attempt: attempt + 1 }),
        progress: 0.1 + (attempt / maxAttempts) * 0.3,
        retryCount,
      });
    } catch (error) {
      const handled = handleAttemptError(
        error,
        attempt,
        maxAttempts,
        opts.onProgress,
        retryCount,
      );
      retryCount = handled.retryCount;
      if (handled.shouldRethrow) {
        throw error;
      }
    }
  }

  return { rawBeats, planValidation, retryCount };
}

export { formatValidationResult };
