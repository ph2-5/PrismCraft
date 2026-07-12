/**
 * Video Post Tools 单元测试
 *
 * 测试 8 个视频后期处理工具：
 * - merge_videos：合并多段视频
 * - trim_video：剪辑视频片段
 * - add_transition：添加转场效果
 * - add_subtitle：添加字幕
 * - adjust_video_speed：调整视频速度
 * - extract_audio：提取音频
 * - replace_audio：替换音频轨道
 * - generate_thumbnail：生成视频缩略图
 *
 * Mock 策略：
 * - ../../services/ffmpeg-service（被测工具真正调用的服务）
 * - ../../services/tool-executor（TOOL_TIMEOUTS 常量）
 *
 * 测试模式（每个工具 3 类场景）：
 * 1. 参数校验失败：缺少必填参数、参数范围错误（不调用 ffmpeg-service）
 * 2. ffmpeg 不可用：checkFfmpegAvailable 返回 { available: false }，工具返回降级提示
 * 3. 正常执行：checkFfmpegAvailable 返回 { available: true }，ffmpeg-service 方法返回成功
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

// vi.hoisted：mock 变量在 vi.mock 工厂执行前就已定义
const mocks = vi.hoisted(() => ({
  checkFfmpegAvailable: vi.fn(),
  mergeVideos: vi.fn(),
  trimVideo: vi.fn(),
  addTransition: vi.fn(),
  addSubtitle: vi.fn(),
  adjustVideoSpeed: vi.fn(),
  extractAudio: vi.fn(),
  replaceAudio: vi.fn(),
  generateThumbnail: vi.fn(),
  composeFinalVideo: vi.fn(),
}));

vi.mock("../../services/ffmpeg-service", () => ({
  checkFfmpegAvailable: mocks.checkFfmpegAvailable,
  mergeVideos: mocks.mergeVideos,
  trimVideo: mocks.trimVideo,
  addTransition: mocks.addTransition,
  addSubtitle: mocks.addSubtitle,
  adjustVideoSpeed: mocks.adjustVideoSpeed,
  extractAudio: mocks.extractAudio,
  replaceAudio: mocks.replaceAudio,
  generateThumbnail: mocks.generateThumbnail,
  composeFinalVideo: mocks.composeFinalVideo,
}));

vi.mock("../../services/tool-executor", () => ({
  TOOL_TIMEOUTS: {
    query: 30_000,
    mutation: 60_000,
    generation: 300_000,
    videoTask: 1_800_000,
    download: 600_000,
  },
}));

import {
  mergeVideosTool,
  trimVideoTool,
  addTransitionTool,
  addSubtitleTool,
  adjustVideoSpeedTool,
  extractAudioTool,
  replaceAudioTool,
  generateThumbnailTool,
  composeFinalVideoTool,
  videoPostTools,
} from "../video-post-tools";
import type { ToolContext } from "../../domain/types";

// ============= Helpers =============

function makeCtx(): ToolContext {
  return {
    sessionId: "test-session",
    onProgress: vi.fn(),
  };
}

// ============= Tests =============

describe("video-post-tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 默认 ffmpeg 可用
    mocks.checkFfmpegAvailable.mockResolvedValue({ available: true, path: "ffmpeg" });
  });

  // ============= merge_videos =============
  describe("merge_videos", () => {
    it("1. 参数校验：videoPaths 少于 2 个时返回错误", async () => {
      const result = await mergeVideosTool.execute(
        { videoPaths: ["/only.mp4"] },
        makeCtx(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("2-10");
      expect(mocks.mergeVideos).not.toHaveBeenCalled();
    });

    it("2. ffmpeg 不可用时返回降级提示", async () => {
      mocks.checkFfmpegAvailable.mockResolvedValue({ available: false });

      const result = await mergeVideosTool.execute(
        { videoPaths: ["/a.mp4", "/b.mp4"] },
        makeCtx(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("ffmpeg 不可用");
      expect(result.error).toContain("ffmpeg.org");
      const data = result.data as {
        degraded: boolean;
        videoCount: number;
        transition: string;
      };
      expect(data.degraded).toBe(true);
      expect(data.videoCount).toBe(2);
      expect(data.transition).toBe("none");
    });

    it("3. 正常执行返回 outputPath", async () => {
      mocks.mergeVideos.mockResolvedValue({
        success: true,
        outputPath: "/test/cache/merged.mp4",
        duration: 5000,
        metadata: { videoCount: 2, transition: "none" },
      });

      const result = await mergeVideosTool.execute(
        { videoPaths: ["/a.mp4", "/b.mp4"] },
        makeCtx(),
      );

      expect(result.success).toBe(true);
      // 验证默认 transition=none, transitionDuration=0.5, outputPath=undefined
      expect(mocks.mergeVideos).toHaveBeenCalledWith(
        ["/a.mp4", "/b.mp4"],
        "none",
        0.5,
        undefined,
      );
      const data = result.data as { outputPath: string; duration: number };
      expect(data.outputPath).toBe("/test/cache/merged.mp4");
      expect(data.duration).toBe(5000);
    });
  });

  // ============= trim_video =============
  describe("trim_video", () => {
    it("4. 参数校验：endTime <= startTime 时返回错误", async () => {
      const result = await trimVideoTool.execute(
        { videoPath: "/v.mp4", startTime: 10, endTime: 5 },
        makeCtx(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("startTime/endTime 无效");
      expect(mocks.trimVideo).not.toHaveBeenCalled();
    });

    it("5. ffmpeg 不可用时返回降级提示", async () => {
      mocks.checkFfmpegAvailable.mockResolvedValue({ available: false });

      const result = await trimVideoTool.execute(
        { videoPath: "/v.mp4", startTime: 0, endTime: 10 },
        makeCtx(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("ffmpeg 不可用");
      const data = result.data as {
        degraded: boolean;
        startTime: number;
        endTime: number;
      };
      expect(data.degraded).toBe(true);
      expect(data.startTime).toBe(0);
      expect(data.endTime).toBe(10);
    });

    it("6. 正常执行返回 outputPath", async () => {
      mocks.trimVideo.mockResolvedValue({
        success: true,
        outputPath: "/test/cache/trimmed.mp4",
        duration: 300,
        metadata: { startTime: 5, endTime: 15 },
      });

      const result = await trimVideoTool.execute(
        { videoPath: "/v.mp4", startTime: 5, endTime: 15 },
        makeCtx(),
      );

      expect(result.success).toBe(true);
      expect(mocks.trimVideo).toHaveBeenCalledWith(
        "/v.mp4",
        5,
        15,
        undefined,
      );
      const data = result.data as { outputPath: string };
      expect(data.outputPath).toBe("/test/cache/trimmed.mp4");
    });
  });

  // ============= add_transition =============
  describe("add_transition", () => {
    it("7. 参数校验：必要参数正确传递到 ffmpeg-service", async () => {
      mocks.addTransition.mockResolvedValue({
        success: true,
        outputPath: "/test/cache/transition.mp4",
        metadata: { transitionType: "fade", position: "start", duration: 0.5 },
      });

      const result = await addTransitionTool.execute(
        { videoPath: "/v.mp4", transitionType: "fade", position: "start" },
        makeCtx(),
      );

      expect(result.success).toBe(true);
      // 验证必要参数 videoPath/transitionType/position 被正确传递，duration 默认 0.5
      expect(mocks.addTransition).toHaveBeenCalledWith(
        "/v.mp4",
        "fade",
        "start",
        0.5,
        undefined,
      );
    });

    it("8. ffmpeg 不可用时返回降级提示", async () => {
      mocks.checkFfmpegAvailable.mockResolvedValue({ available: false });

      const result = await addTransitionTool.execute(
        { videoPath: "/v.mp4", transitionType: "fade", position: "start" },
        makeCtx(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("ffmpeg 不可用");
      const data = result.data as {
        degraded: boolean;
        transitionType: string;
        position: string;
        duration: number;
      };
      expect(data.degraded).toBe(true);
      expect(data.transitionType).toBe("fade");
      expect(data.position).toBe("start");
      expect(data.duration).toBe(0.5);
    });

    it("9. 正常执行返回 outputPath", async () => {
      mocks.addTransition.mockResolvedValue({
        success: true,
        outputPath: "/test/cache/transition.mp4",
        duration: 200,
        metadata: { transitionType: "dissolve", position: "between", duration: 0.8 },
      });

      const result = await addTransitionTool.execute(
        {
          videoPath: "/v.mp4",
          transitionType: "dissolve",
          position: "between",
          duration: 0.8,
        },
        makeCtx(),
      );

      expect(result.success).toBe(true);
      expect(mocks.addTransition).toHaveBeenCalledWith(
        "/v.mp4",
        "dissolve",
        "between",
        0.8,
        undefined,
      );
      const data = result.data as { outputPath: string };
      expect(data.outputPath).toBe("/test/cache/transition.mp4");
    });
  });

  // ============= add_subtitle =============
  describe("add_subtitle", () => {
    it("10. 参数校验：subtitles 和 subtitlePath 都为空时返回错误", async () => {
      const result = await addSubtitleTool.execute(
        { videoPath: "/v.mp4" },
        makeCtx(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("必须提供");
      expect(result.error).toContain("subtitles");
      expect(result.error).toContain("subtitlePath");
      expect(mocks.addSubtitle).not.toHaveBeenCalled();
    });

    it("11. ffmpeg 不可用时返回降级提示", async () => {
      mocks.checkFfmpegAvailable.mockResolvedValue({ available: false });

      const result = await addSubtitleTool.execute(
        {
          videoPath: "/v.mp4",
          subtitles: [{ text: "你好", startTime: 0, endTime: 2 }],
        },
        makeCtx(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("ffmpeg 不可用");
      const data = result.data as {
        degraded: boolean;
        subtitleCount: number;
        subtitlePath: undefined;
      };
      expect(data.degraded).toBe(true);
      expect(data.subtitleCount).toBe(1);
      expect(data.subtitlePath).toBeUndefined();
    });

    it("12. 正常执行（传入 subtitles 数组）返回 outputPath", async () => {
      mocks.addSubtitle.mockResolvedValue({
        success: true,
        outputPath: "/test/cache/subtitled.mp4",
        duration: 400,
        metadata: { subtitleCount: 2, fontSize: 24, position: "bottom" },
      });

      const result = await addSubtitleTool.execute(
        {
          videoPath: "/v.mp4",
          subtitles: [
            { text: "你好", startTime: 0, endTime: 2 },
            { text: "世界", startTime: 2, endTime: 4 },
          ],
          fontSize: 28,
          position: "center",
        },
        makeCtx(),
      );

      expect(result.success).toBe(true);
      // 验证 subtitles 数组被转换后传递，options 包含 fontSize/fontColor/position
      expect(mocks.addSubtitle).toHaveBeenCalledWith(
        "/v.mp4",
        [
          { text: "你好", startTime: 0, endTime: 2 },
          { text: "世界", startTime: 2, endTime: 4 },
        ],
        {
          fontSize: 28,
          fontColor: "#ffffff",
          position: "center",
          subtitlePath: undefined,
          outputPath: undefined,
        },
      );
      const data = result.data as { outputPath: string };
      expect(data.outputPath).toBe("/test/cache/subtitled.mp4");
    });

    it("13. 正常执行（传入 subtitlePath）返回 outputPath", async () => {
      mocks.addSubtitle.mockResolvedValue({
        success: true,
        outputPath: "/test/cache/subtitled.mp4",
        duration: 400,
        metadata: { subtitleCount: 0, fontSize: 24, position: "bottom" },
      });

      const result = await addSubtitleTool.execute(
        { videoPath: "/v.mp4", subtitlePath: "/sub.srt" },
        makeCtx(),
      );

      expect(result.success).toBe(true);
      // 验证 subtitlePath 提供时 subtitles 为空数组，subtitlePath 传入 options
      expect(mocks.addSubtitle).toHaveBeenCalledWith(
        "/v.mp4",
        [],
        {
          fontSize: 24,
          fontColor: "#ffffff",
          position: "bottom",
          subtitlePath: "/sub.srt",
          outputPath: undefined,
        },
      );
      const data = result.data as { outputPath: string };
      expect(data.outputPath).toBe("/test/cache/subtitled.mp4");
    });
  });

  // ============= adjust_video_speed =============
  describe("adjust_video_speed", () => {
    it("14. 参数校验：speed 超范围时返回错误", async () => {
      const result = await adjustVideoSpeedTool.execute(
        { videoPath: "/v.mp4", speed: 5.0 },
        makeCtx(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("0.25");
      expect(result.error).toContain("4.0");
      expect(mocks.adjustVideoSpeed).not.toHaveBeenCalled();
    });

    it("15. ffmpeg 不可用时返回降级提示", async () => {
      mocks.checkFfmpegAvailable.mockResolvedValue({ available: false });

      const result = await adjustVideoSpeedTool.execute(
        { videoPath: "/v.mp4", speed: 2.0 },
        makeCtx(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("ffmpeg 不可用");
      const data = result.data as {
        degraded: boolean;
        speed: number;
        preserveAudio: boolean;
      };
      expect(data.degraded).toBe(true);
      expect(data.speed).toBe(2.0);
      expect(data.preserveAudio).toBe(true); // 默认 true
    });

    it("16. 正常执行返回 outputPath", async () => {
      mocks.adjustVideoSpeed.mockResolvedValue({
        success: true,
        outputPath: "/test/cache/speed.mp4",
        duration: 1000,
        metadata: { speed: 0.5, preserveAudio: true },
      });

      const result = await adjustVideoSpeedTool.execute(
        { videoPath: "/v.mp4", speed: 0.5 },
        makeCtx(),
      );

      expect(result.success).toBe(true);
      // 验证默认 preserveAudio=true, outputPath=undefined
      expect(mocks.adjustVideoSpeed).toHaveBeenCalledWith(
        "/v.mp4",
        0.5,
        true,
        undefined,
      );
      const data = result.data as { outputPath: string };
      expect(data.outputPath).toBe("/test/cache/speed.mp4");
    });
  });

  // ============= extract_audio =============
  describe("extract_audio", () => {
    it("17. 参数校验：必要参数 videoPath 正确传递到 ffmpeg-service", async () => {
      mocks.extractAudio.mockResolvedValue({
        success: true,
        outputPath: "/test/cache/extracted.mp3",
        metadata: { outputFormat: "mp3" },
      });

      const result = await extractAudioTool.execute(
        { videoPath: "/v.mp4" },
        makeCtx(),
      );

      expect(result.success).toBe(true);
      // 验证默认 outputFormat=mp3, startTime=undefined, endTime=undefined
      expect(mocks.extractAudio).toHaveBeenCalledWith(
        "/v.mp4",
        "mp3",
        undefined,
        undefined,
        undefined,
      );
    });

    it("18. ffmpeg 不可用时返回降级提示", async () => {
      mocks.checkFfmpegAvailable.mockResolvedValue({ available: false });

      const result = await extractAudioTool.execute(
        { videoPath: "/v.mp4" },
        makeCtx(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("ffmpeg 不可用");
      const data = result.data as {
        degraded: boolean;
        outputFormat: string;
        startTime: undefined;
        endTime: undefined;
      };
      expect(data.degraded).toBe(true);
      expect(data.outputFormat).toBe("mp3");
      expect(data.startTime).toBeUndefined();
      expect(data.endTime).toBeUndefined();
    });

    it("19. 正常执行返回 outputPath（自定义格式与时间段）", async () => {
      mocks.extractAudio.mockResolvedValue({
        success: true,
        outputPath: "/test/cache/extracted.wav",
        duration: 500,
        metadata: { outputFormat: "wav", startTime: 5, endTime: 20 },
      });

      const result = await extractAudioTool.execute(
        {
          videoPath: "/v.mp4",
          outputFormat: "wav",
          startTime: 5,
          endTime: 20,
        },
        makeCtx(),
      );

      expect(result.success).toBe(true);
      expect(mocks.extractAudio).toHaveBeenCalledWith(
        "/v.mp4",
        "wav",
        5,
        20,
        undefined,
      );
      const data = result.data as { outputPath: string };
      expect(data.outputPath).toBe("/test/cache/extracted.wav");
    });
  });

  // ============= replace_audio =============
  describe("replace_audio", () => {
    it("20. 参数校验：volume 超范围时返回错误", async () => {
      const result = await replaceAudioTool.execute(
        { videoPath: "/v.mp4", audioPath: "/a.mp3", volume: 3.0 },
        makeCtx(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("volume");
      expect(result.error).toContain("0");
      expect(result.error).toContain("2");
      expect(mocks.replaceAudio).not.toHaveBeenCalled();
    });

    it("21. ffmpeg 不可用时返回降级提示", async () => {
      mocks.checkFfmpegAvailable.mockResolvedValue({ available: false });

      const result = await replaceAudioTool.execute(
        { videoPath: "/v.mp4", audioPath: "/a.mp3", volume: 1.0 },
        makeCtx(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("ffmpeg 不可用");
      const data = result.data as {
        degraded: boolean;
        audioStartTime: number;
        volume: number;
      };
      expect(data.degraded).toBe(true);
      expect(data.audioStartTime).toBe(0); // 默认值
      expect(data.volume).toBe(1.0);
    });

    it("22. 正常执行返回 outputPath", async () => {
      mocks.replaceAudio.mockResolvedValue({
        success: true,
        outputPath: "/test/cache/replaced.mp4",
        duration: 600,
        metadata: { audioStartTime: 2, volume: 0.8 },
      });

      const result = await replaceAudioTool.execute(
        {
          videoPath: "/v.mp4",
          audioPath: "/a.mp3",
          audioStartTime: 2,
          volume: 0.8,
        },
        makeCtx(),
      );

      expect(result.success).toBe(true);
      expect(mocks.replaceAudio).toHaveBeenCalledWith(
        "/v.mp4",
        "/a.mp3",
        2,
        0.8,
        undefined,
      );
      const data = result.data as { outputPath: string };
      expect(data.outputPath).toBe("/test/cache/replaced.mp4");
    });
  });

  // ============= generate_thumbnail =============
  describe("generate_thumbnail", () => {
    it("23. 参数校验：必要参数 videoPath 正确传递到 ffmpeg-service", async () => {
      mocks.generateThumbnail.mockResolvedValue({
        success: true,
        outputPath: "/test/cache/thumb.jpg",
        metadata: { timePoint: 1, width: 320 },
      });

      const result = await generateThumbnailTool.execute(
        { videoPath: "/v.mp4" },
        makeCtx(),
      );

      expect(result.success).toBe(true);
      // 验证默认 timePoint=1, width=320
      expect(mocks.generateThumbnail).toHaveBeenCalledWith(
        "/v.mp4",
        1,
        320,
        undefined,
      );
    });

    it("24. ffmpeg 不可用时返回降级提示", async () => {
      mocks.checkFfmpegAvailable.mockResolvedValue({ available: false });

      const result = await generateThumbnailTool.execute(
        { videoPath: "/v.mp4" },
        makeCtx(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("ffmpeg 不可用");
      const data = result.data as {
        degraded: boolean;
        timePoint: number;
        width: number;
      };
      expect(data.degraded).toBe(true);
      expect(data.timePoint).toBe(1); // 默认值
      expect(data.width).toBe(320); // 默认值
    });

    it("25. 正常执行返回 outputPath（自定义时间点与宽度）", async () => {
      mocks.generateThumbnail.mockResolvedValue({
        success: true,
        outputPath: "/test/cache/thumb.jpg",
        duration: 50,
        metadata: { timePoint: 3, width: 640 },
      });

      const result = await generateThumbnailTool.execute(
        { videoPath: "/v.mp4", timePoint: 3, width: 640 },
        makeCtx(),
      );

      expect(result.success).toBe(true);
      expect(mocks.generateThumbnail).toHaveBeenCalledWith(
        "/v.mp4",
        3,
        640,
        undefined,
      );
      const data = result.data as { outputPath: string };
      expect(data.outputPath).toBe("/test/cache/thumb.jpg");
    });
  });

  // ============= compose_final_video =============
  describe("compose_final_video", () => {
    it("26. 参数校验：videoPaths 为空时返回错误", async () => {
      const result = await composeFinalVideoTool.execute(
        { videoPaths: [] },
        makeCtx(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("1-10");
      expect(mocks.composeFinalVideo).not.toHaveBeenCalled();
    });

    it("27. 参数校验：videoPaths 超过 10 个时返回错误", async () => {
      const manyPaths = Array.from({ length: 11 }, (_, i) => `/v${i}.mp4`);
      const result = await composeFinalVideoTool.execute(
        { videoPaths: manyPaths },
        makeCtx(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("1-10");
      expect(mocks.composeFinalVideo).not.toHaveBeenCalled();
    });

    it("28. ffmpeg 不可用时返回降级提示", async () => {
      mocks.checkFfmpegAvailable.mockResolvedValue({ available: false });

      const result = await composeFinalVideoTool.execute(
        { videoPaths: ["/v1.mp4", "/v2.mp4"] },
        makeCtx(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("ffmpeg 不可用");
      expect(result.error).toContain("ffmpeg.org");
      const data = result.data as { degraded: boolean; videoCount: number };
      expect(data.degraded).toBe(true);
      expect(data.videoCount).toBe(2);
    });

    it("29. 正常执行（仅视频片段，无音乐/字幕）返回 outputPath", async () => {
      mocks.composeFinalVideo.mockResolvedValue({
        success: true,
        outputPath: "/test/cache/final.mp4",
        metadata: { steps: ["merge"], videoCount: 2 },
      });

      const result = await composeFinalVideoTool.execute(
        { videoPaths: ["/v1.mp4", "/v2.mp4"] },
        makeCtx(),
      );

      expect(result.success).toBe(true);
      // 验证未提供可选参数时传 undefined
      expect(mocks.composeFinalVideo).toHaveBeenCalledWith(
        ["/v1.mp4", "/v2.mp4"],
        {
          backgroundMusic: undefined,
          subtitles: undefined,
          transition: undefined,
          transitionDuration: undefined,
          fontSize: undefined,
          fontColor: undefined,
          outputPath: undefined,
        },
      );
      const data = result.data as { outputPath: string };
      expect(data.outputPath).toBe("/test/cache/final.mp4");
    });

    it("30. 正常执行（含背景音乐 + 字幕 + 转场）返回 outputPath", async () => {
      mocks.composeFinalVideo.mockResolvedValue({
        success: true,
        outputPath: "/test/cache/final_full.mp4",
        metadata: { steps: ["merge", "replaceAudio", "addSubtitle"], videoCount: 3 },
      });

      const result = await composeFinalVideoTool.execute(
        {
          videoPaths: ["/v1.mp4", "/v2.mp4", "/v3.mp4"],
          backgroundMusic: "/bgm.mp3",
          subtitles: [
            { text: "Hello", startTime: 0, endTime: 2 },
            { text: "World", startTime: 2, endTime: 4 },
          ],
          transition: "fade",
          transitionDuration: 0.8,
          fontSize: 28,
          fontColor: "#ffff00",
          outputPath: "/custom/final.mp4",
        },
        makeCtx(),
      );

      expect(result.success).toBe(true);
      // 验证所有参数被正确转换并传递
      expect(mocks.composeFinalVideo).toHaveBeenCalledWith(
        ["/v1.mp4", "/v2.mp4", "/v3.mp4"],
        {
          backgroundMusic: "/bgm.mp3",
          subtitles: [
            { text: "Hello", startTime: 0, endTime: 2 },
            { text: "World", startTime: 2, endTime: 4 },
          ],
          transition: "fade",
          transitionDuration: 0.8,
          fontSize: 28,
          fontColor: "#ffff00",
          outputPath: "/custom/final.mp4",
        },
      );
      const data = result.data as { outputPath: string; metadata: { steps: string[] } };
      expect(data.outputPath).toBe("/test/cache/final_full.mp4");
      expect(data.metadata.steps).toEqual(["merge", "replaceAudio", "addSubtitle"]);
    });

    it("31. composeFinalVideo 服务返回失败时传递错误", async () => {
      mocks.composeFinalVideo.mockResolvedValue({
        success: false,
        error: "合并步骤失败：codec 不兼容",
        stderr: "ffmpeg stderr output",
      });

      const result = await composeFinalVideoTool.execute(
        { videoPaths: ["/v1.mp4", "/v2.mp4"] },
        makeCtx(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("合并步骤失败");
      const data = result.data as { stderr: string };
      expect(data.stderr).toBe("ffmpeg stderr output");
    });
  });

  // ============= 导出完整性 =============
  describe("导出完整性", () => {
    it("32. 包含全部 9 个工具", () => {
      expect(videoPostTools).toHaveLength(9);
      const names = videoPostTools.map((t) => t.def.function.name);
      expect(names).toContain("merge_videos");
      expect(names).toContain("trim_video");
      expect(names).toContain("add_transition");
      expect(names).toContain("add_subtitle");
      expect(names).toContain("adjust_video_speed");
      expect(names).toContain("extract_audio");
      expect(names).toContain("replace_audio");
      expect(names).toContain("generate_thumbnail");
      expect(names).toContain("compose_final_video");
    });

    it("33. 所有工具 domain 为 video-post", () => {
      for (const tool of videoPostTools) {
        expect(tool.domain).toBe("video-post");
      }
    });

    it("34. compose_final_video 标记为 limited 危险等级", () => {
      // 合成消耗大量资源，标记为 limited（不自动确认，但记录危险等级）
      expect(composeFinalVideoTool.dangerLevel).toBe("limited");
    });
  });
});
