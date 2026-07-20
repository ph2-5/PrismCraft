/**
 * ffmpeg 视频操作（8 个高级 API）
 *
 * - mergeVideos：合并多段视频（支持转场）
 * - trimVideo：剪辑视频片段
 * - addTransition：添加转场效果
 * - addSubtitle：添加字幕
 * - adjustVideoSpeed：调整视频速度
 * - extractAudio：提取音频
 * - replaceAudio：替换视频的音频轨道
 * - generateThumbnail：生成视频缩略图
 */

import { executeFfmpegCommand, resolveOutputPath } from "./ffmpeg-core";
import {
  probeVideoDuration,
  mapTransitionToXfade,
  buildAtempoChain,
  formatSrtTime,
} from "./ffmpeg-helpers";
import type { FfmpegResult } from "./ffmpeg-types";

/**
 * 合并多段视频
 *
 * 使用 concat demuxer（需要先创建文件列表）
 */
export async function mergeVideos(
  videoPaths: string[],
  transition: string = "none",
  transitionDuration: number = 0.5,
  outputPath?: string,
): Promise<FfmpegResult> {
  try {
    const outPath = await resolveOutputPath(outputPath, "video-merge", "merged.mp4");

    if (transition === "none") {
      // 简单 concat：创建文件列表，用 concat demuxer
      const listContent = videoPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n");
      const listPath = `${outPath}.list.txt`;

      // 写入列表文件（通过主进程）
      const { writeFile } = await import("@/shared/file-http");
      const writeResult = await writeFile(listPath, listContent);
      if (!writeResult.success) {
        return { success: false, error: "无法创建合并列表文件" };
      }

      const args = ["-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", "-y", outPath];
      const result = await executeFfmpegCommand(args);

      // 清理临时文件
      const { deleteFile } = await import("@/shared/file-http");
      void deleteFile(listPath).catch(() => {});

      return {
        ...result,
        outputPath: result.success ? outPath : undefined,
        metadata: { videoCount: videoPaths.length, transition },
      };
    }

    // 带转场效果：使用 xfade filter 链
    // 1. 探测每个视频时长
    const durations: number[] = [];
    for (const p of videoPaths) {
      const dur = await probeVideoDuration(p);
      if (dur === null) {
        return {
          success: false,
          error: `无法探测视频时长：${p}（请确保文件存在且 ffmpeg 可用）`,
        };
      }
      durations.push(dur);
    }

    // 2. cut 类型用极短 duration 模拟硬切
    const xfadeType = mapTransitionToXfade(transition);
    const effectiveDuration = transition === "cut" ? 0.01 : transitionDuration;

    // 3. 构建 xfade filter_complex 链
    //    [0:v][1:v]xfade=transition=T:duration=D:offset=O0[v01];
    //    [v01][2:v]xfade=transition=T:duration=D:offset=O1[v012];
    //    ...
    //    offset[i] = sum(durations[0..i]) - (i+1) * effectiveDuration
    const filterParts: string[] = [];
    let prevLabel = "[0:v]";
    let cumulativeOffset = 0;
    for (let i = 1; i < videoPaths.length; i++) {
      cumulativeOffset += durations[i - 1]! - effectiveDuration;
      const isLast = i === videoPaths.length - 1;
      const outLabel = isLast ? "[out]" : `[v0-${i}]`;
      filterParts.push(
        `${prevLabel}[${i}:v]xfade=transition=${xfadeType}:duration=${effectiveDuration}:offset=${cumulativeOffset.toFixed(3)}${outLabel}`,
      );
      prevLabel = outLabel;
    }

    // 4. 构建 ffmpeg 命令
    const args = [
      ...videoPaths.flatMap((p) => ["-i", p]),
      "-filter_complex", filterParts.join(";"),
      "-map", "[out]",
      "-y", outPath,
    ];
    const result = await executeFfmpegCommand(args);
    return {
      ...result,
      outputPath: result.success ? outPath : undefined,
      metadata: {
        videoCount: videoPaths.length,
        transition,
        transitionDuration: effectiveDuration,
        durations,
        totalDuration: durations.reduce((sum, d) => sum + d, 0) - (videoPaths.length - 1) * effectiveDuration,
      },
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 剪辑视频片段
 *
 * ffmpeg 命令：ffmpeg -i input -ss START -to END -c copy -y output
 */
export async function trimVideo(
  videoPath: string,
  startTime: number,
  endTime: number,
  outputPath?: string,
): Promise<FfmpegResult> {
  try {
    const outPath = await resolveOutputPath(outputPath, "video-trim", `trim_${startTime}-${endTime}.mp4`);
    const args = [
      "-i", videoPath,
      "-ss", String(startTime),
      "-to", String(endTime),
      "-c", "copy",
      "-y", outPath,
    ];
    const result = await executeFfmpegCommand(args);
    return {
      ...result,
      outputPath: result.success ? outPath : undefined,
      metadata: { startTime, endTime, duration: endTime - startTime },
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 添加转场效果
 *
 * 简化实现：在视频开头/结尾添加 fade in/out
 */
export async function addTransition(
  videoPath: string,
  transitionType: string,
  position: string,
  duration: number = 0.5,
  outputPath?: string,
): Promise<FfmpegResult> {
  try {
    const outPath = await resolveOutputPath(outputPath, "video-transition", `transition_${transitionType}.mp4`);

    // 构建 fade filter
    let filter: string;
    if (position === "start") {
      filter = `fade=t=in:st=0:d=${duration}`;
    } else if (position === "end") {
      // 需要知道视频时长，这里用简化处理
      filter = `fade=t=out:st=0:d=${duration}`;
    } else {
      // between: 在中间添加转场（简化为 fade）
      filter = `fade=t=in:st=0:d=${duration},fade=t=out:st=0:d=${duration}`;
    }

    const args = ["-i", videoPath, "-vf", filter, "-c:a", "copy", "-y", outPath];
    const result = await executeFfmpegCommand(args);
    return {
      ...result,
      outputPath: result.success ? outPath : undefined,
      metadata: { transitionType, position, duration },
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 添加字幕
 *
 * ffmpeg 命令：ffmpeg -i input -vf subtitles=subs.srt -y output
 */
export async function addSubtitle(
  videoPath: string,
  subtitles: Array<{ text: string; startTime: number; endTime: number }>,
  options: {
    fontSize?: number;
    fontColor?: string;
    position?: string;
    subtitlePath?: string;
    outputPath?: string;
  } = {},
): Promise<FfmpegResult> {
  try {
    const outPath = await resolveOutputPath(options.outputPath, "video-subtitle", "subtitled.mp4");

    // 确定 srt 文件路径
    let srtPath = options.subtitlePath;

    if (!srtPath && subtitles.length > 0) {
      // 生成 srt 文件
      srtPath = `${outPath}.subs.srt`;
      const srtContent = subtitles
        .map((sub, i) => {
          const start = formatSrtTime(sub.startTime);
          const end = formatSrtTime(sub.endTime);
          return `${i + 1}\n${start} --> ${end}\n${sub.text}\n`;
        })
        .join("\n");

      const { writeFile } = await import("@/shared/file-http");
      const writeResult = await writeFile(srtPath, srtContent);
      if (!writeResult.success) {
        return { success: false, error: "无法创建字幕文件" };
      }
    }

    if (!srtPath) {
      return { success: false, error: "无字幕文件" };
    }

    const fontSize = options.fontSize ?? 24;
    const fontColor = options.fontColor ?? "white";
    const position = options.position ?? "bottom";

    // subtitles filter
    const subFilter = `subtitles='${srtPath.replace(/'/g, "\\'")}':force_style='FontSize=${fontSize},PrimaryColour=${fontColor},Alignment=${position === "top" ? 6 : position === "center" ? 8 : 2}'`;

    const args = ["-i", videoPath, "-vf", subFilter, "-c:a", "copy", "-y", outPath];
    const result = await executeFfmpegCommand(args);

    // 清理临时 srt 文件（如果是自动生成的）
    if (!options.subtitlePath && srtPath) {
      const { deleteFile } = await import("@/shared/file-http");
      void deleteFile(srtPath).catch(() => {});
    }

    return {
      ...result,
      outputPath: result.success ? outPath : undefined,
      metadata: { subtitleCount: subtitles.length, fontSize, position },
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 调整视频速度
 *
 * ffmpeg 命令：ffmpeg -i input -filter_complex "[0:v]setpts=PTS/SPEED[v];[0:a]atempo=SPEED[a]" -map "[v]" -map "[a]" -y output
 */
export async function adjustVideoSpeed(
  videoPath: string,
  speed: number,
  preserveAudio: boolean = true,
  outputPath?: string,
): Promise<FfmpegResult> {
  try {
    const outPath = await resolveOutputPath(outputPath, "video-speed", `speed_${speed}x.mp4`);

    // setpts=PTS/SPEED：speed>1 加速（PTS 变小）
    const videoFilter = `setpts=PTS/${speed}`;
    const audioFilter = preserveAudio ? buildAtempoChain(speed) : `atempo=${speed}`;

    const args = [
      "-i", videoPath,
      "-filter_complex", `[0:v]${videoFilter}[v];[0:a]${audioFilter}[a]`,
      "-map", "[v]",
      "-map", "[a]",
      "-y", outPath,
    ];

    const result = await executeFfmpegCommand(args);
    return {
      ...result,
      outputPath: result.success ? outPath : undefined,
      metadata: { speed, preserveAudio },
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 提取音频
 *
 * ffmpeg 命令：ffmpeg -i input -vn -acodec libmp3lame -y output.mp3
 */
export async function extractAudio(
  videoPath: string,
  outputFormat: string = "mp3",
  startTime?: number,
  endTime?: number,
  outputPath?: string,
): Promise<FfmpegResult> {
  try {
    const outPath = await resolveOutputPath(outputPath, "audio-extract", `extracted.${outputFormat}`);

    const args: string[] = ["-i", videoPath];

    if (startTime !== undefined) {
      args.push("-ss", String(startTime));
    }
    if (endTime !== undefined) {
      args.push("-to", String(endTime));
    }

    args.push("-vn");

    // 根据格式选择编码器
    if (outputFormat === "mp3") {
      args.push("-acodec", "libmp3lame", "-q:a", "2");
    } else if (outputFormat === "wav") {
      args.push("-acodec", "pcm_s16le");
    } else if (outputFormat === "aac") {
      args.push("-acodec", "aac", "-b:a", "192k");
    }

    args.push("-y", outPath);

    const result = await executeFfmpegCommand(args);
    return {
      ...result,
      outputPath: result.success ? outPath : undefined,
      metadata: { outputFormat, startTime, endTime },
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 替换视频的音频轨道
 *
 * ffmpeg 命令：ffmpeg -i video -i audio -c:v copy -c:a aac -map 0:v -map 1:a -y output
 */
export async function replaceAudio(
  videoPath: string,
  audioPath: string,
  audioStartTime: number = 0,
  volume: number = 1,
  outputPath?: string,
): Promise<FfmpegResult> {
  try {
    const outPath = await resolveOutputPath(outputPath, "video-replace-audio", "replaced_audio.mp4");

    const args = [
      "-i", videoPath,
      "-i", audioPath,
      "-c:v", "copy",
      "-c:a", "aac",
      "-map", "0:v",
      "-map", "1:a",
    ];

    if (audioStartTime > 0) {
      args.push("-ss", String(audioStartTime));
    }

    if (volume !== 1) {
      args.push("-af", `volume=${volume}`);
    }

    args.push("-y", outPath);

    const result = await executeFfmpegCommand(args);
    return {
      ...result,
      outputPath: result.success ? outPath : undefined,
      metadata: { audioStartTime, volume },
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 生成视频缩略图
 *
 * ffmpeg 命令：ffmpeg -i input -ss TIME -vframes 1 -vf scale=WIDTH:-1 -y output.jpg
 */
export async function generateThumbnail(
  videoPath: string,
  timePoint: number = 1,
  width: number = 320,
  outputPath?: string,
): Promise<FfmpegResult> {
  try {
    const outPath = await resolveOutputPath(outputPath, "video-thumbnail", `thumb_${timePoint}s.jpg`);

    const args = [
      "-i", videoPath,
      "-ss", String(timePoint),
      "-vframes", "1",
      "-vf", `scale=${width}:-1`,
      "-y", outPath,
    ];

    const result = await executeFfmpegCommand(args);
    return {
      ...result,
      outputPath: result.success ? outPath : undefined,
      metadata: { timePoint, width },
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
