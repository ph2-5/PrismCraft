/**
 * Q3-9 / Task 4.6.7 — 多时间线视图 UI 组件
 *
 * 可视化多个时间线及其关系，支持《盗梦空间》式多层嵌套结构。
 *
 * 三栏布局：
 *   - 左侧：时间线列表（按层级深度缩进）
 *   - 中间：关系图（时间线之间的连接）
 *   - 右侧：跨时间线绑定详情
 *
 * 功能：
 *   - 展示时间线层级（主线/支线/回忆线/并行线）
 *   - 展示时间线之间的关系（前传/后传/并行/回忆/闪前/替代）
 *   - 展示跨时间线绑定（源/目标/类型/重要程度）
 *   - 测试跨时间线注入
 */

import { useState, useMemo } from "react";
import { t } from "@/shared/constants";
import { cn } from "@/shared/utils/utils";
import {
  Layers,
  GitBranch,
  Plus,
  Link2,
  ChevronRight,
  ChevronDown,
  ArrowRight,
} from "lucide-react";
import { useMultiTimeline } from "../hooks/use-multi-timeline";
import type {
  CrossTimelineBindingLike,
  TimelineRelationshipLike,
  TimelineLayerInfoLike,
} from "@/shared-logic/timeline";
import type {
  MultiTimelineView as MultiTimelineViewData,
} from "../domain/multi-timeline-types";

interface MultiTimelineViewProps {
  /** 多时间线数据 */
  multiView: MultiTimelineViewData;
  /** 选择时间线回调 */
  onSelectTimeline?: (timelineId: string) => void;
  /** 选择节点回调 */
  onSelectNode?: (timelineId: string, nodeId: string) => void;
  /** 添加时间线回调 */
  onAddTimeline?: () => void;
  /** 添加关系回调 */
  onAddRelationship?: () => void;
  /** 添加跨时间线绑定回调 */
  onAddCrossBinding?: () => void;
  className?: string;
}

export function MultiTimelineView({
  multiView,
  onSelectTimeline,
  onSelectNode,
  onAddTimeline,
  onAddRelationship,
  onAddCrossBinding,
  className,
}: MultiTimelineViewProps) {
  const multi = useMultiTimeline();
  const [selectedTimelineId, setSelectedTimelineId] = useState<string | null>(
    multiView.timelines[0]?.id ?? null,
  );
  const [expandedTimelines, setExpandedTimelines] = useState<Set<string>>(
    new Set(multiView.timelines.map((tl) => tl.id)),
  );

  // 计算层级结构
  const layers = useMemo(
    () =>
      multi.computeTimelineLayers(
        multiView.timelines.map((tl) => ({
          id: tl.id,
          parentTimelineId: tl.parentTimelineId,
        })),
      ),
    [multiView.timelines, multi],
  );

  // 时间线名称映射
  const timelineNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const tl of multiView.timelines) {
      map.set(tl.id, tl.name);
    }
    return map;
  }, [multiView.timelines]);

  const handleToggleExpand = (timelineId: string) => {
    setExpandedTimelines((prev) => {
      const next = new Set(prev);
      if (next.has(timelineId)) {
        next.delete(timelineId);
      } else {
        next.add(timelineId);
      }
      return next;
    });
  };

  const handleSelectTimeline = (timelineId: string) => {
    setSelectedTimelineId(timelineId);
    onSelectTimeline?.(timelineId);
  };

  return (
    <div
      className={cn(
        "timeline-panel flex h-full flex-col gap-4 p-4",
        className,
      )}
    >
      {/* 标题栏 */}
      <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-3">
        <div>
          <h2 className="text-lg font-semibold">
            <Layers className="mr-2 inline h-5 w-5" />
            {t("timeline.multi.title")}
          </h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            {t("timeline.multi.subtitle")}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className="btn btn-sm btn-primary"
            onClick={onAddTimeline}
            title={t("timeline.multi.addTimeline")}
          >
            <Plus className="h-4 w-4" />
            {t("timeline.multi.addTimeline")}
          </button>
          <button
            className="btn btn-sm btn-secondary"
            onClick={onAddRelationship}
            title={t("timeline.multi.addRelationship")}
          >
            <GitBranch className="h-4 w-4" />
            {t("timeline.multi.addRelationship")}
          </button>
          <button
            className="btn btn-sm btn-secondary"
            onClick={onAddCrossBinding}
            title={t("timeline.multi.addCrossBinding")}
          >
            <Link2 className="h-4 w-4" />
            {t("timeline.multi.addCrossBinding")}
          </button>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="grid flex-1 grid-cols-[280px_1fr_320px] gap-4 overflow-hidden">
        {/* 左侧：时间线列表 */}
        <div className="timeline-panel flex flex-col overflow-hidden">
          <div className="border-b border-[var(--color-border)] px-3 py-2 text-sm font-medium">
            {t("timeline.multi.timelineList")}
          </div>
          <div className="flex-1 overflow-y-auto">
            {multiView.timelines.length === 0 ? (
              <div className="p-4 text-center text-sm text-[var(--color-text-secondary)]">
                {t("timeline.multi.empty")}
              </div>
            ) : (
              <TimelineTreeList
                timelines={multiView.timelines}
                layers={layers}
                selectedTimelineId={selectedTimelineId}
                expandedTimelines={expandedTimelines}
                onSelectTimeline={handleSelectTimeline}
                onToggleExpand={handleToggleExpand}
              />
            )}
          </div>
        </div>

        {/* 中间：关系图 */}
        <div className="timeline-panel flex flex-col overflow-hidden">
          <div className="border-b border-[var(--color-border)] px-3 py-2 text-sm font-medium">
            {t("timeline.multi.relationshipGraph")}
          </div>
          <div className="flex-1 overflow-auto p-3">
            <RelationshipGraph
              relationships={multiView.relationships}
              timelineNames={timelineNames}
              onSelectTimeline={handleSelectTimeline}
            />
          </div>
        </div>

        {/* 右侧：跨时间线绑定详情 */}
        <div className="timeline-panel flex flex-col overflow-hidden">
          <div className="border-b border-[var(--color-border)] px-3 py-2 text-sm font-medium">
            {t("timeline.multi.crossBindings")}
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {selectedTimelineId ? (
              <CrossBindingList
                bindings={multiView.crossTimelineBindings}
                selectedTimelineId={selectedTimelineId}
                timelineNames={timelineNames}
                onSelectNode={onSelectNode}
              />
            ) : (
              <div className="text-center text-sm text-[var(--color-text-secondary)]">
                {t("timeline.multi.selectTimeline")}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 时间线树形列表
// ─────────────────────────────────────────────────────────────

interface TimelineTreeListProps {
  timelines: MultiTimelineViewData["timelines"];
  layers: Map<string, TimelineLayerInfoLike>;
  selectedTimelineId: string | null;
  expandedTimelines: Set<string>;
  onSelectTimeline: (timelineId: string) => void;
  onToggleExpand: (timelineId: string) => void;
}

function TimelineTreeList({
  timelines,
  layers,
  selectedTimelineId,
  expandedTimelines,
  onSelectTimeline,
  onToggleExpand,
}: TimelineTreeListProps) {
  // 按层级深度排序
  const sortedTimelines = useMemo(() => {
    return [...timelines].sort((a, b) => {
      const layerA = layers.get(a.id);
      const layerB = layers.get(b.id);
      const depthA = layerA?.depth ?? 0;
      const depthB = layerB?.depth ?? 0;
      if (depthA !== depthB) return depthA - depthB;
      return a.name.localeCompare(b.name);
    });
  }, [timelines, layers]);

  return (
    <div className="py-1">
      {sortedTimelines.map((tl) => {
        const layer = layers.get(tl.id);
        const depth = layer?.depth ?? 0;
        const hasChildren = (layer?.childTimelineIds?.length ?? 0) > 0;
        const isExpanded = expandedTimelines.has(tl.id);
        const isSelected = selectedTimelineId === tl.id;
        return (
          <div
            key={tl.id}
            className={cn(
              "flex cursor-pointer items-center gap-1 py-1.5 pr-2 text-sm transition-colors",
              isSelected
                ? "bg-[var(--color-primary-bg)] text-[var(--color-primary)]"
                : "hover:bg-[var(--color-bg-hover)]",
            )}
            style={{ paddingLeft: `${depth * 16 + 8}px` }}
            onClick={() => onSelectTimeline(tl.id)}
          >
            {hasChildren ? (
              <button
                className="flex h-4 w-4 items-center justify-center rounded hover:bg-[var(--color-bg-hover)]"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleExpand(tl.id);
                }}
              >
                {isExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
              </button>
            ) : (
              <span className="w-4" />
            )}
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-xs",
                tl.type === "main"
                  ? "bg-[var(--color-primary-bg)] text-[var(--color-primary)]"
                  : tl.type === "flashback"
                    ? "bg-[var(--color-warning-bg)] text-[var(--color-warning)]"
                    : "bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]",
              )}
            >
              {tl.type === "main"
                ? "主线"
                : tl.type === "flashback"
                  ? "回忆"
                  : "支线"}
            </span>
            <span className="flex-1 truncate">{tl.name}</span>
            <span className="text-xs text-[var(--color-text-tertiary)]">
              L{depth}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 关系图
// ─────────────────────────────────────────────────────────────

interface RelationshipGraphProps {
  relationships: TimelineRelationshipLike[];
  timelineNames: Map<string, string>;
  onSelectTimeline: (timelineId: string) => void;
}

function RelationshipGraph({
  relationships,
  timelineNames,
  onSelectTimeline,
}: RelationshipGraphProps) {
  if (relationships.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-secondary)]">
        {t("timeline.multi.empty")}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {relationships.map((rel, idx) => {
        const fromName = timelineNames.get(rel.fromTimelineId) ?? rel.fromTimelineId;
        const toName = timelineNames.get(rel.toTimelineId) ?? rel.toTimelineId;
        return (
          <div
            key={`${rel.fromTimelineId}-${rel.toTimelineId}-${idx}`}
            className="timeline-card rounded-md border border-[var(--color-border)] p-3"
          >
            <div className="mb-2 flex items-center gap-2">
              <span
                className="cursor-pointer rounded bg-[var(--color-primary-bg)] px-2 py-1 text-xs text-[var(--color-primary)] hover:underline"
                onClick={() => onSelectTimeline(rel.fromTimelineId)}
              >
                {fromName}
              </span>
              <ArrowRight className="h-4 w-4 text-[var(--color-text-tertiary)]" />
              <span
                className="cursor-pointer rounded bg-[var(--color-primary-bg)] px-2 py-1 text-xs text-[var(--color-primary)] hover:underline"
                onClick={() => onSelectTimeline(rel.toTimelineId)}
              >
                {toName}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="rounded bg-[var(--color-bg-secondary)] px-2 py-0.5 text-xs">
                {t(`timeline.relationship.type.${rel.type}`)}
              </span>
              <span className="text-[var(--color-text-secondary)]">
                {rel.description}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 跨时间线绑定列表
// ─────────────────────────────────────────────────────────────

interface CrossBindingListProps {
  bindings: CrossTimelineBindingLike[];
  selectedTimelineId: string;
  timelineNames: Map<string, string>;
  onSelectNode?: (timelineId: string, nodeId: string) => void;
}

function CrossBindingList({
  bindings,
  selectedTimelineId,
  timelineNames,
  onSelectNode,
}: CrossBindingListProps) {
  const inbound = bindings.filter(
    (b) => b.targetTimelineId === selectedTimelineId,
  );
  const outbound = bindings.filter(
    (b) => b.sourceTimelineId === selectedTimelineId,
  );

  return (
    <div className="space-y-4">
      {/* 入站绑定 */}
      <div>
        <h4 className="mb-2 text-xs font-medium uppercase text-[var(--color-text-tertiary)]">
          {t("timeline.multi.inboundBindings")}（{inbound.length}）
        </h4>
        {inbound.length === 0 ? (
          <p className="text-xs text-[var(--color-text-secondary)]">
            {t("timeline.multi.noInjections")}
          </p>
        ) : (
          <div className="space-y-2">
            {inbound.map((b) => (
              <CrossBindingCard
                key={b.id}
                binding={b}
                timelineNames={timelineNames}
                onSelectNode={onSelectNode}
              />
            ))}
          </div>
        )}
      </div>

      {/* 出站绑定 */}
      <div>
        <h4 className="mb-2 text-xs font-medium uppercase text-[var(--color-text-tertiary)]">
          {t("timeline.multi.outboundBindings")}（{outbound.length}）
        </h4>
        {outbound.length === 0 ? (
          <p className="text-xs text-[var(--color-text-secondary)]">
            {t("timeline.multi.noInjections")}
          </p>
        ) : (
          <div className="space-y-2">
            {outbound.map((b) => (
              <CrossBindingCard
                key={b.id}
                binding={b}
                timelineNames={timelineNames}
                onSelectNode={onSelectNode}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 跨时间线绑定卡片
// ─────────────────────────────────────────────────────────────

interface CrossBindingCardProps {
  binding: CrossTimelineBindingLike;
  timelineNames: Map<string, string>;
  onSelectNode?: (timelineId: string, nodeId: string) => void;
}

function CrossBindingCard({
  binding,
  timelineNames,
  onSelectNode,
}: CrossBindingCardProps) {
  const sourceName =
    timelineNames.get(binding.sourceTimelineId) ?? binding.sourceTimelineId;
  const targetName =
    timelineNames.get(binding.targetTimelineId) ?? binding.targetTimelineId;
  const importanceColor =
    binding.importance === "critical"
      ? "bg-[var(--color-danger-bg)] text-[var(--color-danger)]"
      : binding.importance === "important"
        ? "bg-[var(--color-warning-bg)] text-[var(--color-warning)]"
        : "bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]";

  return (
    <div className="timeline-card rounded-md border border-[var(--color-border)] p-2.5">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="rounded bg-[var(--color-primary-bg)] px-1.5 py-0.5 text-xs text-[var(--color-primary)]">
          {t(`timeline.crossBinding.type.${binding.type}`)}
        </span>
        <span className={cn("rounded px-1.5 py-0.5 text-xs", importanceColor)}>
          {binding.importance}
        </span>
      </div>
      <div className="mb-1 text-xs text-[var(--color-text-secondary)]">
        <span
          className="cursor-pointer hover:underline"
          onClick={() => onSelectNode?.(binding.sourceTimelineId, binding.sourceNodeId)}
        >
          {sourceName} ({binding.sourceNodeId})
        </span>
        <ArrowRight className="mx-1 inline h-3 w-3" />
        <span
          className="cursor-pointer hover:underline"
          onClick={() => onSelectNode?.(binding.targetTimelineId, binding.targetNodeId)}
        >
          {targetName} ({binding.targetNodeId})
        </span>
      </div>
      <p className="line-clamp-2 text-xs">
        {binding.injectionText}
      </p>
      {binding.relationshipDescription && (
        <p className="mt-1 text-xs italic text-[var(--color-text-tertiary)]">
          {binding.relationshipDescription}
        </p>
      )}
      <div className="mt-1.5 flex gap-2 text-xs text-[var(--color-text-tertiary)]">
        {binding.autoInject !== false && (
          <span>{t("timeline.multi.autoInject")}</span>
        )}
        {binding.cascadeEffect && (
          <span>{t("timeline.multi.cascadeEffect")}</span>
        )}
        {binding.userConfirmed && <span>✓</span>}
      </div>
    </div>
  );
}
