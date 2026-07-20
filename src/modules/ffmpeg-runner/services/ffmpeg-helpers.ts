/**
 * ffmpeg 内部辅助函数
 *
 * 包含：
 * - probeVideoDuration：探测视频时长（秒）
 * - mapTransitionToXfade：转场名映射到 ffmpeg xfade transition 类型
 * - buildAtempoChain：构建 atempo 滤镜链（处理超出 0.5-2.0 范围的速度）
 * - formatSrtTime：格式化 SRT 时间戳（秒 → HH:MM:SS,mmm）
 *
 * 这些函数仅在同模块内被使用，不对外导出。
 */

import { executeFfmpegCommand } from "./ffmpeg-core";

/**
 * 探测视频时长（秒）
 *
 * 使用 `ffmpeg -i input -f null -` 触发 ffmpeg 输出文件信息，
 * 从 stderr 解析 "Duration: HH:MM:SS.xx" 获取时长。
 */
export async function probeVideoDuration(videoPath: string): Promise<number | null> {
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
const XFADE_TRANSITION_MAP: Record<string, string> = {
  fade: "fade",
  cut: "fade", // cut 用 duration 极小的 fade 模拟
  dissolve: "dissolve",
  fadeblack: "fadeblack",
  fadewhite: "fadewhite",
  slideleft: "slideleft",
  slideright: "slideright",
  slideup: "slideup",
  slidedown: "slidedown",
  wipeleft: "wipeleft",
  wiperight: "wiperight",
  circleopen: "circleopen",
  circleclose: "circleclose",
  zoomin: "zoomin",
};

export function mapTransitionToXfade(transition: string): string {
  return XFADE_TRANSITION_MAP[transition] ?? "fade";
}

/**
 * 构建 atempo 滤镜链
 *
 * atempo 范围 0.5-2.0，超出范围需链式调用：
 * - speed > 2: atempo=2.0,atempo=speed/2.0
 * - speed < 0.5: atempo=0.5,atempo=speed/0.5
 */
export function buildAtempoChain(speed: number): string {
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
export function formatSrtTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const millis = Math.floor((seconds % 1) * 1000);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
}
