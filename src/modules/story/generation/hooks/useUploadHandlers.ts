import { useCallback } from "react";
import type { StoryBeat } from "@/domain/schemas";
import type { VideoModelFormat } from "@/domain/types";
import { getFirstFrameUrl, getLastFrameUrl } from "@/domain/utils";
import { detectVideoCodec, extractVideoFrames } from "@/shared/video-utils";
import { isCodecSupportedByProvider } from "@/shared/video-utils/codec-check";
import { errorLogger } from "@/shared/error-logger";
import { revokeBlobUrl, uploadAndGetPersistentUrl } from "./upload-utils";
import { t } from "@/shared/constants";

export function useUploadHandlers(
  setBeats: React.Dispatch<React.SetStateAction<StoryBeat[]>>,
  success: (title: string, description?: string) => void,
  warn?: (title: string, description?: string) => void,
  providerFormat?: VideoModelFormat,
  showError?: (title: string, description?: string) => void,
) {
  const handleUploadKeyframe = useCallback(
    async (beatId: string, file: File) => {
      const tempUrl = URL.createObjectURL(file);
      let tempUrlRevoked = false;
      let previousImageUrl: string | undefined;
      try {
        setBeats((prev) =>
          prev.map((b) => {
            if (b.id !== beatId) return b;
            previousImageUrl = b.keyframe?.imageUrl;
            revokeBlobUrl(b.keyframe?.imageUrl);
            return {
              ...b,
              keyframe: {
                ...(b.keyframe || {}),
                imageUrl: tempUrl,
                prompt: b.keyframe?.prompt || "",
                generatedAt: new Date().toISOString(),
              },
            };
          }),
        );

        const persistentUrl = await uploadAndGetPersistentUrl(file);
        if (persistentUrl) {
          setBeats((prev) =>
            prev.map((b) => {
              if (b.id !== beatId) return b;
              if (b.keyframe?.imageUrl === tempUrl) {
                revokeBlobUrl(tempUrl);
                tempUrlRevoked = true;
                return {
                  ...b,
                  keyframe: { ...b.keyframe, imageUrl: persistentUrl },
                };
              }
              return b;
            }),
          );
          success(t("success.uploaded"), t("success.keyframeUpdated"));
        } else {
          setBeats((prev) =>
            prev.map((b) => {
              if (b.id !== beatId) return b;
              if (b.keyframe?.imageUrl === tempUrl) {
                revokeBlobUrl(tempUrl);
                tempUrlRevoked = true;
                return {
                  ...b,
                  keyframe: { ...b.keyframe, imageUrl: previousImageUrl },
                };
              }
              return b;
            }),
          );
          showError?.(t("error.uploadFailed"), t("error.keyframeUploadServerFailed"));
        }
      } finally {
        if (!tempUrlRevoked) revokeBlobUrl(tempUrl);
      }
    },
    [setBeats, success, showError],
  );

  const handleUploadFirstFrame = useCallback(
    async (beatId: string, file: File) => {
      const tempUrl = URL.createObjectURL(file);
      let tempUrlRevoked = false;
      let previousImageUrl: string | undefined;
      try {
        setBeats((prev) =>
          prev.map((b) => {
            if (b.id !== beatId) return b;
            previousImageUrl = b.framePair?.firstFrame?.imageUrl;
            revokeBlobUrl(b.framePair?.firstFrame?.imageUrl);
            return {
              ...b,
              framePair: {
                ...(b.framePair || {}),
                firstFrame: {
                  ...(b.framePair?.firstFrame || {}),
                  imageUrl: tempUrl,
                  prompt: b.framePair?.firstFrame?.prompt || "",
                  derivedFrom: b.framePair?.firstFrame?.derivedFrom || "",
                },
                lastFrame: b.framePair?.lastFrame,
                generatedAt: b.framePair?.generatedAt || new Date().toISOString(),
              },
            };
          }),
        );

        const persistentUrl = await uploadAndGetPersistentUrl(file);
        if (persistentUrl) {
          setBeats((prev) =>
            prev.map((b) => {
              if (b.id !== beatId) return b;
              if (b.framePair?.firstFrame?.imageUrl === tempUrl) {
                revokeBlobUrl(tempUrl);
                tempUrlRevoked = true;
                return {
                  ...b,
                  framePair: {
                    ...b.framePair,
                    firstFrame: {
                      ...b.framePair.firstFrame,
                      imageUrl: persistentUrl,
                    },
                  },
                };
              }
              return b;
            }),
          );
          success(t("success.uploaded"), t("success.firstFrameUpdated"));
        } else {
          setBeats((prev) =>
            prev.map((b) => {
              if (b.id !== beatId) return b;
              if (b.framePair?.firstFrame?.imageUrl === tempUrl) {
                revokeBlobUrl(tempUrl);
                tempUrlRevoked = true;
                return {
                  ...b,
                  framePair: {
                    ...b.framePair,
                    firstFrame: {
                      ...b.framePair.firstFrame,
                      imageUrl: previousImageUrl || "",
                    },
                  },
                };
              }
              return b;
            }),
          );
          showError?.(t("error.uploadFailed"), t("error.firstFrameUploadServerFailed"));
        }
      } finally {
        if (!tempUrlRevoked) revokeBlobUrl(tempUrl);
      }
    },
    [setBeats, success, showError],
  );

  const handleUploadLastFrame = useCallback(
    async (beatId: string, file: File) => {
      const tempUrl = URL.createObjectURL(file);
      let tempUrlRevoked = false;
      let previousImageUrl: string | undefined;
      try {
        setBeats((prev) =>
          prev.map((b) => {
            if (b.id !== beatId) return b;
            previousImageUrl = b.framePair?.lastFrame?.imageUrl;
            revokeBlobUrl(b.framePair?.lastFrame?.imageUrl);
            return {
              ...b,
              framePair: {
                ...(b.framePair || {}),
                firstFrame: b.framePair?.firstFrame || {
                  imageUrl: "",
                  prompt: "",
                  derivedFrom: "",
                },
                lastFrame: {
                  ...(b.framePair?.lastFrame || {}),
                  imageUrl: tempUrl,
                  prompt: b.framePair?.lastFrame?.prompt || "",
                  derivedFrom: b.framePair?.lastFrame?.derivedFrom || "",
                },
                generatedAt: b.framePair?.generatedAt || new Date().toISOString(),
              },
            };
          }),
        );

        const persistentUrl = await uploadAndGetPersistentUrl(file);
        if (persistentUrl) {
          setBeats((prev) =>
            prev.map((b) => {
              if (b.id !== beatId) return b;
              if (b.framePair?.lastFrame?.imageUrl === tempUrl) {
                revokeBlobUrl(tempUrl);
                tempUrlRevoked = true;
                return {
                  ...b,
                  framePair: {
                    ...b.framePair,
                    lastFrame: {
                      ...b.framePair.lastFrame,
                      imageUrl: persistentUrl,
                    },
                  },
                };
              }
              return b;
            }),
          );
          success(t("success.uploaded"), t("success.lastFrameUpdated"));
        } else {
          setBeats((prev) =>
            prev.map((b) => {
              if (b.id !== beatId) return b;
              if (b.framePair?.lastFrame?.imageUrl === tempUrl) {
                revokeBlobUrl(tempUrl);
                tempUrlRevoked = true;
                return {
                  ...b,
                  framePair: {
                    ...b.framePair,
                    lastFrame: {
                      ...b.framePair.lastFrame,
                      imageUrl: previousImageUrl || "",
                    },
                  },
                };
              }
              return b;
            }),
          );
          showError?.(t("error.uploadFailed"), t("error.lastFrameUploadServerFailed"));
        }
      } finally {
        if (!tempUrlRevoked) revokeBlobUrl(tempUrl);
      }
    },
    [setBeats, success, showError],
  );

  const handleUploadVideo = useCallback(
    async (beatId: string, file: File) => {
      const tempUrl = URL.createObjectURL(file);
      let tempUrlRevoked = false;
      let previousVideoUrl: string | undefined;
      let previousFirstFrameUrl: string | undefined;
      let previousLastFrameUrl: string | undefined;
      let firstFrameBlobUrl = "";
      let lastFrameBlobUrl = "";
      try {
        let codecWarning: string | null = null;
        try {
          const codecInfo = await detectVideoCodec(file);
          const format = providerFormat || "openai";
          const check = isCodecSupportedByProvider(codecInfo, format);
          if (!check.supported && check.reason) {
            codecWarning = check.reason;
          }
        } catch (e) {
          errorLogger.warn(
            "[Upload] 检测视频编码失败:",
            e instanceof Error ? e.message : e,
          );
        }

        let firstFrameUrl = "";
        let lastFrameUrl = "";
        try {
          const frames = await extractVideoFrames(file);
          firstFrameUrl = frames.firstFrame;
          lastFrameUrl = frames.lastFrame;
          firstFrameBlobUrl = firstFrameUrl;
          lastFrameBlobUrl = lastFrameUrl;
        } catch (err) {
          errorLogger.warn("提取视频首尾帧失败:", err);
        }

        setBeats((prev) =>
          prev.map((b) => {
            if (b.id !== beatId) return b;
            previousVideoUrl = b.videoGen?.videoUrl;
            previousFirstFrameUrl = b.framePair?.firstFrame?.imageUrl;
            previousLastFrameUrl = b.framePair?.lastFrame?.imageUrl;
            revokeBlobUrl(b.videoGen?.videoUrl);
            revokeBlobUrl(b.framePair?.firstFrame?.imageUrl);
            revokeBlobUrl(b.framePair?.lastFrame?.imageUrl);
            return {
              ...b,
              videoGen: {
                ...(b.videoGen || {}),
                videoUrl: tempUrl,
                status: "completed",
                prompt: b.videoGen?.prompt || "",
                taskId: b.videoGen?.taskId || "",
                error: b.videoGen?.error || "",
                createdAt: b.videoGen?.createdAt || new Date().toISOString(),
              },
              framePair: {
                ...(b.framePair || {}),
                firstFrame: {
                  ...(b.framePair?.firstFrame || {}),
                  imageUrl:
                    firstFrameUrl || getFirstFrameUrl(b.framePair) || "",
                  prompt: b.framePair?.firstFrame?.prompt || "",
                  derivedFrom: b.framePair?.firstFrame?.derivedFrom || "",
                },
                lastFrame: {
                  ...(b.framePair?.lastFrame || {}),
                  imageUrl:
                    lastFrameUrl || getLastFrameUrl(b.framePair) || "",
                  prompt: b.framePair?.lastFrame?.prompt || "",
                  derivedFrom: b.framePair?.lastFrame?.derivedFrom || "",
                },
                generatedAt: new Date().toISOString(),
              },
            };
          }),
        );

        if (codecWarning && warn) {
          warn(t("warning.codecCompatibility"), codecWarning);
        }

        const persistentUrl = await uploadAndGetPersistentUrl(file);
        if (persistentUrl) {
          setBeats((prev) =>
            prev.map((b) => {
              if (b.id !== beatId) return b;
              if (b.videoGen?.videoUrl === tempUrl) {
                revokeBlobUrl(tempUrl);
                tempUrlRevoked = true;
                revokeBlobUrl(firstFrameBlobUrl);
                revokeBlobUrl(lastFrameBlobUrl);
                return {
                  ...b,
                  videoGen: { ...b.videoGen, videoUrl: persistentUrl },
                };
              }
              return b;
            }),
          );
          if (firstFrameUrl && lastFrameUrl) {
            success(t("success.uploaded"), t("success.videoUpdatedWithFrames"));
          } else {
            success(t("success.uploaded"), t("success.videoUpdated"));
          }
        } else {
          setBeats((prev) =>
            prev.map((b) => {
              if (b.id !== beatId) return b;
              if (b.videoGen?.videoUrl === tempUrl) {
                revokeBlobUrl(tempUrl);
                revokeBlobUrl(firstFrameBlobUrl);
                revokeBlobUrl(lastFrameBlobUrl);
                tempUrlRevoked = true;
                return {
                  ...b,
                  videoGen: { ...b.videoGen, videoUrl: previousVideoUrl || "" },
                  framePair: {
                    ...(b.framePair || {}),
                    firstFrame: {
                      ...(b.framePair?.firstFrame || {}),
                      imageUrl: previousFirstFrameUrl || "",
                      prompt: b.framePair?.firstFrame?.prompt || "",
                      derivedFrom: b.framePair?.firstFrame?.derivedFrom || "",
                    },
                    lastFrame: {
                      ...(b.framePair?.lastFrame || {}),
                      imageUrl: previousLastFrameUrl || "",
                      prompt: b.framePair?.lastFrame?.prompt || "",
                      derivedFrom: b.framePair?.lastFrame?.derivedFrom || "",
                    },
                  },
                };
              }
              return b;
            }),
          );
          showError?.(t("error.uploadFailed"), t("error.videoUploadServerFailed"));
        }
      } finally {
        if (!tempUrlRevoked) revokeBlobUrl(tempUrl);
      }
    },
    [setBeats, success, warn, showError, providerFormat],
  );

  return {
    handleUploadKeyframe,
    handleUploadFirstFrame,
    handleUploadLastFrame,
    handleUploadVideo,
  };
}
