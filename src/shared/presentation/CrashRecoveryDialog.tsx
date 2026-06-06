import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { errorLogger } from "@/shared/error-logger";
import { isElectron } from "@/shared/utils/platform";
import { t } from "@/shared/constants";
import { confirm } from "@/shared/utils/confirm";

interface AutoSaveRecord {
  id: string;
  type: string;
  data_json: string;
  timestamp: number;
}

interface CrashRecoveryDialogProps {
  loadAutoSaves: () => Promise<AutoSaveRecord[]>;
  deleteAutoSave: (id: string) => Promise<void>;
}

export function CrashRecoveryDialog({ loadAutoSaves, deleteAutoSave }: CrashRecoveryDialogProps) {
  const [autoSaves, setAutoSaves] = useState<AutoSaveRecord[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isElectron()) return;
    let cancelled = false;
    (async () => {
      try {
        const saves = await loadAutoSaves();
        const recentSaves = saves.filter(
          (s) => Date.now() - (s.timestamp || 0) < 24 * 60 * 60 * 1000,
        );
        if (!cancelled && recentSaves.length > 0) {
          setAutoSaves(recentSaves);
          setOpen(true);
        }
      } catch (e) {
        errorLogger.warn("[CrashRecovery] 读取自动保存数据失败:", e);
      }
    })();
    return () => { cancelled = true; };
  }, [loadAutoSaves]);

  const handleDismiss = async () => {
    const confirmed = await confirm(
      t("crash.dismissConfirmMsg"),
      t("crash.dismissConfirmTitle"),
    );
    if (!confirmed) return;
    try {
      for (const save of autoSaves) {
        await deleteAutoSave(save.id);
      }
      setOpen(false);
    } catch (err) {
      errorLogger.error("[CrashRecovery] 清除自动保存记录失败:", err);
    }
  };

  if (autoSaves.length === 0) return null;

  const latestSave = autoSaves[0];
  const saveTime = latestSave.timestamp
    ? new Date(latestSave.timestamp).toLocaleString("zh-CN")
    : t("crash.unknownTime");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("crash.unsavedData")}</DialogTitle>
          <DialogDescription>
            {t("crash.unsavedDataDesc", { count: autoSaves.length, time: saveTime })}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-40 overflow-y-auto space-y-1">
          {autoSaves.slice(0, 5).map((save) => (
            <div
              key={save.id}
              className="text-sm text-muted-foreground flex justify-between"
            >
              <span>{save.type || t("crash.unknownType")}</span>
              <span>
                {save.timestamp
                  ? new Date(save.timestamp).toLocaleTimeString("zh-CN")
                  : ""}
              </span>
            </div>
          ))}
          {autoSaves.length > 5 && (
            <div className="text-xs text-muted-foreground">
              {t("crash.moreRecords", { count: autoSaves.length - 5 })}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleDismiss}>
            {t("crash.dismissAndClearConfirm")}
          </Button>
          <Button onClick={() => setOpen(false)}>{t("crash.acknowledged")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
