/**
 * use-video-compose hook 单元测试
 *
 * 覆盖：
 * - addSegment 去重（同 id 不重复添加）
 * - addLocalFiles 去重
 * - moveSegment/reorderSegments 边界（无效 index 不变）
 * - compose 在 segments<2 时设置 error
 * - loadAvailable 首次触发 ffmpeg 检查（availableCheckedRef 只检查一次）
 * - clearSegments 同步清空 composeResult
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { VideoSegment } from "../services/video-composer";

const {
  mockListCompletedVideoTasks,
  mockComposeVideoSegments,
  mockCheckComposerAvailable,
  mockPickLocalVideoFiles,
  mockErrorLogger,
} = vi.hoisted(() => ({
  mockListCompletedVideoTasks: vi.fn(),
  mockComposeVideoSegments: vi.fn(),
  mockCheckComposerAvailable: vi.fn(),
  mockPickLocalVideoFiles: vi.fn(),
  mockErrorLogger: { error: vi.fn(), warn: vi.fn() },
}));

vi.mock("../services/video-composer", () => ({
  listCompletedVideoTasks: mockListCompletedVideoTasks,
  composeVideoSegments: mockComposeVideoSegments,
  checkComposerAvailable: mockCheckComposerAvailable,
  pickLocalVideoFiles: mockPickLocalVideoFiles,
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: mockErrorLogger,
}));

vi.mock("@/shared/constants", () => ({
  t: vi.fn((key: string, params?: Record<string, string | number>) => {
    if (!params) return key;
    let text = key;
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(`{${k}}`, String(v));
    }
    return text;
  }),
}));

import { useVideoCompose } from "../hooks/use-video-compose";

function buildSegment(overrides: Partial<VideoSegment> = {}): VideoSegment {
  return {
    id: "s1",
    label: "片段1",
    path: "/p/1.mp4",
    source: "task",
    ...overrides,
  };
}

describe("useVideoCompose", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListCompletedVideoTasks.mockResolvedValue([]);
    mockCheckComposerAvailable.mockResolvedValue({ available: true });
    mockComposeVideoSegments.mockResolvedValue({ success: true, outputPath: "/out.mp4" });
    mockPickLocalVideoFiles.mockResolvedValue([]);
  });

  // === 默认值 ===
  describe("默认值", () => {
    it("初始 transition = 'fade'", () => {
      const { result } = renderHook(() => useVideoCompose());
      expect(result.current.transition).toBe("fade");
    });

    it("初始 transitionDuration = 0.5", () => {
      const { result } = renderHook(() => useVideoCompose());
      expect(result.current.transitionDuration).toBe(0.5);
    });

    it("初始 ffmpegAvailable = true", () => {
      const { result } = renderHook(() => useVideoCompose());
      expect(result.current.ffmpegAvailable).toBe(true);
    });

    it("setTransition / setTransitionDuration 正常工作", () => {
      const { result } = renderHook(() => useVideoCompose());

      act(() => {
        result.current.setTransition("dissolve");
        result.current.setTransitionDuration(1.0);
      });

      expect(result.current.transition).toBe("dissolve");
      expect(result.current.transitionDuration).toBe(1.0);
    });
  });

  // === addSegment 去重 ===
  describe("addSegment 去重", () => {
    it("同 id 片段不重复添加", () => {
      const { result } = renderHook(() => useVideoCompose());

      act(() => {
        result.current.addSegment(buildSegment({ id: "s1" }));
      });
      act(() => {
        result.current.addSegment(buildSegment({ id: "s1", label: "新标签" }));
      });

      expect(result.current.segments).toHaveLength(1);
      expect(result.current.segments[0]!.label).toBe("片段1");
    });

    it("不同 id 片段正常追加", () => {
      const { result } = renderHook(() => useVideoCompose());

      act(() => {
        result.current.addSegment(buildSegment({ id: "s1" }));
      });
      act(() => {
        result.current.addSegment(buildSegment({ id: "s2", label: "片段2" }));
      });

      expect(result.current.segments).toHaveLength(2);
    });
  });

  // === addLocalFiles 去重 ===
  describe("addLocalFiles 去重", () => {
    it("同路径文件不重复添加", async () => {
      mockPickLocalVideoFiles.mockResolvedValue(["/p/a.mp4"]);
      const { result } = renderHook(() => useVideoCompose());

      await act(async () => {
        await result.current.addLocalFiles();
      });
      await act(async () => {
        await result.current.addLocalFiles();
      });

      expect(result.current.segments).toHaveLength(1);
      expect(result.current.segments[0]!.id).toBe("file-/p/a.mp4");
    });

    it("不同路径文件正常追加", async () => {
      mockPickLocalVideoFiles
        .mockResolvedValueOnce(["/p/a.mp4"])
        .mockResolvedValueOnce(["/p/b.mp4"]);
      const { result } = renderHook(() => useVideoCompose());

      await act(async () => {
        await result.current.addLocalFiles();
      });
      await act(async () => {
        await result.current.addLocalFiles();
      });

      expect(result.current.segments).toHaveLength(2);
    });

    it("用户取消（返回空数组）时不添加", async () => {
      mockPickLocalVideoFiles.mockResolvedValue([]);
      const { result } = renderHook(() => useVideoCompose());

      await act(async () => {
        await result.current.addLocalFiles();
      });

      expect(result.current.segments).toHaveLength(0);
    });

    it("pickLocalVideoFiles 抛错时设置 error", async () => {
      mockPickLocalVideoFiles.mockRejectedValue(new Error("IPC 不可用"));
      const { result } = renderHook(() => useVideoCompose());

      await act(async () => {
        await result.current.addLocalFiles();
      });

      expect(result.current.error).toBe("IPC 不可用");
      expect(mockErrorLogger.warn).toHaveBeenCalled();
    });

    it("Windows 路径分隔符正确提取文件名", async () => {
      mockPickLocalVideoFiles.mockResolvedValue(["C:\\Users\\test\\video.mp4"]);
      const { result } = renderHook(() => useVideoCompose());

      await act(async () => {
        await result.current.addLocalFiles();
      });

      expect(result.current.segments[0]!.label).toBe("video.mp4");
    });
  });

  // === moveSegment 边界 ===
  describe("moveSegment 边界", () => {
    it("from 越界时不变", () => {
      const { result } = renderHook(() => useVideoCompose());

      act(() => {
        result.current.addSegment(buildSegment({ id: "s1" }));
        result.current.addSegment(buildSegment({ id: "s2" }));
      });

      const before = [...result.current.segments];
      act(() => {
        result.current.moveSegment(5, 0);
      });

      expect(result.current.segments).toEqual(before);
    });

    it("to 越界时不变", () => {
      const { result } = renderHook(() => useVideoCompose());

      act(() => {
        result.current.addSegment(buildSegment({ id: "s1" }));
        result.current.addSegment(buildSegment({ id: "s2" }));
      });

      const before = [...result.current.segments];
      act(() => {
        result.current.moveSegment(0, 5);
      });

      expect(result.current.segments).toEqual(before);
    });

    it("负 index 时不变", () => {
      const { result } = renderHook(() => useVideoCompose());

      act(() => {
        result.current.addSegment(buildSegment({ id: "s1" }));
      });

      const before = [...result.current.segments];
      act(() => {
        result.current.moveSegment(-1, 0);
      });

      expect(result.current.segments).toEqual(before);
    });

    it("有效 index 时正确移动", () => {
      const { result } = renderHook(() => useVideoCompose());

      act(() => {
        result.current.addSegment(buildSegment({ id: "s1" }));
        result.current.addSegment(buildSegment({ id: "s2" }));
        result.current.addSegment(buildSegment({ id: "s3" }));
      });

      act(() => {
        result.current.moveSegment(0, 2);
      });

      expect(result.current.segments.map((s) => s.id)).toEqual(["s2", "s3", "s1"]);
    });
  });

  // === reorderSegments 边界 ===
  describe("reorderSegments 边界", () => {
    it("fromId 不存在时不变", () => {
      const { result } = renderHook(() => useVideoCompose());

      act(() => {
        result.current.addSegment(buildSegment({ id: "s1" }));
      });

      const before = [...result.current.segments];
      act(() => {
        result.current.reorderSegments("unknown", "s1");
      });

      expect(result.current.segments).toEqual(before);
    });

    it("toId 不存在时不变", () => {
      const { result } = renderHook(() => useVideoCompose());

      act(() => {
        result.current.addSegment(buildSegment({ id: "s1" }));
      });

      const before = [...result.current.segments];
      act(() => {
        result.current.reorderSegments("s1", "unknown");
      });

      expect(result.current.segments).toEqual(before);
    });

    it("fromId === toId 时不变", () => {
      const { result } = renderHook(() => useVideoCompose());

      act(() => {
        result.current.addSegment(buildSegment({ id: "s1" }));
        result.current.addSegment(buildSegment({ id: "s2" }));
      });

      const before = [...result.current.segments];
      act(() => {
        result.current.reorderSegments("s1", "s1");
      });

      expect(result.current.segments).toEqual(before);
    });

    it("有效 id 时正确重排", () => {
      const { result } = renderHook(() => useVideoCompose());

      act(() => {
        result.current.addSegment(buildSegment({ id: "s1" }));
        result.current.addSegment(buildSegment({ id: "s2" }));
        result.current.addSegment(buildSegment({ id: "s3" }));
      });

      act(() => {
        result.current.reorderSegments("s1", "s3");
      });

      expect(result.current.segments.map((s) => s.id)).toEqual(["s2", "s3", "s1"]);
    });
  });

  // === compose 在 segments<2 时设置 error ===
  describe("compose", () => {
    it("segments<2 时设置 error 且不调用 composeVideoSegments", async () => {
      const { result } = renderHook(() => useVideoCompose());

      await act(async () => {
        await result.current.compose();
      });

      expect(result.current.error).toBe("compose.needTwoSegmentsShort");
      expect(result.current.isComposing).toBe(false);
      expect(mockComposeVideoSegments).not.toHaveBeenCalled();
    });

    it("segments>=2 时调用 composeVideoSegments 并设置 composeResult", async () => {
      mockComposeVideoSegments.mockResolvedValue({
        success: true,
        outputPath: "/out.mp4",
        metadata: { videoCount: 2 },
      });
      const { result } = renderHook(() => useVideoCompose());

      act(() => {
        result.current.addSegment(buildSegment({ id: "s1", path: "/p/1.mp4" }));
        result.current.addSegment(buildSegment({ id: "s2", path: "/p/2.mp4" }));
      });

      await act(async () => {
        await result.current.compose();
      });

      expect(mockComposeVideoSegments).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: "s1" }),
          expect.objectContaining({ id: "s2" }),
        ]),
        "fade",
        0.5,
      );
      expect(result.current.composeResult).toEqual({
        success: true,
        outputPath: "/out.mp4",
        metadata: { videoCount: 2 },
      });
      expect(result.current.isComposing).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it("合成失败时设置 error", async () => {
      mockComposeVideoSegments.mockResolvedValue({
        success: false,
        error: "ffmpeg 错误",
      });
      const { result } = renderHook(() => useVideoCompose());

      act(() => {
        result.current.addSegment(buildSegment({ id: "s1" }));
        result.current.addSegment(buildSegment({ id: "s2" }));
      });

      await act(async () => {
        await result.current.compose();
      });

      expect(result.current.error).toBe("ffmpeg 错误");
      expect(result.current.composeResult?.success).toBe(false);
    });

    it("composeVideoSegments 抛错时设置 error 和 composeResult", async () => {
      mockComposeVideoSegments.mockRejectedValue(new Error("网络错误"));
      const { result } = renderHook(() => useVideoCompose());

      act(() => {
        result.current.addSegment(buildSegment({ id: "s1" }));
        result.current.addSegment(buildSegment({ id: "s2" }));
      });

      await act(async () => {
        await result.current.compose();
      });

      expect(result.current.error).toBe("网络错误");
      expect(result.current.composeResult).toEqual({ success: false, error: "网络错误" });
      expect(result.current.isComposing).toBe(false);
      expect(mockErrorLogger.warn).toHaveBeenCalled();
    });
  });

  // === loadAvailable 首次触发 ffmpeg 检查 ===
  describe("loadAvailable", () => {
    it("首次加载调用 checkComposerAvailable", async () => {
      mockListCompletedVideoTasks.mockResolvedValue([
        buildSegment({ id: "t1", label: "任务" }),
      ]);
      mockCheckComposerAvailable.mockResolvedValue({ available: true });

      const { result } = renderHook(() => useVideoCompose());

      await act(async () => {
        await result.current.loadAvailable();
      });

      expect(mockListCompletedVideoTasks).toHaveBeenCalledWith(undefined);
      expect(mockCheckComposerAvailable).toHaveBeenCalledTimes(1);
      expect(result.current.availableSegments).toHaveLength(1);
      expect(result.current.ffmpegAvailable).toBe(true);
      expect(result.current.isLoadingAvailable).toBe(false);
    });

    it("第二次加载不再调用 checkComposerAvailable", async () => {
      mockCheckComposerAvailable.mockResolvedValue({ available: true });
      const { result } = renderHook(() => useVideoCompose());

      await act(async () => {
        await result.current.loadAvailable();
      });
      await act(async () => {
        await result.current.loadAvailable();
      });

      expect(mockCheckComposerAvailable).toHaveBeenCalledTimes(1);
    });

    it("ffmpeg 不可用时设置 error", async () => {
      mockCheckComposerAvailable.mockResolvedValue({ available: false });

      const { result } = renderHook(() => useVideoCompose());

      await act(async () => {
        await result.current.loadAvailable();
      });

      expect(result.current.ffmpegAvailable).toBe(false);
      expect(result.current.error).toBe("compose.ffmpegNotAvailable");
    });

    it("透传 storyId 给 listCompletedVideoTasks", async () => {
      const { result } = renderHook(() => useVideoCompose());

      await act(async () => {
        await result.current.loadAvailable("story-1");
      });

      expect(mockListCompletedVideoTasks).toHaveBeenCalledWith("story-1");
    });

    it("listCompletedVideoTasks 抛错时设置 error", async () => {
      mockListCompletedVideoTasks.mockRejectedValue(new Error("存储错误"));

      const { result } = renderHook(() => useVideoCompose());

      await act(async () => {
        await result.current.loadAvailable();
      });

      expect(result.current.error).toBe("存储错误");
      expect(result.current.isLoadingAvailable).toBe(false);
      expect(mockErrorLogger.warn).toHaveBeenCalled();
    });
  });

  // === clearSegments 同步清空 composeResult ===
  describe("clearSegments", () => {
    it("清空 segments", () => {
      const { result } = renderHook(() => useVideoCompose());

      act(() => {
        result.current.addSegment(buildSegment({ id: "s1" }));
      });

      act(() => {
        result.current.clearSegments();
      });

      expect(result.current.segments).toHaveLength(0);
      expect(result.current.composeResult).toBeNull();
    });

    it("已设置 composeResult 时同步清空", async () => {
      mockComposeVideoSegments.mockResolvedValue({
        success: true,
        outputPath: "/out.mp4",
      });
      const { result } = renderHook(() => useVideoCompose());

      act(() => {
        result.current.addSegment(buildSegment({ id: "s1" }));
        result.current.addSegment(buildSegment({ id: "s2" }));
      });
      await act(async () => {
        await result.current.compose();
      });

      expect(result.current.composeResult).not.toBeNull();

      act(() => {
        result.current.clearSegments();
      });

      expect(result.current.segments).toHaveLength(0);
      expect(result.current.composeResult).toBeNull();
    });
  });

  // === removeSegment ===
  describe("removeSegment", () => {
    it("按 id 移除片段", () => {
      const { result } = renderHook(() => useVideoCompose());

      act(() => {
        result.current.addSegment(buildSegment({ id: "s1" }));
        result.current.addSegment(buildSegment({ id: "s2" }));
      });

      act(() => {
        result.current.removeSegment("s1");
      });

      expect(result.current.segments).toHaveLength(1);
      expect(result.current.segments[0]!.id).toBe("s2");
    });

    it("未知 id 不影响片段列表", () => {
      const { result } = renderHook(() => useVideoCompose());

      act(() => {
        result.current.addSegment(buildSegment({ id: "s1" }));
      });

      act(() => {
        result.current.removeSegment("unknown");
      });

      expect(result.current.segments).toHaveLength(1);
    });
  });

  // === clearResult ===
  describe("clearResult", () => {
    it("清空 composeResult 和 error", async () => {
      mockComposeVideoSegments.mockResolvedValue({
        success: true,
        outputPath: "/out.mp4",
      });
      const { result } = renderHook(() => useVideoCompose());

      act(() => {
        result.current.addSegment(buildSegment({ id: "s1" }));
        result.current.addSegment(buildSegment({ id: "s2" }));
      });
      await act(async () => {
        await result.current.compose();
      });

      act(() => {
        result.current.clearResult();
      });

      expect(result.current.composeResult).toBeNull();
      expect(result.current.error).toBeNull();
    });
  });
});
