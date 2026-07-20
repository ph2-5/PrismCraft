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
} from "@/modules/storyboard";
import type { Story, StoryBeat } from "@/domain/schemas";
import { errorLogger, extractErrorMessage } from "@/shared/error-logger";
import { mapUserFacingError } from "@/shared/utils/user-facing-error";
import { fromAsyncThrowable } from "@/domain/types/result";
import { removeTasksByStoryId } from "@/modules/video/task-management";
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
}

function normalizeTemplateBeats(templateBeats: Array<Partial<StoryBeat>>): StoryBeat[] {
  return templateBeats.map((beat, index) => ({
    id: `beat_${crypto.randomUUID()}`,
    type: beat.type || "scene",
    title: beat.title || "",
    content: beat.content || "",
    description: beat.description || "",
    duration: beat.duration ?? 5,
    order: index,
    sequence: index,
    elementIds: beat.elementIds ?? [],
    characterIds: beat.characterIds ?? [],
    enhancedGeneration: beat.enhancedGeneration ?? false,
    sceneId: undefined,
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
}

async function deleteStoryAndAssociatedTasks(storyId: string): Promise<{ ok: true } | { ok: false; error: unknown }> {
  try {
    await removeTasksByStoryId(storyId);
  } catch (e) {
    errorLogger.warn("[StorySaver] 删除故事关联VideoTask失败", e);
  }
  const deleteResult = await fromAsyncThrowable(() => storyService.delete(storyId));
  if (!deleteResult.ok) {
    return { ok: false, error: deleteResult.error };
  }
  const serviceResult = deleteResult.value;
  if (!serviceResult.ok) {
    return { ok: false, error: serviceResult.error };
  }
  return { ok: true };
}

interface PersistStoryContext {
  newStory: Story;
  storyIdAtSaveStart: string;
}

async function persistStoryToBackend({
  newStory,
  storyIdAtSaveStart,
}: PersistStoryContext): Promise<
  | { ok: true; savedStory: Story }
  | { ok: false; error: unknown }
> {
  const saveResult = await fromAsyncThrowable(async () => {
    if (storyIdAtSaveStart) {
      return await storyService.update(newStory.id, newStory);
    }
    return await storyService.create(newStory);
  });

  if (!saveResult.ok) {
    return { ok: false, error: saveResult.error };
  }

  const serviceResult = saveResult.value;
  if (!serviceResult.ok) {
    return { ok: false, error: serviceResult.error };
  }

  const savedStory = !storyIdAtSaveStart && serviceResult.value
    ? { ...newStory, id: serviceResult.value.id }
    : newStory;
  return { ok: true, savedStory };
}

function buildStoryForSave(currentStory: Story, beats: StoryBeat[]): Story {
  const storyTitle = currentStory.title?.trim() || t("story.untitled");
  return {
    ...currentStory,
    title: storyTitle,
    id: currentStory.id || `story_${crypto.randomUUID()}`,
    beats,
    updatedAt: Math.floor(Date.now() / 1000),
  };
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
          t("success.versionRestoredDetail", { time: formatVersionTime(version.timestamp) }),
        );
      } else {
        showError(
          t("error.restoreFailed"),
          mapUserFacingError(result.error),
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
    if (!storyToDelete) return;
    const result = await deleteStoryAndAssociatedTasks(storyToDelete);
    if (!result.ok) {
      errorLogger.warn("Failed to delete story from SQLite", result.error);
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
  }, [storyToDelete, setStories, currentStory, setCurrentStory, setBeats, success, showError]);

  const applyStoryTemplate = useCallback(
    (template: StoryTemplate) => {
      const newBeats = applyTemplate(template);
      setBeats(newBeats);
      setTemplateDialogOpen(false);
      success(
        t("success.templateApplied"),
        t("success.templateAppliedDetail", { name: template.name, count: newBeats.length }),
      );
    },
    [setBeats, success],
  );

  const applyStoryboardTemplate = useCallback(
    (templateBeats: Array<Partial<StoryBeat>>) => {
      const newBeats = normalizeTemplateBeats(templateBeats);
      setBeats(newBeats);
      setTemplateDialogOpen(false);
      success(
        t("success.templateApplied"),
        t("success.customTemplateAppliedDetail", { count: newBeats.length }),
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
    const storyIdAtSaveStart = currentStory.id;
    const newStory = buildStoryForSave(currentStory, beats);

    savingRef.current = true;
    setSaveStatus("saving");
    setSaveError("");

    try {
      const result = await persistStoryToBackend({ newStory, storyIdAtSaveStart });
      if (!result.ok) {
        const err = result.error;
        errorLogger.error(String(err), "Failed to persist story to SQLite");
        const detail = extractErrorMessage(err);
        markDirty("story");
        setSaveStatus("error");
        setSaveError(detail);
        showError(t("error.saveFailed"), mapUserFacingError(err));
        return;
      }

      const { savedStory } = result;

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
        storyIdAtSaveStart ? t("success.storyUpdated") : t("success.storyCreated"),
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
