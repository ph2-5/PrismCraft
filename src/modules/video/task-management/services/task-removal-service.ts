import { useVideoTaskStore } from "../hooks/use-video-task-manager";

/**
 * 取消指定 beat 关联的视频任务。
 *
 * 这是 video 模块对外暴露的非 hook 公共 API，
 * 供其他模块（如 persistence）调用，避免跨模块直接访问 Zustand store。
 */
export async function removeTasksByBeatId(beatId: string): Promise<void> {
  await useVideoTaskStore.getState().removeTasksByBeatId(beatId);
}

/**
 * 取消指定 story 关联的视频任务。
 *
 * 这是 video 模块对外暴露的非 hook 公共 API，
 * 供其他模块（如 story）调用，避免跨模块直接访问 Zustand store。
 */
export async function removeTasksByStoryId(storyId: string): Promise<void> {
  await useVideoTaskStore.getState().removeTasksByStoryId(storyId);
}
