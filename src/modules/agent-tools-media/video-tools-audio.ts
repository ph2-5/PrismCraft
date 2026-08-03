/**
 * 视频后期处理工具 - 音频类（Video Post Audio Tools）
 *
 * 从 video-post-tools.ts 拆分而来，包含工具：
 * - extract_audio：提取音频
 * - replace_audio：替换视频的音频轨道
 *
 * 设计要点：
 * - 通过 ffmpeg-service 调用主进程 ffmpeg-handler 执行实际 ffmpeg 命令
 * - ffmpeg 不可用时返回友好降级提示与配置建议
 * - 输出路径未指定时由 ffmpeg-service 自动写入缓存目录
 */

import type { ToolImpl } from "@/domain/types/agent-tools";
import { TOOL_TIMEOUTS } from "@/shared/constants/tool-timeouts";
import {
  checkFfmpegAvailable,
  extractAudio,
  replaceAudio,
} from "@/modules/ffmpeg-runner";
import { ffmpegUnavailableError } from "./video-tools-shared";

/** 提取音频 */
export const extractAudioTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "extract_audio",
      description:
        "从视频中提取音频，支持 mp3/wav/aac 格式，可指定时间段。需要 ffmpeg 配置；未配置时返回降级提示与配置指引。",
      parameters: {
        type: "object",
        properties: {
          videoPath: { type: "string", maxLength: 1024, description: "源视频文件路径" },
          outputFormat: {
            type: "string",
            enum: ["mp3", "wav", "aac"],
            description: "输出音频格式，默认 mp3",
            default: "mp3",
          },
          outputPath: { type: "string", maxLength: 1024, description: "输出文件路径（可选，默认保存到缓存目录）" },
          startTime: { type: "number", minimum: 0, description: "提取开始时间（秒，可选）" },
          endTime: { type: "number", minimum: 0, description: "提取结束时间（秒，可选）" },
        },
        required: ["videoPath"],
      },
    },
  },
  domain: "video-post",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.mutation,
  async execute(args) {
    // 参数校验
    const videoPath = String(args.videoPath);
    const outputFormat = String(args.outputFormat || "mp3");
    const startTime = args.startTime !== undefined ? Number(args.startTime) : undefined;
    const endTime = args.endTime !== undefined ? Number(args.endTime) : undefined;

    // ffmpeg 可用性检查
    const ffmpeg = await checkFfmpegAvailable();
    if (!ffmpeg.available) {
      return {
        success: false,
        error: ffmpegUnavailableError(),
        data: { degraded: true, outputFormat, startTime, endTime },
      };
    }

    // 调用 ffmpeg-service 提取音频
    const result = await extractAudio(
      videoPath,
      outputFormat,
      startTime,
      endTime,
      args.outputPath ? String(args.outputPath) : undefined,
    );
    if (!result.success) {
      return {
        success: false,
        error: `音频提取失败：${result.error ?? "未知错误"}`,
        data: { stderr: result.stderr, duration: result.duration },
      };
    }
    return {
      success: true,
      data: {
        outputPath: result.outputPath,
        duration: result.duration,
        metadata: result.metadata,
      },
    };
  },
};

/** 替换音频轨道 */
export const replaceAudioTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "replace_audio",
      description:
        "替换视频的音频轨道，可指定音频开始时间与音量。需要 ffmpeg 配置；未配置时返回降级提示与配置指引。",
      parameters: {
        type: "object",
        properties: {
          videoPath: { type: "string", description: "源视频文件路径" },
          audioPath: { type: "string", description: "新音频文件路径" },
          outputPath: { type: "string", description: "输出文件路径（可选，默认保存到缓存目录）" },
          audioStartTime: { type: "number", description: "音频开始时间（秒），默认 0", default: 0 },
          volume: { type: "number", description: "音量倍数（0-2），默认 1", default: 1 },
        },
        required: ["videoPath", "audioPath"],
      },
    },
  },
  domain: "video-post",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.mutation,
  async execute(args) {
    // 参数校验
    const videoPath = String(args.videoPath);
    const audioPath = String(args.audioPath);
    const audioStartTime = Number(args.audioStartTime) || 0;
    const volume = Number(args.volume);
    if (!isFinite(volume) || volume < 0 || volume > 2) {
      return {
        success: false,
        error: "volume 必须在 0 - 2 范围内",
      };
    }

    // ffmpeg 可用性检查
    const ffmpeg = await checkFfmpegAvailable();
    if (!ffmpeg.available) {
      return {
        success: false,
        error: ffmpegUnavailableError(),
        data: { degraded: true, audioStartTime, volume },
      };
    }

    // 调用 ffmpeg-service 替换音频轨道
    const result = await replaceAudio(
      videoPath,
      audioPath,
      audioStartTime,
      volume,
      args.outputPath ? String(args.outputPath) : undefined,
    );
    if (!result.success) {
      return {
        success: false,
        error: `音频替换失败：${result.error ?? "未知错误"}`,
        data: { stderr: result.stderr, duration: result.duration },
      };
    }
    return {
      success: true,
      data: {
        outputPath: result.outputPath,
        duration: result.duration,
        metadata: result.metadata,
      },
    };
  },
};
