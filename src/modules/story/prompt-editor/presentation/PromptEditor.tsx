"use client";

import { useRef, useEffect } from "react";
import { Sparkles, RotateCcw, AlertCircle, Check, X, Zap } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Textarea } from "@/shared/ui/textarea";
import { usePromptEditor } from "../hooks";
import type { PromptEditorContext } from "../services";
import type { Character, Scene, StoryBeat } from "@/domain/schemas";

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
  keyframe: "预览图提示词",
  firstFrame: "首帧提示词",
  lastFrame: "尾帧提示词",
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
    <div className={`space-y-2 ${compact ? "" : "p-3"}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          {CONTEXT_LABELS[context]}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={resetToDefault}
            disabled={isGenerating || hasAIPreview}
            className="h-6 px-2 text-[10px]"
          >
            <RotateCcw className="w-3 h-3 mr-1" />
            重置
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => generateWithAI()}
            disabled={isGenerating}
            className="h-6 px-2 text-[10px] text-primary"
          >
            {isGenerating ? (
              <span className="w-3 h-3 mr-1 inline-block animate-spin rounded-full border-2 border-primary border-t-transparent" />
            ) : (
              <Sparkles className="w-3 h-3 mr-1" />
            )}
            AI 生成
          </Button>
        </div>
      </div>

      <Textarea
        ref={textareaRef}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={`输入${CONTEXT_LABELS[context]}，或点击 AI 生成...`}
        className={`resize-none text-xs font-mono min-h-[60px] ${
          compact ? "min-h-[40px]" : ""
        } ${hasAIPreview ? "border-primary/50 bg-primary/5" : ""}`}
        rows={compact ? 2 : 3}
      />

      {hasAIPreview && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-primary flex-1">
            AI 已生成提示词，可编辑后确认应用
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={discardAIPrompt}
            className="h-6 px-2 text-[10px] text-muted-foreground hover:text-destructive"
          >
            <X className="w-3 h-3 mr-1" />
            丢弃
          </Button>
          {onConfirmGenerate ? (
            <Button
              variant="default"
              size="sm"
              onClick={confirmAndGenerate}
              disabled={!prompt.trim()}
              className="h-6 px-2 text-[10px]"
            >
              <Zap className="w-3 h-3 mr-1" />
              确认生成
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={confirmAIPrompt}
              className="h-6 px-2 text-[10px] text-primary hover:text-primary"
            >
              <Check className="w-3 h-3 mr-1" />
              确认应用
            </Button>
          )}
        </div>
      )}

      {onConfirmGenerate && !hasAIPreview && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground flex-1">
            编辑提示词后点击确认生成
          </span>
          <Button
            variant="default"
            size="sm"
            onClick={confirmAndGenerate}
            disabled={!prompt.trim()}
            className="h-6 px-2 text-[10px]"
          >
            <Zap className="w-3 h-3 mr-1" />
            确认生成
          </Button>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-1.5 text-[10px] text-destructive">
          <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
          <span>{error}</span>
          <button
            onClick={clearError}
            className="ml-auto text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
