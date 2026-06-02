import { useMemo } from "react";
import type { VideoTask } from "@/modules/video";

interface UseStoryVideoParams {
  tasks: VideoTask[];
  currentStoryId: string | undefined;
  generatingKeyframe: string | null | undefined;
  generatingFramePair: string | null | undefined;
  generatingVideo: string | null | undefined;
}

export function useStoryVideo({
  tasks,
  currentStoryId,
  generatingKeyframe,
  generatingFramePair,
  generatingVideo,
}: UseStoryVideoParams) {
  const allCompletedTaskUrls = useMemo(() => {
    const map = new Map<string, string>();
    for (const task of tasks) {
      if (task.beatId && task.status === "completed" && task.videoUrl) {
        map.set(task.beatId, task.videoUrl);
      }
    }
    return map;
  }, [tasks]);

  const completedTaskUrls = useMemo(() => {
    const map = new Map<string, string>();
    for (const task of tasks) {
      if (task.beatId && task.status === "completed" && task.videoUrl) {
        if (currentStoryId && task.storyId && task.storyId !== currentStoryId) continue;
        map.set(task.beatId, task.videoUrl);
      }
    }
    return map;
  }, [tasks, currentStoryId]);

  const generatingBeats = useMemo(() => {
    const set = new Set<string>();
    if (generatingKeyframe) set.add(generatingKeyframe);
    if (generatingFramePair) set.add(generatingFramePair);
    if (generatingVideo) set.add(generatingVideo);
    return set;
  }, [generatingKeyframe, generatingFramePair, generatingVideo]);

  return { allCompletedTaskUrls, completedTaskUrls, generatingBeats };
}
