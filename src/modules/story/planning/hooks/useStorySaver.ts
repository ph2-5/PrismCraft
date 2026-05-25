"use client";

import { useState, useCallback } from "react";
import { useToastHelpers } from "@/shared/presentation/Toast";
import type { SaveStatus } from "@/shared/presentation/SaveStatusIndicator";
import {
  restoreVersion,
  formatVersionTime,
  type StoryVersion,
  getRecommendedTemplates as recommendTemplates,
  applyTemplate,
  type StoryTemplate,
  type StoryboardTemplate,
  storyService,
} from "@/modules/story";
import type { Story, StoryBeat } from "@/domain/schemas";
import { errorLogger, extractErrorMessage } from "@/shared/error-logger";
import { fromAsyncThrowable } from "@/domain/types/result";

interface UseStorySaverProps {
  stories: Story[];
  setStories: React.Dispatch<React.SetStateAction<Story[]>>;
  currentStory: Story;
  setCurrentStory: (update: Story | ((prev: Story) => Story), skipDirty?: boolean) => void;
  beats: StoryBeat[];
  setBeats: React.Dispatch<React.SetStateAction<StoryBeat[]>>;
  markClean: (key: string) => void;
  markDirty: (key: string) => void;
}

export function useStorySaver(props: UseStorySaverProps) {
  const {
    setStories,
    currentStory,
    setCurrentStory,
    beats,
    setBeats,
    markClean,
    markDirty,
  } = props;

  const { success, error: showError } = useToastHelpers();

  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [versionDialogOpen, setVersionDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [storyToDelete, setStoryToDelete] = useState<string | null>(null);
  const [recommendedTemplates, setRecommendedTemplates] = useState<
    StoryTemplate[]
  >([]);
  const [savedTemplates, setSavedTemplates] = useState<StoryboardTemplate[]>([]);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string>("");

  const updateRecommendedTemplates = useCallback(
    (genre: string, tone: string) => {
      const templates = recommendTemplates(genre || "drama", tone || "neutral");
      setRecommendedTemplates(templates);
    },
    [],
  );

  const handleRestoreVersion = useCallback(
    async (version: StoryVersion) => {
      const result = await restoreVersion(version, currentStory, beats);
      if (result.ok) {
        const { story: restoredStory, beats: restoredBeats } = result.value;
        setCurrentStory(restoredStory, true);
        setBeats(restoredBeats);
        setVersionDialogOpen(false);
        success(
          "版本已恢复",
          `已恢复到 ${formatVersionTime(version.timestamp)} 的版本，当前状态已备份`,
        );
      } else {
        showError(
          "恢复失败",
          result.error instanceof Error ? result.error.message : "未知错误",
        );
      }
    },
    [currentStory, beats, setCurrentStory, setBeats, success, showError],
  );

  const handleDeleteStory = useCallback((storyId: string) => {
    setStoryToDelete(storyId);
    setDeleteDialogOpen(true);
  }, []);

  const performDeleteStory = useCallback(async () => {
    if (storyToDelete) {
      const deleteResult = await fromAsyncThrowable(() => storyService.delete(storyToDelete));
      if (!deleteResult.ok) {
        errorLogger.warn("Failed to delete story from SQLite", deleteResult.error);
        setDeleteDialogOpen(false);
        setStoryToDelete(null);
        showError("删除失败", "故事数据库持久化删除失败，请重试");
        return;
      }
      setStories((prev) => prev.filter((s) => s.id !== storyToDelete));
      setDeleteDialogOpen(false);
      setStoryToDelete(null);
      success("删除成功", "分镜项目已删除");
    }
  }, [storyToDelete, setStories, success, showError]);

  const applyStoryTemplate = useCallback(
    (template: StoryTemplate) => {
      const newBeats = applyTemplate(template);
      setBeats(newBeats);
      setTemplateDialogOpen(false);
      success(
        "模板已应用",
        `已应用"${template.name}"模板，共${newBeats.length}个镜头`,
      );
    },
    [setBeats, success],
  );

  const applyStoryboardTemplate = useCallback(
    (templateBeats: Array<Partial<StoryBeat>>) => {
      const newBeats: StoryBeat[] = templateBeats.map((beat, index) => ({
        id: `beat_${crypto.randomUUID()}`,
        type: beat.type || "scene",
        title: beat.title || "",
        content: beat.content || "",
        description: beat.description || "",
        duration: beat.duration ?? 5,
        order: index,
        sequence: index,
        characters: beat.characters ?? [],
        elementIds: beat.elementIds ?? [],
        characterIds: beat.characterIds ?? [],
        enhancedGeneration: beat.enhancedGeneration ?? false,
        character: undefined,
        scene: undefined,
        sceneId: undefined,
        generationPrompt: undefined,
        imageGenerationPrompt: undefined,
        firstFramePrompt: undefined,
        lastFramePrompt: undefined,
        transition: undefined,
        imageUrl: undefined,
        videoReferenceUrl: undefined,
        uploadedKeyframe: undefined,
        uploadedVideo: undefined,
        customChainTarget: undefined,
      }));
      setBeats(newBeats);
      setTemplateDialogOpen(false);
      success(
        "模板已应用",
        `已应用自定义模板，共${newBeats.length}个镜头`,
      );
    },
    [setBeats, success],
  );

  const handleSaveTemplate = useCallback(
    (template: StoryboardTemplate) => {
      setSavedTemplates((prev) => {
        const existing = prev.findIndex((t) => t.id === template.id);
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = template;
          return updated;
        }
        return [...prev, template];
      });
      success("模板已保存", `模板"${template.name}"已保存`);
    },
    [success],
  );

  const handleDeleteTemplate = useCallback(
    (id: string) => {
      setSavedTemplates((prev) => prev.filter((t) => t.id !== id));
      success("模板已删除", "自定义模板已移除");
    },
    [success],
  );

  const handleSave = useCallback(async () => {
    if (beats.length === 0) {
      showError("无法保存", "请至少添加一个镜头");
      return;
    }
    const storyTitle = currentStory.title?.trim() || "未命名分镜";
    const newStory: Story = {
      ...currentStory,
      title: storyTitle,
      id:
        currentStory.id ||
        `story_${crypto.randomUUID()}`,
      beats,
      updatedAt: Math.floor(Date.now() / 1000),
    };

    setSaveStatus("saving");
    setSaveError("");

    const saveResult = await fromAsyncThrowable(async () => {
      if (currentStory.id) {
        return await storyService.update(newStory.id, newStory);
      }
      return await storyService.create(newStory);
    });

    if (!saveResult.ok) {
      const err = saveResult.error;
      errorLogger.error(String(err), "Failed to persist story to SQLite");
      const detail = extractErrorMessage(err);
      markDirty("story");
      setSaveStatus("error");
      setSaveError(detail);
      showError(
        "保存失败",
        `数据库持久化失败: ${detail}，请重试`,
      );
      return;
    }

    const serviceResult = saveResult.value;
    if (!serviceResult.ok) {
      const err = serviceResult.error;
      errorLogger.error(String(err), "Failed to persist story to SQLite");
      const detail = extractErrorMessage(err);
      markDirty("story");
      setSaveStatus("error");
      setSaveError(detail);
      showError(
        "保存失败",
        `数据库持久化失败: ${detail}，请重试`,
      );
      return;
    }

    setStories((prev) =>
      currentStory.id
        ? prev.map((s) => (s.id === newStory.id ? newStory : s))
        : [...prev, newStory],
    );
    setCurrentStory(newStory, true);
    markClean("story");
    setSaveStatus("saved");
    success(
      currentStory.id ? "保存成功" : "创建成功",
      currentStory.id ? "分镜项目已更新" : "新分镜项目已添加",
    );
  }, [
    currentStory,
    beats,
    setStories,
    setCurrentStory,
    success,
    showError,
    markClean,
    markDirty,
  ]);

  return {
    handleSave,
    handleRestoreVersion,
    handleDeleteStory,
    performDeleteStory,
    applyStoryTemplate,
    applyStoryboardTemplate,
    handleSaveTemplate,
    handleDeleteTemplate,
    templateDialogOpen,
    setTemplateDialogOpen,
    versionDialogOpen,
    setVersionDialogOpen,
    deleteDialogOpen,
    setDeleteDialogOpen,
    recommendedTemplates,
    savedTemplates,
    updateRecommendedTemplates,
    storyToDelete,
    saveStatus,
    saveError,
  };
}
