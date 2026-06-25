import { Loader2 } from "lucide-react";
import type { VideoTask } from "@/modules/video/task-management";
import { t } from "@/shared/constants";

interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: VideoTask | null;
  isDeleting: boolean;
  onConfirm: () => void;
  cacheFileSizeMB?: number;
}

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  task,
  isDeleting,
  onConfirm,
  cacheFileSizeMB,
}: DeleteConfirmDialogProps) {
  return (
    <>
      {open && (
        <div className="modal-overlay" onClick={() => onOpenChange(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{t("task.confirmDeleteCache")}</div>
              <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>
                {t("task.confirmDeleteCacheDesc")}
              </div>
            </div>

            {task && (
              <div className="space-y-2 py-4">
                <div className="text-sm">
                  <span style={{ color: "var(--muted-fg)" }}>{t("task.taskLabel")}:</span>{" "}
                  <span className="font-medium">
                    {task.beatTitle || `${t("task.taskLabel")} ${(task.taskId || "unknown").substring(0, 8)}...`}
                  </span>
                </div>
                {cacheFileSizeMB !== undefined && (
                  <div className="text-sm">
                    <span style={{ color: "var(--muted-fg)" }}>{t("task.sizeLabel")}:</span>{" "}
                    <span className="font-medium">{cacheFileSizeMB.toFixed(2)} MB</span>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => onOpenChange(false)}
                disabled={isDeleting}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="btn btn-danger gap-2"
                onClick={onConfirm}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                )}
                {isDeleting ? t("common.deleting") : t("common.confirmDelete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
