import { useEffect } from "react";
import { useVideoTaskStore } from "@/modules/video/task-management";
import { installGlobalErrorHandlers } from "@/shared/error-logger";

export function VideoTaskManagerInitializer() {
  useEffect(() => {
    installGlobalErrorHandlers();
    useVideoTaskStore.getState().initialize();
    return () => {
      useVideoTaskStore.getState().cleanup();
    };
  }, []);

  return null;
}
