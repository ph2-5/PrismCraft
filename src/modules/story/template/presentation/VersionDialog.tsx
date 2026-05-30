"use client";

import { useState, useCallback, useEffect } from "react";
import { Save, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { errorLogger } from "@/shared/error-logger";
import { emitToast } from "@/shared/utils/toast-bridge";
import type { Story, StoryBeat } from "@/domain/schemas";
import {
  saveVersion,
  getVersions,
  deleteVersion,
  formatVersionTime,
  type StoryVersion,
} from "@/modules/story";

interface VersionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentStory: Story;
  beats: StoryBeat[];
  onRestoreVersion: (version: StoryVersion) => void;
}

export function VersionDialog({
  open,
  onOpenChange,
  currentStory,
  beats,
  onRestoreVersion,
}: VersionDialogProps) {
  const [versions, setVersions] = useState<StoryVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<StoryVersion | null>(
    null,
  );
  const [versionName, setVersionName] = useState("");
  const [confirmAction, setConfirmAction] = useState<"restore" | "delete" | null>(null);
  const [confirmVersionId, setConfirmVersionId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const loadVersions = useCallback(async () => {
    const storyId = currentStory?.id || "new";
    const result = await getVersions(storyId);
    return result.ok ? result.value : [];
  }, [currentStory?.id]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    loadVersions().then((versions) => {
      if (!cancelled) setVersions(versions);
    }).catch((err) => {
      errorLogger.warn("[VersionDialog] 版本列表加载失败", err);
    });
    return () => { cancelled = true; };
  }, [open, loadVersions]);

  const handleSaveVersion = useCallback(async () => {
    if (beats.length === 0 || isSaving) {
      return;
    }

    setIsSaving(true);
    try {
      const storyId = currentStory?.id || "new";
      const storyToSave = {
        ...currentStory,
        id: storyId,
        beats,
        updatedAt: Math.floor(Date.now() / 1000),
      };
      const saveResult = await saveVersion(storyToSave, beats, versionName ? `自定义: ${versionName}` : "");
      if (!saveResult.ok) {
        errorLogger.warn("[VersionDialog] 保存版本失败", saveResult.error);
        emitToast("error", "保存版本失败");
      } else {
        emitToast("success", "版本已保存");
      }
      setVersionName("");
      loadVersions();
    } finally {
      setIsSaving(false);
    }
  }, [currentStory, beats, loadVersions, versionName, isSaving]);

  const handleRestoreVersion = useCallback(
    (version: StoryVersion) => {
      setConfirmAction("restore");
      setConfirmVersionId(version.id);
    },
    [],
  );

  const handleDeleteVersion = useCallback(
    (versionId: string) => {
      setConfirmAction("delete");
      setConfirmVersionId(versionId);
    },
    [],
  );

  const handleConfirmAction = useCallback(async () => {
    if (confirmAction === "restore" && confirmVersionId) {
      const version = versions.find((v) => v.id === confirmVersionId);
      if (version) {
        onRestoreVersion(version);
        onOpenChange(false);
        setSelectedVersion(null);
      }
    } else if (confirmAction === "delete" && confirmVersionId) {
      const storyId = currentStory?.id || "new";
      const deleteResult = await deleteVersion(storyId, confirmVersionId);
      if (!deleteResult.ok) {
        errorLogger.warn("[VersionDialog] 删除版本失败", deleteResult.error);
        emitToast("error", "删除版本失败");
      } else {
        emitToast("success", "版本已删除");
      }
      loadVersions();
    }
    setConfirmAction(null);
    setConfirmVersionId(null);
  }, [confirmAction, confirmVersionId, versions, onRestoreVersion, onOpenChange, currentStory, loadVersions]);

  const handleCancelConfirm = useCallback(() => {
    setConfirmAction(null);
    setConfirmVersionId(null);
  }, []);

  return (
    <>
      <Dialog open={open && !confirmAction} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>版本控制</DialogTitle>
            <DialogDescription>保存和恢复故事的不同版本</DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-3">
            <div className="flex gap-2">
              <div className="flex-1">
                <Label htmlFor="version-name" className="sr-only">版本名称</Label>
                <Input
                  id="version-name"
                  placeholder="输入版本名称（可选）"
                  value={versionName}
                  onChange={(e) => setVersionName(e.target.value)}
                />
              </div>
              <Button
                onClick={handleSaveVersion}
                disabled={beats.length === 0 || isSaving}
              >
                <Save className="w-4 h-4 mr-2" />
                保存
              </Button>
            </div>
          </div>
          <div className="mt-4 max-h-[400px] py-4 overflow-y-auto">
            {versions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                暂无保存的版本
              </div>
            ) : (
              <div className="space-y-3">
                {versions.map((version) => (
                  <div
                    key={version.id}
                    className={`flex items-center justify-between p-3 border rounded-lg hover:bg-muted cursor-pointer transition-colors ${
                      selectedVersion?.id === version.id
                        ? "border-primary bg-primary/10"
                        : ""
                    }`}
                    onClick={() => setSelectedVersion(version)}
                  >
                    <div>
                      <h4 className="font-medium">
                        {version.changeSummary || version.title || `版本 ${formatVersionTime(version.timestamp)}`}
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        保存于 {formatVersionTime(version.timestamp)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRestoreVersion(version);
                        }}
                      >
                        <RefreshCw className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteVersion(version.id);
                        }}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmAction} onOpenChange={(isOpen) => { if (!isOpen) handleCancelConfirm(); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {confirmAction === "restore" ? "确认恢复版本" : "确认删除版本"}
            </DialogTitle>
            <DialogDescription>
              {confirmAction === "restore"
                ? "恢复版本将覆盖当前所有修改，此操作无法撤销。确定要继续吗？"
                : "删除版本后无法恢复，确定要继续吗？"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={handleCancelConfirm}>
              取消
            </Button>
            <Button
              variant={confirmAction === "delete" ? "destructive" : "default"}
              onClick={handleConfirmAction}
            >
              确认
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
