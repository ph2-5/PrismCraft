import { describe, it, expect, vi } from "vitest";
import { generateBeatVideo } from "../beat-video-generator";
import type { StoryBeat } from "@/domain/schemas";
import type { ProviderDeps } from "../video-generation-mode";

const { mockGenerateVideoWithFrames } = vi.hoisted(() => ({
  mockGenerateVideoWithFrames: vi.fn(),
}));

const mockProviders: ProviderDeps = {
  videoProvider: {
    generateVideoWithFrames: mockGenerateVideoWithFrames,
  },
} as unknown as ProviderDeps;

function createBeat(overrides: Partial<StoryBeat> = {}): StoryBeat {
  return {
    id: "beat-1",
    storyId: "story-1",
    order: 0,
    content: "A character walks through a forest",
    description: "Forest scene",
    duration: 5,
    framePair: {
      firstFrameUrl: "https://example.com/first.jpg",
      lastFrameUrl: "https://example.com/last.jpg",
    },
    ...overrides,
  } as StoryBeat;
}

describe("beat-video-generator strategy filtering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateVideoWithFrames.mockResolvedValue({
      success: true,
      data: { taskId: "task-1", status: "pending" },
    });
  });

  describe("bake_into_first mode (Seedance pro)", () => {
    it("should filter out characterRefs and sceneRef for pro models", async () => {
      const result = await generateBeatVideo(
        createBeat(),
        {
          characterRefs: ["https://char1.jpg", "https://char2.jpg"],
          characterRef: "https://char1.jpg",
          sceneRef: "https://scene.jpg",
          modelId: "doubao-seedance-2-0-260128",
        },
        mockProviders,
      );

      expect(result.ok).toBe(true);
      const callArgs = mockGenerateVideoWithFrames.mock.calls[0]![0];
      expect(callArgs.characterRefs).toBeUndefined();
      expect(callArgs.characterRef).toBeUndefined();
      expect(callArgs.sceneRef).toBeUndefined();
      expect(callArgs.firstFrameUrl).toBe("https://example.com/first.jpg");
      expect(callArgs.lastFrameUrl).toBe("https://example.com/last.jpg");
    });

    it("should filter out sceneRef for Google Veo", async () => {
      const result = await generateBeatVideo(
        createBeat(),
        {
          sceneRef: "https://scene.jpg",
          modelId: "veo-3",
        },
        mockProviders,
      );

      expect(result.ok).toBe(true);
      const callArgs = mockGenerateVideoWithFrames.mock.calls[0]![0];
      expect(callArgs.sceneRef).toBeUndefined();
    });

    it("should filter out characterRef for Kling V1", async () => {
      const result = await generateBeatVideo(
        createBeat(),
        {
          characterRef: "https://char.jpg",
          modelId: "kling-v1-master",
        },
        mockProviders,
      );

      expect(result.ok).toBe(true);
      const callArgs = mockGenerateVideoWithFrames.mock.calls[0]![0];
      expect(callArgs.characterRef).toBeUndefined();
    });
  });

  describe("ref_field mode (Seedance lite-i2v)", () => {
    it("should pass characterRefs and sceneRef for lite-i2v models", async () => {
      const result = await generateBeatVideo(
        createBeat(),
        {
          characterRefs: ["https://char1.jpg"],
          sceneRef: "https://scene.jpg",
          modelId: "doubao-seedance-1-0-lite-i2v-250428",
        },
        mockProviders,
      );

      expect(result.ok).toBe(true);
      const callArgs = mockGenerateVideoWithFrames.mock.calls[0]![0];
      expect(callArgs.characterRefs).toEqual(["https://char1.jpg"]);
      expect(callArgs.sceneRef).toBe("https://scene.jpg");
    });
  });

  describe("native_field mode (Kling V2+)", () => {
    it("should pass characterRef for Kling V2+ models", async () => {
      const result = await generateBeatVideo(
        createBeat(),
        {
          characterRef: "https://char.jpg",
          modelId: "kling-v2-master",
        },
        mockProviders,
      );

      expect(result.ok).toBe(true);
      const callArgs = mockGenerateVideoWithFrames.mock.calls[0]![0];
      expect(callArgs.characterRef).toBe("https://char.jpg");
    });
  });

  describe("unknown model (conservative default)", () => {
    it("should pass characterRefs and sceneRef for unknown models", async () => {
      const result = await generateBeatVideo(
        createBeat(),
        {
          characterRefs: ["https://char1.jpg"],
          sceneRef: "https://scene.jpg",
          modelId: "some-unknown-model-v1",
        },
        mockProviders,
      );

      expect(result.ok).toBe(true);
      const callArgs = mockGenerateVideoWithFrames.mock.calls[0]![0];
      expect(callArgs.characterRefs).toEqual(["https://char1.jpg"]);
      expect(callArgs.sceneRef).toBe("https://scene.jpg");
    });
  });

  describe("no model specified", () => {
    it("should pass all reference images when no modelId is provided", async () => {
      const result = await generateBeatVideo(
        createBeat(),
        {
          characterRefs: ["https://char1.jpg"],
          sceneRef: "https://scene.jpg",
        },
        mockProviders,
      );

      expect(result.ok).toBe(true);
      const callArgs = mockGenerateVideoWithFrames.mock.calls[0]![0];
      expect(callArgs.characterRefs).toEqual(["https://char1.jpg"]);
      expect(callArgs.sceneRef).toBe("https://scene.jpg");
    });
  });

  describe("empty characterRefs array", () => {
    it("should pass undefined for empty characterRefs array", async () => {
      const result = await generateBeatVideo(
        createBeat(),
        {
          characterRefs: [],
          modelId: "kling-v2-master",
        },
        mockProviders,
      );

      expect(result.ok).toBe(true);
      const callArgs = mockGenerateVideoWithFrames.mock.calls[0]![0];
      expect(callArgs.characterRefs).toBeUndefined();
    });
  });
});
