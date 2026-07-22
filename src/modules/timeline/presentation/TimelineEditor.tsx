/**
 * Q3-7 / Task 4.6.5 — 时间线编辑器主界面
 *
 * 三栏布局：左侧章节列表 + 中间时间线主视图 + 右侧节点详情面板。
 * 底部工具栏：上一节点/下一节点/添加事件/添加绑定/重新推演/生成 Prompt。
 *
 * 支持加载 100+ 节点（时间线主视图水平滚动）。
 * 节点详情面板实时显示状态快照（通过 propagateStates 计算）。
 * 绑定创建对话框支持 10 种类型。
 */

import { useState, useMemo, useCallback } from "react";
import { t } from "@/shared/constants";
import { cn } from "@/shared/utils/utils";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Link2,
  RefreshCw,
  FileText,
} from "lucide-react";
import { TimelineTrack } from "./TimelineTrack";
import { NodeDetailPanel } from "./NodeDetailPanel";
import { BindingCreatorDialog, type BindingCreatorResult } from "./BindingCreatorDialog";
import { propagateStates } from "@/shared-logic/timeline";
import type {
  PlotNodeLike,
  StoryTimelineLike,
  PropagationResult,
} from "@/shared-logic/timeline";

interface TimelineEditorProps {
  /** 时间线数据（nodes + bindings） */
  timeline: StoryTimelineLike;
  /** 选中节点变更回调 */
  onSelectNode?: (nodeId: string | null) => void;
  /** 添加事件回调 */
  onAddEvent?: () => void;
  /** 重新推演回调 */
  onRepropagate?: () => void;
  /** 生成 Prompt 回调 */
  onGeneratePrompt?: (nodeId: string) => void;
  /** 创建绑定回调 */
  onCreateBinding?: (result: BindingCreatorResult) => void;
  /** 编辑事件回调 */
  onEditEvent?: (nodeId: string) => void;
  /** 删除事件回调 */
  onDeleteEvent?: (nodeId: string) => void;
  className?: string;
}

export function TimelineEditor({
  timeline,
  onSelectNode,
  onAddEvent,
  onRepropagate,
  onGeneratePrompt,
  onCreateBinding,
  onEditEvent,
  onDeleteEvent,
  className,
}: TimelineEditorProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [bindingDialogOpen, setBindingDialogOpen] = useState(false);

  const sortedNodes = useMemo(
    () => [...timeline.nodes].sort((a, b) => a.order - b.order),
    [timeline.nodes],
  );

  // 状态推演（实时计算快照）
  const propagationResult: PropagationResult = useMemo(
    () => propagateStates(timeline),
    [timeline],
  );

  // 章节列表（按 chapterIndex 分组）
  const chapters = useMemo(() => {
    const map = new Map<number, PlotNodeLike[]>();
    for (const node of sortedNodes) {
      const ch = node.chapterIndex ?? 0;
      if (!map.has(ch)) map.set(ch, []);
      map.get(ch)!.push(node);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [sortedNodes]);

  const selectedNode = useMemo(
    () => sortedNodes.find((n) => n.id === selectedNodeId) ?? null,
    [sortedNodes, selectedNodeId],
  );

  const selectedSnapshots = useMemo(() => {
    if (!selectedNodeId) return null;
    return propagationResult.get(selectedNodeId) ?? null;
  }, [propagationResult, selectedNodeId]);

  const handleSelectNode = useCallback(
    (nodeId: string) => {
      setSelectedNodeId(nodeId);
      onSelectNode?.(nodeId);
    },
    [onSelectNode],
  );

  const handlePrevNext = useCallback(
    (direction: "prev" | "next") => {
      if (sortedNodes.length === 0) return;
      const currentIdx = selectedNodeId
        ? sortedNodes.findIndex((n) => n.id === selectedNodeId)
        : -1;
      let nextIdx: number;
      if (direction === "prev") {
        nextIdx = currentIdx > 0 ? currentIdx - 1 : 0;
      } else {
        nextIdx = currentIdx < sortedNodes.length - 1 ? currentIdx + 1 : sortedNodes.length - 1;
      }
      const nextNode = sortedNodes[nextIdx];
      if (nextNode) handleSelectNode(nextNode.id);
    },
    [sortedNodes, selectedNodeId, handleSelectNode],
  );

  const handleCreateBinding = useCallback(
    (result: BindingCreatorResult) => {
      onCreateBinding?.(result);
    },
    [onCreateBinding],
  );

  return (
    <div className={cn("flex flex-col h-full bg-[var(--bg)]", className)}>
      {/* 顶部标题栏 */}
      <div className="timeline-header">
        <div className="flex flex-col">
          <div className="text-[13px] font-semibold">{t("timeline.editor.title")}</div>
          <div className="text-[10px] text-[var(--muted-fg)]">
            {t("timeline.editor.subtitle")}
          </div>
        </div>
        <div className="text-[11px] text-[var(--muted-fg)]">
          {sortedNodes.length} {t("timeline.node.title")}
        </div>
      </div>

      {/* 三栏布局 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左侧：章节列表 */}
        <aside className="w-44 flex-shrink-0 border-r border-[var(--border)] overflow-y-auto p-2">
          <div className="section-label mb-1">{t("timeline.editor.chapterList")}</div>
          {chapters.length === 0 ? (
            <div className="text-[11px] text-[var(--muted-fg)] py-2">
              {t("timeline.editor.empty")}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {chapters.map(([chIdx, chNodes]) => (
                <div key={chIdx}>
                  <div className="text-[11px] font-medium px-2 py-1 text-[var(--fg)]">
                    {t("timeline.node.chapter", { index: chIdx })}
                    {chNodes[0]?.chapterTitle && ` · ${chNodes[0].chapterTitle}`}
                  </div>
                  <div className="flex flex-col">
                    {chNodes.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => handleSelectNode(n.id)}
                        className={cn(
                          "text-[11px] text-left px-2 py-1 rounded-[4px] transition-colors truncate",
                          n.id === selectedNodeId
                            ? "bg-[rgba(var(--primary-rgb),0.1)] text-[var(--primary)]"
                            : "text-[var(--muted-fg)] hover:bg-[var(--muted)]",
                        )}
                        title={n.plotEventDescription}
                      >
                        {t("timeline.editor.nodeN", { n: n.order + 1 })} · {n.plotEventDescription}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </aside>

        {/* 中间：时间线主视图 */}
        <main className="flex-1 overflow-auto">
          <TimelineTrack
            nodes={sortedNodes}
            bindings={timeline.bindings}
            snapshotsMap={propagationResult}
            selectedNodeId={selectedNodeId ?? undefined}
            onSelectNode={handleSelectNode}
          />
        </main>

        {/* 右侧：节点详情面板 */}
        <aside className="w-72 flex-shrink-0 border-l border-[var(--border)] overflow-y-auto">
          <NodeDetailPanel
            node={selectedNode}
            bindings={timeline.bindings}
            characterSnapshots={selectedSnapshots?.characterSnapshots}
            sceneSnapshots={selectedSnapshots?.sceneSnapshots}
            onSelectNode={handleSelectNode}
            onAddBinding={() => setBindingDialogOpen(true)}
            onEditEvent={() => selectedNode && onEditEvent?.(selectedNode.id)}
            onDeleteEvent={() => selectedNode && onDeleteEvent?.(selectedNode.id)}
          />
        </aside>
      </div>

      {/* 底部工具栏 */}
      <div className="timeline-header">
        <div className="flex gap-1">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => handlePrevNext("prev")}
            disabled={sortedNodes.length === 0}
          >
            <ChevronLeft size={12} />
            {t("timeline.editor.prevNode")}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => handlePrevNext("next")}
            disabled={sortedNodes.length === 0}
          >
            <ChevronRight size={12} />
            {t("timeline.editor.nextNode")}
          </button>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onAddEvent}
          >
            <Plus size={12} />
            {t("timeline.editor.addEvent")}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setBindingDialogOpen(true)}
            disabled={sortedNodes.length < 2}
          >
            <Link2 size={12} />
            {t("timeline.editor.addBinding")}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onRepropagate}
          >
            <RefreshCw size={12} />
            {t("timeline.editor.repropagate")}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => selectedNodeId && onGeneratePrompt?.(selectedNodeId)}
            disabled={!selectedNodeId}
          >
            <FileText size={12} />
            {t("timeline.editor.generatePrompt")}
          </button>
        </div>
      </div>

      {/* 绑定创建对话框 */}
      <BindingCreatorDialog
        open={bindingDialogOpen}
        onClose={() => setBindingDialogOpen(false)}
        nodes={sortedNodes}
        defaultSourceNodeId={selectedNodeId ?? undefined}
        defaultTargetNodeId={undefined}
        onCreate={handleCreateBinding}
      />
    </div>
  );
}
