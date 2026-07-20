/**
 * ffmpeg 类型定义（内部共享）
 *
 * 包含：
 * - FfmpegResult：所有 ffmpeg 操作的统一返回类型（对外导出）
 * - FfmpegApiResponse：/api/ffmpeg/execute 响应体
 * - FfmpegProbeResponse：/api/ffmpeg/probe 响应体
 */

export interface FfmpegResult {
  success: boolean;
  outputPath?: string;
  outputPaths?: string[];
  error?: string;
  duration?: number;
  stderr?: string;
  metadata?: Record<string, unknown>;
}

export interface FfmpegApiResponse {
  success: boolean;
  data?: {
    exitCode: number | null;
    stdout: string;
    stderr: string;
    duration: number;
  };
  error?: string;
}

export interface FfmpegProbeResponse {
  success: boolean;
  data?: {
    available: boolean;
    version?: string;
    path?: string;
    error?: string;
  };
  error?: string;
}
