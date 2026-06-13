import type { StoryBeatFramePair } from "@/domain/schemas";

export function getFirstFrameUrl(framePair: StoryBeatFramePair | undefined): string | undefined {
  if (!framePair) return undefined;
  return framePair.firstFrameUrl || framePair.firstFrame?.imageUrl;
}

export function getLastFrameUrl(framePair: StoryBeatFramePair | undefined): string | undefined {
  if (!framePair) return undefined;
  return framePair.lastFrameUrl || framePair.lastFrame?.imageUrl;
}
