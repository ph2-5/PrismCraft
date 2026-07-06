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
