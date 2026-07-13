import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Story } from "@/domain/schemas";
import {
  characterService,
} from "@/modules/character";
import {
  sceneService,
} from "@/modules/scene";
import {
  storyboardAssetService,
} from "@/modules/asset";
import { useCharacters } from "@/modules/character";
import { useScenes } from "@/modules/scene";
import { useStories, storyService } from "@/modules/storyboard";
import { checkCharacterReferences, checkSceneReferences } from "@/domain/services";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { errorLogger } from "@/shared/error-logger";
import { mapUserFacingError } from "@/shared/utils/user-facing-error";
import { confirm } from "@/shared/utils/confirm";
import { t } from "@/shared/constants/messages";
import {
  transformStoryAfterCharacterDelete,
  transformStoryAfterSceneDelete,
  isStoryAffectedByCharacterDelete,
  isStoryAffectedBySceneDelete,
} from "./assetLibraryActions";

interface UseAssetDeleteHandlersParams {
  loadSecondaryData: () => Promise<void>;
}

export function useAssetDeleteHandlers({
  loadSecondaryData,
}: UseAssetDeleteHandlersParams) {
  const { success, error: showError } = useToastHelpers();
  const queryClient = useQueryClient();
  const { data: characters = [] } = useCharacters();
  const { data: scenes = [] } = useScenes();
  const { data: stories = [] } = useStories();

  const updateStoriesAfterEntityDelete = useCallback(async (
    transformStory: (story: Story) => Story,
    isAffected: (original: Story) => boolean,
  ) => {
    const updatedStories = stories.map((story) => transformStory(story));
    for (const updatedStory of updatedStories) {
      const original = stories.find((s) => s.id === updatedStory.id);
      if (original && isAffected(original)) {
        const result = await storyService.update(updatedStory.id, updatedStory);
        if (!result.ok) {
          errorLogger.warn("[AssetLibrary] 更新关联故事失败", { storyId: updatedStory.id, error: result.error });
        }
      }
    }
  }, [stories]);

  const handleDeleteCharacter = useCallback(async (id: string) => {
    const character = characters.find((c) => c.id === id);
    const checkResult = checkCharacterReferences(id, character?.name || id, stories);
    if (checkResult.references.length > 0) {
      const storyNames = [...new Set(checkResult.references.flatMap((r) => r.usedInStories))];
      if (!(await confirm(
        t("confirm.deleteCharacter"),
        t("asset.referencedByStories", { name: character?.name || id, stories: storyNames.join("、") }),
      ))) return;
    } else {
      if (!(await confirm(t("confirm.deleteCharacter"), t("confirm.deleteCharacterTitle")))) return;
    }
    try {
      const result = await characterService.delete(id);
      if (!result.ok) throw result.error;
      queryClient.invalidateQueries({ queryKey: ["characters"] });
      await updateStoriesAfterEntityDelete(
        (story) => transformStoryAfterCharacterDelete(story, id),
        (original) => isStoryAffectedByCharacterDelete(original, id),
      );
      queryClient.invalidateQueries({ queryKey: ["stories"] });
      success(t("success.deleted"), t("success.assetDeleted"));
    } catch (e) {
      showError(t("error.deleteFailed"), mapUserFacingError(e));
    }
  }, [characters, stories, queryClient, updateStoriesAfterEntityDelete, success, showError]);

  const handleDeleteScene = useCallback(async (id: string) => {
    const scene = scenes.find((s) => s.id === id);
    const checkResult = checkSceneReferences(id, scene?.name || id, stories);
    if (checkResult.references.length > 0) {
      const storyNames = [...new Set(checkResult.references.flatMap((r) => r.usedInStories))];
      if (!(await confirm(
        t("confirm.deleteScene"),
        t("asset.referencedByStories", { name: scene?.name || id, stories: storyNames.join("、") }),
      ))) return;
    } else {
      if (!(await confirm(t("confirm.deleteScene"), t("confirm.deleteSceneTitle")))) return;
    }
    try {
      const result = await sceneService.delete(id);
      if (!result.ok) throw result.error;
      queryClient.invalidateQueries({ queryKey: ["scenes"] });
      await updateStoriesAfterEntityDelete(
        (story) => transformStoryAfterSceneDelete(story, id),
        (original) => isStoryAffectedBySceneDelete(original, id),
      );
      queryClient.invalidateQueries({ queryKey: ["stories"] });
      success(t("success.deleted"), t("success.assetDeleted"));
    } catch (e) {
      showError(t("error.deleteFailed"), mapUserFacingError(e));
    }
  }, [scenes, stories, queryClient, updateStoriesAfterEntityDelete, success, showError]);

  const handleDeleteStoryboard = useCallback(async (id: string) => {
    if (!(await confirm(t("confirm.deleteBeat"), t("confirm.deleteBeatTitle")))) return;
    try {
      await storyboardAssetService.remove(id);
      await loadSecondaryData();
      success(t("success.deleted"), t("success.assetDeleted"));
    } catch (e) {
      showError(t("error.deleteFailed"), mapUserFacingError(e));
    }
  }, [loadSecondaryData, showError, success]);

  return {
    handleDeleteCharacter,
    handleDeleteScene,
    handleDeleteStoryboard,
  };
}
