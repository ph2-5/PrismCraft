"use client";

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
    : "未知时间";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>检测到未保存的数据</DialogTitle>
          <DialogDescription>
            应用上次可能未正常关闭，检测到 {autoSaves.length} 条自动保存记录。
            最近保存时间：{saveTime}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-40 overflow-y-auto space-y-1">
          {autoSaves.slice(0, 5).map((save) => (
            <div
              key={save.id}
              className="text-sm text-muted-foreground flex justify-between"
            >
              <span>{save.type || "未知类型"}</span>
              <span>
                {save.timestamp
                  ? new Date(save.timestamp).toLocaleTimeString("zh-CN")
                  : ""}
              </span>
            </div>
          ))}
          {autoSaves.length > 5 && (
            <div className="text-xs text-muted-foreground">
              ...还有 {autoSaves.length - 5} 条记录
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleDismiss}>
            忽略并清除
          </Button>
          <Button onClick={() => setOpen(false)}>知道了</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
