import type { StoryBeat, Character, Scene, StoryElement } from "@/domain/schemas";
import type { Result } from "@/domain/types";
import { ok, err, ValidationError } from "@/domain/types";
import { resolveCharacterRef, resolveSceneRef } from "./reference-resolver";

interface BeatGenerationContext {
  beat: StoryBeat;
  prevBeat: StoryBeat | null;
  characters: Character[];
  scenes: Scene[];
  elements: StoryElement[];
}

interface ResolvedGenerationParams {
  characterRef: string | undefined;
  sceneRef: string | undefined;
  prevKeyframeUrl: string | undefined;
  prevLastFrameUrl: string | undefined;
  prevVideoUrl: string | undefined;
}

function resolveGenerationContext(ctx: BeatGenerationContext): ResolvedGenerationParams {
  const { beat, prevBeat, characters, scenes } = ctx;

  const characterIds = beat.characterIds || [];
  const characterRef = characterIds
    .map((cid: string) => characters.find((c) => c.id === cid))
    .filter(Boolean)
    .map((c) => resolveCharacterRef(c!, beat))
    .find(Boolean);

  const sceneId = beat.sceneId || beat.scene;
  const sceneObj = sceneId
    ? scenes.find((s) => s.id === sceneId)
    : undefined;
  const sceneRef = sceneObj ? resolveSceneRef(sceneObj) : undefined;

  return {
    characterRef,
    sceneRef,
    prevKeyframeUrl: prevBeat?.keyframe?.imageUrl || undefined,
    prevLastFrameUrl: prevBeat?.framePair?.lastFrame?.imageUrl || undefined,
    prevVideoUrl: prevBeat?.videoGen?.videoUrl || undefined,
  };
}

function buildVideoPrompt(beat: StoryBeat, basePrompt: string): string {
  const framePair = beat.framePair;
  const firstFrame = framePair?.firstFrame;
  const lastFrame = framePair?.lastFrame;

  const framePrompts: string[] = [];
  if (firstFrame?.prompt) {
    framePrompts.push(`首帧画面：${firstFrame.prompt}`);
  }
  if (lastFrame?.prompt) {
    framePrompts.push(`尾帧画面：${lastFrame.prompt}`);
  }

  if (framePrompts.length > 0) {
    return `${basePrompt}\n\n【首尾帧画面约束】\n${framePrompts.join("\n")}\n\n视频生成要求：严格保持首帧到尾帧的视觉连贯性，角色外观、场景氛围、光影效果必须一致，运动过渡自然流畅。`;
  }

  return basePrompt;
}

function validateGenerationPrereqs(
  beat: StoryBeat,
  type: "keyframe" | "framePair" | "video",
): Result<void> {
  switch (type) {
    case "keyframe": {
      if (!beat.id) {
        return err(new ValidationError("分镜不存在"));
      }
      return ok(undefined);
    }
    case "framePair": {
      if (!beat.keyframe?.imageUrl) {
        return err(new ValidationError("生成首尾帧前必须先生成预览图"));
      }
      return ok(undefined);
    }
    case "video": {
      if (!beat.framePair?.firstFrame?.imageUrl) {
        return err(new ValidationError("生成视频前必须先生成首尾帧"));
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
