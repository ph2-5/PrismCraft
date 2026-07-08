import type { RefObject, ReactNode } from "react";
import { useRef, useEffect } from "react";
import { Upload, RefreshCw, Download, Play, Image as ImageIcon } from "lucide-react";
import { t } from "@/shared/constants";
import type { StoryBeat } from "@/domain/schemas";
import type { useToastHelpers } from "@/shared/presentation/Toast";
import type { BeatUploadPanelHandle } from "./BeatUploadPanel";

type ToastError = ReturnType<typeof useToastHelpers>["error"];

interface PreviewBoxProps {
  imageUrl: string | null;
  alt: string;
  emptyText?: string;
  emptyEmoji?: ReactNode;
  opacity?: number;
  fontSize?: number;
  onImageClick?: (url: string) => void;
}

function PreviewBox({
  imageUrl,
  alt,
  emptyText,
  emptyEmoji,
  opacity = 0.6,
  fontSize = 36,
  onImageClick,
}: PreviewBoxProps) {
  return (
    <div
      style={{
        width: "100%",
        aspectRatio: "16 / 9",
        background: imageUrl ? "transparent" : "var(--card2)",
        borderRadius: 8,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize,
        opacity: imageUrl ? 1 : opacity,
        overflow: "hidden",
        position: "relative",
      }}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={alt}
          title={t("beat.clickToEnlarge")}
          onClick={() => onImageClick?.(imageUrl)}
          style={{ width: "100%", height: "100%", objectFit: "cover", cursor: "zoom-in" }}
        />
      ) : emptyText ? (
        <span>{emptyText}</span>
      ) : (
        <span aria-hidden="true">{emptyEmoji}</span>
      )}
    </div>
  );
}

interface KeyframePreviewCardProps {
  keyframeImage: string | null;
  beatTitle: string;
  generatingKeyframe?: boolean;
  onGenerate?: () => void;
  onRegenerate?: () => void;
  uploadPanelHandle: RefObject<BeatUploadPanelHandle | null>;
  onImageClick: (url: string) => void;
}

export function KeyframePreviewCard({
  keyframeImage,
  beatTitle,
  generatingKeyframe,
  onGenerate,
  onRegenerate,
  uploadPanelHandle,
  onImageClick,
}: KeyframePreviewCardProps) {
  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-fg)" }}>
        {t("beat.keyframePreview")}
      </div>
      <PreviewBox
        imageUrl={keyframeImage}
        alt={beatTitle}
        emptyEmoji={<ImageIcon size={36} />}
        onImageClick={onImageClick}
      />
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "center" }}>
        <button
          className="btn btn-primary btn-sm"
          onClick={onGenerate}
          disabled={generatingKeyframe}
        >
          {t("common.generate")}
        </button>
        <button
          className="btn btn-outline btn-xs"
          onClick={() => uploadPanelHandle.current?.triggerKeyframeUpload()}
          aria-label={t("common.upload")}
        >
          <Upload style={{ width: 12, height: 12 }} aria-hidden="true" />
        </button>
        {onRegenerate && keyframeImage && (
          <button
            className="btn btn-outline btn-xs"
            onClick={onRegenerate}
            disabled={generatingKeyframe}
            aria-label={t("common.regenerate")}
          >
            <RefreshCw style={{ width: 12, height: 12 }} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}

interface FramePairPreviewCardProps {
  firstFrameImage: string | null;
  lastFrameImage: string | null;
  generatingKeyframe?: boolean;
  onGenerate?: () => void;
  uploadPanelHandle: RefObject<BeatUploadPanelHandle | null>;
  onImageClick: (url: string) => void;
}

export function FramePairPreviewCard({
  firstFrameImage,
  lastFrameImage,
  generatingKeyframe,
  onGenerate,
  uploadPanelHandle,
  onImageClick,
}: FramePairPreviewCardProps) {
  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-fg)" }}>
        {t("beat.firstLastFrame")}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%" }}>
        <PreviewBox
          imageUrl={firstFrameImage}
          alt="first frame"
          emptyText="首帧"
          fontSize={14}
          opacity={0.5}
          onImageClick={onImageClick}
        />
        <PreviewBox
          imageUrl={lastFrameImage}
          alt="last frame"
          emptyText="尾帧"
          fontSize={14}
          opacity={0.5}
          onImageClick={onImageClick}
        />
      </div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "center" }}>
        <button
          className="btn btn-primary btn-sm"
          onClick={onGenerate}
          disabled={generatingKeyframe}
        >
          {t("common.generate")}
        </button>
        <button
          className="btn btn-outline btn-xs"
          onClick={() => uploadPanelHandle.current?.triggerFirstFrameUpload()}
          aria-label={t("keyframe.uploadFirstFrame")}
        >
          <Upload style={{ width: 12, height: 12 }} aria-hidden="true" />
        </button>
        <button
          className="btn btn-outline btn-xs"
          onClick={() => uploadPanelHandle.current?.triggerLastFrameUpload()}
          aria-label={t("keyframe.uploadLastFrame")}
        >
          <Download style={{ width: 12, height: 12 }} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

interface VideoGenerationCardProps {
  videoUrl: string | null;
  imageModelId?: string;
  generatingKeyframe?: boolean;
  onGenerate?: () => void;
  uploadPanelHandle: RefObject<BeatUploadPanelHandle | null>;
}

export function VideoGenerationCard({
  videoUrl,
  imageModelId,
  generatingKeyframe,
  onGenerate,
  uploadPanelHandle,
}: VideoGenerationCardProps) {
  return (
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
          <Play size={36} aria-hidden="true" />
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
          onClick={onGenerate}
          disabled={generatingKeyframe}
        >
          {t("common.generate")}
        </button>
        <button
          className="btn btn-outline btn-xs"
          onClick={() => uploadPanelHandle.current?.triggerVideoUpload()}
          aria-label={t("common.upload")}
        >
          <Upload style={{ width: 12, height: 12 }} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

interface LightboxDialogProps {
  image: string;
  onClose: () => void;
}

export function LightboxDialog({ image, onClose }: LightboxDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
      return;
    }
    if (e.key === "Tab") {
      const container = dialogRef.current;
      if (!container) return;
      const focusable = container.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) {
        e.preventDefault();
        container.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first || document.activeElement === container) {
          e.preventDefault();
          last?.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
  };
  return (
    <div
      ref={dialogRef}
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
      onClick={onClose}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <img
        src={image}
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
        onClick={onClose}
        aria-label={t("common.close")}
      >
        ✕
      </button>
    </div>
  );
}

interface OneClickGenerateArgs {
  beat: StoryBeat;
  onGenerateKeyframe?: () => Promise<StoryBeat | void>;
  onGenerateFramePair?: () => Promise<StoryBeat | void>;
  onGenerateVideoNew?: () => Promise<StoryBeat | void>;
  showError: ToastError;
}

export async function runOneClickGenerate({
  beat,
  onGenerateKeyframe,
  onGenerateFramePair,
  onGenerateVideoNew,
  showError,
}: OneClickGenerateArgs): Promise<void> {
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
}
