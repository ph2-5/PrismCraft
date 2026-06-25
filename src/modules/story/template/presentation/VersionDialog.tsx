import { useState, useCallback, useEffect } from "react";
import { Save, RefreshCw, Trash2 } from "lucide-react";
import { errorLogger } from "@/shared/error-logger";
import { emitToast } from "@/shared/utils/toast-bridge";
import { t } from "@/shared/constants";
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
      const saveResult = await saveVersion(storyToSave, beats, versionName ? t("version.customPrefix", { name: versionName }) : "");
      if (!saveResult.ok) {
        errorLogger.warn("[VersionDialog] 保存版本失败", saveResult.error);
        emitToast("error", t("error.versionSaveFailed"));
      } else {
        emitToast("success", t("success.versionSaved"));
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
        emitToast("error", t("error.versionDeleteFailed"));
      } else {
        emitToast("success", t("success.versionDeleted"));
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
      {open && !confirmAction && (
        <div className="modal-overlay" onClick={() => onOpenChange(false)}>
          <div
            className="modal"
            style={{ maxWidth: "32rem" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{t("version.controlTitle")}</div>
              <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>{t("version.controlDesc")}</div>
            </div>
            <div className="mt-4 space-y-3">
              <div className="flex gap-2">
                <div className="flex-1">
                  <label htmlFor="version-name" className="sr-only">{t("version.nameLabel")}</label>
                  <input
                    className="input"
                    id="version-name"
                    placeholder={t("version.namePlaceholder")}
                    value={versionName}
                    onChange={(e) => setVersionName(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleSaveVersion}
                  disabled={beats.length === 0 || isSaving}
                >
                  <Save className="w-4 h-4 mr-2" />
                  {t("common.save")}
                </button>
              </div>
            </div>
            <div className="mt-4 max-h-[400px] py-4 overflow-y-auto">
              {versions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {t("version.noSavedVersions")}
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
                          {version.changeSummary || version.title || t("template.versionTime", { time: formatVersionTime(version.timestamp) })}
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          {t("version.savedAt", { time: formatVersionTime(version.timestamp) })}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRestoreVersion(version);
                          }}
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteVersion(version.id);
                          }}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {confirmAction && (
        <div className="modal-overlay" onClick={handleCancelConfirm}>
          <div
            className="modal"
            style={{ maxWidth: "24rem" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>
                {confirmAction === "restore" ? t("version.confirmRestore") : t("version.confirmDelete")}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>
                {confirmAction === "restore"
                  ? t("version.restoreWarning")
                  : t("version.deleteWarning")}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={handleCancelConfirm}>
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className={confirmAction === "delete" ? "btn btn-danger btn-sm" : "btn btn-primary btn-sm"}
                onClick={handleConfirmAction}
              >
                {t("common.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
