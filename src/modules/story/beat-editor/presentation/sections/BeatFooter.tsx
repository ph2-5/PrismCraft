import { Button } from "@/shared/ui/button";
import { errorLogger } from "@/shared/error-logger";
import { useConfirmDialog } from "@/shared/ui/confirm-dialog";
import { t } from "@/shared/constants";

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
              title: t("beat.deleteBeatTitle"),
              description: t("beat.deleteBeatDesc"),
              confirmText: t("common.delete"),
              variant: "danger",
            }).then((confirmed) => {
              if (confirmed) onDeleteBeat();
            }).catch((err) => {
              errorLogger.warn("[BeatDetailEditor] confirm dialog error", err);
            });
          }}
        >
          {t("beat.deleteBeatButton")}
        </Button>
        <Button variant="outline" size="sm" onClick={onClose}>
          {t("common.close")}
        </Button>
      </div>
      {ConfirmDialogComponent}
    </>
  );
}
