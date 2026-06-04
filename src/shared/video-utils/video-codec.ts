export type VideoCodec = "h264" | "h265" | "vp8" | "vp9" | "av1" | "unknown";
export type AudioCodec = "aac" | "mp3" | "opus" | "vorbis" | "unknown";
export type ContainerFormat = "mp4" | "webm" | "mov" | "avi" | "mkv" | "unknown";

import { errorLogger } from "@/shared/error-logger";

export interface VideoCodecInfo {
  container: ContainerFormat;
  videoCodec: VideoCodec;
  audioCodec: AudioCodec;
  width: number;
  height: number;
  duration: number;
  fps: number;
  bitrate: number;
}

const CONTAINER_MIME_MAP: Record<string, ContainerFormat> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "video/x-msvideo": "avi",
  "video/x-matroska": "mkv",
};

const CODEC_FOURCC_MAP: Record<string, VideoCodec> = {
  avc1: "h264",
  avc3: "h264",
  h264: "h264",
  "x264": "h264",
  hev1: "h265",
  hvc1: "h265",
  hev: "h265",
  h265: "h265",
  "x265": "h265",
  vp80: "vp8",
  vp08: "vp8",
  vp90: "vp9",
  vp09: "vp9",
  av01: "av1",
};

function detectContainerFromMime(mimeType: string): ContainerFormat {
  return CONTAINER_MIME_MAP[mimeType.toLowerCase()] || "unknown";
}

function detectContainerFromExtension(fileName: string): ContainerFormat {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const extMap: Record<string, ContainerFormat> = {
    mp4: "mp4",
    m4v: "mp4",
    webm: "webm",
    mov: "mov",
    avi: "avi",
    mkv: "mkv",
  };
  return extMap[ext] || "unknown";
}

async function probeVideoElement(
  file: File,
): Promise<Partial<VideoCodecInfo>> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";

    const url = URL.createObjectURL(file);

    const timeout = setTimeout(() => {
      URL.revokeObjectURL(url);
      resolve({});
    }, 5000);

    video.onloadedmetadata = () => {
      clearTimeout(timeout);
      const info: Partial<VideoCodecInfo> = {
        width: video.videoWidth,
        height: video.videoHeight,
        duration: video.duration,
      };
      URL.revokeObjectURL(url);
      resolve(info);
    };

    video.onerror = () => {
      clearTimeout(timeout);
      URL.revokeObjectURL(url);
      resolve({});
    };

    video.src = url;
  });
}

async function probeVideoCodecFromBuffer(
  buffer: ArrayBuffer,
): Promise<VideoCodec> {
  const view = new Uint8Array(buffer);
  const text = new TextDecoder("ascii", { fatal: false }).decode(view);

  for (const [fourcc, codec] of Object.entries(CODEC_FOURCC_MAP)) {
    if (text.includes(fourcc)) {
      return codec;
    }
  }

  if (text.includes("avcC") || text.includes("AVCC")) return "h264";
  if (text.includes("hvcC") || text.includes("HVCC")) return "h265";
  if (text.includes("vpcC") || text.includes("VPCC")) return "vp9";
  if (text.includes("av1C")) return "av1";

  return "unknown";
}

export async function detectVideoCodec(
  file: File,
): Promise<VideoCodecInfo> {
  const container =
    detectContainerFromMime(file.type) ||
    detectContainerFromExtension(file.name);

  const [elementInfo, codecResult] = await Promise.all([
    probeVideoElement(file),
    (async () => {
      try {
        const headerSize = Math.min(file.size, 64 * 1024);
        const header = await file.slice(0, headerSize).arrayBuffer();
        return await probeVideoCodecFromBuffer(header);
      } catch (e) {
        errorLogger.warn("[VideoCodec] Failed to probe video codec from buffer", e as Error);
        return "unknown" as VideoCodec;
      }
    })(),
  ]);

  let videoCodec: VideoCodec = codecResult;
  if (videoCodec === "unknown") {
    if (container === "webm") videoCodec = "vp9";
    else if (container === "mp4" || container === "mov") videoCodec = "h264";
  }

  let audioCodec: AudioCodec = "unknown";
  if (container === "mp4" || container === "mov") audioCodec = "aac";
  else if (container === "webm") audioCodec = "opus";

  return {
    container,
    videoCodec,
    audioCodec,
    width: elementInfo.width || 0,
    height: elementInfo.height || 0,
    duration: elementInfo.duration || 0,
    fps: 0,
    bitrate: 0,
  };
}

export function getVideoCodecLabel(codec: VideoCodec): string {
  const labels: Record<VideoCodec, string> = {
    h264: "H.264/AVC",
    h265: "H.265/HEVC",
    vp8: "VP8",
    vp9: "VP9",
    av1: "AV1",
    unknown: "未知",
  };
  return labels[codec];
}

export function getContainerLabel(container: ContainerFormat): string {
  const labels: Record<ContainerFormat, string> = {
    mp4: "MP4",
    webm: "WebM",
    mov: "MOV",
    avi: "AVI",
    mkv: "MKV",
    unknown: "未知",
  };
  return labels[container];
}
