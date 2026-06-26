import { useState, useCallback } from "react";
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
import { Modal } from "@/shared/presentation/Modal";
import { IconButton } from "@/shared/presentation/IconButton";

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
          <span className="badge text-xs">
            {conflict.entityId.slice(0, 8)}...
          </span>
        </div>
        <IconButton
          variant="ghost"
          className="btn-sm"
          onClick={() => setExpanded(!expanded)}
          aria-label={t("aria.toggleExpand")}
        >
          {expanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </IconButton>
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
        <button
          type="button"
          className="btn btn-outline btn-sm gap-1"
          onClick={() => onResolve("local")}
        >
          <Monitor className="h-3 w-3" />
          {t("sync.keepLocal")}
        </button>
        <button
          type="button"
          className="btn btn-outline btn-sm gap-1"
          onClick={() => onResolve("remote")}
        >
          <Cloud className="h-3 w-3" />
          {t("sync.keepRemote")}
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm gap-1"
          onClick={() => onResolve("merge", mergeData)}
        >
          <GitMerge className="h-3 w-3" />
          {t("sync.merge")}
        </button>
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
    <Modal
      open={isOpen}
      onClose={onClose}
      ariaLabel={t("sync.conflictTitle")}
      style={{ maxWidth: "42rem", maxHeight: "80vh", overflowY: "auto" }}
    >
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 600 }} className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-yellow-500" />
          {t("sync.conflictTitle")}
        </div>
        <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>
          {t("sync.conflictDesc", { count: unresolvedConflicts.length })}
        </div>
      </div>

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

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
        {unresolvedConflicts.length > 0 && (
          <>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => onResolveAll("local")}
            >
              {t("sync.keepAllLocal")}
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => onResolveAll("remote")}
            >
              {t("sync.keepAllRemote")}
            </button>
          </>
        )}
        <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>
          {unresolvedConflicts.length === 0 ? t("sync.done") : t("sync.later")}
        </button>
      </div>
    </Modal>
  );
}
