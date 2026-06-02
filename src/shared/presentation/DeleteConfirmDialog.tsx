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
import { t } from "@/shared/constants";

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
            {t("confirm.deleteTitle")}{entityLabel}
          </DialogTitle>
          <DialogDescription>
            {referenceCheck && referenceCheck.references.length > 0 ? (
              <div className="space-y-2">
                <p className="text-destructive font-medium">
                  {t("delete.entityReferencedBy", { entityLabel, count: referenceCheck.references.length })}
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
                          {t("delete.shotCount", { count: ref.usedInBeats.length })}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground">
                  {t("delete.refWillInvalidate", { entityLabel })}
                </p>
              </div>
            ) : (
              t("delete.confirmDeleteEntity", { entityLabel })
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            {t("common.cancel")}
          </Button>
          <Button
            variant="destructive"
            disabled={isDeleting}
            onClick={onConfirm}
          >
            {isDeleting ? t("common.deleting") : t("confirm.deleteTitle")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
