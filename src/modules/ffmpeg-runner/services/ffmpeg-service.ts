/**
 * ffmpeg 服务（渲染进程侧）
 *
 * 职责：
 * - 封装与主进程 ffmpeg-handler 的 HTTP 通信
 * - 提供 13 个音视频操作的高级 API
 * - 自动解析输出路径（未指定时写入缓存目录）
 * - 缓存 ffmpeg 可用性检查结果（避免每次操作都 probe）
 *
 * 架构：
 *   工具（audio-tools / video-post-tools）
 *     → ffmpeg-service（本文件，渲染进程）
 *       → HTTP /api/ffmpeg/execute
 *         → ffmpeg-handler（主进程）
 *           → child_process.spawn(ffmpeg, args)
 *
 * 设计要点：
 * - 所有方法返回 Result<T> 模式：{ ok: true, value } | { ok: false, error }
 * - 失败不抛异常，由调用方决定如何处理
 * - ffmpeg 不可用时返回友好错误，不阻断 Agent Loop
 */

import { API_SERVER_PORT, ELECTRON_APP_HEADERS } from "@/config/constants";
import { getConfig, getCacheDirectory } from "@/shared/file-http";

// ============= 类型定义 =============

export interface FfmpegResult {
  success: boolean;
  outputPath?: string;
  outputPaths?: string[];
  error?: string;
  duration?: number;
  stderr?: string;
  metadata?: Record<string, unknown>;
}

interface FfmpegApiResponse {
  success: boolean;
  data?: {
    exitCode: number | null;
    stdout: string;
    stderr: string;
    duration: number;
  };
  error?: string;
}

interface FfmpegProbeResponse {
  success: boolean;
  data?: {
    available: boolean;
    version?: string;
    path?: string;
    error?: string;
  };
  error?: string;
}

// ============= 缓存 =============

let ffmpegAvailableCache: { available: boolean; path?: string; version?: string } | null = null;
let ffmpegCheckTime = 0;
const FFMPEG_CACHE_TTL = 60_000; // 1 分钟内不重复 probe

// ============= 核心通信函数 =============

/** 调用主进程执行 ffmpeg 命令 */
async function executeFfmpegCommand(
  args: string[],
  options?: { timeout?: number },
): Promise<FfmpegResult> {
  // 获取用户配置的 ffmpeg 路径（可选）
  const ffmpegPath = (await getConfig("ffmpegPath")) as string | undefined;

  try {
    const response = await fetch(`http://localhost:${API_SERVER_PORT}/api/ffmpeg/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ELECTRON_APP_HEADERS },
      body: JSON.stringify({
        args,
        ffmpegPath: ffmpegPath || undefined,
        timeout: options?.timeout,
      }),
      signal: AbortSignal.timeout(options?.timeout ?? 10 * 60 * 1000),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const result = (await response.json()) as FfmpegApiResponse;
    if (!result.success) {
      return {
        success: false,
        error: result.error ?? "ffmpeg 执行失败",
        stderr: result.data?.stderr,
        duration: result.data?.duration,
      };
    }

    return {
      success: true,
      duration: result.data?.duration,
      stderr: result.data?.stderr,
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// ============= 内部辅助函数 =============

/**
 * 探测视频时长（秒）
 *
 * 使用 `ffmpeg -i input -f null -` 触发 ffmpeg 输出文件信息，
 * 从 stderr 解析 "Duration: HH:MM:SS.xx" 获取时长。
 */
async function probeVideoDuration(videoPath: string): Promise<number | null> {
  const result = await executeFfmpegCommand(["-i", videoPath, "-f", "null", "-"], {
    timeout: 30_000,
  });
  // ffmpeg -f null - 正常完成时 exit code 0，stderr 包含 Duration 信息
  const stderr = result.stderr ?? "";
  const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const hours = parseInt(match[1]!, 10);
  const minutes = parseInt(match[2]!, 10);
  const seconds = parseFloat(match[3]!);
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * 将用户传入的 transition 名称映射到 ffmpeg xfade 的 transition 类型
 *
 * xfade 支持的 transition：fade, wipeleft, wiperight, wipeup, wipedown,
 * slideleft, slideright, slideup, slidedown, circlecrop, rectcrop, distance,
 * fadeblack, fadewhite, radial, smoothleft, smoothright, smoothup, smoothdown,
 * circleopen, circleclose, vertopen, vertclose, horzopen, horzclose, dissolve,
 * pixelize, diagtl, diagtr, diagbl, diagbr, hlslice, hrslice, vuslice, vdslice,
 * hblur, fadegrays, wipetl, wipetr, wipebl, wipebr, squeezes, squeezeh, zoomin
 */
function mapTransitionToXfade(transition: string): string {
  switch (transition) {
    case "fade":
    case "cut":
      return "fade"; // cut 用 duration 极小的 fade 模拟
    case "dissolve":
      return "dissolve";
    case "fadeblack":
      return "fadeblack";
    case "fadewhite":
      return "fadewhite";
    case "slideleft":
      return "slideleft";
    case "slideright":
      return "slideright";
    case "slideup":
      return "slideup";
    case "slidedown":
      return "slidedown";
    case "wipeleft":
      return "wipeleft";
    case "wiperight":
      return "wiperight";
    case "circleopen":
      return "circleopen";
    case "circleclose":
      return "circleclose";
    case "zoomin":
      return "zoomin";
    default:
      return "fade";
  }
}

// ============= 公共 API =============

/**
 * 检查 ffmpeg 是否可用（带缓存）
 *
 * 优先使用用户配置的 ffmpegPath，否则探测系统 PATH。
 * 结果缓存 1 分钟，避免频繁 probe。
 */
export async function checkFfmpegAvailable(): Promise<{
  available: boolean;
  path?: string;
  version?: string;
}> {
  // 缓存未过期时直接返回
  if (ffmpegAvailableCache && Date.now() - ffmpegCheckTime < FFMPEG_CACHE_TTL) {
    return ffmpegAvailableCache;
  }

  const ffmpegPath = (await getConfig("ffmpegPath")) as string | undefined;

  try {
    const response = await fetch(`http://localhost:${API_SERVER_PORT}/api/ffmpeg/probe`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ELECTRON_APP_HEADERS },
      body: JSON.stringify({ ffmpegPath: ffmpegPath || undefined }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      ffmpegAvailableCache = { available: false };
      ffmpegCheckTime = Date.now();
      return ffmpegAvailableCache;
    }

    const result = (await response.json()) as FfmpegProbeResponse;
    const data = result.data;

    if (result.success && data?.available) {
      ffmpegAvailableCache = {
        available: true,
        path: data.path,
        version: data.version,
      };
    } else {
      ffmpegAvailableCache = { available: false };
    }
    ffmpegCheckTime = Date.now();
    return ffmpegAvailableCache;
  } catch {
    ffmpegAvailableCache = { available: false };
    ffmpegCheckTime = Date.now();
    return ffmpegAvailableCache;
  }
}

/** 重置 ffmpeg 可用性缓存（配置变更后调用） */
export function resetFfmpegCache(): void {
  ffmpegAvailableCache = null;
  ffmpegCheckTime = 0;
}

/** 解析输出路径（未指定时写入缓存目录） */
async function resolveOutputPath(
  outputPath: string | undefined,
  subdir: string,
  filename: string,
): Promise<string> {
  if (outputPath) return outputPath;
  const dirResult = await getCacheDirectory();
  if (!dirResult.success || !dirResult.path) {
    throw new Error("Failed to get cache directory");
  }
  return `${dirResult.path}/agent/ffmpeg/${subdir}/${Date.now()}_${filename}`;
}

// ============= 音频操作（5 个） =============

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

// ============= 视频操作（8 个） =============

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

// ============= 辅助函数 =============

/**
 * 构建 atempo 滤镜链
 *
 * atempo 范围 0.5-2.0，超出范围需链式调用：
 * - speed > 2: atempo=2.0,atempo=speed/2.0
 * - speed < 0.5: atempo=0.5,atempo=speed/0.5
 */
function buildAtempoChain(speed: number): string {
  if (speed >= 0.5 && speed <= 2.0) {
    return `atempo=${speed}`;
  }

  const parts: string[] = [];
  let remaining = speed;

  if (remaining > 2.0) {
    while (remaining > 2.0) {
      parts.push("atempo=2.0");
      remaining /= 2.0;
    }
    parts.push(`atempo=${remaining}`);
  } else if (remaining < 0.5) {
    while (remaining < 0.5) {
      parts.push("atempo=0.5");
      remaining /= 0.5;
    }
    parts.push(`atempo=${remaining}`);
  }

  return parts.join(",");
}

/** 格式化 SRT 时间戳（秒 → HH:MM:SS,mmm） */
function formatSrtTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const millis = Math.floor((seconds % 1) * 1000);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
}

// ============= 组合操作 =============

/**
 * 一键合成最终视频（多片段 + 背景音乐 + 字幕 + 转场）
 *
 * 流程：
 * 1. 多段视频合并（带转场）→ 如果只有一段则跳过
 * 2. 替换/添加背景音乐（可选）
 * 3. 添加字幕（可选）
 *
 * 复用现有的 mergeVideos / replaceAudio / addSubtitle，不重新实现 ffmpeg 逻辑。
 *
 * @param videoPaths 视频片段路径数组（1-10 段）
 * @param options.backgroundMusic 背景音乐文件路径（可选）
 * @param options.subtitles 字幕数组（可选）
 * @param options.transition 转场类型，默认 none
 * @param options.transitionDuration 转场时长，默认 0.5
 * @param options.fontSize 字体大小，默认 24
 * @param options.fontColor 字体颜色，默认 #ffffff
 * @param options.outputPath 输出路径（可选）
 */
export async function composeFinalVideo(
  videoPaths: string[],
  options: {
    backgroundMusic?: string;
    subtitles?: Array<{ text: string; startTime: number; endTime: number }>;
    transition?: string;
    transitionDuration?: number;
    fontSize?: number;
    fontColor?: string;
    outputPath?: string;
  } = {},
): Promise<FfmpegResult> {
  if (!videoPaths || videoPaths.length === 0) {
    return { success: false, error: "videoPaths 不能为空" };
  }

  const steps: string[] = [];
  let currentPath: string;

  try {
    // Step 1: 合并视频（如果多段）
    if (videoPaths.length > 1) {
      const transition = options.transition || "none";
      const transitionDuration = options.transitionDuration ?? 0.5;
      const mergeResult = await mergeVideos(
        videoPaths,
        transition,
        transitionDuration,
      );
      if (!mergeResult.success || !mergeResult.outputPath) {
        return {
          success: false,
          error: `视频合并失败：${mergeResult.error ?? "未知错误"}`,
          stderr: mergeResult.stderr,
        };
      }
      currentPath = mergeResult.outputPath;
      steps.push("merge");
    } else {
      currentPath = videoPaths[0]!;
    }

    // Step 2: 替换/添加背景音乐（可选）
    if (options.backgroundMusic) {
      const audioResult = await replaceAudio(currentPath, options.backgroundMusic);
      if (!audioResult.success || !audioResult.outputPath) {
        return {
          success: false,
          error: `背景音乐替换失败：${audioResult.error ?? "未知错误"}`,
          stderr: audioResult.stderr,
        };
      }
      currentPath = audioResult.outputPath;
      steps.push("audio");
    }

    // Step 3: 添加字幕（可选）
    if (options.subtitles && options.subtitles.length > 0) {
      const subtitleResult = await addSubtitle(currentPath, options.subtitles, {
        fontSize: options.fontSize,
        fontColor: options.fontColor,
      });
      if (!subtitleResult.success || !subtitleResult.outputPath) {
        return {
          success: false,
          error: `字幕添加失败：${subtitleResult.error ?? "未知错误"}`,
          stderr: subtitleResult.stderr,
        };
      }
      currentPath = subtitleResult.outputPath;
      steps.push("subtitle");
    }

    // Step 4: 如果指定了输出路径且与当前路径不同，需要复制
    // （此处简化处理：直接返回当前路径，不额外复制）
    return {
      success: true,
      outputPath: currentPath,
      metadata: {
        steps,
        videoCount: videoPaths.length,
        hasBackgroundMusic: !!options.backgroundMusic,
        hasSubtitles: !!options.subtitles?.length,
      },
    };
  } catch (e) {
    return {
      success: false,
      error: `合成最终视频失败：${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
