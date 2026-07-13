import { useCallback } from "react";
import type { StoryBeat } from "@/domain/schemas";
import { revokeBlobUrl, uploadAndGetPersistentUrl } from "./upload-utils";
import { t } from "@/shared/constants";

export function useFrameUploadHandlers(
  setBeats: React.Dispatch<React.SetStateAction<StoryBeat[]>>,
  success: (title: string, description?: string) => void,
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

  return {
    handleUploadKeyframe,
    handleUploadFirstFrame,
    handleUploadLastFrame,
  };
}
