import type { StoryBeat } from "@/domain/schemas";
import { getFirstFrameUrl } from "@/domain/utils/frame-pair-accessors";

type GenerationStep = "keyframe" | "framePair" | "video";

interface BeatWorkflowResult {
  step: GenerationStep;
  beat: StoryBeat;
  success: boolean;
  error?: string;
}

function getNextStep(beat: StoryBeat): GenerationStep | null {
  if (!beat.keyframe?.imageUrl) return "keyframe";
  if (!getFirstFrameUrl(beat.framePair)) return "framePair";
  if (!beat.videoGen?.videoUrl) return "video";
  return null;
}

function getStepPrereqs(step: GenerationStep): string {
  switch (step) {
    case "keyframe":
      return "BEAT_REQUIRES_CHARACTER_OR_SCENE";
    case "framePair":
      return "KEYFRAME_REQUIRED";
    case "video":
      return "FRAME_PAIR_REQUIRED";
  }
}

function shouldAutoAdvance(beat: StoryBeat): boolean {
  if (!beat.keyframe?.imageUrl) return false;
  if (!getFirstFrameUrl(beat.framePair)) return false;
  return true;
}

export const BeatWorkflowService = {
  getNextStep,
  getStepPrereqs,
  shouldAutoAdvance,
} as const;

export type { GenerationStep, BeatWorkflowResult };
