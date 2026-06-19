import {
  validateStoryPlanOutput,
  validateShotParams,
  formatValidationResult,
  type ValidationResult,
} from "./shot-validator";
import { enrichPromptWithFewShot } from "./dynamic-few-shot";
import { container } from "@/infrastructure/di";
import type { ApiResponse, Character, Scene, Story, StoryBeat, StoryElement } from "@/domain/schemas";
import { errorLogger, extractErrorMessage } from "@/shared/error-logger";
import { buildStoryPlanPrompt, buildRetryPrompt } from "./story-plan-prompt";
import { parseStoryPlanJSON, convertToStoryBeats } from "./story-plan-parser";
import { t } from "@/shared/constants";
import { getVideoGenerationStrategy, supportsLastFrame } from "@/shared/model-capabilities";
import { validateReferenceImageQuality } from "../feature-extraction";

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

function notifyProgress(
  onProgress: PipelineOptions["onProgress"],
  progress: PipelineProgress,
) {
  onProgress?.(progress);
}

interface RetryParams {
  temperature: number;
  maxTokens: number;
}

function getRetryParams(attempt: number, maxAttempts: number): RetryParams {
  const safeMaxAttempts = Math.max(maxAttempts, 1);
  const progress = attempt / safeMaxAttempts;
  const temperature = Math.max(0.3, 0.7 - progress * 0.4);
  const maxTokens = Math.max(2000, 4000 - Math.floor(progress * 2000));
  return { temperature, maxTokens };
}

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
  let autoFixedCount = 0;
  let retryCount = 0;
  const fixDetails: string[] = [];

  let resolvedLanguage: "en" | "zh" = "zh";
  if (opts.promptLanguage === "en") {
    resolvedLanguage = "en";
  } else if (opts.promptLanguage === "auto" && opts.videoModelId) {
    const strategy = getVideoGenerationStrategy(opts.videoModelId);
    resolvedLanguage = strategy.promptLanguage === "en" ? "en" : "zh";
  }

  const modelSupportsLastFrame = opts.videoModelId
    ? supportsLastFrame(opts.videoModelId)
    : true;

  notifyProgress(opts.onProgress, {
    stage: "generating",
    message: "正在生成故事规划...",
    progress: 0.1,
  });

  const basePrompt = buildStoryPlanPrompt(story, characters, scenes, elements, resolvedLanguage);
  const enrichedPrompt = opts.enhancedGeneration
    ? enrichPromptWithFewShot(basePrompt, {
        genre: story.genre || "drama",
        tone: story.tone || "neutral",
        beatIndex: 0,
        totalBeats: Math.floor((story.targetDuration || 60) / 5),
        characters,
        scenes,
        elements,
      }, resolvedLanguage)
    : basePrompt;

  let rawBeats: unknown[] | null = null;
  let lastValidationErrors: string[] | undefined;
  let planValidation: ValidationResult | null = null;

  const maxAttempts = opts.enhancedGeneration ? opts.maxRetries + 1 : 1;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const promptToSend =
        opts.enhancedGeneration && lastValidationErrors
          ? buildRetryPrompt(enrichedPrompt, lastValidationErrors, resolvedLanguage)
          : enrichedPrompt;

      const retryParams = getRetryParams(attempt, maxAttempts);

      if (attempt > 0) {
        errorLogger.debug(
          `[Pipeline] Retry attempt ${attempt}/${maxAttempts}, adjusted params: temperature=${retryParams.temperature.toFixed(2)}, maxTokens=${retryParams.maxTokens}`,
        );
      }

      const result: ApiResponse<{ text: string }> = await container.textProvider.generateText(
        promptToSend,
        {
          maxTokens: retryParams.maxTokens,
          temperature: retryParams.temperature,
        },
      );

      if (!result.success || !result.data?.text) {
        throw new Error(result.error || "AI 未返回有效文本");
      }

      rawBeats = parseStoryPlanJSON(result.data.text);
      if (!rawBeats || rawBeats.length === 0) {
        throw new Error(t("error.storyPlanParseFailed"));
      }

      planValidation = validateStoryPlanOutput(rawBeats);
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
      retryCount++;
      if (attempt >= maxAttempts - 1) {
        notifyProgress(opts.onProgress, {
          stage: "failed",
          message: t("error.storyPlanGenFailed") + ": " + extractErrorMessage(error),
          progress: 0,
          retryCount,
        });
        throw error;
      }

      notifyProgress(opts.onProgress, {
        stage: "generating",
        message: t("pipeline.genFailedRetry", { attempt: attempt + 1 }),
        progress: 0.1 + (attempt / maxAttempts) * 0.2,
        retryCount,
      });
    }
  }

  if (!rawBeats || !planValidation) {
    throw new Error(t("error.storyPlanGenFailed"));
  }

  notifyProgress(opts.onProgress, {
    stage: "post_validating",
    message: t("pipeline.postValidating"),
    progress: 0.6,
  });

  if (planValidation.autoFixed.length > 0) {
    autoFixedCount += planValidation.autoFixed.length;
    fixDetails.push(...planValidation.autoFixed.map((f) => `[规划] ${f}`));
    errorLogger.info("[Pipeline] 自动修复", planValidation.autoFixed.join("; "));
  }

  if (planValidation.errors.length > 0) {
    const errorMsgs = planValidation.errors.map((e) => e.message);

    if (opts.strictMode) {
      notifyProgress(opts.onProgress, {
        stage: "failed",
        message: t("pipeline.validationFailed") + ": " + errorMsgs.join("; "),
        progress: 0,
        validationResults,
        fixDetails,
      });
      throw new Error(t("error.storyPlanValidationFailed") + ": " + errorMsgs.join("; "));
    }

    if (!opts.autoFix) {
      notifyProgress(opts.onProgress, {
        stage: "failed",
        message: t("pipeline.validationFailedNoAutoFix") + ": " + errorMsgs.join("; "),
        progress: 0,
        validationResults,
        fixDetails,
      });
      throw new Error(t("error.storyPlanValidationFailed"));
    }

    errorLogger.warn(
      `[Pipeline] 经过 ${opts.maxRetries} 次重试后仍有错误，应用自动修复`,
      errorMsgs,
    );
  }

  const beats = convertToStoryBeats(
    planValidation.data as Record<string, unknown>[],
    story,
    globalEnhancedGeneration,
  );

  if (!modelSupportsLastFrame) {
    for (const beat of beats) {
      if (beat.lastFramePrompt) {
        errorLogger.info(
          `[Pipeline] Video model does not support last frame, removing lastFramePrompt from beat "${beat.title || beat.id}"`,
        );
        beat.lastFramePrompt = undefined;
      }
    }
  }

  for (const beat of beats) {
    if (beat.shotType || beat.camera) {
      const shotValidation = validateShotParams({
        prompt: beat.content || beat.description || "",
        shotType: beat.shotType,
        duration: beat.duration,
        cameraAngle: beat.camera?.angle,
        cameraMovement: beat.camera?.movement,
      });
      validationResults.push(shotValidation);

      if (shotValidation.autoFixed.length > 0) {
        autoFixedCount += shotValidation.autoFixed.length;
        fixDetails.push(
          ...shotValidation.autoFixed.map(
            (f) => `[${beat.title || "未命名分镜"}] ${f}`,
          ),
        );
      }

      if (shotValidation.autoFixed.length > 0 && opts.autoFix) {
        for (const fix of shotValidation.autoFixed) {
          if (fix.includes("shotType")) {
            beat.shotType = shotValidation.data
              .shotType as StoryBeat["shotType"];
          }
          if (fix.includes("duration")) {
            beat.duration = shotValidation.data.duration;
          }
          if (fix.includes("cameraAngle") && beat.camera) {
            beat.camera.angle = shotValidation.data
              .cameraAngle as typeof beat.camera.angle;
          }
          if (fix.includes("cameraMovement") && beat.camera) {
            beat.camera.movement = shotValidation.data
              .cameraMovement as typeof beat.camera.movement;
          }
        }
      }
    }
  }

  // Check reference image quality for bound elements
  for (const element of elements) {
    const primaryBinding = element.bindings.find((b) => b.isPrimary) || element.bindings[0];
    if (!primaryBinding?.url) continue;

    try {
      const quality = await validateReferenceImageQuality(primaryBinding.url, element.type);
      if (!quality.isValid) {
        const qualityWarning = `[${element.name}] 参考图质量不达标: ${quality.issues.join("; ")}`;
        fixDetails.push(qualityWarning);
        errorLogger.warn(`[Pipeline] ${qualityWarning}`);
      } else if (quality.clarityScore < 0.5) {
        const qualityWarning = `[${element.name}] 参考图清晰度较低(得分:${quality.clarityScore.toFixed(2)})，可能影响生成质量`;
        fixDetails.push(qualityWarning);
        errorLogger.warn(`[Pipeline] ${qualityWarning}`);
      }
    } catch {
      // validateReferenceImageQuality failure should not block generation
      errorLogger.debug(`[Pipeline] 参考图质量检查跳过: ${element.name}`);
    }
  }

  notifyProgress(opts.onProgress, {
    stage: "completed",
    message: t("pipeline.completed", { count: beats.length, fixed: autoFixedCount }),
    progress: 1,
    validationResults,
    autoFixedCount,
    retryCount,
    fixDetails,
  });

  return { beats, validationResults, autoFixedCount, retryCount, fixDetails };
}

export { formatValidationResult };
