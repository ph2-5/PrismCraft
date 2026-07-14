/**
 * 音频处理工具（Audio Tools）
 *
 * 包含工具（5 个）：
 * - mix_audio：混音（多轨合并）
 * - adjust_audio_speed：调整音频速度
 * - normalize_audio：音量标准化
 * - remove_noise：降噪
 * - split_audio：分割音频
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
  mixAudio,
  adjustAudioSpeed,
  normalizeAudio,
  removeNoise,
  splitAudio,
} from "@/modules/ffmpeg-runner";

// ============= 辅助函数（内部使用，不导出） =============

/** ffmpeg 不可用时的统一错误提示 */
function ffmpegUnavailableError(): string {
  return "ffmpeg 不可用。请在系统 PATH 中安装 ffmpeg，或在设置中配置 ffmpegPath。下载地址：https://ffmpeg.org/download.html";
}

// ============= 工具实现 =============

/** 1. 混音（多轨合并） */
export const mixAudioTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "mix_audio",
      description:
        "混音：将多个音频文件合并为一个多轨混音文件。支持为每个音轨单独设置音量（0-2，1 为原始音量）。" +
        "需要 ffmpeg 支持；若未配置 ffmpeg 将返回降级提示。" +
        "适用于：用户要求「合并音频」、「把多个音轨混在一起」、「背景音乐加人声」等场景。",
      parameters: {
        type: "object",
        properties: {
          audioPaths: {
            type: "array",
            items: { type: "string", maxLength: 2048 },
            description: "音频文件路径列表（必填，2-8 个）",
            minItems: 2,
            maxItems: 8,
          },
          outputPath: { type: "string", maxLength: 1024, description: "输出文件路径（可选，默认写入缓存目录）" },
          volumes: {
            type: "array",
            items: { type: "number", minimum: 0, maximum: 2 },
            description: "每个音轨的音量系数（0-2，默认全为 1）。长度需与 audioPaths 一致",
          },
        },
        required: ["audioPaths"],
      },
    },
  },
  domain: "audio",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.mutation,
  async execute(args) {
    const audioPaths = args.audioPaths;
    if (!Array.isArray(audioPaths) || audioPaths.length < 2 || audioPaths.length > 8) {
      return { success: false, error: "audioPaths 必须是 2-8 个音频文件路径的数组" };
    }
    const paths = audioPaths.map((p) => String(p));
    if (paths.some((p) => !p.trim())) {
      return { success: false, error: "audioPaths 中存在空路径" };
    }

    // 音量系数校验
    let volumes: number[] | undefined;
    if (args.volumes !== undefined) {
      if (!Array.isArray(args.volumes)) {
        return { success: false, error: "volumes 必须是数组" };
      }
      if (args.volumes.length !== paths.length) {
        return { success: false, error: `volumes 长度（${args.volumes.length}）需与 audioPaths（${paths.length}）一致` };
      }
      volumes = args.volumes.map((v) => {
        const n = Number(v);
        if (Number.isNaN(n) || n < 0 || n > 2) {
          throw new Error(`Invalid volume coefficient: ${v} (must be 0-2)`);
        }
        return n;
      });
    }
    const finalVolumes = volumes ?? paths.map(() => 1);

    // ffmpeg 可用性检查
    const ffmpeg = await checkFfmpegAvailable();
    if (!ffmpeg.available) {
      return {
        success: false,
        error: ffmpegUnavailableError(),
        data: { degraded: true, trackCount: paths.length },
      };
    }

    // 调用 ffmpeg-service 执行混音
    const result = await mixAudio(
      paths,
      finalVolumes,
      args.outputPath ? String(args.outputPath) : undefined,
    );
    if (!result.success) {
      return {
        success: false,
        error: `混音失败：${result.error ?? "未知错误"}`,
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

/** 2. 调整音频速度 */
export const adjustAudioSpeedTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "adjust_audio_speed",
      description:
        "调整音频播放速度（变速）。speed>1 加速、speed<1 减速。可选保持音调不变（preservePitch，默认 true）。" +
        "需要 ffmpeg 支持；若未配置 ffmpeg 将返回降级提示。" +
        "适用于：用户要求「加快音频」、「放慢音频」、「变速不变调」等场景。",
      parameters: {
        type: "object",
        properties: {
          audioPath: { type: "string", maxLength: 2048, description: "输入音频文件路径（必填）" },
          speed: {
            type: "number",
            minimum: 0.25,
            maximum: 4.0,
            description: "播放速度倍率（必填，0.25-4.0）。1 为原速，2 为两倍速，0.5 为半速",
          },
          outputPath: { type: "string", maxLength: 1024, description: "输出文件路径（可选，默认写入缓存目录）" },
          preservePitch: {
            type: "boolean",
            description: "是否保持音调不变（默认 true）。false 时变速会同时变调",
            default: true,
          },
        },
        required: ["audioPath", "speed"],
      },
    },
  },
  domain: "audio",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.mutation,
  async execute(args) {
    const audioPath = String(args.audioPath);
    if (!audioPath.trim()) {
      return { success: false, error: "audioPath 不能为空" };
    }
    const speed = Number(args.speed);
    if (Number.isNaN(speed) || speed < 0.25 || speed > 4.0) {
      return { success: false, error: "speed 必须在 0.25-4.0 之间" };
    }
    const preservePitch = args.preservePitch !== false;

    // ffmpeg 可用性检查
    const ffmpeg = await checkFfmpegAvailable();
    if (!ffmpeg.available) {
      return {
        success: false,
        error: ffmpegUnavailableError(),
        data: { degraded: true, speed, preservePitch },
      };
    }

    // 调用 ffmpeg-service 调整音频速度
    const result = await adjustAudioSpeed(
      audioPath,
      speed,
      preservePitch,
      args.outputPath ? String(args.outputPath) : undefined,
    );
    if (!result.success) {
      return {
        success: false,
        error: `调整音频速度失败：${result.error ?? "未知错误"}`,
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

/** 3. 音量标准化 */
export const normalizeAudioTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "normalize_audio",
      description:
        "音量标准化：将音频整体音量调整到目标响度级别（dB），使不同音频片段的响度一致。默认目标 -16 dB（EBU R128 推荐）。" +
        "需要 ffmpeg 支持；若未配置 ffmpeg 将返回降级提示。" +
        "适用于：用户要求「标准化音量」、「统一响度」、「音频太小说大」等场景。",
      parameters: {
        type: "object",
        properties: {
          audioPath: { type: "string", maxLength: 2048, description: "输入音频文件路径（必填）" },
          targetLevel: {
            type: "number",
            description: "目标响度级别（dB，默认 -16）。常见值：-23（EBU R128 广播）、-16（播客）、-14（音乐流媒体）",
            default: -16,
          },
          outputPath: { type: "string", maxLength: 1024, description: "输出文件路径（可选，默认写入缓存目录）" },
        },
        required: ["audioPath"],
      },
    },
  },
  domain: "audio",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.mutation,
  async execute(args) {
    const audioPath = String(args.audioPath);
    if (!audioPath.trim()) {
      return { success: false, error: "audioPath 不能为空" };
    }
    const targetLevel = args.targetLevel !== undefined ? Number(args.targetLevel) : -16;
    if (Number.isNaN(targetLevel) || targetLevel < -70 || targetLevel > 0) {
      return { success: false, error: "targetLevel 必须在 -70 到 0 dB 之间" };
    }

    // ffmpeg 可用性检查
    const ffmpeg = await checkFfmpegAvailable();
    if (!ffmpeg.available) {
      return {
        success: false,
        error: ffmpegUnavailableError(),
        data: { degraded: true, targetLevel },
      };
    }

    // 调用 ffmpeg-service 执行音量标准化
    const result = await normalizeAudio(
      audioPath,
      targetLevel,
      args.outputPath ? String(args.outputPath) : undefined,
    );
    if (!result.success) {
      return {
        success: false,
        error: `音量标准化失败：${result.error ?? "未知错误"}`,
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

/** 4. 降噪 */
export const removeNoiseTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "remove_noise",
      description:
        "音频降噪：去除背景噪声（如环境噪声、电流声、风噪）。可提供噪声样本文件以提升降噪效果，或仅按强度自动降噪。" +
        "需要 ffmpeg 支持；若未配置 ffmpeg 将返回降级提示。" +
        "适用于：用户要求「降噪」、「去除背景噪音」、「清理音频」等场景。",
      parameters: {
        type: "object",
        properties: {
          audioPath: { type: "string", maxLength: 2048, description: "输入音频文件路径（必填）" },
          noiseProfile: {
            type: "string",
            description: "噪声样本文件路径（可选）。提供一段纯噪声音频可显著提升降噪质量",
          },
          intensity: {
            type: "number",
            minimum: 0,
            maximum: 1,
            description: "降噪强度（0-1，默认 0.5）。值越大降噪越强，但可能损伤原声",
            default: 0.5,
          },
          outputPath: { type: "string", maxLength: 1024, description: "输出文件路径（可选，默认写入缓存目录）" },
        },
        required: ["audioPath"],
      },
    },
  },
  domain: "audio",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.mutation,
  async execute(args) {
    const audioPath = String(args.audioPath);
    if (!audioPath.trim()) {
      return { success: false, error: "audioPath 不能为空" };
    }
    const intensity = args.intensity !== undefined ? Number(args.intensity) : 0.5;
    if (Number.isNaN(intensity) || intensity < 0 || intensity > 1) {
      return { success: false, error: "intensity 必须在 0-1 之间" };
    }
    const noiseProfile = args.noiseProfile ? String(args.noiseProfile) : undefined;

    // ffmpeg 可用性检查
    const ffmpeg = await checkFfmpegAvailable();
    if (!ffmpeg.available) {
      return {
        success: false,
        error: ffmpegUnavailableError(),
        data: { degraded: true, intensity, hasNoiseProfile: !!noiseProfile },
      };
    }

    // 调用 ffmpeg-service 执行降噪
    const result = await removeNoise(
      audioPath,
      intensity,
      args.outputPath ? String(args.outputPath) : undefined,
    );
    if (!result.success) {
      return {
        success: false,
        error: `降噪失败：${result.error ?? "未知错误"}`,
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

/** 5. 分割音频 */
export const splitAudioTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "split_audio",
      description:
        "分割音频：按时间段将音频切分为多个片段。每个片段由 { startTime, endTime } 定义（单位：秒）。" +
        "需要 ffmpeg 支持；若未配置 ffmpeg 将返回降级提示。" +
        "适用于：用户要求「分割音频」、「截取音频片段」、「把音频切成几段」等场景。",
      parameters: {
        type: "object",
        properties: {
          audioPath: { type: "string", maxLength: 2048, description: "输入音频文件路径（必填）" },
          segments: {
            type: "array",
            items: {
              type: "object",
              properties: {
                startTime: { type: "number", minimum: 0, description: "片段起始时间（秒）" },
                endTime: { type: "number", minimum: 0, description: "片段结束时间（秒）" },
              },
              required: ["startTime", "endTime"],
            },
            description: "分割片段列表（必填）。每个元素定义一个片段的起止时间（秒）",
            minItems: 1,
          },
          outputPath: {
            type: "string",
            maxLength: 1024,
            description: "输出目录（可选，默认写入缓存目录的 audio-split 子目录）。每个片段生成一个文件",
          },
        },
        required: ["audioPath", "segments"],
      },
    },
  },
  domain: "audio",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.mutation,
  async execute(args) {
    const audioPath = String(args.audioPath);
    if (!audioPath.trim()) {
      return { success: false, error: "audioPath 不能为空" };
    }
    const segmentsInput = args.segments;
    if (!Array.isArray(segmentsInput) || segmentsInput.length === 0) {
      return { success: false, error: "segments 必须是非空数组" };
    }

    // 校验每个片段
    const segments: Array<{ startTime: number; endTime: number }> = [];
    for (let i = 0; i < segmentsInput.length; i++) {
      const seg = segmentsInput[i] as Record<string, unknown>;
      const startTime = Number(seg?.startTime);
      const endTime = Number(seg?.endTime);
      if (Number.isNaN(startTime) || startTime < 0) {
        return { success: false, error: `片段 ${i + 1} 的 startTime 非法` };
      }
      if (Number.isNaN(endTime) || endTime < 0) {
        return { success: false, error: `片段 ${i + 1} 的 endTime 非法` };
      }
      if (endTime <= startTime) {
        return { success: false, error: `片段 ${i + 1} 的 endTime 必须大于 startTime` };
      }
      segments.push({ startTime, endTime });
    }

    // ffmpeg 可用性检查
    const ffmpeg = await checkFfmpegAvailable();
    if (!ffmpeg.available) {
      return {
        success: false,
        error: ffmpegUnavailableError(),
        data: { degraded: true, segmentCount: segments.length },
      };
    }

    // 调用 ffmpeg-service 执行音频分割
    const result = await splitAudio(
      audioPath,
      segments,
      args.outputPath ? String(args.outputPath) : undefined,
    );
    if (!result.success) {
      return {
        success: false,
        error: `分割音频失败：${result.error ?? "未知错误"}`,
        data: {
          stderr: result.stderr,
          duration: result.duration,
          outputPaths: result.outputPaths,
        },
      };
    }
    return {
      success: true,
      data: {
        outputPath: result.outputPath,
        outputPaths: result.outputPaths,
        duration: result.duration,
        metadata: result.metadata,
      },
    };
  },
};

/** 导出所有音频处理工具 */
export const audioTools: ToolImpl[] = [
  mixAudioTool,
  adjustAudioSpeedTool,
  normalizeAudioTool,
  removeNoiseTool,
  splitAudioTool,
];
