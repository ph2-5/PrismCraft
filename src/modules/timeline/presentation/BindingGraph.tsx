/**
 * Q3-7 / Task 4.6.5 — 绑定关系图
 *
 * 在时间线主视图中显示节点间的绑定关系。
 * 以可视化方式展示 source → target 的绑定连线。
 */

import { t } from "@/shared/constants";
import { cn } from "@/shared/utils/utils";
import type { PlotNodeLike, TimelineBindingLike } from "@/shared-logic/timeline";

interface BindingGraphProps {
  nodes: PlotNodeLike[];
  bindings: TimelineBindingLike[];
  selectedNodeId?: string;
  onSelectNode?: (nodeId: string) => void;
  className?: string;
}

const BINDING_TYPE_COLOR: Record<string, string> = {
  foreshadow: "var(--primary)",
  cause_effect: "var(--success)",
  character_arc: "#a5b4fc",
  scene_continuity: "#34d399",
  emotional_buildup: "#f59e0b",
  mystery_reveal: "#ef4444",
  parallel: "#8b5cf6",
  callback: "#06b6d4",
  irony: "#ec4899",
  user_manual: "var(--muted-fg)",
};

export function BindingGraph({
  nodes,
  bindings,
  selectedNodeId,
  onSelectNode,
  className,
}: BindingGraphProps) {
  if (bindings.length === 0) {
    return (
      <div className={cn("text-[11px] text-[var(--muted-fg)] py-2 px-3", className)}>
        {t("timeline.binding.title")}（0）
      </div>
    );
  }

  // 为每个节点计算水平位置（按 order 等分）
  const sortedNodes = [...nodes].sort((a, b) => a.order - b.order);
  const nodeIndexMap = new Map<string, number>();
  sortedNodes.forEach((n, i) => nodeIndexMap.set(n.id, i));
  const nodeCount = sortedNodes.length;
  const getPosition = (nodeId: string): number => {
    const idx = nodeIndexMap.get(nodeId);
    if (idx === undefined || nodeCount <= 1) return 0;
    return (idx / (nodeCount - 1)) * 100;
  };

  return (
    <div className={cn("flex flex-col", className)}>
      <div className="section-label px-3 py-1">{t("timeline.editor.trackBinding")}</div>
      <div className="relative h-auto min-h-[40px] px-3 py-1">
        {bindings.map((binding) => {
          const sourcePos = getPosition(binding.sourceNodeId);
          const targetPos = getPosition(binding.targetNodeId);
          const color = BINDING_TYPE_COLOR[binding.type] ?? "var(--muted-fg)";
          const isRelevant =
            selectedNodeId === binding.sourceNodeId ||
            selectedNodeId === binding.targetNodeId;

          return (
            <div
              key={binding.id}
              className="flex items-center gap-2 py-0.5"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectNode?.(binding.targetNodeId);
                }
              }}
              onClick={() => onSelectNode?.(binding.targetNodeId)}
              title={binding.injectionText ?? binding.type}
            >
              <div className="w-20 text-[10px] text-[var(--muted-fg)] truncate flex-shrink-0">
                {binding.type}
              </div>
              <div className="flex-1 relative h-4">
                <div
                  className="absolute top-1/2 h-[2px] rounded-full transition-opacity"
                  style={{
                    left: `${Math.min(sourcePos, targetPos)}%`,
                    width: `${Math.abs(targetPos - sourcePos)}%`,
                    backgroundColor: color,
                    opacity: isRelevant ? 1 : 0.5,
                  }}
                />
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full transition-opacity"
                  style={{
                    left: `${sourcePos}%`,
                    backgroundColor: color,
                    opacity: isRelevant ? 1 : 0.5,
                  }}
                />
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full transition-opacity"
                  style={{
                    left: `${targetPos}%`,
                    backgroundColor: color,
                    opacity: isRelevant ? 1 : 0.5,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
