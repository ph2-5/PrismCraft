// HTTP 文件操作统一通信层
// 优先使用 HTTP API，失败回退到 IPC（向后兼容）
import { API_SERVER_PORT, ELECTRON_APP_HEADERS } from "@/config/constants";
import { errorLogger } from "@/shared/error-logger";

let _httpAvailable: boolean | null = null;

async function probeHttp(): Promise<boolean> {
  if (_httpAvailable !== null) return _httpAvailable;
  if (typeof window === "undefined" || typeof fetch !== "function") {
    _httpAvailable = false;
    return false;
  }
  try {
    const probe = await fetch(`http://localhost:${API_SERVER_PORT}/api/health`, {
      method: "GET",
      headers: ELECTRON_APP_HEADERS,
      signal: AbortSignal.timeout(1000),
    });
    _httpAvailable = probe.ok;
  } catch {
    _httpAvailable = false;
  }
  return _httpAvailable;
}

async function httpFileCall<T>(
  endpoint: string,
  body: unknown,
  timeoutMs = 30000,
): Promise<{ success: boolean; data?: T; error?: string } | null> {
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

/** 写入文件（按绝对路径） */
export async function writeFile(
  filePath: string,
  data: Uint8Array | ArrayBuffer | string,
): Promise<{ success: boolean; error?: string }> {
  // 优先 HTTP
  const body = typeof data === "string"
    ? { filePath, data }
    : { filePath, data: Array.from(new Uint8Array(data instanceof ArrayBuffer ? data : data.buffer)) };
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
  } catch {
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
  } catch {
    return false;
  }
}

/** 重置 HTTP 可用性缓存（测试用） */
export function _resetHttpCache(): void {
  _httpAvailable = null;
}
