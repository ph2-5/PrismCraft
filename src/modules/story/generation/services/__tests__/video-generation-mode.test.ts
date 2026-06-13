import { describe, it, expect } from "vitest";
import { determineVideoGenerationMode, buildStyleEnhancedPrompt } from "../video-generation-mode";
import type { StoryBeat, StoryStyleGuide } from "@/domain/schemas";

function buildBeat(overrides: Partial<StoryBeat> = {}): StoryBeat {
  return {
    id: "beat-1",
    title: "Test Beat",
    content: "Test content",
    description: "Test description",
    order: 0,
    ...overrides,
  } as StoryBeat;
}

describe("determineVideoGenerationMode", () => {
  it("returns first_frame_anchor when prevBeat is null", () => {
    const beat = buildBeat();
    expect(determineVideoGenerationMode(beat, null)).toBe("first_frame_anchor");
  });

  it("returns reference_video_continuation when camera.relationType is continuous", () => {
    const beat = buildBeat({ camera: { relationType: "continuous" } } as Partial<StoryBeat>);
    const prevBeat = buildBeat({ id: "beat-0" });
    expect(determineVideoGenerationMode(beat, prevBeat)).toBe("reference_video_continuation");
  });

  it("returns first_frame_anchor when camera.relationType is contrast", () => {
    const beat = buildBeat({ camera: { relationType: "contrast" } } as Partial<StoryBeat>);
    const prevBeat = buildBeat({ id: "beat-0" });
    expect(determineVideoGenerationMode(beat, prevBeat)).toBe("first_frame_anchor");
  });

  it("returns first_frame_anchor when camera.relationType is parallel", () => {
    const beat = buildBeat({ camera: { relationType: "parallel" } } as Partial<StoryBeat>);
    const prevBeat = buildBeat({ id: "beat-0" });
    expect(determineVideoGenerationMode(beat, prevBeat)).toBe("first_frame_anchor");
  });

  it("returns first_frame_anchor when camera.relationType is fade", () => {
    const beat = buildBeat({ camera: { relationType: "fade" } } as Partial<StoryBeat>);
    const prevBeat = buildBeat({ id: "beat-0" });
    expect(determineVideoGenerationMode(beat, prevBeat)).toBe("first_frame_anchor");
  });

  it("returns first_frame_anchor when shotType changes between beats", () => {
    const beat = buildBeat({ shotType: "close_up" } as Partial<StoryBeat>);
    const prevBeat = buildBeat({ id: "beat-0", shotType: "wide" } as Partial<StoryBeat>);
    expect(determineVideoGenerationMode(beat, prevBeat)).toBe("first_frame_anchor");
  });

  it("returns reference_video_continuation when shotType is same", () => {
    const beat = buildBeat({ shotType: "wide" } as Partial<StoryBeat>);
    const prevBeat = buildBeat({ id: "beat-0", shotType: "wide" } as Partial<StoryBeat>);
    expect(determineVideoGenerationMode(beat, prevBeat)).toBe("reference_video_continuation");
  });

  it("returns first_frame_anchor when sceneId changes between beats", () => {
    const beat = buildBeat({ sceneId: "scene-2" } as Partial<StoryBeat>);
    const prevBeat = buildBeat({ id: "beat-0", sceneId: "scene-1" } as Partial<StoryBeat>);
    expect(determineVideoGenerationMode(beat, prevBeat)).toBe("first_frame_anchor");
  });

  it("returns reference_video_continuation when sceneId is same", () => {
    const beat = buildBeat({ sceneId: "scene-1" } as Partial<StoryBeat>);
    const prevBeat = buildBeat({ id: "beat-0", sceneId: "scene-1" } as Partial<StoryBeat>);
    expect(determineVideoGenerationMode(beat, prevBeat)).toBe("reference_video_continuation");
  });

  it("returns reference_video_continuation as default when no special conditions", () => {
    const beat = buildBeat();
    const prevBeat = buildBeat({ id: "beat-0" });
    expect(determineVideoGenerationMode(beat, prevBeat)).toBe("reference_video_continuation");
  });

  it("prioritizes camera.relationType over shotType change", () => {
    const beat = buildBeat({
      shotType: "close_up",
      camera: { relationType: "continuous" },
    } as Partial<StoryBeat>);
    const prevBeat = buildBeat({ id: "beat-0", shotType: "wide" } as Partial<StoryBeat>);
    expect(determineVideoGenerationMode(beat, prevBeat)).toBe("reference_video_continuation");
  });

  it("handles prevBeat with scene field instead of sceneId", () => {
    const beat = buildBeat({ sceneId: "scene-2" } as Partial<StoryBeat>);
    const prevBeat = buildBeat({ id: "beat-0", scene: "scene-1" } as Partial<StoryBeat>);
    expect(determineVideoGenerationMode(beat, prevBeat)).toBe("first_frame_anchor");
  });
});

describe("buildStyleEnhancedPrompt", () => {
  it("returns basePrompt when no styleGuide", () => {
    expect(buildStyleEnhancedPrompt("A cat")).toBe("A cat");
  });

  it("appends artStyle to prompt", () => {
    const style: StoryStyleGuide = { artStyle: "anime" };
    expect(buildStyleEnhancedPrompt("A cat", style)).toBe("A cat, anime");
  });

  it("appends moodAtmosphere to prompt", () => {
    const style: StoryStyleGuide = { moodAtmosphere: "dark" };
    expect(buildStyleEnhancedPrompt("A cat", style)).toBe("A cat, dark");
  });

  it("appends colorPalette to prompt", () => {
    const style: StoryStyleGuide = { colorPalette: ["red", "blue"] };
    expect(buildStyleEnhancedPrompt("A cat", style)).toBe("A cat, color palette: red, blue");
  });

  it("combines all style parts", () => {
    const style: StoryStyleGuide = {
      artStyle: "anime",
      moodAtmosphere: "dreamy",
      colorPalette: ["pastel"],
    };
    expect(buildStyleEnhancedPrompt("A cat", style)).toBe("A cat, anime, dreamy, color palette: pastel");
  });

  it("returns basePrompt when styleGuide has empty fields", () => {
    const style: StoryStyleGuide = {};
    expect(buildStyleEnhancedPrompt("A cat", style)).toBe("A cat");
  });
});
