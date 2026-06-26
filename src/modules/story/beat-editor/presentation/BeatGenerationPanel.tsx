import { useState } from "react";
import { t } from "@/shared/constants";
import { resolveMediaUrl } from "@/shared/utils/image-url";
import type { StoryBeat } from "@/domain/schemas";
import { useToastHelpers } from "@/shared/presentation/Toast";
import type { BeatUploadPanelHandle } from "./BeatUploadPanel";

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
  const { error: showError } = useToastHelpers();
  // Lightbox state - 点击图片放大查看
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  const handleOneClickGenerate = async () => {
    try {
      const hasKeyframe = !!beat.keyframe?.imageUrl;
      const hasFramePair =
        !!beat.framePair?.firstFrame?.imageUrl &&
        !!beat.framePair?.lastFrame?.imageUrl;
      const hasVideo = !!beat.videoGen?.videoUrl;
      if (!hasKeyframe && onGenerateKeyframe) await onGenerateKeyframe();
      if (!hasFramePair && onGenerateFramePair) await onGenerateFramePair();
      if (!hasVideo && onGenerateVideoNew) await onGenerateVideoNew();
    } catch (err) {
      const message = err instanceof Error ? err.message : t("error.keyframeBatchFailed");
      showError(t("error.keyframeBatchFailed"), message);
    }
  };

  const keyframeImage = resolveMediaUrl(beat.localKeyframePath, beat.keyframe?.imageUrl);
  const firstFrameImage = resolveMediaUrl(beat.localFirstFramePath, beat.framePair?.firstFrame?.imageUrl);
  const lastFrameImage = resolveMediaUrl(beat.localLastFramePath, beat.framePair?.lastFrame?.imageUrl);
  const videoUrl = resolveMediaUrl(beat.localVideoPath, beat.videoGen?.videoUrl);

  return (
    <div
      style={{
        width: 220,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {/* Keyframe preview */}
      <div className="card" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-fg)" }}>
          {t("beat.keyframePreview")}
        </div>
        <div
          style={{
            width: "100%",
            aspectRatio: "16 / 9",
            background: keyframeImage ? "transparent" : "var(--card2)",
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 36,
            opacity: keyframeImage ? 1 : 0.6,
            overflow: "hidden",
          }}
        >
          {keyframeImage ? (
            <img
              src={keyframeImage}
              alt={beat.title || ""}
              title={t("beat.clickToEnlarge")}
              onClick={() => setLightboxImage(keyframeImage)}
              style={{ width: "100%", height: "100%", objectFit: "cover", cursor: "zoom-in" }}
            />
          ) : (
            <span aria-hidden="true">🌅</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "center" }}>
          <button
            className="btn btn-primary btn-sm"
            onClick={onGenerateKeyframe}
            disabled={generatingKeyframe}
          >
            {t("common.generate")}
          </button>
          <button
            className="btn btn-outline btn-xs"
            onClick={() => uploadPanelHandle.current?.triggerKeyframeUpload()}
            aria-label={t("common.upload")}
          >
            <span aria-hidden="true">📤</span>
          </button>
          {onRegenerateKeyframe && keyframeImage && (
            <button
              className="btn btn-outline btn-xs"
              onClick={onRegenerateKeyframe}
              disabled={generatingKeyframe}
              aria-label={t("common.regenerate")}
            >
              🔄
            </button>
          )}
        </div>
      </div>

      {/* First-last frame preview */}
      <div className="card" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-fg)" }}>
          {t("beat.firstLastFrame")}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%" }}>
          <div
            style={{
              width: "100%",
              aspectRatio: "16 / 9",
              background: firstFrameImage ? "transparent" : "var(--card2)",
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              opacity: firstFrameImage ? 1 : 0.5,
              overflow: "hidden",
              position: "relative",
            }}
          >
            {firstFrameImage ? (
              <img
                src={firstFrameImage}
                alt="first frame"
                title={t("beat.clickToEnlarge")}
                onClick={() => setLightboxImage(firstFrameImage)}
                style={{ width: "100%", height: "100%", objectFit: "cover", cursor: "zoom-in" }}
              />
            ) : (
              <span>首帧</span>
            )}
          </div>
          <div
            style={{
              width: "100%",
              aspectRatio: "16 / 9",
              background: lastFrameImage ? "transparent" : "var(--card2)",
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              opacity: lastFrameImage ? 1 : 0.5,
              overflow: "hidden",
              position: "relative",
            }}
          >
            {lastFrameImage ? (
              <img
                src={lastFrameImage}
                alt="last frame"
                title={t("beat.clickToEnlarge")}
                onClick={() => setLightboxImage(lastFrameImage)}
                style={{ width: "100%", height: "100%", objectFit: "cover", cursor: "zoom-in" }}
              />
            ) : (
              <span>尾帧</span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "center" }}>
          <button
            className="btn btn-primary btn-sm"
            onClick={onGenerateFramePair}
            disabled={generatingKeyframe}
          >
            {t("common.generate")}
          </button>
          <button
            className="btn btn-outline btn-xs"
            onClick={() => uploadPanelHandle.current?.triggerFirstFrameUpload()}
            aria-label={t("keyframe.uploadFirstFrame")}
          >
            <span aria-hidden="true">📤</span>
          </button>
          <button
            className="btn btn-outline btn-xs"
            onClick={() => uploadPanelHandle.current?.triggerLastFrameUpload()}
            aria-label={t("keyframe.uploadLastFrame")}
          >
            <span aria-hidden="true">📥</span>
          </button>
        </div>
      </div>

      {/* Video generation preview */}
      <div className="card" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-fg)" }}>
          {t("beat.videoGeneration")}
        </div>
        <div
          style={{
            width: "100%",
            aspectRatio: "16 / 9",
            background: "var(--card2)",
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 24,
            opacity: 0.4,
            overflow: "hidden",
          }}
        >
          {videoUrl ? (
            <video
              src={videoUrl}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
              controls
            />
          ) : (
            <span aria-hidden="true">▶️</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "center" }}>
          {imageModelId && (
            <button className="model-chip">
              <span className="model-chip-dot video"></span> {imageModelId}
            </button>
          )}
          <button
            className="btn btn-primary btn-sm"
            onClick={onGenerateVideoNew}
            disabled={generatingKeyframe}
          >
            {t("common.generate")}
          </button>
          <button
            className="btn btn-outline btn-xs"
            onClick={() => uploadPanelHandle.current?.triggerVideoUpload()}
            aria-label={t("common.upload")}
          >
            <span aria-hidden="true">📤</span>
          </button>
        </div>
      </div>

      {/* One-click generate */}
      <button
        className="btn btn-primary btn-sm"
        style={{ width: "100%", justifyContent: "center" }}
        onClick={handleOneClickGenerate}
        disabled={generatingKeyframe}
      >
        <span aria-hidden="true">✨</span> {t("keyframe.oneClickGenerate")}
      </button>

      {/* Lightbox - 点击图片放大查看 */}
      {lightboxImage && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("beat.clickToEnlarge")}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.9)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            cursor: "zoom-out",
            padding: 24,
          }}
          onClick={() => setLightboxImage(null)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setLightboxImage(null);
          }}
          tabIndex={-1}
        >
          <img
            src={lightboxImage}
            alt="enlarged preview"
            style={{
              maxWidth: "90vw",
              maxHeight: "90vh",
              objectFit: "contain",
              borderRadius: 8,
              boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            }}
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="btn btn-ghost btn-xs"
            style={{ position: "absolute", top: 16, right: 16, color: "white" }}
            onClick={() => setLightboxImage(null)}
            aria-label={t("common.close")}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
