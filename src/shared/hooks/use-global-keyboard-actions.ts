"use client";

import { useEffect, useRef } from "react";
import { useToastHelpers } from "@/shared/presentation/Toast";

export function useGlobalKeyboardActions(options?: {
  onSave?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
}) {
  const { info } = useToastHelpers();
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    const saveHandler = () => {
      optionsRef.current?.onSave?.();
    };

    const undoHandler = () => {
      if (optionsRef.current?.onUndo) {
        optionsRef.current.onUndo();
      } else {
        info("当前页面不支持撤销操作");
      }
    };

    const redoHandler = () => {
      if (optionsRef.current?.onRedo) {
        optionsRef.current.onRedo();
      } else {
        info("当前页面不支持重做操作");
      }
    };

    document.addEventListener("app:save", saveHandler);
    document.addEventListener("app:undo", undoHandler);
    document.addEventListener("app:redo", redoHandler);

    return () => {
      document.removeEventListener("app:save", saveHandler);
      document.removeEventListener("app:undo", undoHandler);
      document.removeEventListener("app:redo", redoHandler);
    };
  }, [info]);
}
