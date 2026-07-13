import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { StoryBeat } from "@/domain/schemas";

const { mockRevokeBlobUrl, mockUploadAndGetPersistentUrl } = vi.hoisted(() => ({
  mockRevokeBlobUrl: vi.fn(),
  mockUploadAndGetPersistentUrl: vi.fn(),
}));

vi.mock("@/modules/story/generation/hooks/upload-utils", () => ({
  revokeBlobUrl: mockRevokeBlobUrl,
  uploadAndGetPersistentUrl: mockUploadAndGetPersistentUrl,
}));

vi.mock("@/shared/constants", () => ({
  t: vi.fn((key: string) => key),
}));

import { useFrameUploadHandlers } from "../use-frame-upload-handlers";

const mockBeatWithKeyframe: StoryBeat = {
  id: "beat-1",
  sequence: 0,
  description: "测试镜头",
  type: "scene",
  characterIds: [],
  elementIds: [],
  enhancedGeneration: false,
  keyframe: {
    imageUrl: "blob:old-keyframe-url",
    prompt: "旧提示词",
    generatedAt: "2026-01-01T00:00:00.000Z",
  },
};

const mockBeatWithoutKeyframe: StoryBeat = {
  id: "beat-1",
  sequence: 0,
  description: "测试镜头",
  type: "scene",
  characterIds: [],
  elementIds: [],
  enhancedGeneration: false,
};

const mockBeatWithFramePair: StoryBeat = {
  id: "beat-1",
  sequence: 0,
  description: "测试镜头",
  type: "scene",
  characterIds: [],
  elementIds: [],
  enhancedGeneration: false,
  framePair: {
    firstFrame: {
      imageUrl: "blob:old-first-frame-url",
      prompt: "首帧提示词",
      derivedFrom: "keyframe",
    },
    lastFrame: {
      imageUrl: "blob:old-last-frame-url",
      prompt: "尾帧提示词",
      derivedFrom: "keyframe",
    },
    generatedAt: "2026-01-01T00:00:00.000Z",
  },
};

const mockBeatWithoutFramePair: StoryBeat = {
  id: "beat-1",
  sequence: 0,
  description: "测试镜头",
  type: "scene",
  characterIds: [],
  elementIds: [],
  enhancedGeneration: false,
};

function createDefaultProps(initialBeats: StoryBeat[]) {
  let beatsState: StoryBeat[] = initialBeats;
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
    showError: vi.fn(),
  };
}

function createMockFile(name = "test.png", type = "image/png"): File {
  return new File(["test content"], name, { type });
}

describe("useFrameUploadHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.URL.createObjectURL = vi.fn(() => "blob:test-url");
    globalThis.URL.revokeObjectURL = vi.fn();
    mockUploadAndGetPersistentUrl.mockResolvedValue(
      "https://example.com/persistent.png",
    );
  });

  describe("handleUploadKeyframe", () => {
    it("上传成功时应更新 keyframe.imageUrl 为 persistentUrl 并调用 success", async () => {
      const props = createDefaultProps([mockBeatWithKeyframe]);
      const { result } = renderHook(() =>
        useFrameUploadHandlers(props.setBeats, props.success, props.showError),
      );

      const file = createMockFile();
      await act(async () => {
        await result.current.handleUploadKeyframe("beat-1", file);
      });

      expect(props.setBeats).toHaveBeenCalledTimes(2);
      expect(mockUploadAndGetPersistentUrl).toHaveBeenCalledWith(file);

      const finalBeat = props.getBeats()[0]!;
      expect(finalBeat.keyframe?.imageUrl).toBe(
        "https://example.com/persistent.png",
      );

      expect(props.success).toHaveBeenCalledWith(
        "success.uploaded",
        "success.keyframeUpdated",
      );

      expect(mockRevokeBlobUrl).toHaveBeenCalledWith("blob:old-keyframe-url");
      expect(mockRevokeBlobUrl).toHaveBeenCalledWith("blob:test-url");
    });

    it("上传失败时应回滚到 previousImageUrl 并调用 showError", async () => {
      mockUploadAndGetPersistentUrl.mockResolvedValue(null);

      const props = createDefaultProps([mockBeatWithKeyframe]);
      const { result } = renderHook(() =>
        useFrameUploadHandlers(props.setBeats, props.success, props.showError),
      );

      const file = createMockFile();
      await act(async () => {
        await result.current.handleUploadKeyframe("beat-1", file);
      });

      expect(props.setBeats).toHaveBeenCalledTimes(2);
      expect(props.showError).toHaveBeenCalledWith(
        "error.uploadFailed",
        "error.keyframeUploadServerFailed",
      );

      const finalBeat = props.getBeats()[0]!;
      expect(finalBeat.keyframe?.imageUrl).toBe("blob:old-keyframe-url");

      expect(mockRevokeBlobUrl).toHaveBeenCalledWith("blob:old-keyframe-url");
      expect(mockRevokeBlobUrl).toHaveBeenCalledWith("blob:test-url");
    });

    it("原有 keyframe 不存在时 previousImageUrl 应为 undefined，回滚时设为 undefined", async () => {
      mockUploadAndGetPersistentUrl.mockResolvedValue(null);

      const props = createDefaultProps([mockBeatWithoutKeyframe]);
      const { result } = renderHook(() =>
        useFrameUploadHandlers(props.setBeats, props.success, props.showError),
      );

      const file = createMockFile();
      await act(async () => {
        await result.current.handleUploadKeyframe("beat-1", file);
      });

      const finalBeat = props.getBeats()[0]!;
      expect(finalBeat.keyframe?.imageUrl).toBeUndefined();

      expect(props.showError).toHaveBeenCalledWith(
        "error.uploadFailed",
        "error.keyframeUploadServerFailed",
      );
    });

    it("已有 keyframe.imageUrl 时应调用 revokeBlobUrl 释放旧 url", async () => {
      const props = createDefaultProps([mockBeatWithKeyframe]);
      const { result } = renderHook(() =>
        useFrameUploadHandlers(props.setBeats, props.success, props.showError),
      );

      const file = createMockFile();
      await act(async () => {
        await result.current.handleUploadKeyframe("beat-1", file);
      });

      expect(mockRevokeBlobUrl).toHaveBeenCalledWith("blob:old-keyframe-url");
      expect(mockRevokeBlobUrl).toHaveBeenCalledWith("blob:test-url");
    });

    it("showError 未传入时上传失败不应抛出错误", async () => {
      mockUploadAndGetPersistentUrl.mockResolvedValue(null);

      const props = createDefaultProps([mockBeatWithKeyframe]);
      const { result } = renderHook(() =>
        useFrameUploadHandlers(props.setBeats, props.success),
      );

      const file = createMockFile();
      await expect(
        act(async () => {
          await result.current.handleUploadKeyframe("beat-1", file);
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe("handleUploadFirstFrame", () => {
    it("上传成功时应更新 firstFrame.imageUrl 为 persistentUrl 并调用 success", async () => {
      const props = createDefaultProps([mockBeatWithFramePair]);
      const { result } = renderHook(() =>
        useFrameUploadHandlers(props.setBeats, props.success, props.showError),
      );

      const file = createMockFile();
      await act(async () => {
        await result.current.handleUploadFirstFrame("beat-1", file);
      });

      expect(props.setBeats).toHaveBeenCalledTimes(2);
      expect(mockUploadAndGetPersistentUrl).toHaveBeenCalledWith(file);

      const finalBeat = props.getBeats()[0]!;
      expect(finalBeat.framePair?.firstFrame?.imageUrl).toBe(
        "https://example.com/persistent.png",
      );

      expect(props.success).toHaveBeenCalledWith(
        "success.uploaded",
        "success.firstFrameUpdated",
      );

      expect(mockRevokeBlobUrl).toHaveBeenCalledWith("blob:old-first-frame-url");
      expect(mockRevokeBlobUrl).toHaveBeenCalledWith("blob:test-url");
    });

    it("上传失败时应回滚到 previousImageUrl 或空字符串并调用 showError", async () => {
      mockUploadAndGetPersistentUrl.mockResolvedValue(null);

      const props = createDefaultProps([mockBeatWithFramePair]);
      const { result } = renderHook(() =>
        useFrameUploadHandlers(props.setBeats, props.success, props.showError),
      );

      const file = createMockFile();
      await act(async () => {
        await result.current.handleUploadFirstFrame("beat-1", file);
      });

      expect(props.setBeats).toHaveBeenCalledTimes(2);
      expect(props.showError).toHaveBeenCalledWith(
        "error.uploadFailed",
        "error.firstFrameUploadServerFailed",
      );

      const finalBeat = props.getBeats()[0]!;
      expect(finalBeat.framePair?.firstFrame?.imageUrl).toBe(
        "blob:old-first-frame-url",
      );

      expect(mockRevokeBlobUrl).toHaveBeenCalledWith("blob:old-first-frame-url");
      expect(mockRevokeBlobUrl).toHaveBeenCalledWith("blob:test-url");
    });

    it("framePair 不存在时应创建新的 framePair 结构（含 firstFrame + lastFrame: undefined）", async () => {
      const props = createDefaultProps([mockBeatWithoutFramePair]);
      const { result } = renderHook(() =>
        useFrameUploadHandlers(props.setBeats, props.success, props.showError),
      );

      const file = createMockFile();
      await act(async () => {
        await result.current.handleUploadFirstFrame("beat-1", file);
      });

      const finalBeat = props.getBeats()[0]!;
      expect(finalBeat.framePair).toBeDefined();
      expect(finalBeat.framePair?.firstFrame).toEqual({
        imageUrl: "https://example.com/persistent.png",
        prompt: "",
        derivedFrom: "",
      });
      expect(finalBeat.framePair?.lastFrame).toBeUndefined();
      expect(finalBeat.framePair?.generatedAt).toBeDefined();

      // previousImageUrl 为 undefined，回滚时应为 ""（仅在失败时验证）
      expect(props.success).toHaveBeenCalledWith(
        "success.uploaded",
        "success.firstFrameUpdated",
      );
    });

    it("framePair 不存在且上传失败时 firstFrame.imageUrl 应回滚为空字符串", async () => {
      mockUploadAndGetPersistentUrl.mockResolvedValue(null);

      const props = createDefaultProps([mockBeatWithoutFramePair]);
      const { result } = renderHook(() =>
        useFrameUploadHandlers(props.setBeats, props.success, props.showError),
      );

      const file = createMockFile();
      await act(async () => {
        await result.current.handleUploadFirstFrame("beat-1", file);
      });

      const finalBeat = props.getBeats()[0]!;
      expect(finalBeat.framePair?.firstFrame?.imageUrl).toBe("");

      expect(props.showError).toHaveBeenCalledWith(
        "error.uploadFailed",
        "error.firstFrameUploadServerFailed",
      );
    });
  });

  describe("handleUploadLastFrame", () => {
    it("上传成功时应更新 lastFrame.imageUrl 为 persistentUrl 并调用 success", async () => {
      const props = createDefaultProps([mockBeatWithFramePair]);
      const { result } = renderHook(() =>
        useFrameUploadHandlers(props.setBeats, props.success, props.showError),
      );

      const file = createMockFile();
      await act(async () => {
        await result.current.handleUploadLastFrame("beat-1", file);
      });

      expect(props.setBeats).toHaveBeenCalledTimes(2);
      expect(mockUploadAndGetPersistentUrl).toHaveBeenCalledWith(file);

      const finalBeat = props.getBeats()[0]!;
      expect(finalBeat.framePair?.lastFrame?.imageUrl).toBe(
        "https://example.com/persistent.png",
      );

      expect(props.success).toHaveBeenCalledWith(
        "success.uploaded",
        "success.lastFrameUpdated",
      );

      expect(mockRevokeBlobUrl).toHaveBeenCalledWith("blob:old-last-frame-url");
      expect(mockRevokeBlobUrl).toHaveBeenCalledWith("blob:test-url");
    });

    it("上传失败时应回滚到 previousImageUrl 或空字符串并调用 showError", async () => {
      mockUploadAndGetPersistentUrl.mockResolvedValue(null);

      const props = createDefaultProps([mockBeatWithFramePair]);
      const { result } = renderHook(() =>
        useFrameUploadHandlers(props.setBeats, props.success, props.showError),
      );

      const file = createMockFile();
      await act(async () => {
        await result.current.handleUploadLastFrame("beat-1", file);
      });

      expect(props.setBeats).toHaveBeenCalledTimes(2);
      expect(props.showError).toHaveBeenCalledWith(
        "error.uploadFailed",
        "error.lastFrameUploadServerFailed",
      );

      const finalBeat = props.getBeats()[0]!;
      expect(finalBeat.framePair?.lastFrame?.imageUrl).toBe(
        "blob:old-last-frame-url",
      );

      expect(mockRevokeBlobUrl).toHaveBeenCalledWith("blob:old-last-frame-url");
      expect(mockRevokeBlobUrl).toHaveBeenCalledWith("blob:test-url");
    });

    it("framePair 不存在时应创建新结构，firstFrame 默认为空值对象", async () => {
      const props = createDefaultProps([mockBeatWithoutFramePair]);
      const { result } = renderHook(() =>
        useFrameUploadHandlers(props.setBeats, props.success, props.showError),
      );

      const file = createMockFile();
      await act(async () => {
        await result.current.handleUploadLastFrame("beat-1", file);
      });

      const finalBeat = props.getBeats()[0]!;
      expect(finalBeat.framePair).toBeDefined();
      expect(finalBeat.framePair?.firstFrame).toEqual({
        imageUrl: "",
        prompt: "",
        derivedFrom: "",
      });
      expect(finalBeat.framePair?.lastFrame).toEqual({
        imageUrl: "https://example.com/persistent.png",
        prompt: "",
        derivedFrom: "",
      });
      expect(finalBeat.framePair?.generatedAt).toBeDefined();

      expect(props.success).toHaveBeenCalledWith(
        "success.uploaded",
        "success.lastFrameUpdated",
      );
    });

    it("framePair 不存在且上传失败时 lastFrame.imageUrl 应回滚为空字符串", async () => {
      mockUploadAndGetPersistentUrl.mockResolvedValue(null);

      const props = createDefaultProps([mockBeatWithoutFramePair]);
      const { result } = renderHook(() =>
        useFrameUploadHandlers(props.setBeats, props.success, props.showError),
      );

      const file = createMockFile();
      await act(async () => {
        await result.current.handleUploadLastFrame("beat-1", file);
      });

      const finalBeat = props.getBeats()[0]!;
      expect(finalBeat.framePair?.lastFrame?.imageUrl).toBe("");

      expect(props.showError).toHaveBeenCalledWith(
        "error.uploadFailed",
        "error.lastFrameUploadServerFailed",
      );
    });
  });

  describe("hook 隔离", () => {
    it("每次 renderHook 应独立维护 setBeats 状态", async () => {
      const props1 = createDefaultProps([mockBeatWithKeyframe]);
      const { result: result1 } = renderHook(() =>
        useFrameUploadHandlers(props1.setBeats, props1.success, props1.showError),
      );

      const props2 = createDefaultProps([mockBeatWithKeyframe]);
      renderHook(() =>
        useFrameUploadHandlers(props2.setBeats, props2.success, props2.showError),
      );

      const file = createMockFile();
      await act(async () => {
        await result1.current.handleUploadKeyframe("beat-1", file);
      });

      expect(props1.setBeats).toHaveBeenCalled();
      expect(props2.setBeats).not.toHaveBeenCalled();

      expect(props1.getBeats()[0]!.keyframe?.imageUrl).toBe(
        "https://example.com/persistent.png",
      );
      expect(props2.getBeats()[0]!.keyframe?.imageUrl).toBe("blob:old-keyframe-url");
    });

    it("beatId 不匹配时不应修改任何 beat，但 finally 仍兜底 revoke tempUrl", async () => {
      const props = createDefaultProps([mockBeatWithKeyframe]);
      const { result } = renderHook(() =>
        useFrameUploadHandlers(props.setBeats, props.success, props.showError),
      );

      const file = createMockFile();
      await act(async () => {
        await result.current.handleUploadKeyframe("nonexistent-beat", file);
      });

      const finalBeat = props.getBeats()[0]!;
      // beat 状态不变
      expect(finalBeat.keyframe?.imageUrl).toBe("blob:old-keyframe-url");

      // setBeats 仍被调用（updater 执行但无 beat 匹配，不会进入 revoke 分支）
      expect(props.setBeats).toHaveBeenCalledTimes(2);
      // 上传成功时 success 仍被调用（persistentUrl 为真值，与 beat 是否匹配无关）
      expect(props.success).toHaveBeenCalledWith(
        "success.uploaded",
        "success.keyframeUpdated",
      );
      // 旧 url 不应被 revoke（无 beat 匹配，revokeBlobUrl 不在 map 内执行）
      expect(mockRevokeBlobUrl).not.toHaveBeenCalledWith("blob:old-keyframe-url");
      // finally 块兜底 revoke tempUrl（tempUrlRevoked 保持 false）
      expect(mockRevokeBlobUrl).toHaveBeenCalledWith("blob:test-url");
    });
  });
});
