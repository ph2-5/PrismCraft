import { useCallback, useRef, useEffect } from "react";
import type { StoryBeat, ChainMode } from "@/domain/schemas";
import { errorLogger } from "@/shared/error-logger";
import { confirm } from "@/shared/utils/confirm";
import { t } from "@/shared/constants";

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
        case "framepair":
          if (prevBeat.framePair?.lastFrame?.imageUrl || prevBeat.uploadedFramePair?.lastFrame) return prevBeat;
          break;
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

      for (let i = 0; i < targetBeats.length; i++) {
        if (cancelledRef.current) break;
        const beat = targetBeats[i]!;

        if (beat.uploadedKeyframe) {
          skippedCount++;
          continue;
        }

        const useChain = chainMode === "auto" ? shouldUseChainReference(beat, "keyframe") : chainMode !== "isolated";
        const prevBeat = useChain ? getPrevBeatForChain(i, targetBeats, "keyframe") : null;

        try {
          const result = await generateKeyframe(beat.id, prevBeat);
          if (cancelledRef.current) break;
          if (result) {
            successCount++;
            setBeats((prev) => prev.map((b) => b.id === result.id ? result : b));
            targetBeats[i] = result;
          } else {
            failCount++;
            if (skipOnError) continue;
          }
        } catch (err) {
          failCount++;
          errorLogger.warn(`批量生成预览图失败 (beat ${beat.id}):`, err);
          if (skipOnError && continueOnFallback) continue;
        }

        if (i < targetBeats.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      if (failCount === 0 && skippedCount === 0) {
        success(t("batch.generateComplete"), t("batch.keyframeSuccessDesc", { count: successCount }));
      } else {
        const parts = [];
        if (successCount > 0) parts.push(t("batch.successCount", { count: successCount }));
        if (failCount > 0) parts.push(t("batch.failedCount", { count: failCount }));
        if (skippedCount > 0) parts.push(t("batch.skippedCount", { count: skippedCount }));
        if (failCount > 0 && showWarning) {
          showWarning(t("batch.partialGenerateComplete"), parts.join("，"));
        } else {
          success(t("batch.generateComplete"), parts.join("，"));
        }
      }
      
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
        targetBeats = targetBeats.filter((b) => !b.framePair?.lastFrame?.imageUrl && !b.uploadedFramePair?.lastFrame);
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

      for (let i = 0; i < targetBeats.length; i++) {
        if (cancelledRef.current) break;
        const beat = targetBeats[i]!;

        if (beat.uploadedFramePair?.lastFrame) {
          skippedCount++;
          continue;
        }

        const useChain = chainMode === "auto" ? shouldUseChainReference(beat, "framepair") : chainMode !== "isolated";
        const prevBeat = useChain ? getPrevBeatForChain(i, targetBeats, "framepair") : null;

        try {
          const result = await generateFramePair(beat.id, prevBeat);
          if (cancelledRef.current) break;
          if (result) {
            successCount++;
            setBeats((prev) => prev.map((b) => b.id === result.id ? result : b));
            targetBeats[i] = result;
          } else {
            failCount++;
            if (skipOnError) continue;
          }
        } catch (err) {
          failCount++;
          errorLogger.warn(`批量生成首尾帧失败 (beat ${beat.id}):`, err);
          if (skipOnError && continueOnFallback) continue;
        }

        if (i < targetBeats.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      if (failCount === 0 && skippedCount === 0) {
        success(t("batch.generateComplete"), t("batch.framePairSuccessDesc", { count: successCount }));
      } else {
        const parts = [];
        if (successCount > 0) parts.push(t("batch.successCount", { count: successCount }));
        if (failCount > 0) parts.push(t("batch.failedCount", { count: failCount }));
        if (skippedCount > 0) parts.push(t("batch.skippedCount", { count: skippedCount }));
        if (failCount > 0 && showWarning) {
          showWarning(t("batch.partialGenerateComplete"), parts.join("，"));
        } else {
          success(t("batch.generateComplete"), parts.join("，"));
        }
      }
      
      return { success: successCount, failed: failCount, skipped: skippedCount };
    },
    [beatsRef, generateFramePair, shouldUseChainReference, getPrevBeatForChain, success, showError, showWarning, setBeats],
  );

  const batchGenerateVideos = useCallback(
    async (beatIds?: string[], options: BatchOptions = {}) => {
      const { strategy = "all_serial", skipOnError = true, continueOnFallback = true } = options;
      
      let targetBeats = beatIds
        ? beatsRef.current.filter(
            (b) => beatIds.includes(b.id) && (b.framePair?.firstFrame?.imageUrl || b.uploadedFramePair?.firstFrame),
          )
        : beatsRef.current.filter((b) => b.framePair?.firstFrame?.imageUrl || b.uploadedFramePair?.firstFrame);

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

      for (let i = 0; i < targetBeats.length; i++) {
        if (cancelledRef.current) break;
        const beat = targetBeats[i]!;
        
        if (beat.uploadedVideo) {
          skippedCount++;
          continue;
        }
        
        const useChain = chainMode === "auto" ? shouldUseChainReference(beat, "video") : chainMode !== "isolated";
        const prevBeat = useChain ? getPrevBeatForChain(i, targetBeats, "video") : null;
        
        try {
          await generateVideoNew(beat.id, prevBeat);
          if (cancelledRef.current) break;
          successCount++;
        } catch (err) {
          failCount++;
          errorLogger.warn(`批量生成视频失败 (beat ${beat.id}):`, err);
          if (!skipOnError || !continueOnFallback) break;
        }
        
        if (i < targetBeats.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      if (failCount === 0 && skippedCount === 0) {
        success(t("batch.submitComplete"), t("batch.videoSuccessDesc", { count: successCount }));
      } else {
        const parts = [];
        if (successCount > 0) parts.push(t("batch.successCount", { count: successCount }));
        if (failCount > 0) parts.push(t("batch.failedCount", { count: failCount }));
        if (skippedCount > 0) parts.push(t("batch.skippedCount", { count: skippedCount }));
        if (failCount > 0 && showWarning) {
          showWarning(t("batch.partialSubmitComplete"), parts.join("，"));
        } else {
          success(t("batch.submitComplete"), parts.join("，"));
        }
      }
      
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
