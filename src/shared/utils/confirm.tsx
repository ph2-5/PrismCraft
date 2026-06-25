import { createRoot } from "react-dom/client";
import { AlertTriangle, Trash2, AlertCircle } from "lucide-react";
import { t } from "@/shared/constants";
import { Modal } from "@/shared/presentation/Modal";

interface ConfirmOptions {
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "warning" | "default";
}

const defaultOptions: ConfirmOptions = {
  title: undefined,
  description: undefined,
  confirmText: undefined,
  cancelText: undefined,
  variant: "default",
};

export function confirm(
  message: string,
  title?: string,
): Promise<boolean>;
export function confirm(options: ConfirmOptions): Promise<boolean>;
export function confirm(
  messageOrOptions: string | ConfirmOptions,
  title?: string,
): Promise<boolean> {
  const options: ConfirmOptions =
    typeof messageOrOptions === "string"
      ? { ...defaultOptions, description: messageOrOptions, title: title || defaultOptions.title }
      : { ...defaultOptions, ...messageOrOptions };

  return new Promise((resolve) => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    const handleConfirm = () => {
      root.unmount();
      container.remove();
      resolve(true);
    };

    const handleCancel = () => {
      root.unmount();
      container.remove();
      resolve(false);
    };

    root.render(
      <Modal
        open={true}
        onClose={handleCancel}
        ariaLabel={options.title || t("confirm.title")}
        style={{ maxWidth: 425 }}
      >
        <div className="flex items-start gap-4 p-2">
          {options.variant === "danger" && (
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
              <Trash2 className="w-5 h-5 text-red-500" />
            </div>
          )}
          {options.variant === "warning" && (
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-yellow-500/10 flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-yellow-500" />
            </div>
          )}
          {options.variant === "default" && (
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-blue-500" />
            </div>
          )}
          <div className="flex-1">
            <h3 className="text-lg font-semibold">{options.title || t("confirm.title")}</h3>
            {options.description && (
              <p className="mt-2 text-sm text-muted-foreground">
                {options.description}
              </p>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" className="btn btn-outline" onClick={handleCancel}>
            {options.cancelText || t("common.cancel")}
          </button>
          <button
            type="button"
            className={options.variant === "danger" ? "btn btn-danger" : "btn btn-primary"}
            onClick={handleConfirm}
          >
            {options.confirmText || t("common.confirm")}
          </button>
        </div>
      </Modal>,
    );
  });
}
