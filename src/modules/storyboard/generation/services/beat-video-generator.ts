/**
 * @file beat-video-generator — 单分镜视频生成
 *
 * 职责：
 * - 为单个 StoryBeat 生成视频（generateBeatVideo / generateBeatFramePair）
 * - 根据模型能力自适应选择生成策略（首尾帧 / 仅首帧 / 纯文本）
 * - 调用 video-service 的 HTTP API 与主进程通信
 * - 返回 Result 类型，不抛异常（由 fromAsyncThrowable 包装）
 *
 * 调用方：
 * - story 模块的批量视频生成流程
 * - Agent 工具（video-tools.ts 的 generate_beat_video）
 *
 * 不做：
 * - 不做批量编排（由 story 模块上层负责）
 * - 不直接管理任务状态（由 video task-management 负责）
 */

import type { Result } from "@/domain/types";
import { fromAsyncThrowable, ValidationError } from "@/domain/types";
import type { StoryBeat } from "@/domain/schemas";
import { getFirstFrameUrl, getLastFrameUrl } from "@/domain/utils";
import { type ProviderDeps, type VideoGenerationMode, determineVideoGenerationMode } from "./video-generation-mode";
import { getEffectiveVideoParams, getModelCapabilities } from "@/shared/model-capabilities";
import { buildConsistencyEnhancedCharacterRefs, type CharacterAssetInput, type ModelConsistencyCapability } from "@/shared-logic/shot";
import { t } from "@/shared/constants";

interface BeatVideoOptions {
  characterRefs?: string[];
  characterRef?: string;
  sceneRef?: string;
  prompt?: string;
  prevVideoUrl?: string;
  providerId?: string;
  modelId?: string;
  videoMode?: VideoGenerationMode;
  prevBeat?: StoryBeat | null;
  /**
   * Task 2A.12: 角色素材列表（用于自动一致性增强）。
   * 当 characterRefs 为空且 modelId 提供时，自动调用 consistency-enhancer 提取参考图。
   * 调用方只需提供角色素材（主图+变体+造型），无需手动选图。
   */
  characterAssets?: CharacterAssetInput[];
}

/** 解析 firstFrame / lastFrame URL（优先使用 uploaded，其次 generated） */
function resolveFrameUrls(beat: StoryBeat): { firstFrameUrl: string | undefined; lastFrameUrl: string | undefined } {
  const generatedFirstFrameUrl = getFirstFrameUrl(beat.framePair);
  const uploadedFirstFrameUrl = beat.uploadedFramePair?.firstFrame;
  const firstFrameUrl = generatedFirstFrameUrl || uploadedFirstFrameUrl;
  const generatedLastFrameUrl = getLastFrameUrl(beat.framePair);
  const uploadedLastFrameUrl = beat.uploadedFramePair?.lastFrame;
  const lastFrameUrl = generatedLastFrameUrl || uploadedLastFrameUrl;
  return { firstFrameUrl, lastFrameUrl };
}

/** 校验 firstFrameUrl 协议（http(s)://, vcache://, 或本地路径） */
function validateFirstFrameUrl(firstFrameUrl: string | undefined): asserts firstFrameUrl is string {
  if (!firstFrameUrl) {
    throw new ValidationError(t("error.videoRequiresFramePair"));
  }
  if (!/^https?:\/\//.test(firstFrameUrl) && !/^vcache:\/\//.test(firstFrameUrl) && !/^\//.test(firstFrameUrl)) {
    throw new ValidationError(t("error.videoInvalidFirstFrame"));
  }
}

/** 解析 videoMode，处理 auto → 实际模式 */
function resolveVideoMode(
  options: BeatVideoOptions,
  beat: StoryBeat,
): VideoGenerationMode {
  return options.videoMode && options.videoMode !== "auto"
    ? options.videoMode
    : determineVideoGenerationMode(beat, options.prevBeat ?? null);
}

/** 探测模型是否支持 referenceVideo，返回应使用的 referenceVideo URL 或 null */
function resolveReferenceVideo(
  options: BeatVideoOptions,
  resolvedVideoMode: VideoGenerationMode,
  firstFrameUrl: string,
  lastFrameUrl: string | undefined,
): string | null {
  if (resolvedVideoMode !== "reference_video_continuation" || !options.prevVideoUrl) {
    return null;
  }
  // Task 3.2 Step 2：使用 getEffectiveVideoParams 获取 supportsReferenceVideo
  const probeParams = options.modelId
    ? getEffectiveVideoParams({
        modelId: options.modelId,
        prompt: "",
        firstFrameUrl,
        lastFrameUrl,
        characterRefs: options.characterRefs,
        sceneRef: options.sceneRef,
      })
    : null;
  // 不支持时返回 null；支持或未知时使用 prevVideoUrl
  if (probeParams?.supportsReferenceVideo === false) return null;
  return options.prevVideoUrl;
}

/**
 * 按全局配额收集角色参考图。
 * P0 修复：maxCharacterRefs 是模型全局上限，不能每角色独立截断后 flatMap
 * （3 角色 × max3 = 9 张会超出全局上限）。改为按角色均分配额后全局截断。
 *
 * - 第一轮：每角色取前 perCharQuota 张
 * - 第二轮：若仍有余量，按角色顺序补足剩余候选
 */
function collectCharRefsByQuota(
  perAssetCandidates: string[][],
  globalMaxRefs: number,
): string[] {
  const numChars = perAssetCandidates.length;
  if (numChars === 0 || globalMaxRefs <= 0) return [];

  const perCharQuota = Math.max(1, Math.floor(globalMaxRefs / numChars));
  const collected: string[] = [];

  // 第一轮：每角色取前 perCharQuota 张
  for (const candidates of perAssetCandidates) {
    for (let i = 0; i < perCharQuota && collected.length < globalMaxRefs; i++) {
      const ref = candidates[i];
      if (ref) collected.push(ref);
    }
    if (collected.length >= globalMaxRefs) break;
  }

  // 第二轮：若仍有余量，按角色顺序补足剩余候选
  if (collected.length < globalMaxRefs) {
    for (const candidates of perAssetCandidates) {
      for (let i = perCharQuota; i < candidates.length && collected.length < globalMaxRefs; i++) {
        const ref = candidates[i];
        if (ref) collected.push(ref);
      }
      if (collected.length >= globalMaxRefs) break;
    }
  }

  return collected;
}

/**
 * Task 2A.12: 自动一致性增强 — 当未手动指定 characterRefs 且提供了角色素材时，
 * 调用 consistency-enhancer 根据模型能力自动提取参考图。
 */
function autoEnhanceCharacterRefs(
  options: BeatVideoOptions,
  allCharRefs: string[] | undefined,
): string[] | undefined {
  // 已有手动 refs 或缺少必要输入时，不增强
  if (allCharRefs && allCharRefs.length > 0) return allCharRefs;
  if (!options.characterAssets?.length || !options.modelId) return allCharRefs;

  const caps = getModelCapabilities(options.modelId);
  const globalMaxRefs = caps.maxCharacterRefs ?? (caps.supportsCharacterRef ? 1 : 0);
  if (globalMaxRefs <= 0) return allCharRefs;

  const consistencyCapability: ModelConsistencyCapability = {
    modelId: options.modelId,
    strategy: caps.consistencyStrategy ?? "unknown",
    maxCharacterRefs: globalMaxRefs,
  };
  const perAssetCandidates = options.characterAssets.map((asset) =>
    buildConsistencyEnhancedCharacterRefs(asset, consistencyCapability),
  );
  return collectCharRefsByQuota(perAssetCandidates, globalMaxRefs);
}

interface EffectiveFields {
  characterRefs: string[] | undefined;
  characterRef: string | undefined;
  sceneRef: string | undefined;
  lastFrameUrl: string | undefined;
}

/** 计算应用能力过滤后的有效字段（无 modelId 时直接透传原始值） */
function resolveEffectiveFields(
  options: BeatVideoOptions,
  allCharRefs: string[] | undefined,
  lastFrameUrl: string | undefined,
  promptText: string,
  firstFrameUrl: string,
): EffectiveFields {
  // 无 modelId 时不做能力过滤，直接传递原始值
  if (!options.modelId) {
    return {
      characterRefs: allCharRefs,
      characterRef: allCharRefs?.[0] ?? options.characterRef,
      sceneRef: options.sceneRef,
      lastFrameUrl,
    };
  }

  const effectiveParams = getEffectiveVideoParams({
    modelId: options.modelId,
    prompt: promptText,
    firstFrameUrl,
    lastFrameUrl,
    characterRefs: allCharRefs,
    sceneRef: options.sceneRef,
  });
  return {
    characterRefs: effectiveParams?.characterRefs,
    characterRef: effectiveParams?.characterRefs?.[0],
    sceneRef: effectiveParams?.sceneRef,
    // 有 modelId 时用 effectiveParams 过滤后的 lastFrameUrl（supportsLastFrame=false 时为 undefined）
    lastFrameUrl: effectiveParams?.lastFrameUrl,
  };
}

/** 解析 prompt 文本，空时抛 ValidationError */
function resolvePromptText(beat: StoryBeat, options: BeatVideoOptions): string {
  const promptText = options.prompt || beat.content || beat.description || "";
  if (!promptText.trim()) {
    throw new ValidationError(t("error.videoEmptyPrompt"));
  }
  return promptText;
}

/** 合并 characterRefs（数组）和 characterRef（单数） */
function mergeBaseCharRefs(options: BeatVideoOptions): string[] | undefined {
  if (options.characterRefs?.length) return options.characterRefs;
  return options.characterRef ? [options.characterRef] : undefined;
}

/** 调用 videoProvider 并校验返回结果，失败时抛出错误 */
async function callVideoProvider(
  providers: ProviderDeps,
  params: {
    prompt: string;
    firstFrameUrl: string;
    lastFrameUrl: string | undefined;
    characterRefs: string[] | undefined;
    characterRef: string | undefined;
    sceneRef: string | undefined;
    duration: number | undefined;
    providerId?: string;
    modelId?: string;
    referenceVideo: string | null;
  },
): Promise<{ taskId: string; videoUrl?: string; status: string }> {
  const result = await providers.videoProvider.generateVideoWithFrames({
    prompt: params.prompt,
    firstFrameUrl: params.firstFrameUrl,
    lastFrameUrl: params.lastFrameUrl,
    characterRefs: params.characterRefs,
    characterRef: params.characterRef,
    sceneRef: params.sceneRef,
    duration: params.duration,
    providerId: params.providerId,
    modelId: params.modelId,
    referenceVideo: params.referenceVideo,
  });

  if (!result.success || !result.data) {
    throw new Error(result.error || t("error.videoGenFailed"));
  }

  return {
    taskId: result.data.taskId ?? "",
    videoUrl: result.data.videoUrl,
    status: result.data.status || "pending",
  };
}

export async function generateBeatVideo(
  beat: StoryBeat,
  options: BeatVideoOptions,
  providers: ProviderDeps,
): Promise<Result<{ taskId: string; videoUrl?: string; status: string; videoMode: VideoGenerationMode }>> {
  return fromAsyncThrowable(async () => {
    const { firstFrameUrl, lastFrameUrl } = resolveFrameUrls(beat);
    validateFirstFrameUrl(firstFrameUrl);

    const resolvedVideoMode = resolveVideoMode(options, beat);
    const referenceVideo = resolveReferenceVideo(options, resolvedVideoMode, firstFrameUrl, lastFrameUrl);

    const promptText = resolvePromptText(beat, options);

    // Task 3.2 Step 2：能力过滤统一由 getEffectiveVideoParams 完成
    const baseCharRefs = mergeBaseCharRefs(options);
    // Task 2A.12: 自动一致性增强
    const allCharRefs = autoEnhanceCharacterRefs(options, baseCharRefs);

    const effective = resolveEffectiveFields(options, allCharRefs, lastFrameUrl, promptText, firstFrameUrl);

    const videoResult = await callVideoProvider(providers, {
      prompt: promptText,
      firstFrameUrl,
      lastFrameUrl: effective.lastFrameUrl,
      characterRefs: effective.characterRefs,
      characterRef: effective.characterRef,
      sceneRef: effective.sceneRef,
      duration: beat.duration,
      providerId: options.providerId,
      modelId: options.modelId,
      referenceVideo,
    });

    return {
      taskId: videoResult.taskId,
      videoUrl: videoResult.videoUrl,
      status: videoResult.status,
      videoMode: resolvedVideoMode,
    };
  });
}
