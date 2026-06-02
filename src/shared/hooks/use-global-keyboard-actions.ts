import { useEffect, useRef } from "react";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { t } from "@/shared/constants/messages";

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
        info(t("keyboard.undoNotSupported"));
      }
    };

    const redoHandler = () => {
      if (optionsRef.current?.onRedo) {
        optionsRef.current.onRedo();
      } else {
        info(t("keyboard.redoNotSupported"));
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
