import { useCallback } from "react";
import type { StoryBeat } from "@/domain/schemas";
import { revokeBlobUrl, uploadAndGetPersistentUrl } from "./upload-utils";
import { t } from "@/shared/constants";

interface FrameUploadConfig {
  getCurrentImageUrl: (beat: StoryBeat) => string | undefined;
  applyTempUrl: (beat: StoryBeat, tempUrl: string) => StoryBeat;
  applyPersistentUrl: (beat: StoryBeat, persistentUrl: string) => StoryBeat;
  applyRestoredUrl: (beat: StoryBeat, previousUrl: string | undefined) => StoryBeat;
  successDescKey: string;
  errorDescKey: string;
}

async function uploadBeatFrameImage(
  setBeats: React.Dispatch<React.SetStateAction<StoryBeat[]>>,
  success: (title: string, description?: string) => void,
  showError: ((title: string, description?: string) => void) | undefined,
  beatId: string,
  file: File,
  config: FrameUploadConfig,
): Promise<void> {
  const tempUrl = URL.createObjectURL(file);
  let tempUrlRevoked = false;
  let previousImageUrl: string | undefined;
  try {
    setBeats((prev) =>
      prev.map((b) => {
        if (b.id !== beatId) return b;
        previousImageUrl = config.getCurrentImageUrl(b);
        revokeBlobUrl(previousImageUrl);
        return config.applyTempUrl(b, tempUrl);
      }),
    );

    const persistentUrl = await uploadAndGetPersistentUrl(file);
    if (persistentUrl) {
      setBeats((prev) =>
        prev.map((b) => {
          if (b.id !== beatId) return b;
          if (config.getCurrentImageUrl(b) === tempUrl) {
            revokeBlobUrl(tempUrl);
            tempUrlRevoked = true;
            return config.applyPersistentUrl(b, persistentUrl);
          }
          return b;
        }),
      );
      success(t("success.uploaded"), t(config.successDescKey));
    } else {
      setBeats((prev) =>
        prev.map((b) => {
          if (b.id !== beatId) return b;
          if (config.getCurrentImageUrl(b) === tempUrl) {
            revokeBlobUrl(tempUrl);
            tempUrlRevoked = true;
            return config.applyRestoredUrl(b, previousImageUrl);
          }
          return b;
        }),
      );
      showError?.(t("error.uploadFailed"), t(config.errorDescKey));
    }
  } finally {
    if (!tempUrlRevoked) revokeBlobUrl(tempUrl);
  }
}

export function useFrameUploadHandlers(
  setBeats: React.Dispatch<React.SetStateAction<StoryBeat[]>>,
  success: (title: string, description?: string) => void,
  showError?: (title: string, description?: string) => void,
) {
  const handleUploadKeyframe = useCallback(
    async (beatId: string, file: File) => {
      await uploadBeatFrameImage(setBeats, success, showError, beatId, file, {
        getCurrentImageUrl: (b) => b.keyframe?.imageUrl,
        applyTempUrl: (b, tempUrl) => ({
          ...b,
          keyframe: {
            ...(b.keyframe || {}),
            imageUrl: tempUrl,
            prompt: b.keyframe?.prompt || "",
            generatedAt: new Date().toISOString(),
          },
        }),
        applyPersistentUrl: (b, persistentUrl) => ({
          ...b,
          keyframe: { ...b.keyframe, imageUrl: persistentUrl },
        }),
        applyRestoredUrl: (b, previousUrl) => ({
          ...b,
          keyframe: { ...b.keyframe, imageUrl: previousUrl },
        }),
        successDescKey: "success.keyframeUpdated",
        errorDescKey: "error.keyframeUploadServerFailed",
      });
    },
    [setBeats, success, showError],
  );

  const handleUploadFirstFrame = useCallback(
    async (beatId: string, file: File) => {
      await uploadBeatFrameImage(setBeats, success, showError, beatId, file, {
        getCurrentImageUrl: (b) => b.framePair?.firstFrame?.imageUrl,
        applyTempUrl: (b, tempUrl) => ({
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
        }),
        applyPersistentUrl: (b, persistentUrl) => ({
          ...b,
          framePair: {
            ...b.framePair,
            firstFrame: {
              ...b.framePair!.firstFrame!,
              imageUrl: persistentUrl,
            },
          },
        }),
        applyRestoredUrl: (b, previousUrl) => ({
          ...b,
          framePair: {
            ...b.framePair,
            firstFrame: {
              ...b.framePair!.firstFrame!,
              imageUrl: previousUrl || "",
            },
          },
        }),
        successDescKey: "success.firstFrameUpdated",
        errorDescKey: "error.firstFrameUploadServerFailed",
      });
    },
    [setBeats, success, showError],
  );

  const handleUploadLastFrame = useCallback(
    async (beatId: string, file: File) => {
      await uploadBeatFrameImage(setBeats, success, showError, beatId, file, {
        getCurrentImageUrl: (b) => b.framePair?.lastFrame?.imageUrl,
        applyTempUrl: (b, tempUrl) => ({
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
        }),
        applyPersistentUrl: (b, persistentUrl) => ({
          ...b,
          framePair: {
            ...b.framePair,
            lastFrame: {
              ...b.framePair!.lastFrame!,
              imageUrl: persistentUrl,
            },
          },
        }),
        applyRestoredUrl: (b, previousUrl) => ({
          ...b,
          framePair: {
            ...b.framePair,
            lastFrame: {
              ...b.framePair!.lastFrame!,
              imageUrl: previousUrl || "",
            },
          },
        }),
        successDescKey: "success.lastFrameUpdated",
        errorDescKey: "error.lastFrameUploadServerFailed",
      });
    },
    [setBeats, success, showError],
  );

  return {
    handleUploadKeyframe,
    handleUploadFirstFrame,
    handleUploadLastFrame,
  };
}
