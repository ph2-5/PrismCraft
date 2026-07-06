import { useCallback } from "react";
import type { StoryBeat } from "@/domain/schemas";
import type { VideoModelFormat } from "@/domain/types";
import { getFirstFrameUrl, getLastFrameUrl } from "@/domain/utils";
import { detectVideoCodec, extractVideoFrames } from "@/shared/video-utils";
import { isCodecSupportedByProvider } from "@/shared/video-utils/codec-check";
import { errorLogger } from "@/shared/error-logger";
import { revokeBlobUrl, uploadAndGetPersistentUrl } from "./upload-utils";
import { t } from "@/shared/constants";

type SetBeats = React.Dispatch<React.SetStateAction<StoryBeat[]>>;
type ToastFn = (title: string, description?: string) => void;

function mapBeat(
  beats: StoryBeat[],
  beatId: string,
  fn: (b: StoryBeat) => StoryBeat,
): StoryBeat[] {
  return beats.map((b) => (b.id === beatId ? fn(b) : b));
}

function setKeyframeTempUrl(b: StoryBeat, tempUrl: string): { beat: StoryBeat; previousUrl: string | undefined } {
  const previousUrl = b.keyframe?.imageUrl;
  revokeBlobUrl(previousUrl);
  return {
    beat: {
      ...b,
      keyframe: {
        ...(b.keyframe || {}),
        imageUrl: tempUrl,
        prompt: b.keyframe?.prompt || "",
        generatedAt: new Date().toISOString(),
      },
    },
    previousUrl,
  };
}

function setFirstFrameTempUrl(b: StoryBeat, tempUrl: string): { beat: StoryBeat; previousUrl: string | undefined } {
  const previousUrl = b.framePair?.firstFrame?.imageUrl;
  revokeBlobUrl(previousUrl);
  return {
    beat: {
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
    },
    previousUrl,
  };
}

function setLastFrameTempUrl(b: StoryBeat, tempUrl: string): { beat: StoryBeat; previousUrl: string | undefined } {
  const previousUrl = b.framePair?.lastFrame?.imageUrl;
  revokeBlobUrl(previousUrl);
  return {
    beat: {
      ...b,
      framePair: {
        ...(b.framePair || {}),
        firstFrame: b.framePair?.firstFrame || { imageUrl: "", prompt: "", derivedFrom: "" },
        lastFrame: {
          ...(b.framePair?.lastFrame || {}),
          imageUrl: tempUrl,
          prompt: b.framePair?.lastFrame?.prompt || "",
          derivedFrom: b.framePair?.lastFrame?.derivedFrom || "",
        },
        generatedAt: b.framePair?.generatedAt || new Date().toISOString(),
      },
    },
    previousUrl,
  };
}

type MatchField = "keyframe.imageUrl" | "framePair.firstFrame.imageUrl" | "framePair.lastFrame.imageUrl" | "videoGen.videoUrl";

function getCurrentUrl(b: StoryBeat, field: MatchField): string | undefined {
  switch (field) {
    case "keyframe.imageUrl": return b.keyframe?.imageUrl;
    case "framePair.firstFrame.imageUrl": return b.framePair?.firstFrame?.imageUrl;
    case "framePair.lastFrame.imageUrl": return b.framePair?.lastFrame?.imageUrl;
    case "videoGen.videoUrl": return b.videoGen?.videoUrl;
  }
}

function buildPersistentUpdate(
  b: StoryBeat,
  field: MatchField,
  persistentUrl: string,
): StoryBeat {
  switch (field) {
    case "keyframe.imageUrl":
      return { ...b, keyframe: { ...b.keyframe!, imageUrl: persistentUrl } };
    case "framePair.firstFrame.imageUrl":
      return { ...b, framePair: { ...b.framePair!, firstFrame: { ...b.framePair!.firstFrame!, imageUrl: persistentUrl } } };
    case "framePair.lastFrame.imageUrl":
      return { ...b, framePair: { ...b.framePair!, lastFrame: { ...b.framePair!.lastFrame!, imageUrl: persistentUrl } } };
    case "videoGen.videoUrl":
      return { ...b, videoGen: { ...b.videoGen!, videoUrl: persistentUrl } };
  }
}

function buildRollback(
  b: StoryBeat,
  field: MatchField,
  previousUrl: string | undefined,
): StoryBeat {
  const restore = previousUrl || "";
  switch (field) {
    case "keyframe.imageUrl":
      return { ...b, keyframe: { ...b.keyframe!, imageUrl: restore } };
    case "framePair.firstFrame.imageUrl":
      return { ...b, framePair: { ...b.framePair!, firstFrame: { ...b.framePair!.firstFrame!, imageUrl: restore } } };
    case "framePair.lastFrame.imageUrl":
      return { ...b, framePair: { ...b.framePair!, lastFrame: { ...b.framePair!.lastFrame!, imageUrl: restore } } };
    case "videoGen.videoUrl":
      return { ...b, videoGen: { ...b.videoGen!, videoUrl: restore } };
  }
}

interface ReplaceUrlOptions {
  setBeats: SetBeats;
  beatId: string;
  file: File;
  tempUrl: string;
  matchField: MatchField;
  previousUrl: string | undefined;
  successToast: { title: string; desc: string };
  errorToast: { title: string; desc: string };
  success?: ToastFn;
  showError?: ToastFn;
  extraRevokes?: string[];
}

async function uploadAndReplaceUrl(opts: ReplaceUrlOptions): Promise<void> {
  const { setBeats, beatId, file, tempUrl, matchField, previousUrl, successToast, errorToast, success, showError, extraRevokes = [] } = opts;
  const persistentUrl = await uploadAndGetPersistentUrl(file);
  let tempUrlRevoked = false;

  const updateBeat = (updater: (b: StoryBeat) => StoryBeat) =>
    setBeats((prev) =>
      mapBeat(prev, beatId, (b) => {
        if (getCurrentUrl(b, matchField) !== tempUrl) return b;
        revokeBlobUrl(tempUrl);
        for (const url of extraRevokes) revokeBlobUrl(url);
        tempUrlRevoked = true;
        return updater(b);
      }),
    );

  if (persistentUrl) {
    updateBeat((b) => buildPersistentUpdate(b, matchField, persistentUrl));
    success?.(successToast.title, successToast.desc);
  } else {
    updateBeat((b) => buildRollback(b, matchField, previousUrl));
    showError?.(errorToast.title, errorToast.desc);
  }

  if (!tempUrlRevoked) revokeBlobUrl(tempUrl);
}

export function useUploadHandlers(
  setBeats: SetBeats,
  success: ToastFn,
  warn?: ToastFn,
  providerFormat?: VideoModelFormat,
  showError?: ToastFn,
) {
  const handleUploadKeyframe = useCallback(
    async (beatId: string, file: File) => {
      const tempUrl = URL.createObjectURL(file);
      let previousUrl: string | undefined;
      setBeats((prev) =>
        mapBeat(prev, beatId, (b) => {
          const result = setKeyframeTempUrl(b, tempUrl);
          previousUrl = result.previousUrl;
          return result.beat;
        }),
      );
      await uploadAndReplaceUrl({
        setBeats, beatId, file, tempUrl, matchField: "keyframe.imageUrl", previousUrl,
        successToast: { title: t("success.uploaded"), desc: t("success.keyframeUpdated") },
        errorToast: { title: t("error.uploadFailed"), desc: t("error.keyframeUploadServerFailed") },
        success, showError,
      });
    },
    [setBeats, success, showError],
  );

  const handleUploadFirstFrame = useCallback(
    async (beatId: string, file: File) => {
      const tempUrl = URL.createObjectURL(file);
      let previousUrl: string | undefined;
      setBeats((prev) =>
        mapBeat(prev, beatId, (b) => {
          const result = setFirstFrameTempUrl(b, tempUrl);
          previousUrl = result.previousUrl;
          return result.beat;
        }),
      );
      await uploadAndReplaceUrl({
        setBeats, beatId, file, tempUrl, matchField: "framePair.firstFrame.imageUrl", previousUrl,
        successToast: { title: t("success.uploaded"), desc: t("success.firstFrameUpdated") },
        errorToast: { title: t("error.uploadFailed"), desc: t("error.firstFrameUploadServerFailed") },
        success, showError,
      });
    },
    [setBeats, success, showError],
  );

  const handleUploadLastFrame = useCallback(
    async (beatId: string, file: File) => {
      const tempUrl = URL.createObjectURL(file);
      let previousUrl: string | undefined;
      setBeats((prev) =>
        mapBeat(prev, beatId, (b) => {
          const result = setLastFrameTempUrl(b, tempUrl);
          previousUrl = result.previousUrl;
          return result.beat;
        }),
      );
      await uploadAndReplaceUrl({
        setBeats, beatId, file, tempUrl, matchField: "framePair.lastFrame.imageUrl", previousUrl,
        successToast: { title: t("success.uploaded"), desc: t("success.lastFrameUpdated") },
        errorToast: { title: t("error.uploadFailed"), desc: t("error.lastFrameUploadServerFailed") },
        success, showError,
      });
    },
    [setBeats, success, showError],
  );

  const handleUploadVideo = useCallback(
    async (beatId: string, file: File) => {
      const tempUrl = URL.createObjectURL(file);
      let previousVideoUrl: string | undefined;
      let previousFirstFrameUrl: string | undefined;
      let previousLastFrameUrl: string | undefined;
      let firstFrameBlobUrl = "";
      let lastFrameBlobUrl = "";
      try {
        const codecWarning = await detectCodecWarning(file, providerFormat);
        const frames = await extractVideoFramesSafe(file);
        firstFrameBlobUrl = frames.firstFrame;
        lastFrameBlobUrl = frames.lastFrame;

        setBeats((prev) =>
          mapBeat(prev, beatId, (b) => {
            previousVideoUrl = b.videoGen?.videoUrl;
            previousFirstFrameUrl = b.framePair?.firstFrame?.imageUrl;
            previousLastFrameUrl = b.framePair?.lastFrame?.imageUrl;
            revokeBlobUrl(b.videoGen?.videoUrl);
            revokeBlobUrl(b.framePair?.firstFrame?.imageUrl);
            revokeBlobUrl(b.framePair?.lastFrame?.imageUrl);
            return buildVideoUploadBeat(b, tempUrl, frames.firstFrame, frames.lastFrame);
          }),
        );

        if (codecWarning && warn) {
          warn(t("warning.codecCompatibility"), codecWarning);
        }

        const persistentUrl = await uploadAndGetPersistentUrl(file);
        let tempUrlRevoked = false;
        if (persistentUrl) {
          setBeats((prev) =>
            mapBeat(prev, beatId, (b) => {
              if (b.videoGen?.videoUrl !== tempUrl) return b;
              revokeBlobUrl(tempUrl);
              revokeBlobUrl(firstFrameBlobUrl);
              revokeBlobUrl(lastFrameBlobUrl);
              tempUrlRevoked = true;
              return { ...b, videoGen: { ...b.videoGen!, videoUrl: persistentUrl } };
            }),
          );
          if (frames.firstFrame && frames.lastFrame) {
            success(t("success.uploaded"), t("success.videoUpdatedWithFrames"));
          } else {
            success(t("success.uploaded"), t("success.videoUpdated"));
          }
        } else {
          setBeats((prev) =>
            mapBeat(prev, beatId, (b) => {
              if (b.videoGen?.videoUrl !== tempUrl) return b;
              revokeBlobUrl(tempUrl);
              revokeBlobUrl(firstFrameBlobUrl);
              revokeBlobUrl(lastFrameBlobUrl);
              tempUrlRevoked = true;
              return buildVideoRollbackBeat(b, previousVideoUrl, previousFirstFrameUrl, previousLastFrameUrl);
            }),
          );
          showError?.(t("error.uploadFailed"), t("error.videoUploadServerFailed"));
        }
        if (!tempUrlRevoked) revokeBlobUrl(tempUrl);
      } catch (e) {
        revokeBlobUrl(tempUrl);
        revokeBlobUrl(firstFrameBlobUrl);
        revokeBlobUrl(lastFrameBlobUrl);
        showError?.(t("error.uploadFailed"), e instanceof Error ? e.message : t("error.videoUploadServerFailed"));
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

async function detectCodecWarning(file: File, providerFormat?: VideoModelFormat): Promise<string | null> {
  try {
    const codecInfo = await detectVideoCodec(file);
    const format = providerFormat || "openai";
    const check = isCodecSupportedByProvider(codecInfo, format);
    if (!check.supported && check.reason) return check.reason;
  } catch (e) {
    errorLogger.warn("[Upload] 检测视频编码失败:", e instanceof Error ? e.message : e);
  }
  return null;
}

async function extractVideoFramesSafe(file: File): Promise<{ firstFrame: string; lastFrame: string }> {
  try {
    const frames = await extractVideoFrames(file);
    return { firstFrame: frames.firstFrame, lastFrame: frames.lastFrame };
  } catch (err) {
    errorLogger.warn("提取视频首尾帧失败:", err);
    return { firstFrame: "", lastFrame: "" };
  }
}

function orDefault<T>(...values: Array<T | undefined | null | "">): T {
  for (const v of values) {
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return "" as unknown as T;
}

function buildVideoGenContainer(b: StoryBeat, tempUrl: string) {
  const vg = b.videoGen;
  return {
    ...(vg || {}),
    videoUrl: tempUrl,
    status: "completed" as const,
    prompt: orDefault(vg?.prompt, ""),
    taskId: orDefault(vg?.taskId, ""),
    error: orDefault(vg?.error, ""),
    createdAt: orDefault(vg?.createdAt, new Date().toISOString()),
  };
}

function buildFrameSide(existing: { imageUrl?: string; prompt?: string; derivedFrom?: string } | undefined, imageUrl: string): { imageUrl: string; prompt: string; derivedFrom: string } {
  return {
    imageUrl,
    prompt: orDefault(existing?.prompt, ""),
    derivedFrom: orDefault(existing?.derivedFrom, ""),
  };
}

function buildVideoUploadBeat(b: StoryBeat, tempUrl: string, firstFrameUrl: string, lastFrameUrl: string): StoryBeat {
  const fp = b.framePair;
  const firstUrl = orDefault(firstFrameUrl, getFirstFrameUrl(fp), "");
  const lastUrl = orDefault(lastFrameUrl, getLastFrameUrl(fp), "");
  return {
    ...b,
    videoGen: buildVideoGenContainer(b, tempUrl),
    framePair: {
      ...(fp || {}),
      firstFrame: buildFrameSide(fp?.firstFrame, firstUrl),
      lastFrame: buildFrameSide(fp?.lastFrame, lastUrl),
      generatedAt: new Date().toISOString(),
    },
  };
}

function buildVideoRollbackBeat(
  b: StoryBeat,
  previousVideoUrl: string | undefined,
  previousFirstFrameUrl: string | undefined,
  previousLastFrameUrl: string | undefined,
): StoryBeat {
  const fp = b.framePair;
  return {
    ...b,
    videoGen: { ...b.videoGen!, videoUrl: orDefault(previousVideoUrl, "") },
    framePair: {
      ...(fp || {}),
      firstFrame: buildFrameSide(fp?.firstFrame, orDefault(previousFirstFrameUrl, "")),
      lastFrame: buildFrameSide(fp?.lastFrame, orDefault(previousLastFrameUrl, "")),
    },
  };
}
