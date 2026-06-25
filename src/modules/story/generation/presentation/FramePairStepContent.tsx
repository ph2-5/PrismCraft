import { Camera, Upload, Loader2, RefreshCw } from "lucide-react";
import { AppCard } from "@/shared/ui/app-card";
import { resolveMediaUrl } from "@/shared/utils/image-url";
import { t } from "@/shared/constants/messages";
import { PromptEditor } from "../../prompt-editor";
import type { PromptEditorContext } from "../../prompt-editor";
import type { StoryBeat, Character, Scene } from "@/domain/schemas";

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
  const status = hasFramePair
    ? "completed"
    : isActiveStep && isGenerating
      ? "generating"
      : !hasKeyframe
        ? "pending"
        : "ready";

  const firstFrame = beat.framePair?.firstFrame;
  const lastFrame = beat.framePair?.lastFrame;

  return (
    <AppCard
      className={`transition-all ${
        status === "generating"
          ? "border-blue-500/50 shadow-lg shadow-blue-500/10"
          : status === "completed"
            ? "border-emerald-500/30"
            : status === "pending"
              ? "opacity-50"
              : ""
      }`}
    >
      <div className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
              status === "completed"
                ? "bg-emerald-500/20 text-emerald-400"
                : status === "generating"
                  ? "bg-blue-500/20"
                  : status === "pending"
                    ? "bg-slate-700/50 text-slate-500"
                    : "bg-slate-700/50 text-slate-400"
            }`}
            style={status === "generating" ? { color: "var(--primary)" } : undefined}
          >
            {status === "generating" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Camera className="w-4 h-4" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-white">
                {t("keyframe.stepFramePair")}
              </span>
              {status === "completed" && (
                <span className="text-xs text-emerald-400">✓</span>
              )}
              {status === "generating" && (
                <span className="text-xs animate-pulse" style={{ color: "var(--primary)" }}>
                  {t("keyframe.generating")}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {t("keyframe.framePairDesc")}
            </p>
          </div>
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
              className="btn btn-outline btn-sm bg-slate-700 hover:bg-slate-600"
              onClick={() => firstFrameInputRef.current?.click()}
            >
              <Upload className="w-4 h-4 mr-1" />
              {t("keyframe.uploadFirstFrame")}
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm bg-slate-700 hover:bg-slate-600"
              onClick={() => lastFrameInputRef.current?.click()}
            >
              <Upload className="w-4 h-4 mr-1" />
              {t("keyframe.uploadLastFrame")}
            </button>
            {!hasFramePair ? (
              <button
                type="button"
                className="btn btn-primary btn-sm bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500"
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
                className="btn btn-outline btn-sm bg-slate-700 hover:bg-slate-600"
                onClick={onRegenerateFramePair}
                disabled={isGenerating}
              >
                <RefreshCw className="w-4 h-4 mr-1" />
                {t("common.regenerate")}
              </button>
            ) : null}
          </div>
        </div>

        {hasFramePair && (firstFrame || lastFrame) && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            {firstFrame && (
              <div>
                <p className="text-xs text-slate-400 mb-1">
                  {t("keyframe.firstFrame")}
                </p>
                <div className="relative group">
                  <img
                    src={resolveMediaUrl(beat.localFirstFramePath, firstFrame.imageUrl) || ""}
                    alt={t("keyframe.firstFrame")}
                    className="w-full max-h-48 object-contain rounded-lg border border-slate-700"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-lg" />
                </div>
              </div>
            )}
            {lastFrame && (
              <div>
                <p className="text-xs text-slate-400 mb-1">
                  {t("keyframe.lastFrame")}
                </p>
                <div className="relative group">
                  <img
                    src={resolveMediaUrl(beat.localLastFramePath, lastFrame.imageUrl) || ""}
                    alt={t("keyframe.lastFrame")}
                    className="w-full max-h-48 object-contain rounded-lg border border-slate-700"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-lg" />
                </div>
              </div>
            )}
          </div>
        )}

        <div className="mt-3 space-y-2">
          {expandedPrompt === "firstFrame" && (
            <PromptEditor
              context="firstFrame"
              beat={beat}
              onPromptChange={onPromptChange}
              onConfirmGenerate={onConfirmFramePairGenerate}
              providerId={providerId}
              modelId={modelId}
              characters={characters}
              scenes={scenes}
            />
          )}
          {expandedPrompt === "lastFrame" && (
            <PromptEditor
              context="lastFrame"
              beat={beat}
              onPromptChange={onPromptChange}
              onConfirmGenerate={onConfirmFramePairGenerate}
              providerId={providerId}
              modelId={modelId}
              characters={characters}
              scenes={scenes}
            />
          )}
        </div>
      </div>
    </AppCard>
  );
}
