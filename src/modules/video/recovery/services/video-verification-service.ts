import type { Result } from "@/domain/types";
import { fromAsyncThrowable } from "@/domain/types";
import type {
  VideoVerificationResult,
  VideoVerificationDetails,
} from "../types/video-recovery-types";
import {
  fileExists as httpFileExists,
  getFileInfo as httpGetFileInfo,
} from "@/shared/file-http";

const MIN_VIDEO_SIZE = 1024;
const MAX_VIDEO_SIZE = 500 * 1024 * 1024;
const VIDEO_CONTENT_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-msvideo",
];

export async function verifyVideoUrl(videoUrl: string): Promise<Result<VideoVerificationResult>> {
  return fromAsyncThrowable(async () => {
    const details: VideoVerificationDetails = {
      apiStatus: "unknown",
      urlAccessible: false,
      contentValid: false,
    };

    try {
      const response = await fetch(videoUrl, {
        method: "HEAD",
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        details.apiStatus = `HTTP ${response.status}`;
        details.errorMessage = `URL返回错误状态码: ${response.status}`;
        return {
          isValid: false,
          reason: `视频URL不可访问，HTTP状态码: ${response.status}`,
          details,
          confidence: "high",
        };
      }

      details.urlAccessible = true;
      details.contentType = response.headers.get("content-type") || "unknown";
      const contentLength = response.headers.get("content-length");
      details.contentSize = contentLength ? parseInt(contentLength, 10) : undefined;

      if (!VIDEO_CONTENT_TYPES.includes(details.contentType)) {
        details.contentValid = false;
        details.errorMessage = `内容类型不符合要求: ${details.contentType}`;
        return {
          isValid: false,
          reason: `视频内容类型不正确: ${details.contentType}`,
          details,
          confidence: "high",
        };
      }

      if (details.contentSize !== undefined) {
        if (details.contentSize < MIN_VIDEO_SIZE) {
          details.contentValid = false;
          details.errorMessage = `文件太小: ${details.contentSize} bytes`;
          return {
            isValid: false,
            reason: `视频文件过小 (${details.contentSize} bytes)，可能是错误内容`,
            details,
            confidence: "high",
          };
        }

        if (details.contentSize > MAX_VIDEO_SIZE) {
          details.contentValid = false;
          details.errorMessage = `文件太大: ${details.contentSize} bytes`;
          return {
            isValid: false,
            reason: `视频文件过大 (${(details.contentSize / 1024 / 1024).toFixed(2)} MB)`,
            details,
            confidence: "medium",
          };
        }
      }

      const getResponse = await fetch(videoUrl, {
        method: "GET",
        signal: AbortSignal.timeout(15000),
        headers: { Range: "bytes=0-8191" },
      });

      if (!getResponse.ok && getResponse.status !== 206) {
        details.contentValid = false;
        details.errorMessage = `无法读取视频内容，HTTP状态码: ${getResponse.status}`;
        return {
          isValid: false,
          reason: `无法读取视频内容，HTTP状态码: ${getResponse.status}`,
          details,
          confidence: "high",
        };
      }

      const buffer = await getResponse.arrayBuffer();
      const headerBytes = new Uint8Array(buffer);

      const hasVideoHeader = checkVideoHeader(headerBytes);
      if (!hasVideoHeader) {
        details.contentValid = false;
        details.errorMessage = "文件头部不包含视频标识";
        return {
          isValid: false,
          reason: "文件内容不是有效的视频格式",
          details,
          confidence: "high",
        };
      }

      details.contentValid = true;
      return {
        isValid: true,
        reason: "视频验证通过",
        details,
        confidence: "high",
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      details.errorMessage = errorMessage;
      details.apiStatus = "error";

      if (error instanceof DOMException && error.name === "AbortError") {
        return {
          isValid: false,
          reason: "视频验证超时",
          details,
          confidence: "medium",
        };
      }

      return {
        isValid: false,
        reason: `视频验证失败: ${errorMessage}`,
        details,
        confidence: "low",
      };
    }
  });
}

function checkVideoHeader(bytes: Uint8Array): boolean {
  if (bytes.length < 12) {
    return false;
  }

  const mp4Signatures = [
    [0x66, 0x74, 0x79, 0x70],
    [0x6D, 0x6F, 0x6F, 0x76],
    [0x6D, 0x64, 0x61, 0x74],
    [0x77, 0x69, 0x64, 0x65],
  ];

  for (const sig of mp4Signatures) {
    let match = true;
    for (let i = 0; i < sig.length; i++) {
      if (bytes[i] !== sig[i]) {
        match = false;
        break;
      }
    }
    if (match) return true;
  }

  const webmSignature = [0x1A, 0x45, 0xDF, 0xA3];
  let matchWebm = true;
  for (let i = 0; i < webmSignature.length; i++) {
    if (bytes[i] !== webmSignature[i]) {
      matchWebm = false;
      break;
    }
  }
  if (matchWebm) return true;

  return bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x00;
}

export async function verifyVideoFile(filePath: string): Promise<Result<boolean>> {
  return fromAsyncThrowable(async () => {
    const exists = await httpFileExists(filePath);
    if (!exists) return false;
    const info = await httpGetFileInfo(filePath);
    if (!info || !info.success || !info.size || info.size === 0) return false;
    return true;
  });
}

export async function verifyMultipleVideos(videoUrls: string[]): Promise<Result<Map<string, VideoVerificationResult>>> {
  return fromAsyncThrowable(async () => {
    const results = new Map<string, VideoVerificationResult>();

    const batchSize = 3;
    for (let i = 0; i < videoUrls.length; i += batchSize) {
      const batch = videoUrls.slice(i, i + batchSize);
      const batchPromises = batch.map(async (url) => {
        const result = await verifyVideoUrl(url);
        return { url, result };
      });

      const batchResults = await Promise.all(batchPromises);
      for (const { url, result } of batchResults) {
        if (result.ok) {
          results.set(url, result.value);
        }
      }
    }

    return results;
  });
}
