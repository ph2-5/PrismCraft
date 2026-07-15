import { t } from "@/shared/constants";
import { emitToast } from "@/shared/utils/toast-bridge";

/** 单个文件大小上限：10 MB */
export const MAX_UPLOAD_FILE_SIZE = 10 * 1024 * 1024;

/** 图片格式白名单 */
export const IMAGE_ACCEPTED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"] as const;
/** 视频格式白名单 */
export const VIDEO_ACCEPTED_EXTENSIONS = [".mp4", ".mov"] as const;
/** 全部允许的扩展名 */
export const ALL_ACCEPTED_EXTENSIONS = [...IMAGE_ACCEPTED_EXTENSIONS, ...VIDEO_ACCEPTED_EXTENSIONS] as const;

export interface UploadValidationOptions {
  /** 允许的扩展名列表；默认全部允许 */
  allowedExtensions?: readonly string[];
  /** 文件大小上限（字节）；默认 10 MB */
  maxSize?: number;
  /** 是否在验证失败时自动显示 Toast 提示；默认 true */
  showToast?: boolean;
}

function getExtension(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx >= 0 ? filename.slice(idx).toLowerCase() : "";
}

export interface ValidationResult {
  ok: boolean;
  reason?: "too_large" | "invalid_extension";
}

/**
 * 校验单个文件是否符合上传限制。
 * 默认限制：≤ 10 MB，扩展名 ∈ {.png,.jpg,.jpeg,.webp,.mp4,.mov}。
 */
export function validateUploadFile(file: File, options: UploadValidationOptions = {}): ValidationResult {
  const {
    allowedExtensions = ALL_ACCEPTED_EXTENSIONS,
    maxSize = MAX_UPLOAD_FILE_SIZE,
    showToast = true,
  } = options;

  if (file.size > maxSize) {
    if (showToast) {
      const sizeMB = (file.size / 1024 / 1024).toFixed(1);
      const limitMB = (maxSize / 1024 / 1024).toFixed(0);
      emitToast(
        "error",
        t("upload.fileTooLargeTitle"),
        t("upload.fileTooLargeDetail", { size: sizeMB, limit: limitMB }),
      );
    }
    return { ok: false, reason: "too_large" };
  }

  const ext = getExtension(file.name);
  if (!allowedExtensions.includes(ext)) {
    if (showToast) {
      emitToast(
        "error",
        t("upload.invalidFormatTitle"),
        t("upload.invalidFormatDetail", { extensions: allowedExtensions.join(", ") }),
      );
    }
    return { ok: false, reason: "invalid_extension" };
  }

  return { ok: true };
}
