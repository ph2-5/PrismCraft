import { describe, it, expect, vi, beforeEach } from "vitest";
import { expectOk, expectErr } from "@/__tests__/utils/result-helpers";
import { ValidationError } from "@/domain/types";
import type { StoryBeat, StoryBeatKeyframe, StoryBeatFramePair } from "@/domain/schemas";
import type { IVideoProvider, IImageProvider, ITextProvider } from "@/domain/ports";

vi.mock("@/domain/utils", () => ({
  generateBeatImagePrompt: vi.fn().mockReturnValue("generated prompt"),
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
  generateBeatFullWorkflow,
  generateKeyframeChain,
  determineVideoGenerationMode,
} from "../storyboard-generation-service";

const videoProvider = {
  generateKeyframe: vi.fn(),
  generateFramePair: vi.fn(),
  generateVideoWithFrames: vi.fn(),
  generateVideo: vi.fn(),
  queryVideoStatus: vi.fn(),
} as unknown as IVideoProvider;

const imageProvider = {
  generateImage: vi.fn(),
  analyzeImage: vi.fn(),
} as unknown as IImageProvider;

const textProvider = {
  generateText: vi.fn(),
} as unknown as ITextProvider;

const providers = { videoProvider, imageProvider, textProvider };

const mockBeat: StoryBeat = {
  id: "beat-1",
  sequence: 0,
  title: "分镜标题",
  description: "分镜描述",
  content: "分镜内容",
  duration: 5,
  type: "scene",
  characters: [],
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
  firstFrameUrl: "first.jpg",
  lastFrameUrl: "last.jpg",
  firstFramePrompt: "first prompt",
  lastFramePrompt: "last prompt",
  generatedAt: new Date().toISOString(),
  firstFrame: {
    imageUrl: "first.jpg",
    prompt: "first prompt",
    derivedFrom: "keyframe.jpg",
  },
  lastFrame: {
    imageUrl: "last.jpg",
    prompt: "last prompt",
    derivedFrom: "first.jpg",
  },
};

describe("determineVideoGenerationMode", () => {
  it("没有 prevBeat 时应返回 first_frame_anchor", () => {
    expect(determineVideoGenerationMode(mockBeat, null)).toBe("first_frame_anchor");
  });

  it("camera.relationType 为 continuous 时应返回 reference_video_continuation", () => {
    const beat = { ...mockBeat, camera: { relationType: "continuous" as const } };
    const prevBeat = { ...mockBeat, id: "prev-1" };
    expect(determineVideoGenerationMode(beat, prevBeat)).toBe("reference_video_continuation");
  });

  it("camera.relationType 为 contrast 时应返回 first_frame_anchor", () => {
    const beat = { ...mockBeat, camera: { relationType: "contrast" as const } };
    const prevBeat = { ...mockBeat, id: "prev-1" };
    expect(determineVideoGenerationMode(beat, prevBeat)).toBe("first_frame_anchor");
  });

  it("shotType 不同时应返回 first_frame_anchor", () => {
    const beat = { ...mockBeat, shotType: "close" as const };
    const prevBeat = { ...mockBeat, id: "prev-1", shotType: "wide" as const };
    expect(determineVideoGenerationMode(beat, prevBeat)).toBe("first_frame_anchor");
  });

  it("sceneId 不同时应返回 first_frame_anchor", () => {
    const beat = { ...mockBeat, sceneId: "scene-2" };
    const prevBeat = { ...mockBeat, id: "prev-1", sceneId: "scene-1" };
    expect(determineVideoGenerationMode(beat, prevBeat)).toBe("first_frame_anchor");
  });

  it("默认应返回 reference_video_continuation", () => {
    const prevBeat = { ...mockBeat, id: "prev-1" };
    expect(determineVideoGenerationMode(mockBeat, prevBeat)).toBe("reference_video_continuation");
  });
});

describe("generateBeatKeyframe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应成功生成预览图", async () => {
    (videoProvider.generateKeyframe as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { imageUrl: "generated.jpg", prompt: "generated prompt" },
    });

    const result = await generateBeatKeyframe(mockBeat, null, {}, providers);

    expectOk(result);
    expect(result.value.imageUrl).toBe("generated.jpg");
    expect(result.value.prompt).toBe("generated prompt");
    expect(result.value.generatedAt).toBeDefined();
  });

  it("有自定义提示词时应使用 customPrompt", async () => {
    (videoProvider.generateKeyframe as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { imageUrl: "generated.jpg", prompt: "custom" },
    });

    await generateBeatKeyframe(mockBeat, null, { customPrompt: "自定义提示词" }, providers);

    expect(videoProvider.generateKeyframe).toHaveBeenCalledWith(
      expect.objectContaining({ content: "自定义提示词" }),
    );
  });

  it("有 imageGenerationPrompt 时应优先使用", async () => {
    const beat = { ...mockBeat, imageGenerationPrompt: "已有提示词" };
    (videoProvider.generateKeyframe as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { imageUrl: "generated.jpg", prompt: "existing" },
    });

    await generateBeatKeyframe(beat, null, {}, providers);

    expect(videoProvider.generateKeyframe).toHaveBeenCalledWith(
      expect.objectContaining({ content: "已有提示词" }),
    );
  });

  it("customPrompt 应优先于 imageGenerationPrompt", async () => {
    const beat = { ...mockBeat, imageGenerationPrompt: "已有提示词" };
    (videoProvider.generateKeyframe as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { imageUrl: "generated.jpg", prompt: "custom" },
    });

    await generateBeatKeyframe(beat, null, { customPrompt: "自定义提示词" }, providers);

    expect(videoProvider.generateKeyframe).toHaveBeenCalledWith(
      expect.objectContaining({ content: "自定义提示词" }),
    );
  });

  it("有前一个 beat 时应传递 prevKeyframe", async () => {
    const prevBeat = { ...mockBeat, keyframe: mockKeyframe };
    (videoProvider.generateKeyframe as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { imageUrl: "generated.jpg", prompt: "prompt" },
    });

    await generateBeatKeyframe(mockBeat, prevBeat, {}, providers);

    expect(videoProvider.generateKeyframe).toHaveBeenCalledWith(
      expect.objectContaining({ prevKeyframe: "keyframe.jpg" }),
    );
  });

  it("有 styleGuide 时应增强提示词", async () => {
    (videoProvider.generateKeyframe as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { imageUrl: "generated.jpg", prompt: "styled" },
    });

    await generateBeatKeyframe(mockBeat, null, {
      styleGuide: {
        artStyle: "水彩风",
        moodAtmosphere: "梦幻朦胧",
        colorPalette: ["blue", "pink"],
      },
    }, providers);

    expect(videoProvider.generateKeyframe).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("水彩风"),
      }),
    );
  });

  it("生成失败时应返回错误", async () => {
    (videoProvider.generateKeyframe as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: "生成失败",
    });

    const result = await generateBeatKeyframe(mockBeat, null, {}, providers);

    expectErr(result);
  });
});

describe("generateBeatFramePair", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("没有预览图时应返回 ValidationError", async () => {
    const beat = { ...mockBeat, keyframe: undefined };

    const result = await generateBeatFramePair(beat, {}, providers);

    expectErr(result);
    expect(result.error).toBeInstanceOf(ValidationError);
  });

  it("有 prevLastFrameUrl 时应使用 videoProvider.generateFramePair", async () => {
    const beat = { ...mockBeat, keyframe: mockKeyframe };
    (videoProvider.generateFramePair as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: {
        firstFrame: { imageUrl: "first.jpg", prompt: "first prompt" },
        lastFrame: { imageUrl: "last.jpg", prompt: "last prompt" },
        generatedAt: new Date().toISOString(),
      },
    });

    const result = await generateBeatFramePair(beat, { prevLastFrameUrl: "prev-last.jpg" }, providers);

    expectOk(result);
    expect(result.value.firstFrameUrl).toBe("first.jpg");
    expect(result.value.lastFrameUrl).toBe("last.jpg");
    expect(videoProvider.generateFramePair).toHaveBeenCalledWith(
      expect.objectContaining({ prevLastFrameUrl: "prev-last.jpg" }),
    );
  });

  it("有首尾帧提示词且无 prevLastFrameUrl 时应使用 imageProvider", async () => {
    const beat = {
      ...mockBeat,
      keyframe: mockKeyframe,
      firstFramePrompt: "首帧提示",
      lastFramePrompt: "尾帧提示",
    };
    (imageProvider.generateImage as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ success: true, data: { imageUrl: "first.jpg" } })
      .mockResolvedValueOnce({ success: true, data: { imageUrl: "last.jpg" } });

    const result = await generateBeatFramePair(beat, {}, providers);

    expectOk(result);
    expect(result.value.firstFrameUrl).toBe("first.jpg");
    expect(result.value.lastFrameUrl).toBe("last.jpg");
    expect(imageProvider.generateImage).toHaveBeenCalledTimes(2);
  });

  it("imageProvider 部分失败时应返回错误", async () => {
    const beat = {
      ...mockBeat,
      keyframe: mockKeyframe,
      firstFramePrompt: "首帧提示",
      lastFramePrompt: "尾帧提示",
    };
    (imageProvider.generateImage as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ success: true, data: { imageUrl: "first.jpg" } })
      .mockResolvedValueOnce({ success: false, error: "尾帧生成失败" });

    const result = await generateBeatFramePair(beat, {}, providers);

    expectErr(result);
  });

  it("没有首尾帧提示词且没有 prevLastFrameUrl 时应使用 imageProvider 回退", async () => {
    const beat = { ...mockBeat, keyframe: mockKeyframe };
    (imageProvider.generateImage as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ success: true, data: { imageUrl: "first.jpg" } })
      .mockResolvedValueOnce({ success: true, data: { imageUrl: "last.jpg" } });

    const result = await generateBeatFramePair(beat, {}, providers);

    expectOk(result);
    expect(imageProvider.generateImage).toHaveBeenCalledTimes(2);
  });

  it("videoProvider 生成失败时应返回错误", async () => {
    const beat = { ...mockBeat, keyframe: mockKeyframe };
    (videoProvider.generateFramePair as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: "首尾帧生成失败",
    });

    const result = await generateBeatFramePair(beat, {}, providers);

    expectErr(result);
  });
});

describe("generateBeatVideo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("没有首帧时应返回 ValidationError", async () => {
    const beat = { ...mockBeat, framePair: undefined };

    const result = await generateBeatVideo(beat, {}, providers);

    expectErr(result);
    expect(result.error).toBeInstanceOf(ValidationError);
  });

  it("应成功生成视频", async () => {
    const beat = {
      ...mockBeat,
      framePair: { ...mockFramePair, firstFrameUrl: "http://example.com/first.jpg" },
    };
    (videoProvider.generateVideoWithFrames as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { taskId: "task-1", videoUrl: "video.mp4", status: "completed" },
    });

    const result = await generateBeatVideo(beat, {}, providers);

    expectOk(result);
    expect(result.value.taskId).toBe("task-1");
    expect(result.value.videoUrl).toBe("video.mp4");
    expect(result.value.status).toBe("completed");
    expect(result.value.videoMode).toBe("first_frame_anchor");
  });

  it("应传递自定义提示词", async () => {
    const beat = {
      ...mockBeat,
      framePair: { ...mockFramePair, firstFrameUrl: "http://example.com/first.jpg" },
    };
    (videoProvider.generateVideoWithFrames as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { taskId: "task-1", status: "pending" },
    });

    await generateBeatVideo(beat, { prompt: "自定义视频提示词" }, providers);

    expect(videoProvider.generateVideoWithFrames).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "自定义视频提示词" }),
    );
  });

  it("videoMode 为 reference_video_continuation 且有 prevVideoUrl 时应传递 referenceVideo", async () => {
    const beat = {
      ...mockBeat,
      framePair: { ...mockFramePair, firstFrameUrl: "http://example.com/first.jpg" },
    };
    (videoProvider.generateVideoWithFrames as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { taskId: "task-1", status: "pending" },
    });

    await generateBeatVideo(beat, {
      videoMode: "reference_video_continuation",
      prevVideoUrl: "prev-video.mp4",
    }, providers);

    expect(videoProvider.generateVideoWithFrames).toHaveBeenCalledWith(
      expect.objectContaining({ referenceVideo: "prev-video.mp4" }),
    );
  });

  it("videoMode 为 first_frame_anchor 时不应传递 referenceVideo", async () => {
    const beat = {
      ...mockBeat,
      framePair: { ...mockFramePair, firstFrameUrl: "http://example.com/first.jpg" },
    };
    (videoProvider.generateVideoWithFrames as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { taskId: "task-1", status: "pending" },
    });

    await generateBeatVideo(beat, {
      videoMode: "first_frame_anchor",
      prevVideoUrl: "prev-video.mp4",
    }, providers);

    expect(videoProvider.generateVideoWithFrames).toHaveBeenCalledWith(
      expect.not.objectContaining({ referenceVideo: expect.anything() }),
    );
  });

  it("视频生成失败时应返回错误", async () => {
    const beat = {
      ...mockBeat,
      framePair: { ...mockFramePair, firstFrameUrl: "first.jpg" },
    };
    (videoProvider.generateVideoWithFrames as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: "视频生成失败",
    });

    const result = await generateBeatVideo(beat, {}, providers);

    expectErr(result);
  });
});

describe("generateBeatFullWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应按顺序生成预览图、首尾帧和视频", async () => {
    (videoProvider.generateKeyframe as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { imageUrl: "http://example.com/keyframe.jpg", prompt: "keyframe prompt" },
    });
    (imageProvider.generateImage as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ success: true, data: { imageUrl: "http://example.com/first.jpg" } })
      .mockResolvedValueOnce({ success: true, data: { imageUrl: "http://example.com/last.jpg" } });
    (videoProvider.generateVideoWithFrames as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { taskId: "task-1", status: "pending" },
    });

    const onProgress = vi.fn();
    const result = await generateBeatFullWorkflow(mockBeat, null, {}, providers, onProgress);

    expectOk(result);
    expect(result.value.keyframe.imageUrl).toBe("http://example.com/keyframe.jpg");
    expect(result.value.framePair.firstFrameUrl).toBe("http://example.com/first.jpg");
    expect(result.value.videoTaskId).toBe("task-1");
    expect(result.value.videoMode).toBe("first_frame_anchor");
    expect(onProgress).toHaveBeenCalled();
  });

  it("预览图生成失败时应返回错误", async () => {
    (videoProvider.generateKeyframe as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: "预览图失败",
    });

    const result = await generateBeatFullWorkflow(mockBeat, null, {}, providers);

    expectErr(result);
  });

  it("首尾帧生成失败时应返回错误", async () => {
    (videoProvider.generateKeyframe as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { imageUrl: "keyframe.jpg", prompt: "prompt" },
    });
    (videoProvider.generateFramePair as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: "首尾帧失败",
    });

    const result = await generateBeatFullWorkflow(mockBeat, null, {}, providers);

    expectErr(result);
  });
});

describe("generateKeyframeChain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应为所有 beats 生成预览图", async () => {
    const beats = [
      { ...mockBeat, id: "beat-1" },
      { ...mockBeat, id: "beat-2" },
    ];
    (videoProvider.generateKeyframe as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { imageUrl: "keyframe.jpg", prompt: "prompt" },
    });

    const onProgress = vi.fn();
    const result = await generateKeyframeChain(beats, {}, providers, onProgress);

    expectOk(result);
    expect(result.value.size).toBe(2);
    expect(result.value.has("beat-1")).toBe(true);
    expect(result.value.has("beat-2")).toBe(true);
    expect(onProgress).toHaveBeenCalledTimes(2);
  });

  it("单个 beat 失败时应继续处理其余 beats", async () => {
    const beats = [
      { ...mockBeat, id: "beat-1" },
      { ...mockBeat, id: "beat-2" },
    ];
    (videoProvider.generateKeyframe as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ success: false, error: "失败" })
      .mockResolvedValueOnce({ success: true, data: { imageUrl: "keyframe.jpg", prompt: "prompt" } });

    const result = await generateKeyframeChain(beats, {}, providers);

    expectOk(result);
    expect(result.value.size).toBe(1);
    expect(result.value.has("beat-2")).toBe(true);
  });

  it("应使用 getCharacterRef 和 getSceneRef", async () => {
    (videoProvider.generateKeyframe as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { imageUrl: "keyframe.jpg", prompt: "prompt" },
    });

    await generateKeyframeChain([mockBeat], {
      getCharacterRef: (beat) => `ref-${beat.id}`,
      getSceneRef: (beat) => `scene-ref-${beat.id}`,
    }, providers);

    expect(videoProvider.generateKeyframe).toHaveBeenCalledWith(
      expect.objectContaining({
        characterRef: "ref-beat-1",
        sceneRef: "scene-ref-beat-1",
      }),
    );
  });

  it("空 beats 列表应返回空 Map", async () => {
    const result = await generateKeyframeChain([], {}, providers);

    expectOk(result);
    expect(result.value.size).toBe(0);
  });
});

describe("generateBeatKeyframe 引用组合", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("有 characterRef 无 sceneRef 时应传递 characterRef", async () => {
    (videoProvider.generateKeyframe as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { imageUrl: "generated.jpg", prompt: "prompt" },
    });

    await generateBeatKeyframe(mockBeat, null, { characterRef: "char-ref-1" }, providers);

    expect(videoProvider.generateKeyframe).toHaveBeenCalledWith(
      expect.objectContaining({ characterRef: "char-ref-1", sceneRef: undefined }),
    );
  });

  it("有 sceneRef 无 characterRef 时应传递 sceneRef", async () => {
    (videoProvider.generateKeyframe as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { imageUrl: "generated.jpg", prompt: "prompt" },
    });

    await generateBeatKeyframe(mockBeat, null, { sceneRef: "scene-ref-1" }, providers);

    expect(videoProvider.generateKeyframe).toHaveBeenCalledWith(
      expect.objectContaining({ characterRef: undefined, sceneRef: "scene-ref-1" }),
    );
  });

  it("两者都有时应同时传递", async () => {
    (videoProvider.generateKeyframe as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { imageUrl: "generated.jpg", prompt: "prompt" },
    });

    await generateBeatKeyframe(mockBeat, null, { characterRef: "char-ref-1", sceneRef: "scene-ref-1" }, providers);

    expect(videoProvider.generateKeyframe).toHaveBeenCalledWith(
      expect.objectContaining({ characterRef: "char-ref-1", sceneRef: "scene-ref-1" }),
    );
  });

  it("两者都无时都不应传递引用", async () => {
    (videoProvider.generateKeyframe as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { imageUrl: "generated.jpg", prompt: "prompt" },
    });

    await generateBeatKeyframe(mockBeat, null, {}, providers);

    expect(videoProvider.generateKeyframe).toHaveBeenCalledWith(
      expect.objectContaining({ characterRef: undefined, sceneRef: undefined }),
    );
  });
});

describe("generateBeatFramePair 引用组合", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("有 characterRef 无 sceneRef 时应传递 characterRef", async () => {
    const beat = { ...mockBeat, keyframe: mockKeyframe };
    (videoProvider.generateFramePair as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: {
        firstFrame: { imageUrl: "first.jpg", prompt: "first prompt" },
        lastFrame: { imageUrl: "last.jpg", prompt: "last prompt" },
        generatedAt: new Date().toISOString(),
      },
    });

    await generateBeatFramePair(beat, { characterRef: "char-ref-1", prevLastFrameUrl: "prev-last.jpg" }, providers);

    expect(videoProvider.generateFramePair).toHaveBeenCalledWith(
      expect.objectContaining({ characterRef: "char-ref-1", sceneRef: undefined }),
    );
  });

  it("有 sceneRef 无 characterRef 时应传递 sceneRef", async () => {
    const beat = { ...mockBeat, keyframe: mockKeyframe };
    (videoProvider.generateFramePair as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: {
        firstFrame: { imageUrl: "first.jpg", prompt: "first prompt" },
        lastFrame: { imageUrl: "last.jpg", prompt: "last prompt" },
        generatedAt: new Date().toISOString(),
      },
    });

    await generateBeatFramePair(beat, { sceneRef: "scene-ref-1", prevLastFrameUrl: "prev-last.jpg" }, providers);

    expect(videoProvider.generateFramePair).toHaveBeenCalledWith(
      expect.objectContaining({ characterRef: undefined, sceneRef: "scene-ref-1" }),
    );
  });

  it("两者都有时应同时传递", async () => {
    const beat = { ...mockBeat, keyframe: mockKeyframe };
    (videoProvider.generateFramePair as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: {
        firstFrame: { imageUrl: "first.jpg", prompt: "first prompt" },
        lastFrame: { imageUrl: "last.jpg", prompt: "last prompt" },
        generatedAt: new Date().toISOString(),
      },
    });

    await generateBeatFramePair(beat, { characterRef: "char-ref-1", sceneRef: "scene-ref-1", prevLastFrameUrl: "prev-last.jpg" }, providers);

    expect(videoProvider.generateFramePair).toHaveBeenCalledWith(
      expect.objectContaining({ characterRef: "char-ref-1", sceneRef: "scene-ref-1" }),
    );
  });

  it("两者都无时都不应传递引用", async () => {
    const beat = { ...mockBeat, keyframe: mockKeyframe };
    (videoProvider.generateFramePair as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: {
        firstFrame: { imageUrl: "first.jpg", prompt: "first prompt" },
        lastFrame: { imageUrl: "last.jpg", prompt: "last prompt" },
        generatedAt: new Date().toISOString(),
      },
    });

    await generateBeatFramePair(beat, { prevLastFrameUrl: "prev-last.jpg" }, providers);

    expect(videoProvider.generateFramePair).toHaveBeenCalledWith(
      expect.objectContaining({ characterRef: undefined, sceneRef: undefined }),
    );
  });
});

describe("generateBeatVideo 引用组合", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("有 characterRef 无 sceneRef 时应传递 characterRef", async () => {
    const beat = {
      ...mockBeat,
      framePair: { ...mockFramePair, firstFrameUrl: "http://example.com/first.jpg" },
    };
    (videoProvider.generateVideoWithFrames as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { taskId: "task-1", status: "pending" },
    });

    await generateBeatVideo(beat, { characterRef: "char-ref-1" }, providers);

    expect(videoProvider.generateVideoWithFrames).toHaveBeenCalledWith(
      expect.objectContaining({ characterRef: "char-ref-1", sceneRef: undefined }),
    );
  });

  it("有 sceneRef 无 characterRef 时应传递 sceneRef", async () => {
    const beat = {
      ...mockBeat,
      framePair: { ...mockFramePair, firstFrameUrl: "http://example.com/first.jpg" },
    };
    (videoProvider.generateVideoWithFrames as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { taskId: "task-1", status: "pending" },
    });

    await generateBeatVideo(beat, { sceneRef: "scene-ref-1" }, providers);

    expect(videoProvider.generateVideoWithFrames).toHaveBeenCalledWith(
      expect.objectContaining({ characterRef: undefined, sceneRef: "scene-ref-1" }),
    );
  });

  it("两者都有时应同时传递", async () => {
    const beat = {
      ...mockBeat,
      framePair: { ...mockFramePair, firstFrameUrl: "http://example.com/first.jpg" },
    };
    (videoProvider.generateVideoWithFrames as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { taskId: "task-1", status: "pending" },
    });

    await generateBeatVideo(beat, { characterRef: "char-ref-1", sceneRef: "scene-ref-1" }, providers);

    expect(videoProvider.generateVideoWithFrames).toHaveBeenCalledWith(
      expect.objectContaining({ characterRef: "char-ref-1", sceneRef: "scene-ref-1" }),
    );
  });

  it("两者都无时都不应传递引用", async () => {
    const beat = {
      ...mockBeat,
      framePair: { ...mockFramePair, firstFrameUrl: "http://example.com/first.jpg" },
    };
    (videoProvider.generateVideoWithFrames as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { taskId: "task-1", status: "pending" },
    });

    await generateBeatVideo(beat, {}, providers);

    expect(videoProvider.generateVideoWithFrames).toHaveBeenCalledWith(
      expect.objectContaining({ characterRef: undefined, sceneRef: undefined }),
    );
  });
});
