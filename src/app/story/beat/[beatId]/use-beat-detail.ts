import { useParams } from "next/navigation";
import { errorLogger } from "@/shared/error-logger";
import { useState, useEffect } from "react";
import type { StoryBeat, Story } from "@/domain/schemas";
import type { VideoTask } from "@/modules/video";
import { useVideoTaskStore } from "@/modules/video";
import { storyService } from "@/modules/story";

interface UseBeatDetailResult {
  story: Story | null;
  beat: StoryBeat | null;
  task: VideoTask | undefined;
  loading: boolean;
}

export function useBeatDetail(): UseBeatDetailResult {
  const params = useParams();
  const beatId = params.beatId as string;
  const [story, setStory] = useState<Story | null>(null);
  const [beat, setBeat] = useState<StoryBeat | null>(null);
  const [task, setTask] = useState<VideoTask | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const loadData = async () => {
      try {
        const foundResult = await storyService.getByBeatId(beatId);
        const foundStory = foundResult.ok ? foundResult.value : null;

        if (!cancelled && foundStory) {
          setStory(foundStory);
          const foundBeat = foundStory.beats?.find(
            (b: StoryBeat) => b.id === beatId,
          );
          if (foundBeat) {
            setBeat(foundBeat);
          }
        }

        const tasks = useVideoTaskStore.getState().allTasks;
        const foundTask = tasks.find((t: VideoTask) => t.beatId === beatId);
        if (!cancelled && foundTask) {
          setTask(foundTask);
        }
      } catch (error) {
        if (!cancelled) errorLogger.error("Failed to load beat detail", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadData();

    const intervalId = setInterval(async () => {
      try {
        const tasks = useVideoTaskStore.getState().allTasks;
        const currentTask = tasks.find((t: VideoTask) => t.beatId === beatId);
        if (currentTask) {
          setTask((prev) => {
            if (
              prev?.status !== currentTask.status ||
              prev?.progress !== currentTask.progress ||
              prev?.videoUrl !== currentTask.videoUrl
            ) {
              return currentTask;
            }
            return prev;
          });
        }
      } catch (error) {
        errorLogger.debug("[BeatDetail] 轮询任务状态失败:", error instanceof Error ? error.message : error);
      }
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [beatId]);

  return { story, beat, task, loading };
}
