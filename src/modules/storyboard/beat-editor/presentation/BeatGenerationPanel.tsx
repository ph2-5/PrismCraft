import { useState } from "react";
import { Sparkles } from "lucide-react";
import { t } from "@/shared/constants";
import { resolveMediaUrl } from "@/shared/utils/image-url";
import type { StoryBeat } from "@/domain/schemas";
import { useToastHelpers } from "@/shared/presentation/Toast";
import type { BeatUploadPanelHandle } from "./BeatUploadPanel";
import {
  KeyframePreviewCard,
  FramePairPreviewCard,
  VideoGenerationCard,
  LightboxDialog,
  runOneClickGenerate,
} from "./BeatGenerationPanelParts";

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
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

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
    </div>
  );
}
