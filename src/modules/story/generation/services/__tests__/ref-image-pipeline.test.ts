import { describe, it, expect, vi, beforeEach } from "vitest";
import type { StoryBeat, StoryBeatKeyframe, StoryBeatFramePair } from "@/domain/schemas";
import type { IVideoProvider, IImageProvider, ITextProvider } from "@/domain/ports";

vi.mock("@/domain/utils", () => ({
  generateBeatImagePrompt: vi.fn().mockReturnValue("generated prompt"),
  getFirstFrameUrl: vi.fn((fp: StoryBeatFramePair | undefined) => fp?.firstFrameUrl || fp?.firstFrame?.imageUrl),
  getLastFrameUrl: vi.fn((fp: StoryBeatFramePair | undefined) => fp?.lastFrameUrl || fp?.lastFrame?.imageUrl),
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: { warn: vi.fn(), error: vi.fn() },
  extractErrorMessage: vi.fn().mockReturnValue("error message"),
}));

vi.mock("../frame-prompt-service", () => ({
  generateFramePrompts: vi.fn().mockResolvedValue({
    ok: true,
    value: { firstFramePrompt: "auto first", lastFramePrompt: "auto last" },
  }),
}));

import {
  generateBeatKeyframe,
  generateBeatFramePair,
  generateBeatVideo,
} from "../storyboard-generation-service";

const videoProvider = {
  generateKeyframe: vi.fn(),
  generateFramePair: vi.fn(),
  generateVideoWithFrames: vi.fn(),
  generateVideo: vi.fn(),
  queryVideoStatus: vi.fn(),
} as IVideoProvider;

const imageProvider = {
  generateImage: vi.fn(),
  analyzeImage: vi.fn(),
} as IImageProvider;

const textProvider = {
  generateText: vi.fn(),
  generateTextStream: vi.fn(),
} as ITextProvider;

const providers = { videoProvider, imageProvider, textProvider };

const mockBeat: StoryBeat = {
  id: "beat-1",
  sequence: 0,
  title: "分镜标题",
  description: "分镜描述",
  content: "分镜内容",
  duration: 5,
  type: "scene",
  characterIds: [],
  enhancedGeneration: false,
  elementIds: [],
};

const mockKeyframe: StoryBeatKeyframe = {
  imageUrl: "keyframe.jpg",
  prompt: "keyframe prompt",
  generatedAt: new Date().toISOString(),
};

const mockFramePair: StoryBeatFramePair = {
  firstFrameUrl: "https://img.example.com/first.jpg",
  lastFrameUrl: "https://img.example.com/last.jpg",
  firstFramePrompt: "first prompt",
  lastFramePrompt: "last prompt",
  generatedAt: new Date().toISOString(),
  firstFrame: {
    imageUrl: "https://img.example.com/first.jpg",
    prompt: "first prompt",
    derivedFrom: "keyframe.jpg",
  },
  lastFrame: {
    imageUrl: "https://img.example.com/last.jpg",
    prompt: "last prompt",
    derivedFrom: "https://img.example.com/first.jpg",
  },
};

describe("characterRef/sceneRef 传递链路", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("generateBeatKeyframe", () => {
    it("应将 characterRef 传递给 videoProvider.generateKeyframe", async () => {
      (videoProvider.generateKeyframe as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: { imageUrl: "generated.jpg", prompt: "prompt" },
      });

      await generateBeatKeyframe(mockBeat, null, {
        characterRef: "https://img.example.com/char.png",
      }, providers);

      expect(videoProvider.generateKeyframe).toHaveBeenCalledWith(
        expect.objectContaining({
          characterRef: "https://img.example.com/char.png",
        }),
      );
    });

    it("应将 sceneRef 传递给 videoProvider.generateKeyframe", async () => {
      (videoProvider.generateKeyframe as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: { imageUrl: "generated.jpg", prompt: "prompt" },
      });

      await generateBeatKeyframe(mockBeat, null, {
        sceneRef: "https://img.example.com/scene.png",
      }, providers);

      expect(videoProvider.generateKeyframe).toHaveBeenCalledWith(
        expect.objectContaining({
          sceneRef: "https://img.example.com/scene.png",
        }),
      );
    });

    it("应同时传递 characterRef 和 sceneRef", async () => {
      (videoProvider.generateKeyframe as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: { imageUrl: "generated.jpg", prompt: "prompt" },
      });

      await generateBeatKeyframe(mockBeat, null, {
        characterRef: "https://img.example.com/char.png",
        sceneRef: "https://img.example.com/scene.png",
      }, providers);

      expect(videoProvider.generateKeyframe).toHaveBeenCalledWith(
        expect.objectContaining({
          characterRef: "https://img.example.com/char.png",
          sceneRef: "https://img.example.com/scene.png",
        }),
      );
    });

    it("应将本地路径作为 sceneRef 传递", async () => {
      (videoProvider.generateKeyframe as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: { imageUrl: "generated.jpg", prompt: "prompt" },
      });

      await generateBeatKeyframe(mockBeat, null, {
        sceneRef: "/path/to/local/scene.png",
      }, providers);

      expect(videoProvider.generateKeyframe).toHaveBeenCalledWith(
        expect.objectContaining({
          sceneRef: "/path/to/local/scene.png",
        }),
      );
    });

    it("应将 vcache URL 作为 characterRef 传递", async () => {
      (videoProvider.generateKeyframe as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: { imageUrl: "generated.jpg", prompt: "prompt" },
      });

      await generateBeatKeyframe(mockBeat, null, {
        characterRef: "vcache://task-123",
      }, providers);

      expect(videoProvider.generateKeyframe).toHaveBeenCalledWith(
        expect.objectContaining({
          characterRef: "vcache://task-123",
        }),
      );
    });
  });

  describe("generateBeatFramePair", () => {
    it("应将 characterRef 传递给 videoProvider.generateFramePair", async () => {
      const beat = { ...mockBeat, keyframe: mockKeyframe };
      (videoProvider.generateFramePair as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: {
          firstFrame: { imageUrl: "https://img.example.com/first.jpg", prompt: "first prompt" },
          lastFrame: { imageUrl: "https://img.example.com/last.jpg", prompt: "last prompt" },
          generatedAt: Date.now(),
        },
      });

      await generateBeatFramePair(beat, {
        characterRef: "https://img.example.com/char.png",
        prevLastFrameUrl: "https://img.example.com/prev-last.jpg",
        characters: [],
        scenes: [],
      }, providers);

      expect(videoProvider.generateFramePair).toHaveBeenCalledWith(
        expect.objectContaining({
          characterRef: "https://img.example.com/char.png",
        }),
      );
    });

    it("应将 sceneRef 传递给 videoProvider.generateFramePair", async () => {
      const beat = { ...mockBeat, keyframe: mockKeyframe };
      (videoProvider.generateFramePair as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: {
          firstFrame: { imageUrl: "https://img.example.com/first.jpg", prompt: "first prompt" },
          lastFrame: { imageUrl: "https://img.example.com/last.jpg", prompt: "last prompt" },
          generatedAt: Date.now(),
        },
      });

      await generateBeatFramePair(beat, {
        sceneRef: "https://img.example.com/scene.png",
        prevLastFrameUrl: "https://img.example.com/prev-last.jpg",
        characters: [],
        scenes: [],
      }, providers);

      expect(videoProvider.generateFramePair).toHaveBeenCalledWith(
        expect.objectContaining({
          sceneRef: "https://img.example.com/scene.png",
        }),
      );
    });

    it("应同时传递 characterRef 和 sceneRef 给 generateFramePair", async () => {
      const beat = { ...mockBeat, keyframe: mockKeyframe };
      (videoProvider.generateFramePair as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: {
          firstFrame: { imageUrl: "https://img.example.com/first.jpg", prompt: "first prompt" },
          lastFrame: { imageUrl: "https://img.example.com/last.jpg", prompt: "last prompt" },
          generatedAt: Date.now(),
        },
      });

      await generateBeatFramePair(beat, {
        characterRef: "https://img.example.com/char.png",
        sceneRef: "https://img.example.com/scene.png",
        prevLastFrameUrl: "https://img.example.com/prev-last.jpg",
        characters: [],
        scenes: [],
      }, providers);

      const callArgs = (videoProvider.generateFramePair as ReturnType<typeof vi.fn>).mock.calls[0]![0]!;
      expect(callArgs.characterRef).toBe("https://img.example.com/char.png");
      expect(callArgs.sceneRef).toBe("https://img.example.com/scene.png");
    });
  });

  describe("generateBeatVideo", () => {
    it("应将 characterRef 传递给 videoProvider.generateVideoWithFrames", async () => {
      const beat = { ...mockBeat, keyframe: mockKeyframe, framePair: mockFramePair };
      (videoProvider.generateVideoWithFrames as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: { taskId: "task-1", videoUrl: "video.mp4", status: "completed" },
      });

      await generateBeatVideo(beat, {
        characterRef: "https://img.example.com/char.png",
      }, providers);

      expect(videoProvider.generateVideoWithFrames).toHaveBeenCalledWith(
        expect.objectContaining({
          characterRef: "https://img.example.com/char.png",
        }),
      );
    });

    it("应将 sceneRef 传递给 videoProvider.generateVideoWithFrames", async () => {
      const beat = { ...mockBeat, keyframe: mockKeyframe, framePair: mockFramePair };
      (videoProvider.generateVideoWithFrames as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: { taskId: "task-1", videoUrl: "video.mp4", status: "completed" },
      });

      await generateBeatVideo(beat, {
        sceneRef: "https://img.example.com/scene.png",
      }, providers);

      expect(videoProvider.generateVideoWithFrames).toHaveBeenCalledWith(
        expect.objectContaining({
          sceneRef: "https://img.example.com/scene.png",
        }),
      );
    });

    it("应同时传递 characterRef 和 sceneRef 给 generateVideoWithFrames", async () => {
      const beat = { ...mockBeat, keyframe: mockKeyframe, framePair: mockFramePair };
      (videoProvider.generateVideoWithFrames as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: { taskId: "task-1", videoUrl: "video.mp4", status: "completed" },
      });

      await generateBeatVideo(beat, {
        characterRef: "https://img.example.com/char.png",
        sceneRef: "https://img.example.com/scene.png",
      }, providers);

      const callArgs = (videoProvider.generateVideoWithFrames as ReturnType<typeof vi.fn>).mock.calls[0]![0]!;
      expect(callArgs.characterRef).toBe("https://img.example.com/char.png");
      expect(callArgs.sceneRef).toBe("https://img.example.com/scene.png");
    });
  });
});
