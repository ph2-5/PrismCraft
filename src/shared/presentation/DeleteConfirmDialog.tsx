import { AlertTriangle } from "lucide-react";
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
  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={() => onOpenChange(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ marginBottom: 12 }}>
          <div className="flex items-center gap-2" style={{ fontSize: 16, fontWeight: 600 }}>
            <AlertTriangle className="w-5 h-5 text-destructive" />
            {t("confirm.deleteTitle")}{entityLabel}
          </div>
          <div style={{ fontSize: 12, color: "var(--muted-fg)", marginTop: 8 }}>
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
                <p className="text-xs text-muted-foreground mt-1">
                  {t("delete.viewRefsInStoryboard")}
                </p>
              </div>
            ) : (
              t("delete.confirmDeleteEntity", { entityLabel })
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={isDeleting || (referenceCheck?.references.length ?? 0) > 0}
            onClick={onConfirm}
            title={
              (referenceCheck?.references.length ?? 0) > 0
                ? t("delete.cannotDeleteReferenced", { entityLabel })
                : undefined
            }
          >
            {isDeleting ? t("common.deleting") : t("confirm.deleteTitle")}
          </button>
        </div>
      </div>
    </div>
  );
}
