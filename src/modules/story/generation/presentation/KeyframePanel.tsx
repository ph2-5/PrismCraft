import { useState, useRef } from "react";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { PromptFloatingBall } from "../../prompt-editor";
import type { PromptEditorContext } from "../../prompt-editor";
import { StepIndicator } from "./StepIndicator";
import { KeyframeStepContent } from "./KeyframeStepContent";
import { FramePairStepContent } from "./FramePairStepContent";
import { VideoStepContent } from "./VideoStepContent";
import type { StoryBeat, Character, Scene } from "@/domain/schemas";
import {
  runWithErrorHandling,
  PrevBeatKeyframeBanner,
  OneClickGenerateButton,
  buildStepInfos,
  resolveActiveStep,
  createFileSelectHandler,
} from "./KeyframePanelParts";

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

  const activeStep = resolveActiveStep(hasKeyframe, hasFramePair, hasVideo);
  const stepInfos = buildStepInfos({ hasKeyframe, hasFramePair, hasVideo });

  const { handleFileSelect, handlePreEditGenerate } = createFileSelectHandler(
    setExpandedPrompt,
  );

  const handleConfirmKeyframeGenerate = (
    _context: PromptEditorContext,
    _prompt: string,
  ) =>
    runWithErrorHandling({
      action: onGenerateKeyframe,
      showError,
      onBeforeRun: () => setExpandedPrompt(null),
    });

  const handleConfirmFramePairGenerate = (
    _context: PromptEditorContext,
    _prompt: string,
  ) =>
    runWithErrorHandling({
      action: onGenerateFramePair,
      showError,
      onBeforeRun: () => setExpandedPrompt(null),
    });

  const handleOneClickGenerate = () =>
    runWithErrorHandling({
      action: async () => {
        if (!hasKeyframe) await onGenerateKeyframe();
        if (!hasFramePair) await onGenerateFramePair();
        if (!hasVideo) await onGenerateVideo();
      },
      showError,
    });

  const handlePromptGenerated = (
    _context: PromptEditorContext,
    _prompt: string,
  ) => {};

  const showPrevBeatBanner =
    !isFirstBeat && hasPrevKeyframe && !!prevBeat?.keyframe?.imageUrl;

  return (
    <div className="space-y-3">
      {showPrevBeatBanner && prevBeat && (
        <PrevBeatKeyframeBanner prevBeat={prevBeat} />
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

      <OneClickGenerateButton
        isGenerating={isGenerating}
        onClick={handleOneClickGenerate}
      />

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
