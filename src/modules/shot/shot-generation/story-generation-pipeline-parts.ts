import {
  validateStoryPlanOutput,
  validateShotParams,
  type ValidationResult,
} from "./shot-validator";
import { enrichPromptWithFewShot } from "./dynamic-few-shot";
import { container } from "@/infrastructure/di";
import type {
  ApiResponse,
  Character,
  Scene,
  Story,
  StoryBeat,
  StoryElement,
} from "@/domain/schemas";
import { errorLogger, extractErrorMessage } from "@/shared/error-logger";
import {
  buildStoryPlanPrompt,
  buildRetryPrompt,
} from "./story-plan-prompt";
import { parseStoryPlanJSON, convertToStoryBeats } from "./story-plan-parser";
import { t } from "@/shared/constants";
import {
  getModelCapabilities,
} from "@/shared/model-capabilities";
import { validateReferenceImageQuality } from "../feature-extraction";
import type { PipelineOptions, PipelineProgress } from "./story-generation-pipeline";

interface RetryParams {
  temperature: number;
  maxTokens: number;
}

/** LLM 重试退避策略参数 */
const RETRY_TEMPERATURE_FLOOR = 0.3;
const RETRY_TEMPERATURE_CEIL = 0.7;
const RETRY_TEMPERATURE_DECAY = 0.4;
const RETRY_MAX_TOKENS_FLOOR = 2000;
const RETRY_MAX_TOKENS_CEIL = 4000;
const RETRY_MAX_TOKENS_DECAY = 2000;

function getRetryParams(attempt: number, maxAttempts: number): RetryParams {
  const safeMaxAttempts = Math.max(maxAttempts, 1);
  const progress = attempt / safeMaxAttempts;
  const temperature = Math.max(RETRY_TEMPERATURE_FLOOR, RETRY_TEMPERATURE_CEIL - progress * RETRY_TEMPERATURE_DECAY);
  const maxTokens = Math.max(RETRY_MAX_TOKENS_FLOOR, RETRY_MAX_TOKENS_CEIL - Math.floor(progress * RETRY_MAX_TOKENS_DECAY));
  return { temperature, maxTokens };
}

export function notifyProgress(
  onProgress: PipelineOptions["onProgress"],
  progress: PipelineProgress,
): void {
  onProgress?.(progress);
}

export function resolvePromptLanguage(
  opts: PipelineOptions,
): "en" | "zh" {
  if (opts.promptLanguage === "en") return "en";
  if (opts.promptLanguage === "auto" && opts.videoModelId) {
    // Task 3.2 Step 2：直接查询模型能力，不再经由 getVideoGenerationStrategy
    const caps = getModelCapabilities(opts.videoModelId);
    return caps.promptLanguage === "en" ? "en" : "zh";
  }
  return "zh";
}

export function resolveModelSupportsLastFrame(
  opts: PipelineOptions,
): boolean {
  // Task 3.2 Step 2：直接查询模型能力，不再经由 supportsLastFrame wrapper
  return opts.videoModelId ? getModelCapabilities(opts.videoModelId).supportsLastFrame : true;
}

export function buildEnrichedPrompt(
  story: Partial<Story>,
  characters: Character[],
  scenes: Scene[],
  elements: StoryElement[],
  opts: PipelineOptions,
  resolvedLanguage: "en" | "zh",
): string {
  const basePrompt = buildStoryPlanPrompt(
    story,
    characters,
    scenes,
    elements,
    resolvedLanguage,
  );
  // 将用户补充指令拼接到基础 prompt 之后（增强模式下也保留此段）
  const userSection = opts.userPrompt?.trim()
    ? `\n\n【用户补充要求】\n${opts.userPrompt.trim()}`
    : "";
  const promptWithUser = userSection ? `${basePrompt}${userSection}` : basePrompt;
  if (!opts.enhancedGeneration) return promptWithUser;
  return enrichPromptWithFewShot(promptWithUser, {
    genre: story.genre || "drama",
    tone: story.tone || "neutral",
    beatIndex: 0,
    totalBeats: Math.floor((story.targetDuration || 60) / 5),
    characters,
    scenes,
    elements,
  }, resolvedLanguage);
}

interface AttemptContext {
  attempt: number;
  maxAttempts: number;
  enrichedPrompt: string;
  lastValidationErrors: string[] | undefined;
  enhancedGeneration: boolean;
  resolvedLanguage: "en" | "zh";
}

export async function callTextProvider(
  ctx: AttemptContext,
): Promise<{ text: string } | { error: string }> {
  const promptToSend =
    ctx.enhancedGeneration && ctx.lastValidationErrors
      ? buildRetryPrompt(ctx.enrichedPrompt, ctx.lastValidationErrors, ctx.resolvedLanguage)
      : ctx.enrichedPrompt;
  const retryParams = getRetryParams(ctx.attempt, ctx.maxAttempts);
  if (ctx.attempt > 0) {
    errorLogger.debug(
      `[Pipeline] Retry attempt ${ctx.attempt}/${ctx.maxAttempts}, adjusted params: temperature=${retryParams.temperature.toFixed(2)}, maxTokens=${retryParams.maxTokens}`,
    );
  }
  const result: ApiResponse<{ text: string }> =
    await container.textProvider.generateText(promptToSend, {
      maxTokens: retryParams.maxTokens,
      temperature: retryParams.temperature,
    });
  if (!result.success || !result.data?.text) {
    return { error: result.error || "AI 未返回有效文本" };
  }
  return { text: result.data.text };
}

export interface PlanParseResult {
  rawBeats: unknown[] | null;
  validation: ValidationResult;
}

export function parseAndValidatePlan(
  text: string,
): PlanParseResult | null {
  const rawBeats = parseStoryPlanJSON(text);
  if (!rawBeats || rawBeats.length === 0) {
    return null;
  }
  const validation = validateStoryPlanOutput(rawBeats);
  return { rawBeats, validation };
}

export function handleAttemptError(
  error: unknown,
  attempt: number,
  maxAttempts: number,
  onProgress: PipelineOptions["onProgress"],
  retryCount: number,
): { shouldRethrow: true; retryCount: number } | { shouldRethrow: false; retryCount: number } {
  const newRetryCount = retryCount + 1;
  if (attempt >= maxAttempts - 1) {
    notifyProgress(onProgress, {
      stage: "failed",
      message:
        t("error.storyPlanGenFailed") + ": " + extractErrorMessage(error),
      progress: 0,
      retryCount: newRetryCount,
    });
    return { shouldRethrow: true, retryCount: newRetryCount };
  }
  notifyProgress(onProgress, {
    stage: "generating",
    message: t("pipeline.genFailedRetry", { attempt: attempt + 1 }),
    progress: 0.1 + (attempt / maxAttempts) * 0.2,
    retryCount: newRetryCount,
  });
  return { shouldRethrow: false, retryCount: newRetryCount };
}

export function applyPostValidationAutoFix(
  planValidation: ValidationResult,
): { autoFixedCount: number; fixDetails: string[] } {
  let autoFixedCount = 0;
  const fixDetails: string[] = [];
  if (planValidation.autoFixed.length > 0) {
    autoFixedCount += planValidation.autoFixed.length;
    fixDetails.push(...planValidation.autoFixed.map((f) => `[规划] ${f}`));
    errorLogger.info(
      "[Pipeline] 自动修复",
      planValidation.autoFixed.join("; "),
    );
  }
  return { autoFixedCount, fixDetails };
}

export function handlePlanValidationErrors(
  planValidation: ValidationResult,
  opts: PipelineOptions,
  validationResults: ValidationResult[],
  fixDetails: string[],
): void {
  if (planValidation.errors.length === 0) return;
  const errorMsgs = planValidation.errors.map((e) => e.message);
  if (opts.strictMode) {
    notifyProgress(opts.onProgress, {
      stage: "failed",
      message: t("pipeline.validationFailed") + ": " + errorMsgs.join("; "),
      progress: 0,
      validationResults,
      fixDetails,
    });
    throw new Error(
      t("error.storyPlanValidationFailed") + ": " + errorMsgs.join("; "),
    );
  }
  if (!opts.autoFix) {
    notifyProgress(opts.onProgress, {
      stage: "failed",
      message:
        t("pipeline.validationFailedNoAutoFix") + ": " + errorMsgs.join("; "),
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

export function stripUnsupportedLastFramePrompts(
  beats: StoryBeat[],
  modelSupportsLastFrame: boolean,
): void {
  if (modelSupportsLastFrame) return;
  for (const beat of beats) {
    if (beat.lastFramePrompt) {
      errorLogger.info(
        `[Pipeline] Video model does not support last frame, removing lastFramePrompt from beat "${beat.title || beat.id}"`,
      );
      beat.lastFramePrompt = undefined;
    }
  }
}

interface ShotFixAccumulator {
  autoFixedCount: number;
  fixDetails: string[];
  validationResults: ValidationResult[];
}

export function applyShotParamsAutoFix(
  beats: StoryBeat[],
  opts: PipelineOptions,
  accumulator: ShotFixAccumulator,
): void {
  for (const beat of beats) {
    if (!beat.shotType && !beat.camera) continue;
    const shotValidation = validateShotParams({
      prompt: beat.content || beat.description || "",
      shotType: beat.shotType,
      duration: beat.duration,
      cameraAngle: beat.camera?.angle,
      cameraMovement: beat.camera?.movement,
    });
    accumulator.validationResults.push(shotValidation);

    if (shotValidation.autoFixed.length > 0) {
      accumulator.autoFixedCount += shotValidation.autoFixed.length;
      accumulator.fixDetails.push(
        ...shotValidation.autoFixed.map(
          (f) => `[${beat.title || "未命名分镜"}] ${f}`,
        ),
      );
    }

    if (shotValidation.autoFixed.length > 0 && opts.autoFix) {
      applyShotAutoFixToBeat(beat, shotValidation);
    }
  }
}

function applyShotAutoFixToBeat(
  beat: StoryBeat,
  shotValidation: ValidationResult,
): void {
  const data = shotValidation.data as {
    shotType?: StoryBeat["shotType"];
    duration?: StoryBeat["duration"];
    cameraAngle?: NonNullable<NonNullable<StoryBeat["camera"]>["angle"]>;
    cameraMovement?: NonNullable<NonNullable<StoryBeat["camera"]>["movement"]>;
    shotInstruction?: StoryBeat["shotInstruction"];
  };
  for (const fix of shotValidation.autoFixed) {
    if (fix.includes("shotType")) {
      beat.shotType = data.shotType;
    }
    if (fix.includes("duration")) {
      beat.duration = data.duration as StoryBeat["duration"];
    }
    if (fix.includes("cameraAngle") && beat.camera) {
      beat.camera.angle = data.cameraAngle!;
    }
    if (fix.includes("cameraMovement") && beat.camera) {
      beat.camera.movement = data.cameraMovement!;
    }
  }
  // PR 2a dual-write：同步更新 shotInstruction（fixShotParams 已填充 data.shotInstruction）
  if (data.shotInstruction) {
    beat.shotInstruction = data.shotInstruction;
  }
}

export async function checkReferenceImageQuality(
  elements: StoryElement[],
  fixDetails: string[],
): Promise<void> {
  for (const element of elements) {
    const primaryBinding =
      element.bindings.find((b) => b.isPrimary) || element.bindings[0];
    if (!primaryBinding?.url) continue;
    try {
      const quality = await validateReferenceImageQuality(
        primaryBinding.url,
        element.type,
      );
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
      errorLogger.debug(
        `[Pipeline] 参考图质量检查跳过: ${element.name}`,
      );
    }
  }
}

export { convertToStoryBeats };
