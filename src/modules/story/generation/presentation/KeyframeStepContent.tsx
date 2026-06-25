import { Image as ImageIcon, Upload, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { AppCard } from "@/shared/ui/app-card";
import { resolveMediaUrl } from "@/shared/utils/image-url";
import { t } from "@/shared/constants/messages";
import { PromptEditor } from "../../prompt-editor";
import type { PromptEditorContext } from "../../prompt-editor";
import type { StoryBeat, Character, Scene } from "@/domain/schemas";

interface KeyframeStepContentProps {
  beat: StoryBeat;
  isGenerating: boolean;
  isActiveStep: boolean;
  hasKeyframe: boolean;
  keyframeInputRef: React.RefObject<HTMLInputElement | null>;
  onUploadKeyframe?: (file: File) => void;
  onRegenerateKeyframe: () => Promise<void>;
  onPreEditGenerate: (context: PromptEditorContext) => void;
  onFileSelect: (
    e: React.ChangeEvent<HTMLInputElement>,
    handler?: (file: File) => void,
  ) => void;
  expandedPrompt: PromptEditorContext | null;
  onPromptChange?: (context: PromptEditorContext, prompt: string) => void;
  onConfirmKeyframeGenerate: (
    context: PromptEditorContext,
    prompt: string,
  ) => void;
  providerId?: string;
  modelId?: string;
  characters?: Character[];
  scenes?: Scene[];
}

export function KeyframeStepContent({
  beat,
  isGenerating,
  isActiveStep,
  hasKeyframe,
  keyframeInputRef,
  onUploadKeyframe,
  onRegenerateKeyframe,
  onPreEditGenerate,
  onFileSelect,
  expandedPrompt,
  onPromptChange,
  onConfirmKeyframeGenerate,
  providerId,
  modelId,
  characters,
  scenes,
}: KeyframeStepContentProps) {
  const status = hasKeyframe
    ? "completed"
    : isActiveStep && isGenerating
      ? "generating"
      : "ready";

  return (
    <AppCard
      className={`transition-all ${
        status === "generating"
          ? "border-blue-500/50 shadow-lg shadow-blue-500/10"
          : status === "completed"
            ? "border-emerald-500/30"
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
                  : "bg-slate-700/50 text-slate-400"
            }`}
            style={status === "generating" ? { color: "var(--primary)" } : undefined}
          >
            {status === "generating" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ImageIcon className="w-4 h-4" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-white">
                {t("keyframe.stepKeyframe")}
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
              {t("keyframe.keyframeDesc")}
            </p>
          </div>
          <div className="flex gap-2">
            <input
              ref={keyframeInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onFileSelect(e, onUploadKeyframe)}
            />
            <Button
              variant="secondary"
              size="sm"
              className="bg-slate-700 hover:bg-slate-600"
              onClick={() => keyframeInputRef.current?.click()}
            >
              <Upload className="w-4 h-4 mr-1" />
              {t("common.upload")}
            </Button>
            {hasKeyframe ? (
              <Button
                variant="secondary"
                size="sm"
                className="bg-slate-700 hover:bg-slate-600"
                onClick={onRegenerateKeyframe}
                disabled={isGenerating}
              >
                <RefreshCw className="w-4 h-4 mr-1" />
                {t("common.regenerate")}
              </Button>
            ) : (
              <Button
                size="sm"
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500"
                onClick={() => onPreEditGenerate("keyframe")}
                disabled={isGenerating}
              >
                {isGenerating && isActiveStep ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <ImageIcon className="w-4 h-4 mr-1" />
                )}
                {t("keyframe.generateKeyframe")}
              </Button>
            )}
          </div>
        </div>

        {hasKeyframe && beat.keyframe?.imageUrl && (
          <div className="mt-3">
            <div className="relative group">
              <img
                src={
                  resolveMediaUrl(
                    beat.localKeyframePath,
                    beat.keyframe?.imageUrl,
                  ) || ""
                }
                alt={t("keyframe.stepKeyframe")}
                className="w-full max-h-64 object-contain rounded-lg border border-slate-700"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-lg" />
            </div>
          </div>
        )}

        {expandedPrompt === "keyframe" && (
          <div className="mt-3">
            <PromptEditor
              context="keyframe"
              beat={beat}
              keyframeImageUrl={beat.keyframe?.imageUrl}
              onPromptChange={onPromptChange}
              onConfirmGenerate={onConfirmKeyframeGenerate}
              providerId={providerId}
              modelId={modelId}
              characters={characters}
              scenes={scenes}
            />
          </div>
        )}
      </div>
    </AppCard>
  );
}
