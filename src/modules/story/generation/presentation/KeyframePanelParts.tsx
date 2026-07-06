import { Loader2, Sparkles, Link2 } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { resolveMediaUrl } from "@/shared/utils/image-url";
import { t } from "@/shared/constants/messages";
import type { useToastHelpers } from "@/shared/presentation/Toast";
import type { PromptEditorContext } from "../../prompt-editor";
import type { StoryBeat } from "@/domain/schemas";

type ToastError = ReturnType<typeof useToastHelpers>["error"];

interface RunWithArgs<T> {
  action: () => Promise<T>;
  showError: ToastError;
  onBeforeRun?: () => void;
}

export async function runWithErrorHandling<T>({
  action,
  showError,
  onBeforeRun,
}: RunWithArgs<T>): Promise<void> {
  try {
    onBeforeRun?.();
    await action();
  } catch (err) {
    const message =
      err instanceof Error ? err.message : t("error.keyframeBatchFailed");
    showError(t("error.keyframeBatchFailed"), message);
  }
}

interface PrevBeatKeyframeBannerProps {
  prevBeat: StoryBeat;
}

export function PrevBeatKeyframeBanner({ prevBeat }: PrevBeatKeyframeBannerProps) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground bg-card2 rounded-lg p-2">
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
        className="w-8 h-8 rounded object-cover border border-border"
      />
    </div>
  );
}

interface OneClickGenerateButtonProps {
  isGenerating: boolean;
  onClick: () => void;
}

export function OneClickGenerateButton({
  isGenerating,
  onClick,
}: OneClickGenerateButtonProps) {
  return (
    <button
      type="button"
      className="btn btn-primary w-full bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 text-primary-foreground font-medium"
      onClick={onClick}
      disabled={isGenerating}
    >
      {isGenerating ? (
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
      ) : (
        <Sparkles className="w-4 h-4 mr-2" />
      )}
      {t("keyframe.oneClickGenerate")}
    </button>
  );
}

interface BuildStepInfosArgs {
  hasKeyframe: boolean;
  hasFramePair: boolean;
  hasVideo: boolean;
}

export function buildStepInfos({
  hasKeyframe,
  hasFramePair,
  hasVideo,
}: BuildStepInfosArgs) {
  return [
    { id: "keyframe", label: t("keyframe.stepKeyframe"), completed: hasKeyframe },
    { id: "framePair", label: t("keyframe.stepFramePair"), completed: hasFramePair },
    { id: "video", label: t("keyframe.stepVideo"), completed: hasVideo },
  ];
}

export function resolveActiveStep(
  hasKeyframe: boolean,
  hasFramePair: boolean,
  hasVideo: boolean,
): number {
  if (hasVideo) return 2;
  if (hasFramePair) return 2;
  if (hasKeyframe) return 1;
  return 0;
}

export function createFileSelectHandler(
  setExpandedPrompt: Dispatch<SetStateAction<PromptEditorContext | null>>,
) {
  return {
    handleFileSelect: (
      e: React.ChangeEvent<HTMLInputElement>,
      handler?: (file: File) => void,
    ) => {
      const file = e.target.files?.[0];
      if (file && handler) {
        handler(file);
      }
      e.target.value = "";
    },
    handlePreEditGenerate: (context: PromptEditorContext) => {
      setExpandedPrompt(context);
    },
  };
}
