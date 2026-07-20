/**
 * Task 2A.14 — PacingPanel 节奏规划 UI
 *
 * 顶部：节奏预设切换（慢/标准/快/自定义）+ 目标总时长城
 * 中部：EmotionCurveChart 情绪曲线可视化
 * 底部：各叙事节点的时长分配条形图 + 节奏说明
 * 操作：[一键应用建议时长] [恢复 AI 默认时长]
 *
 * 纯展示组件，所有状态由父组件通过 props 传入。
 * 不接入 useNovelPipeline（完整流程接入由 Task 2A.16 三档模式实现）。
 *
 * 依赖方向：
 * - 仅依赖 @/shared/constants（i18n）+ @/shared/presentation/EmptyState
 * - + 同模块 pacing（类型 + 引擎）+ structure/domain（类型）+ domain/types
 * - 不依赖 infrastructure / DI
 */

import { useMemo } from "react";
import { Clock, Gauge, Sparkles, RotateCcw, Check } from "lucide-react";
import { t } from "@/shared/constants";
import { EmptyState } from "@/shared/presentation/EmptyState";
import type { NovelSegment } from "../domain/types";
import type {
  NarrativeBeat,
  NarrativeBeatType,
  StoryStructure,
} from "../structure/domain/narrative-beats";
import {
  type PacingConfig,
  type PacingPreset,
  type PacingResult,
} from "../pacing";
import { planPacing, resolvePacingConfig, normalizeRatios } from "../pacing";
import { EmotionCurveChart } from "./EmotionCurveChart";

// ============================================================================
// 类型与常量
// ============================================================================

export interface PacingPanelProps {
  /** 故事结构分析结果（为空时显示 EmptyState） */
  structure: StoryStructure | null;
  /** 已分段的 NovelSegment[]（用于计算建议时长） */
  segments: NovelSegment[];
  /** 当前节奏配置（受控） */
  config: PacingConfig;
  /** 配置变化回调（用户切换预设或修改目标时长城后触发） */
  onConfigChange: (config: PacingConfig) => void;
  /** 一键应用建议时长回调（用户点击"应用"按钮后触发） */
  onApply?: (result: PacingResult) => void;
  /** 恢复默认时长回调（用户点击"恢复"按钮后触发） */
  onReset?: () => void;
  /** 是否正在处理（用于禁用按钮） */
  isProcessing?: boolean;
}

/** 预设选项列表 */
const PRESET_OPTIONS: { value: PacingPreset; labelKey: string }[] = [
  { value: "slow", labelKey: "novel.pacing.preset.slow" },
  { value: "normal", labelKey: "novel.pacing.preset.normal" },
  { value: "fast", labelKey: "novel.pacing.preset.fast" },
  { value: "custom", labelKey: "novel.pacing.preset.custom" },
];

/** 节点类型 → 阶段 */
function beatTypeToPhase(type: NarrativeBeatType): "setup" | "rising" | "climax" | "resolution" {
  switch (type) {
    case "setup":
    case "inciting_incident":
      return "setup";
    case "rising_action":
    case "midpoint":
      return "rising";
    case "climax":
      return "climax";
    case "falling_action":
    case "resolution":
      return "resolution";
  }
}

/** 阶段 → i18n 键 */
const PHASE_LABEL_KEY = {
  setup: "novel.pacing.phaseSetup",
  rising: "novel.pacing.phaseRising",
  climax: "novel.pacing.phaseClimax",
  resolution: "novel.pacing.phaseResolution",
} as const;

/** 阶段 → 颜色 */
const PHASE_COLOR: Record<"setup" | "rising" | "climax" | "resolution", string> = {
  setup: "bg-blue-500",
  rising: "bg-cyan-500",
  climax: "bg-emerald-500",
  resolution: "bg-blue-400",
};

// ============================================================================
// 子组件：阶段时长分配条形图
// ============================================================================

interface PhaseAllocationBarProps {
  beats: NarrativeBeat[];
  config: PacingConfig;
}

/**
 * 4 个阶段的时长分配条形图。
 *
 * 显示每个阶段占总时长的比例（按 PacingConfig 的 ratio），
 * 以及该阶段下的 beat 数量。
 */
function PhaseAllocationBar({ beats, config }: PhaseAllocationBarProps) {
  const resolved = resolvePacingConfig(config);
  const normalized = normalizeRatios(resolved);

  // 按阶段分组 beats
  const phaseBeatCounts = useMemo(() => {
    const counts = { setup: 0, rising: 0, climax: 0, resolution: 0 };
    for (const beat of beats) {
      counts[beatTypeToPhase(beat.type)]++;
    }
    return counts;
  }, [beats]);

  const phases: ("setup" | "rising" | "climax" | "resolution")[] = ["setup", "rising", "climax", "resolution"];

  return (
    <div className="space-y-2">
      {/* 横向堆叠条形图 */}
      <div className="flex h-3 rounded overflow-hidden bg-muted">
        {phases.map((phase) => {
          const ratio = normalized[phase];
          const pct = ratio * 100;
          if (pct < 0.1) return null;
          return (
            <div
              key={phase}
              className={`${PHASE_COLOR[phase]} transition-all`}
              style={{ width: `${pct}%` }}
              title={`${t(PHASE_LABEL_KEY[phase])}: ${pct.toFixed(1)}%`}
            />
          );
        })}
      </div>
      {/* 4 个阶段的标签 + 比例 + beat 数 */}
      <div className="grid grid-cols-4 gap-2 text-[10px]">
        {phases.map((phase) => {
          const ratio = normalized[phase];
          const pct = (ratio * 100).toFixed(1);
          const count = phaseBeatCounts[phase];
          const phaseSeconds = (ratio * resolved.targetDuration).toFixed(1);
          return (
            <div key={phase} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1">
                <span className={`inline-block w-2 h-2 rounded-sm ${PHASE_COLOR[phase]}`} />
                <span className="text-muted-foreground">{t(PHASE_LABEL_KEY[phase])}</span>
              </div>
              <span className="font-mono">{pct}% · {phaseSeconds}s</span>
              <span className="text-muted-foreground">{count} 节点</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// 子组件：节奏说明列表
// ============================================================================

interface PacingNotesProps {
  notes: string[];
}

function PacingNotesList({ notes }: PacingNotesProps) {
  if (notes.length === 0) return null;
  return (
    <ul className="space-y-1.5 text-[11px] text-muted-foreground">
      {notes.map((note, i) => (
        <li key={i} className="flex items-start gap-1.5">
          <Sparkles size={10} className="mt-0.5 flex-shrink-0 text-primary" />
          <span>{note}</span>
        </li>
      ))}
    </ul>
  );
}

// ============================================================================
// 主组件
// ============================================================================

/**
 * PacingPanel 内部状态 hook：集中管理 PacingResult 计算 + 4 个 handlers。
 *
 * 提取到模块级以减少 PacingPanel 函数体行数（max-lines-per-function 警告）。
 */
interface UsePacingPanelStateOptions {
  structure: StoryStructure | null;
  segments: NovelSegment[];
  config: PacingConfig;
  onConfigChange: (config: PacingConfig) => void;
  onApply?: (result: PacingResult) => void;
  onReset?: () => void;
}

interface UsePacingPanelStateResult {
  pacingResult: PacingResult | null;
  handlePresetChange: (preset: PacingPreset) => void;
  handleTargetDurationChange: (value: number) => void;
  handleApply: () => void;
  handleReset: () => void;
}

function usePacingPanelState({
  structure, segments, config, onConfigChange, onApply, onReset,
}: UsePacingPanelStateOptions): UsePacingPanelStateResult {
  const pacingResult = useMemo<PacingResult | null>(() => {
    if (!structure || segments.length === 0) return null;
    return planPacing(segments, structure, config);
  }, [structure, segments, config]);

  const handlePresetChange = (preset: PacingPreset) => {
    onConfigChange({ ...config, preset });
  };

  const handleTargetDurationChange = (value: number) => {
    // 夹紧到 10-300 秒（防御性：input 已设 min/max，但仍处理非浏览器输入路径）
    const clamped = Math.max(10, Math.min(300, value));
    onConfigChange({ ...config, targetDuration: clamped });
  };

  const handleApply = () => {
    if (pacingResult && onApply) onApply(pacingResult);
  };

  // M-2 修复：只调用 onReset，由父组件负责完整重置（避免同时调用 onConfigChange 导致双重 setPacingConfig）
  const handleReset = () => {
    if (onReset) onReset();
  };

  return { pacingResult, handlePresetChange, handleTargetDurationChange, handleApply, handleReset };
}

/**
 * 节奏规划面板。
 *
 * 用户可：
 * - 切换 4 种预设（慢/标准/快/自定义）
 * - 修改目标总时长（10-300 秒）
 * - 查看情绪曲线与阶段时长分配
 * - 一键应用建议时长到 beats
 * - 恢复默认时长配置
 */
export function PacingPanel({
  structure,
  segments,
  config,
  onConfigChange,
  onApply,
  onReset,
  isProcessing = false,
}: PacingPanelProps) {
  const {
    pacingResult,
    handlePresetChange,
    handleTargetDurationChange,
    handleApply,
    handleReset,
  } = usePacingPanelState({ structure, segments, config, onConfigChange, onApply, onReset });

  // 空状态：structure 为 null（未完成结构分析）
  if (!structure) {
    return (
      <EmptyState
        icon={Gauge}
        title={t("novel.pacing.title")}
        description={t("novel.pacing.noStructure")}
        compact
      />
    );
  }

  // 空状态：segments 为空（未完成内容分段）
  if (segments.length === 0) {
    return (
      <EmptyState
        icon={Gauge}
        title={t("novel.pacing.title")}
        description={t("novel.pacing.noSegments")}
        compact
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 border border-border rounded-lg bg-card/50">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gauge size={14} className="text-primary" />
          <h3 className="text-[13px] font-semibold">{t("novel.pacing.title")}</h3>
        </div>
        <span className="text-[10px] text-muted-foreground">{t("novel.pacing.subtitle")}</span>
      </div>

      {/* 顶部：预设切换 + 目标总时长 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">{t("novel.pacing.presetLabel")}:</span>
          <div className="flex gap-1 p-0.5 bg-muted rounded">
            {PRESET_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handlePresetChange(opt.value)}
                className={[
                  "px-2.5 py-1 text-[11px] rounded transition-colors",
                  config.preset === opt.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/50",
                ].join(" ")}
                aria-pressed={config.preset === opt.value}
              >
                {t(opt.labelKey)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          <Clock size={12} className="text-muted-foreground" />
          <label htmlFor="pacing-target-duration" className="text-[11px] text-muted-foreground">
            {t("novel.pacing.targetDuration")}:
          </label>
          <input
            id="pacing-target-duration"
            type="number"
            min={10}
            max={300}
            step={5}
            value={config.targetDuration}
            onChange={(e) => handleTargetDurationChange(Number(e.target.value) || 10)}
            disabled={isProcessing}
            className="w-16 px-1.5 py-0.5 text-[11px] text-center border border-border rounded bg-background"
          />
          <span className="text-[11px] text-muted-foreground">{t("novel.pacing.seconds")}</span>
        </div>
      </div>

      {/* 中部：情绪曲线 */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-[11px] font-medium">
          <span>{t("novel.pacing.emotionCurve")}</span>
        </div>
        <EmotionCurveChart
          points={structure.emotionCurve}
          climaxPosition={structure.climaxPosition}
          beats={structure.beats}
          height={120}
        />
      </div>

      {/* 底部：时长分配 + 节奏说明 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-medium">
            <span>{t("novel.pacing.durationAllocation")}</span>
            {pacingResult && (
              <span className="text-muted-foreground font-mono">
                {t("novel.pacing.totalDuration")}: {pacingResult.totalDuration.toFixed(1)}{t("novel.pacing.seconds")}
              </span>
            )}
          </div>
          <PhaseAllocationBar beats={structure.beats} config={config} />
        </div>

        <div className="space-y-1.5">
          <div className="text-[11px] font-medium">{t("novel.pacing.pacingNotes")}</div>
          {pacingResult && <PacingNotesList notes={pacingResult.pacingNotes} />}
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        <button
          type="button"
          onClick={handleReset}
          disabled={isProcessing}
          className="btn btn-ghost text-[11px] px-2.5 py-1 flex items-center gap-1"
        >
          <RotateCcw size={10} />
          {t("novel.pacing.reset")}
        </button>
        <button
          type="button"
          onClick={handleApply}
          disabled={isProcessing || !pacingResult}
          className="btn btn-primary text-[11px] px-3 py-1 flex items-center gap-1"
        >
          <Check size={10} />
          {t("novel.pacing.apply")}
        </button>
      </div>
    </div>
  );
}
