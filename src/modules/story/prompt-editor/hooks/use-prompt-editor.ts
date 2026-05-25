"use client";

import { useState, useCallback } from "react";
import {
  generatePromptWithAI,
  buildDefaultPrompt,
} from "../services";
import type { PromptEditorContext, PromptEditorResult } from "../services";
import type { Character, Scene, StoryBeat } from "@/domain/schemas";

export interface UsePromptEditorOptions {
  beat: StoryBeat;
  context: PromptEditorContext;
  keyframeImageUrl?: string;
  onPromptChange?: (context: PromptEditorContext, prompt: string) => void;
  onConfirmGenerate?: (context: PromptEditorContext, prompt: string) => void;
  providerId?: string;
  modelId?: string;
  characters?: Character[];
  scenes?: Scene[];
}

export interface PromptEditorState {
  prompt: string;
  isGenerating: boolean;
  error: string | null;
  lastAIResult: PromptEditorResult | null;
  hasAIPreview: boolean;
}

export function usePromptEditor(options: UsePromptEditorOptions) {
  const {
    beat,
    context,
    keyframeImageUrl,
    onPromptChange,
    onConfirmGenerate,
    providerId,
    modelId,
    characters,
    scenes,
  } = options;

  const [state, setState] = useState<PromptEditorState>(() => {
    const initialPrompt = getInitialPrompt(beat, context, characters, scenes);
    return {
      prompt: initialPrompt,
      isGenerating: false,
      error: null,
      lastAIResult: null,
      hasAIPreview: false,
    };
  });

  const setPrompt = useCallback(
    (value: string) => {
      setState((prev) => ({ ...prev, prompt: value, error: null, hasAIPreview: false }));
      onPromptChange?.(context, value);
    },
    [context, onPromptChange],
  );

  const resetToDefault = useCallback(() => {
    const defaultPrompt = buildDefaultPrompt({
      context,
      beat,
      keyframeImageUrl,
      characters,
      scenes,
    });
    setPrompt(defaultPrompt);
  }, [context, beat, keyframeImageUrl, characters, scenes, setPrompt]);

  const generateWithAI = useCallback(
    async (userMessage?: string) => {
      setState((prev) => ({ ...prev, isGenerating: true, error: null }));

      const result = await generatePromptWithAI(
        {
          context,
          beat,
          keyframeImageUrl,
          userMessage,
          characters,
          scenes,
        },
        { providerId, modelId },
      );

      if (result.ok) {
        setState((prev) => ({
          ...prev,
          prompt: result.value.prompt,
          isGenerating: false,
          lastAIResult: result.value,
          hasAIPreview: true,
        }));
        return result.value.prompt;
      }

      setState((prev) => ({
        ...prev,
        isGenerating: false,
        error: result.error?.message || "AI生成失败",
      }));
      return null;
    },
    [context, beat, keyframeImageUrl, providerId, modelId, characters, scenes],
  );

  const confirmAIPrompt = useCallback(() => {
    setState((prev) => {
      onPromptChange?.(context, prev.prompt);
      return { ...prev, hasAIPreview: false };
    });
  }, [context, onPromptChange]);

  const confirmAndGenerate = useCallback(() => {
    onConfirmGenerate?.(context, state.prompt);
  }, [onConfirmGenerate, context, state.prompt]);

  const discardAIPrompt = useCallback(() => {
    const initialPrompt = getInitialPrompt(beat, context, characters, scenes);
    setState((prev) => ({
      ...prev,
      prompt: initialPrompt,
      hasAIPreview: false,
      lastAIResult: null,
    }));
  }, [beat, context, characters, scenes]);

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  return {
    ...state,
    setPrompt,
    resetToDefault,
    generateWithAI,
    confirmAIPrompt,
    confirmAndGenerate,
    discardAIPrompt,
    clearError,
  };
}

function getInitialPrompt(
  beat: StoryBeat,
  context: PromptEditorContext,
  characters?: Character[],
  scenes?: Scene[],
): string {
  if (context === "keyframe" && beat.imageGenerationPrompt) {
    return beat.imageGenerationPrompt;
  }
  if (context === "firstFrame" && beat.firstFramePrompt) {
    return beat.firstFramePrompt;
  }
  if (context === "lastFrame" && beat.lastFramePrompt) {
    return beat.lastFramePrompt;
  }
  return buildDefaultPrompt({ context, beat, characters, scenes });
}
