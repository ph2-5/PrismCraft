/**
 * 视频后期处理工具 - 剪辑类（Video Post Edit Tools）
 *
 * 从 video-post-tools.ts 拆分而来，包含工具：
 * - merge_videos：合并多段视频（支持转场效果）
 * - trim_video：剪辑视频片段
 * - add_transition：添加转场效果
 * - add_subtitle：添加字幕
 * - adjust_video_speed：调整视频速度（加速/慢放）
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
  mergeVideos,
  trimVideo,
  addTransition,
  addSubtitle,
  adjustVideoSpeed,
} from "@/modules/ffmpeg-runner";
import { ffmpegUnavailableError } from "./video-tools-shared";

/** 合并多段视频 */
export const mergeVideosTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "merge_videos",
      description:
        "合并多段视频为一个文件，支持转场效果（none/fade/cut/dissolve）。需要 ffmpeg 配置；未配置时返回降级提示与配置指引。",
      parameters: {
        type: "object",
        properties: {
          videoPaths: {
            type: "array",
            items: { type: "string", maxLength: 1024 },
            description: "要合并的视频文件路径数组（2-10 个）",
          },
          outputPath: { type: "string", maxLength: 1024, description: "输出文件路径（可选，默认保存到缓存目录）" },
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
    if (videoPaths.length < 2 || videoPaths.length > 10) {
      return {
        success: false,
        error: "videoPaths 必须为 2-10 个视频文件路径",
      };
    }
    const transition = String(args.transition || "none");
    const transitionDuration = Number(args.transitionDuration) || 0.5;

    // ffmpeg 可用性检查
    const ffmpeg = await checkFfmpegAvailable();
    if (!ffmpeg.available) {
      return {
        success: false,
        error: ffmpegUnavailableError(),
        data: { degraded: true, videoCount: videoPaths.length, transition },
      };
    }

    // 调用 ffmpeg-service 合并视频
    const result = await mergeVideos(
      videoPaths,
      transition,
      transitionDuration,
      args.outputPath ? String(args.outputPath) : undefined,
    );
    if (!result.success) {
      return {
        success: false,
        error: `视频合并失败：${result.error ?? "未知错误"}`,
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

/** 剪辑视频片段 */
export const trimVideoTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "trim_video",
      description:
        "剪辑视频指定时间段的片段（startTime 到 endTime）。需要 ffmpeg 配置；未配置时返回降级提示与配置指引。",
      parameters: {
        type: "object",
        properties: {
          videoPath: { type: "string", description: "源视频文件路径" },
          startTime: { type: "number", description: "开始时间（秒）" },
          endTime: { type: "number", description: "结束时间（秒）" },
          outputPath: { type: "string", description: "输出文件路径（可选，默认保存到缓存目录）" },
        },
        required: ["videoPath", "startTime", "endTime"],
      },
    },
  },
  domain: "video-post",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.mutation,
  async execute(args) {
    // 参数校验
    const videoPath = String(args.videoPath);
    const startTime = Number(args.startTime);
    const endTime = Number(args.endTime);
    if (!isFinite(startTime) || !isFinite(endTime) || startTime < 0 || endTime <= startTime) {
      return {
        success: false,
        error: "startTime/endTime 无效：startTime 必须 >= 0，endTime 必须 > startTime",
      };
    }

    // ffmpeg 可用性检查
    const ffmpeg = await checkFfmpegAvailable();
    if (!ffmpeg.available) {
      return {
        success: false,
        error: ffmpegUnavailableError(),
        data: { degraded: true, startTime, endTime },
      };
    }

    // 调用 ffmpeg-service 剪辑视频
    const result = await trimVideo(
      videoPath,
      startTime,
      endTime,
      args.outputPath ? String(args.outputPath) : undefined,
    );
    if (!result.success) {
      return {
        success: false,
        error: `视频剪辑失败：${result.error ?? "未知错误"}`,
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

/** 添加转场效果 */
export const addTransitionTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "add_transition",
      description:
        "为视频添加转场效果（fade/cut/dissolve/wipe/zoom）。需要 ffmpeg 配置；未配置时返回降级提示与配置指引。",
      parameters: {
        type: "object",
        properties: {
          videoPath: { type: "string", description: "源视频文件路径" },
          transitionType: {
            type: "string",
            enum: ["fade", "cut", "dissolve", "wipe", "zoom"],
            description: "转场类型",
          },
          position: {
            type: "string",
            enum: ["start", "end", "between"],
            description: "转场位置",
          },
          duration: { type: "number", description: "转场时长（秒），默认 0.5", default: 0.5 },
          outputPath: { type: "string", description: "输出文件路径（可选，默认保存到缓存目录）" },
        },
        required: ["videoPath", "transitionType", "position"],
      },
    },
  },
  domain: "video-post",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.mutation,
  async execute(args) {
    // 参数校验
    const videoPath = String(args.videoPath);
    const transitionType = String(args.transitionType);
    const position = String(args.position);
    const duration = Number(args.duration) || 0.5;

    // ffmpeg 可用性检查
    const ffmpeg = await checkFfmpegAvailable();
    if (!ffmpeg.available) {
      return {
        success: false,
        error: ffmpegUnavailableError(),
        data: { degraded: true, transitionType, position, duration },
      };
    }

    // 调用 ffmpeg-service 添加转场效果
    const result = await addTransition(
      videoPath,
      transitionType,
      position,
      duration,
      args.outputPath ? String(args.outputPath) : undefined,
    );
    if (!result.success) {
      return {
        success: false,
        error: `添加转场效果失败：${result.error ?? "未知错误"}`,
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

/** 添加字幕 */
export const addSubtitleTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "add_subtitle",
      description:
        "为视频添加字幕。可传入 subtitles 数组自动生成 .srt，或直接提供 .srt 文件路径。需要 ffmpeg 配置；未配置时返回降级提示与配置指引。",
      parameters: {
        type: "object",
        properties: {
          videoPath: { type: "string", description: "源视频文件路径" },
          subtitles: {
            type: "array",
            items: {
              type: "object",
              properties: {
                text: { type: "string", description: "字幕文本" },
                startTime: { type: "number", description: "开始时间（秒）" },
                endTime: { type: "number", description: "结束时间（秒）" },
              },
            },
            description: "字幕数组（与 subtitlePath 二选一）",
          },
          subtitlePath: { type: "string", description: "已存在的 .srt 文件路径（提供则直接使用，忽略 subtitles）" },
          fontSize: { type: "number", description: "字体大小，默认 24", default: 24 },
          fontColor: { type: "string", description: "字体颜色（十六进制），默认 #ffffff", default: "#ffffff" },
          position: {
            type: "string",
            enum: ["bottom", "center", "top"],
            description: "字幕位置，默认 bottom",
            default: "bottom",
          },
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
    // 参数校验：subtitles 或 subtitlePath 至少一项
    const videoPath = String(args.videoPath);
    const subtitlePath = args.subtitlePath ? String(args.subtitlePath) : undefined;
    const subtitlesRaw = Array.isArray(args.subtitles) ? (args.subtitles as unknown[]) : [];

    if (!subtitlePath && subtitlesRaw.length === 0) {
      return {
        success: false,
        error: "必须提供 subtitles 数组或 subtitlePath（.srt 文件路径）之一",
      };
    }

    // 转换字幕数据为 ffmpeg-service 期望的类型
    const subtitles = subtitlesRaw.map((s) => {
      const item = s as Record<string, unknown>;
      return {
        text: String(item?.text ?? ""),
        startTime: Number(item?.startTime),
        endTime: Number(item?.endTime),
      };
    });

    const fontSize = Number(args.fontSize) || 24;
    const fontColor = String(args.fontColor || "#ffffff");
    const position = String(args.position || "bottom");

    // ffmpeg 可用性检查
    const ffmpeg = await checkFfmpegAvailable();
    if (!ffmpeg.available) {
      return {
        success: false,
        error: ffmpegUnavailableError(),
        data: { degraded: true, subtitleCount: subtitles.length, subtitlePath },
      };
    }

    // 调用 ffmpeg-service 添加字幕
    const result = await addSubtitle(videoPath, subtitles, {
      fontSize,
      fontColor,
      position,
      subtitlePath,
      outputPath: args.outputPath ? String(args.outputPath) : undefined,
    });
    if (!result.success) {
      return {
        success: false,
        error: `字幕添加失败：${result.error ?? "未知错误"}`,
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

/** 调整视频速度 */
export const adjustVideoSpeedTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "adjust_video_speed",
      description:
        "调整视频播放速度（加速/慢放），速度范围 0.25-4.0。可选保留音频音调。需要 ffmpeg 配置；未配置时返回降级提示与配置指引。",
      parameters: {
        type: "object",
        properties: {
          videoPath: { type: "string", maxLength: 1024, description: "源视频文件路径" },
          speed: { type: "number", minimum: 0.25, maximum: 4.0, description: "速度倍数（0.25-4.0），<1 慢放，>1 加速" },
          outputPath: { type: "string", maxLength: 1024, description: "输出文件路径（可选，默认保存到缓存目录）" },
          preserveAudio: { type: "boolean", description: "是否保留音频音调，默认 true", default: true },
        },
        required: ["videoPath", "speed"],
      },
    },
  },
  domain: "video-post",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.mutation,
  async execute(args) {
    // 参数校验
    const videoPath = String(args.videoPath);
    const speed = Number(args.speed);
    if (!isFinite(speed) || speed < 0.25 || speed > 4.0) {
      return {
        success: false,
        error: "speed 必须在 0.25 - 4.0 范围内",
      };
    }
    const preserveAudio = args.preserveAudio !== false;

    // ffmpeg 可用性检查
    const ffmpeg = await checkFfmpegAvailable();
    if (!ffmpeg.available) {
      return {
        success: false,
        error: ffmpegUnavailableError(),
        data: { degraded: true, speed, preserveAudio },
      };
    }

    // 调用 ffmpeg-service 调整视频速度
    const result = await adjustVideoSpeed(
      videoPath,
      speed,
      preserveAudio,
      args.outputPath ? String(args.outputPath) : undefined,
    );
    if (!result.success) {
      return {
        success: false,
        error: `视频变速失败：${result.error ?? "未知错误"}`,
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
