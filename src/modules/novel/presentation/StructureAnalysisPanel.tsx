/**
 * Task 2A.13 — 故事结构分析面板
 *
 * 显示 StoryStructure（叙事 beats + 情绪曲线 + 整体节奏 + 高潮位置）：
 * - 顶部：标题 + 描述 + 统计（节点数 / 整体节奏 / 高潮位置）
 * - 中部：情绪曲线 SVG 折线图（横轴故事进度 0-1，纵轴情绪强度 0-1）
 * - 底部：beats 卡片横向时间轴（每个卡片显示类型徽章 + 标题 + 描述 + 强度条 + 关联片段数 + 时长 + 位置）
 *
 * 用户可：
 * - 点击"编辑"按钮进入行内编辑（标题/描述/类型/情绪强度）
 * - 调整后通过 onBeatsChange 回调上传新 beats
 *
 * 此组件为纯展示组件，所有状态由父组件通过 props 传入。
 * 不接入 useNovelPipeline（Task 2A.13 仅完成 UI + PipelineStage 合法转换，
 *   完整流程接入由 Task 2A.16 三档模式实现，避免破坏现有管道功能）。
 */

import { useMemo, useState } from "react";
import { Activity, Clock, Edit, Map, Sparkles, TrendingUp, Check, X } from "lucide-react";
import { t } from "@/shared/constants";
import { EmptyState } from "@/shared/presentation/EmptyState";
import type {
  NarrativeBeat,
  NarrativeBeatType,
  OverallPacing,
  StoryStructure,
} from "../structure/domain/narrative-beats";
import { NARRATIVE_BEAT_TYPES } from "../structure/domain/narrative-beats";

// ============================================================================
// 类型与常量
// ============================================================================

export interface StructureAnalysisPanelProps {
  /** 故事结构分析结果（为空时显示 EmptyState） */
  structure: StoryStructure | null;
  /** beats 变化回调（用户编辑后触发） */
  onBeatsChange?: (beats: NarrativeBeat[]) => void;
  /** 是否正在生成（用于禁用编辑按钮） */
  isProcessing?: boolean;
}

/** 节点类型 → 徽章颜色 */
const BEAT_TYPE_BADGE: Record<NarrativeBeatType, string> = {
  setup: "badge-info",
  inciting_incident: "badge-warning",
  rising_action: "badge-info",
  midpoint: "badge-warning",
  climax: "badge-success",
  falling_action: "badge-info",
  resolution: "badge-info",
};

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

/** 节奏 → i18n 键 */
const PACING_LABEL_KEY: Record<OverallPacing, string> = {
  slow: "novel.structure.pacing.slow",
  normal: "novel.structure.pacing.normal",
  fast: "novel.structure.pacing.fast",
};

/** 编辑表单状态 */
interface BeatEditForm {
  type: NarrativeBeatType;
  title: string;
  description: string;
  emotionIntensity: number;
}

// ============================================================================
// 子组件：情绪曲线 SVG
// ============================================================================

interface EmotionCurveProps {
  points: { position: number; intensity: number; label?: string }[];
  climaxPosition: number;
}

/**
 * 情绪曲线 SVG 折线图。
 *
 * - 宽度自适应（viewBox 0-100，preserveAspectRatio="none" 拉伸到容器宽度）
 * - 高度固定 80px
 * - 横轴：故事进度 0-1 → x 0-100
 * - 纵轴：情绪强度 0-1 → y 80-0（反向）
 * - 高潮位置用虚线竖线标记
 */
function EmotionCurve({ points, climaxPosition }: EmotionCurveProps) {
  if (points.length === 0) {
    return (
      <div className="text-[11px] text-muted-foreground text-center py-4">
        {t("novel.structure.emotionCurve")}
      </div>
    );
  }

  // 排序并计算路径
  const sorted = [...points].sort((a, b) => a.position - b.position);
  const pathD = sorted
    .map((p, i) => {
      const x = (p.position * 100).toFixed(2);
      const y = (80 - p.intensity * 80).toFixed(2);
      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    })
    .join(" ");

  // 填充区域路径（路径 + 底边闭合）
  const areaD = `${pathD} L 100 80 L 0 80 Z`;

  const climaxX = (climaxPosition * 100).toFixed(2);

  return (
    <div className="card p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[12px] font-bold flex items-center gap-1.5">
          <TrendingUp size={12} />
          {t("novel.structure.emotionCurve")}
        </div>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span>{t("novel.structure.storyProgress")}</span>
          <span>·</span>
          <span>{t("novel.structure.emotionIntensity")}</span>
        </div>
      </div>
      <svg
        viewBox="0 0 100 80"
        preserveAspectRatio="none"
        className="w-full h-20 border border-border rounded bg-[rgba(var(--primary-rgb),0.02)]"
        role="img"
        aria-label={t("novel.structure.emotionCurve")}
      >
        {/* 网格线（25%/50%/75%） */}
        {[20, 40, 60].map((y) => (
          <line
            key={y}
            x1="0"
            y1={y}
            x2="100"
            y2={y}
            stroke="var(--border)"
            strokeWidth="0.3"
            strokeDasharray="1 1"
          />
        ))}
        {/* 高潮位置虚线 */}
        <line
          x1={climaxX}
          y1="0"
          x2={climaxX}
          y2="80"
          stroke="var(--primary)"
          strokeWidth="0.4"
          strokeDasharray="2 1"
          opacity="0.6"
        />
        {/* 填充区域 */}
        <path d={areaD} fill="rgba(var(--primary-rgb),0.1)" />
        {/* 折线 */}
        <path
          d={pathD}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="0.6"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* 采样点 */}
        {sorted.map((p, i) => {
          const x = (p.position * 100).toFixed(2);
          const y = (80 - p.intensity * 80).toFixed(2);
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r="0.9"
              fill="var(--primary)"
              stroke="var(--background)"
              strokeWidth="0.3"
            />
          );
        })}
      </svg>
      {/* 横轴刻度 */}
      <div className="flex justify-between text-[9px] text-muted-foreground mt-1 px-0.5">
        <span>0%</span>
        <span>25%</span>
        <span>50%</span>
        <span>75%</span>
        <span>100%</span>
      </div>
    </div>
  );
}

// ============================================================================
// 子组件：单个 beat 卡片
// ============================================================================

interface BeatCardProps {
  beat: NarrativeBeat;
  isProcessing: boolean;
  onEdit: (beat: NarrativeBeat) => void;
}

function intensityLabel(intensity: number): string {
  if (intensity >= 0.66) return t("novel.structure.intensityHigh");
  if (intensity >= 0.33) return t("novel.structure.intensityMedium");
  return t("novel.structure.intensityLow");
}

function BeatCard({ beat, isProcessing, onEdit }: BeatCardProps) {
  return (
    <div className="card p-3 min-w-[180px] flex flex-col gap-1.5">
      {/* 头部：类型徽章 + 位置 */}
      <div className="flex items-center justify-between gap-1">
        <span className={`badge ${BEAT_TYPE_BADGE[beat.type]} text-[9px] px-1.5 py-0.5`}>
          {t(BEAT_TYPE_LABEL_KEY[beat.type])}
        </span>
        <span className="text-[9px] text-muted-foreground">
          {t("novel.structure.beatPosition", { pos: (beat.position * 100).toFixed(0) + "%" })}
        </span>
      </div>

      {/* 标题 */}
      <div className="text-[12px] font-bold line-clamp-2 min-h-[1.5em]">
        {beat.title}
      </div>

      {/* 描述 */}
      {beat.description && (
        <div className="text-[10px] text-muted-foreground line-clamp-3 min-h-[2.5em]">
          {beat.description}
        </div>
      )}

      {/* 情绪强度条 */}
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] text-muted-foreground shrink-0">
          {t("novel.structure.beatIntensityLabel")}
        </span>
        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--primary)] rounded-full transition-all"
            style={{ width: `${Math.max(2, Math.min(100, beat.emotionIntensity * 100))}%` }}
          />
        </div>
        <span className="text-[9px] text-muted-foreground shrink-0">
          {intensityLabel(beat.emotionIntensity)}
        </span>
      </div>

      {/* 底部：时长 + 关联片段数 + 编辑按钮 */}
      <div className="flex items-center justify-between gap-1 pt-1 border-t border-border">
        <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
          <div className="flex items-center gap-0.5">
            <Clock size={9} />
            {t("novel.segments.duration", { n: Math.round(beat.estimatedDuration) })}
          </div>
          <div className="flex items-center gap-0.5">
            <Map size={9} />
            {t("novel.structure.beatSegmentsCount", { count: beat.segmentIds.length })}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onEdit(beat)}
          disabled={isProcessing}
          className="btn btn-ghost text-[10px] px-1.5 py-0.5 flex items-center gap-0.5"
          aria-label={t("novel.structure.editAriaLabel")}
        >
          <Edit size={9} />
          {t("novel.shot.edit")}
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// 子组件：beat 编辑弹窗
// ============================================================================

interface BeatEditModalProps {
  beat: NarrativeBeat;
  onSave: (updated: NarrativeBeat) => void;
  onCancel: () => void;
}

function BeatEditModal({ beat, onSave, onCancel }: BeatEditModalProps) {
  const [form, setForm] = useState<BeatEditForm>({
    type: beat.type,
    title: beat.title,
    description: beat.description,
    emotionIntensity: beat.emotionIntensity,
  });

  const handleSave = () => {
    onSave({
      ...beat,
      type: form.type,
      title: form.title.trim() || beat.title,
      description: form.description.trim(),
      emotionIntensity: Math.max(0, Math.min(1, form.emotionIntensity)),
    });
  };

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
    >
      <div
        className="modal max-h-[80vh] flex flex-col w-[calc(100vw-2rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[14px] font-bold mb-3 flex items-center gap-1.5">
          <Edit size={14} />
          {t("novel.structure.editAriaLabel")}
        </div>

        <div className="flex flex-col gap-3 overflow-y-auto pr-1">
          {/* 类型 */}
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">
              {t("novel.structure.beatTypeLabel")}
            </span>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as NarrativeBeatType })}
              className="input text-[12px] px-2 py-1.5"
            >
              {NARRATIVE_BEAT_TYPES.map((bt) => (
                <option key={bt} value={bt}>
                  {t(BEAT_TYPE_LABEL_KEY[bt])}
                </option>
              ))}
            </select>
          </label>

          {/* 标题 */}
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">
              {t("novel.structure.beatTitleLabel")}
            </span>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="input text-[12px] px-2 py-1.5"
            />
          </label>

          {/* 描述 */}
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">
              {t("novel.structure.beatDescriptionLabel")}
            </span>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              className="input text-[12px] px-2 py-1.5 resize-none"
            />
          </label>

          {/* 情绪强度 */}
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground flex items-center justify-between">
              <span>{t("novel.structure.beatIntensityLabel")}</span>
              <span className="text-[10px]">{(form.emotionIntensity * 100).toFixed(0)}%</span>
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={form.emotionIntensity}
              onChange={(e) =>
                setForm({ ...form, emotionIntensity: parseFloat(e.target.value) })
              }
              className="w-full"
            />
          </label>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-border">
          <button
            type="button"
            onClick={onCancel}
            className="btn btn-ghost text-[12px] px-3 py-1.5 flex items-center gap-1"
          >
            <X size={11} />
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="btn btn-primary text-[12px] px-3 py-1.5 flex items-center gap-1"
          >
            <Check size={11} />
            {t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 主组件
// ============================================================================

export function StructureAnalysisPanel({
  structure,
  onBeatsChange,
  isProcessing = false,
}: StructureAnalysisPanelProps) {
  const [editingBeat, setEditingBeat] = useState<NarrativeBeat | null>(null);

  // 排序后的 beats（按 position）
  const sortedBeats = useMemo(() => {
    if (!structure) return [];
    return [...structure.beats].sort((a, b) => a.position - b.position);
  }, [structure]);

  // 统计
  const stats = useMemo(() => {
    if (!structure) return null;
    return {
      beatCount: structure.beats.length,
      overallPacing: structure.overallPacing,
      climaxPosition: structure.climaxPosition,
    };
  }, [structure]);

  // 编辑保存
  const handleEditSave = (updated: NarrativeBeat) => {
    if (!structure || !onBeatsChange) {
      setEditingBeat(null);
      return;
    }
    const newBeats = structure.beats.map((b) => (b.id === updated.id ? updated : b));
    onBeatsChange(newBeats);
    setEditingBeat(null);
  };

  // 空状态
  if (!structure || structure.beats.length === 0) {
    return (
      <div className="flex flex-col gap-3 max-w-5xl mx-auto w-full">
        <EmptyState
          icon={Sparkles}
          title={t("novel.structure.empty")}
          hint={t("novel.structure.emptyHint")}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 max-w-5xl mx-auto w-full">
      {/* 顶部标题 + 统计 */}
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2">
          <div className="text-[14px] font-bold flex items-center gap-1.5">
            <Sparkles size={14} className="text-[var(--primary)]" />
            {t("novel.structure.title")}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {t("novel.structure.beatCount", { count: stats?.beatCount ?? 0 })}
          </div>
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          <div className="flex items-center gap-1">
            <Activity size={11} className="text-muted-foreground" />
            <span className="text-muted-foreground">{t("novel.structure.overallPacing")}：</span>
            <span className="font-bold">
              {stats ? t(PACING_LABEL_KEY[stats.overallPacing]) : "-"}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <TrendingUp size={11} className="text-muted-foreground" />
            <span className="text-muted-foreground">{t("novel.structure.climaxPosition")}：</span>
            <span className="font-bold">
              {stats ? (stats.climaxPosition * 100).toFixed(0) + "%" : "-"}
            </span>
          </div>
        </div>
      </div>

      {/* 描述 */}
      <div className="text-[11px] text-muted-foreground px-1">
        {t("novel.structure.desc")}
      </div>

      {/* 情绪曲线 */}
      <EmotionCurve
        points={structure.emotionCurve}
        climaxPosition={structure.climaxPosition}
      />

      {/* beats 横向时间轴 */}
      <div className="flex flex-col gap-2">
        <div className="text-[12px] font-bold px-1 flex items-center gap-1.5">
          <Map size={12} />
          {t("novel.structure.title")}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 px-1">
          {sortedBeats.map((beat) => (
            <BeatCard
              key={beat.id}
              beat={beat}
              isProcessing={isProcessing}
              onEdit={setEditingBeat}
            />
          ))}
        </div>
      </div>

      {/* 编辑弹窗 */}
      {editingBeat && (
        <BeatEditModal
          beat={editingBeat}
          onSave={handleEditSave}
          onCancel={() => setEditingBeat(null)}
        />
      )}
    </div>
  );
}
