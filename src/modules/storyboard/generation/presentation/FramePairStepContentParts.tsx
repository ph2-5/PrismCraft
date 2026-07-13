import { Camera, Upload, Loader2, RefreshCw } from "lucide-react";
import type { RefObject } from "react";
import { resolveMediaUrl } from "@/shared/utils/image-url";
import { t } from "@/shared/constants/messages";
import { PromptEditor } from "../../prompt-editor";
import type { PromptEditorContext } from "../../prompt-editor";
import type { StoryBeat, Character, Scene } from "@/domain/schemas";

export type FramePairStatus = "completed" | "generating" | "pending" | "ready";

interface StatusArgs {
  hasFramePair: boolean;
  isActiveStep: boolean;
  isGenerating: boolean;
  hasKeyframe: boolean;
}

export function resolveFramePairStatus({
  hasFramePair,
  isActiveStep,
  isGenerating,
  hasKeyframe,
}: StatusArgs): FramePairStatus {
  if (hasFramePair) return "completed";
  if (isActiveStep && isGenerating) return "generating";
  if (!hasKeyframe) return "pending";
  return "ready";
}

export function getCardClassName(status: FramePairStatus): string {
  if (status === "generating") {
    return "border-primary/50 shadow-lg shadow-primary/10";
  }
  if (status === "completed") {
    return "border-success/30";
  }
  if (status === "pending") {
    return "opacity-50";
  }
  return "";
}

interface IconCircleProps {
  status: FramePairStatus;
}

export function IconCircle({ status }: IconCircleProps) {
  const baseClass = "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0";
  let className = `${baseClass} bg-muted text-muted-foreground`;
  if (status === "completed") className = `${baseClass} bg-success/20 text-success`;
  else if (status === "generating") className = `${baseClass} bg-primary/20`;

  return (
    <div
      className={className}
      style={status === "generating" ? { color: "var(--primary)" } : undefined}
    >
      {status === "generating" ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Camera className="w-4 h-4" />
      )}
    </div>
  );
}

interface FramePairHeaderActionsProps {
  hasFramePair: boolean;
  isGenerating: boolean;
  isActiveStep: boolean;
  hasKeyframe: boolean;
  firstFrameInputRef: RefObject<HTMLInputElement | null>;
  lastFrameInputRef: RefObject<HTMLInputElement | null>;
  onUploadFirstFrame?: (file: File) => void;
  onUploadLastFrame?: (file: File) => void;
  onPreEditGenerate: (context: PromptEditorContext) => void;
  onRegenerateFramePair?: () => Promise<void>;
  onFileSelect: (
    e: React.ChangeEvent<HTMLInputElement>,
    handler?: (file: File) => void,
  ) => void;
}

export function FramePairHeaderActions({
  hasFramePair,
  isGenerating,
  isActiveStep,
  hasKeyframe,
  firstFrameInputRef,
  lastFrameInputRef,
  onUploadFirstFrame,
  onUploadLastFrame,
  onPreEditGenerate,
  onRegenerateFramePair,
  onFileSelect,
}: FramePairHeaderActionsProps) {
  return (
    <div className="flex gap-2">
      <input
        ref={firstFrameInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onFileSelect(e, onUploadFirstFrame)}
      />
      <input
        ref={lastFrameInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onFileSelect(e, onUploadLastFrame)}
      />
      <button
        type="button"
        className="btn btn-outline btn-sm bg-muted hover:bg-muted/80"
        onClick={() => firstFrameInputRef.current?.click()}
      >
        <Upload className="w-4 h-4 mr-1" />
        {t("keyframe.uploadFirstFrame")}
      </button>
      <button
        type="button"
        className="btn btn-outline btn-sm bg-muted hover:bg-muted/80"
        onClick={() => lastFrameInputRef.current?.click()}
      >
        <Upload className="w-4 h-4 mr-1" />
        {t("keyframe.uploadLastFrame")}
      </button>
      {!hasFramePair ? (
        <button
          type="button"
          className="btn btn-primary btn-sm bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90"
          onClick={() => onPreEditGenerate("firstFrame")}
          disabled={isGenerating || !hasKeyframe}
        >
          {isGenerating && isActiveStep ? (
            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
          ) : (
            <Camera className="w-4 h-4 mr-1" />
          )}
          {t("keyframe.generateFramePair")}
        </button>
      ) : onRegenerateFramePair ? (
        <button
          type="button"
          className="btn btn-outline btn-sm bg-muted hover:bg-muted/80"
          onClick={onRegenerateFramePair}
          disabled={isGenerating}
        >
          <RefreshCw className="w-4 h-4 mr-1" />
          {t("common.regenerate")}
        </button>
      ) : null}
    </div>
  );
}

interface FramePreviewProps {
  label: string;
  imageUrl: string | undefined;
  localPath?: string;
  alt: string;
}

export function FramePreview({ label, imageUrl, localPath, alt }: FramePreviewProps) {
  if (!imageUrl) return null;
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <div className="relative group">
        <img
          src={resolveMediaUrl(localPath, imageUrl) || ""}
          alt={alt}
          className="w-full max-h-48 object-contain rounded-lg border border-border"
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-lg" />
      </div>
    </div>
  );
}

interface ExpandedPromptEditorsProps {
  expandedPrompt: PromptEditorContext | null;
  beat: StoryBeat;
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

export function ExpandedPromptEditors({
  expandedPrompt,
  beat,
  onPromptChange,
  onConfirmFramePairGenerate,
  providerId,
  modelId,
  characters,
  scenes,
}: ExpandedPromptEditorsProps) {
  const common = {
    beat,
    onPromptChange,
    onConfirmGenerate: onConfirmFramePairGenerate,
    providerId,
    modelId,
    characters,
    scenes,
  };
  return (
    <div className="mt-3 space-y-2">
      {expandedPrompt === "firstFrame" && (
        <PromptEditor context="firstFrame" {...common} />
      )}
      {expandedPrompt === "lastFrame" && (
        <PromptEditor context="lastFrame" {...common} />
      )}
    </div>
  );
}
