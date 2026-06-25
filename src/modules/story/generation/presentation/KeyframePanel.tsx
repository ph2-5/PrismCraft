import { useState, useRef } from "react";
import { Loader2, Sparkles, Link2 } from "lucide-react";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { resolveMediaUrl } from "@/shared/utils/image-url";
import { t } from "@/shared/constants/messages";
import { PromptFloatingBall } from "../../prompt-editor";
import type { PromptEditorContext } from "../../prompt-editor";
import { StepIndicator } from "./StepIndicator";
import { KeyframeStepContent } from "./KeyframeStepContent";
import { FramePairStepContent } from "./FramePairStepContent";
import { VideoStepContent } from "./VideoStepContent";
import type { StoryBeat, Character, Scene } from "@/domain/schemas";

interface KeyframePanelProps {
  beat: StoryBeat;
  index: number;
  totalBeats: number;
  prevBeat: StoryBeat | null;
  isGenerating: boolean;
  onGenerateKeyframe: () => Promise<StoryBeat | void>;
  onGenerateFramePair: () => Promise<StoryBeat | void>;
  onGenerateVideo: () => Promise<StoryBeat | void>;
  onRegenerateKeyframe: () => Promise<void>;
  onUploadKeyframe?: (file: File) => void;
  onUploadFirstFrame?: (file: File) => void;
  onUploadLastFrame?: (file: File) => void;
  onUploadVideo?: (file: File) => void;
  onPromptChange?: (context: PromptEditorContext, prompt: string) => void;
  providerId?: string;
  modelId?: string;
  characters?: Character[];
  scenes?: Scene[];
}

export function KeyframePanel({
  beat,
  index,
  totalBeats: _totalBeats,
  prevBeat,
  isGenerating,
  onGenerateKeyframe,
  onGenerateFramePair,
  onGenerateVideo,
  onRegenerateKeyframe,
  onUploadKeyframe,
  onUploadFirstFrame,
  onUploadLastFrame,
  onUploadVideo,
  onPromptChange,
  providerId,
  modelId,
  characters,
  scenes,
}: KeyframePanelProps) {
  const { error: showError } = useToastHelpers();
  const [expandedPrompt, setExpandedPrompt] =
    useState<PromptEditorContext | null>(null);

  const keyframeInputRef = useRef<HTMLInputElement>(null);
  const firstFrameInputRef = useRef<HTMLInputElement>(null);
  const lastFrameInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const isFirstBeat = index === 0;

  const hasKeyframe = !!beat.keyframe?.imageUrl;
  const hasPrevKeyframe = !!prevBeat?.keyframe?.imageUrl;
  const hasFramePair =
    !!beat.framePair?.firstFrame?.imageUrl &&
    !!beat.framePair?.lastFrame?.imageUrl;
  const hasVideo = !!beat.videoGen?.videoUrl;

  const activeStep = hasVideo ? 2 : hasFramePair ? 2 : hasKeyframe ? 1 : 0;

  const stepInfos = [
    {
      id: "keyframe",
      label: t("keyframe.stepKeyframe"),
      completed: hasKeyframe,
    },
    {
      id: "framePair",
      label: t("keyframe.stepFramePair"),
      completed: hasFramePair,
    },
    {
      id: "video",
      label: t("keyframe.stepVideo"),
      completed: hasVideo,
    },
  ];

  const handleFileSelect = (
    e: React.ChangeEvent<HTMLInputElement>,
    handler?: (file: File) => void,
  ) => {
    const file = e.target.files?.[0];
    if (file && handler) {
      handler(file);
    }
    e.target.value = "";
  };

  const handlePreEditGenerate = (context: PromptEditorContext) => {
    setExpandedPrompt(context);
  };

  const handleConfirmKeyframeGenerate = async (
    _context: PromptEditorContext,
    _prompt: string,
  ) => {
    try {
      setExpandedPrompt(null);
      await onGenerateKeyframe();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t("error.keyframeBatchFailed");
      showError(t("error.keyframeBatchFailed"), message);
    }
  };

  const handleConfirmFramePairGenerate = async (
    _context: PromptEditorContext,
    _prompt: string,
  ) => {
    try {
      setExpandedPrompt(null);
      await onGenerateFramePair();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t("error.keyframeBatchFailed");
      showError(t("error.keyframeBatchFailed"), message);
    }
  };

  const handleOneClickGenerate = async () => {
    try {
      if (!hasKeyframe) {
        await onGenerateKeyframe();
      }
      if (!hasFramePair) {
        await onGenerateFramePair();
      }
      if (!hasVideo) {
        await onGenerateVideo();
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t("error.keyframeBatchFailed");
      showError(t("error.keyframeBatchFailed"), message);
    }
  };

  const handlePromptGenerated = (
    _context: PromptEditorContext,
    _prompt: string,
  ) => {};

  return (
    <div className="space-y-3">
      {!isFirstBeat && hasPrevKeyframe && prevBeat?.keyframe?.imageUrl && (
        <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-800/50 rounded-lg p-2">
          <Link2 className="w-3 h-3" />
          <span>{t("keyframe.prevBeatKeyframe")}</span>
          <img
            src={
              resolveMediaUrl(
                prevBeat.localKeyframePath,
                prevBeat.keyframe?.imageUrl,
              ) || ""
            }
            alt={t("keyframe.prevBeatKeyframe")}
            className="w-8 h-8 rounded object-cover border border-slate-600"
          />
        </div>
      )}

      <StepIndicator
        steps={stepInfos}
        activeStep={activeStep}
        isGenerating={isGenerating}
      />

      <KeyframeStepContent
        beat={beat}
        isGenerating={isGenerating}
        isActiveStep={activeStep === 0}
        hasKeyframe={hasKeyframe}
        keyframeInputRef={keyframeInputRef}
        onUploadKeyframe={onUploadKeyframe}
        onRegenerateKeyframe={onRegenerateKeyframe}
        onPreEditGenerate={handlePreEditGenerate}
        onFileSelect={handleFileSelect}
        expandedPrompt={expandedPrompt}
        onPromptChange={onPromptChange}
        onConfirmKeyframeGenerate={handleConfirmKeyframeGenerate}
        providerId={providerId}
        modelId={modelId}
        characters={characters}
        scenes={scenes}
      />

      <FramePairStepContent
        beat={beat}
        isGenerating={isGenerating}
        isActiveStep={activeStep === 1}
        hasKeyframe={hasKeyframe}
        hasFramePair={hasFramePair}
        firstFrameInputRef={firstFrameInputRef}
        lastFrameInputRef={lastFrameInputRef}
        onUploadFirstFrame={onUploadFirstFrame}
        onUploadLastFrame={onUploadLastFrame}
        onGenerateFramePair={onGenerateFramePair}
        onPreEditGenerate={handlePreEditGenerate}
        onFileSelect={handleFileSelect}
        expandedPrompt={expandedPrompt}
        onPromptChange={onPromptChange}
        onConfirmFramePairGenerate={handleConfirmFramePairGenerate}
        providerId={providerId}
        modelId={modelId}
        characters={characters}
        scenes={scenes}
      />

      <VideoStepContent
        beat={beat}
        isGenerating={isGenerating}
        isActiveStep={activeStep === 2}
        hasFramePair={hasFramePair}
        hasVideo={hasVideo}
        videoInputRef={videoInputRef}
        onUploadVideo={onUploadVideo}
        onGenerateVideo={onGenerateVideo}
        onFileSelect={handleFileSelect}
      />

      <button
        type="button"
        className="btn btn-primary w-full bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 hover:from-blue-500 hover:via-purple-500 hover:to-pink-500 text-white font-medium"
        onClick={handleOneClickGenerate}
        disabled={isGenerating}
      >
        {isGenerating ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <Sparkles className="w-4 h-4 mr-2" />
        )}
        {t("keyframe.oneClickGenerate")}
      </button>

      <PromptFloatingBall
        beat={beat}
        context="keyframe"
        keyframeImageUrl={beat.keyframe?.imageUrl}
        onPromptGenerated={handlePromptGenerated}
        providerId={providerId}
        modelId={modelId}
        characters={characters}
        scenes={scenes}
      />
    </div>
  );
}
