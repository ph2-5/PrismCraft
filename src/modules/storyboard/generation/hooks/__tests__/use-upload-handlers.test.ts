import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { StoryBeat } from "@/domain/schemas";

const { mockUploadFile, mockErrorLogger } = vi.hoisted(() => ({
  mockUploadFile: vi.fn(),
  mockErrorLogger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

vi.mock("@/infrastructure/di", () => ({
  container: {
    fileUploader: { uploadFile: mockUploadFile },
  },
}));

vi.mock("@/shared/video-utils", () => ({
  detectVideoCodec: vi.fn().mockResolvedValue({ codec: "h264" }),
  extractVideoFrames: vi.fn().mockResolvedValue({
    firstFrame: "blob:first-frame",
    lastFrame: "blob:last-frame",
  }),
}));

vi.mock("@/shared/video-utils/codec-check", () => ({
  isCodecSupportedByProvider: vi.fn().mockReturnValue({ supported: true }),
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: mockErrorLogger,
}));

vi.mock("@/shared/constants", () => ({
  t: vi.fn((key: string) => key),
}));

import { useUploadHandlers } from "../use-upload-handlers";

const mockBeat: StoryBeat = {
  id: "beat-1",
  sequence: 0,
  description: "测试镜头",
  type: "scene",
  characterIds: [],
  elementIds: [],
  enhancedGeneration: false,
  keyframe: {
    imageUrl: "https://example.com/keyframe.png",
    prompt: "测试",
    generatedAt: new Date().toISOString(),
  },
  framePair: {
    firstFrame: {
      imageUrl: "https://example.com/first.png",
      prompt: "首帧",
      derivedFrom: "",
    },
    lastFrame: {
      imageUrl: "https://example.com/last.png",
      prompt: "尾帧",
      derivedFrom: "",
    },
    generatedAt: new Date().toISOString(),
  },
  videoGen: {
    videoUrl: "https://example.com/video.mp4",
    status: "completed",
    prompt: "测试",
    taskId: "task-1",
    error: "",
    createdAt: new Date().toISOString(),
  },
};

function createDefaultProps() {
  let beatsState: StoryBeat[] = [mockBeat];
  const setBeats = vi.fn((updater: React.SetStateAction<StoryBeat[]>) => {
    if (typeof updater === "function") {
      beatsState = updater(beatsState);
    } else {
      beatsState = updater;
    }
  });
  const getBeats = () => beatsState;

  return {
    setBeats,
    getBeats,
    success: vi.fn(),
    warn: vi.fn(),
    showError: vi.fn(),
  };
}

function createMockFile(name = "test.png", type = "image/png"): File {
  return new File(["test content"], name, { type });
}

describe("useUploadHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUploadFile.mockResolvedValue({
      success: true,
      data: { url: "https://example.com/uploaded.png" },
    });
  });

  describe("handleUploadKeyframe", () => {
    it("上传成功时应更新 keyframe imageUrl 并调用 success", async () => {
      const props = createDefaultProps();
      const { result } = renderHook(() =>
        useUploadHandlers(props.setBeats, props.success, props.warn, undefined, props.showError),
      );

      const file = createMockFile();
      await act(async () => {
        await result.current.handleUploadKeyframe("beat-1", file);
      });

      expect(props.setBeats).toHaveBeenCalled();
      expect(props.success).toHaveBeenCalled();
    });

    it("上传失败时应恢复之前的 imageUrl 并调用 showError", async () => {
      mockUploadFile.mockResolvedValue({ success: false });

      const props = createDefaultProps();
      const { result } = renderHook(() =>
        useUploadHandlers(props.setBeats, props.success, props.warn, undefined, props.showError),
      );

      const file = createMockFile();
      await act(async () => {
        await result.current.handleUploadKeyframe("beat-1", file);
      });

      expect(props.showError).toHaveBeenCalled();
    });

    it("beat 不存在时 setBeats 不应修改该 beat", async () => {
      const props = createDefaultProps();
      const { result } = renderHook(() =>
        useUploadHandlers(props.setBeats, props.success, props.warn, undefined, props.showError),
      );

      const file = createMockFile();
      await act(async () => {
        await result.current.handleUploadKeyframe("nonexistent", file);
      });

      const updaterCalls = props.setBeats.mock.calls;
      for (const call of updaterCalls) {
        const updater = call[0] as (prev: StoryBeat[]) => StoryBeat[];
        const result_beats = updater([mockBeat]);
        expect(result_beats[0]).toEqual(mockBeat);
      }
    });
  });

  describe("handleUploadFirstFrame", () => {
    it("上传成功时应更新 firstFrame imageUrl 并调用 success", async () => {
      const props = createDefaultProps();
      const { result } = renderHook(() =>
        useUploadHandlers(props.setBeats, props.success, props.warn, undefined, props.showError),
      );

      const file = createMockFile();
      await act(async () => {
        await result.current.handleUploadFirstFrame("beat-1", file);
      });

      expect(props.setBeats).toHaveBeenCalled();
      expect(props.success).toHaveBeenCalled();
    });

    it("上传失败时应恢复之前的 firstFrame imageUrl 并调用 showError", async () => {
      mockUploadFile.mockResolvedValue({ success: false });

      const props = createDefaultProps();
      const { result } = renderHook(() =>
        useUploadHandlers(props.setBeats, props.success, props.warn, undefined, props.showError),
      );

      const file = createMockFile();
      await act(async () => {
        await result.current.handleUploadFirstFrame("beat-1", file);
      });

      expect(props.showError).toHaveBeenCalled();
    });
  });

  describe("handleUploadLastFrame", () => {
    it("上传成功时应更新 lastFrame imageUrl 并调用 success", async () => {
      const props = createDefaultProps();
      const { result } = renderHook(() =>
        useUploadHandlers(props.setBeats, props.success, props.warn, undefined, props.showError),
      );

      const file = createMockFile();
      await act(async () => {
        await result.current.handleUploadLastFrame("beat-1", file);
      });

      expect(props.setBeats).toHaveBeenCalled();
      expect(props.success).toHaveBeenCalled();
    });

    it("上传失败时应恢复之前的 lastFrame imageUrl 并调用 showError", async () => {
      mockUploadFile.mockResolvedValue({ success: false });

      const props = createDefaultProps();
      const { result } = renderHook(() =>
        useUploadHandlers(props.setBeats, props.success, props.warn, undefined, props.showError),
      );

      const file = createMockFile();
      await act(async () => {
        await result.current.handleUploadLastFrame("beat-1", file);
      });

      expect(props.showError).toHaveBeenCalled();
    });
  });

  describe("handleUploadVideo", () => {
    it("上传成功时应更新 videoUrl 并调用 success", async () => {
      const props = createDefaultProps();
      const { result } = renderHook(() =>
        useUploadHandlers(props.setBeats, props.success, props.warn, undefined, props.showError),
      );

      const file = createMockFile("test.mp4", "video/mp4");
      await act(async () => {
        await result.current.handleUploadVideo("beat-1", file);
      });

      expect(props.setBeats).toHaveBeenCalled();
      expect(props.success).toHaveBeenCalled();
    });

    it("上传失败时应恢复之前的 videoUrl 和 framePair 并调用 showError", async () => {
      mockUploadFile.mockResolvedValue({ success: false });

      const props = createDefaultProps();
      const { result } = renderHook(() =>
        useUploadHandlers(props.setBeats, props.success, props.warn, undefined, props.showError),
      );

      const file = createMockFile("test.mp4", "video/mp4");
      await act(async () => {
        await result.current.handleUploadVideo("beat-1", file);
      });

      expect(props.showError).toHaveBeenCalled();
    });

    it("编码不兼容时应调用 warn", async () => {
      const { isCodecSupportedByProvider } = await import("@/shared/video-utils/codec-check");
      (isCodecSupportedByProvider as ReturnType<typeof vi.fn>).mockReturnValue({
        supported: false,
        reason: "不支持该编码",
      });

      const props = createDefaultProps();
      const { result } = renderHook(() =>
        useUploadHandlers(props.setBeats, props.success, props.warn, undefined, props.showError),
      );

      const file = createMockFile("test.mp4", "video/mp4");
      await act(async () => {
        await result.current.handleUploadVideo("beat-1", file);
      });

      expect(props.warn).toHaveBeenCalled();
    });

    it("编码检测失败时不应阻断上传流程", async () => {
      const { detectVideoCodec } = await import("@/shared/video-utils");
      (detectVideoCodec as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("codec detect fail"));

      const props = createDefaultProps();
      const { result } = renderHook(() =>
        useUploadHandlers(props.setBeats, props.success, props.warn, undefined, props.showError),
      );

      const file = createMockFile("test.mp4", "video/mp4");
      await act(async () => {
        await result.current.handleUploadVideo("beat-1", file);
      });

      expect(mockErrorLogger.warn).toHaveBeenCalled();
      expect(props.success).toHaveBeenCalled();
    });

    it("帧提取失败时不应阻断上传流程", async () => {
      const { extractVideoFrames } = await import("@/shared/video-utils");
      (extractVideoFrames as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("frame extract fail"));

      const props = createDefaultProps();
      const { result } = renderHook(() =>
        useUploadHandlers(props.setBeats, props.success, props.warn, undefined, props.showError),
      );

      const file = createMockFile("test.mp4", "video/mp4");
      await act(async () => {
        await result.current.handleUploadVideo("beat-1", file);
      });

      expect(mockErrorLogger.warn).toHaveBeenCalled();
      expect(props.success).toHaveBeenCalled();
    });

    it("有首尾帧时应使用带帧的成功消息", async () => {
      const { extractVideoFrames } = await import("@/shared/video-utils");
      (extractVideoFrames as ReturnType<typeof vi.fn>).mockResolvedValue({
        firstFrame: "blob:first-frame",
        lastFrame: "blob:last-frame",
      });

      const props = createDefaultProps();
      const { result } = renderHook(() =>
        useUploadHandlers(props.setBeats, props.success, props.warn, undefined, props.showError),
      );

      const file = createMockFile("test.mp4", "video/mp4");
      await act(async () => {
        await result.current.handleUploadVideo("beat-1", file);
      });

      expect(props.success).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining("success.videoUpdatedWithFrames"),
      );
    });
  });

  describe("showError 可选参数", () => {
    it("showError 未传入时上传失败不应报错", async () => {
      mockUploadFile.mockResolvedValue({ success: false });

      const props = createDefaultProps();
      const { result } = renderHook(() =>
        useUploadHandlers(props.setBeats, props.success, props.warn),
      );

      const file = createMockFile();
      await act(async () => {
        await result.current.handleUploadKeyframe("beat-1", file);
      });

      expect(() => {}).not.toThrow();
    });
  });
});
