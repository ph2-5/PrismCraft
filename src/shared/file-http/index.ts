// HTTP 文件操作统一通信层
// 优先使用 HTTP API，失败回退到 IPC（向后兼容）
import { API_SERVER_PORT, ELECTRON_APP_HEADERS } from "@/config/constants";
import { errorLogger } from "@/shared/error-logger";

let _httpAvailable: boolean | null = null;
let _httpAvailableTimestamp = 0;
const HTTP_AVAILABLE_TTL_MS = 30_000; // 30 秒后重试 HTTP

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
    binary += String.fromCharCode.apply(null, Array.from(chunk) as unknown as number[]);
  }
  return btoa(binary);
}

/** 写入文件（按绝对路径） */
export async function writeFile(
  filePath: string,
  data: Uint8Array | ArrayBuffer | string,
): Promise<{ success: boolean; error?: string }> {
  // 优先 HTTP
  // 字符串以 UTF-8 发送；二进制数据以 base64 编码发送（避免 Array.from 数字数组导致 ~3x 内存膨胀）
  let body: { filePath: string; data: string; encoding?: "utf-8" | "base64" };
  if (typeof data === "string") {
    body = { filePath, data };
  } else {
    const buffer = data instanceof ArrayBuffer ? data : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    body = { filePath, data: arrayBufferToBase64(buffer), encoding: "base64" };
  }
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
    let buffer: ArrayBuffer;
    if (typeof data === "string") {
      const encoded = new TextEncoder().encode(data);
      buffer = encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength) as ArrayBuffer;
    } else if (data instanceof ArrayBuffer) {
      buffer = data;
    } else {
      buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    }
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
