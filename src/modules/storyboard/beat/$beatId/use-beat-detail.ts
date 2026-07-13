import { useParams } from "react-router-dom";
import { errorLogger } from "@/shared/error-logger";
import { useState, useEffect, type Dispatch, type SetStateAction } from "react";
import type { StoryBeat, Story } from "@/domain/schemas";
import type { VideoTask } from "@/modules/video";
import { useVideoTaskStore } from "@/modules/video";
import { storyService } from "@/modules/storyboard";

interface UseBeatDetailResult {
  story: Story | null;
  beat: StoryBeat | null;
  setBeat: Dispatch<SetStateAction<StoryBeat | null>>;
  task: VideoTask | undefined;
  loading: boolean;
}

export function useBeatDetail(): UseBeatDetailResult {
  const params = useParams();
  const beatId = params.beatId;
  const [story, setStory] = useState<Story | null>(null);
  const [beat, setBeat] = useState<StoryBeat | null>(null);
  const [loading, setLoading] = useState(true);

  // 通过 Zustand selector 订阅任务状态，由 polling-engine 统一负责轮询
  const task = useVideoTaskStore((s) => {
    if (!beatId) return undefined;
    return s.allTasks.find((t) => t.beatId === beatId);
  });

  useEffect(() => {
    if (!beatId) {
      errorLogger.error("[BeatDetail] beatId 参数缺失");
      setLoading(false);
      return;
    }
    // 捕获已收窄的值，供闭包使用（TypeScript 不会在闭包内自动收窄）
    const resolvedBeatId = beatId;
    let cancelled = false;
    const loadData = async () => {
      try {
        const foundResult = await storyService.getByBeatId(resolvedBeatId);
        const foundStory = foundResult.ok ? foundResult.value : null;

        if (!cancelled && foundStory) {
          setStory(foundStory);
          const foundBeat = foundStory.beats?.find(
            (b: StoryBeat) => b.id === resolvedBeatId,
          );
          if (foundBeat) {
            setBeat(foundBeat);
          }
        }
      } catch (error) {
        if (!cancelled) errorLogger.error("Failed to load beat detail", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadData();

    return () => {
      cancelled = true;
    };
  }, [beatId]);

  return { story, beat, setBeat, task, loading };
}
