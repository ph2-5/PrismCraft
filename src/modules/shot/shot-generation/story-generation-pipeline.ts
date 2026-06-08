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

  notifyProgress(opts.onProgress, {
    stage: "generating",
    message: "正在生成故事规划...",
    progress: 0.1,
  });

  const basePrompt = buildStoryPlanPrompt(story, characters, scenes, elements);
  const enrichedPrompt = opts.enhancedGeneration
    ? enrichPromptWithFewShot(basePrompt, {
        genre: story.genre || "drama",
        tone: story.tone || "neutral",
        beatIndex: 0,
        totalBeats: Math.floor((story.targetDuration || 60) / 5),
        characters,
        scenes,
        elements,
      })
    : basePrompt;

  let rawBeats: unknown[] | null = null;
  let lastValidationErrors: string[] | undefined;
  let planValidation: ValidationResult | null = null;

  const maxAttempts = opts.enhancedGeneration ? opts.maxRetries : 1;

  for (let attempt = 0; attempt <= maxAttempts; attempt++) {
    try {
      const promptToSend =
        opts.enhancedGeneration && lastValidationErrors
          ? buildRetryPrompt(enrichedPrompt, lastValidationErrors)
          : enrichedPrompt;

      const result: ApiResponse<{ text: string }> = await container.textProvider.generateText(
        promptToSend,
        {
          maxTokens: 4000,
          temperature: 0.7,
        },
      );

      if (!result.success || !result.data?.text) {
        throw new Error(result.error || "AI 未返回有效文本");
      }

      rawBeats = parseStoryPlanJSON(result.data.text);
      if (!rawBeats || rawBeats.length === 0) {
        throw new Error("无法解析故事规划 JSON");
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
        message: `参数校验未通过，第${attempt + 1}次修正...`,
        progress: 0.1 + (attempt / maxAttempts) * 0.3,
        retryCount,
      });
    } catch (error) {
      retryCount++;
      if (attempt >= maxAttempts) {
        notifyProgress(opts.onProgress, {
          stage: "failed",
          message: `故事规划生成失败: ${extractErrorMessage(error)}`,
          progress: 0,
          retryCount,
        });
        throw error;
      }

      notifyProgress(opts.onProgress, {
        stage: "generating",
        message: `生成失败，第${attempt + 1}次重试...`,
        progress: 0.1 + (attempt / maxAttempts) * 0.2,
        retryCount,
      });
    }
  }

  if (!rawBeats || !planValidation) {
    throw new Error("故事规划生成失败");
  }

  notifyProgress(opts.onProgress, {
    stage: "post_validating",
    message: "正在校验和修复分镜数据...",
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
        message: `校验失败: ${errorMsgs.join("; ")}`,
        progress: 0,
        validationResults,
        fixDetails,
      });
      throw new Error(`故事规划校验失败: ${errorMsgs.join("; ")}`);
    }

    if (!opts.autoFix) {
      notifyProgress(opts.onProgress, {
        stage: "failed",
        message: `校验失败且未启用自动修复: ${errorMsgs.join("; ")}`,
        progress: 0,
        validationResults,
        fixDetails,
      });
      throw new Error("故事规划校验失败，请检查输入");
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

  notifyProgress(opts.onProgress, {
    stage: "completed",
    message: `故事规划生成完成，${beats.length}个分镜，自动修复${autoFixedCount}处`,
    progress: 1,
    validationResults,
    autoFixedCount,
    retryCount,
    fixDetails,
  });

  return { beats, validationResults, autoFixedCount, retryCount, fixDetails };
}

export { formatValidationResult };
