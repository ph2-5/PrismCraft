import type { Result } from "@/domain/types";
import { fromAsyncThrowable, ValidationError } from "@/domain/types";
import type { StoryBeat } from "@/domain/schemas";
import { type ProviderDeps, type VideoGenerationMode, determineVideoGenerationMode } from "./video-generation-mode";

export async function generateBeatVideo(
  beat: StoryBeat,
  options: {
    characterRef?: string;
    sceneRef?: string;
    prompt?: string;
    prevVideoUrl?: string;
    providerId?: string;
    modelId?: string;
    videoMode?: VideoGenerationMode;
    prevBeat?: StoryBeat | null;
  },
  providers: ProviderDeps,
): Promise<Result<{ taskId: string; videoUrl?: string; status: string; videoMode: VideoGenerationMode }>> {
  return fromAsyncThrowable(async () => {
    if (!beat.framePair?.firstFrameUrl) {
      throw new ValidationError("生成视频前必须先生成首尾帧");
    }

    if (!/^https?:\/\//.test(beat.framePair.firstFrameUrl) && !/^vcache:\/\//.test(beat.framePair.firstFrameUrl) && !/^\//.test(beat.framePair.firstFrameUrl)) {
      throw new ValidationError("首帧图片 URL 无效，请重新生成首尾帧");
    }

    const resolvedVideoMode: VideoGenerationMode =
      options.videoMode && options.videoMode !== "auto"
        ? options.videoMode
        : determineVideoGenerationMode(beat, options.prevBeat ?? null);

    let referenceVideo: string | null = null;
    if (resolvedVideoMode === "reference_video_continuation" && options.prevVideoUrl) {
      referenceVideo = options.prevVideoUrl;
    }

    const promptText = options.prompt || beat.content || beat.description || "";
    if (!promptText.trim()) {
      throw new ValidationError("无法生成视频：提示词为空，请填写分镜内容");
    }

    const result = await providers.videoProvider.generateVideoWithFrames({
      prompt: promptText,
      firstFrameUrl: beat.framePair.firstFrameUrl,
      lastFrameUrl: beat.framePair.lastFrameUrl,
      characterRef: options.characterRef,
      sceneRef: options.sceneRef,
      duration: beat.duration,
      providerId: options.providerId,
      modelId: options.modelId,
      referenceVideo: referenceVideo,
    });

    if (!result.success || !result.data) {
      throw new Error(result.error || "视频生成失败");
    }

    return {
      taskId: result.data.taskId ?? "",
      videoUrl: result.data.videoUrl,
      status: result.data.status || "pending",
      videoMode: resolvedVideoMode,
    };
  });
}
