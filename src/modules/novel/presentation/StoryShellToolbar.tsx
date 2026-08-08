/**
 * 故事创作页顶部 — 故事头卡（Story Dashboard Bar）
 *
 * 基于功能自主设计（design-preview 未覆盖此页）：
 * - 左：返回 + 项目名 + 风格徽章
 * - 右：环形完成度 + 关键统计（片段/角色/分镜）+ 「进入分镜编辑器」（已有故事模式）
 *
 * 让用户在一屏内看到"正在创作什么、进行到哪、成果多少"。
 */

import { useNavigate } from "react-router-dom";
import { ArrowLeft, BookOpen, Clapperboard, Film, MapPin, Users, Settings2 } from "lucide-react";
import { t } from "@/shared/constants";

export interface StoryShellToolbarProps {
  /** 项目名（config.projectName） */
  projectName: string;
  /** 风格标签（config.style） */
  style: string;
  /** 当前片段索引 + 1（0 表示无片段） */
  currentSegment: number;
  /** 片段总数（0 表示尚无片段） */
  totalSegments: number;
  /** 分镜总数 */
  shotCount: number;
  /** 已完成分镜数（status === "final"） */
  completedShots: number;
  /** 已提取角色数（含未确认） */
  characterCount: number;
  /** 已有故事模式：提供「进入分镜编辑器」入口 */
  storyId?: string | null;
  /** P2（2026-08-08）：切换 AI 辅助模式（ModeSelector 在已有故事模式下不可达，补入口） */
  onSwitchMode?: () => void;
}

/** 环形完成度指示器 */
function ProgressRing({ percent }: { percent: number }) {
  const radius = 15;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="relative w-10 h-10 shrink-0" title={`${Math.round(clamped)}%`}>
      <svg viewBox="0 0 40 40" className="w-10 h-10 -rotate-90">
        <circle cx="20" cy="20" r={radius} fill="none" stroke="var(--border)" strokeWidth="4" />
        <circle
          cx="20"
          cy="20"
          r={radius}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${(clamped / 100) * circumference} ${circumference}`}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-foreground">
        {Math.round(clamped)}%
      </span>
    </div>
  );
}

export function StoryShellToolbar({
  projectName,
  style,
  currentSegment,
  totalSegments,
  shotCount,
  completedShots,
  characterCount,
  storyId,
  onSwitchMode,
}: StoryShellToolbarProps) {
  const navigate = useNavigate();

  // 完成度：有分镜按分镜完成度，有片段按片段进度，否则 0
  const percent = shotCount > 0
    ? (completedShots / shotCount) * 100
    : totalSegments > 0
      ? (Math.min(currentSegment, totalSegments) / totalSegments) * 100
      : 0;

  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border bg-card/40 shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          className="btn btn-ghost btn-sm shrink-0"
          onClick={() => navigate(-1)}
          aria-label={t("novel.shell.back")}
          title={t("novel.shell.back")}
        >
          <ArrowLeft size={16} />
        </button>
        <div className="home-story-icon w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0">
          <BookOpen size={18} />
        </div>
        <div className="min-w-0">
          <div className="text-[15px] font-bold truncate leading-tight">
            {projectName || t("story.unnamed")}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            {style ? (
              <span className="badge badge-info text-[9px]">{style}</span>
            ) : (
              <span className="text-[11px] text-muted-foreground">{t("novel.shell.awaitingImport")}</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 shrink-0">
        {/* 关键统计 */}
        <div className="hidden md:flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Film size={12} />
            {totalSegments} {t("novel.shell.statSegments")}
          </span>
          <span className="flex items-center gap-1">
            <Users size={12} />
            {characterCount} {t("novel.shell.statCharacters")}
          </span>
          <span className="flex items-center gap-1">
            <MapPin size={12} />
            {shotCount} {t("novel.shell.statShots")}
          </span>
        </div>

        <ProgressRing percent={percent} />

        {onSwitchMode && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onSwitchMode}
            title={t("novel.shell.switchMode")}
          >
            <Settings2 size={14} className="inline-block mr-1" aria-hidden="true" />
            {t("novel.shell.switchMode")}
          </button>
        )}

        {storyId && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => navigate(`/storyboard/${storyId}`)}
          >
            <Clapperboard size={14} className="inline-block mr-1" />
            {t("novel.shell.enterStoryboard")}
          </button>
        )}
      </div>
    </div>
  );
}
