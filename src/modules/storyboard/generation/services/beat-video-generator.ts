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

export async function generateBeatVideo(
  beat: StoryBeat,
  options: {
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
  },
  providers: ProviderDeps,
): Promise<Result<{ taskId: string; videoUrl?: string; status: string; videoMode: VideoGenerationMode }>> {
  return fromAsyncThrowable(async () => {
    const generatedFirstFrameUrl = getFirstFrameUrl(beat.framePair);
    const uploadedFirstFrameUrl = beat.uploadedFramePair?.firstFrame;
    const firstFrameUrl = generatedFirstFrameUrl || uploadedFirstFrameUrl;
    const generatedLastFrameUrl = getLastFrameUrl(beat.framePair);
    const uploadedLastFrameUrl = beat.uploadedFramePair?.lastFrame;
    const lastFrameUrl = generatedLastFrameUrl || uploadedLastFrameUrl;

    if (!firstFrameUrl) {
      throw new ValidationError(t("error.videoRequiresFramePair"));
    }

    if (!/^https?:\/\//.test(firstFrameUrl) && !/^vcache:\/\//.test(firstFrameUrl) && !/^\//.test(firstFrameUrl)) {
      throw new ValidationError(t("error.videoInvalidFirstFrame"));
    }

    const resolvedVideoMode: VideoGenerationMode =
      options.videoMode && options.videoMode !== "auto"
        ? options.videoMode
        : determineVideoGenerationMode(beat, options.prevBeat ?? null);

    let referenceVideo: string | null = null;
    if (resolvedVideoMode === "reference_video_continuation" && options.prevVideoUrl) {
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
      if (probeParams?.supportsReferenceVideo !== false) {
        referenceVideo = options.prevVideoUrl;
      }
    }

    const promptText = options.prompt || beat.content || beat.description || "";
    if (!promptText.trim()) {
      throw new ValidationError(t("error.videoEmptyPrompt"));
    }

    // Task 3.2 Step 2：能力过滤统一由 getEffectiveVideoParams 完成
    // 合并 characterRefs 和 characterRef（单数），统一过滤
    let allCharRefs = options.characterRefs?.length
      ? options.characterRefs
      : (options.characterRef ? [options.characterRef] : undefined);

    // Task 2A.12: 自动一致性增强 — 当未手动指定 characterRefs 且提供了角色素材时，
    // 调用 consistency-enhancer 根据模型能力自动提取参考图
    if ((!allCharRefs || allCharRefs.length === 0) && options.characterAssets?.length && options.modelId) {
      const caps = getModelCapabilities(options.modelId);
      const consistencyCapability: ModelConsistencyCapability = {
        modelId: options.modelId,
        strategy: caps.consistencyStrategy ?? "unknown",
        maxCharacterRefs: caps.maxCharacterRefs ?? (caps.supportsCharacterRef ? 1 : 0),
      };
      allCharRefs = options.characterAssets.flatMap((asset) =>
        buildConsistencyEnhancedCharacterRefs(asset, consistencyCapability),
      );
    }

    const effectiveParams = options.modelId
      ? getEffectiveVideoParams({
          modelId: options.modelId,
          prompt: promptText,
          firstFrameUrl,
          lastFrameUrl,
          characterRefs: allCharRefs,
          sceneRef: options.sceneRef,
        })
      : null;

    // 无 modelId 时不做能力过滤，直接传递原始值
    const noFiltering = !options.modelId;
    const effectiveCharacterRefs = noFiltering ? allCharRefs : effectiveParams?.characterRefs;
    const effectiveCharacterRef = noFiltering
      ? (allCharRefs?.[0] ?? options.characterRef)
      : effectiveCharacterRefs?.[0];
    const effectiveSceneRef = noFiltering ? options.sceneRef : effectiveParams?.sceneRef;
    // 有 modelId 时用 effectiveParams 过滤后的 lastFrameUrl（supportsLastFrame=false 时为 undefined）
    const effectiveLastFrameUrl = noFiltering ? lastFrameUrl : effectiveParams?.lastFrameUrl;

    const result = await providers.videoProvider.generateVideoWithFrames({
      prompt: promptText,
      firstFrameUrl,
      lastFrameUrl: effectiveLastFrameUrl,
      characterRefs: effectiveCharacterRefs,
      characterRef: effectiveCharacterRef,
      sceneRef: effectiveSceneRef,
      duration: beat.duration,
      providerId: options.providerId,
      modelId: options.modelId,
      referenceVideo: referenceVideo,
    });

    if (!result.success || !result.data) {
      throw new Error(result.error || t("error.videoGenFailed"));
    }

    return {
      taskId: result.data.taskId ?? "",
      videoUrl: result.data.videoUrl,
      status: result.data.status || "pending",
      videoMode: resolvedVideoMode,
    };
  });
}
