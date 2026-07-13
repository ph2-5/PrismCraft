import { useMemo, useRef } from "react";
import type { VideoTask } from "@/modules/video";

interface UseStoryVideoParams {
  tasks: VideoTask[];
  currentStoryId: string | undefined;
  generatingKeyframe: string | null | undefined;
  generatingFramePair: string | null | undefined;
  generatingVideo: string | null | undefined;
}

/**
 * Build a Map<beatId, videoUrl> from completed tasks, but only return a new
 * Map reference when the content actually changes. This prevents downstream
 * useEffects from firing on every tasks array reference change (e.g. polling).
 */
function useStableCompletedUrls(
  tasks: VideoTask[],
  filterStoryId?: string,
): Map<string, string> {
  const prevRef = useRef<Map<string, string>>(new Map());

  return useMemo(() => {
    const next = new Map<string, string>();
    for (const task of tasks) {
      if (task.beatId && task.status === "completed" && task.videoUrl) {
        if (filterStoryId && task.storyId && task.storyId !== filterStoryId) continue;
        next.set(task.beatId, task.videoUrl);
      }
    }
    // Only create a new reference if content changed
    if (next.size !== prevRef.current.size) {
      prevRef.current = next;
      return next;
    }
    for (const [key, value] of next) {
      if (prevRef.current.get(key) !== value) {
        prevRef.current = next;
        return next;
      }
    }
    return prevRef.current;
  }, [tasks, filterStoryId]);
}

export function useStoryVideo({
  tasks,
  currentStoryId,
  generatingKeyframe,
  generatingFramePair,
  generatingVideo,
}: UseStoryVideoParams) {
  const allCompletedTaskUrls = useStableCompletedUrls(tasks);
  const completedTaskUrls = useStableCompletedUrls(tasks, currentStoryId);

  const generatingBeats = useMemo(() => {
    const set = new Set<string>();
    if (generatingKeyframe) set.add(generatingKeyframe);
    if (generatingFramePair) set.add(generatingFramePair);
    if (generatingVideo) set.add(generatingVideo);
    return set;
  }, [generatingKeyframe, generatingFramePair, generatingVideo]);

  return { allCompletedTaskUrls, completedTaskUrls, generatingBeats };
}
