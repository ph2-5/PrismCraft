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
