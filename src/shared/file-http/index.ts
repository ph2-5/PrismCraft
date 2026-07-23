// HTTP 文件操作统一通信层
// 优先使用 HTTP API，失败回退到 IPC（向后兼容）
import { API_SERVER_PORT, ELECTRON_APP_HEADERS } from "@/config/constants";
import { errorLogger } from "@/shared/error-logger";

let _httpAvailable: boolean | null = null;
let _httpAvailableTimestamp = 0;
const HTTP_AVAILABLE_TTL_MS = 30_000; // 30 秒后重试 HTTP

// 大文件二进制直写阈值：超过此大小走 /file/write-binary（application/octet-stream），
// 绕过 base64 编码（1.33x 膨胀）和 JSON.parse，支持 Seedance 2.5 30秒 4K / Kling 180秒 等大视频。
// 20MB 阈值选择：JSON body 限制 50MB，base64 后 26MB，留足余量。
const BINARY_WRITE_THRESHOLD = 20 * 1024 * 1024; // 20MB

function isHttpAvailable(): boolean {
  if (_httpAvailable === false) {
    // TTL 后重置，允许重试 HTTP
    if (Date.now() - _httpAvailableTimestamp > HTTP_AVAILABLE_TTL_MS) {
      _httpAvailable = null;
    }
  }
  return _httpAvailable !== false;
}

async function probeHttp(): Promise<boolean> {
  if (!isHttpAvailable()) return false;
  if (_httpAvailable !== null) return _httpAvailable;
  if (typeof window === "undefined" || typeof fetch !== "function") {
    _httpAvailable = false;
    _httpAvailableTimestamp = Date.now();
    return false;
  }
  try {
    const probe = await fetch(`http://localhost:${API_SERVER_PORT}/api/health`, {
      method: "GET",
      headers: ELECTRON_APP_HEADERS,
      signal: AbortSignal.timeout(1000),
    });
    _httpAvailable = probe.ok;
    if (!_httpAvailable) _httpAvailableTimestamp = Date.now();
  } catch {
    _httpAvailable = false;
    _httpAvailableTimestamp = Date.now();
  }
  return _httpAvailable;
}

async function httpFileCall<T>(
  endpoint: string,
  body: unknown,
  timeoutMs = 30000,
): Promise<{ success: boolean; data?: T; error?: string } | null> {
  if (!isHttpAvailable()) return null;
  if (!(await probeHttp())) return null;
  try {
    const response = await fetch(`http://localhost:${API_SERVER_PORT}/api/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ELECTRON_APP_HEADERS },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }
    return (await response.json()) as { success: boolean; data?: T; error?: string };
  } catch (e) {
    _httpAvailable = false;
    _httpAvailableTimestamp = Date.now();
    errorLogger.debug(`[FileHTTP] ${endpoint} 失败，回退到 IPC`, e);
    return null;
  }
}

/**
 * 二进制直写：用 application/octet-stream 传输，不经 base64 编码。
 * 用于大文件（>20MB）写入，支持 Seedance 2.5 30秒 4K / Kling 180秒 等大视频。
 * 主进程 server.ts 检测 Content-Type 后将原始 Buffer 透传给 file/write-binary 路由。
 * 失败时回退到 IPC（IPC 同样直接传 ArrayBuffer，不经 base64）。
 */
async function httpWriteBinary(
  filePath: string,
  data: Uint8Array | ArrayBuffer,
  timeoutMs = 120000,
): Promise<{ success: boolean; error?: string } | null> {
  if (!isHttpAvailable()) return null;
  if (!(await probeHttp())) return null;
  try {
    const buffer = data instanceof ArrayBuffer
      ? data
      : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    const response = await fetch(
      `http://localhost:${API_SERVER_PORT}/api/file/write-binary`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-File-Path": filePath,
          ...ELECTRON_APP_HEADERS,
        },
        body: buffer,
        signal: AbortSignal.timeout(timeoutMs),
      },
    );
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }
    return (await response.json()) as { success: boolean; error?: string };
  } catch (e) {
    _httpAvailable = false;
    _httpAvailableTimestamp = Date.now();
    errorLogger.debug(`[FileHTTP] file/write-binary 失败，回退到 IPC`, e);
    return null;
  }
}

interface ElectronFileAPI {
  writeFile: (filePath: string, data: ArrayBuffer) => Promise<{ success: boolean; error?: string }>;
  readFile: (filePath: string) => Promise<{ success: boolean; data?: ArrayBuffer; error?: string }>;
  getFileInfo: (filePath: string) => Promise<{ success: boolean; size?: number; error?: string } | null>;
  getCacheDirectory: () => Promise<{ success: boolean; path?: string; error?: string }>;
  getDiskSpace: (dirPath: string) => Promise<{ success: boolean; availableBytes?: number; totalBytes?: number; error?: string } | null>;
  fileExists: (filePath: string) => Promise<boolean | { exists?: boolean }>;
  deleteFile: (filePath: string) => Promise<boolean | { success?: boolean }>;
}

function getElectronAPI(): ElectronFileAPI | null {
  if (typeof window === "undefined") return null;
  const api = (window as Window & { electronAPI?: ElectronFileAPI }).electronAPI;
  return api ?? null;
}

/** 将 ArrayBuffer 转换为 base64 字符串（分块处理避免调用栈溢出） */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const CHUNK = 0x8000; // 32KB 分块，避免 String.fromCharCode.apply 栈溢出
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const chunk = bytes.subarray(i, i + CHUNK);
    binary += String.fromCharCode.apply(null, Array.from(chunk.values()));
  }
  return btoa(binary);
}

/** 写入文件（按绝对路径） */
export async function writeFile(
  filePath: string,
  data: Uint8Array | ArrayBuffer | string,
): Promise<{ success: boolean; error?: string }> {
  // 字符串数据：只能走 JSON 路径（UTF-8 编码）
  if (typeof data === "string") {
    const body = { filePath, data };
    const httpResult = await httpFileCall<{ key: string }>("file/write", body);
    if (httpResult !== null) {
      return httpResult;
    }
    // Fallback: IPC
    const api = getElectronAPI();
    if (!api?.writeFile) {
      return { success: false, error: "No file write capability available" };
    }
    try {
      const encoded = new TextEncoder().encode(data);
      const buffer = encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength) as ArrayBuffer;
      return await api.writeFile(filePath, buffer);
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  // 二进制数据：根据大小选择路径
  const buffer = data instanceof ArrayBuffer
    ? data
    : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  const sizeBytes = buffer.byteLength;

  // 大文件（>20MB）：走二进制直写路径，不经 base64 编码
  if (sizeBytes > BINARY_WRITE_THRESHOLD) {
    const binaryResult = await httpWriteBinary(filePath, buffer);
    if (binaryResult !== null) {
      return binaryResult;
    }
    // Fallback: IPC（IPC 也直接传 ArrayBuffer，不经 base64）
    const api = getElectronAPI();
    if (!api?.writeFile) {
      return { success: false, error: "No file write capability available" };
    }
    try {
      return await api.writeFile(filePath, buffer);
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  // 小文件（≤20MB）：走 JSON + base64 路径（向后兼容）
  const body = { filePath, data: arrayBufferToBase64(buffer), encoding: "base64" as const };
  const httpResult = await httpFileCall<{ key: string }>("file/write", body);
  if (httpResult !== null) {
    return httpResult;
  }
  // Fallback: IPC
  const api = getElectronAPI();
  if (!api?.writeFile) {
    return { success: false, error: "No file write capability available" };
  }
  try {
    return await api.writeFile(filePath, buffer);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 读取文件（返回 ArrayBuffer） */
export async function readFile(
  filePath: string,
): Promise<{ success: boolean; data?: ArrayBuffer; error?: string } | null> {
  // 优先 HTTP（返回 base64）
  const httpResult = await httpFileCall<{ base64: string }>("file/read", { key: filePath });
  if (httpResult !== null) {
    if (!httpResult.success || !httpResult.data) {
      return { success: false, error: httpResult.error || "Read failed" };
    }
    try {
      const binaryString = atob(httpResult.data.base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return { success: true, data: bytes.buffer as ArrayBuffer };
    } catch (e) {
      return { success: false, error: `Failed to decode base64: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
  // Fallback: IPC
  const api = getElectronAPI();
  if (!api?.readFile) return null;
  return await api.readFile(filePath);
}

/** 获取文件信息（大小等） */
export async function getFileInfo(
  filePath: string,
): Promise<{ success: boolean; size?: number; error?: string } | null> {
  // 优先 HTTP
  const httpResult = await httpFileCall<{ size: number; category: string; mimeType: string }>("file/info", { key: filePath });
  if (httpResult !== null) {
    if (!httpResult.success || !httpResult.data) return httpResult;
    return { success: true, size: httpResult.data.size };
  }
  // Fallback: IPC
  const api = getElectronAPI();
  if (!api?.getFileInfo) return null;
  return await api.getFileInfo(filePath);
}

/** 获取视频缓存目录 */
export async function getCacheDirectory(): Promise<{ success: boolean; path?: string; error?: string }> {
  // 优先 HTTP
  const httpResult = await httpFileCall<{ path: string }>("file/cache-directory", {});
  if (httpResult !== null) {
    return httpResult;
  }
  // Fallback: IPC
  const api = getElectronAPI();
  if (!api?.getCacheDirectory) {
    return { success: false, error: "No cache directory capability available" };
  }
  return await api.getCacheDirectory();
}

/** 查询磁盘空间 */
export async function getDiskSpace(
  dirPath: string,
): Promise<{ success: boolean; availableBytes?: number; totalBytes?: number; error?: string } | null> {
  // 优先 HTTP
  const httpResult = await httpFileCall<{ availableBytes: number; totalBytes: number }>("file/disk-space", { dirPath });
  if (httpResult !== null) {
    return httpResult;
  }
  // Fallback: IPC
  const api = getElectronAPI();
  if (!api?.getDiskSpace) return null;
  return await api.getDiskSpace(dirPath);
}

/** 检查文件是否存在 */
export async function fileExists(
  filePath: string,
): Promise<boolean> {
  // 优先 HTTP
  const httpResult = await httpFileCall<{ exists: boolean }>("file/exists", { key: filePath });
  if (httpResult !== null) {
    return httpResult.success && !!httpResult.data?.exists;
  }
  // Fallback: IPC
  const api = getElectronAPI();
  if (!api?.fileExists) return false;
  try {
    const result = await api.fileExists(filePath);
    if (typeof result === "boolean") return result;
    return !!result?.exists;
  } catch (e) {
    errorLogger.debug(`[FileHTTP] file/exists IPC 失败`, e);
    return false;
  }
}

/** 删除文件 */
export async function deleteFile(
  filePath: string,
): Promise<boolean> {
  // 优先 HTTP
  const httpResult = await httpFileCall<{ deleted: boolean }>("file/delete", { key: filePath });
  if (httpResult !== null) {
    return httpResult.success && !!httpResult.data?.deleted;
  }
  // Fallback: IPC
  const api = getElectronAPI();
  if (!api?.deleteFile) return false;
  try {
    const result = await api.deleteFile(filePath);
    if (typeof result === "boolean") return result;
    return !!result?.success;
  } catch (e) {
    errorLogger.debug(`[FileHTTP] file/delete IPC 失败`, e);
    return false;
  }
}

/** 重置 HTTP 可用性缓存（测试用） */
export function _resetHttpCache(): void {
  _httpAvailable = null;
  _httpAvailableTimestamp = 0;
}

/**
 * 流式下载到文件（方案 C）。
 *
 * 让主进程直接 fetch 远程 URL 并流式写入本地文件，绕过渲染进程内存。
 * 用于 200-500MB 大视频文件下载（Seedance 2.5 30秒 4K / Kling 180秒）。
 *
 * 与 writeFile 的区别：
 * - writeFile：数据已在渲染进程内存中，需要传到主进程落盘
 * - downloadToFile：数据直接从远程 URL 流到主进程磁盘，不经过渲染进程
 *
 * 无 IPC fallback：IPC 不支持流式下载。如果 HTTP 不可用，调用方应回退到
 * resilientFetch + httpWriteFile 路径（会占用渲染进程内存，但功能可用）。
 *
 * @param url 远程视频/文件 URL
 * @param filePath 本地目标路径（必须落在 ALLOWED_ROOTS 下）
 * @param options.timeout 总超时（毫秒），默认 10 分钟
 * @param options.maxRetries 最大重试次数，默认 3
 * @returns null 表示 HTTP 不可用；{ success, data?, error? } 表示主进程已响应
 */
export async function httpDownloadToFile(
  url: string,
  filePath: string,
  options: { timeout?: number; maxRetries?: number } = {},
): Promise<{ success: boolean; data?: { totalBytes: number; duration: number }; error?: string } | null> {
  if (!isHttpAvailable()) return null;
  if (!(await probeHttp())) return null;
  try {
    const response = await fetch(
      `http://localhost:${API_SERVER_PORT}/api/download/to-file`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ELECTRON_APP_HEADERS },
        body: JSON.stringify({
          url,
          filePath,
          timeout: options.timeout,
          maxRetries: options.maxRetries,
        }),
        // 10 分钟客户端超时，覆盖 5 分钟的服务端总超时 + 重试等待
        signal: AbortSignal.timeout(600_000),
      },
    );
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }
    return (await response.json()) as {
      success: boolean;
      data?: { totalBytes: number; duration: number };
      error?: string;
    };
  } catch (e) {
    _httpAvailable = false;
    _httpAvailableTimestamp = Date.now();
    errorLogger.debug(`[FileHTTP] download/to-file 失败，调用方应回退到 resilientFetch`, e);
    return null;
  }
}

interface ElectronConfigAPI {
  getConfig: (key: string) => unknown;
  setConfig: (key: string, value: unknown) => boolean;
}

function getElectronConfigAPI(): ElectronConfigAPI | null {
  if (typeof window === "undefined") return null;
  const api = (window as Window & { electronAPI?: ElectronConfigAPI }).electronAPI;
  return api ?? null;
}

/** 读取配置项（HTTP 优先，IPC 回退） */
export async function getConfig(key: string): Promise<unknown | null> {
  const httpResult = await httpFileCall<{ value: unknown }>("config/get", { key });
  if (httpResult !== null) {
    if (!httpResult.success || !httpResult.data) return null;
    return httpResult.data.value ?? null;
  }
  // Fallback: IPC
  const api = getElectronConfigAPI();
  if (!api?.getConfig) return null;
  try {
    return api.getConfig(key);
  } catch (e) {
    errorLogger.debug(`[FileHTTP] config/get 失败`, e);
    return null;
  }
}

/** 写入配置项（HTTP 优先，IPC 回退） */
export async function setConfig(key: string, value: unknown): Promise<boolean> {
  const httpResult = await httpFileCall<{ key: string }>("config/set", { key, value });
  if (httpResult !== null) {
    return httpResult.success;
  }
  // Fallback: IPC
  const api = getElectronConfigAPI();
  if (!api?.setConfig) return false;
  try {
    return api.setConfig(key, value);
  } catch (e) {
    errorLogger.debug(`[FileHTTP] config/set 失败`, e);
    return false;
  }
}

/** 文件类别（与主进程 fileCategorySchema 对齐） */
export type FileCategory =
  | "character"
  | "scene"
  | "storyboard"
  | "video-cache"
  | "image-cache"
  | "upload"
  | "plugin";

/** 列出指定类别目录下的文件 */
export async function listFiles(
  category: FileCategory,
  options: { limit?: number; offset?: number } = {},
): Promise<{ success: boolean; data?: { files: Array<{ name: string; size: number; modified: string }>; total: number; offset: number; limit: number }; error?: string } | null> {
  const httpResult = await httpFileCall<{ files: Array<{ name: string; size: number; modified: string }>; total: number; offset: number; limit: number }>("file/list", {
    category,
    limit: options.limit,
    offset: options.offset,
  });
  if (httpResult !== null) {
    return httpResult;
  }
  return null;
}

/** 复制文件到目标类别目录 */
export async function copyFile(
  sourceKey: string,
  targetCategory: FileCategory,
  targetKey: string,
): Promise<{ success: boolean; error?: string } | null> {
  const httpResult = await httpFileCall<{ key: string }>("file/copy", {
    sourceKey,
    targetCategory,
    targetKey,
  });
  if (httpResult !== null) {
    return httpResult;
  }
  return null;
}
