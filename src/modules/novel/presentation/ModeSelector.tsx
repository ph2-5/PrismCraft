/**
 * Task 2A.16 — 模式选择器
 *
 * 首次进入 /story 路由或点击"切换模式"按钮时显示。
 * 让用户从快速/标准/专业三档模式中选择，降低学习曲线。
 *
 * 选择后通过 onSelect 回调上传 AiAssistLevel，由父组件写入 PipelineConfig。
 *
 * 依赖方向：仅依赖 @/shared/constants（i18n）+ 同模块 domain/types（PipelineConfig）
 */

import { Gauge, Sparkles, Target, Zap } from "lucide-react";
import { t } from "@/shared/constants";
import type { PipelineConfig } from "../domain/types";

export type AiAssistLevel = PipelineConfig["aiAssistLevel"];

export interface ModeSelectorProps {
  /** 选择模式回调 */
  onSelect: (level: AiAssistLevel) => void;
  /** 加载示例项目回调（可选） */
  onLoadSample?: () => void;
}

/** 单个模式卡片配置 */
interface ModeCardConfig {
  level: AiAssistLevel;
  icon: typeof Zap;
  titleKey: string;
  descKey: string;
  stepsKey: string;
  steps: number;
  recommended?: boolean;
  accent: string;
}

const MODE_CARDS: ModeCardConfig[] = [
  {
    level: "quick",
    icon: Zap,
    titleKey: "novel.mode.quick.title",
    descKey: "novel.mode.quick.description",
    stepsKey: "novel.mode.quick.steps",
    steps: 3,
    accent: "border-amber-500/40 hover:border-amber-500",
  },
  {
    level: "standard",
    icon: Sparkles,
    titleKey: "novel.mode.standard.title",
    descKey: "novel.mode.standard.description",
    stepsKey: "novel.mode.standard.steps",
    steps: 6,
    recommended: true,
    accent: "border-primary/50 hover:border-primary",
  },
  {
    level: "professional",
    icon: Target,
    titleKey: "novel.mode.professional.title",
    descKey: "novel.mode.professional.description",
    stepsKey: "novel.mode.professional.steps",
    steps: 8,
    accent: "border-purple-500/40 hover:border-purple-500",
  },
];

function ModeCard({
  config,
  onSelect,
}: {
  config: ModeCardConfig;
  onSelect: (level: AiAssistLevel) => void;
}) {
  const Icon = config.icon;
  return (
    <button
      type="button"
      onClick={() => onSelect(config.level)}
      className={`card p-5 flex flex-col gap-2 text-left transition-all relative ${config.accent}`}
    >
      {config.recommended && (
        <span className="absolute -top-2 right-3 badge badge-success text-[9px] px-1.5 py-0.5">
          {t("novel.mode.recommended")}
        </span>
      )}
      <div className="flex items-center gap-2">
        <Icon size={18} className="text-primary" />
        <span className="text-[14px] font-bold">{t(config.titleKey)}</span>
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed min-h-[3em]">
        {t(config.descKey)}
      </p>
      <div className="flex items-center justify-between pt-2 border-t border-border mt-1">
        <span className="text-[10px] text-muted-foreground">
          {t(config.stepsKey, { n: config.steps })}
        </span>
        <span className="text-[10px] text-primary font-medium">
          {t("novel.mode.select")} →
        </span>
      </div>
    </button>
  );
}

export function ModeSelector({ onSelect, onLoadSample }: ModeSelectorProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-full p-6">
      <div className="w-full max-w-4xl">
        {/* 标题 */}
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Gauge size={20} className="text-primary" />
            <h2 className="text-[16px] font-bold">{t("novel.mode.title")}</h2>
          </div>
          <p className="text-[12px] text-muted-foreground">
            {t("novel.mode.subtitle")}
          </p>
        </div>

        {/* 模式卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
          {MODE_CARDS.map((config) => (
            <ModeCard key={config.level} config={config} onSelect={onSelect} />
          ))}
        </div>

        {/* 加载示例项目入口 */}
        {onLoadSample && (
          <div className="text-center">
            <button
              type="button"
              onClick={onLoadSample}
              className="btn btn-ghost text-[12px] px-4 py-2"
            >
              {t("novel.mode.loadSample")}
            </button>
          </div>
        )}

        {/* 模式对比表 */}
        <div className="card p-3 mt-6 text-[10px] text-muted-foreground">
          <div className="font-medium mb-1.5">{t("novel.mode.comparisonTitle")}</div>
          <div className="grid grid-cols-4 gap-2">
            <div className="font-medium">{t("novel.mode.colMode")}</div>
            <div className="font-medium">{t("novel.mode.colSteps")}</div>
            <div className="font-medium">{t("novel.mode.colControl")}</div>
            <div className="font-medium">{t("novel.mode.colTarget")}</div>
            <div>⚡ {t("novel.mode.quick.title")}</div>
            <div>3</div>
            <div>{t("novel.mode.controlLow")}</div>
            <div>{t("novel.mode.targetBeginner")}</div>
            <div>✨ {t("novel.mode.standard.title")}</div>
            <div>6</div>
            <div>{t("novel.mode.controlMedium")}</div>
            <div>{t("novel.mode.targetRegular")}</div>
            <div>🎯 {t("novel.mode.professional.title")}</div>
            <div>8</div>
            <div>{t("novel.mode.controlHigh")}</div>
            <div>{t("novel.mode.targetPro")}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
