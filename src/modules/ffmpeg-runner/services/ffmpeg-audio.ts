/**
 * ffmpeg 音频操作（5 个高级 API）
 *
 * - mixAudio：混音（多轨合并）
 * - adjustAudioSpeed：调整音频速度
 * - normalizeAudio：音量标准化
 * - removeNoise：降噪
 * - splitAudio：分割音频
 *
 * 所有方法返回 Result<T> 模式：{ ok: true, value } | { ok: false, error }
 * 失败不抛异常，由调用方决定如何处理。
 */

import { executeFfmpegCommand, resolveOutputPath } from "./ffmpeg-core";
import { buildAtempoChain } from "./ffmpeg-helpers";
import type { FfmpegResult } from "./ffmpeg-types";

/**
 * 混音（多轨合并）
 *
 * ffmpeg 命令：ffmpeg -i input1 -i input2 -filter_complex amix=inputs=N:duration=longest -y output
 */
export async function mixAudio(
  audioPaths: string[],
  volumes: number[],
  outputPath?: string,
): Promise<FfmpegResult> {
  if (audioPaths.length < 2) {
    return { success: false, error: "至少需要 2 个音频文件" };
  }

  try {
    const outPath = await resolveOutputPath(outputPath, "audio-mix", "mixed.wav");

    // 构建 ffmpeg 参数
    const args: string[] = [];
    for (const p of audioPaths) {
      args.push("-i", p);
    }

    // 构建 amix filter，含音量调整
    const inputs = audioPaths.length;
    const filterParts = audioPaths.map((_, i) => `[${i}:a]volume=${volumes[i] ?? 1}[a${i}]`);
    const mixInputs = audioPaths.map((_, i) => `[a${i}]`).join("");
    filterParts.push(`${mixInputs}amix=inputs=${inputs}:duration=longest[aout]`);

    args.push("-filter_complex", filterParts.join(";"), "-map", "[aout]", "-y", outPath);

    const result = await executeFfmpegCommand(args);
    return {
      ...result,
      outputPath: result.success ? outPath : undefined,
      metadata: { trackCount: audioPaths.length, volumes },
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 调整音频速度
 *
 * ffmpeg 命令：ffmpeg -i input -filter:a "atempo=2.0" -y output
 * 注意：atempo 范围 0.5-2.0，超出范围需链式调用
 */
export async function adjustAudioSpeed(
  audioPath: string,
  speed: number,
  preservePitch: boolean = true,
  outputPath?: string,
): Promise<FfmpegResult> {
  try {
    const outPath = await resolveOutputPath(outputPath, "audio-speed", `speed_${speed}x.wav`);

    const args: string[] = ["-i", audioPath];

    if (preservePitch) {
      // atempo 范围 0.5-2.0，超出范围需链式调用
      const atempoChain = buildAtempoChain(speed);
      args.push("-filter:a", atempoChain);
    } else {
      // 变速不变调：使用 asetrate
      args.push("-filter:a", `asetrate=44100*${speed},aresample=44100`);
    }

    args.push("-y", outPath);

    const result = await executeFfmpegCommand(args);
    return {
      ...result,
      outputPath: result.success ? outPath : undefined,
      metadata: { speed, preservePitch },
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 音量标准化
 *
 * ffmpeg 命令：ffmpeg -i input -af loudnorm=I=-16:TP=-1.5:LRA=11 -y output
 */
export async function normalizeAudio(
  audioPath: string,
  targetLevel: number = -16,
  outputPath?: string,
): Promise<FfmpegResult> {
  try {
    const outPath = await resolveOutputPath(outputPath, "audio-normalize", `normalized_${targetLevel}dB.wav`);

    const args = [
      "-i", audioPath,
      "-af", `loudnorm=I=${targetLevel}:TP=-1.5:LRA=11`,
      "-ar", "44100",
      "-y", outPath,
    ];

    const result = await executeFfmpegCommand(args);
    return {
      ...result,
      outputPath: result.success ? outPath : undefined,
      metadata: { targetLevel },
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 降噪
 *
 * ffmpeg 命令：ffmpeg -i input -af "highpass=f=200,lowpass=f=3000" -y output
 * 高级降噪可用 afftdn 滤镜
 */
export async function removeNoise(
  audioPath: string,
  intensity: number = 0.5,
  outputPath?: string,
): Promise<FfmpegResult> {
  try {
    const outPath = await resolveOutputPath(outputPath, "audio-denoise", `denoised_${intensity}.wav`);

    // afftdn 降噪强度 0-97（映射 0-1 到 0-48）
    const denoiseStrength = Math.round(intensity * 48);
    const args = [
      "-i", audioPath,
      "-af", `afftdn=nr=${denoiseStrength}:nf=-25`,
      "-ar", "44100",
      "-y", outPath,
    ];

    const result = await executeFfmpegCommand(args);
    return {
      ...result,
      outputPath: result.success ? outPath : undefined,
      metadata: { intensity },
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 分割音频
 *
 * ffmpeg 命令（每个片段）：ffmpeg -i input -ss START -to END -c copy -y output
 */
export async function splitAudio(
  audioPath: string,
  segments: Array<{ startTime: number; endTime: number }>,
  outputDir?: string,
): Promise<FfmpegResult> {
  try {
    const dir = outputDir ?? (await resolveOutputPath(undefined, "audio-split", "segment")).replace(/\/[^/]+$/, "");

    const outputPaths: string[] = [];

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]!;
      const segPath = `${dir}/segment_${i + 1}_${seg.startTime}s-${seg.endTime}s.wav`;
      const args = [
        "-i", audioPath,
        "-ss", String(seg.startTime),
        "-to", String(seg.endTime),
        "-c", "copy",
        "-y", segPath,
      ];
      const result = await executeFfmpegCommand(args);
      if (!result.success) {
        return {
          success: false,
          error: `分割第 ${i + 1} 段失败：${result.error}`,
          outputPaths,
        };
      }
      outputPaths.push(segPath);
    }

    return {
      success: true,
      outputPaths,
      metadata: { segmentCount: segments.length },
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
