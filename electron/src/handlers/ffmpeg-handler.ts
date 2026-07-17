/**
 * ffmpeg 命令执行器（主进程）
 *
 * 职责：
 * - 检查 ffmpeg 是否可用（尝试运行 ffmpeg -version）
 * - 执行 ffmpeg 命令并返回结果
 * - 支持 timeout 和进度回调
 *
 * 安全要点：
 * - 不直接执行用户输入的命令，只执行预定义的参数数组
 * - 文件路径参数由调用方校验
 * - 使用 spawn 而非 exec，避免 shell 注入
 */

import { spawn } from "child_process";
import { access, constants, mkdir } from "fs/promises";
import { basename, dirname } from "path";
import { getLogger } from "../logging";

const logger = getLogger("ffmpeg-handler");

/** 默认 ffmpeg 二进制名称（依赖系统 PATH） */
const DEFAULT_FFMPEG = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";

/** 默认 ffprobe 二进制名称 */
const DEFAULT_FFPROBE = process.platform === "win32" ? "ffprobe.exe" : "ffprobe";

/** 默认超时（5 分钟） */
const DEFAULT_TIMEOUT = 5 * 60 * 1000;

/**
 * 允许的可执行文件名白名单（跨平台）。
 * 渲染进程传入的 ffmpegPath/ffprobePath 的 basename 必须匹配此白名单，
 * 防止传入 cmd.exe/powershell.exe 等系统二进制造成任意代码执行。
 */
const ALLOWED_BINARY_NAMES = new Set([
  "ffmpeg", "ffmpeg.exe",
  "ffprobe", "ffprobe.exe",
]);

/**
 * 校验可执行文件路径是否安全。
 *
 * 防止命令注入：渲染进程可能传入 `cmd.exe` / `powershell.exe` 等系统二进制
 * 作为 ffmpegPath，配合精心构造的 args 实现任意代码执行。
 * 此函数限制 basename 必须为 ffmpeg/ffprobe。
 */
function validateBinaryPath(binaryPath: string, label: string): void {
  const name = basename(binaryPath).toLowerCase();
  if (!ALLOWED_BINARY_NAMES.has(name)) {
    const error = `[${label}] Refused to execute non-ffmpeg binary: ${binaryPath} (basename must be ffmpeg/ffprobe)`;
    logger.error(error);
    throw new Error(error);
  }
}

export interface FfmpegExecuteOptions {
  /** 自定义 ffmpeg 路径（覆盖系统 PATH） */
  ffmpegPath?: string;
  /** 超时时间（毫秒），默认 5 分钟 */
  timeout?: number;
}

export interface FfmpegExecuteResult {
  success: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  duration: number;
  error?: string;
}

export interface FfmpegProbeResult {
  available: boolean;
  version?: string;
  path?: string;
  error?: string;
}

/**
 * 检查 ffmpeg 是否可用
 *
 * 尝试运行 `ffmpeg -version`，解析版本号。
 * 支持自定义路径或使用系统 PATH。
 */
export async function probeFfmpeg(
  customPath?: string,
): Promise<FfmpegProbeResult> {
  const ffmpeg = customPath || DEFAULT_FFMPEG;

  // 安全校验：拒绝非 ffmpeg/ffprobe 二进制（防命令注入）
  if (customPath) {
    try {
      validateBinaryPath(customPath, "probeFfmpeg");
    } catch (e) {
      return {
        available: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  try {
    const result = await runCommand(ffmpeg, ["-version"], 10_000);
    if (result.exitCode !== 0) {
      return {
        available: false,
        error: `ffmpeg exited with code ${result.exitCode}: ${result.stderr}`,
      };
    }

    // 解析版本号：ffmpeg version x.x.x ...
    const versionMatch = result.stdout.match(/ffmpeg version\s+([^\s]+)/);
    const version = versionMatch?.[1];

    return {
      available: true,
      version,
      path: ffmpeg,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.warn(`[probeFfmpeg] ffmpeg not available: ${msg}`);
    return {
      available: false,
      error: msg,
    };
  }
}

/**
 * 执行 ffmpeg 命令
 *
 * @param args ffmpeg 参数数组（如 ["-i", "input.mp4", "-ss", "10", "-to", "20", "-y", "output.mp4"]）
 * @param options 执行选项
 */
export async function executeFfmpeg(
  args: string[],
  options?: FfmpegExecuteOptions,
): Promise<FfmpegExecuteResult> {
  const ffmpeg = options?.ffmpegPath || DEFAULT_FFMPEG;
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
  const startTime = Date.now();

  // 安全校验：拒绝非 ffmpeg/ffprobe 二进制（防命令注入）
  if (options?.ffmpegPath) {
    try {
      validateBinaryPath(options.ffmpegPath, "executeFfmpeg");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error(`[executeFfmpeg] rejected: ${msg}`);
      return {
        success: false,
        exitCode: null,
        stdout: "",
        stderr: msg,
        duration: 0,
        error: msg,
      };
    }
  }

  // 确保输出目录存在（从 args 中找 -y 后的输出路径）
  await ensureOutputDir(args);

  try {
    const result = await runCommand(ffmpeg, args, timeout);
    return {
      ...result,
      duration: Date.now() - startTime,
      success: result.exitCode === 0,
      error: result.exitCode !== 0 ? `ffmpeg exited with code ${result.exitCode}` : undefined,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error(`[executeFfmpeg] failed: ${msg}`);
    return {
      success: false,
      exitCode: null,
      stdout: "",
      stderr: msg,
      duration: Date.now() - startTime,
      error: msg,
    };
  }
}

/**
 * 执行 ffprobe 命令（获取媒体信息）
 */
export async function executeFfprobe(
  args: string[],
  customPath?: string,
): Promise<FfmpegExecuteResult> {
  const ffprobe = customPath || DEFAULT_FFPROBE;
  const startTime = Date.now();

  // 安全校验：拒绝非 ffmpeg/ffprobe 二进制（防命令注入）
  if (customPath) {
    try {
      validateBinaryPath(customPath, "executeFfprobe");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error(`[executeFfprobe] rejected: ${msg}`);
      return {
        success: false,
        exitCode: null,
        stdout: "",
        stderr: msg,
        duration: 0,
        error: msg,
      };
    }
  }

  try {
    const result = await runCommand(ffprobe, args, 30_000);
    return {
      ...result,
      duration: Date.now() - startTime,
      success: result.exitCode === 0,
      error: result.exitCode !== 0 ? `ffprobe exited with code ${result.exitCode}` : undefined,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      success: false,
      exitCode: null,
      stdout: "",
      stderr: msg,
      duration: Date.now() - startTime,
      error: msg,
    };
  }
}

// ============= 内部辅助函数 =============

/** 运行命令并收集输出 */
function runCommand(
  cmd: string,
  args: string[],
  timeoutMs: number,
): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    proc.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGKILL");
    }, timeoutMs);

    proc.on("error", (err) => {
      clearTimeout(timer);
      // 命令不存在或无法启动
      reject(new Error(`Failed to spawn "${cmd}": ${err.message}`));
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`Command timed out after ${timeoutMs}ms`));
        return;
      }
      resolve({ exitCode: code, stdout, stderr });
    });
  });
}

/** 从 args 中提取输出路径并确保目录存在 */
async function ensureOutputDir(args: string[]): Promise<void> {
  // 找 -y 后的参数（通常是输出路径）
  const yIdx = args.indexOf("-y");
  if (yIdx >= 0 && yIdx + 1 < args.length) {
    const outputPath = args[yIdx + 1];
    if (outputPath && !outputPath.startsWith("-")) {
      try {
        const dir = dirname(outputPath);
        await access(dir, constants.W_OK);
      } catch {
        // 目录不存在，尝试创建
        try {
          const dir = dirname(args[yIdx + 1]!);
          await mkdir(dir, { recursive: true });
        } catch (err) {
          console.warn("[FFmpegHandler] 创建输出目录失败", err);
        }
      }
    }
  }
}
