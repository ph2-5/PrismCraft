import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Monitor,
  Cloud,
  GitMerge,
} from "lucide-react";
import type { SyncConflict, SyncEntityType } from "@/modules/sync";
import { t } from "@/shared/constants";
import { errorLogger } from "@/shared/error-logger";

interface SyncConflictPanelProps {
  conflicts: SyncConflict[];
  isOpen: boolean;
  onClose: () => void;
  onResolve: (
    conflictId: string,
    resolution: "local" | "remote" | "merge",
    mergedData?: Record<string, unknown>,
  ) => void;
  onResolveAll: (resolution: "local" | "remote") => void;
}

const ENTITY_LABELS: Record<SyncEntityType, string> = {
  character: t("sync.entityCharacter"),
  scene: t("sync.entityScene"),
  story: t("sync.entityStory"),
  media_asset: t("sync.entityMediaAsset"),
  storyboard_asset: t("sync.entityStoryboardAsset"),
  video_task: t("sync.entityVideoTask"),
  story_version: t("sync.entityStoryVersion"),
  collection: t("sync.entityCollection"),
  element: t("sync.entityElement"),
  video_template: t("sync.entityVideoTemplate"),
  ast_template: t("sync.entityAstTemplate"),
};

function ConflictCard({
  conflict,
  onResolve,
}: {
  conflict: SyncConflict;
  onResolve: (
    resolution: "local" | "remote" | "merge",
    mergedData?: Record<string, unknown>,
  ) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [mergeData, setMergeData] = useState<Record<string, unknown>>(
    () =>
      ({
        ...conflict.localData,
        ...conflict.remoteData,
      }) as Record<string, unknown>,
  );

  const entityLabel = ENTITY_LABELS[conflict.entityType] || conflict.entityType;

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-yellow-500" />
          <span className="font-medium">{entityLabel}</span>
          <Badge variant="outline" className="text-xs">
            {conflict.entityId.slice(0, 8)}...
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </Button>
      </div>

      {expanded && (
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-1 text-muted-foreground">
                <Monitor className="h-3 w-3" />
                <span>{t("sync.localVersion")}</span>
              </div>
              <pre className="bg-muted p-2 rounded text-xs overflow-auto max-h-40">
                {JSON.stringify(conflict.localData, null, 2)}
              </pre>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1 text-muted-foreground">
                <Cloud className="h-3 w-3" />
                <span>{t("sync.remoteVersion")}</span>
              </div>
              <pre className="bg-muted p-2 rounded text-xs overflow-auto max-h-40">
                {JSON.stringify(conflict.remoteData, null, 2)}
              </pre>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-1 text-muted-foreground">
              <GitMerge className="h-3 w-3" />
              <span>{t("sync.mergePreview")}</span>
            </div>
            <textarea
              className="w-full bg-muted p-2 rounded text-xs font-mono min-h-[100px]"
              value={JSON.stringify(mergeData, null, 2)}
              onChange={(e) => {
                try {
                  setMergeData(JSON.parse(e.target.value));
                } catch (e) {
                  errorLogger.warn("[SyncConflict] Failed to parse merge JSON during typing", e as Error);
                }
              }}
            />
          </div>
        </div>
      )}

      <div className="flex gap-2 justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onResolve("local")}
          className="gap-1"
        >
          <Monitor className="h-3 w-3" />
          {t("sync.keepLocal")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onResolve("remote")}
          className="gap-1"
        >
          <Cloud className="h-3 w-3" />
          {t("sync.keepRemote")}
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={() => onResolve("merge", mergeData)}
          className="gap-1"
        >
          <GitMerge className="h-3 w-3" />
          {t("sync.merge")}
        </Button>
      </div>
    </div>
  );
}

export function SyncConflictPanel({
  conflicts,
  isOpen,
  onClose,
  onResolve,
  onResolveAll,
}: SyncConflictPanelProps) {
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());

  const handleResolve = useCallback(
    (
      conflict: SyncConflict,
      resolution: "local" | "remote" | "merge",
      mergedData?: Record<string, unknown>,
    ) => {
      const id = `${conflict.entityType}:${conflict.entityId}`;
      onResolve(id, resolution, mergedData);
      setResolvedIds((prev) => new Set(prev).add(id));
    },
    [onResolve],
  );

  const unresolvedConflicts = conflicts.filter(
    (c) => !resolvedIds.has(`${c.entityType}:${c.entityId}`),
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            {t("sync.conflictTitle")}
          </DialogTitle>
          <DialogDescription>
            {t("sync.conflictDesc", { count: unresolvedConflicts.length })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {unresolvedConflicts.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
              <Check className="h-8 w-8 text-green-500" />
              <p>{t("sync.allResolved")}</p>
            </div>
          ) : (
            unresolvedConflicts.map((conflict) => (
              <ConflictCard
                key={`${conflict.entityType}:${conflict.entityId}`}
                conflict={conflict}
                onResolve={(resolution, mergedData) =>
                  handleResolve(conflict, resolution, mergedData)
                }
              />
            ))
          )}
        </div>

        <DialogFooter className="gap-2">
          {unresolvedConflicts.length > 0 && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onResolveAll("local")}
              >
                {t("sync.keepAllLocal")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onResolveAll("remote")}
              >
                {t("sync.keepAllRemote")}
              </Button>
            </>
          )}
          <Button variant="default" onClick={onClose}>
            {unresolvedConflicts.length === 0 ? t("sync.done") : t("sync.later")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
