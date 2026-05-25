"use client";

import { useCallback } from "react";
import type { StoryBeat, ChainMode } from "@/domain/schemas";
import { errorLogger } from "@/shared/error-logger";
import { confirm } from "@/shared/utils/confirm";

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
  } = props;

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
      const prevBeat = targetBeats[i];
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
        showError("无可生成分镜", strategy === "skip_completed" ? "所有分镜已完成" : "请先添加分镜");
        return { success: 0, failed: 0, skipped: 0 };
      }

      const chainMode = options.chainMode || "auto";
      const confirmMessage = chainMode === "isolated"
        ? `即将为 ${targetBeats.length} 个分镜批量生成预览图（隔离模式，各自独立生成）。\n\n是否继续？`
        : `即将为 ${targetBeats.length} 个分镜批量生成预览图（串行生成，非首分镜将引用上一分镜的预览图作为参考）。\n\n是否继续？`;

      const confirmed = await confirm(confirmMessage, "批量生成预览图");
      if (!confirmed) return { success: 0, failed: 0, skipped: 0 };

      let successCount = 0;
      let failCount = 0;
      let skippedCount = 0;

      for (let i = 0; i < targetBeats.length; i++) {
        const beat = targetBeats[i];

        if (beat.uploadedKeyframe) {
          skippedCount++;
          continue;
        }

        const useChain = chainMode === "auto" ? shouldUseChainReference(beat, "keyframe") : chainMode !== "isolated";
        const prevBeat = useChain ? getPrevBeatForChain(i, targetBeats, "keyframe") : null;

        try {
          const result = await generateKeyframe(beat.id, prevBeat);
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
        success("批量生成完成", `成功为 ${successCount} 个分镜生成预览图`);
      } else {
        const parts = [];
        if (successCount > 0) parts.push(`成功 ${successCount} 个`);
        if (failCount > 0) parts.push(`失败 ${failCount} 个`);
        if (skippedCount > 0) parts.push(`跳过 ${skippedCount} 个（已上传）`);
        success("批量生成完成", parts.join("，"));
      }
      
      return { success: successCount, failed: failCount, skipped: skippedCount };
    },
    [beatsRef, generateKeyframe, shouldUseChainReference, getPrevBeatForChain, success, showError, setBeats],
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
        showError("无可生成分镜", strategy === "skip_completed" ? "所有分镜已完成" : "请先生成预览图");
        return { success: 0, failed: 0, skipped: 0 };
      }

      const chainMode = options.chainMode || "auto";
      const confirmMessage = chainMode === "isolated"
        ? `即将为 ${targetBeats.length} 个分镜批量生成首尾帧（隔离模式，各自独立生成）。\n\n是否继续？`
        : `即将为 ${targetBeats.length} 个分镜批量生成首尾帧（串行生成，非首分镜将引用上一分镜的尾帧作为参考）。\n\n是否继续？`;

      const confirmed = await confirm(confirmMessage, "批量生成首尾帧");
      if (!confirmed) return { success: 0, failed: 0, skipped: 0 };

      let successCount = 0;
      let failCount = 0;
      let skippedCount = 0;

      for (let i = 0; i < targetBeats.length; i++) {
        const beat = targetBeats[i];

        if (beat.uploadedFramePair?.lastFrame) {
          skippedCount++;
          continue;
        }

        const useChain = chainMode === "auto" ? shouldUseChainReference(beat, "framepair") : chainMode !== "isolated";
        const prevBeat = useChain ? getPrevBeatForChain(i, targetBeats, "framepair") : null;

        try {
          const result = await generateFramePair(beat.id, prevBeat);
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
        success("批量生成完成", `成功为 ${successCount} 个分镜生成首尾帧`);
      } else {
        const parts = [];
        if (successCount > 0) parts.push(`成功 ${successCount} 个`);
        if (failCount > 0) parts.push(`失败 ${failCount} 个`);
        if (skippedCount > 0) parts.push(`跳过 ${skippedCount} 个（已上传）`);
        success("批量生成完成", parts.join("，"));
      }
      
      return { success: successCount, failed: failCount, skipped: skippedCount };
    },
    [beatsRef, generateFramePair, shouldUseChainReference, getPrevBeatForChain, success, showError, setBeats],
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
        showError("无可生成分镜", strategy === "skip_completed" ? "所有分镜已完成" : "请先生成首尾帧");
        return { success: 0, failed: 0, skipped: 0 };
      }

      const chainMode = options.chainMode || "auto";
      const confirmMessage = chainMode === "isolated"
        ? `即将为 ${targetBeats.length} 个分镜批量提交视频生成任务（隔离模式，各自独立生成）。\n\n是否继续？`
        : `即将为 ${targetBeats.length} 个分镜批量提交视频生成任务（串行提交，非首分镜将引用上一分镜的视频作为参考）。\n\n这可能需要较长时间，是否继续？`;

      const confirmed = await confirm(confirmMessage, "批量生成视频");
      if (!confirmed) return { success: 0, failed: 0, skipped: 0 };

      let successCount = 0;
      let failCount = 0;
      let skippedCount = 0;

      for (let i = 0; i < targetBeats.length; i++) {
        const beat = targetBeats[i];
        
        if (beat.uploadedVideo) {
          skippedCount++;
          continue;
        }
        
        const useChain = chainMode === "auto" ? shouldUseChainReference(beat, "video") : chainMode !== "isolated";
        const prevBeat = useChain ? getPrevBeatForChain(i, targetBeats, "video") : null;
        
        try {
          await generateVideoNew(beat.id, prevBeat);
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
        success("批量提交完成", `成功为 ${successCount} 个分镜提交视频生成任务`);
      } else {
        const parts = [];
        if (successCount > 0) parts.push(`成功 ${successCount} 个`);
        if (failCount > 0) parts.push(`失败 ${failCount} 个`);
        if (skippedCount > 0) parts.push(`跳过 ${skippedCount} 个（已上传）`);
        success("批量提交完成", parts.join("，"));
      }
      
      return { success: successCount, failed: failCount, skipped: skippedCount };
    },
    [beatsRef, generateVideoNew, shouldUseChainReference, getPrevBeatForChain, success, showError],
  );

  return {
    batchGenerateKeyframes,
    batchGenerateFramePairs,
    batchGenerateVideos,
    shouldUseChainReference,
    getPrevBeatForChain,
  };
}
