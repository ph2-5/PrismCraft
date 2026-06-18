import { imageToBase64 as normalizeImageToBase64 } from "@/infrastructure/ai-providers/image-normalization";
import { apiCallWithRetry } from "./core";
import { ApiClientError } from "./errors";
import { withCache, clearCacheByPrefix } from "@/infrastructure/ai-providers/api-cache";
import { extractErrorMessage } from "@/shared/error-logger";

/** 上传文件大小上限：50MB（与项目其他位置一致） */
const MAX_UPLOAD_FILE_BYTES = 50 * 1024 * 1024;

export async function imageToBase64(imageUrl: string): Promise<string> {
  return normalizeImageToBase64(imageUrl);
}

export type UploadFileResult =
  | { success: true; data: { url: string; [key: string]: unknown }; source?: string; error?: string; message?: string }
  | { success: false; error: string; message?: string; data?: { url: string; [key: string]: unknown } };

export async function uploadFile(file: File): Promise<UploadFileResult> {
  try {
    // 文件大小校验，防止内存溢出（base64 编码会使内存占用增加约 33%）
    if (file.size > MAX_UPLOAD_FILE_BYTES) {
      const sizeMB = (file.size / 1024 / 1024).toFixed(1);
      const limitMB = (MAX_UPLOAD_FILE_BYTES / 1024 / 1024).toFixed(0);
      return {
        success: false,
        error: `文件过大（${sizeMB}MB），最大支持 ${limitMB}MB`,
      };
    }

    const reader = new FileReader();
    const base64 = await new Promise<string>((resolve, reject) => {
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    return await apiCallWithRetry<UploadFileResult>("upload", {
      method: "POST",
      body: JSON.stringify({
        file: base64,
        filename: file.name,
        mimetype: file.type,
      }),
    });
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    throw new Error(extractErrorMessage(error));
  }
}

export async function getConfig(): Promise<Record<string, unknown>> {
  return withCache(
    "config",
    () => apiCallWithRetry<Record<string, unknown>>("config", { method: "GET" }),
    60000,
  );
}

export function clearConfigCache(): void {
  clearCacheByPrefix("config");
}
