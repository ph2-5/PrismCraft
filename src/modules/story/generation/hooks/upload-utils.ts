import { container } from "@/infrastructure/di";
import { errorLogger } from "@/shared/error-logger";

export function revokeBlobUrl(url: string | undefined) {
  if (url && url.startsWith("blob:")) {
    try {
      URL.revokeObjectURL(url);
    } catch (e) {
      errorLogger.warn(
        "[Upload] 释放 Blob URL 失败:",
        e instanceof Error ? e.message : e,
      );
    }
  }
}

export async function uploadAndGetPersistentUrl(file: File): Promise<string | null> {
  try {
    const result = await container.fileUploader.uploadFile(file);
    if (result.success && result.data?.url) return result.data.url;
  } catch (e) {
    errorLogger.warn("文件上传到服务器失败:", e);
  }
  return null;
}
