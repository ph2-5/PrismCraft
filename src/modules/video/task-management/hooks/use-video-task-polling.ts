/**
 * @file use-video-task-polling — 视频任务轮询 Hook
 *
 * 职责：
 * - 暴露视频任务状态轮询的 public API（initialize / pollTask / cleanup）
 * - 将调用委托给 internals/shared-polling-logic（与 task-management 其他 hook 共享）
 * - 通过 PollingStoreAccessor 抽象 store 访问，便于测试替换
 *
 * 调用方：
 * - useVideoTaskManager（composition hook，对外统一接口）
 * - Agent 工具（video-tasks.ts 轮询单个任务）
 *
 * 不做：
 * - 不直接管理 polling 状态（由 internals/shared-polling-logic 负责）
 * - 不直接更新 store（通过 storeAccessor 间接调用）
 */

import { cleanupAllPollingResources } from "./internals";
import {
  initializePolling,
  pollTaskShared,
  type PollingStoreAccessor,
} from "./internals/shared-polling-logic";
import { useVideoTaskStore } from "./use-video-task-manager";

export interface VideoTaskPolling {
  initialize: () => void;
  pollTask: (taskId: string) => Promise<void>;
  cleanup: () => void;
}

function getStore() {
  return useVideoTaskStore.getState();
}

const storeAccessor: PollingStoreAccessor = {
  getState: getStore,
  set: useVideoTaskStore.setState.bind(useVideoTaskStore),
};

export function useVideoTaskPolling(): VideoTaskPolling {
  return {
    initialize: () => {
      initializePolling(storeAccessor);
    },

    pollTask: async (taskId) => {
      await pollTaskShared(storeAccessor, taskId);
    },

    cleanup: () => {
      cleanupAllPollingResources();
      useVideoTaskStore.setState({ isInitialized: false, isBackgroundProcessing: false, initError: null });
    },
  };
}
