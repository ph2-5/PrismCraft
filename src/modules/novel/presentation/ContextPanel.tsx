/**
 * Task 2A.6 — ContextPanel 右栏上下文面板（280px）
 *
 * 显示项目相关的上下文信息：
 * 1. 项目设置（只读）：风格 / 格式 / AI 模型 / 模式 / AI 助手等级
 * 2. 统计：角色数 / 场景数 / 片段数 / 分镜数 / 提示词数
 * 3. 重要性排序：P0/P1/P2/P3 角色列表
 *
 * 所有字段为只读展示，编辑通过 MainWorkArea 的对应阶段完成。
 */

import { useMemo } from "react";
import { Settings, BarChart3, Trophy } from "lucide-react";
import { t } from "@/shared/constants";
import type { PipelineState, CharacterInPipeline } from "../domain/types";

export interface ContextPanelProps {
  state: PipelineState;
  shotCount: number;
}

/** 重要性等级标签 */
const IMPORTANCE_LABELS: Record<string, string> = {
  P0: "P0",
  P1: "P1",
  P2: "P2",
  P3: "P3",
};

/** 重要性等级颜色 */
const IMPORTANCE_COLORS: Record<string, string> = {
  P0: "bg-red-500/15 text-red-600 border-red-500/30",
  P1: "bg-orange-500/15 text-orange-600 border-orange-500/30",
  P2: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30",
  P3: "bg-gray-500/15 text-gray-600 border-gray-500/30",
};

export function ContextPanel({ state, shotCount }: ContextPanelProps) {
  // 统计
  const stats = useMemo(() => {
    const confirmedChars = state.characters.filter((c) => c.confirmed).length;
    const confirmedScenes = state.scenes.filter((s) => s.confirmed).length;
    return {
      characters: state.characters.length,
      confirmedCharacters: confirmedChars,
      scenes: state.scenes.length,
      confirmedScenes: confirmedScenes,
      segments: state.segments.length,
      shots: shotCount,
      prompts: state.prompts.length,
    };
  }, [state.characters, state.scenes, state.segments, state.prompts, shotCount]);

  // 按重要性排序的角色（P0 → P3，未分级排最后）
  const sortedCharacters = useMemo(() => {
    const importanceOrder: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
    return [...state.characters].sort((a: CharacterInPipeline, b: CharacterInPipeline) => {
      const aOrder = a.importance !== undefined ? importanceOrder[a.importance] ?? 4 : 4;
      const bOrder = b.importance !== undefined ? importanceOrder[b.importance] ?? 4 : 4;
      return aOrder - bOrder;
    });
  }, [state.characters]);

  return (
    <aside
      className="w-[280px] shrink-0 border-l border-border bg-card/20 flex flex-col overflow-hidden"
      aria-label={t("novel.shell.contextPanel")}
    >
      <div className="flex-1 overflow-y-auto">
        {/* 项目设置 */}
        <section className="px-4 py-3 border-b border-border">
          <div className="flex items-center gap-1.5 mb-2">
            <Settings size={12} className="text-muted-foreground" />
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {t("novel.shell.projectSettings")}
            </div>
          </div>
          <dl className="space-y-1.5 text-[12px]">
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground shrink-0">{t("novel.shell.style")}</dt>
              <dd className="text-foreground text-right truncate">
                {state.config.style || "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground shrink-0">{t("novel.shell.format")}</dt>
              <dd className="text-foreground text-right truncate">
                {state.config.format || "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground shrink-0">{t("novel.shell.model")}</dt>
              <dd className="text-foreground text-right truncate">
                {state.config.aiModel || "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground shrink-0">{t("novel.shell.mode")}</dt>
              <dd className="text-foreground text-right">
                {state.config.mode === "auto" ? t("novel.shell.modeAuto") : t("novel.shell.modeSemi")}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground shrink-0">{t("novel.shell.aiAssistLevel")}</dt>
              <dd className="text-foreground text-right">
                {t(`novel.shell.assistLevel.${state.config.aiAssistLevel}` as Parameters<typeof t>[0])}
              </dd>
            </div>
          </dl>
        </section>

        {/* 统计 */}
        <section className="px-4 py-3 border-b border-border">
          <div className="flex items-center gap-1.5 mb-2">
            <BarChart3 size={12} className="text-muted-foreground" />
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {t("novel.shell.statistics")}
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t("novel.shell.characters")}</dt>
              <dd className="text-foreground font-medium">
                {stats.confirmedCharacters}/{stats.characters}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t("novel.shell.scenes")}</dt>
              <dd className="text-foreground font-medium">
                {stats.confirmedScenes}/{stats.scenes}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t("novel.shell.segments")}</dt>
              <dd className="text-foreground font-medium">{stats.segments}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t("novel.shell.shots")}</dt>
              <dd className="text-foreground font-medium">{stats.shots}</dd>
            </div>
            <div className="flex justify-between col-span-2">
              <dt className="text-muted-foreground">{t("novel.shell.prompts")}</dt>
              <dd className="text-foreground font-medium">{stats.prompts}</dd>
            </div>
          </dl>
        </section>

        {/* 重要性排序 */}
        <section className="px-4 py-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Trophy size={12} className="text-muted-foreground" />
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {t("novel.shell.importance")}
            </div>
          </div>
          {sortedCharacters.length === 0 ? (
            <div className="text-[11px] text-muted-foreground/70 py-2 text-center">
              {t("novel.shell.emptyCharacters")}
            </div>
          ) : (
            <ul className="space-y-1 text-[12px]">
              {sortedCharacters.map((c: CharacterInPipeline) => {
                const importance = c.importance ?? "P3";
                const label = IMPORTANCE_LABELS[importance] ?? "—";
                const colorClass = IMPORTANCE_COLORS[importance] ?? IMPORTANCE_COLORS.P3;
                return (
                  <li key={c.tempId} className="flex items-center gap-2">
                    <span
                      className={[
                        "shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold border",
                        colorClass,
                      ].join(" ")}
                    >
                      {label}
                    </span>
                    <span className="truncate text-foreground">{c.name}</span>
                    {c.confirmed && (
                      <span className="ml-auto text-[10px] text-muted-foreground">✓</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </aside>
  );
}
