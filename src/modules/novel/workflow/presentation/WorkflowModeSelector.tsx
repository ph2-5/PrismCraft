/**
 * Task 2A.19 — 工作流模式选择器
 *
 * 让用户在 semi-auto（半自动，每步暂停可编辑）和 full-auto（全自动，仅关键节点暂停）之间切换。
 *
 * - 紧凑的按钮组形式，适合嵌入状态栏或工具条
 * - 切换后立即通过 onModeChange 回调上传新模式，由父组件应用
 * - 不丢失已生成内容（持久化由 useNovelPipeline 处理）
 *
 * 与 Task 2A.16 的 ModeSelector 区别：
 * - ModeSelector: 三档 aiAssistLevel（quick/standard/professional）— 决定"用多少 AI"
 * - WorkflowModeSelector: 两档 workflowMode（semi-auto/full-auto）— 决定"AI 执行时是否暂停"
 *
 * 依赖方向：仅依赖 @/shared/constants（i18n）+ 同子域 domain/workflow-mode
 */

import { FastForward, PauseCircle } from "lucide-react";
import { t } from "@/shared/constants";
import type { WorkflowMode } from "../domain/workflow-mode";

export interface WorkflowModeSelectorProps {
  /** 当前模式 */
  mode: WorkflowMode;
  /** 模式切换回调（立即应用） */
  onModeChange: (mode: WorkflowMode) => void;
  /** 是否禁用（如正在生成中，避免中途切换造成状态混乱） */
  disabled?: boolean;
  /** 紧凑模式（用于状态栏底部） */
  compact?: boolean;
}

/** 模式配置 */
interface ModeConfig {
  mode: WorkflowMode;
  icon: typeof FastForward;
  labelKey: string;
  descKey: string;
}

const MODE_CONFIGS: ModeConfig[] = [
  {
    mode: "semi-auto",
    icon: PauseCircle,
    labelKey: "novel.workflow.mode.semiAuto.label",
    descKey: "novel.workflow.mode.semiAuto.desc",
  },
  {
    mode: "full-auto",
    icon: FastForward,
    labelKey: "novel.workflow.mode.fullAuto.label",
    descKey: "novel.workflow.mode.fullAuto.desc",
  },
];

export function WorkflowModeSelector({
  mode,
  onModeChange,
  disabled = false,
  compact = false,
}: WorkflowModeSelectorProps) {
  return (
    <div
      className={[
        "inline-flex items-center gap-0.5 rounded-md border border-border bg-card/30 p-0.5",
        disabled ? "opacity-50 pointer-events-none" : "",
      ].join(" ")}
      role="group"
      aria-label={t("novel.workflow.modeSelector.label")}
    >
      {MODE_CONFIGS.map((config) => {
        const Icon = config.icon;
        const isActive = config.mode === mode;
        return (
          <button
            key={config.mode}
            type="button"
            onClick={() => onModeChange(config.mode)}
            disabled={disabled}
            aria-pressed={isActive}
            title={t(config.descKey)}
            className={[
              "flex items-center gap-1 rounded transition-colors",
              compact ? "px-1.5 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]",
              isActive
                ? "bg-primary text-primary-foreground font-medium"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            ].join(" ")}
          >
            <Icon size={compact ? 10 : 12} />
            <span>{t(config.labelKey)}</span>
          </button>
        );
      })}
    </div>
  );
}
