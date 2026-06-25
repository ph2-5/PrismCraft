import { Input } from "@/shared/ui/input";
import { Button } from "@/shared/ui/button";
import { Label } from "@/shared/ui/label";
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
      <Label className="text-sm font-medium">{t("task.recoverFailedVideo")}</Label>
      <div className="flex gap-2">
        <Input
          placeholder={t("task.enterTaskId")}
          value={recoveryTaskId}
          onChange={(e) => onRecoveryTaskIdChange(e.target.value)}
          className="flex-1"
        />
        <Button
          onClick={onRecover}
          disabled={isRecovering}
          className="gap-2"
        >
          {isRecovering ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Search className="w-4 h-4" />
          )}
          {t("task.recoverButton")}
        </Button>
      </div>
      <p className="text-xs" style={{ color: "var(--muted-fg)" }}>
        {t("task.recoverHint")}
      </p>
    </div>
  );
}
