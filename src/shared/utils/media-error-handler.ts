import { resolveImageUrl, resolveMediaUrl } from "./image-url";

export function createVideoErrorHandler(fallbackLocalPath?: string | null, fallbackRemoteUrl?: string | null) {
  return (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const target = e.currentTarget;
    if (target.dataset.retried) return;
    target.dataset.retried = "1";
    const fallback = resolveMediaUrl(fallbackLocalPath, fallbackRemoteUrl);
    if (fallback && fallback !== target.src) {
      target.src = fallback;
    }
  };
}

export function createSimpleVideoErrorHandler() {
  return (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const target = e.currentTarget;
    if (target.dataset.retried) return;
    target.dataset.retried = "1";
  };
}

export function createImageUrlErrorHandler(fallbackUrl?: string | null) {
  return (e: React.SyntheticEvent<HTMLImageElement>) => {
    const target = e.currentTarget;
    if (target.dataset.retried) return;
    target.dataset.retried = "1";
    if (fallbackUrl) {
      const resolved = resolveImageUrl(fallbackUrl);
      if (resolved && resolved !== target.src) {
        target.src = resolved;
      }
    }
  };
}
