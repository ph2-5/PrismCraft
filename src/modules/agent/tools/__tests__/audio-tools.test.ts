/**
 * Audio Tools 单元测试
 *
 * 测试 5 个音频处理工具：
 * - mix_audio：混音（多轨合并）
 * - adjust_audio_speed：调整音频速度
 * - normalize_audio：音量标准化
 * - remove_noise：降噪
 * - split_audio：分割音频
 *
 * Mock 策略：
 * - @/modules/ffmpeg-runner（被测工具真正调用的服务）
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
  mixAudio: vi.fn(),
  adjustAudioSpeed: vi.fn(),
  normalizeAudio: vi.fn(),
  removeNoise: vi.fn(),
  splitAudio: vi.fn(),
}));

vi.mock("@/modules/ffmpeg-runner", () => ({
  checkFfmpegAvailable: mocks.checkFfmpegAvailable,
  mixAudio: mocks.mixAudio,
  adjustAudioSpeed: mocks.adjustAudioSpeed,
  normalizeAudio: mocks.normalizeAudio,
  removeNoise: mocks.removeNoise,
  splitAudio: mocks.splitAudio,
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
  mixAudioTool,
  adjustAudioSpeedTool,
  normalizeAudioTool,
  removeNoiseTool,
  splitAudioTool,
  audioTools,
} from "../audio-tools";
import type { ToolContext } from "../../domain/types";

// ============= Helpers =============

function makeCtx(): ToolContext {
  return {
    sessionId: "test-session",
    onProgress: vi.fn(),
  };
}

// ============= Tests =============

describe("audio-tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 默认 ffmpeg 可用
    mocks.checkFfmpegAvailable.mockResolvedValue({ available: true, path: "ffmpeg" });
  });

  // ============= mix_audio =============
  describe("mix_audio", () => {
    it("1. 参数校验：audioPaths 少于 2 个时返回错误", async () => {
      const result = await mixAudioTool.execute(
        { audioPaths: ["/only.wav"] },
        makeCtx(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("audioPaths");
      expect(result.error).toContain("2-8");
      expect(mocks.mixAudio).not.toHaveBeenCalled();
    });

    it("2. 参数校验：volumes 长度不匹配时返回错误", async () => {
      const result = await mixAudioTool.execute(
        {
          audioPaths: ["/a.wav", "/b.wav", "/c.wav"],
          volumes: [0.5, 0.8],
        },
        makeCtx(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("volumes 长度");
      expect(result.error).toContain("3");
      expect(mocks.mixAudio).not.toHaveBeenCalled();
    });

    it("3. ffmpeg 不可用时返回降级提示", async () => {
      mocks.checkFfmpegAvailable.mockResolvedValue({ available: false });

      const result = await mixAudioTool.execute(
        { audioPaths: ["/a.wav", "/b.wav"] },
        makeCtx(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("ffmpeg 不可用");
      expect(result.error).toContain("ffmpeg.org");
      const data = result.data as { degraded: boolean; trackCount: number };
      expect(data.degraded).toBe(true);
      expect(data.trackCount).toBe(2);
      expect(mocks.mixAudio).not.toHaveBeenCalled();
    });

    it("4. 正常混音返回 outputPath", async () => {
      mocks.mixAudio.mockResolvedValue({
        success: true,
        outputPath: "/test/cache/mixed.wav",
        duration: 1500,
        metadata: { trackCount: 2, volumes: [1, 1] },
      });

      const result = await mixAudioTool.execute(
        { audioPaths: ["/a.wav", "/b.wav"] },
        makeCtx(),
      );

      expect(result.success).toBe(true);
      // 验证默认 volumes 为全 1，outputPath 未指定时传 undefined
      expect(mocks.mixAudio).toHaveBeenCalledWith(
        ["/a.wav", "/b.wav"],
        [1, 1],
        undefined,
      );
      const data = result.data as {
        outputPath: string;
        duration: number;
        metadata: { trackCount: number; volumes: number[] };
      };
      expect(data.outputPath).toBe("/test/cache/mixed.wav");
      expect(data.duration).toBe(1500);
      expect(data.metadata.trackCount).toBe(2);
    });

    it("5. ffmpeg-service 失败时返回错误", async () => {
      mocks.mixAudio.mockResolvedValue({
        success: false,
        error: "ffmpeg 执行失败",
        stderr: "error details",
        duration: 100,
      });

      const result = await mixAudioTool.execute(
        { audioPaths: ["/a.wav", "/b.wav"] },
        makeCtx(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("混音失败");
      expect(result.error).toContain("ffmpeg 执行失败");
      const data = result.data as { stderr: string; duration: number };
      expect(data.stderr).toBe("error details");
      expect(data.duration).toBe(100);
    });
  });

  // ============= adjust_audio_speed =============
  describe("adjust_audio_speed", () => {
    it("6. 参数校验：speed 超范围时返回错误", async () => {
      const result = await adjustAudioSpeedTool.execute(
        { audioPath: "/a.wav", speed: 5.0 },
        makeCtx(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("0.25");
      expect(result.error).toContain("4.0");
      expect(mocks.adjustAudioSpeed).not.toHaveBeenCalled();
    });

    it("7. ffmpeg 不可用时返回降级提示", async () => {
      mocks.checkFfmpegAvailable.mockResolvedValue({ available: false });

      const result = await adjustAudioSpeedTool.execute(
        { audioPath: "/a.wav", speed: 2.0 },
        makeCtx(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("ffmpeg 不可用");
      const data = result.data as { degraded: boolean; speed: number; preservePitch: boolean };
      expect(data.degraded).toBe(true);
      expect(data.speed).toBe(2.0);
      expect(data.preservePitch).toBe(true);
    });

    it("8. 正常执行返回 outputPath", async () => {
      mocks.adjustAudioSpeed.mockResolvedValue({
        success: true,
        outputPath: "/test/cache/speed_2x.wav",
        duration: 800,
        metadata: { speed: 2.0, preservePitch: true },
      });

      const result = await adjustAudioSpeedTool.execute(
        { audioPath: "/a.wav", speed: 2.0 },
        makeCtx(),
      );

      expect(result.success).toBe(true);
      expect(mocks.adjustAudioSpeed).toHaveBeenCalledWith(
        "/a.wav",
        2.0,
        true,
        undefined,
      );
      const data = result.data as { outputPath: string };
      expect(data.outputPath).toBe("/test/cache/speed_2x.wav");
    });

    it("9. 默认 preservePitch 为 true", async () => {
      mocks.adjustAudioSpeed.mockResolvedValue({
        success: true,
        outputPath: "/test/cache/out.wav",
        metadata: { speed: 1.5, preservePitch: true },
      });

      await adjustAudioSpeedTool.execute(
        { audioPath: "/a.wav", speed: 1.5 },
        makeCtx(),
      );

      // 验证未传 preservePitch 时默认为 true
      expect(mocks.adjustAudioSpeed).toHaveBeenCalledWith(
        "/a.wav",
        1.5,
        true,
        undefined,
      );
    });
  });

  // ============= normalize_audio =============
  describe("normalize_audio", () => {
    it("10. 参数校验：targetLevel 超范围时返回错误", async () => {
      const result = await normalizeAudioTool.execute(
        { audioPath: "/a.wav", targetLevel: 10 },
        makeCtx(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("targetLevel");
      expect(result.error).toContain("-70");
      expect(result.error).toContain("0");
      expect(mocks.normalizeAudio).not.toHaveBeenCalled();
    });

    it("11. ffmpeg 不可用时返回降级提示", async () => {
      mocks.checkFfmpegAvailable.mockResolvedValue({ available: false });

      const result = await normalizeAudioTool.execute(
        { audioPath: "/a.wav" },
        makeCtx(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("ffmpeg 不可用");
      const data = result.data as { degraded: boolean; targetLevel: number };
      expect(data.degraded).toBe(true);
      expect(data.targetLevel).toBe(-16); // 默认值
    });

    it("12. 正常执行返回 outputPath", async () => {
      mocks.normalizeAudio.mockResolvedValue({
        success: true,
        outputPath: "/test/cache/normalized.wav",
        duration: 2000,
        metadata: { targetLevel: -16 },
      });

      const result = await normalizeAudioTool.execute(
        { audioPath: "/a.wav" },
        makeCtx(),
      );

      expect(result.success).toBe(true);
      // 验证默认 targetLevel=-16，outputPath 未指定时传 undefined
      expect(mocks.normalizeAudio).toHaveBeenCalledWith(
        "/a.wav",
        -16,
        undefined,
      );
      const data = result.data as { outputPath: string };
      expect(data.outputPath).toBe("/test/cache/normalized.wav");
    });
  });

  // ============= remove_noise =============
  describe("remove_noise", () => {
    it("13. 参数校验：intensity 超范围时返回错误", async () => {
      const result = await removeNoiseTool.execute(
        { audioPath: "/a.wav", intensity: 1.5 },
        makeCtx(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("intensity");
      expect(result.error).toContain("0-1");
      expect(mocks.removeNoise).not.toHaveBeenCalled();
    });

    it("14. ffmpeg 不可用时返回降级提示", async () => {
      mocks.checkFfmpegAvailable.mockResolvedValue({ available: false });

      const result = await removeNoiseTool.execute(
        { audioPath: "/a.wav" },
        makeCtx(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("ffmpeg 不可用");
      const data = result.data as {
        degraded: boolean;
        intensity: number;
        hasNoiseProfile: boolean;
      };
      expect(data.degraded).toBe(true);
      expect(data.intensity).toBe(0.5); // 默认值
      expect(data.hasNoiseProfile).toBe(false);
    });

    it("15. 正常执行返回 outputPath", async () => {
      mocks.removeNoise.mockResolvedValue({
        success: true,
        outputPath: "/test/cache/denoised.wav",
        duration: 1200,
        metadata: { intensity: 0.5 },
      });

      const result = await removeNoiseTool.execute(
        { audioPath: "/a.wav" },
        makeCtx(),
      );

      expect(result.success).toBe(true);
      // 验证默认 intensity=0.5，outputPath 未指定时传 undefined
      expect(mocks.removeNoise).toHaveBeenCalledWith(
        "/a.wav",
        0.5,
        undefined,
      );
      const data = result.data as { outputPath: string };
      expect(data.outputPath).toBe("/test/cache/denoised.wav");
    });
  });

  // ============= split_audio =============
  describe("split_audio", () => {
    it("16. 参数校验：segments 为空时返回错误", async () => {
      const result = await splitAudioTool.execute(
        { audioPath: "/a.wav", segments: [] },
        makeCtx(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("segments");
      expect(result.error).toContain("非空");
      expect(mocks.splitAudio).not.toHaveBeenCalled();
    });

    it("17. 参数校验：endTime <= startTime 时返回错误", async () => {
      const result = await splitAudioTool.execute(
        {
          audioPath: "/a.wav",
          segments: [{ startTime: 10, endTime: 5 }],
        },
        makeCtx(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("片段 1");
      expect(result.error).toContain("endTime 必须大于 startTime");
      expect(mocks.splitAudio).not.toHaveBeenCalled();
    });

    it("18. ffmpeg 不可用时返回降级提示", async () => {
      mocks.checkFfmpegAvailable.mockResolvedValue({ available: false });

      const result = await splitAudioTool.execute(
        {
          audioPath: "/a.wav",
          segments: [{ startTime: 0, endTime: 5 }],
        },
        makeCtx(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("ffmpeg 不可用");
      const data = result.data as { degraded: boolean; segmentCount: number };
      expect(data.degraded).toBe(true);
      expect(data.segmentCount).toBe(1);
    });

    it("19. 正常执行返回 outputPaths", async () => {
      mocks.splitAudio.mockResolvedValue({
        success: true,
        outputPaths: ["/test/cache/seg1.wav", "/test/cache/seg2.wav"],
        metadata: { segmentCount: 2 },
      });

      const result = await splitAudioTool.execute(
        {
          audioPath: "/a.wav",
          segments: [
            { startTime: 0, endTime: 5 },
            { startTime: 5, endTime: 10 },
          ],
        },
        makeCtx(),
      );

      expect(result.success).toBe(true);
      expect(mocks.splitAudio).toHaveBeenCalledWith(
        "/a.wav",
        [
          { startTime: 0, endTime: 5 },
          { startTime: 5, endTime: 10 },
        ],
        undefined,
      );
      const data = result.data as { outputPaths: string[] };
      expect(data.outputPaths).toEqual([
        "/test/cache/seg1.wav",
        "/test/cache/seg2.wav",
      ]);
    });
  });

  // ============= 导出完整性 =============
  describe("导出完整性", () => {
    it("20. 导出 5 个工具", () => {
      expect(audioTools).toHaveLength(5);
    });

    it("21. 所有工具 domain 为 audio", () => {
      for (const tool of audioTools) {
        expect(tool.domain).toBe("audio");
      }
    });

    it("22. 工具名正确", () => {
      const names = audioTools.map((t) => t.def.function.name);
      expect(names).toContain("mix_audio");
      expect(names).toContain("adjust_audio_speed");
      expect(names).toContain("normalize_audio");
      expect(names).toContain("remove_noise");
      expect(names).toContain("split_audio");
    });
  });
});
