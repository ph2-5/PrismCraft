import { generateStoryPlanPrompt } from "../prompt/prompt-service";
import type { CharacterInput, SceneInput } from "../prompt/prompt-service";
import { selectFewShotExamples, buildFewShotPrompt, type FewShotInput } from "./story-few-shot";
import {
  type RawStoryBeat,
  type StoryBeat,
  type StoryPlanValidationResult,
  validateStoryPlan,
  convertToStoryBeats,
  fixShotParams,
  parseStoryPlanJSON,
} from "./story-service";

export interface StoryInput {
  title?: string;
  description?: string;
  genre?: string;
  tone?: string;
  targetDuration?: number;
}

export interface GenerateStoryPlanOptions {
  maxRetries?: number;
  autoFix?: boolean;
  fewShotCount?: number;
  enhancedGeneration?: boolean;
  planPrompt?: string;
}

export interface TextGenerationResult {
  success: boolean;
  data?: { text?: string };
  error?: string | { code: string; message: string };
}

export interface GenerateStoryPlanResult {
  beats: StoryBeat[];
  validationResults: StoryPlanValidationResult[];
  autoFixedCount: number;
  retryCount: number;
  fixDetails: string[];
}

function isObjectArray<T extends object>(value: unknown[]): value is T[] {
  return value.every((v) => typeof v === "object" && v !== null);
}

function buildEnrichedPrompt(
  story: StoryInput,
  characters: unknown[],
  scenes: unknown[],
  opts: GenerateStoryPlanOptions,
): string {
  const basePrompt = opts.planPrompt || generateStoryPlanPrompt({
    title: story.title, description: story.description, genre: story.genre,
    tone: story.tone, targetDuration: story.targetDuration,
    characters: isObjectArray<CharacterInput>(characters) ? characters : [],
    scenes: isObjectArray<SceneInput>(scenes) ? scenes : [],
  });

  const fewShotContext: FewShotInput = {
    genre: story.genre || "drama", tone: story.tone || "neutral",
    beatIndex: 0, totalBeats: Math.floor((story.targetDuration || 60) / 5),
  };
  const fewShotExamples = selectFewShotExamples(fewShotContext, opts.fewShotCount);
  const fewShotSection = buildFewShotPrompt(fewShotExamples);
  return `${basePrompt}\n\n${fewShotSection}`;
}

function buildPromptWithCorrections(enrichedPrompt: string, lastValidationErrors?: string[]): string {
  if (!lastValidationErrors) return enrichedPrompt;
  const corrections = lastValidationErrors.map((e, i) => `${i + 1}. ${e}`).join("\n");
  return `${enrichedPrompt}\n\n【重要修正要求】上一轮生成的参数存在以下问题，请务必修正：\n${corrections}`;
}

async function executeGenerationAttempt(
  enrichedPrompt: string,
  lastValidationErrors: string[] | undefined,
  generateTextFn: (prompt: string, opts: Record<string, unknown>) => Promise<TextGenerationResult>,
): Promise<{ rawBeats: RawStoryBeat[] | null; validation?: StoryPlanValidationResult; error?: string }> {
  try {
    const promptToSend = buildPromptWithCorrections(enrichedPrompt, lastValidationErrors);
    const result = await generateTextFn(promptToSend, { maxTokens: 4000, temperature: 0.7 });
    if (!result.success || !result.data?.text) {
      const errMsg = typeof result.error === "string" ? result.error : result.error?.message || "AI 未返回有效文本";
      return { rawBeats: null, error: errMsg };
    }

    const rawBeats = parseStoryPlanJSON(result.data.text);
    if (!rawBeats || rawBeats.length === 0) return { rawBeats: null, error: "STORY_PLAN_PARSE_FAILED" };

    const validation = validateStoryPlan(rawBeats);
    return { rawBeats, validation };
  } catch (error) {
    return { rawBeats: null, error: error instanceof Error ? error.message : String(error) };
  }
}

function applyShotParamsFixes(
  beats: StoryBeat[],
  autoFix: boolean,
  autoFixedCount: number,
  fixDetails: string[],
): number {
  let count = autoFixedCount;
  for (const beat of beats) {
    if (!beat.shotType && !beat.camera) continue;
    const { fixed, autoFixed } = fixShotParams({
      shotType: beat.shotType, cameraAngle: beat.camera?.angle,
      cameraMovement: beat.camera?.movement, duration: beat.duration,
    });
    if (autoFixed.length === 0 || !autoFix) continue;

    count += autoFixed.length;
    fixDetails.push(...autoFixed.map((f: string) => `[${beat.title}] ${f}`));
    if (fixed.shotType) beat.shotType = fixed.shotType;
    if (fixed.duration) beat.duration = fixed.duration;
    if (beat.camera) {
      if (fixed.cameraAngle) beat.camera.angle = fixed.cameraAngle;
      if (fixed.cameraMovement) beat.camera.movement = fixed.cameraMovement;
    }
  }
  return count;
}

export async function generateStoryPlanWithValidation(
  story: StoryInput,
  characters: unknown[],
  scenes: unknown[],
  options: GenerateStoryPlanOptions,
  generateTextFn: (prompt: string, opts: Record<string, unknown>) => Promise<TextGenerationResult>,
): Promise<GenerateStoryPlanResult> {
  const opts: GenerateStoryPlanOptions = { maxRetries: 5, autoFix: true, fewShotCount: 3, enhancedGeneration: true, ...options };
  const maxRetries = opts.maxRetries ?? 5;
  const enrichedPrompt = buildEnrichedPrompt(story, characters, scenes, opts);

  let rawBeats: RawStoryBeat[] | null = null;
  let lastValidationErrors: string[] | undefined;
  let retryCount = 0;
  const validationResults: StoryPlanValidationResult[] = [];
  let autoFixedCount = 0;
  const fixDetails: string[] = [];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await executeGenerationAttempt(enrichedPrompt, lastValidationErrors, generateTextFn);

    if (result.validation) {
      rawBeats = result.rawBeats;
      validationResults.push(result.validation);
      autoFixedCount += result.validation.autoFixed.length;
      fixDetails.push(...result.validation.autoFixed);
      if (result.validation.errors.length === 0) break;
      lastValidationErrors = result.validation.errors;
    }

    retryCount++;
    if (attempt >= maxRetries && result.error) {
      throw new Error(`STORY_PLAN_GENERATION_FAILED: ${result.error}`);
    }
  }

  if (!rawBeats) throw new Error("STORY_PLAN_GENERATION_FAILED");

  const beats = convertToStoryBeats(rawBeats, opts.enhancedGeneration);
  autoFixedCount = applyShotParamsFixes(beats, !!opts.autoFix, autoFixedCount, fixDetails);

  return { beats, validationResults, autoFixedCount, retryCount, fixDetails };
}
