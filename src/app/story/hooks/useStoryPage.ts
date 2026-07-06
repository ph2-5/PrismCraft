import { useState } from "react";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { useStory } from "../StoryProvider";
import {
  useDeleteConfirm,
  usePromptChangeHandlers,
  useStoryAutoSave,
  useStoryKeyboardSave,
  useStorySwitching,
  useStoryVideoGeneration,
} from "./useStoryPageParts";

export type StoryTab =
  | "storyboard"
  | "ai-generate"
  | "preview-export"
  | "comments"
  | "audio";

export function useStoryPage() {
  const story = useStory();
  const { success, error: showError } = useToastHelpers();
  useStoryKeyboardSave(story);
  useStoryAutoSave(story);

  const { isGenerating, generatedVideo, generateVideo } = useStoryVideoGeneration(story);
  const {
    showSwitchConfirmDialog,
    pendingSwitchStory,
    switchStory,
    handleSaveAndSwitch,
    handleSwitchConfirmOpenChange,
    handleSwitchWithoutSave,
  } = useStorySwitching(story, success, showError);
  const {
    deleteConfirmInput,
    setDeleteConfirmInput,
    handleDeleteDialogOpenChange,
    handleDeleteCancel,
  } = useDeleteConfirm(story);
  const { handlePromptChange, handleToggleGenerationEnhanced } = usePromptChangeHandlers(story);

  // ── UI 状态:当前激活的 Tab ──
  const [activeTab, setActiveTab] = useState<StoryTab>("storyboard");

  return {
    // Story data
    story,
    // Video generation
    isGenerating,
    generatedVideo,
    generateVideo,
    // Switch story
    showSwitchConfirmDialog,
    pendingSwitchStory,
    switchStory,
    handleSaveAndSwitch,
    handleSwitchConfirmOpenChange,
    handleSwitchWithoutSave,
    // Delete confirmation
    deleteConfirmInput,
    setDeleteConfirmInput,
    handleDeleteDialogOpenChange,
    handleDeleteCancel,
    // Prompt change
    handlePromptChange,
    // Generation enhanced toggle
    handleToggleGenerationEnhanced,
    // UI 状态
    activeTab,
    setActiveTab,
  };
}
