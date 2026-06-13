import { t } from "@/shared/constants";

const DEFAULT_FRAME_SIZE = 512;

export interface ExtractedFrames {
  firstFrame: string;
  lastFrame: string;
}

export function extractVideoFrames(file: File): Promise<ExtractedFrames> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    let isSettled = false;

    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    const cleanup = () => {
      if (isSettled) return;
      isSettled = true;
      video.removeEventListener("error", handleError);
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      video.load();
      video.remove();
    };

    const safeResolve = (value: ExtractedFrames) => {
      cleanup();
      resolve(value);
    };

    const safeReject = (reason: Error) => {
      cleanup();
      reject(reason);
    };

    let timeoutId: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      safeReject(new Error(t("error.videoFrameTimeout")));
    }, 30000);

    const handleError = () => {
      clearTimeout(timeoutId!);
      timeoutId = null;
      safeReject(new Error(t("error.videoLoadFailed")));
    };

    const handleLoadedMetadata = () => {
      clearTimeout(timeoutId!);
      timeoutId = null;
      const duration = video.duration;

      if (!duration || isNaN(duration) || duration <= 0) {
        safeReject(new Error(t("error.videoDurationInvalid")));
        return;
      }

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        safeReject(new Error(t("error.canvasContextFailed")));
        return;
      }

      canvas.width = video.videoWidth || DEFAULT_FRAME_SIZE;
      canvas.height = video.videoHeight || DEFAULT_FRAME_SIZE;

      const frames: ExtractedFrames = {
        firstFrame: "",
        lastFrame: "",
      };

      let capturedCount = 0;

      const captureFrame = (time: number) => {
        video.currentTime = time;
      };

      const handleSeeked = () => {
        if (capturedCount === 0) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          frames.firstFrame = canvas.toDataURL("image/jpeg", 0.92);
          capturedCount++;
          captureFrame(Math.max(0, duration - 0.1));
        } else if (capturedCount === 1) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          frames.lastFrame = canvas.toDataURL("image/jpeg", 0.92);
          capturedCount++;
          video.removeEventListener("seeked", handleSeeked);
          safeResolve(frames);
        }
      };

      video.addEventListener("seeked", handleSeeked);

      captureFrame(0);
    };

    video.addEventListener("error", handleError);
    video.addEventListener("loadedmetadata", handleLoadedMetadata);

    video.src = url;
  });
}

export function dataUrlToFile(dataUrl: string, filename: string): File {
  const arr = dataUrl.split(",");
  const mime = arr[0]!.match(/:(.*?);/)?.[1] ?? "image/jpeg";
  const bstr = atob(arr[1]!);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mime });
}
