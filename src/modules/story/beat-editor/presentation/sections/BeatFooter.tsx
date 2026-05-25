"use client";

import { Button } from "@/shared/ui/button";
import { errorLogger } from "@/shared/error-logger";
import { useConfirmDialog } from "@/shared/ui/confirm-dialog";

interface BeatFooterProps {
  onDeleteBeat: () => void;
  onClose: () => void;
}

export function BeatFooter({ onDeleteBeat, onClose }: BeatFooterProps) {
  const { confirm: confirmDialog, ConfirmDialogComponent } = useConfirmDialog();

  return (
    <>
      <div className="border-t border-border p-5 flex items-center justify-between bg-muted/20 shrink-0">
        <Button
          variant="destructive"
          size="sm"
          onClick={() => {
            confirmDialog({
              title: "删除分镜",
              description: "确定要删除此分镜吗？此操作无法撤销。",
              confirmText: "删除",
              variant: "danger",
            }).then((confirmed) => {
              if (confirmed) onDeleteBeat();
            }).catch((err) => {
              errorLogger.warn("[BeatDetailEditor] 确认对话框异常", err);
            });
          }}
        >
          删除分镜
        </Button>
        <Button variant="outline" size="sm" onClick={onClose}>
          关闭
        </Button>
      </div>
      {ConfirmDialogComponent}
    </>
  );
}
