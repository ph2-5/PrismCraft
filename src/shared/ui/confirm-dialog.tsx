import { useState, useCallback } from "react";
import { AlertTriangle, Trash2, AlertCircle } from "lucide-react";
import { t } from "@/shared/constants/messages";
import { Modal } from "@/shared/presentation/Modal";

interface ConfirmOptions {
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "warning" | "default";
}

const defaultOptions: ConfirmOptions = {
  title: t("confirm.title"),
  description: t("confirm.description"),
  confirmText: t("common.confirm"),
  cancelText: t("common.cancel"),
  variant: "default",
};

export function useConfirmDialog() {
  const [state, setState] = useState<{
    open: boolean;
    options: ConfirmOptions;
    resolver: ((value: boolean) => void) | null;
  }>({
    open: false,
    options: defaultOptions,
    resolver: null,
  });

  const confirm = useCallback(
    (options?: ConfirmOptions): Promise<boolean> => {
      return new Promise((resolve) => {
        setState({
          open: true,
          options: { ...defaultOptions, ...options },
          resolver: resolve,
        });
      });
    },
    [],
  );

  const handleConfirm = useCallback(() => {
    setState((prev) => {
      prev.resolver?.(true);
      return { ...prev, open: false, resolver: null };
    });
  }, []);

  const handleCancel = useCallback(() => {
    setState((prev) => {
      prev.resolver?.(false);
      return { ...prev, open: false, resolver: null };
    });
  }, []);

  const ConfirmDialogComponent = (
    <Modal
      open={state.open}
      onClose={handleCancel}
      ariaLabel={t("common.confirm")}
      style={{ maxWidth: 425 }}
    >
      <div className="flex items-start gap-4 p-2">
          {state.options.variant === "danger" && (
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
              <Trash2 className="w-5 h-5 text-destructive" />
            </div>
          )}
          {state.options.variant === "warning" && (
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-warning/10 flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-warning" />
            </div>
          )}
          {state.options.variant === "default" && (
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-primary" />
            </div>
          )}
          <div className="flex-1">
            <h3 className="text-lg font-semibold">{state.options.title}</h3>
            {state.options.description && (
              <p className="mt-2 text-sm text-muted-foreground">
                {state.options.description}
              </p>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" className="btn btn-outline" onClick={handleCancel}>
            {state.options.cancelText}
          </button>
          <button
            type="button"
            className={state.options.variant === "danger" ? "btn btn-danger" : "btn btn-primary"}
            onClick={handleConfirm}
          >
            {state.options.confirmText}
          </button>
        </div>
    </Modal>
  );

  return { confirm, ConfirmDialogComponent };
}
