import { useCallback, useRef, useEffect } from "react";
import type { StoryBeat, ChainMode } from "@/domain/schemas";
import { getFirstFrameUrl, getLastFrameUrl } from "@/domain/utils";
import { errorLogger } from "@/shared/error-logger";
import { confirm } from "@/shared/utils/confirm";
import { t, BATCH_OPERATION_INTERVAL_MS } from "@/shared/constants";

export type BatchStrategy = "all_serial" | "skip_completed" | "parallel_batch";
export type GenerationLevel = "keyframe" | "framepair" | "video";
export type BatchOptions = {
  strategy?: BatchStrategy;
  chainMode?: ChainMode;
  skipOnError?: boolean;
  continueOnFallback?: boolean;
};
export type BatchResult = {
  success: number;
  failed: number;
  skipped: number;
};

interface BatchCounts {
  success: number;
  failed: number;
  skipped: number;
}

interface BatchMessages {
  completeTitle: string;
  partialTitle: string;
  successDescKey: string;
}

function reportBatchResult(
  successFn: (title: string, description?: string) => void,
  showWarning: ((title: string, description?: string) => void) | undefined,
  counts: BatchCounts,
  messages: BatchMessages,
): void {
  const { success: successCount, failed: failCount, skipped: skippedCount } = counts;
  if (failCount === 0 && skippedCount === 0) {
    successFn(messages.completeTitle, t(messages.successDescKey, { count: successCount }));
    return;
  }
  const parts: string[] = [];
  if (successCount > 0) parts.push(t("batch.successCount", { count: successCount }));
  if (failCount > 0) parts.push(t("batch.failedCount", { count: failCount }));
  if (skippedCount > 0) parts.push(t("batch.skippedCount", { count: skippedCount }));
  if (failCount > 0 && showWarning) {
    showWarning(messages.partialTitle, parts.join("，"));
  } else {
    successFn(messages.completeTitle, parts.join("，"));
  }
}

async function executeBeatWithRetry<T>(
  operation: () => Promise<T | void>,
  maxRetry: number,
  retryDelayBase: number = 500,
): Promise<{ result: T | void; failed: boolean }> {
  for (let retry = 0; retry <= maxRetry; retry++) {
    try {
      const result = await operation();
      return { result, failed: false };
    } catch (err) {
      if (retry < maxRetry) {
        await new Promise((r) => setTimeout(r, retryDelayBase * (retry + 1)));
        continue;
      }
      throw err;
    }
  }
  return { result: undefined, failed: true };
}

async function waitForDelay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

interface UseBatchGeneratorProps {
  beatsRef: React.MutableRefObject<StoryBeat[]>;
  setBeats: React.Dispatch<React.SetStateAction<StoryBeat[]>>;
  generateKeyframe: (beatId: string, prevBeatOverride?: StoryBeat | null) => Promise<StoryBeat | void>;
  generateFramePair: (beatId: string, prevBeatOverride?: StoryBeat | null) => Promise<StoryBeat | void>;
  generateVideoNew: (beatId: string, prevBeatOverride?: StoryBeat | null) => Promise<void>;
  success: (title: string, description?: string) => void;
  showError: (title: string, description?: string) => void;
  showWarning?: (title: string, description?: string) => void;
}

export function useBatchGenerator(props: UseBatchGeneratorProps) {
  const {
    beatsRef,
    setBeats,
    generateKeyframe,
    generateFramePair,
    generateVideoNew,
    success,
    showError,
    showWarning,
  } = props;

  const cancelledRef = useRef(false);
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const getChainMode = useCallback((beat: StoryBeat): ChainMode => {
    if (beat.chainMode) return beat.chainMode;
    if (beat.featureAnchoring?.blend?.mode === "chain_only") return "auto";
    return "auto";
  }, []);

  const shouldUseChainReference = useCallback((beat: StoryBeat, level: GenerationLevel): boolean => {
    const chainMode = getChainMode(beat);
    if (chainMode === "isolated") return false;
    if (chainMode === "custom") return !!beat.customChainTarget;
    if (chainMode === "asset") return false;
    
    switch (level) {
      case "keyframe":
        return beat.keyframeInput !== "isolated";
      case "framepair":
        return beat.framePairInput !== "isolated";
      case "video":
        return beat.videoInput !== "isolated";
      default:
        return true;
    }
  }, [getChainMode]);

  const getPrevBeatForChain = useCallback((
    index: number,
    targetBeats: StoryBeat[],
    level: GenerationLevel,
  ): StoryBeat | null => {
    for (let i = index - 1; i >= 0; i--) {
      const prevBeat = targetBeats[i]!;
      switch (level) {
        case "keyframe":
          if (prevBeat.keyframe?.imageUrl || prevBeat.uploadedKeyframe) return prevBeat;
          break;
        case "framepair": {
          const hasFramePair = getLastFrameUrl(prevBeat.framePair) || prevBeat.uploadedFramePair?.lastFrame;
          const consistencyFailed = prevBeat.consistencyCheck && !prevBeat.consistencyCheck.passed;
          if (hasFramePair && !consistencyFailed) return prevBeat;
          if (hasFramePair && consistencyFailed) return null;
          break;
        }
        case "video":
          if (prevBeat.videoGen?.videoUrl || prevBeat.uploadedVideo) return prevBeat;
          break;
      }
    }
    return null;
  }, []);

  const batchGenerateKeyframes = useCallback(
    async (beatIds?: string[], options: BatchOptions = {}) => {
      const { strategy = "all_serial", skipOnError = true, continueOnFallback = true } = options;

      let targetBeats = beatIds
        ? beatsRef.current.filter((b) => beatIds.includes(b.id))
        : [...beatsRef.current];

      if (strategy === "skip_completed") {
        targetBeats = targetBeats.filter((b) => !b.keyframe?.imageUrl && !b.uploadedKeyframe);
      }

      if (targetBeats.length === 0) {
        showError(t("batch.noBeatsToGenerate"), strategy === "skip_completed" ? t("batch.allCompleted") : t("batch.addBeatsFirst"));
        return { success: 0, failed: 0, skipped: 0 };
      }

      const chainMode = options.chainMode || "auto";
      const confirmMessage = chainMode === "isolated"
        ? t("batch.confirmKeyframeIsolated", { count: targetBeats.length })
        : t("batch.confirmKeyframeChain", { count: targetBeats.length });

      const confirmed = await confirm(confirmMessage, t("batch.confirmKeyframeTitle"));
      if (!confirmed) return { success: 0, failed: 0, skipped: 0 };

      let successCount = 0;
      let failCount = 0;
      let skippedCount = 0;
      const MAX_RETRY = 1;

      for (let i = 0; i < targetBeats.length; i++) {
        if (cancelledRef.current) break;
        const beat = targetBeats[i]!;

        if (beat.uploadedKeyframe) {
          skippedCount++;
          continue;
        }

        const useChain = chainMode === "auto" ? shouldUseChainReference(beat, "keyframe") : chainMode !== "isolated";
        const prevBeat = useChain ? getPrevBeatForChain(i, targetBeats, "keyframe") : null;

        let shouldSkipDelay = false;
        try {
          if (cancelledRef.current) break;
          const { result, failed } = await executeBeatWithRetry(
            () => generateKeyframe(beat.id, prevBeat),
            MAX_RETRY,
          );
          if (cancelledRef.current) break;
          if (failed || !result) {
            failCount++;
            if (skipOnError) shouldSkipDelay = true;
          } else {
            successCount++;
            setBeats((prev) => prev.map((b) => b.id === result.id ? result : b));
            targetBeats[i] = result;
          }
        } catch (err) {
          failCount++;
          errorLogger.warn(`${t("batch.keyframeFailedLog")} (beat ${beat.id}):`, err);
          if (skipOnError && continueOnFallback) shouldSkipDelay = true;
        }
        if (cancelledRef.current) break;

        if (!shouldSkipDelay && i < targetBeats.length - 1) {
          await waitForDelay(BATCH_OPERATION_INTERVAL_MS);
        }
      }

      reportBatchResult(success, showWarning, { success: successCount, failed: failCount, skipped: skippedCount }, {
        completeTitle: t("batch.generateComplete"),
        partialTitle: t("batch.partialGenerateComplete"),
        successDescKey: "batch.keyframeSuccessDesc",
      });

      return { success: successCount, failed: failCount, skipped: skippedCount };
    },
    [beatsRef, generateKeyframe, shouldUseChainReference, getPrevBeatForChain, success, showError, showWarning, setBeats],
  );

  const batchGenerateFramePairs = useCallback(
    async (beatIds?: string[], options: BatchOptions = {}) => {
      const { strategy = "all_serial", skipOnError = true, continueOnFallback = true } = options;

      let targetBeats = beatIds
        ? beatsRef.current.filter(
            (b) => beatIds.includes(b.id) && (b.keyframe?.imageUrl || b.uploadedKeyframe),
          )
        : beatsRef.current.filter((b) => b.keyframe?.imageUrl || b.uploadedKeyframe);

      if (strategy === "skip_completed") {
        targetBeats = targetBeats.filter((b) => !getLastFrameUrl(b.framePair) && !b.uploadedFramePair?.lastFrame);
      }

      if (targetBeats.length === 0) {
        showError(t("batch.noBeatsToGenerate"), strategy === "skip_completed" ? t("batch.allCompleted") : t("batch.generateKeyframesFirst"));
        return { success: 0, failed: 0, skipped: 0 };
      }

      const chainMode = options.chainMode || "auto";
      const confirmMessage = chainMode === "isolated"
        ? t("batch.confirmFramePairIsolated", { count: targetBeats.length })
        : t("batch.confirmFramePairChain", { count: targetBeats.length });

      const confirmed = await confirm(confirmMessage, t("batch.confirmFramePairTitle"));
      if (!confirmed) return { success: 0, failed: 0, skipped: 0 };

      let successCount = 0;
      let failCount = 0;
      let skippedCount = 0;
      const MAX_RETRY = 1;

      for (let i = 0; i < targetBeats.length; i++) {
        if (cancelledRef.current) break;
        const beat = targetBeats[i]!;

        if (beat.uploadedFramePair?.lastFrame) {
          skippedCount++;
          continue;
        }

        const useChain = chainMode === "auto" ? shouldUseChainReference(beat, "framepair") : chainMode !== "isolated";
        const prevBeat = useChain ? getPrevBeatForChain(i, targetBeats, "framepair") : null;

        let shouldSkipDelay = false;
        try {
          if (cancelledRef.current) break;
          const { result, failed } = await executeBeatWithRetry(
            () => generateFramePair(beat.id, prevBeat),
            MAX_RETRY,
          );
          if (cancelledRef.current) break;
          if (failed || !result) {
            failCount++;
            if (skipOnError) shouldSkipDelay = true;
          } else {
            successCount++;
            setBeats((prev) => prev.map((b) => b.id === result.id ? result : b));
            targetBeats[i] = result;
          }
        } catch (err) {
          failCount++;
          errorLogger.warn(`${t("batch.framePairFailedLog")} (beat ${beat.id}):`, err);
          if (skipOnError && continueOnFallback) shouldSkipDelay = true;
        }
        if (cancelledRef.current) break;

        if (!shouldSkipDelay && i < targetBeats.length - 1) {
          await waitForDelay(BATCH_OPERATION_INTERVAL_MS);
        }
      }

      reportBatchResult(success, showWarning, { success: successCount, failed: failCount, skipped: skippedCount }, {
        completeTitle: t("batch.generateComplete"),
        partialTitle: t("batch.partialGenerateComplete"),
        successDescKey: "batch.framePairSuccessDesc",
      });

      return { success: successCount, failed: failCount, skipped: skippedCount };
    },
    [beatsRef, generateFramePair, shouldUseChainReference, getPrevBeatForChain, success, showError, showWarning, setBeats],
  );

  const batchGenerateVideos = useCallback(
    async (beatIds?: string[], options: BatchOptions = {}) => {
      const { strategy = "all_serial", skipOnError = true, continueOnFallback = true } = options;

      let targetBeats = beatIds
        ? beatsRef.current.filter(
            (b) => beatIds.includes(b.id) && (getFirstFrameUrl(b.framePair) || b.uploadedFramePair?.firstFrame),
          )
        : beatsRef.current.filter((b) => getFirstFrameUrl(b.framePair) || b.uploadedFramePair?.firstFrame);

      if (strategy === "skip_completed") {
        targetBeats = targetBeats.filter((b) => !b.videoGen?.videoUrl && !b.uploadedVideo);
      }

      if (targetBeats.length === 0) {
        showError(t("batch.noBeatsToGenerate"), strategy === "skip_completed" ? t("batch.allCompleted") : t("batch.generateFramePairsFirst"));
        return { success: 0, failed: 0, skipped: 0 };
      }

      const chainMode = options.chainMode || "auto";
      const confirmMessage = chainMode === "isolated"
        ? t("batch.confirmVideoIsolated", { count: targetBeats.length })
        : t("batch.confirmVideoChain", { count: targetBeats.length });

      const confirmed = await confirm(confirmMessage, t("batch.confirmVideoTitle"));
      if (!confirmed) return { success: 0, failed: 0, skipped: 0 };

      let successCount = 0;
      let failCount = 0;
      let skippedCount = 0;
      const MAX_RETRY = 1;

      for (let i = 0; i < targetBeats.length; i++) {
        if (cancelledRef.current) break;
        const beat = targetBeats[i]!;

        if (beat.uploadedVideo) {
          skippedCount++;
          continue;
        }

        const useChain = chainMode === "auto" ? shouldUseChainReference(beat, "video") : chainMode !== "isolated";
        const prevBeat = useChain ? getPrevBeatForChain(i, targetBeats, "video") : null;

        let beatFailed = false;
        try {
          if (cancelledRef.current) break;
          const { failed } = await executeBeatWithRetry(
            () => generateVideoNew(beat.id, prevBeat),
            MAX_RETRY,
          );
          if (cancelledRef.current) break;
          if (failed) {
            failCount++;
            beatFailed = true;
          } else {
            successCount++;
          }
        } catch (err) {
          failCount++;
          beatFailed = true;
          errorLogger.warn(`${t("batch.videoFailedLog")} (beat ${beat.id}):`, err);
        }
        if (cancelledRef.current) break;
        if (beatFailed && (!skipOnError || !continueOnFallback)) break;

        if (i < targetBeats.length - 1) {
          await waitForDelay(100);
        }
      }

      reportBatchResult(success, showWarning, { success: successCount, failed: failCount, skipped: skippedCount }, {
        completeTitle: t("batch.submitComplete"),
        partialTitle: t("batch.partialSubmitComplete"),
        successDescKey: "batch.videoSuccessDesc",
      });

      return { success: successCount, failed: failCount, skipped: skippedCount };
    },
    [beatsRef, generateVideoNew, shouldUseChainReference, getPrevBeatForChain, success, showError, showWarning],
  );

  return {
    batchGenerateKeyframes,
    batchGenerateFramePairs,
    batchGenerateVideos,
    shouldUseChainReference,
    getPrevBeatForChain,
  };
}
