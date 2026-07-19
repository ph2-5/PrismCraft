/**
 * Task 2A.16 — 新手引导
 *
 * 首次进入 /story 路由时显示（localStorage 标记 novel_onboarding_completed）。
 * 4 步引导：
 *   1. 选择模式（快速/标准/专业）
 *   2. 导入故事文本
 *   3. AI 处理（等待动画 + 说明）
 *   4. 编辑分镜（高亮关键按钮）
 *
 * 提供"跳过引导"和"加载示例项目"两个入口。
 *
 * 依赖方向：仅依赖 @/shared/constants（i18n）
 */

import { useState } from "react";
import { ArrowRight, Check, X, Sparkles, FileText, Cpu, Edit } from "lucide-react";
import { t } from "@/shared/constants";

export interface OnboardingGuideProps {
  /** 完成引导回调（标记 localStorage 并关闭） */
  onComplete: () => void;
  /** 跳过引导回调（与 onComplete 行为一致，但可能用于埋点区分） */
  onSkip: () => void;
  /** 加载示例项目回调 */
  onLoadSample?: () => void;
}

/** 引导步骤配置 */
interface StepConfig {
  icon: typeof Sparkles;
  titleKey: string;
  descKey: string;
}

const STEPS: StepConfig[] = [
  {
    icon: Sparkles,
    titleKey: "novel.onboarding.step1Title",
    descKey: "novel.onboarding.step1Desc",
  },
  {
    icon: FileText,
    titleKey: "novel.onboarding.step2Title",
    descKey: "novel.onboarding.step2Desc",
  },
  {
    icon: Cpu,
    titleKey: "novel.onboarding.step3Title",
    descKey: "novel.onboarding.step3Desc",
  },
  {
    icon: Edit,
    titleKey: "novel.onboarding.step4Title",
    descKey: "novel.onboarding.step4Desc",
  },
];

export function OnboardingGuide({
  onComplete,
  onSkip,
  onLoadSample,
}: OnboardingGuideProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const step = STEPS[currentStep]!;
  const Icon = step.icon;
  const isLastStep = currentStep === STEPS.length - 1;

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      onClick={onSkip}
    >
      <div
        className="modal max-w-md w-[calc(100vw-2rem)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部：标题 + 关闭 */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-primary" />
            <h3 className="text-[13px] font-semibold">{t("novel.onboarding.title")}</h3>
          </div>
          <button
            type="button"
            onClick={onSkip}
            className="btn btn-ghost p-1"
            aria-label={t("novel.onboarding.skip")}
          >
            <X size={12} />
          </button>
        </div>

        {/* 主体：当前步骤内容 */}
        <div className="p-6 flex flex-col items-center text-center gap-3">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Icon size={20} className="text-primary" />
          </div>
          <h4 className="text-[14px] font-bold">{t(step.titleKey)}</h4>
          <p className="text-[11px] text-muted-foreground leading-relaxed max-w-xs">
            {t(step.descKey)}
          </p>
        </div>

        {/* 步骤指示器 */}
        <div className="flex items-center justify-center gap-1.5 pb-3">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === currentStep
                  ? "w-6 bg-primary"
                  : i < currentStep
                    ? "w-1.5 bg-primary/60"
                    : "w-1.5 bg-muted"
              }`}
            />
          ))}
        </div>

        {/* 底部：操作按钮 */}
        <div className="flex items-center justify-between gap-2 p-4 border-t border-border">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSkip}
              className="btn btn-ghost text-[11px] px-2.5 py-1"
            >
              {t("novel.onboarding.skip")}
            </button>
            {onLoadSample && currentStep === 0 && (
              <button
                type="button"
                onClick={onLoadSample}
                className="btn btn-ghost text-[11px] px-2.5 py-1"
              >
                {t("novel.onboarding.loadSample")}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {currentStep > 0 && (
              <button
                type="button"
                onClick={handlePrev}
                className="btn btn-ghost text-[11px] px-2.5 py-1"
              >
                {t("novel.onboarding.prev")}
              </button>
            )}
            <button
              type="button"
              onClick={handleNext}
              className="btn btn-primary text-[11px] px-3 py-1 flex items-center gap-1"
            >
              {isLastStep ? (
                <>
                  <Check size={10} />
                  {t("novel.onboarding.finish")}
                </>
              ) : (
                <>
                  {t("novel.onboarding.next")}
                  <ArrowRight size={10} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
