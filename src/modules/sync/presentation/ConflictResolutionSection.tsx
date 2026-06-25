import { t } from "@/shared/constants";
import type { ConflictStrategy } from "@/modules/sync";

interface ConflictResolutionSectionProps {
  conflictStrategy: ConflictStrategy;
  onConflictStrategyChange: (strategy: ConflictStrategy) => void;
  enabled: boolean;
}

export function ConflictResolutionSection({
  conflictStrategy,
  onConflictStrategyChange,
  enabled,
}: ConflictResolutionSectionProps) {
  return (
    <div className="space-y-2">
      <label>{t("sync.conflictStrategy")}</label>
      <select
        className="select"
        value={conflictStrategy}
        onChange={(e) => onConflictStrategyChange(e.target.value as ConflictStrategy)}
        disabled={!enabled}
      >
        <option value="last-write-wins">{t("sync.lastWriteWins")}</option>
        <option value="local-wins">{t("sync.localPriority")}</option>
        <option value="remote-wins">{t("sync.remotePriority")}</option>
        <option value="manual">{t("sync.manualResolve")}</option>
      </select>
      <p className="text-xs text-muted-foreground">
        {conflictStrategy === "last-write-wins" && t("sync.lastWriteWinsDesc")}
        {conflictStrategy === "local-wins" && t("sync.localPriorityDesc")}
        {conflictStrategy === "remote-wins" && t("sync.remotePriorityDesc")}
        {conflictStrategy === "manual" && t("sync.manualResolveDesc")}
      </p>
    </div>
  );
}
