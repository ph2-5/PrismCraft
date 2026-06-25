import { useRef, useEffect } from "react";
import { Sparkles, RotateCcw, AlertCircle, Check, X, Zap } from "lucide-react";
import { usePromptEditor } from "../hooks";
import type { PromptEditorContext } from "../services";
import type { Character, Scene, StoryBeat } from "@/domain/schemas";
import { t } from "@/shared/constants";

interface PromptEditorProps {
  beat: StoryBeat;
  context: PromptEditorContext;
  keyframeImageUrl?: string;
  onPromptChange?: (context: PromptEditorContext, prompt: string) => void;
  onConfirmGenerate?: (context: PromptEditorContext, prompt: string) => void;
  providerId?: string;
  modelId?: string;
  compact?: boolean;
  characters?: Character[];
  scenes?: Scene[];
}

const CONTEXT_LABELS: Record<PromptEditorContext, string> = {
  keyframe: t("prompt.keyframePrompt"),
  firstFrame: t("prompt.firstFramePrompt"),
  lastFrame: t("prompt.lastFramePrompt"),
  video: t("prompt.videoPrompt"),
};

const CONTEXT_SHORT: Record<PromptEditorContext, string> = {
  keyframe: t("prompt.keyframeShort"),
  firstFrame: t("prompt.firstFrameShort"),
  lastFrame: t("prompt.lastFrameShort"),
  video: t("prompt.videoShort"),
};

export function PromptEditor({
  beat,
  context,
  keyframeImageUrl,
  onPromptChange,
  onConfirmGenerate,
  providerId,
  modelId,
  compact = false,
  characters,
  scenes,
}: PromptEditorProps) {
  const {
    prompt,
    isGenerating,
    error,
    hasAIPreview,
    setPrompt,
    resetToDefault,
    generateWithAI,
    confirmAIPrompt,
    confirmAndGenerate,
    discardAIPrompt,
    clearError,
  } = usePromptEditor({
    beat,
    context,
    keyframeImageUrl,
    onPromptChange,
    onConfirmGenerate,
    providerId,
    modelId,
    characters,
    scenes,
  });

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
    }
  }, [prompt]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, height: "100%" }}>
      {/* Header: label + AI buttons */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-fg)" }}>
          {CONTEXT_LABELS[context]}
        </span>
        <div className="toolbar">
          <button
            className="btn btn-ghost btn-xs"
            onClick={resetToDefault}
            disabled={isGenerating || hasAIPreview}
            title={t("prompt.reset")}
          >
            <RotateCcw className="w-3 h-3" />
          </button>
          <button
            className="btn btn-ghost btn-xs"
            onClick={() => generateWithAI()}
            disabled={isGenerating}
            style={isGenerating ? { opacity: 0.5 } : { color: "var(--primary)" }}
          >
            {isGenerating ? (
              <span style={{ width: 12, height: 12, display: "inline-block", animation: "spin 1s linear infinite", borderRadius: "50%", border: "2px solid var(--primary)", borderTopColor: "transparent" }} />
            ) : (
              <Sparkles className="w-3 h-3" />
            )}
            {t("prompt.aiGenerate")}
          </button>
        </div>
      </div>

      {/* Prompt textarea - using preview page style */}
      <textarea
        ref={textareaRef}
        className="textarea"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={t("prompt.enterPromptOrAI", { context: CONTEXT_SHORT[context] })}
        style={{
          flex: 1,
          minHeight: compact ? 40 : 80,
          resize: "none",
          fontSize: 12,
          lineHeight: 1.7,
          fontFamily: "inherit",
          background: hasAIPreview ? "var(--card)" : "var(--card2)",
          borderColor: hasAIPreview ? "var(--primary)" : "var(--border)",
        }}
        rows={compact ? 2 : 3}
      />

      {/* AI preview actions */}
      {hasAIPreview && (
        <div className="toolbar" style={{ justifyContent: "space-between" }}>
          <span style={{ fontSize: 10, color: "var(--primary)", flex: 1 }}>
            {t("prompt.aiGeneratedHint")}
          </span>
          <button
            className="btn btn-ghost btn-xs"
            onClick={discardAIPrompt}
            style={{ color: "var(--muted-fg)" }}
          >
            <X className="w-3 h-3" />
            {t("prompt.discard")}
          </button>
          {onConfirmGenerate ? (
            <button
              className="btn btn-primary btn-sm"
              onClick={confirmAndGenerate}
              disabled={!prompt.trim()}
            >
              <Zap className="w-3 h-3" />
              {t("prompt.confirmGenerate")}
            </button>
          ) : (
            <button
              className="btn btn-ghost btn-sm"
              onClick={confirmAIPrompt}
              style={{ color: "var(--primary)" }}
            >
              <Check className="w-3 h-3" />
              {t("prompt.confirmApply")}
            </button>
          )}
        </div>
      )}

      {/* Confirm generate without AI preview */}
      {onConfirmGenerate && !hasAIPreview && (
        <div className="toolbar" style={{ justifyContent: "space-between" }}>
          <span style={{ fontSize: 10, color: "var(--muted-fg)", flex: 1 }}>
            {t("prompt.editThenGenerate")}
          </span>
          <button
            className="btn btn-primary btn-sm"
            onClick={confirmAndGenerate}
            disabled={!prompt.trim()}
          >
            <Zap className="w-3 h-3" />
            {t("prompt.confirmGenerate")}
          </button>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 10, color: "var(--danger)" }}>
          <AlertCircle className="w-3 h-3" style={{ marginTop: 2, flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{error}</span>
          <button
            onClick={clearError}
            style={{ color: "var(--muted-fg)", cursor: "pointer", background: "none", border: "none", padding: 0 }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
