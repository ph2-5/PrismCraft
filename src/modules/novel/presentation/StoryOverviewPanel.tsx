/**
 * Task 2A.15 — 故事概览主面板
 *
 * 全局视图，整合 4 个图表展示故事结构：
 * 1. 故事结构时间轴（beats 横向条形图，按 position + estimatedDuration 渲染）
 * 2. 角色出场分布（CharacterAppearanceChart）
 * 3. 场景变化节奏（ScenePacingChart）
 * 4. 情绪曲线（EmotionCurveChart，复用 Task 2A.14）
 * 5. 分镜密度（ShotDensityChart）
 *
 * 交互：
 * - 点击图表元素 → 跳转到对应编辑面板（通过 onJumpToStage 回调）
 * - 点击"返回编辑" → 退出概览模式（通过 onExit 回调）
 *
 * 依赖方向：仅依赖 @/shared/constants（i18n）+ @/shared/presentation/EmptyState
 * + 同模块 domain/types + structure/domain + pacing + presentation 子组件
 */

import { ArrowLeft, BarChart3, Clock, Film, Gauge, MapPin, TrendingUp, Users } from "lucide-react";
import { t } from "@/shared/constants";
import { EmptyState } from "@/shared/presentation/EmptyState";
import type {
  PipelineState,
  SceneInPipeline,
  ShotBreakdown,
} from "../domain/types";
import type { StoryStructure } from "../structure/domain/narrative-beats";
import { EmotionCurveChart } from "./EmotionCurveChart";
import { CharacterAppearanceChart } from "./charts/CharacterAppearanceChart";
import { ScenePacingChart } from "./charts/ScenePacingChart";
import { ShotDensityChart } from "./charts/ShotDensityChart";

// ============================================================================
// 类型与常量
// ============================================================================

export interface StoryOverviewPanelProps {
  /** 当前 PipelineState（用于获取 segments/characters/scenes） */
  state: PipelineState;
  /** 分镜列表 */
  shots: ShotBreakdown[];
  /** 故事结构分析结果（professional 模式产出，为 null 时降级显示） */
  storyStructure: StoryStructure | null;
  /** 退出概览模式回调 */
  onExit: () => void;
  /** 跳转到指定阶段（如 character_manage / scene_manage / storyboard） */
  onJumpToStage?: (stage: PipelineState["stage"]) => void;
}

// ============================================================================
// 子组件：故事结构时间轴
// ============================================================================

interface StoryTimelineProps {
  structure: StoryStructure;
}

/** 节点类型 → 颜色 */
const BEAT_TYPE_TIMELINE_COLOR: Record<string, string> = {
  setup: "bg-blue-500",
  inciting_incident: "bg-amber-500",
  rising_action: "bg-blue-400",
  midpoint: "bg-amber-400",
  climax: "bg-emerald-500",
  falling_action: "bg-blue-300",
  resolution: "bg-blue-500",
};

/**
 * 故事结构时间轴：横向条形图，按 beats 的 position + estimatedDuration 渲染。
 */
function StoryTimeline({ structure }: StoryTimelineProps) {
  const beats = structure.beats;
  if (beats.length === 0) {
    return (
      <div className="text-[11px] text-muted-foreground text-center py-4">
        {t("novel.overview.noBeatData")}
      </div>
    );
  }

  // 按 position 排序
  const sorted = [...beats].sort((a, b) => a.position - b.position);
  const totalDuration = sorted.reduce((sum, b) => sum + b.estimatedDuration, 0);
  const maxDuration = Math.max(...sorted.map((b) => b.estimatedDuration), 1);

  return (
    <div className="space-y-2">
      {/* 时间轴主体 */}
      <div className="flex items-end gap-0.5 h-16">
        {sorted.map((beat) => {
          const widthPct = (beat.estimatedDuration / totalDuration) * 100;
          const heightPct = (beat.estimatedDuration / maxDuration) * 100;
          const color = BEAT_TYPE_TIMELINE_COLOR[beat.type] ?? "bg-muted";
          return (
            <div
              key={beat.id}
              className="flex flex-col items-center justify-end shrink-0 group relative"
              style={{ width: `${Math.max(2, widthPct)}%` }}
              title={`${beat.title} · ${beat.estimatedDuration}s · ${(beat.position * 100).toFixed(0)}%`}
            >
              <div
                className={`w-full ${color} rounded-t transition-all group-hover:opacity-80`}
                style={{ height: `${Math.max(20, heightPct)}%` }}
              />
              <span className="text-[8px] text-muted-foreground mt-0.5 truncate w-full text-center">
                {beat.title}
              </span>
            </div>
          );
        })}
      </div>
      {/* 总时长 */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{t("novel.overview.beatCount", { count: sorted.length })}</span>
        <span className="font-mono">
          {t("novel.pacing.totalDuration")}: {totalDuration.toFixed(1)}{t("novel.pacing.seconds")}
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// 子组件：统计卡片
// ============================================================================

interface StatCardProps {
  icon: typeof Film;
  label: string;
  value: string | number;
  hint?: string;
}

function StatCard({ icon: Icon, label, value, hint }: StatCardProps) {
  return (
    <div className="card p-3 flex items-center gap-2">
      <Icon size={14} className="text-primary shrink-0" />
      <div className="flex flex-col min-w-0">
        <span className="text-[10px] text-muted-foreground truncate">{label}</span>
        <span className="text-[13px] font-bold font-mono truncate">{value}</span>
        {hint && <span className="text-[9px] text-muted-foreground truncate">{hint}</span>}
      </div>
    </div>
  );
}

// ============================================================================
// 子组件：概览主体内容（统计卡片 + 所有图表）
// ============================================================================

interface OverviewContentProps {
  shots: ShotBreakdown[];
  characters: PipelineState["characters"];
  scenes: SceneInPipeline[];
  storyStructure: StoryStructure | null;
  onJumpToStage?: (stage: PipelineState["stage"]) => void;
}

/**
 * 概览主体内容：统计卡片 + 故事时间轴 + 情绪曲线 + 角色/场景图表 + 分镜密度。
 *
 * 提取到模块级以减少 StoryOverviewPanel 函数体行数（max-lines-per-function 警告）。
 */
function OverviewContent({
  shots, characters, scenes, storyStructure, onJumpToStage,
}: OverviewContentProps) {
  const totalShots = shots.length;
  const totalDuration = shots.reduce((sum, s) => sum + s.estimatedDuration, 0);
  const avgDuration = totalShots > 0 ? totalDuration / totalShots : 0;

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* 顶部统计卡片 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatCard
          icon={Film}
          label={t("novel.overview.totalShots")}
          value={totalShots}
          hint={t("novel.overview.avgDuration", { n: avgDuration.toFixed(1) })}
        />
        <StatCard
          icon={Clock}
          label={t("novel.overview.totalDuration")}
          value={`${totalDuration.toFixed(1)}s`}
        />
        <StatCard
          icon={Users}
          label={t("novel.overview.characterCount")}
          value={characters.length}
        />
        <StatCard
          icon={MapPin}
          label={t("novel.overview.sceneCount")}
          value={scenes.length}
        />
      </div>

      {/* 故事结构时间轴（仅 professional 模式有数据） */}
      {storyStructure && (
        <section className="card p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <TrendingUp size={11} className="text-primary" />
            <span className="text-[11px] font-medium">
              {t("novel.overview.storyTimeline")}
            </span>
          </div>
          <StoryTimeline structure={storyStructure} />
        </section>
      )}

      {/* 情绪曲线（仅 professional 模式有数据） */}
      {storyStructure && storyStructure.emotionCurve.length > 0 && (
        <section className="card p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Gauge size={11} className="text-primary" />
            <span className="text-[11px] font-medium">
              {t("novel.pacing.emotionCurve")}
            </span>
          </div>
          <EmotionCurveChart
            points={storyStructure.emotionCurve}
            climaxPosition={storyStructure.climaxPosition}
            beats={storyStructure.beats}
            height={100}
            showBeatLabels={false}
          />
        </section>
      )}

      {/* 角色出场分布 + 场景变化节奏（并排） */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <section className="card p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Users size={11} className="text-primary" />
            <span className="text-[11px] font-medium">
              {t("novel.overview.characterAppearance")}
            </span>
          </div>
          <CharacterAppearanceChart
            shots={shots}
            onCharacterClick={onJumpToStage ? () => onJumpToStage("character_manage") : undefined}
          />
        </section>

        <section className="card p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <MapPin size={11} className="text-primary" />
            <span className="text-[11px] font-medium">
              {t("novel.overview.scenePacing")}
            </span>
          </div>
          <ScenePacingChart
            shots={shots}
            scenes={scenes}
            onSceneClick={onJumpToStage ? () => onJumpToStage("scene_manage") : undefined}
          />
        </section>
      </div>

      {/* 分镜密度 */}
      <section className="card p-3">
        <div className="flex items-center gap-1.5 mb-2">
          <Film size={11} className="text-primary" />
          <span className="text-[11px] font-medium">
            {t("novel.overview.shotDensity")}
          </span>
        </div>
        <ShotDensityChart
          shots={shots}
          onShotTypeClick={onJumpToStage ? () => onJumpToStage("storyboard") : undefined}
        />
      </section>
    </div>
  );
}

// ============================================================================
// 主组件
// ============================================================================

export function StoryOverviewPanel({
  state,
  shots,
  storyStructure,
  onExit,
  onJumpToStage,
}: StoryOverviewPanelProps) {
  const segments = state.segments;
  const characters = state.characters;
  const scenes: SceneInPipeline[] = state.scenes;
  const totalShots = shots.length;

  // 空状态：没有足够数据展示
  if (segments.length === 0 && totalShots === 0 && !storyStructure) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <BarChart3 size={14} className="text-primary" />
            <h3 className="text-[13px] font-semibold">{t("novel.overview.title")}</h3>
          </div>
          <button
            type="button"
            onClick={onExit}
            className="btn btn-ghost text-[11px] px-2.5 py-1 flex items-center gap-1"
          >
            <ArrowLeft size={10} />
            {t("novel.overview.exit")}
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <EmptyState
            icon={BarChart3}
            title={t("novel.overview.title")}
            description={t("novel.overview.emptyHint")}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* 顶部标题栏 */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-card/30">
        <div className="flex items-center gap-2">
          <BarChart3 size={14} className="text-primary" />
          <h3 className="text-[13px] font-semibold">{t("novel.overview.title")}</h3>
          <span className="text-[10px] text-muted-foreground">
            {t("novel.overview.subtitle")}
          </span>
        </div>
        <button
          type="button"
          onClick={onExit}
          className="btn btn-ghost text-[11px] px-2.5 py-1 flex items-center gap-1"
          aria-label={t("novel.overview.exit")}
        >
          <ArrowLeft size={10} />
          {t("novel.overview.exit")}
        </button>
      </div>

      {/* 滚动主体 */}
      <OverviewContent
        shots={shots}
        characters={characters}
        scenes={scenes}
        storyStructure={storyStructure}
        onJumpToStage={onJumpToStage}
      />
    </div>
  );
}
