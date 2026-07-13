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
  completeTitleKey: string;
  partialTitleKey: string;
  successDescKey: string;
}

interface BatchOperationConfig<T> {
  level: GenerationLevel;
  selectTargetBeats: (beats: StoryBeat[], beatIds?: string[]) => StoryBeat[];
  applySkipStrategy: (beats: StoryBeat[]) => StoryBeat[];
  emptySkipKey: string;
  emptyNoSkipKey: string;
  confirmTitleKey: string;
  confirmIsolatedKey: string;
  confirmChainKey: string;
  isAlreadyUploaded: (beat: StoryBeat) => boolean;
  generate: (beatId: string, prevBeat: StoryBeat | null) => Promise<T | void>;
  applySuccessResult: (result: T, targetBeats: StoryBeat[], index: number, setBeats: React.Dispatch<React.SetStateAction<StoryBeat[]>>) => void;
  errorLogKey: string;
  reportMessages: BatchMessages;
  delayMs?: number;
  breakOnFailure?: boolean;
  voidResult?: boolean;
  skipDelayOnFailure?: boolean;
}

function reportBatchResult(
  successFn: (title: string, description?: string) => void,
  showWarning: ((title: string, description?: string) => void) | undefined,
  counts: BatchCounts,
  messages: BatchMessages,
): void {
  const { success: successCount, failed: failCount, skipped: skippedCount } = counts;
  if (failCount === 0 && skippedCount === 0) {
    successFn(t(messages.completeTitleKey), t(messages.successDescKey, { count: successCount }));
    return;
  }
  const parts: string[] = [];
  if (successCount > 0) parts.push(t("batch.successCount", { count: successCount }));
  if (failCount > 0) parts.push(t("batch.failedCount", { count: failCount }));
  if (skippedCount > 0) parts.push(t("batch.skippedCount", { count: skippedCount }));
  if (failCount > 0 && showWarning) {
    showWarning(t(messages.partialTitleKey), parts.join("，"));
  } else {
    successFn(t(messages.completeTitleKey), parts.join("，"));
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

function buildKeyframeBatchConfig(
  generate: (beatId: string, prevBeat: StoryBeat | null) => Promise<StoryBeat | void>,
): BatchOperationConfig<StoryBeat> {
  return {
    level: "keyframe",
    selectTargetBeats: (beats, ids) =>
      ids ? beats.filter((b) => ids.includes(b.id)) : [...beats],
    applySkipStrategy: (beats) => beats.filter((b) => !b.keyframe?.imageUrl && !b.uploadedKeyframe),
    emptySkipKey: "batch.allCompleted",
    emptyNoSkipKey: "batch.addBeatsFirst",
    confirmTitleKey: "batch.confirmKeyframeTitle",
    confirmIsolatedKey: "batch.confirmKeyframeIsolated",
    confirmChainKey: "batch.confirmKeyframeChain",
    isAlreadyUploaded: (beat) => !!beat.uploadedKeyframe,
    generate,
    applySuccessResult: (result, targetBeats, index, setBeats) => {
      setBeats((prev) => prev.map((b) => b.id === result.id ? result : b));
      targetBeats[index] = result;
    },
    errorLogKey: "batch.keyframeFailedLog",
    reportMessages: {
      completeTitleKey: "batch.generateComplete",
      partialTitleKey: "batch.partialGenerateComplete",
      successDescKey: "batch.keyframeSuccessDesc",
    },
  };
}

function buildFramePairBatchConfig(
  generate: (beatId: string, prevBeat: StoryBeat | null) => Promise<StoryBeat | void>,
): BatchOperationConfig<StoryBeat> {
  return {
    level: "framepair",
    selectTargetBeats: (beats, ids) =>
      ids
        ? beats.filter((b) => ids.includes(b.id) && (b.keyframe?.imageUrl || b.uploadedKeyframe))
        : beats.filter((b) => b.keyframe?.imageUrl || b.uploadedKeyframe),
    applySkipStrategy: (beats) => beats.filter((b) => !getLastFrameUrl(b.framePair) && !b.uploadedFramePair?.lastFrame),
    emptySkipKey: "batch.allCompleted",
    emptyNoSkipKey: "batch.generateKeyframesFirst",
    confirmTitleKey: "batch.confirmFramePairTitle",
    confirmIsolatedKey: "batch.confirmFramePairIsolated",
    confirmChainKey: "batch.confirmFramePairChain",
    isAlreadyUploaded: (beat) => !!beat.uploadedFramePair?.lastFrame,
    generate,
    applySuccessResult: (result, targetBeats, index, setBeats) => {
      setBeats((prev) => prev.map((b) => b.id === result.id ? result : b));
      targetBeats[index] = result;
    },
    errorLogKey: "batch.framePairFailedLog",
    reportMessages: {
      completeTitleKey: "batch.generateComplete",
      partialTitleKey: "batch.partialGenerateComplete",
      successDescKey: "batch.framePairSuccessDesc",
    },
  };
}

function buildVideoBatchConfig(
  generate: (beatId: string, prevBeat: StoryBeat | null) => Promise<void>,
): BatchOperationConfig<void> {
  return {
    level: "video",
    selectTargetBeats: (beats, ids) =>
      ids
        ? beats.filter((b) => ids.includes(b.id) && (getFirstFrameUrl(b.framePair) || b.uploadedFramePair?.firstFrame))
        : beats.filter((b) => getFirstFrameUrl(b.framePair) || b.uploadedFramePair?.firstFrame),
    applySkipStrategy: (beats) => beats.filter((b) => !b.videoGen?.videoUrl && !b.uploadedVideo),
    emptySkipKey: "batch.allCompleted",
    emptyNoSkipKey: "batch.generateFramePairsFirst",
    confirmTitleKey: "batch.confirmVideoTitle",
    confirmIsolatedKey: "batch.confirmVideoIsolated",
    confirmChainKey: "batch.confirmVideoChain",
    isAlreadyUploaded: (beat) => !!beat.uploadedVideo,
    generate,
    applySuccessResult: () => { /* video generation has no return value to apply */ },
    errorLogKey: "batch.videoFailedLog",
    reportMessages: {
      completeTitleKey: "batch.submitComplete",
      partialTitleKey: "batch.partialSubmitComplete",
      successDescKey: "batch.videoSuccessDesc",
    },
    delayMs: 100,
    breakOnFailure: true,
    voidResult: true,
    skipDelayOnFailure: false,
  };
}

interface BatchRunArgs {
  beatsRef: React.MutableRefObject<StoryBeat[]>;
  setBeats: React.Dispatch<React.SetStateAction<StoryBeat[]>>;
  beatIds?: string[];
  options: BatchOptions;
  cancelledRef: React.MutableRefObject<boolean>;
  shouldUseChainReference: (beat: StoryBeat, level: GenerationLevel) => boolean;
  getPrevBeatForChain: (index: number, targetBeats: StoryBeat[], level: GenerationLevel) => StoryBeat | null;
  success: (title: string, description?: string) => void;
  showError: (title: string, description?: string) => void;
  showWarning?: (title: string, description?: string) => void;
}

function resolveChainPrevBeat(
  cfg: BatchOperationConfig<unknown>,
  args: BatchRunArgs,
  chainMode: ChainMode,
  beat: StoryBeat,
  index: number,
  targetBeats: StoryBeat[],
): StoryBeat | null {
  const useChain = chainMode === "auto"
    ? args.shouldUseChainReference(beat, cfg.level)
    : chainMode !== "isolated";
  return useChain ? args.getPrevBeatForChain(index, targetBeats, cfg.level) : null;
}

async function executeBeatAttempt<T>(
  cfg: BatchOperationConfig<T>,
  beatId: string,
  prevBeat: StoryBeat | null,
): Promise<{ success: boolean; result?: T }> {
  const { result, failed } = await executeBeatWithRetry(
    () => cfg.generate(beatId, prevBeat),
    1,
  );
  if (failed || (!cfg.voidResult && !result)) {
    return { success: false };
  }
  return { success: true, result: result as T };
}

interface BeatProcessResult {
  shouldBreak: boolean;
  shouldSkipDelay: boolean;
}

async function processBeat<T>(
  cfg: BatchOperationConfig<T>,
  args: BatchRunArgs,
  beat: StoryBeat,
  index: number,
  targetBeats: StoryBeat[],
  chainMode: ChainMode,
  opts: { skipOnError: boolean; continueOnFallback: boolean; skipDelayOnFailure: boolean },
  counts: BatchCounts,
): Promise<BeatProcessResult> {
  if (cfg.isAlreadyUploaded(beat)) {
    counts.skipped++;
    return { shouldBreak: false, shouldSkipDelay: false };
  }

  const prevBeat = resolveChainPrevBeat(
    cfg as BatchOperationConfig<unknown>,
    args,
    chainMode,
    beat,
    index,
    targetBeats,
  );

  let beatFailed = false;
  let shouldSkipDelay = false;
  try {
    if (args.cancelledRef.current) return { shouldBreak: true, shouldSkipDelay: false };
    const attempt = await executeBeatAttempt(cfg, beat.id, prevBeat);
    if (args.cancelledRef.current) return { shouldBreak: true, shouldSkipDelay: false };
    if (attempt.success && attempt.result !== undefined) {
      counts.success++;
      if (!cfg.voidResult && attempt.result) {
        cfg.applySuccessResult(attempt.result, targetBeats, index, args.setBeats);
      }
    } else if (attempt.success) {
      counts.success++;
    } else {
      counts.failed++;
      beatFailed = true;
      if (opts.skipOnError && opts.skipDelayOnFailure) shouldSkipDelay = true;
    }
  } catch (err) {
    counts.failed++;
    beatFailed = true;
    errorLogger.warn(`${t(cfg.errorLogKey)} (beat ${beat.id}):`, err);
    if (opts.skipOnError && opts.continueOnFallback && opts.skipDelayOnFailure) shouldSkipDelay = true;
  }
  if (args.cancelledRef.current) return { shouldBreak: true, shouldSkipDelay: false };
  if (beatFailed && cfg.breakOnFailure && (!opts.skipOnError || !opts.continueOnFallback)) {
    return { shouldBreak: true, shouldSkipDelay: false };
  }
  return { shouldBreak: false, shouldSkipDelay };
}

async function runBatchOperation<T>(
  cfg: BatchOperationConfig<T>,
  args: BatchRunArgs,
): Promise<BatchResult> {
  const { strategy = "all_serial", skipOnError = true, continueOnFallback = true } = args.options;
  const { beatsRef, cancelledRef, success, showError, showWarning } = args;

  let targetBeats = cfg.selectTargetBeats(beatsRef.current, args.beatIds);
  if (strategy === "skip_completed") {
    targetBeats = cfg.applySkipStrategy(targetBeats);
  }

  if (targetBeats.length === 0) {
    showError(
      t("batch.noBeatsToGenerate"),
      strategy === "skip_completed" ? t(cfg.emptySkipKey) : t(cfg.emptyNoSkipKey),
    );
    return { success: 0, failed: 0, skipped: 0 };
  }

  const chainMode = args.options.chainMode || "auto";
  const confirmMessage = chainMode === "isolated"
    ? t(cfg.confirmIsolatedKey, { count: targetBeats.length })
    : t(cfg.confirmChainKey, { count: targetBeats.length });

  const confirmed = await confirm(confirmMessage, t(cfg.confirmTitleKey));
  if (!confirmed) return { success: 0, failed: 0, skipped: 0 };

  const counts: BatchCounts = { success: 0, failed: 0, skipped: 0 };
  const delayMs = cfg.delayMs ?? BATCH_OPERATION_INTERVAL_MS;
  const skipDelayOnFailure = cfg.skipDelayOnFailure ?? true;
  const opts = { skipOnError, continueOnFallback, skipDelayOnFailure };

  for (let i = 0; i < targetBeats.length; i++) {
    if (cancelledRef.current) break;
    const beat = targetBeats[i]!;
    const result = await processBeat(cfg, args, beat, i, targetBeats, chainMode, opts, counts);
    if (result.shouldBreak) break;
    if (!result.shouldSkipDelay && i < targetBeats.length - 1) {
      await waitForDelay(delayMs);
    }
  }

  reportBatchResult(success, showWarning, counts, cfg.reportMessages);
  return counts;
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
    async (beatIds?: string[], options: BatchOptions = {}): Promise<BatchResult> => {
      return runBatchOperation(
        buildKeyframeBatchConfig(generateKeyframe),
        { beatsRef, setBeats, beatIds, options, cancelledRef, shouldUseChainReference, getPrevBeatForChain, success, showError, showWarning },
      );
    },
    [beatsRef, generateKeyframe, shouldUseChainReference, getPrevBeatForChain, success, showError, showWarning, setBeats],
  );

  const batchGenerateFramePairs = useCallback(
    async (beatIds?: string[], options: BatchOptions = {}): Promise<BatchResult> => {
      return runBatchOperation(
        buildFramePairBatchConfig(generateFramePair),
        { beatsRef, setBeats, beatIds, options, cancelledRef, shouldUseChainReference, getPrevBeatForChain, success, showError, showWarning },
      );
    },
    [beatsRef, generateFramePair, shouldUseChainReference, getPrevBeatForChain, success, showError, showWarning, setBeats],
  );

  const batchGenerateVideos = useCallback(
    async (beatIds?: string[], options: BatchOptions = {}): Promise<BatchResult> => {
      return runBatchOperation(
        buildVideoBatchConfig(generateVideoNew),
        { beatsRef, setBeats, beatIds, options, cancelledRef, shouldUseChainReference, getPrevBeatForChain, success, showError, showWarning },
      );
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
