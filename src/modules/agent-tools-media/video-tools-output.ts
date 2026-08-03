/**
 * 视频后期处理工具 - 输出类（Video Post Output Tools）
 *
 * 从 video-post-tools.ts 拆分而来，包含工具：
 * - generate_thumbnail：生成视频缩略图
 * - compose_final_video：一键合成最终视频（多片段 + 背景音乐 + 字幕 + 转场）
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
  generateThumbnail,
  composeFinalVideo,
} from "@/modules/ffmpeg-runner";
import { ffmpegUnavailableError } from "./video-tools-shared";

/** 生成视频缩略图 */
export const generateThumbnailTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "generate_thumbnail",
      description:
        "从视频中截取一帧作为缩略图，可指定时间点与宽度。需要 ffmpeg 配置；未配置时返回降级提示与配置指引。",
      parameters: {
        type: "object",
        properties: {
          videoPath: { type: "string", description: "源视频文件路径" },
          timePoint: { type: "number", description: "截图时间点（秒），默认 1", default: 1 },
          width: { type: "number", description: "缩略图宽度（像素），默认 320", default: 320 },
          outputPath: { type: "string", description: "输出文件路径（可选，默认保存到缓存目录）" },
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
    const timePoint = Number(args.timePoint) || 1;
    const width = Number(args.width) || 320;

    // ffmpeg 可用性检查
    const ffmpeg = await checkFfmpegAvailable();
    if (!ffmpeg.available) {
      return {
        success: false,
        error: ffmpegUnavailableError(),
        data: { degraded: true, timePoint, width },
      };
    }

    // 调用 ffmpeg-service 生成缩略图
    const result = await generateThumbnail(
      videoPath,
      timePoint,
      width,
      args.outputPath ? String(args.outputPath) : undefined,
    );
    if (!result.success) {
      return {
        success: false,
        error: `缩略图生成失败：${result.error ?? "未知错误"}`,
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

/** 一键合成最终视频（多片段 + 背景音乐 + 字幕 + 转场） */
export const composeFinalVideoTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "compose_final_video",
      description:
        "一键合成最终视频：合并多段视频（带转场）→ 替换背景音乐 → 添加字幕。" +
        "适用于将多个分镜片段合成为最终成品视频。需要 ffmpeg 配置。",
      parameters: {
        type: "object",
        properties: {
          videoPaths: {
            type: "array",
            items: { type: "string", maxLength: 1024 },
            description: "视频片段路径数组（1-10 段）",
          },
          backgroundMusic: {
            type: "string",
            maxLength: 1024,
            description: "背景音乐文件路径（可选）",
          },
          subtitles: {
            type: "array",
            items: {
              type: "object",
              properties: {
                text: { type: "string", maxLength: 2000, description: "字幕文本" },
                startTime: { type: "number", minimum: 0, description: "开始时间（秒）" },
                endTime: { type: "number", minimum: 0, description: "结束时间（秒）" },
              },
            },
            description: "字幕数组（可选）",
          },
          transition: {
            type: "string",
            enum: ["none", "fade", "cut", "dissolve"],
            description: "转场类型，默认 none",
            default: "none",
          },
          transitionDuration: {
            type: "number",
            minimum: 0,
            maximum: 10,
            description: "转场时长（秒），默认 0.5",
            default: 0.5,
          },
          fontSize: { type: "number", minimum: 1, maximum: 500, description: "字幕字体大小，默认 24", default: 24 },
          fontColor: { type: "string", maxLength: 200, description: "字幕字体颜色，默认 #ffffff", default: "#ffffff" },
          outputPath: { type: "string", maxLength: 1024, description: "输出文件路径（可选，默认保存到缓存目录）" },
        },
        required: ["videoPaths"],
      },
    },
  },
  domain: "video-post",
  timeoutMs: TOOL_TIMEOUTS.videoTask,
  dangerLevel: "limited",
  async execute(args) {
    // 参数校验
    const videoPaths = Array.isArray(args.videoPaths)
      ? (args.videoPaths as unknown[]).map((p) => String(p))
      : [];
    if (videoPaths.length === 0 || videoPaths.length > 10) {
      return {
        success: false,
        error: "videoPaths 必须为 1-10 个视频文件路径",
      };
    }

    // ffmpeg 可用性检查
    const ffmpeg = await checkFfmpegAvailable();
    if (!ffmpeg.available) {
      return {
        success: false,
        error: ffmpegUnavailableError(),
        data: { degraded: true, videoCount: videoPaths.length },
      };
    }

    // 转换字幕数据
    const subtitles = args.subtitles
      ? (args.subtitles as unknown[]).map((s) => {
          const item = s as Record<string, unknown>;
          return {
            text: String(item?.text ?? ""),
            startTime: Number(item?.startTime),
            endTime: Number(item?.endTime),
          };
        })
      : undefined;

    // 调用 ffmpeg-service 合成最终视频
    const result = await composeFinalVideo(videoPaths, {
      backgroundMusic: args.backgroundMusic ? String(args.backgroundMusic) : undefined,
      subtitles,
      transition: args.transition ? String(args.transition) : undefined,
      transitionDuration: Number(args.transitionDuration) || undefined,
      fontSize: Number(args.fontSize) || undefined,
      fontColor: args.fontColor ? String(args.fontColor) : undefined,
      outputPath: args.outputPath ? String(args.outputPath) : undefined,
    });

    if (!result.success) {
      return {
        success: false,
        error: result.error ?? "合成最终视频失败",
        data: { stderr: result.stderr },
      };
    }

    return {
      success: true,
      data: {
        outputPath: result.outputPath,
        metadata: result.metadata,
      },
    };
  },
};
