import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useBatchGenerator } from "../useBatchGenerator";

vi.mock("@/shared/error-logger", () => ({
  errorLogger: { warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/shared/utils/confirm", () => ({
  confirm: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/shared/constants", () => ({
  t: vi.fn((key: string) => key),
}));

vi.mock("@/domain/utils", () => ({
  getFirstFrameUrl: vi.fn((fp: any) => fp?.firstFrameUrl || fp?.firstFrame?.imageUrl),
  getLastFrameUrl: vi.fn((fp: any) => fp?.lastFrameUrl || fp?.lastFrame?.imageUrl),
}));

const mockGenerateKeyframe = vi.fn();
const mockGenerateFramePair = vi.fn();
const mockGenerateVideoNew = vi.fn();
const mockSuccess = vi.fn();
const mockShowError = vi.fn();
const mockSetBeats = vi.fn();

function createProps(beats: any[]) {
  return {
    beatsRef: { current: beats },
    setBeats: mockSetBeats,
    generateKeyframe: mockGenerateKeyframe,
    generateFramePair: mockGenerateFramePair,
    generateVideoNew: mockGenerateVideoNew,
    success: mockSuccess,
    showError: mockShowError,
  };
}

describe("useBatchGenerator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("batchGenerateKeyframes", () => {
    it("filters by skip_completed: only generates for beats without keyframes", async () => {
      const beats = [
        { id: "b1", keyframe: { imageUrl: "https://cdn.com/kf1.jpg" } },
        { id: "b2" },
      ];
      mockGenerateKeyframe.mockResolvedValue({ id: "b2", keyframe: { imageUrl: "new.jpg" } });
      const { result } = renderHook(() => useBatchGenerator(createProps(beats)));
      await act(async () => {
        await result.current.batchGenerateKeyframes(undefined, { strategy: "skip_completed" });
      });
      expect(mockGenerateKeyframe).toHaveBeenCalledTimes(1);
      expect(mockGenerateKeyframe).toHaveBeenCalledWith("b2", null);
    });
  });

  describe("batchGenerateFramePairs", () => {
    it("filters by skip_completed: excludes beats with lastFrameUrl or lastFrame.imageUrl", async () => {
      const beats = [
        { id: "b1", keyframe: { imageUrl: "kf.jpg" }, framePair: { lastFrameUrl: "lf.jpg" } },
        { id: "b2", keyframe: { imageUrl: "kf2.jpg" }, framePair: { lastFrame: { imageUrl: "lf2.jpg" } } },
        { id: "b3", keyframe: { imageUrl: "kf3.jpg" } },
      ];
      mockGenerateFramePair.mockResolvedValue({ id: "b3", framePair: { firstFrameUrl: "ff.jpg" } });
      const { result } = renderHook(() => useBatchGenerator(createProps(beats)));
      await act(async () => {
        await result.current.batchGenerateFramePairs(undefined, { strategy: "skip_completed" });
      });
      expect(mockGenerateFramePair).toHaveBeenCalledTimes(1);
      expect(mockGenerateFramePair).toHaveBeenCalledWith("b3", null);
    });
  });

  describe("batchGenerateVideos", () => {
    it("filters by skip_completed: excludes beats with videoUrl", async () => {
      const beats = [
        { id: "b1", framePair: { firstFrameUrl: "ff.jpg" }, videoGen: { videoUrl: "v.mp4" } },
        { id: "b2", framePair: { firstFrameUrl: "ff2.jpg" } },
      ];
      mockGenerateVideoNew.mockResolvedValue(undefined);
      const { result } = renderHook(() => useBatchGenerator(createProps(beats)));
      await result.current.batchGenerateVideos(undefined, { strategy: "skip_completed" });
      expect(mockGenerateVideoNew).toHaveBeenCalledTimes(1);
    });

    it("includes beats with firstFrame.imageUrl fallback", async () => {
      const beats = [
        { id: "b1", framePair: { firstFrame: { imageUrl: "ff.jpg" } } },
      ];
      mockGenerateVideoNew.mockResolvedValue(undefined);
      const { result } = renderHook(() => useBatchGenerator(createProps(beats)));
      await result.current.batchGenerateVideos(undefined, { strategy: "skip_completed" });
      expect(mockGenerateVideoNew).toHaveBeenCalledTimes(1);
    });
  });

  describe("getPrevBeatForChain", () => {
    it("finds previous beat with lastFrameUrl for framepair level", async () => {
      const beats = [
        { id: "b1", keyframe: { imageUrl: "kf1.jpg" }, framePair: { lastFrameUrl: "lf1.jpg" } },
        { id: "b2", keyframe: { imageUrl: "kf2.jpg" } },
      ] as any[];
      const { result } = renderHook(() => useBatchGenerator(createProps(beats)));
      const prev = result.current.getPrevBeatForChain(1, beats, "framepair");
      expect(prev).not.toBeNull();
      expect(prev?.id).toBe("b1");
    });

    it("finds previous beat with lastFrame.imageUrl fallback for framepair level", async () => {
      const beats = [
        { id: "b1", keyframe: { imageUrl: "kf1.jpg" }, framePair: { lastFrame: { imageUrl: "lf1.jpg" } } },
        { id: "b2", keyframe: { imageUrl: "kf2.jpg" } },
      ] as any[];
      const { result } = renderHook(() => useBatchGenerator(createProps(beats)));
      const prev = result.current.getPrevBeatForChain(1, beats, "framepair");
      expect(prev).not.toBeNull();
      expect(prev?.id).toBe("b1");
    });

    it("returns null when no previous beat has framePair", async () => {
      const beats = [
        { id: "b1", keyframe: { imageUrl: "kf1.jpg" } },
        { id: "b2", keyframe: { imageUrl: "kf2.jpg" } },
      ] as any[];
      const { result } = renderHook(() => useBatchGenerator(createProps(beats)));
      const prev = result.current.getPrevBeatForChain(1, beats, "framepair");
      expect(prev).toBeNull();
    });
  });
});
