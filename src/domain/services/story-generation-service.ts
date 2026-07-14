import type { StoryBeat, Character, Scene, StoryElement, StoryStyleGuide, ShotInstruction } from "@/domain/schemas";
import type { Result } from "@/domain/types";
import { ok, err, ValidationError } from "@/domain/types";
import { getFirstFrameUrl, getLastFrameUrl } from "@/domain/utils/frame-pair-accessors";
import { resolveCharacterRefs, resolveSceneRef } from "./reference-resolver";

interface BeatGenerationContext {
  beat: StoryBeat;
  prevBeat: StoryBeat | null;
  characters: Character[];
  scenes: Scene[];
  elements: StoryElement[];
}

interface ResolvedGenerationParams {
  characterRefs: string[];
  sceneRef: string | undefined;
  prevKeyframeUrl: string | undefined;
  prevLastFrameUrl: string | undefined;
  prevVideoUrl: string | undefined;
}

function resolveGenerationContext(ctx: BeatGenerationContext): ResolvedGenerationParams {
  const { beat, prevBeat, characters, scenes, elements } = ctx;

  const characterIds = beat.characterIds || [];
  const characterRefs = resolveCharacterRefs(characterIds, characters, beat, elements);

  const sceneId = beat.sceneId;
  const sceneObj = sceneId
    ? scenes.find((s) => s.id === sceneId)
    : undefined;
  const sceneRef = sceneObj ? resolveSceneRef(sceneObj) : undefined;

  return {
    characterRefs,
    sceneRef,
    prevKeyframeUrl: prevBeat?.keyframe?.imageUrl || undefined,
    prevLastFrameUrl: getLastFrameUrl(prevBeat?.framePair) || undefined,
    prevVideoUrl: prevBeat?.videoGen?.videoUrl || undefined,
  };
}

/** 构建首尾帧约束提示词 */
function buildFramePromptsSection(
  firstFrame: NonNullable<NonNullable<StoryBeat["framePair"]>["firstFrame"]> | undefined,
  lastFrame: NonNullable<NonNullable<StoryBeat["framePair"]>["lastFrame"]> | undefined,
  useEnglish: boolean,
): string | undefined {
  const framePrompts: string[] = [];
  if (firstFrame?.prompt) {
    framePrompts.push(useEnglish
      ? `First frame (video start): ${firstFrame.prompt}`
      : `首帧画面（视频开始时的画面）：${firstFrame.prompt}`);
  }
  if (lastFrame?.prompt) {
    framePrompts.push(useEnglish
      ? `Last frame (video end): ${lastFrame.prompt}`
      : `尾帧画面（视频结束时的画面）：${lastFrame.prompt}`);
  }
  if (framePrompts.length === 0) return undefined;
  return useEnglish
    ? `Frame Constraints:\n${framePrompts.join("\n")}\n\nVideo generation requirements: The video must start from the first frame and transition to the last frame. Maintain strict visual consistency between frames—character appearance, scene atmosphere, and lighting must be consistent, with smooth and natural motion transitions.`
    : `【首尾帧画面约束】\n${framePrompts.join("\n")}\n\n视频生成要求：视频必须从首帧画面开始，运动过渡到尾帧画面结束。严格保持首帧到尾帧的视觉连贯性，角色外观、场景氛围、光影效果必须一致，运动过渡自然流畅。`;
}

/** 构建视觉风格指南提示词 */
function buildStyleGuideSection(styleGuide: StoryStyleGuide, useEnglish: boolean): string | undefined {
  const styleParts: string[] = [];
  if (styleGuide.artStyle) styleParts.push(useEnglish ? `Art style: ${styleGuide.artStyle}` : `艺术风格：${styleGuide.artStyle}`);
  if (styleGuide.moodAtmosphere) styleParts.push(useEnglish ? `Mood/atmosphere: ${styleGuide.moodAtmosphere}` : `氛围：${styleGuide.moodAtmosphere}`);
  if (styleGuide.colorPalette?.length) styleParts.push(useEnglish ? `Color palette: ${styleGuide.colorPalette.join(", ")}` : `色彩方案：${styleGuide.colorPalette.join("、")}`);
  if (styleGuide.stylePrompt) styleParts.push(useEnglish ? `Style reference: ${styleGuide.stylePrompt}` : `风格参考：${styleGuide.stylePrompt}`);
  if (styleParts.length === 0) return undefined;
  return `${useEnglish ? "Visual Style Guide:" : "视觉风格指南："}\n${styleParts.join("\n")}`;
}

/** 构建镜头指令提示词 */
function buildShotInstructionSection(shotInstruction: ShotInstruction, useEnglish: boolean): string | undefined {
  const shotParts: string[] = [];
  if (shotInstruction.shotSize) shotParts.push(useEnglish ? `Shot size: ${shotInstruction.shotSize}` : `景别：${shotInstruction.shotSize}`);
  if (shotInstruction.cameraMovement) shotParts.push(useEnglish ? `Camera movement: ${shotInstruction.cameraMovement}` : `镜头运动：${shotInstruction.cameraMovement}`);
  if (shotInstruction.cameraAngle) shotParts.push(useEnglish ? `Camera angle: ${shotInstruction.cameraAngle}` : `镜头角度：${shotInstruction.cameraAngle}`);
  if (shotParts.length === 0) return undefined;
  return `${useEnglish ? "Camera Direction:" : "镜头指令："}\n${shotParts.join("\n")}`;
}

function buildVideoPrompt(
  beat: StoryBeat,
  basePrompt: string,
  promptLanguage: "en" | "zh" | "auto" = "auto",
  styleGuide?: StoryStyleGuide,
  shotInstruction?: ShotInstruction,
): string {
  const framePair = beat.framePair;
  const useEnglish = promptLanguage === "en" || (promptLanguage === "auto" && /^[a-zA-Z]/.test(basePrompt));

  const sections: string[] = [basePrompt];

  const frameSection = buildFramePromptsSection(framePair?.firstFrame, framePair?.lastFrame, useEnglish);
  if (frameSection) sections.push(frameSection);

  if (styleGuide) {
    const styleSection = buildStyleGuideSection(styleGuide, useEnglish);
    if (styleSection) sections.push(styleSection);
  }

  if (shotInstruction) {
    const shotSection = buildShotInstructionSection(shotInstruction, useEnglish);
    if (shotSection) sections.push(shotSection);
  }

  return sections.join("\n\n");
}

function validateGenerationPrereqs(
  beat: StoryBeat,
  type: "keyframe" | "framePair" | "video",
): Result<void> {
  switch (type) {
    case "keyframe": {
      if (!beat.id) {
        return err(new ValidationError("BEAT_NOT_FOUND"));
      }
      return ok(undefined);
    }
    case "framePair": {
      if (!beat.keyframe?.imageUrl) {
        return err(new ValidationError("KEYFRAME_REQUIRED_FOR_FRAME_PAIR"));
      }
      return ok(undefined);
    }
    case "video": {
      if (!getFirstFrameUrl(beat.framePair)) {
        return err(new ValidationError("FRAME_PAIR_REQUIRED_FOR_VIDEO"));
      }
      return ok(undefined);
    }
  }
}

function buildChainReference(
  beats: StoryBeat[],
  beatId: string,
): { prevBeat: StoryBeat | null } {
  const idx = beats.findIndex((b) => b.id === beatId);
  if (idx <= 0) return { prevBeat: null };
  return { prevBeat: beats[idx - 1]! };
}

export const StoryGenerationService = {
  resolveGenerationContext,
  buildVideoPrompt,
  validateGenerationPrereqs,
  buildChainReference,
} as const;

export type { BeatGenerationContext, ResolvedGenerationParams };
