import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Sparkles, Loader2, Brush } from "lucide-react";
import { t } from "@/shared/constants";
import { resolveMediaUrl } from "@/shared/utils/image-url";
import type { StoryBeat, GenerationAsset } from "@/domain/schemas";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { listAssetsByBeat, createAsset } from "@/modules/asset";
import type { BeatUploadPanelHandle } from "./BeatUploadPanel";
import {
  KeyframePreviewCard,
  FramePairPreviewCard,
  VideoGenerationCard,
  LightboxDialog,
  runOneClickGenerate,
} from "./BeatGenerationPanelParts";

// Task 2A.22：动态加载 PartialEditPanel，避免 Canvas/Mask 代码进入首屏 bundle
const PartialEditPanel = lazy(() =>
  import("@/modules/video").then((m) => ({ default: m.PartialEditPanel })),
);

interface BeatGenerationPanelProps {
  beat: StoryBeat;
  onGenerateKeyframe?: () => Promise<StoryBeat | void>;
  onGenerateFramePair?: () => Promise<StoryBeat | void>;
  onGenerateVideoNew?: () => Promise<StoryBeat | void>;
  onRegenerateKeyframe?: () => Promise<void>;
  generatingKeyframe?: boolean;
  imageModelId?: string;
  uploadPanelHandle: React.RefObject<BeatUploadPanelHandle | null>;
}

export function BeatGenerationPanel({
  beat,
  onGenerateKeyframe,
  onGenerateFramePair,
  onGenerateVideoNew,
  onRegenerateKeyframe,
  generatingKeyframe,
  imageModelId,
  uploadPanelHandle,
}: BeatGenerationPanelProps) {
  const { error: showError, success: showSuccess } = useToastHelpers();
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // Task 2A.22: 局部重绘 modal 状态
  const [partialEditAsset, setPartialEditAsset] = useState<GenerationAsset | null>(null);
  const [partialEditLoading, setPartialEditLoading] = useState(false);

  const keyframeImage = resolveMediaUrl(beat.localKeyframePath, beat.keyframe?.imageUrl) ?? null;
  const firstFrameImage = resolveMediaUrl(beat.localFirstFramePath, beat.framePair?.firstFrame?.imageUrl) ?? null;
  const lastFrameImage = resolveMediaUrl(beat.localLastFramePath, beat.framePair?.lastFrame?.imageUrl) ?? null;
  const videoUrl = resolveMediaUrl(beat.localVideoPath, beat.videoGen?.videoUrl) ?? null;

  const handleOneClickGenerate = () =>
    runOneClickGenerate({
      beat,
      onGenerateKeyframe,
      onGenerateFramePair,
      onGenerateVideoNew,
      showError,
    });

  // Task 2A.22: 启动局部重绘
  // 1. 查询 beat 关联的视频 Asset（type='video'）
  // 2. 若不存在但 beat 已有视频 URL，则现场创建一个 Asset 记录
  // 3. 打开 PartialEditPanel modal
  const handleStartPartialEdit = useCallback(async () => {
    if (!videoUrl) {
      showError(t("video.partialEditSourceNotFound"), t("video.partialEditMaskEmpty"));
      return;
    }
    setPartialEditLoading(true);
    try {
      const allAssets = await listAssetsByBeat(beat.id);
      const videoAsset = allAssets.find((a) => a.type === "video");
      if (videoAsset) {
        setPartialEditAsset(videoAsset);
        return;
      }
      // 若未找到 video Asset，但 beat 有视频 URL，现场创建一个 Asset 记录
      // 这样局部重绘产出的 partial_edit_video 也能正确关联到原 Asset
      const created = await createAsset({
        type: "video",
        sourceType: "ai_generated",
        url: videoUrl,
        localPath: beat.localVideoPath,
        prompt: beat.videoGen?.prompt ?? beat.imageGenerationPrompt ?? beat.description,
        modelId: imageModelId,
        storyBeatId: beat.id,
      });
      showSuccess(t("video.partialEditAssetCreated"));
      setPartialEditAsset(created);
    } catch (e) {
      showError(
        t("video.partialEditFailed"),
        e instanceof Error ? e.message : String(e),
      );
    } finally {
      setPartialEditLoading(false);
    }
  }, [videoUrl, beat.id, beat.localVideoPath, beat.videoGen?.prompt, beat.imageGenerationPrompt, beat.description, imageModelId, showError, showSuccess]);

  // 任务提交后刷新（目前 PartialEditPanel 内部已通过 historyRefreshTrigger 自动刷新历史，
  // 这里仅作为示例钩子点，未来可扩展为刷新 AssetGallery 等）
  useEffect(() => {
    // no-op：保留给未来扩展（如刷新外部 AssetGallery）
  }, [partialEditAsset]);

  return (
    <div
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <KeyframePreviewCard
        keyframeImage={keyframeImage}
        beatTitle={beat.title || ""}
        generatingKeyframe={generatingKeyframe}
        onGenerate={onGenerateKeyframe}
        onRegenerate={onRegenerateKeyframe}
        uploadPanelHandle={uploadPanelHandle}
        onImageClick={setLightboxImage}
      />

      <FramePairPreviewCard
        firstFrameImage={firstFrameImage}
        lastFrameImage={lastFrameImage}
        generatingKeyframe={generatingKeyframe}
        onGenerate={onGenerateFramePair}
        uploadPanelHandle={uploadPanelHandle}
        onImageClick={setLightboxImage}
      />

      <VideoGenerationCard
        videoUrl={videoUrl}
        imageModelId={imageModelId}
        generatingKeyframe={generatingKeyframe}
        onGenerate={onGenerateVideoNew}
        uploadPanelHandle={uploadPanelHandle}
      />

      {/* Task 2A.22: 局部重绘入口 — 仅在视频已生成时显示 */}
      {videoUrl && (
        <button
          type="button"
          className="btn btn-outline btn-sm"
          style={{ width: "100%", justifyContent: "center", gap: 6 }}
          onClick={handleStartPartialEdit}
          disabled={partialEditLoading || generatingKeyframe}
          title={t("video.partialEditDescription")}
        >
          {partialEditLoading ? (
            <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" aria-hidden="true" />
          ) : (
            <Brush style={{ width: 14, height: 14 }} aria-hidden="true" />
          )}
          {t("video.partialEditStart")}
        </button>
      )}

      <button
        className="btn btn-primary btn-sm"
        style={{ width: "100%", justifyContent: "center" }}
        onClick={handleOneClickGenerate}
        disabled={generatingKeyframe}
      >
        <Sparkles style={{ width: 14, height: 14 }} aria-hidden="true" /> {t("keyframe.oneClickGenerate")}
      </button>

      {lightboxImage && (
        <LightboxDialog
          image={lightboxImage}
          onClose={() => setLightboxImage(null)}
        />
      )}

      {/* Task 2A.22: 局部重绘 modal */}
      {partialEditAsset && (
        <Suspense
          fallback={
            <div
              style={{
                position: "fixed",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(0,0,0,0.4)",
                zIndex: 100,
              }}
            >
              <Loader2 size={32} className="animate-spin" aria-hidden="true" />
            </div>
          }
        >
          <PartialEditPanel
            open={true}
            modal={true}
            sourceVideoAssetId={partialEditAsset.id}
            sourceVideoUrl={resolveMediaUrl(partialEditAsset.localPath, partialEditAsset.url) ?? videoUrl ?? ""}
            beatId={beat.id}
            modelId={imageModelId}
            onClose={() => setPartialEditAsset(null)}
          />
        </Suspense>
      )}
    </div>
  );
}
