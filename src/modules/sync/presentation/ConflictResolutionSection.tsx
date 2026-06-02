import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
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
      <Label>{t("sync.conflictStrategy")}</Label>
      <Select
        value={conflictStrategy}
        onValueChange={(value) => onConflictStrategyChange(value as ConflictStrategy)}
        disabled={!enabled}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="last-write-wins">{t("sync.lastWriteWins")}</SelectItem>
          <SelectItem value="local-wins">{t("sync.localPriority")}</SelectItem>
          <SelectItem value="remote-wins">{t("sync.remotePriority")}</SelectItem>
          <SelectItem value="manual">{t("sync.manualResolve")}</SelectItem>
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        {conflictStrategy === "last-write-wins" && t("sync.lastWriteWinsDesc")}
        {conflictStrategy === "local-wins" && t("sync.localPriorityDesc")}
        {conflictStrategy === "remote-wins" && t("sync.remotePriorityDesc")}
        {conflictStrategy === "manual" && t("sync.manualResolveDesc")}
      </p>
    </div>
  );
}
