import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { StoryBeat } from "@/domain/schemas";

vi.mock("@/shared/utils/confirm", () => ({
  confirm: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  },
}));

import { confirm } from "@/shared/utils/confirm";
import { errorLogger } from "@/shared/error-logger";
import { useBatchGenerator } from "../useBatchGenerator";

function makeBeat(overrides: Partial<StoryBeat> = {}): StoryBeat {
  return {
    id: "beat-1",
    sequence: 0,
    description: "test beat",
    characters: [],
    elementIds: [],
    characterIds: [],
    enhancedGeneration: false,
    ...overrides,
  } as StoryBeat;
}

const beat1 = makeBeat({ id: "beat-1", sequence: 0, description: "beat 1" });
const beat2 = makeBeat({ id: "beat-2", sequence: 1, description: "beat 2" });
const beat3 = makeBeat({ id: "beat-3", sequence: 2, description: "beat 3" });

function createDefaultProps() {
  return {
    beatsRef: { current: [beat1, beat2, beat3] } as React.MutableRefObject<StoryBeat[]>,
    setBeats: vi.fn() as React.Dispatch<React.SetStateAction<StoryBeat[]>>,
    generateKeyframe: vi.fn().mockResolvedValue(undefined),
    generateFramePair: vi.fn().mockResolvedValue(undefined),
    generateVideoNew: vi.fn().mockResolvedValue(undefined),
    success: vi.fn(),
    showError: vi.fn(),
  };
}

describe("useBatchGenerator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    (confirm as ReturnType<typeof vi.fn>).mockResolvedValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("shouldUseChainReference", () => {
    it("chainMode 为 isolated 时应返回 false", () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useBatchGenerator(props));
      const beat = makeBeat({ chainMode: "isolated" });
      expect(result.current.shouldUseChainReference(beat, "keyframe")).toBe(false);
    });

    it("chainMode 为 custom 且有 customChainTarget 时应返回 true", () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useBatchGenerator(props));
      const beat = makeBeat({ chainMode: "custom", customChainTarget: "beat-0" });
      expect(result.current.shouldUseChainReference(beat, "keyframe")).toBe(true);
    });

    it("chainMode 为 custom 且无 customChainTarget 时应返回 false", () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useBatchGenerator(props));
      const beat = makeBeat({ chainMode: "custom" });
      expect(result.current.shouldUseChainReference(beat, "keyframe")).toBe(false);
    });

    it("chainMode 为 asset 时应返回 false", () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useBatchGenerator(props));
      const beat = makeBeat({ chainMode: "asset" });
      expect(result.current.shouldUseChainReference(beat, "keyframe")).toBe(false);
    });

    it("auto 模式下 keyframeInput 为 isolated 时应返回 false", () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useBatchGenerator(props));
      const beat = makeBeat({ keyframeInput: "isolated" });
      expect(result.current.shouldUseChainReference(beat, "keyframe")).toBe(false);
    });

    it("auto 模式下 keyframeInput 非 isolated 时应返回 true", () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useBatchGenerator(props));
      const beat = makeBeat({ keyframeInput: "ai" });
      expect(result.current.shouldUseChainReference(beat, "keyframe")).toBe(true);
    });

    it("auto 模式下 framePairInput 为 isolated 时应返回 false", () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useBatchGenerator(props));
      const beat = makeBeat({ framePairInput: "isolated" });
      expect(result.current.shouldUseChainReference(beat, "framepair")).toBe(false);
    });

    it("auto 模式下 videoInput 为 isolated 时应返回 false", () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useBatchGenerator(props));
      const beat = makeBeat({ videoInput: "isolated" });
      expect(result.current.shouldUseChainReference(beat, "video")).toBe(false);
    });

    it("auto 模式下无 input 字段时应返回 true", () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useBatchGenerator(props));
      const beat = makeBeat();
      expect(result.current.shouldUseChainReference(beat, "keyframe")).toBe(true);
    });
  });

  describe("getPrevBeatForChain", () => {
    it("keyframe 级别应返回有 imageUrl 的前一个 beat", () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useBatchGenerator(props));
      const beats = [
        makeBeat({ id: "b1", keyframe: { imageUrl: "https://img.png" } } as Partial<StoryBeat>),
        makeBeat({ id: "b2" }),
      ];
      const prev = result.current.getPrevBeatForChain(1, beats, "keyframe");
      expect(prev?.id).toBe("b1");
    });

    it("keyframe 级别应返回有 uploadedKeyframe 的前一个 beat", () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useBatchGenerator(props));
      const beats = [
        makeBeat({ id: "b1", uploadedKeyframe: "https://upload.png" }),
        makeBeat({ id: "b2" }),
      ];
      const prev = result.current.getPrevBeatForChain(1, beats, "keyframe");
      expect(prev?.id).toBe("b1");
    });

    it("keyframe 级别前一个 beat 无 keyframe 时应继续向前查找", () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useBatchGenerator(props));
      const beats = [
        makeBeat({ id: "b1", keyframe: { imageUrl: "https://img.png" } } as Partial<StoryBeat>),
        makeBeat({ id: "b2" }),
        makeBeat({ id: "b3" }),
      ];
      const prev = result.current.getPrevBeatForChain(2, beats, "keyframe");
      expect(prev?.id).toBe("b1");
    });

    it("framepair 级别应返回有 lastFrame imageUrl 的前一个 beat", () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useBatchGenerator(props));
      const beats = [
        makeBeat({ id: "b1", framePair: { lastFrame: { imageUrl: "https://last.png" } } } as Partial<StoryBeat>),
        makeBeat({ id: "b2" }),
      ];
      const prev = result.current.getPrevBeatForChain(1, beats, "framepair");
      expect(prev?.id).toBe("b1");
    });

    it("framepair 级别应返回有 uploadedFramePair.lastFrame 的前一个 beat", () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useBatchGenerator(props));
      const beats = [
        makeBeat({ id: "b1", uploadedFramePair: { firstFrame: "a.png", lastFrame: "b.png" } }),
        makeBeat({ id: "b2" }),
      ];
      const prev = result.current.getPrevBeatForChain(1, beats, "framepair");
      expect(prev?.id).toBe("b1");
    });

    it("video 级别应返回有 videoUrl 的前一个 beat", () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useBatchGenerator(props));
      const beats = [
        makeBeat({ id: "b1", videoGen: { videoUrl: "https://video.mp4" } } as Partial<StoryBeat>),
        makeBeat({ id: "b2" }),
      ];
      const prev = result.current.getPrevBeatForChain(1, beats, "video");
      expect(prev?.id).toBe("b1");
    });

    it("video 级别应返回有 uploadedVideo 的前一个 beat", () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useBatchGenerator(props));
      const beats = [
        makeBeat({ id: "b1", uploadedVideo: "https://upload.mp4" }),
        makeBeat({ id: "b2" }),
      ];
      const prev = result.current.getPrevBeatForChain(1, beats, "video");
      expect(prev?.id).toBe("b1");
    });

    it("第一个 beat 应返回 null", () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useBatchGenerator(props));
      const beats = [makeBeat({ id: "b1" })];
      const prev = result.current.getPrevBeatForChain(0, beats, "keyframe");
      expect(prev).toBeNull();
    });

    it("所有前序 beat 都无对应资源时应返回 null", () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useBatchGenerator(props));
      const beats = [makeBeat({ id: "b1" }), makeBeat({ id: "b2" }), makeBeat({ id: "b3" })];
      const prev = result.current.getPrevBeatForChain(2, beats, "keyframe");
      expect(prev).toBeNull();
    });
  });

  describe("batchGenerateKeyframes", () => {
    it("默认策略应串行处理所有 beat", async () => {
      const props = createDefaultProps();
      props.generateKeyframe.mockResolvedValueOnce(makeBeat({ id: "beat-1", keyframe: { imageUrl: "a.png" } } as Partial<StoryBeat>));
      props.generateKeyframe.mockResolvedValueOnce(makeBeat({ id: "beat-2", keyframe: { imageUrl: "b.png" } } as Partial<StoryBeat>));
      props.generateKeyframe.mockResolvedValueOnce(makeBeat({ id: "beat-3", keyframe: { imageUrl: "c.png" } } as Partial<StoryBeat>));
      const { result } = renderHook(() => useBatchGenerator(props));

      let batchResult: Awaited<ReturnType<typeof result.current.batchGenerateKeyframes>>;
      await act(async () => {
        batchResult = await result.current.batchGenerateKeyframes();
      });

      expect(batchResult!).toEqual({ success: 3, failed: 0, skipped: 0 });
      expect(props.generateKeyframe).toHaveBeenCalledTimes(3);
    });

    it("skip_completed 策略应跳过已有 keyframe 的 beat", async () => {
      const props = createDefaultProps();
      const beatWithKeyframe = makeBeat({
        id: "beat-1",
        keyframe: { imageUrl: "https://existing.png" },
      } as Partial<StoryBeat>);
      props.beatsRef.current = [beatWithKeyframe, beat2, beat3];
      props.generateKeyframe.mockResolvedValueOnce(makeBeat({ id: "beat-2" }));
      props.generateKeyframe.mockResolvedValueOnce(makeBeat({ id: "beat-3" }));
      const { result } = renderHook(() => useBatchGenerator(props));

      let batchResult: Awaited<ReturnType<typeof result.current.batchGenerateKeyframes>>;
      await act(async () => {
        batchResult = await result.current.batchGenerateKeyframes(undefined, { strategy: "skip_completed" });
      });

      expect(batchResult!).toEqual({ success: 2, failed: 0, skipped: 0 });
      expect(props.generateKeyframe).toHaveBeenCalledTimes(2);
      expect(props.generateKeyframe).not.toHaveBeenCalledWith("beat-1", expect.anything());
    });

    it("skip_completed 策略下所有 beat 已完成时应显示提示并返回", async () => {
      const props = createDefaultProps();
      const completedBeats = [
        makeBeat({ id: "b1", keyframe: { imageUrl: "a.png" } } as Partial<StoryBeat>),
        makeBeat({ id: "b2", keyframe: { imageUrl: "b.png" } } as Partial<StoryBeat>),
      ];
      props.beatsRef.current = completedBeats;
      const { result } = renderHook(() => useBatchGenerator(props));

      let batchResult: Awaited<ReturnType<typeof result.current.batchGenerateKeyframes>>;
      await act(async () => {
        batchResult = await result.current.batchGenerateKeyframes(undefined, { strategy: "skip_completed" });
      });

      expect(batchResult!).toEqual({ success: 0, failed: 0, skipped: 0 });
      expect(props.showError).toHaveBeenCalledWith("无可生成分镜", "所有分镜已完成");
      expect(props.generateKeyframe).not.toHaveBeenCalled();
    });

    it("无 beat 时应显示提示并返回", async () => {
      const props = createDefaultProps();
      props.beatsRef.current = [];
      const { result } = renderHook(() => useBatchGenerator(props));

      let batchResult: Awaited<ReturnType<typeof result.current.batchGenerateKeyframes>>;
      await act(async () => {
        batchResult = await result.current.batchGenerateKeyframes();
      });

      expect(batchResult!).toEqual({ success: 0, failed: 0, skipped: 0 });
      expect(props.showError).toHaveBeenCalledWith("无可生成分镜", "请先添加分镜");
    });

    it("用户取消确认时应返回零结果", async () => {
      (confirm as ReturnType<typeof vi.fn>).mockResolvedValue(false);
      const props = createDefaultProps();
      const { result } = renderHook(() => useBatchGenerator(props));

      let batchResult: Awaited<ReturnType<typeof result.current.batchGenerateKeyframes>>;
      await act(async () => {
        batchResult = await result.current.batchGenerateKeyframes();
      });

      expect(batchResult!).toEqual({ success: 0, failed: 0, skipped: 0 });
      expect(props.generateKeyframe).not.toHaveBeenCalled();
    });

    it("已上传 keyframe 的 beat 应被跳过", async () => {
      const props = createDefaultProps();
      const uploadedBeat = makeBeat({ id: "beat-1", uploadedKeyframe: "https://upload.png" });
      props.beatsRef.current = [uploadedBeat, beat2, beat3];
      props.generateKeyframe.mockResolvedValueOnce(makeBeat({ id: "beat-2" }));
      props.generateKeyframe.mockResolvedValueOnce(makeBeat({ id: "beat-3" }));
      const { result } = renderHook(() => useBatchGenerator(props));

      let batchResult: Awaited<ReturnType<typeof result.current.batchGenerateKeyframes>>;
      await act(async () => {
        batchResult = await result.current.batchGenerateKeyframes();
      });

      expect(batchResult!).toEqual({ success: 2, failed: 0, skipped: 1 });
      expect(props.generateKeyframe).not.toHaveBeenCalledWith("beat-1", expect.anything());
    });

    it("generateKeyframe 返回 void 时应计为失败", async () => {
      const props = createDefaultProps();
      props.generateKeyframe.mockResolvedValueOnce(undefined);
      props.generateKeyframe.mockResolvedValueOnce(makeBeat({ id: "beat-2" }));
      props.generateKeyframe.mockResolvedValueOnce(makeBeat({ id: "beat-3" }));
      const { result } = renderHook(() => useBatchGenerator(props));

      let batchResult: Awaited<ReturnType<typeof result.current.batchGenerateKeyframes>>;
      await act(async () => {
        batchResult = await result.current.batchGenerateKeyframes();
      });

      expect(batchResult!).toEqual({ success: 2, failed: 1, skipped: 0 });
    });

    it("单个 beat 失败不应阻止后续 beat（skipOnError=true）", async () => {
      const props = createDefaultProps();
      props.generateKeyframe.mockRejectedValueOnce(new Error("fail"));
      props.generateKeyframe.mockResolvedValueOnce(makeBeat({ id: "beat-2" }));
      props.generateKeyframe.mockResolvedValueOnce(makeBeat({ id: "beat-3" }));
      const { result } = renderHook(() => useBatchGenerator(props));

      let batchResult: Awaited<ReturnType<typeof result.current.batchGenerateKeyframes>>;
      await act(async () => {
        batchResult = await result.current.batchGenerateKeyframes();
      });

      expect(batchResult!).toEqual({ success: 2, failed: 1, skipped: 0 });
      expect(props.generateKeyframe).toHaveBeenCalledTimes(3);
      expect(errorLogger.warn).toHaveBeenCalledTimes(1);
    });

    it("skipOnError=false 且 continueOnFallback=true 时失败应继续", async () => {
      const props = createDefaultProps();
      props.generateKeyframe.mockRejectedValueOnce(new Error("fail"));
      props.generateKeyframe.mockResolvedValueOnce(makeBeat({ id: "beat-2" }));
      props.generateKeyframe.mockResolvedValueOnce(makeBeat({ id: "beat-3" }));
      const { result } = renderHook(() => useBatchGenerator(props));

      let batchResult: Awaited<ReturnType<typeof result.current.batchGenerateKeyframes>>;
      await act(async () => {
        batchResult = await result.current.batchGenerateKeyframes(undefined, { skipOnError: false, continueOnFallback: true });
      });

      expect(batchResult!).toEqual({ success: 2, failed: 1, skipped: 0 });
    });

    it("skipOnError=false 且 continueOnFallback=false 时 keyframe 循环仍继续（无 break）", async () => {
      const props = createDefaultProps();
      props.generateKeyframe.mockRejectedValueOnce(new Error("fail"));
      props.generateKeyframe.mockResolvedValueOnce(makeBeat({ id: "beat-2" }));
      props.generateKeyframe.mockResolvedValueOnce(undefined);
      const { result } = renderHook(() => useBatchGenerator(props));

      let batchResult: Awaited<ReturnType<typeof result.current.batchGenerateKeyframes>>;
      await act(async () => {
        batchResult = await result.current.batchGenerateKeyframes(undefined, { skipOnError: false, continueOnFallback: false });
      });

      expect(batchResult!).toEqual({ success: 1, failed: 2, skipped: 0 });
      expect(props.generateKeyframe).toHaveBeenCalledTimes(3);
    });

    it("chain 模式下应传递前一个 beat 作为参考", async () => {
      const props = createDefaultProps();
      const beatWithKf = makeBeat({ id: "beat-1", keyframe: { imageUrl: "https://img.png" } } as Partial<StoryBeat>);
      props.beatsRef.current = [beatWithKf, beat2, beat3];
      const beat1Result = makeBeat({ id: "beat-1", keyframe: { imageUrl: "https://img.png" } } as Partial<StoryBeat>);
      props.generateKeyframe.mockResolvedValueOnce(beat1Result);
      props.generateKeyframe.mockResolvedValueOnce(makeBeat({ id: "beat-2" }));
      const { result } = renderHook(() => useBatchGenerator(props));

      await act(async () => {
        await result.current.batchGenerateKeyframes();
      });

      expect(props.generateKeyframe).toHaveBeenCalledWith("beat-1", null);
      expect(props.generateKeyframe).toHaveBeenCalledWith("beat-2", beat1Result);
    });

    it("isolated chainMode 下不应传递前一个 beat", async () => {
      const props = createDefaultProps();
      const beatWithKf = makeBeat({ id: "beat-1", keyframe: { imageUrl: "https://img.png" } } as Partial<StoryBeat>);
      props.beatsRef.current = [beatWithKf, beat2];
      props.generateKeyframe.mockResolvedValueOnce(makeBeat({ id: "beat-1" }));
      props.generateKeyframe.mockResolvedValueOnce(makeBeat({ id: "beat-2" }));
      const { result } = renderHook(() => useBatchGenerator(props));

      await act(async () => {
        await result.current.batchGenerateKeyframes(undefined, { chainMode: "isolated" });
      });

      expect(props.generateKeyframe).toHaveBeenCalledWith("beat-1", null);
      expect(props.generateKeyframe).toHaveBeenCalledWith("beat-2", null);
    });

    it("指定 beatIds 时应只处理指定的 beat", async () => {
      const props = createDefaultProps();
      props.generateKeyframe.mockResolvedValueOnce(makeBeat({ id: "beat-1" }));
      const { result } = renderHook(() => useBatchGenerator(props));

      await act(async () => {
        await result.current.batchGenerateKeyframes(["beat-1"]);
      });

      expect(props.generateKeyframe).toHaveBeenCalledTimes(1);
      expect(props.generateKeyframe).toHaveBeenCalledWith("beat-1", null);
    });

    it("全部成功且无跳过时应显示成功消息", async () => {
      const props = createDefaultProps();
      props.generateKeyframe.mockResolvedValueOnce(makeBeat({ id: "beat-1" }));
      props.generateKeyframe.mockResolvedValueOnce(makeBeat({ id: "beat-2" }));
      props.generateKeyframe.mockResolvedValueOnce(makeBeat({ id: "beat-3" }));
      const { result } = renderHook(() => useBatchGenerator(props));

      await act(async () => {
        await result.current.batchGenerateKeyframes();
      });

      expect(props.success).toHaveBeenCalledWith("批量生成完成", "成功为 3 个分镜生成预览图");
    });

    it("有失败或跳过时应显示汇总消息", async () => {
      const props = createDefaultProps();
      const uploadedBeat = makeBeat({ id: "beat-1", uploadedKeyframe: "https://upload.png" });
      props.beatsRef.current = [uploadedBeat, beat2, beat3];
      props.generateKeyframe.mockRejectedValueOnce(new Error("fail"));
      props.generateKeyframe.mockResolvedValueOnce(makeBeat({ id: "beat-3" }));
      const { result } = renderHook(() => useBatchGenerator(props));

      await act(async () => {
        await result.current.batchGenerateKeyframes();
      });

      expect(props.success).toHaveBeenCalledWith(
        "批量生成完成",
        expect.stringContaining("成功 1 个"),
      );
      expect(props.success).toHaveBeenCalledWith(
        "批量生成完成",
        expect.stringContaining("失败 1 个"),
      );
      expect(props.success).toHaveBeenCalledWith(
        "批量生成完成",
        expect.stringContaining("跳过 1 个"),
      );
    });

    it("generateKeyframe 返回结果时应调用 setBeats 更新", async () => {
      const props = createDefaultProps();
      const updatedBeat = makeBeat({ id: "beat-1", keyframe: { imageUrl: "new.png" } } as Partial<StoryBeat>);
      props.generateKeyframe.mockResolvedValueOnce(updatedBeat);
      props.generateKeyframe.mockResolvedValueOnce(undefined);
      props.generateKeyframe.mockResolvedValueOnce(undefined);
      const { result } = renderHook(() => useBatchGenerator(props));

      await act(async () => {
        await result.current.batchGenerateKeyframes();
      });

      expect(props.setBeats).toHaveBeenCalled();
      const updater = (props.setBeats as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0]! as (prev: StoryBeat[]) => StoryBeat[];
      const updated = updater([beat1, beat2, beat3]);
      expect(updated[0]).toEqual(updatedBeat);
    });

    it("isolated 模式确认消息应包含隔离提示", async () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useBatchGenerator(props));

      await act(async () => {
        await result.current.batchGenerateKeyframes(undefined, { chainMode: "isolated" });
      });

      expect(confirm).toHaveBeenCalledWith(
        expect.stringContaining("隔离模式"),
        "批量生成预览图",
      );
    });

    it("auto 模式确认消息应包含串行引用提示", async () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useBatchGenerator(props));

      await act(async () => {
        await result.current.batchGenerateKeyframes(undefined, { chainMode: "auto" });
      });

      expect(confirm).toHaveBeenCalledWith(
        expect.stringContaining("串行生成"),
        "批量生成预览图",
      );
    });
  });

  describe("batchGenerateFramePairs", () => {
    it("应只处理有 keyframe 的 beat", async () => {
      const props = createDefaultProps();
      const beatWithKf = makeBeat({ id: "beat-1", keyframe: { imageUrl: "https://img.png" } } as Partial<StoryBeat>);
      props.beatsRef.current = [beatWithKf, beat2, beat3];
      props.generateFramePair.mockResolvedValueOnce(makeBeat({ id: "beat-1" }));
      const { result } = renderHook(() => useBatchGenerator(props));

      await act(async () => {
        await result.current.batchGenerateFramePairs();
      });

      expect(props.generateFramePair).toHaveBeenCalledTimes(1);
      expect(props.generateFramePair).toHaveBeenCalledWith("beat-1", null);
    });

    it("有 uploadedKeyframe 的 beat 也应被处理", async () => {
      const props = createDefaultProps();
      const uploadedBeat = makeBeat({ id: "beat-1", uploadedKeyframe: "https://upload.png" });
      props.beatsRef.current = [uploadedBeat, beat2];
      props.generateFramePair.mockResolvedValueOnce(makeBeat({ id: "beat-1" }));
      const { result } = renderHook(() => useBatchGenerator(props));

      await act(async () => {
        await result.current.batchGenerateFramePairs();
      });

      expect(props.generateFramePair).toHaveBeenCalledTimes(1);
    });

    it("无 keyframe 的 beat 时应显示提示", async () => {
      const props = createDefaultProps();
      props.beatsRef.current = [beat1, beat2, beat3];
      const { result } = renderHook(() => useBatchGenerator(props));

      await act(async () => {
        await result.current.batchGenerateFramePairs();
      });

      expect(props.showError).toHaveBeenCalledWith("无可生成分镜", "请先生成预览图");
      expect(props.generateFramePair).not.toHaveBeenCalled();
    });

    it("skip_completed 应跳过已有 framePair 的 beat", async () => {
      const props = createDefaultProps();
      const beatWithFp = makeBeat({
        id: "beat-1",
        keyframe: { imageUrl: "https://img.png" },
        framePair: { lastFrame: { imageUrl: "https://last.png" } },
      } as Partial<StoryBeat>);
      const beatWithKf = makeBeat({ id: "beat-2", keyframe: { imageUrl: "https://img2.png" } } as Partial<StoryBeat>);
      props.beatsRef.current = [beatWithFp, beatWithKf];
      props.generateFramePair.mockResolvedValueOnce(makeBeat({ id: "beat-2" }));
      const { result } = renderHook(() => useBatchGenerator(props));

      await act(async () => {
        await result.current.batchGenerateFramePairs(undefined, { strategy: "skip_completed" });
      });

      expect(props.generateFramePair).toHaveBeenCalledTimes(1);
      expect(props.generateFramePair).toHaveBeenCalledWith("beat-2", null);
    });

    it("skip_completed 下有 uploadedFramePair 的 beat 也应被跳过", async () => {
      const props = createDefaultProps();
      const beatWithUploaded = makeBeat({
        id: "beat-1",
        keyframe: { imageUrl: "https://img.png" },
        uploadedFramePair: { firstFrame: "a.png", lastFrame: "b.png" },
      });
      const beatWithKf = makeBeat({ id: "beat-2", keyframe: { imageUrl: "https://img2.png" } } as Partial<StoryBeat>);
      props.beatsRef.current = [beatWithUploaded, beatWithKf];
      props.generateFramePair.mockResolvedValueOnce(makeBeat({ id: "beat-2" }));
      const { result } = renderHook(() => useBatchGenerator(props));

      await act(async () => {
        await result.current.batchGenerateFramePairs(undefined, { strategy: "skip_completed" });
      });

      expect(props.generateFramePair).toHaveBeenCalledTimes(1);
    });

    it("已上传 framePair 的 beat 应被跳过", async () => {
      const props = createDefaultProps();
      const uploadedBeat = makeBeat({
        id: "beat-1",
        keyframe: { imageUrl: "https://img.png" },
        uploadedFramePair: { firstFrame: "a.png", lastFrame: "b.png" },
      });
      const beatWithKf = makeBeat({ id: "beat-2", keyframe: { imageUrl: "https://img2.png" } } as Partial<StoryBeat>);
      props.beatsRef.current = [uploadedBeat, beatWithKf];
      props.generateFramePair.mockResolvedValueOnce(makeBeat({ id: "beat-2" }));
      const { result } = renderHook(() => useBatchGenerator(props));

      let batchResult: Awaited<ReturnType<typeof result.current.batchGenerateFramePairs>>;
      await act(async () => {
        batchResult = await result.current.batchGenerateFramePairs();
      });

      expect(batchResult!).toEqual({ success: 1, failed: 0, skipped: 1 });
      expect(props.generateFramePair).not.toHaveBeenCalledWith("beat-1", expect.anything());
    });

    it("chain 模式下应传递有 lastFrame 的前一个 beat", async () => {
      const props = createDefaultProps();
      const beatWithLastFrame = makeBeat({
        id: "beat-1",
        keyframe: { imageUrl: "https://img.png" },
        framePair: { lastFrame: { imageUrl: "https://last.png" } },
      } as Partial<StoryBeat>);
      const beatWithKf = makeBeat({ id: "beat-2", keyframe: { imageUrl: "https://img2.png" } } as Partial<StoryBeat>);
      props.beatsRef.current = [beatWithLastFrame, beatWithKf];
      const beat1Result = makeBeat({
        id: "beat-1",
        keyframe: { imageUrl: "https://img.png" },
        framePair: { lastFrame: { imageUrl: "https://last.png" } },
      } as Partial<StoryBeat>);
      props.generateFramePair.mockResolvedValueOnce(beat1Result);
      props.generateFramePair.mockResolvedValueOnce(makeBeat({ id: "beat-2" }));
      const { result } = renderHook(() => useBatchGenerator(props));

      await act(async () => {
        await result.current.batchGenerateFramePairs();
      });

      expect(props.generateFramePair).toHaveBeenCalledWith("beat-1", null);
      expect(props.generateFramePair).toHaveBeenCalledWith("beat-2", beat1Result);
    });

    it("单个 beat 失败不应阻止后续 beat", async () => {
      const props = createDefaultProps();
      const beatWithKf1 = makeBeat({ id: "beat-1", keyframe: { imageUrl: "https://img.png" } } as Partial<StoryBeat>);
      const beatWithKf2 = makeBeat({ id: "beat-2", keyframe: { imageUrl: "https://img2.png" } } as Partial<StoryBeat>);
      props.beatsRef.current = [beatWithKf1, beatWithKf2];
      props.generateFramePair.mockRejectedValueOnce(new Error("fail"));
      props.generateFramePair.mockResolvedValueOnce(makeBeat({ id: "beat-2" }));
      const { result } = renderHook(() => useBatchGenerator(props));

      let batchResult: Awaited<ReturnType<typeof result.current.batchGenerateFramePairs>>;
      await act(async () => {
        batchResult = await result.current.batchGenerateFramePairs();
      });

      expect(batchResult!).toEqual({ success: 1, failed: 1, skipped: 0 });
      expect(errorLogger.warn).toHaveBeenCalledTimes(1);
    });

    it("全部成功且无跳过时应显示成功消息", async () => {
      const props = createDefaultProps();
      const beatWithKf = makeBeat({ id: "beat-1", keyframe: { imageUrl: "https://img.png" } } as Partial<StoryBeat>);
      props.beatsRef.current = [beatWithKf];
      props.generateFramePair.mockResolvedValueOnce(makeBeat({ id: "beat-1" }));
      const { result } = renderHook(() => useBatchGenerator(props));

      await act(async () => {
        await result.current.batchGenerateFramePairs();
      });

      expect(props.success).toHaveBeenCalledWith("批量生成完成", "成功为 1 个分镜生成首尾帧");
    });

    it("用户取消确认时应返回零结果", async () => {
      (confirm as ReturnType<typeof vi.fn>).mockResolvedValue(false);
      const props = createDefaultProps();
      const beatWithKf = makeBeat({ id: "beat-1", keyframe: { imageUrl: "https://img.png" } } as Partial<StoryBeat>);
      props.beatsRef.current = [beatWithKf];
      const { result } = renderHook(() => useBatchGenerator(props));

      let batchResult: Awaited<ReturnType<typeof result.current.batchGenerateFramePairs>>;
      await act(async () => {
        batchResult = await result.current.batchGenerateFramePairs();
      });

      expect(batchResult!).toEqual({ success: 0, failed: 0, skipped: 0 });
      expect(props.generateFramePair).not.toHaveBeenCalled();
    });

    it("generateFramePair 返回 void 时应计为失败", async () => {
      const props = createDefaultProps();
      const beatWithKf = makeBeat({ id: "beat-1", keyframe: { imageUrl: "https://img.png" } } as Partial<StoryBeat>);
      props.beatsRef.current = [beatWithKf];
      props.generateFramePair.mockResolvedValueOnce(undefined);
      const { result } = renderHook(() => useBatchGenerator(props));

      let batchResult: Awaited<ReturnType<typeof result.current.batchGenerateFramePairs>>;
      await act(async () => {
        batchResult = await result.current.batchGenerateFramePairs();
      });

      expect(batchResult!).toEqual({ success: 0, failed: 1, skipped: 0 });
    });

    it("skip_completed 下所有 beat 已完成时应显示提示", async () => {
      const props = createDefaultProps();
      const completedBeat = makeBeat({
        id: "beat-1",
        keyframe: { imageUrl: "https://img.png" },
        framePair: { lastFrame: { imageUrl: "https://last.png" } },
      } as Partial<StoryBeat>);
      props.beatsRef.current = [completedBeat];
      const { result } = renderHook(() => useBatchGenerator(props));

      await act(async () => {
        await result.current.batchGenerateFramePairs(undefined, { strategy: "skip_completed" });
      });

      expect(props.showError).toHaveBeenCalledWith("无可生成分镜", "所有分镜已完成");
    });
  });

  describe("batchGenerateVideos", () => {
    it("应只处理有 firstFrame 的 beat", async () => {
      const props = createDefaultProps();
      const beatWithFp = makeBeat({
        id: "beat-1",
        framePair: { firstFrame: { imageUrl: "https://first.png" } },
      } as Partial<StoryBeat>);
      props.beatsRef.current = [beatWithFp, beat2, beat3];
      const { result } = renderHook(() => useBatchGenerator(props));

      await act(async () => {
        await result.current.batchGenerateVideos();
      });

      expect(props.generateVideoNew).toHaveBeenCalledTimes(1);
      expect(props.generateVideoNew).toHaveBeenCalledWith("beat-1", null);
    });

    it("有 uploadedFramePair.firstFrame 的 beat 也应被处理", async () => {
      const props = createDefaultProps();
      const uploadedBeat = makeBeat({
        id: "beat-1",
        uploadedFramePair: { firstFrame: "a.png", lastFrame: "b.png" },
      });
      props.beatsRef.current = [uploadedBeat, beat2];
      const { result } = renderHook(() => useBatchGenerator(props));

      await act(async () => {
        await result.current.batchGenerateVideos();
      });

      expect(props.generateVideoNew).toHaveBeenCalledTimes(1);
    });

    it("无 firstFrame 的 beat 时应显示提示", async () => {
      const props = createDefaultProps();
      props.beatsRef.current = [beat1, beat2, beat3];
      const { result } = renderHook(() => useBatchGenerator(props));

      await act(async () => {
        await result.current.batchGenerateVideos();
      });

      expect(props.showError).toHaveBeenCalledWith("无可生成分镜", "请先生成首尾帧");
      expect(props.generateVideoNew).not.toHaveBeenCalled();
    });

    it("skip_completed 应跳过已有 video 的 beat", async () => {
      const props = createDefaultProps();
      const beatWithVideo = makeBeat({
        id: "beat-1",
        framePair: { firstFrame: { imageUrl: "https://first.png" } },
        videoGen: { videoUrl: "https://video.mp4" },
      } as Partial<StoryBeat>);
      const beatWithFp = makeBeat({
        id: "beat-2",
        framePair: { firstFrame: { imageUrl: "https://first2.png" } },
      } as Partial<StoryBeat>);
      props.beatsRef.current = [beatWithVideo, beatWithFp];
      const { result } = renderHook(() => useBatchGenerator(props));

      await act(async () => {
        await result.current.batchGenerateVideos(undefined, { strategy: "skip_completed" });
      });

      expect(props.generateVideoNew).toHaveBeenCalledTimes(1);
      expect(props.generateVideoNew).toHaveBeenCalledWith("beat-2", null);
    });

    it("skip_completed 下有 uploadedVideo 的 beat 也应被跳过", async () => {
      const props = createDefaultProps();
      const uploadedBeat = makeBeat({
        id: "beat-1",
        framePair: { firstFrame: { imageUrl: "https://first.png" } },
        uploadedVideo: "https://upload.mp4",
      } as Partial<StoryBeat>);
      const beatWithFp = makeBeat({
        id: "beat-2",
        framePair: { firstFrame: { imageUrl: "https://first2.png" } },
      } as Partial<StoryBeat>);
      props.beatsRef.current = [uploadedBeat, beatWithFp];
      const { result } = renderHook(() => useBatchGenerator(props));

      await act(async () => {
        await result.current.batchGenerateVideos(undefined, { strategy: "skip_completed" });
      });

      expect(props.generateVideoNew).toHaveBeenCalledTimes(1);
    });

    it("已上传 video 的 beat 应被跳过", async () => {
      const props = createDefaultProps();
      const uploadedBeat = makeBeat({
        id: "beat-1",
        framePair: { firstFrame: { imageUrl: "https://first.png" } },
        uploadedVideo: "https://upload.mp4",
      } as Partial<StoryBeat>);
      const beatWithFp = makeBeat({
        id: "beat-2",
        framePair: { firstFrame: { imageUrl: "https://first2.png" } },
      } as Partial<StoryBeat>);
      props.beatsRef.current = [uploadedBeat, beatWithFp];
      const { result } = renderHook(() => useBatchGenerator(props));

      let batchResult: Awaited<ReturnType<typeof result.current.batchGenerateVideos>>;
      await act(async () => {
        batchResult = await result.current.batchGenerateVideos();
      });

      expect(batchResult!).toEqual({ success: 1, failed: 0, skipped: 1 });
      expect(props.generateVideoNew).not.toHaveBeenCalledWith("beat-1", expect.anything());
    });

    it("chain 模式下应传递有 videoUrl 的前一个 beat", async () => {
      const props = createDefaultProps();
      const beatWithVideo = makeBeat({
        id: "beat-1",
        framePair: { firstFrame: { imageUrl: "https://first.png" } },
        videoGen: { videoUrl: "https://video.mp4" },
      } as Partial<StoryBeat>);
      const beatWithFp = makeBeat({
        id: "beat-2",
        framePair: { firstFrame: { imageUrl: "https://first2.png" } },
      } as Partial<StoryBeat>);
      props.beatsRef.current = [beatWithVideo, beatWithFp];
      const { result } = renderHook(() => useBatchGenerator(props));

      await act(async () => {
        await result.current.batchGenerateVideos();
      });

      expect(props.generateVideoNew).toHaveBeenCalledWith("beat-1", null);
      expect(props.generateVideoNew).toHaveBeenCalledWith("beat-2", beatWithVideo);
    });

    it("单个 beat 失败且 skipOnError=true/continueOnFallback=true 时应继续", async () => {
      const props = createDefaultProps();
      const beatWithFp1 = makeBeat({
        id: "beat-1",
        framePair: { firstFrame: { imageUrl: "https://first.png" } },
      } as Partial<StoryBeat>);
      const beatWithFp2 = makeBeat({
        id: "beat-2",
        framePair: { firstFrame: { imageUrl: "https://first2.png" } },
      } as Partial<StoryBeat>);
      props.beatsRef.current = [beatWithFp1, beatWithFp2];
      props.generateVideoNew.mockRejectedValueOnce(new Error("fail"));
      const { result } = renderHook(() => useBatchGenerator(props));

      let batchResult: Awaited<ReturnType<typeof result.current.batchGenerateVideos>>;
      await act(async () => {
        batchResult = await result.current.batchGenerateVideos();
      });

      expect(batchResult!).toEqual({ success: 1, failed: 1, skipped: 0 });
      expect(props.generateVideoNew).toHaveBeenCalledTimes(2);
      expect(errorLogger.warn).toHaveBeenCalledTimes(1);
    });

    it("失败且 skipOnError=false 或 continueOnFallback=false 时应停止", async () => {
      const props = createDefaultProps();
      const beatWithFp1 = makeBeat({
        id: "beat-1",
        framePair: { firstFrame: { imageUrl: "https://first.png" } },
      } as Partial<StoryBeat>);
      const beatWithFp2 = makeBeat({
        id: "beat-2",
        framePair: { firstFrame: { imageUrl: "https://first2.png" } },
      } as Partial<StoryBeat>);
      props.beatsRef.current = [beatWithFp1, beatWithFp2];
      props.generateVideoNew.mockRejectedValueOnce(new Error("fail"));
      const { result } = renderHook(() => useBatchGenerator(props));

      let batchResult: Awaited<ReturnType<typeof result.current.batchGenerateVideos>>;
      await act(async () => {
        batchResult = await result.current.batchGenerateVideos(undefined, { skipOnError: false, continueOnFallback: false });
      });

      expect(batchResult!).toEqual({ success: 0, failed: 1, skipped: 0 });
      expect(props.generateVideoNew).toHaveBeenCalledTimes(1);
    });

    it("全部成功且无跳过时应显示成功消息", async () => {
      const props = createDefaultProps();
      const beatWithFp = makeBeat({
        id: "beat-1",
        framePair: { firstFrame: { imageUrl: "https://first.png" } },
      } as Partial<StoryBeat>);
      props.beatsRef.current = [beatWithFp];
      const { result } = renderHook(() => useBatchGenerator(props));

      await act(async () => {
        await result.current.batchGenerateVideos();
      });

      expect(props.success).toHaveBeenCalledWith("批量提交完成", "成功为 1 个分镜提交视频生成任务");
    });

    it("有失败或跳过时应显示汇总消息", async () => {
      const props = createDefaultProps();
      const uploadedBeat = makeBeat({
        id: "beat-1",
        framePair: { firstFrame: { imageUrl: "https://first.png" } },
        uploadedVideo: "https://upload.mp4",
      } as Partial<StoryBeat>);
      const beatWithFp = makeBeat({
        id: "beat-2",
        framePair: { firstFrame: { imageUrl: "https://first2.png" } },
      } as Partial<StoryBeat>);
      props.beatsRef.current = [uploadedBeat, beatWithFp];
      props.generateVideoNew.mockRejectedValueOnce(new Error("fail"));
      const { result } = renderHook(() => useBatchGenerator(props));

      await act(async () => {
        await result.current.batchGenerateVideos();
      });

      expect(props.success).toHaveBeenCalledWith(
        "批量提交完成",
        expect.stringContaining("失败 1 个"),
      );
    });

    it("用户取消确认时应返回零结果", async () => {
      (confirm as ReturnType<typeof vi.fn>).mockResolvedValue(false);
      const props = createDefaultProps();
      const beatWithFp = makeBeat({
        id: "beat-1",
        framePair: { firstFrame: { imageUrl: "https://first.png" } },
      } as Partial<StoryBeat>);
      props.beatsRef.current = [beatWithFp];
      const { result } = renderHook(() => useBatchGenerator(props));

      let batchResult: Awaited<ReturnType<typeof result.current.batchGenerateVideos>>;
      await act(async () => {
        batchResult = await result.current.batchGenerateVideos();
      });

      expect(batchResult!).toEqual({ success: 0, failed: 0, skipped: 0 });
      expect(props.generateVideoNew).not.toHaveBeenCalled();
    });

    it("isolated 模式确认消息应包含隔离提示", async () => {
      const props = createDefaultProps();
      const beatWithFp = makeBeat({
        id: "beat-1",
        framePair: { firstFrame: { imageUrl: "https://first.png" } },
      } as Partial<StoryBeat>);
      props.beatsRef.current = [beatWithFp];
      const { result } = renderHook(() => useBatchGenerator(props));

      await act(async () => {
        await result.current.batchGenerateVideos(undefined, { chainMode: "isolated" });
      });

      expect(confirm).toHaveBeenCalledWith(
        expect.stringContaining("隔离模式"),
        "批量生成视频",
      );
    });

    it("auto 模式确认消息应包含串行引用提示", async () => {
      const props = createDefaultProps();
      const beatWithFp = makeBeat({
        id: "beat-1",
        framePair: { firstFrame: { imageUrl: "https://first.png" } },
      } as Partial<StoryBeat>);
      props.beatsRef.current = [beatWithFp];
      const { result } = renderHook(() => useBatchGenerator(props));

      await act(async () => {
        await result.current.batchGenerateVideos(undefined, { chainMode: "auto" });
      });

      expect(confirm).toHaveBeenCalledWith(
        expect.stringContaining("串行提交"),
        "批量生成视频",
      );
    });

    it("skip_completed 下所有 beat 已完成时应显示提示", async () => {
      const props = createDefaultProps();
      const completedBeat = makeBeat({
        id: "beat-1",
        framePair: { firstFrame: { imageUrl: "https://first.png" } },
        videoGen: { videoUrl: "https://video.mp4" },
      } as Partial<StoryBeat>);
      props.beatsRef.current = [completedBeat];
      const { result } = renderHook(() => useBatchGenerator(props));

      await act(async () => {
        await result.current.batchGenerateVideos(undefined, { strategy: "skip_completed" });
      });

      expect(props.showError).toHaveBeenCalledWith("无可生成分镜", "所有分镜已完成");
    });

    it("generateVideoNew 成功后应增加 successCount", async () => {
      const props = createDefaultProps();
      const beatWithFp = makeBeat({
        id: "beat-1",
        framePair: { firstFrame: { imageUrl: "https://first.png" } },
      } as Partial<StoryBeat>);
      props.beatsRef.current = [beatWithFp];
      props.generateVideoNew.mockResolvedValueOnce(undefined);
      const { result } = renderHook(() => useBatchGenerator(props));

      let batchResult: Awaited<ReturnType<typeof result.current.batchGenerateVideos>>;
      await act(async () => {
        batchResult = await result.current.batchGenerateVideos();
      });

      expect(batchResult!).toEqual({ success: 1, failed: 0, skipped: 0 });
    });
  });

  describe("chain strategy integration", () => {
    it("前一个 beat 生成结果应作为下一个 beat 的 chain 参考", async () => {
      const props = createDefaultProps();
      const beat1WithKf = makeBeat({ id: "beat-1" });
      const beat2NoKf = makeBeat({ id: "beat-2" });
      props.beatsRef.current = [beat1WithKf, beat2NoKf];

      const beat1Result = makeBeat({ id: "beat-1", keyframe: { imageUrl: "generated.png" } } as Partial<StoryBeat>);
      props.generateKeyframe.mockResolvedValueOnce(beat1Result);
      props.generateKeyframe.mockResolvedValueOnce(makeBeat({ id: "beat-2" }));

      const { result } = renderHook(() => useBatchGenerator(props));

      await act(async () => {
        await result.current.batchGenerateKeyframes();
      });

      expect(props.generateKeyframe).toHaveBeenNthCalledWith(1, "beat-1", null);
      expect(props.generateKeyframe).toHaveBeenNthCalledWith(2, "beat-2", beat1Result);
    });

    it("video 级别应查找有 uploadedVideo 的前序 beat", async () => {
      const props = createDefaultProps();
      const beatWithUploaded = makeBeat({
        id: "beat-1",
        framePair: { firstFrame: { imageUrl: "https://first.png" } },
        uploadedVideo: "https://upload.mp4",
      } as Partial<StoryBeat>);
      const beatWithFp = makeBeat({
        id: "beat-2",
        framePair: { firstFrame: { imageUrl: "https://first2.png" } },
      } as Partial<StoryBeat>);
      props.beatsRef.current = [beatWithUploaded, beatWithFp];
      const { result } = renderHook(() => useBatchGenerator(props));

      await act(async () => {
        await result.current.batchGenerateVideos();
      });

      expect(props.generateVideoNew).toHaveBeenCalledWith("beat-2", beatWithUploaded);
    });
  });

  describe("error logging", () => {
    it("keyframe 失败时应调用 errorLogger.warn", async () => {
      const props = createDefaultProps();
      const error = new Error("keyframe generation failed");
      props.generateKeyframe.mockRejectedValueOnce(error);
      props.generateKeyframe.mockResolvedValueOnce(makeBeat({ id: "beat-2" }));
      props.generateKeyframe.mockResolvedValueOnce(makeBeat({ id: "beat-3" }));
      const { result } = renderHook(() => useBatchGenerator(props));

      await act(async () => {
        await result.current.batchGenerateKeyframes();
      });

      expect(errorLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("beat-1"),
        error,
      );
    });

    it("framePair 失败时应调用 errorLogger.warn", async () => {
      const props = createDefaultProps();
      const beatWithKf = makeBeat({ id: "beat-1", keyframe: { imageUrl: "https://img.png" } } as Partial<StoryBeat>);
      const beatWithKf2 = makeBeat({ id: "beat-2", keyframe: { imageUrl: "https://img2.png" } } as Partial<StoryBeat>);
      props.beatsRef.current = [beatWithKf, beatWithKf2];
      const error = new Error("framepair generation failed");
      props.generateFramePair.mockRejectedValueOnce(error);
      props.generateFramePair.mockResolvedValueOnce(makeBeat({ id: "beat-2" }));
      const { result } = renderHook(() => useBatchGenerator(props));

      await act(async () => {
        await result.current.batchGenerateFramePairs();
      });

      expect(errorLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("beat-1"),
        error,
      );
    });

    it("video 失败时应调用 errorLogger.warn", async () => {
      const props = createDefaultProps();
      const beatWithFp = makeBeat({
        id: "beat-1",
        framePair: { firstFrame: { imageUrl: "https://first.png" } },
      } as Partial<StoryBeat>);
      const beatWithFp2 = makeBeat({
        id: "beat-2",
        framePair: { firstFrame: { imageUrl: "https://first2.png" } },
      } as Partial<StoryBeat>);
      props.beatsRef.current = [beatWithFp, beatWithFp2];
      const error = new Error("video generation failed");
      props.generateVideoNew.mockRejectedValueOnce(error);
      const { result } = renderHook(() => useBatchGenerator(props));

      await act(async () => {
        await result.current.batchGenerateVideos();
      });

      expect(errorLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("beat-1"),
        error,
      );
    });
  });
});
