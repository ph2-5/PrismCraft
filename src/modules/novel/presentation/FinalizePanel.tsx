/**
 * Task 2A.5 — 最终确认导入面板
 *
 * 显示管道产出的汇总信息：
 * - 段落数 / 角色数 / 场景数 / 分镜数 / 提示词数
 * - 预计总时长
 *
 * 底部显示"导入到故事板"按钮，点击后触发 onImport。
 */

import { useMemo } from "react";
import { FileText, Users, MapPin, Film, Sparkles, Clock, CheckCircle2, Loader2 } from "lucide-react";
import type { PipelineState } from "../domain/types";

export interface FinalizeSummary {
  segmentCount: number;
  characterCount: number;
  sceneCount: number;
  shotCount: number;
  promptCount: number;
  estimatedTotalDuration: number;
}

export interface FinalizePanelProps {
  state: PipelineState;
  onImport: () => void;
  isImporting: boolean;
}

/** 从 PipelineState 计算 FinalizeSummary */
function computeSummary(state: PipelineState): FinalizeSummary {
  return {
    segmentCount: state.segments.length,
    characterCount: state.characters.filter((c) => c.confirmed).length,
    sceneCount: state.scenes.filter((s) => s.confirmed).length,
    shotCount: state.segments.reduce(
      (sum, seg) => sum + (("shots" in seg && Array.isArray((seg as { shots?: unknown[] }).shots)) ? (seg as { shots: unknown[] }).shots.length : 0),
      0,
    ),
    promptCount: state.prompts.length,
    estimatedTotalDuration: state.segments.reduce(
      (sum, seg) => sum + seg.estimatedDuration,
      0,
    ),
  };
}

export function FinalizePanel({ state, onImport, isImporting }: FinalizePanelProps) {
  const summary = useMemo(() => computeSummary(state), [state]);

  const items = [
    { icon: FileText, label: "段落", value: summary.segmentCount, color: "text-foreground" },
    { icon: Users, label: "角色", value: summary.characterCount, color: "text-foreground" },
    { icon: MapPin, label: "场景", value: summary.sceneCount, color: "text-foreground" },
    { icon: Film, label: "分镜", value: summary.shotCount, color: "text-foreground" },
    { icon: Sparkles, label: "提示词", value: summary.promptCount, color: "text-foreground" },
  ];

  return (
    <div className="flex flex-col items-center justify-center max-w-2xl mx-auto w-full py-6">
      {/* 完成图标 */}
      <div className="w-16 h-16 rounded-full bg-[rgba(var(--primary-rgb),0.1)] flex items-center justify-center mb-4">
        {isImporting ? (
          <Loader2 size={28} className="text-[var(--primary)] animate-spin" />
        ) : (
          <CheckCircle2 size={28} className="text-[var(--primary)]" />
        )}
      </div>

      {/* 标题 */}
      <h2 className="text-base font-bold mb-1">
        {isImporting ? "正在导入..." : "管道完成 — 确认导入"}
      </h2>
      <p className="text-[11px] text-muted-foreground mb-5 text-center">
        {isImporting
          ? "正在将管道产出导入故事板，请稍候"
          : "以下是将要导入到故事板的内容汇总"}
      </p>

      {/* 汇总卡片 */}
      <div className="card p-4 w-full mb-4">
        <div className="grid grid-cols-5 gap-2">
          {items.map((item) => (
            <div key={item.label} className="flex flex-col items-center text-center">
              <div className="w-8 h-8 rounded-full bg-[rgba(var(--primary-rgb),0.06)] flex items-center justify-center mb-1">
                <item.icon size={13} className="text-[var(--primary)]" />
              </div>
              <div className={`text-[18px] font-bold ${item.color}`}>{item.value}</div>
              <div className="text-[10px] text-muted-foreground">{item.label}</div>
            </div>
          ))}
        </div>

        {/* 预计总时长 */}
        <div className="mt-3 pt-3 border-t border-border flex items-center justify-center gap-1.5 text-[11px]">
          <Clock size={11} className="text-muted-foreground" />
          <span className="text-muted-foreground">预计总时长：</span>
          <span className="font-bold text-foreground">
            {Math.floor(summary.estimatedTotalDuration / 60)}分{Math.round(summary.estimatedTotalDuration % 60)}秒
          </span>
        </div>
      </div>

      {/* 项目信息 */}
      {state.config.projectName && (
        <div className="text-[11px] text-muted-foreground mb-4">
          项目：{state.config.projectName} · 风格：{state.config.style || "默认"}
        </div>
      )}

      {/* 操作按钮 */}
      {!isImporting && (
        <button
          type="button"
          onClick={onImport}
          className="btn btn-primary text-[13px] px-6 py-2 flex items-center gap-2"
          aria-label="导入到故事板"
        >
          <CheckCircle2 size={14} />
          导入到故事板
        </button>
      )}
    </div>
  );
}
