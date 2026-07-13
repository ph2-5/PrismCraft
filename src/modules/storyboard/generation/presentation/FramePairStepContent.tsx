import { Check } from "lucide-react";
import { AppCard } from "@/shared/presentation/AppCard";
import { t } from "@/shared/constants/messages";
import type { PromptEditorContext } from "../../prompt-editor";
import type { StoryBeat, Character, Scene } from "@/domain/schemas";
import {
  resolveFramePairStatus,
  getCardClassName,
  IconCircle,
  FramePairHeaderActions,
  FramePreview,
  ExpandedPromptEditors,
} from "./FramePairStepContentParts";

interface FramePairStepContentProps {
  beat: StoryBeat;
  isGenerating: boolean;
  isActiveStep: boolean;
  hasKeyframe: boolean;
  hasFramePair: boolean;
  firstFrameInputRef: React.RefObject<HTMLInputElement | null>;
  lastFrameInputRef: React.RefObject<HTMLInputElement | null>;
  onUploadFirstFrame?: (file: File) => void;
  onUploadLastFrame?: (file: File) => void;
  onGenerateFramePair: (
    customFirstFramePrompt?: string,
    customLastFramePrompt?: string,
  ) => Promise<StoryBeat | void>;
  onRegenerateFramePair?: () => Promise<void>;
  onPreEditGenerate: (context: PromptEditorContext) => void;
  onFileSelect: (
    e: React.ChangeEvent<HTMLInputElement>,
    handler?: (file: File) => void,
  ) => void;
  expandedPrompt: PromptEditorContext | null;
  onPromptChange?: (context: PromptEditorContext, prompt: string) => void;
  onConfirmFramePairGenerate: (
    context: PromptEditorContext,
    prompt: string,
  ) => void;
  providerId?: string;
  modelId?: string;
  characters?: Character[];
  scenes?: Scene[];
}

export function FramePairStepContent({
  beat,
  isGenerating,
  isActiveStep,
  hasKeyframe,
  hasFramePair,
  firstFrameInputRef,
  lastFrameInputRef,
  onUploadFirstFrame,
  onUploadLastFrame,
  onGenerateFramePair: _onGenerateFramePair,
  onRegenerateFramePair,
  onPreEditGenerate,
  onFileSelect,
  expandedPrompt,
  onPromptChange,
  onConfirmFramePairGenerate,
  providerId,
  modelId,
  characters,
  scenes,
}: FramePairStepContentProps) {
  const status = resolveFramePairStatus({
    hasFramePair,
    isActiveStep,
    isGenerating,
    hasKeyframe,
  });

  const firstFrame = beat.framePair?.firstFrame;
  const lastFrame = beat.framePair?.lastFrame;
  const showPreview = hasFramePair && (firstFrame || lastFrame);

  return (
    <AppCard className={`transition-all ${getCardClassName(status)}`}>
      <div className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <IconCircle status={status} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                {t("keyframe.stepFramePair")}
              </span>
              {status === "completed" && (
                <Check className="w-3 h-3 text-success" />
              )}
              {status === "generating" && (
                <span className="text-xs animate-pulse" style={{ color: "var(--primary)" }}>
                  {t("keyframe.generating")}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("keyframe.framePairDesc")}
            </p>
          </div>
          <FramePairHeaderActions
            hasFramePair={hasFramePair}
            isGenerating={isGenerating}
            isActiveStep={isActiveStep}
            hasKeyframe={hasKeyframe}
            firstFrameInputRef={firstFrameInputRef}
            lastFrameInputRef={lastFrameInputRef}
            onUploadFirstFrame={onUploadFirstFrame}
            onUploadLastFrame={onUploadLastFrame}
            onPreEditGenerate={onPreEditGenerate}
            onRegenerateFramePair={onRegenerateFramePair}
            onFileSelect={onFileSelect}
          />
        </div>

        {showPreview && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <FramePreview
              label={t("keyframe.firstFrame")}
              imageUrl={firstFrame?.imageUrl}
              localPath={beat.localFirstFramePath}
              alt={t("keyframe.firstFrame")}
            />
            <FramePreview
              label={t("keyframe.lastFrame")}
              imageUrl={lastFrame?.imageUrl}
              localPath={beat.localLastFramePath}
              alt={t("keyframe.lastFrame")}
            />
          </div>
        )}

        <ExpandedPromptEditors
          expandedPrompt={expandedPrompt}
          beat={beat}
          onPromptChange={onPromptChange}
          onConfirmFramePairGenerate={onConfirmFramePairGenerate}
          providerId={providerId}
          modelId={modelId}
          characters={characters}
          scenes={scenes}
        />
      </div>
    </AppCard>
  );
}
