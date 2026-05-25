import type { StoryBeat } from "@/domain/schemas";

type GenerationStep = "keyframe" | "framePair" | "video";

interface BeatWorkflowResult {
  step: GenerationStep;
  beat: StoryBeat;
  success: boolean;
  error?: string;
}

function getNextStep(beat: StoryBeat): GenerationStep | null {
  if (!beat.keyframe?.imageUrl) return "keyframe";
  if (!beat.framePair?.firstFrame?.imageUrl) return "framePair";
  if (!beat.videoGen?.videoUrl) return "video";
  return null;
}

function getStepPrereqs(step: GenerationStep): string {
  switch (step) {
    case "keyframe":
      return "分镜需存在且已绑定角色或场景";
    case "framePair":
      return "需已生成预览图（keyframe）";
    case "video":
      return "需已生成首尾帧（framePair）";
  }
}

function shouldAutoAdvance(beat: StoryBeat): boolean {
  if (!beat.keyframe?.imageUrl) return false;
  if (!beat.framePair?.firstFrame?.imageUrl) return false;
  return true;
}

export const BeatWorkflowService = {
  getNextStep,
  getStepPrereqs,
  shouldAutoAdvance,
} as const;

export type { GenerationStep, BeatWorkflowResult };
