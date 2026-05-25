import { createRoot } from "react-dom/client";
import {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogContent,
} from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { AlertTriangle, Trash2, AlertCircle } from "lucide-react";

interface ConfirmOptions {
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "warning" | "default";
}

const defaultOptions: ConfirmOptions = {
  title: "确认操作",
  description: "此操作不可撤销，确定要继续吗？",
  confirmText: "确认",
  cancelText: "取消",
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
      <Dialog open={true} onOpenChange={(open) => { if (!open) handleCancel(); }}>
        <DialogPortal>
          <DialogOverlay />
          <DialogContent className="sm:max-w-[425px]">
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
                <h3 className="text-lg font-semibold">{options.title}</h3>
                {options.description && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {options.description}
                  </p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={handleCancel}>
                {options.cancelText}
              </Button>
              <Button
                variant={
                  options.variant === "danger" ? "destructive" : "default"
                }
                onClick={handleConfirm}
              >
                {options.confirmText}
              </Button>
            </div>
          </DialogContent>
        </DialogPortal>
      </Dialog>,
    );
  });
}
