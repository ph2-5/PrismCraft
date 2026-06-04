import { useState, useCallback, useRef, useEffect } from "react";
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
  DEFAULT_STORY,
} from "@/modules/story";
import type { Story, StoryBeat } from "@/domain/schemas";
import { errorLogger, extractErrorMessage } from "@/shared/error-logger";
import { mapUserFacingError } from "@/shared/utils/user-facing-error";
import { fromAsyncThrowable } from "@/domain/types/result";
import { container } from "@/infrastructure/di";
import { t } from "@/shared/constants/messages";

interface UseStorySaverProps {
  stories: Story[];
  setStories: React.Dispatch<React.SetStateAction<Story[]>>;
  currentStory: Story;
  setCurrentStory: (update: Story | ((prev: Story) => Story), skipDirty?: boolean) => void;
  beats: StoryBeat[];
  setBeats: React.Dispatch<React.SetStateAction<StoryBeat[]>>;
  markClean: (key: string) => void;
  markDirty: (key: string) => void;
  onBeforeDeleteStory?: (storyId: string) => Promise<void>;
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
    onBeforeDeleteStory,
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
  const savingRef = useRef(false);

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
          t("success.versionRestored"),
          `已恢复到 ${formatVersionTime(version.timestamp)} 的版本，当前状态已备份`,
        );
      } else {
        showError(
          t("error.restoreFailed"),
          result.error instanceof Error ? result.error.message : t("error.unknown"),
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
      try {
        if (onBeforeDeleteStory) {
          await onBeforeDeleteStory(storyToDelete);
        } else {
          await container.videoTaskStorage.deleteVideoTasksByStoryId(storyToDelete);
        }
      } catch (e) {
        errorLogger.warn("[StorySaver] 删除故事关联VideoTask失败", e);
      }
      const deleteResult = await fromAsyncThrowable(() => storyService.delete(storyToDelete));
      if (!deleteResult.ok) {
        errorLogger.warn("Failed to delete story from SQLite", deleteResult.error);
        setDeleteDialogOpen(false);
        setStoryToDelete(null);
        showError(t("error.deleteFailed"), t("story.dbDeleteFailed"));
        return;
      }
      setStories((prev) => prev.filter((s) => s.id !== storyToDelete));
      if (currentStory.id === storyToDelete) {
        setCurrentStory(DEFAULT_STORY, true);
        setBeats([]);
      }
      setDeleteDialogOpen(false);
      setStoryToDelete(null);
      success(t("success.deleted"), t("success.storyDeleted"));
    }
  }, [storyToDelete, setStories, currentStory, setCurrentStory, setBeats, success, showError, onBeforeDeleteStory]);

  const applyStoryTemplate = useCallback(
    (template: StoryTemplate) => {
      const newBeats = applyTemplate(template);
      setBeats(newBeats);
      setTemplateDialogOpen(false);
      success(
        t("success.templateApplied"),
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
        t("success.templateApplied"),
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
      success(t("success.templateSaved"), t("success.templateSavedDesc", { name: template.name }));
    },
    [success],
  );

  const handleDeleteTemplate = useCallback(
    (id: string) => {
      setSavedTemplates((prev) => prev.filter((t) => t.id !== id));
      success(t("success.templateDeleted"), t("success.templateDeletedDesc"));
    },
    [success],
  );

  const currentStoryIdRef = useRef(currentStory.id);
  useEffect(() => {
    currentStoryIdRef.current = currentStory.id;
  }, [currentStory.id]);

  const handleSave = useCallback(async () => {
    if (savingRef.current) return;
    if (beats.length === 0) {
      showError(t("error.cannotSave"), t("error.addBeatFirst"));
      return;
    }
    const storyTitle = currentStory.title?.trim() || "未命名分镜";
    const storyIdAtSaveStart = currentStory.id;
    const newStory: Story = {
      ...currentStory,
      title: storyTitle,
      id:
        currentStory.id ||
        `story_${crypto.randomUUID()}`,
      beats,
      updatedAt: Math.floor(Date.now() / 1000),
    };

    savingRef.current = true;
    setSaveStatus("saving");
    setSaveError("");

    try {
      const saveResult = await fromAsyncThrowable(async () => {
        if (storyIdAtSaveStart) {
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
          t("error.saveFailed"),
          mapUserFacingError(err),
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
          t("error.saveFailed"),
          mapUserFacingError(err),
        );
        return;
      }

      const savedStory = !storyIdAtSaveStart && serviceResult.value
        ? { ...newStory, id: serviceResult.value.id }
        : newStory;

      if (currentStoryIdRef.current !== storyIdAtSaveStart) {
        setSaveStatus("idle");
        return;
      }

      setStories((prev) =>
        storyIdAtSaveStart
          ? prev.map((s) => (s.id === savedStory.id ? savedStory : s))
          : [...prev, savedStory],
      );
      setCurrentStory(savedStory, true);
      markClean("story");
      setSaveStatus("saved");
      success(
        storyIdAtSaveStart ? t("success.saved") : t("success.created"),
        storyIdAtSaveStart ? "分镜项目已更新" : "新分镜项目已添加",
      );
    } finally {
      savingRef.current = false;
    }
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
