import { useCallback } from "react";
import { t } from "@/shared/constants/messages";
import { errorLogger } from "@/shared/error-logger";
import { storyService } from "@/modules/story";
import { useVideoTaskStore, removeCachedImage } from "@/modules/video";
import { collectBeatRemoteImageUrls } from "@/modules/story/generation";
import type { useStoryState } from "@/modules/story";

interface UseStoryActionsParams {
  storyState: ReturnType<typeof useStoryState>;
  showError: (title: string, description?: string) => void;
}

export function useStoryActions({ storyState, showError }: UseStoryActionsParams) {
  const deleteBeatWithCleanup = useCallback(async (beatId: string) => {
    const beat = storyState.beatsRef.current.find((b) => b.id === beatId);
    try {
      await useVideoTaskStore.getState().removeTasksByBeatId(beatId);
    } catch (e) {
      errorLogger.warn("[StoryProvider] 删除beat关联VideoTask失败", e);
    }
    if (beat) {
      for (const url of collectBeatRemoteImageUrls(beat)) {
        try {
          await removeCachedImage(url);
        } catch (e) {
          errorLogger.debug("[StoryProvider] 清理图片缓存失败", e);
        }
      }
    }
    storyState.deleteBeat(beatId);
  }, [storyState]);

  const switchToStory = useCallback(async (storyId: string) => {
    const result = await storyService.getById(storyId);
    if (result.ok) {
      const fresh = result.value;
      storyState.setStories((prev) =>
        prev.map((s) => (s.id === fresh.id ? fresh : s)),
      );
      storyState.setCurrentStory(fresh, true);
      storyState.setBeats(fresh.beats || [], true);
      storyState.markClean("story");
      return;
    }
    const cached = storyState.stories.find((s) => s.id === storyId);
    if (cached) {
      storyState.setCurrentStory(cached, true);
      storyState.setBeats(cached.beats || [], true);
      storyState.markClean("story");
      errorLogger.warn("[StoryProvider] 从数据库加载故事失败，使用内存缓存", result.error);
      return;
    }
    errorLogger.warn("[StoryProvider] 切换故事失败", result.error);
    showError(t("error.operationFailed"), t("error.loadFailed"));
  }, [storyState, showError]);

  return { deleteBeatWithCleanup, switchToStory };
}
