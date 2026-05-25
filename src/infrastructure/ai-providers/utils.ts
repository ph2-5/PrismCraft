import { imageToBase64 as normalizeImageToBase64 } from "@/infrastructure/ai-providers/image-normalization";
import { apiCallWithRetry } from "./core";
import { ApiClientError } from "./errors";
import { withCache, clearCacheByPrefix } from "@/infrastructure/ai-providers/api-cache";
import { extractErrorMessage } from "@/shared/error-logger";

export async function imageToBase64(imageUrl: string): Promise<string> {
  return normalizeImageToBase64(imageUrl);
}

export type UploadFileResult =
  | { success: true; data: { url: string; [key: string]: unknown }; source?: string; error?: string; message?: string }
  | { success: false; error: string; message?: string; data?: { url: string; [key: string]: unknown } };

export async function uploadFile(file: File): Promise<UploadFileResult> {
  try {
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
