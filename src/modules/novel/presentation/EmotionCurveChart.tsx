/**
 * Task 2A.14 — EmotionCurveChart 情绪曲线 SVG 图表
 *
 * 横轴：故事进度 0-100%
 * 纵轴：情绪强度 0-1
 * 标注 7 个叙事节点位置（若传入 beats）
 *
 * 纯展示组件，所有数据通过 props 传入，不接入 Hook。
 *
 * 依赖方向：
 * - 仅依赖 @/shared/constants（i18n）+ structure/domain/narrative-beats（类型）
 * - 不依赖 infrastructure / DI
 */

import { useMemo } from "react";
import { t } from "@/shared/constants";
import type {
  EmotionPoint,
  NarrativeBeat,
  NarrativeBeatType,
} from "../structure/domain/narrative-beats";
import { NARRATIVE_BEAT_TYPES } from "../structure/domain/narrative-beats";

// ============================================================================
// 类型与常量
// ============================================================================

export interface EmotionCurveChartProps {
  /** 情绪曲线采样点（按 position 排序） */
  points: EmotionPoint[];
  /** 高潮位置（0-1），用虚线竖线标记 */
  climaxPosition?: number;
  /** 叙事节点列表（用于在曲线上标注 7 个节点位置） */
  beats?: NarrativeBeat[];
  /** 图表高度（px），默认 120 */
  height?: number;
  /** 是否显示节点标签（默认 true） */
  showBeatLabels?: boolean;
}

/** 节点类型 → i18n 键 */
const BEAT_TYPE_LABEL_KEY: Record<NarrativeBeatType, string> = {
  setup: "novel.structure.beatType.setup",
  inciting_incident: "novel.structure.beatType.inciting_incident",
  rising_action: "novel.structure.beatType.rising_action",
  midpoint: "novel.structure.beatType.midpoint",
  climax: "novel.structure.beatType.climax",
  falling_action: "novel.structure.beatType.falling_action",
  resolution: "novel.structure.beatType.resolution",
};

/** 节点类型 → 徽章颜色 */
const BEAT_TYPE_COLOR: Record<NarrativeBeatType, string> = {
  setup: "#3b82f6",              // blue
  inciting_incident: "#f59e0b",  // amber
  rising_action: "#3b82f6",      // blue
  midpoint: "#f59e0b",           // amber
  climax: "#10b981",             // emerald
  falling_action: "#3b82f6",     // blue
  resolution: "#3b82f6",         // blue
};

// SVG viewBox 常量
const VIEWBOX_WIDTH = 100;
const VIEWBOX_HEIGHT_BASE = 100;
const PADDING_TOP = 8;
const PADDING_BOTTOM = 16;
const PADDING_LEFT = 4;
const PADDING_RIGHT = 4;

// ============================================================================
// 子组件：单个 beat 标注
// ============================================================================

interface BeatMarkerProps {
  beat: NarrativeBeat;
  chartHeight: number;
  showLabel: boolean;
}

/**
 * 在曲线上标注单个 beat 位置（竖线 + 圆点 + 标签）。
 */
function BeatMarker({ beat, chartHeight, showLabel }: BeatMarkerProps) {
  const x = PADDING_LEFT + beat.position * (VIEWBOX_WIDTH - PADDING_LEFT - PADDING_RIGHT);
  // y 轴反向（SVG 原点在左上）：intensity 0 → 底部，1 → 顶部
  const y =
    PADDING_TOP +
    (1 - beat.emotionIntensity) *
      (chartHeight - PADDING_TOP - PADDING_BOTTOM);
  const color = BEAT_TYPE_COLOR[beat.type];
  const label = t(BEAT_TYPE_LABEL_KEY[beat.type]);

  return (
    <g>
      {/* 竖线 */}
      <line
        x1={x}
        x2={x}
        y1={PADDING_TOP}
        y2={chartHeight - PADDING_BOTTOM}
        stroke={color}
        strokeWidth={0.3}
        strokeDasharray="1,1"
        opacity={0.5}
      />
      {/* 圆点 */}
      <circle cx={x} cy={y} r={1.2} fill={color} />
      {/* 标签 */}
      {showLabel && (
        <text
          x={x}
          y={chartHeight - PADDING_BOTTOM + 6}
          fontSize={3}
          textAnchor="middle"
          fill="currentColor"
          opacity={0.7}
        >
          {label}
        </text>
      )}
    </g>
  );
}

// ============================================================================
// 主组件
// ============================================================================

/**
 * 情绪曲线 SVG 折线图。
 *
 * - 宽度自适应（viewBox 0-100，preserveAspectRatio="none" 拉伸到容器宽度）
 * - 高度通过 height prop 控制（默认 120px）
 * - 横轴：故事进度 0-1 → x 0-100
 * - 纵轴：情绪强度 0-1 → y 底部到顶部（反向）
 * - 高潮位置用虚线竖线标记
 * - 7 个叙事节点位置用圆点 + 标签标记
 */
export function EmotionCurveChart({
  points,
  climaxPosition,
  beats,
  height = 120,
  showBeatLabels = true,
}: EmotionCurveChartProps) {
  // 计算 viewBox 高度（基于 height prop）
  const viewboxHeight = useMemo(() => {
    return Math.max(80, Math.min(200, height * (VIEWBOX_HEIGHT_BASE / 120)));
  }, [height]);

  // 构建折线路径
  const pathD = useMemo(() => {
    if (points.length === 0) return "";
    const coords = points.map((p) => {
      const x = PADDING_LEFT + p.position * (VIEWBOX_WIDTH - PADDING_LEFT - PADDING_RIGHT);
      const y =
        PADDING_TOP +
        (1 - p.intensity) * (viewboxHeight - PADDING_TOP - PADDING_BOTTOM);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    });
    return `M ${coords.join(" L ")}`;
  }, [points, viewboxHeight]);

  // 构建填充区域路径（折线 + 底部封闭）
  const areaD = useMemo(() => {
    if (points.length === 0) return "";
    const coords = points.map((p) => {
      const x = PADDING_LEFT + p.position * (VIEWBOX_WIDTH - PADDING_LEFT - PADDING_RIGHT);
      const y =
        PADDING_TOP +
        (1 - p.intensity) * (viewboxHeight - PADDING_TOP - PADDING_BOTTOM);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    });
    const firstX = PADDING_LEFT + points[0]!.position * (VIEWBOX_WIDTH - PADDING_LEFT - PADDING_RIGHT);
    const lastX = PADDING_LEFT + points[points.length - 1]!.position * (VIEWBOX_WIDTH - PADDING_LEFT - PADDING_RIGHT);
    return `M ${firstX.toFixed(2)},${viewboxHeight - PADDING_BOTTOM} L ${coords.join(" L ")} L ${lastX.toFixed(2)},${viewboxHeight - PADDING_BOTTOM} Z`;
  }, [points, viewboxHeight]);

  if (points.length === 0) {
    return (
      <div className="flex items-center justify-center h-[120px] text-[11px] text-muted-foreground border border-dashed border-border rounded">
        {t("novel.pacing.noEmotionData")}
      </div>
    );
  }

  // 高潮位置 x 坐标
  const climaxX =
    climaxPosition !== undefined
      ? PADDING_LEFT + climaxPosition * (VIEWBOX_WIDTH - PADDING_LEFT - PADDING_RIGHT)
      : null;

  // 按 position 排序的 beats（用于标注）
  const sortedBeats = beats
    ? [...beats].sort((a, b) => a.position - b.position)
    : [];

  return (
    <div className="w-full" style={{ height: `${height}px` }}>
      <svg
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${viewboxHeight}`}
        preserveAspectRatio="none"
        className="w-full h-full"
        role="img"
        aria-label={t("novel.pacing.emotionCurveAriaLabel")}
      >
        {/* 背景网格（4 条水平线） */}
        {[0.25, 0.5, 0.75].map((ratio) => {
          const y = PADDING_TOP + ratio * (viewboxHeight - PADDING_TOP - PADDING_BOTTOM);
          return (
            <line
              key={ratio}
              x1={PADDING_LEFT}
              x2={VIEWBOX_WIDTH - PADDING_RIGHT}
              y1={y}
              y2={y}
              stroke="currentColor"
              strokeWidth={0.15}
              opacity={0.15}
            />
          );
        })}

        {/* 填充区域（折线下方） */}
        <path d={areaD} fill="currentColor" opacity={0.08} />

        {/* 折线 */}
        <path
          d={pathD}
          fill="none"
          stroke="currentColor"
          strokeWidth={0.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          className="text-primary"
        />

        {/* 高潮位置竖线 */}
        {climaxX !== null && (
          <line
            x1={climaxX}
            x2={climaxX}
            y1={PADDING_TOP}
            y2={viewboxHeight - PADDING_BOTTOM}
            stroke="#ef4444"
            strokeWidth={0.4}
            strokeDasharray="2,1"
            opacity={0.7}
          />
        )}

        {/* 7 个叙事节点标注 */}
        {sortedBeats.map((beat) => (
          <BeatMarker
            key={beat.id}
            beat={beat}
            chartHeight={viewboxHeight}
            showLabel={showBeatLabels}
          />
        ))}
      </svg>
    </div>
  );
}

// 导出常量供其他组件复用
export { NARRATIVE_BEAT_TYPES };
