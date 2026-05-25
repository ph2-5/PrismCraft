"use client";

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
  character: "角色",
  scene: "场景",
  story: "故事",
  media_asset: "媒体资源",
  storyboard_asset: "分镜资源",
  video_task: "视频任务",
  story_version: "故事版本",
  collection: "收藏集",
  element: "元素",
  video_template: "视频模板",
  ast_template: "AST模板",
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
                <span>本地版本</span>
              </div>
              <pre className="bg-muted p-2 rounded text-xs overflow-auto max-h-40">
                {JSON.stringify(conflict.localData, null, 2)}
              </pre>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1 text-muted-foreground">
                <Cloud className="h-3 w-3" />
                <span>远程版本</span>
              </div>
              <pre className="bg-muted p-2 rounded text-xs overflow-auto max-h-40">
                {JSON.stringify(conflict.remoteData, null, 2)}
              </pre>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-1 text-muted-foreground">
              <GitMerge className="h-3 w-3" />
              <span>合并预览（可编辑）</span>
            </div>
            <textarea
              className="w-full bg-muted p-2 rounded text-xs font-mono min-h-[100px]"
              value={JSON.stringify(mergeData, null, 2)}
              onChange={(e) => {
                try {
                  setMergeData(JSON.parse(e.target.value));
                } catch (_e) {
                  // ignore invalid JSON during typing - user is still editing
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
          保留本地
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onResolve("remote")}
          className="gap-1"
        >
          <Cloud className="h-3 w-3" />
          保留远程
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={() => onResolve("merge", mergeData)}
          className="gap-1"
        >
          <GitMerge className="h-3 w-3" />
          合并
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
            同步冲突解决
          </DialogTitle>
          <DialogDescription>
            检测到 {unresolvedConflicts.length}{" "}
            个数据冲突，请选择保留本地版本、远程版本或手动合并。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {unresolvedConflicts.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
              <Check className="h-8 w-8 text-green-500" />
              <p>所有冲突已解决</p>
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
                全部保留本地
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onResolveAll("remote")}
              >
                全部保留远程
              </Button>
            </>
          )}
          <Button variant="default" onClick={onClose}>
            {unresolvedConflicts.length === 0 ? "完成" : "稍后处理"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
