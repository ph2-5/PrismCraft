import type { StoryBeat, StoryStyleGuide } from "@/domain/schemas";

export type VideoGenerationMode = "first_frame_anchor" | "reference_video_continuation" | "auto";

export function determineVideoGenerationMode(
  beat: StoryBeat,
  prevBeat: StoryBeat | null,
): VideoGenerationMode {
  if (!prevBeat) return "first_frame_anchor";

  const relationType = beat.camera?.relationType;
  if (relationType === "continuous") return "reference_video_continuation";
  if (relationType === "contrast" || relationType === "parallel" || relationType === "fade") return "first_frame_anchor";

  // PR 3：dual-read shotSize（优先 shotInstruction，fallback 旧 shotType，PR 7 后清除 fallback）
  const prevShotType = prevBeat.shotInstruction?.shotSize ?? prevBeat.shotType;
  const currShotType = beat.shotInstruction?.shotSize ?? beat.shotType;
  if (prevShotType && currShotType && prevShotType !== currShotType) return "first_frame_anchor";

  const prevScene = prevBeat.sceneId;
  const currScene = beat.sceneId;
  if (prevScene && currScene && prevScene !== currScene) return "first_frame_anchor";

  return "reference_video_continuation";
}

export function buildStyleEnhancedPrompt(
  basePrompt: string,
  styleGuide?: StoryStyleGuide,
): string {
  if (!styleGuide) return basePrompt;
  const styleParts: string[] = [];
  if (styleGuide.artStyle) styleParts.push(styleGuide.artStyle);
  if (styleGuide.moodAtmosphere) styleParts.push(styleGuide.moodAtmosphere);
  if (styleGuide.colorPalette?.length) styleParts.push(`color palette: ${styleGuide.colorPalette.join(", ")}`);
  if (styleParts.length === 0) return basePrompt;
  return `${basePrompt}, ${styleParts.join(", ")}`;
}

export interface ProviderDeps {
  videoProvider: import("@/domain/ports").IVideoProvider;
  imageProvider: import("@/domain/ports").IImageProvider;
  textProvider: import("@/domain/ports").ITextProvider;
}
