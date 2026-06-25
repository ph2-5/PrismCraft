import { Search, Loader2 } from "lucide-react";
import { t } from "@/shared/constants";

interface RecoverySectionProps {
  recoveryTaskId: string;
  onRecoveryTaskIdChange: (value: string) => void;
  onRecover: () => void;
  isRecovering: boolean;
}

export function RecoverySection({
  recoveryTaskId,
  onRecoveryTaskIdChange,
  onRecover,
  isRecovering,
}: RecoverySectionProps) {
  return (
    <div className="space-y-3 border-t pt-4" style={{ borderColor: "var(--border)" }}>
      <label className="text-sm font-medium">{t("task.recoverFailedVideo")}</label>
      <div className="flex gap-2">
        <input
          className="input flex-1"
          placeholder={t("task.enterTaskId")}
          value={recoveryTaskId}
          onChange={(e) => onRecoveryTaskIdChange(e.target.value)}
        />
        <button
          type="button"
          className="btn btn-primary gap-2"
          onClick={onRecover}
          disabled={isRecovering}
        >
          {isRecovering ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Search className="w-4 h-4" />
          )}
          {t("task.recoverButton")}
        </button>
      </div>
      <p className="text-xs" style={{ color: "var(--muted-fg)" }}>
        {t("task.recoverHint")}
      </p>
    </div>
  );
}
