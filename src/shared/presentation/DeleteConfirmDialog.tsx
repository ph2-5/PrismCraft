"use client";

import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";

interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityLabel: string;
  isDeleting: boolean;
  onConfirm: () => void;
  referenceCheck: {
    references: Array<{
      elementId: string;
      elementName: string;
      usedInBeats: Array<unknown>;
    }>;
  } | null;
}

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  entityLabel,
  isDeleting,
  onConfirm,
  referenceCheck,
}: DeleteConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            确认删除{entityLabel}
          </DialogTitle>
          <DialogDescription>
            {referenceCheck && referenceCheck.references.length > 0 ? (
              <div className="space-y-2">
                <p className="text-destructive font-medium">
                  该{entityLabel}正在被 {referenceCheck.references.length} 个引用关联
                </p>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {referenceCheck.references.map((ref) => (
                    <div
                      key={ref.elementId}
                      className="text-sm bg-muted p-2 rounded"
                    >
                      <span className="font-medium">{ref.elementName}</span>
                      {ref.usedInBeats.length > 0 && (
                        <span className="text-muted-foreground">
                          {" "}
                          ({ref.usedInBeats.length} 个镜头)
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground">
                  删除后，相关故事中的{entityLabel}引用将失效。建议先修改故事内容。
                </p>
              </div>
            ) : (
              `确定要删除这个${entityLabel}吗？此操作不可撤销。`
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            取消
          </Button>
          <Button
            variant="destructive"
            disabled={isDeleting}
            onClick={onConfirm}
          >
            {isDeleting ? "删除中..." : "确认删除"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
