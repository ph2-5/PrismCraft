import { errorLogger } from "@/shared/error-logger";
import { t } from "@/shared/constants";

/**
 * 图片标准化处理模块（客户端安全）
 *
 * 仅包含可在浏览器环境中运行的图片处理功能。
 * 服务端图片处理（sharp）请使用 /api/image/normalize API。
 *
 * 被 api-client/video.ts 和 api-client/image.ts 作为主要图片处理路径使用。
 */

export interface NormalizationOptions {
  maxWidth?: number;
  maxHeight?: number;
  maxSizeMB?: number;
  quality?: number;
  format?: "image/jpeg" | "image/png" | "image/webp";
}

export interface NormalizedImage {
  url: string;
  originalSize: number;
  normalizedSize: number;
  width: number;
  height: number;
  format: string;
}

const DEFAULT_OPTIONS: NormalizationOptions = {
  maxWidth: 2048,
  maxHeight: 2048,
  maxSizeMB: 10,
  quality: 0.9,
};

export async function imageToBase64(imageUrl: string): Promise<string> {
  if (imageUrl.startsWith("data:")) {
    return imageUrl;
  }

  if (typeof window !== "undefined") {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error(t("error.canvasContextFailed")));
          return;
        }
        ctx.drawImage(img, 0, 0);
        const isPng = imageUrl.toLowerCase().endsWith(".png");
        resolve(canvas.toDataURL(isPng ? "image/png" : "image/jpeg", 0.9));
      };
      img.onerror = () => reject(new Error(t("error.imageLoadFailed")));
      img.src = imageUrl;
    });
  }

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`下载图片失败: ${response.status}`);
    }
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const contentType = response.headers.get("content-type") || "image/jpeg";
    return `data:${contentType};base64,${base64}`;
  } catch (error) {
    errorLogger.warn("[ImageNormalization] 下载图片失败:", error);
    return imageUrl;
  }
}

export function getImageDimensions(
  imageUrl: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      resolve({ width: img.width, height: img.height });
    };
    img.onerror = () => reject(new Error(t("error.imageDimensionsFailed")));
    img.src = imageUrl;
  });
}

export function getBase64Size(base64Url: string): number {
  if (!base64Url.startsWith("data:")) return 0;
  const base64 = base64Url.split(",")[1];
  if (!base64) return 0;
  return Math.ceil((base64.length * 3) / 4);
}

export async function normalizeImage(
  imageUrl: string,
  options: NormalizationOptions = {},
): Promise<NormalizedImage> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const base64Url = await imageToBase64(imageUrl);
  const originalSize = getBase64Size(base64Url);

  if (typeof window === "undefined") {
    return {
      url: base64Url,
      originalSize,
      normalizedSize: originalSize,
      width: 0,
      height: 0,
      format: "unknown",
    };
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      let { width, height } = img;

      if (width <= 0 || height <= 0) {
        reject(new Error(t("error.imageSizeInvalid")));
        return;
      }

      if (opts.maxWidth && width > opts.maxWidth) {
        height = Math.round((height * opts.maxWidth) / width);
        width = opts.maxWidth;
      }
      if (opts.maxHeight && height > opts.maxHeight) {
        width = Math.round((width * opts.maxHeight) / Math.max(1, height));
        height = opts.maxHeight;
      }

      width = Math.max(1, width);
      height = Math.max(1, height);

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error(t("error.canvasContextFailed")));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      const isPngSource = base64Url.startsWith("data:image/png");
      const format = opts.format || (isPngSource ? "image/png" : "image/jpeg");
      let quality = opts.quality ?? 0.9;
      let result = canvas.toDataURL(format, quality);
      let normalizedSize = getBase64Size(result);
      const maxSizeBytes = (opts.maxSizeMB || 10) * 1024 * 1024;

      if (format === "image/png") {
        if (normalizedSize > maxSizeBytes) {
          const jpegResult = canvas.toDataURL("image/jpeg", 0.85);
          const jpegSize = getBase64Size(jpegResult);
          if (jpegSize < normalizedSize) {
            result = jpegResult;
            normalizedSize = jpegSize;
          }
        }
      } else {
        while (normalizedSize > maxSizeBytes && quality > 0.3) {
          quality -= 0.1;
          result = canvas.toDataURL(format, quality);
          normalizedSize = getBase64Size(result);
        }
      }

      resolve({
        url: result,
        originalSize,
        normalizedSize,
        width,
        height,
        format: format,
      });
    };

    img.onerror = () => reject(new Error(t("error.imageLoadFailed")));
    img.src = base64Url;
  });
}

export async function normalizeImages(
  imageUrls: string[],
  options: NormalizationOptions = {},
): Promise<NormalizedImage[]> {
  const results = await Promise.all(
    imageUrls.map((url) =>
      normalizeImage(url, options).catch((error) => {
        errorLogger.warn("[ImageNormalization] 处理图片失败:", error);
        return null;
      }),
    ),
  );
  return results.filter((r): r is NormalizedImage => r !== null);
}
