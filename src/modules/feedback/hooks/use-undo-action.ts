import { useCallback, useEffect, useRef } from "react";
import { useToastHelpers } from "@/shared/presentation/Toast";

export function useUndoAction() {
  const { success } = useToastHelpers();
  const pendingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const currentTimers = pendingTimers.current;
    return () => {
      for (const [, timer] of currentTimers) {
        clearTimeout(timer);
      }
      currentTimers.clear();
    };
  }, []);

  const executeWithUndo = useCallback(
    <T>(
      action: () => T,
      undoAction: () => void,
      label: string,
      timeout = 5000,
    ): T => {
      const timerId = `undo-${Date.now()}`;
      const result = action();

      const timer = setTimeout(() => {
        pendingTimers.current.delete(timerId);
      }, timeout);
      pendingTimers.current.set(timerId, timer);

      success(label, "点击撤销可恢复操作", {
        action: {
          label: "撤销",
          onClick: () => {
            clearTimeout(timer);
            pendingTimers.current.delete(timerId);
            undoAction();
          },
        },
      });

      return result;
    },
    [success],
  );

  return { executeWithUndo };
}
