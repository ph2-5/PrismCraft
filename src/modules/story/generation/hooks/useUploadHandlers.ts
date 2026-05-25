"use client";

import { useCallback } from "react";
import type { StoryBeat } from "@/domain/schemas";
import type { VideoModelFormat } from "@/domain/types";
import { container } from "@/infrastructure/di";
import { detectVideoCodec, extractVideoFrames } from "@/shared/video-utils";
import { errorLogger } from "@/shared/error-logger";

function revokeBlobUrl(url: string | undefined) {
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

async function uploadAndGetPersistentUrl(file: File): Promise<string | null> {
  try {
    const result = await container.fileUploader.uploadFile(file);
    if (result.success && result.data?.url) return result.data.url;
  } catch (e) {
    errorLogger.warn("文件上传到服务器失败:", e);
  }
  return null;
}

export function useUploadHandlers(
  setBeats: React.Dispatch<React.SetStateAction<StoryBeat[]>>,
  success: (title: string, description?: string) => void,
  warn?: (title: string, description?: string) => void,
  providerFormat?: VideoModelFormat,
) {
  const handleUploadKeyframe = useCallback(
    async (beatId: string, file: File) => {
      const tempUrl = URL.createObjectURL(file);
      let tempUrlRevoked = false;
      try {
        setBeats((prev) =>
          prev.map((b) => {
            if (b.id !== beatId) return b;
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
        success("上传成功", "预览图已更新");

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
        }
      } finally {
        if (!tempUrlRevoked) revokeBlobUrl(tempUrl);
      }
    },
    [setBeats, success],
  );

  const handleUploadFirstFrame = useCallback(
    async (beatId: string, file: File) => {
      const tempUrl = URL.createObjectURL(file);
      let tempUrlRevoked = false;
      try {
        setBeats((prev) =>
          prev.map((b) => {
            if (b.id !== beatId) return b;
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
        success("上传成功", "首帧已更新");

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
        }
      } finally {
        if (!tempUrlRevoked) revokeBlobUrl(tempUrl);
      }
    },
    [setBeats, success],
  );

  const handleUploadLastFrame = useCallback(
    async (beatId: string, file: File) => {
      const tempUrl = URL.createObjectURL(file);
      let tempUrlRevoked = false;
      try {
        setBeats((prev) =>
          prev.map((b) => {
            if (b.id !== beatId) return b;
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
        success("上传成功", "尾帧已更新");

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
        }
      } finally {
        if (!tempUrlRevoked) revokeBlobUrl(tempUrl);
      }
    },
    [setBeats, success],
  );

  const handleUploadVideo = useCallback(
    async (beatId: string, file: File) => {
      const tempUrl = URL.createObjectURL(file);
      let tempUrlRevoked = false;
      try {
        let codecWarning: string | null = null;
        try {
          const codecInfo = await detectVideoCodec(file);
          const format = providerFormat || "openai";
          const check = container.isCodecSupportedByProvider(codecInfo, format);
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
        } catch (err) {
          errorLogger.warn("提取视频首尾帧失败:", err);
        }

        setBeats((prev) =>
          prev.map((b) => {
            if (b.id !== beatId) return b;
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
                    firstFrameUrl || b.framePair?.firstFrame?.imageUrl || "",
                  prompt: b.framePair?.firstFrame?.prompt || "",
                  derivedFrom: b.framePair?.firstFrame?.derivedFrom || "",
                },
                lastFrame: {
                  ...(b.framePair?.lastFrame || {}),
                  imageUrl:
                    lastFrameUrl || b.framePair?.lastFrame?.imageUrl || "",
                  prompt: b.framePair?.lastFrame?.prompt || "",
                  derivedFrom: b.framePair?.lastFrame?.derivedFrom || "",
                },
                generatedAt: new Date().toISOString(),
              },
            };
          }),
        );

        if (codecWarning && warn) {
          warn("编码兼容性警告", codecWarning);
        }
        if (firstFrameUrl && lastFrameUrl) {
          success("上传成功", "视频已更新，已自动提取首尾帧");
        } else {
          success("上传成功", "视频已更新");
        }

        const persistentUrl = await uploadAndGetPersistentUrl(file);
        if (persistentUrl) {
          setBeats((prev) =>
            prev.map((b) => {
              if (b.id !== beatId) return b;
              if (b.videoGen?.videoUrl === tempUrl) {
                revokeBlobUrl(tempUrl);
                tempUrlRevoked = true;
                return {
                  ...b,
                  videoGen: { ...b.videoGen, videoUrl: persistentUrl },
                };
              }
              return b;
            }),
          );
        }
      } finally {
        if (!tempUrlRevoked) revokeBlobUrl(tempUrl);
      }
    },
    [setBeats, success, warn, providerFormat],
  );

  return {
    handleUploadKeyframe,
    handleUploadFirstFrame,
    handleUploadLastFrame,
    handleUploadVideo,
  };
}
