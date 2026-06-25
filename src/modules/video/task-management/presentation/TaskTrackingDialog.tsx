import { Search, Copy, ExternalLink, BookOpen } from "lucide-react";
import type { VideoTask } from "@/modules/video/task-management";
import { buildTrackingInfoByProviderId, copyTrackingInfoToClipboard, openTaskQueryLink } from "../services/video-tracker";
import { t } from "@/shared/constants";
import { Modal } from "@/shared/presentation/Modal";

interface TaskTrackingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: VideoTask | null;
  onToastSuccess: (title: string, message: string) => void;
  onToastError: (title: string, message: string) => void;
}

export function TaskTrackingDialog({
  open,
  onOpenChange,
  task,
  onToastSuccess,
  onToastError,
}: TaskTrackingDialogProps) {
  if (!task) return null;

  const handleCopyTracking = async () => {
    const trackingInfo = buildTrackingInfoByProviderId(task.taskId, task.apiUrl, undefined, task.model);
    const result = await copyTrackingInfoToClipboard(trackingInfo);
    if (result.ok) {
      onToastSuccess(t("success.copied"), t("task.copyAllInfo"));
    } else {
      onToastError(t("error.copyFailed"), t("task.copyAllInfo"));
    }
  };

  const handleOpenCloudLink = () => {
    const trackingInfo = buildTrackingInfoByProviderId(task.taskId, task.apiUrl, undefined, task.model);
    const opened = openTaskQueryLink(trackingInfo);
    if (!opened) {
      onToastError(t("error.openLinkFailed"), t("task.manualQuery"));
    }
  };

  const trackingInfo = buildTrackingInfoByProviderId(task.taskId, task.apiUrl, undefined, task.model);

  return (
    <Modal
      open={open}
      onClose={() => onOpenChange(false)}
      ariaLabel={t("task.trackingTitle")}
      style={{ maxWidth: "42rem" }}
    >
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
          <Search className="w-5 h-5" />
          {t("task.trackingTitle")}
        </div>
        <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>
          {t("task.trackingDesc")}
        </div>
      </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs" style={{ color: "var(--muted-fg)" }}>{t("task.cloudProvider")}</label>
                  <div className="text-sm font-medium">{trackingInfo.providerName}</div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs" style={{ color: "var(--muted-fg)" }}>{t("task.taskIdLabel")}</label>
                  <div className="text-sm font-mono px-2 py-1 rounded" style={{ background: "var(--muted)" }}>
                    {task.taskId}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs" style={{ color: "var(--muted-fg)" }}>{t("task.modelLabel", { model: "" }).replace(": ", "")}</label>
                  <div className="text-sm">{trackingInfo.model || t("task.modelNotRecorded")}</div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs" style={{ color: "var(--muted-fg)" }}>{t("task.createdAtLabel")}</label>
                  <div className="text-sm">{new Date(task.createdAt).toLocaleString()}</div>
                </div>
              </div>

              {trackingInfo.apiUrl && (
                <div className="space-y-1">
                  <label className="text-xs" style={{ color: "var(--muted-fg)" }}>{t("task.apiUrlLabel")}</label>
                  <div className="text-sm font-mono px-2 py-1 rounded break-all" style={{ background: "var(--muted)" }}>
                    {trackingInfo.apiUrl}
                  </div>
                </div>
              )}

              {trackingInfo.queryEndpoint && (
                <div className="space-y-1">
                  <label className="text-xs" style={{ color: "var(--muted-fg)" }}>{t("task.queryEndpoint")}</label>
                  <div className="text-sm font-mono px-2 py-1 rounded break-all" style={{ background: "var(--muted)" }}>
                    {trackingInfo.queryEndpoint}
                  </div>
                </div>
              )}

              <div className="border-t pt-4 space-y-3" style={{ borderColor: "var(--border)" }}>
                <label className="text-sm font-medium">{t("task.queryInstructions")}</label>
                <div className="text-sm p-3 rounded-lg whitespace-pre-line" style={{ color: "var(--muted-fg)", background: "var(--muted)" }}>
                  {trackingInfo.howToCheck}
                </div>
              </div>

              {trackingInfo.apiDocUrl && (
                <div className="flex items-center gap-2 text-sm" style={{ color: "var(--primary)" }}>
                  <BookOpen className="w-4 h-4" />
                  <a
                    href={trackingInfo.apiDocUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                  >
                    {t("task.viewApiDoc")}
                  </a>
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button type="button" className="btn btn-ghost" onClick={handleCopyTracking}>
                <Copy className="w-4 h-4 mr-2" />
                {t("task.copyAllInfo")}
              </button>
              <button type="button" className="btn btn-primary" onClick={handleOpenCloudLink}>
                <ExternalLink className="w-4 h-4 mr-2" />
                {t("task.openCloudConsole")}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => onOpenChange(false)}>
                {t("common.close")}
              </button>
            </div>
    </Modal>
  );
}
