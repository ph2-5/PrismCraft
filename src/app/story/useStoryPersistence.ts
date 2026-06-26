import type React from "react";
import { useEffect, useRef, useState } from "react";
import { errorLogger } from "@/shared/error-logger";
import { t } from "@/shared/constants";
import { storyService } from "@/modules/story";
import { getImageUrlWithCache } from "@/modules/video";
import {
  buildVideoUrlUpdates,
  applyVideoUrlUpdates,
  buildCacheRequests,
  filterRemoteCacheRequests,
  syncStoriesWithVideoUrls,
} from "@/modules/story/generation";
import type { Story, StoryBeat } from "@/domain/schemas";
import { useDirtyState } from "@/shared/hooks/use-dirty-state";

interface UseStoryPersistenceParams {
  beatsRef: React.MutableRefObject<StoryBeat[]>;
  setBeats: (update: StoryBeat[] | ((prev: StoryBeat[]) => StoryBeat[]), skipDirty?: boolean) => void;
  setStories: React.Dispatch<React.SetStateAction<Story[]>>;
  currentStory: Story & { beats: StoryBeat[] };
  currentStoryId: string | undefined;
  completedTaskUrls: Map<string, string>;
  allCompletedTaskUrls: Map<string, string>;
  showErrorRef: React.MutableRefObject<(title: string, description?: string) => void>;
}

// debounce 时长：合并短时间内的多次 completedTaskUrls 变更，避免并发持久化
const PERSIST_DEBOUNCE_MS = 500;

export function useStoryPersistence({
  beatsRef,
  setBeats,
  setStories,
  currentStory,
  currentStoryId: _currentStoryId,
  completedTaskUrls,
  allCompletedTaskUrls,
  showErrorRef,
}: UseStoryPersistenceParams) {
  const setBeatsRef = useRef(setBeats);
  useEffect(() => { setBeatsRef.current = setBeats; }, [setBeats]);
  const setStoriesRef = useRef(setStories);
  useEffect(() => { setStoriesRef.current = setStories; }, [setStories]);
  const currentStoryRef = useRef(currentStory);
  useEffect(() => { currentStoryRef.current = currentStory; }, [currentStory]);
  const markDirty = useDirtyState((s) => s.markDirty);

  const [isVideoUrlPersisting, setIsVideoUrlPersisting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const updateVideoUrls = async () => {
      const currentBeats = beatsRef.current;
      const updates = buildVideoUrlUpdates(currentBeats, completedTaskUrls);
      if (updates.length === 0) return;

      if (!cancelled) {
        setBeatsRef.current((prev) => applyVideoUrlUpdates(prev, updates));
      }

      if (!cancelled) {
        try {
          const allPersistData: Array<{
            id: string;
            keyframeImageUrl?: string;
            firstFrameImageUrl?: string;
            lastFrameImageUrl?: string;
            videoUrl?: string;
            localKeyframePath?: string;
            localFirstFramePath?: string;
            localLastFramePath?: string;
            localVideoPath?: string;
          }> = [];

          for (const [beatId, videoUrl] of allCompletedTaskUrls.entries()) {
            allPersistData.push({ id: beatId, videoUrl });
          }

          if (allPersistData.length > 0) {
            setIsVideoUrlPersisting(true);
            try {
              await storyService.updateBeatMediaUrls(allPersistData);
              if (!cancelled) {
                setStoriesRef.current((prev) =>
                  syncStoriesWithVideoUrls(prev, allCompletedTaskUrls),
                );
              }
            } catch (e) {
              if (!cancelled) {
                errorLogger.warn("自动保存视频URL失败", e);
                markDirty("story");
                showErrorRef.current(t("story.autoSaveVideoUrlFailed"), t("story.autoSaveVideoUrlFailedDesc"));
              }
            } finally {
              setIsVideoUrlPersisting(false);
            }
          }

          const currentStory = currentStoryRef.current;
          if (currentStory?.id) {
            const result = await storyService.update(currentStory.id, {
              id: currentStory.id,
              updatedAt: Math.floor(Date.now() / 1000),
            });
            if (!result.ok) throw result.error;
          }

          if (!cancelled) {
            const latestBeats = beatsRef.current;
            const cacheRequests = filterRemoteCacheRequests(buildCacheRequests(latestBeats));
            // 串行处理缓存请求，避免并发 IIFE 导致状态覆盖
            for (const { beatId, field, url } of cacheRequests) {
              if (cancelled) break;
              try {
                const cacheResult = await getImageUrlWithCache(url);
                if (cancelled) break;
                if (cacheResult.ok && cacheResult.value.fromCache && cacheResult.value.url.startsWith("file://")) {
                  const localPath = cacheResult.value.url.replace(/^file:\/\//, "");
                  setBeatsRef.current((prev) =>
                    prev.map((b) => b.id === beatId ? { ...b, [field]: localPath } : b),
                  );
                }
              } catch (e) {
                errorLogger.debug("[StoryProvider] 图片缓存失败", e);
              }
            }
          }
        } catch (e) {
          errorLogger.warn("自动保存视频URL失败", e);
          showErrorRef.current(t("story.autoSaveVideoUrlFailed"), t("story.autoSaveVideoUrlFailedDesc"));
        }
      }
    };

    // debounce：合并短时间内的多次变更，避免并发持久化竞态
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      if (!cancelled) {
        updateVideoUrls();
      }
    }, PERSIST_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
    };
  }, [completedTaskUrls, allCompletedTaskUrls, beatsRef]);

  return { isVideoUrlPersisting };
}
