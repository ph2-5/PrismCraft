"use client";

import { useState, useCallback } from "react";
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
    <Dialog open={state.open} onOpenChange={(open) => { if (!open) handleCancel(); }}>
      <DialogPortal>
        <DialogOverlay />
        <DialogContent className="sm:max-w-[425px]">
          <div className="flex items-start gap-4 p-2">
            {state.options.variant === "danger" && (
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-500" />
              </div>
            )}
            {state.options.variant === "warning" && (
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-yellow-500/10 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-yellow-500" />
              </div>
            )}
            {state.options.variant === "default" && (
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-blue-500" />
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
            <Button variant="outline" onClick={handleCancel}>
              {state.options.cancelText}
            </Button>
            <Button
              variant={
                state.options.variant === "danger" ? "destructive" : "default"
              }
              onClick={handleConfirm}
            >
              {state.options.confirmText}
            </Button>
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );

  return { confirm, ConfirmDialogComponent };
}
