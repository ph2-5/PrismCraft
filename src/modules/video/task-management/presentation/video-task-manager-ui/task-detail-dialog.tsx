import { useState, useCallback, useRef, useEffect } from "react";
import { Info, Trash2, RefreshCw, Loader2, Copy, Check } from "lucide-react";
import type { VideoTask } from "@/domain/schemas";
import { resolveImageUrl } from "@/shared/utils/image-url";
import { createVideoErrorHandler } from "@/shared/utils/media-error-handler";
import { emitToast } from "@/shared/utils/toast-bridge";
import { t } from "@/shared/constants/messages";
import { formatTimestamp } from "@/shared/utils/format";
import { Modal } from "@/shared/presentation/Modal";
import { StatusBadge, getTaskDisplayStatus } from "./status-badge";

interface TaskDetailDialogProps {
  task: VideoTask;
  isOpen: boolean;
  onClose: () => void;
  onRecover: () => void;
  onRemove: () => void;
}

export function TaskDetailDialog({ task, isOpen, onClose, onRecover, onRemove }: TaskDetailDialogProps) {
  const [isRecovering, setIsRecovering] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  const copyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current) {
        clearTimeout(copyResetTimerRef.current);
      }
    };
  }, []);

  const handleCopyUrl = useCallback(async () => {
    if (!task.videoUrl) return;
    const resetCopied = () => {
      copyResetTimerRef.current = setTimeout(() => setUrlCopied(false), 2000);
    };
    try {
      await navigator.clipboard.writeText(task.videoUrl);
      setUrlCopied(true);
      emitToast("success", t("video.copySuccess"));
      resetCopied();
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = task.videoUrl;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setUrlCopied(true);
      emitToast("success", t("video.copySuccess"));
      resetCopied();
    }
  }, [task.videoUrl]);

  const handleRecover = async () => {
    setIsRecovering(true);
    try {
      await onRecover();
    } finally {
      setIsRecovering(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      ariaLabel={t("task.detailTitle")}
      style={{ maxWidth: "42rem", maxHeight: "80vh", overflowY: "auto" }}
    >
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
          <Info className="w-5 h-5" />
          {t("task.detailTitle")}
        </div>
        <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>
          {t("task.taskIdLabel", { id: task.taskId })}
        </div>
      </div>

            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">{t("task.currentStatus")}</p>
                  <StatusBadge status={getTaskDisplayStatus(task.status)} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t("beat.createdAt")}</p>
                  <p className="text-sm font-medium">{formatTimestamp(task.createdAt)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t("task.retryCount")}</p>
                  <p className="text-sm font-medium">{task.recoveryAttempts || 0} / 60</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t("task.provider")}</p>
                  <p className="text-sm font-medium">{task.providerId || t("common.unknown")}</p>
                </div>
              </div>

              {task.message && (
                <div>
                  <p className="text-sm text-muted-foreground">{t("task.statusMessage")}</p>
                  <p className="text-sm font-medium" style={{ color: "var(--warning)" }}>{task.message}</p>
                </div>
              )}

              {task.videoUrl && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">{t("task.videoPreview")}</p>
                  <video
                    src={resolveImageUrl(task.videoUrl)}
                    controls
                    className="w-full max-h-48 rounded-lg border border-border"
                    onError={createVideoErrorHandler()}
                  />
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      type="text"
                      readOnly
                      value={task.videoUrl}
                      className="flex-1 text-xs bg-muted/50 border border-border rounded px-2 py-1.5 text-muted-foreground truncate cursor-text select-all"
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                    <button
                      type="button"
                      className="btn btn-outline btn-sm shrink-0"
                      onClick={handleCopyUrl}
                    >
                      {urlCopied ? (
                        <Check className="w-3.5 h-3.5 mr-1" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 mr-1" />
                      )}
                      {urlCopied ? t("common.copied") : t("common.copy")}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button type="button" className="btn btn-danger" onClick={onRemove} disabled={isRecovering}>
                <Trash2 className="w-4 h-4 mr-2" />
                {t("common.delete")}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleRecover}
                disabled={isRecovering || task.status === "completed"}
              >
                {isRecovering ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                {t("common.retry")}
              </button>
            </div>
    </Modal>
  );
}
