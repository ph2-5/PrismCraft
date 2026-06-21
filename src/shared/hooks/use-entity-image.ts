import { t } from "@/shared/constants";

/**
 * Validate image dimensions by loading the image and resolving its natural size.
 *
 * Extracted from use-character-image.ts and use-scene-image.ts to avoid
 * duplication. Both hooks had byte-for-byte identical implementations.
 *
 * Rejects with an Error when the image fails to load (e.g. broken URL,
 * CORS-blocked, non-image content). Callers are expected to surface the
 * error via `mapUserFacingError` or similar.
 */
export function validateImageSize(imageUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = () => reject(new Error(t("error.imageLoadValidationFailed")));
    img.src = imageUrl;
  });
}
