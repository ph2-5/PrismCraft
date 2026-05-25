import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getFailedTasks,
  getAllTaskHistory,
  recoverVideoByTaskId,
  cleanExpiredTasks,
  startBackgroundRecovery,
} from "@/modules/video/recovery";

const VIDEO_TASKS_KEY = ["video-tasks"] as const;

export function useVideoTasks() {
  return useQuery({
    queryKey: VIDEO_TASKS_KEY,
    queryFn: async () => {
      const result = await getAllTaskHistory();
      if (!result.ok) throw result.error;
      return result.value;
    },
  });
}

export function useFailedVideoTasks() {
  return useQuery({
    queryKey: [...VIDEO_TASKS_KEY, "failed"],
    queryFn: async () => {
      const result = await getFailedTasks();
      if (!result.ok) throw result.error;
      return result.value;
    },
  });
}

export function useRecoverVideo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: string) => {
      const result = await recoverVideoByTaskId(taskId);
      if (!result.ok) throw result.error;
      return result.value;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VIDEO_TASKS_KEY });
    },
  });
}

export function useCleanExpiredTasks() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const result = await cleanExpiredTasks();
      if (!result.ok) throw result.error;
      return result.value;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VIDEO_TASKS_KEY });
    },
  });
}

export function useStartBackgroundRecovery() {
  return useMutation({
    mutationFn: async () => {
      const result = await startBackgroundRecovery();
      if (!result.ok) throw result.error;
    },
  });
}
