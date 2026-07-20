/**
 * video-composer 服务单元测试
 *
 * 覆盖：
 * - listCompletedVideoTasks: status=completed 过滤、storyId 过滤、localVideoPath 缺失跳过、label 国际化
 * - composeVideoSegments: segments<2 错误、参数透传、结果映射
 * - checkComposerAvailable: 透传
 * - pickLocalVideoFiles: 两种返回格式兼容、API 缺失抛错
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { VideoTask } from "@/domain/schemas";
import {
  listCompletedVideoTasks,
  composeVideoSegments,
  checkComposerAvailable,
  pickLocalVideoFiles,
  type VideoSegment,
} from "../services/video-composer";

const { mockVideoTaskStorage, mockMergeVideos, mockCheckFfmpegAvailable } = vi.hoisted(() => ({
  mockVideoTaskStorage: {
    getVideoTasks: vi.fn<() => Promise<VideoTask[]>>().mockResolvedValue([]),
  },
  mockMergeVideos: vi.fn(),
  mockCheckFfmpegAvailable: vi.fn(),
}));

vi.mock("@/infrastructure/di", () => ({
  container: {
    videoTaskStorage: mockVideoTaskStorage,
  },
}));

vi.mock("@/modules/ffmpeg-runner", () => ({
  mergeVideos: mockMergeVideos,
  checkFfmpegAvailable: mockCheckFfmpegAvailable,
}));

function buildTask(overrides: Partial<VideoTask> = {}): VideoTask {
  return {
    taskId: "task-001",
    status: "completed",
    progress: 100,
    localVideoPath: "/path/to/video.mp4",
    message: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("video-composer service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVideoTaskStorage.getVideoTasks.mockResolvedValue([]);
  });

  // === listCompletedVideoTasks ===
  describe("listCompletedVideoTasks", () => {
    it("仅返回 status=completed 且 localVideoPath 存在的任务", async () => {
      const tasks = [
        buildTask({ taskId: "t1", status: "completed", localVideoPath: "/p/1.mp4" }),
        buildTask({ taskId: "t2", status: "generating", localVideoPath: "/p/2.mp4" }),
        buildTask({ taskId: "t3", status: "completed", localVideoPath: undefined }),
        buildTask({ taskId: "t4", status: "failed", localVideoPath: "/p/4.mp4" }),
      ];
      mockVideoTaskStorage.getVideoTasks.mockResolvedValue(tasks);

      const result = await listCompletedVideoTasks();

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe("t1");
    });

    it("按 storyId 过滤任务", async () => {
      const tasks = [
        buildTask({ taskId: "t1", storyId: "story-a" }),
        buildTask({ taskId: "t2", storyId: "story-b" }),
        buildTask({ taskId: "t3", storyId: "story-a" }),
      ];
      mockVideoTaskStorage.getVideoTasks.mockResolvedValue(tasks);

      const result = await listCompletedVideoTasks("story-a");

      expect(result).toHaveLength(2);
      expect(result.map((r) => r.id).sort()).toEqual(["t1", "t3"]);
    });

    it("不传 storyId 时返回所有已完成任务", async () => {
      const tasks = [
        buildTask({ taskId: "t1", storyId: "story-a" }),
        buildTask({ taskId: "t2", storyId: "story-b" }),
      ];
      mockVideoTaskStorage.getVideoTasks.mockResolvedValue(tasks);

      const result = await listCompletedVideoTasks();

      expect(result).toHaveLength(2);
    });

    it("beatTitle 存在时使用 compose.beatTitle 模板生成 label", async () => {
      const tasks = [
        buildTask({ taskId: "abcdef1234567890", beatTitle: "开场白" }),
      ];
      mockVideoTaskStorage.getVideoTasks.mockResolvedValue(tasks);

      const result = await listCompletedVideoTasks();

      expect(result[0]!.label).toBe("分镜：开场白");
    });

    it("beatTitle 缺失时使用 compose.taskTitle 模板（截取前 8 字符）", async () => {
      const tasks = [
        buildTask({ taskId: "abcdef1234567890", beatTitle: undefined }),
      ];
      mockVideoTaskStorage.getVideoTasks.mockResolvedValue(tasks);

      const result = await listCompletedVideoTasks();

      expect(result[0]!.label).toBe("任务 abcdef12");
    });

    it("返回的 VideoSegment 字段映射正确", async () => {
      const tasks = [
        buildTask({
          taskId: "t1",
          storyId: "s1",
          beatId: "b1",
          beatTitle: "标题",
          localVideoPath: "/p/1.mp4",
        }),
      ];
      mockVideoTaskStorage.getVideoTasks.mockResolvedValue(tasks);

      const result = await listCompletedVideoTasks();

      expect(result[0]).toEqual({
        id: "t1",
        label: "分镜：标题",
        path: "/p/1.mp4",
        source: "task",
        taskId: "t1",
        storyId: "s1",
        beatId: "b1",
        beatTitle: "标题",
      });
    });
  });

  // === composeVideoSegments ===
  describe("composeVideoSegments", () => {
    const segments: VideoSegment[] = [
      { id: "s1", label: "片段1", path: "/p/1.mp4", source: "task" },
      { id: "s2", label: "片段2", path: "/p/2.mp4", source: "task" },
    ];

    it("segments.length < 2 时返回错误", async () => {
      const result = await composeVideoSegments([]);

      expect(result.success).toBe(false);
      expect(result.error).toBe("至少需要 2 个视频片段才能合成");
      expect(mockMergeVideos).not.toHaveBeenCalled();
    });

    it("segments.length === 1 时返回错误", async () => {
      const result = await composeVideoSegments([segments[0]!]);

      expect(result.success).toBe(false);
      expect(result.error).toBe("至少需要 2 个视频片段才能合成");
      expect(mockMergeVideos).not.toHaveBeenCalled();
    });

    it("透传 paths/transition/transitionDuration 给 mergeVideos", async () => {
      mockMergeVideos.mockResolvedValue({ success: true, outputPath: "/out.mp4" });

      await composeVideoSegments(segments, "fade", 0.8);

      expect(mockMergeVideos).toHaveBeenCalledWith(["/p/1.mp4", "/p/2.mp4"], "fade", 0.8);
    });

    it("使用默认 transition=none / transitionDuration=0.5", async () => {
      mockMergeVideos.mockResolvedValue({ success: true });

      await composeVideoSegments(segments);

      expect(mockMergeVideos).toHaveBeenCalledWith(["/p/1.mp4", "/p/2.mp4"], "none", 0.5);
    });

    it("成功时映射 FfmpegResult → ComposeResult", async () => {
      mockMergeVideos.mockResolvedValue({
        success: true,
        outputPath: "/out.mp4",
        metadata: { videoCount: 2 },
      });

      const result = await composeVideoSegments(segments, "fade", 0.5);

      expect(result).toEqual({
        success: true,
        outputPath: "/out.mp4",
        error: undefined,
        metadata: { videoCount: 2 },
      });
    });

    it("失败时映射错误信息", async () => {
      mockMergeVideos.mockResolvedValue({
        success: false,
        error: "ffmpeg 执行失败",
      });

      const result = await composeVideoSegments(segments);

      expect(result.success).toBe(false);
      expect(result.error).toBe("ffmpeg 执行失败");
      expect(result.outputPath).toBeUndefined();
    });
  });

  // === checkComposerAvailable ===
  describe("checkComposerAvailable", () => {
    it("透传 checkFfmpegAvailable 的返回值", async () => {
      mockCheckFfmpegAvailable.mockResolvedValue({
        available: true,
        version: "6.0",
        path: "/usr/bin/ffmpeg",
      });

      const result = await checkComposerAvailable();

      expect(mockCheckFfmpegAvailable).toHaveBeenCalled();
      expect(result).toEqual({
        available: true,
        version: "6.0",
        path: "/usr/bin/ffmpeg",
      });
    });

    it("available=false 时透传", async () => {
      mockCheckFfmpegAvailable.mockResolvedValue({ available: false });

      const result = await checkComposerAvailable();

      expect(result.available).toBe(false);
    });
  });

  // === pickLocalVideoFiles ===
  describe("pickLocalVideoFiles", () => {
    it("返回 string[] 格式时直接使用", async () => {
      vi.stubGlobal("electronAPI", {
        openFileDialog: vi.fn().mockResolvedValue(["/p/1.mp4", "/p/2.mp4"]),
      });

      const result = await pickLocalVideoFiles();

      expect(result).toEqual(["/p/1.mp4", "/p/2.mp4"]);
    });

    it("返回 {canceled, filePaths} 格式且未取消时返回 filePaths", async () => {
      vi.stubGlobal("electronAPI", {
        openFileDialog: vi.fn().mockResolvedValue({
          canceled: false,
          filePaths: ["/p/a.mp4", "/p/b.mp4"],
        }),
      });

      const result = await pickLocalVideoFiles();

      expect(result).toEqual(["/p/a.mp4", "/p/b.mp4"]);
    });

    it("返回 {canceled, filePaths} 格式且取消时返回空数组", async () => {
      vi.stubGlobal("electronAPI", {
        openFileDialog: vi.fn().mockResolvedValue({
          canceled: true,
          filePaths: [],
        }),
      });

      const result = await pickLocalVideoFiles();

      expect(result).toEqual([]);
    });

    it("electronAPI 缺失时抛错", async () => {
      vi.stubGlobal("electronAPI", undefined);

      await expect(pickLocalVideoFiles()).rejects.toThrow("当前环境不支持文件选择对话框");
    });

    it("openFileDialog 缺失时抛错", async () => {
      vi.stubGlobal("electronAPI", {});

      await expect(pickLocalVideoFiles()).rejects.toThrow("当前环境不支持文件选择对话框");
    });
  });
});
