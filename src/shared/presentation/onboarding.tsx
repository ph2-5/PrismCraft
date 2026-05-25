"use client";

import { useState, useEffect, useRef } from "react";
import { X, Sparkles, Settings, Image as ImageIcon, Video, FileText } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { errorLogger } from "@/shared/error-logger";
import { useRouter } from "next/navigation";

interface OnboardingStep {
  title: string;
  description: string;
  icon: React.ReactNode;
  action?: {
    label: string;
    href: string;
  };
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    title: "欢迎使用 AI Animation Studio",
    description:
      "这是一个 AI 驱动的动画创作工具，帮助你快速创建角色、场景和动画视频。",
    icon: <Sparkles className="h-8 w-8 text-yellow-500" />,
  },
  {
    title: "配置 API Key",
    description:
      "首先需要配置 AI 服务的 API Key。支持火山引擎、OpenAI、Kimi 等多个提供商。",
    icon: <Settings className="h-8 w-8 text-blue-500" />,
    action: {
      label: "去设置",
      href: "/settings",
    },
  },
  {
    title: "创建角色",
    description: "在角色页面，你可以创建动画角色，使用 AI 生成角色形象。",
    icon: <FileText className="h-8 w-8 text-green-500" />,
    action: {
      label: "创建角色",
      href: "/characters",
    },
  },
  {
    title: "设计场景",
    description: "在场景页面设计动画场景，设置氛围、光照等参数。",
    icon: <ImageIcon className="h-8 w-8 text-purple-500" />,
    action: {
      label: "设计场景",
      href: "/scenes",
    },
  },
  {
    title: "生成视频",
    description: "在故事页面编排镜头，一键生成 AI 动画视频。",
    icon: <Video className="h-8 w-8 text-red-500" />,
    action: {
      label: "开始创作",
      href: "/story",
    },
  },
];

export function OnboardingGuide() {
  const [isVisible, setIsVisible] = useState(() => {
    if (typeof window === 'undefined') return false;
    return !localStorage.getItem("onboarding-completed");
  });
  const [currentStep, setCurrentStep] = useState(0);
  const router = useRouter();
  const navTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (navTimerRef.current) {
        clearTimeout(navTimerRef.current);
      }
    };
  }, []);

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleActionClick = (href: string) => {
    handleClose();
    navTimerRef.current = setTimeout(() => {
      router.push(href);
    }, 100);
  };

  const handleClose = () => {
    setIsVisible(false);
    localStorage.setItem("onboarding-completed", "true");
  };

  const handleNext = () => {
    if (currentStep < ONBOARDING_STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      handleClose();
    }
  };

  const handleSkip = () => {
    handleClose();
  };

  if (!isVisible) return null;

  const step = ONBOARDING_STEPS[currentStep];
  const isLastStep = currentStep === ONBOARDING_STEPS.length - 1;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background border rounded-xl shadow-xl max-w-md w-full p-6 relative">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex flex-col items-center text-center">
          <div className="mb-4">{step.icon}</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            {step.title}
          </h2>
          <p className="text-gray-600 mb-6">{step.description}</p>

          {/* 进度指示器 */}
          <div className="flex gap-2 mb-6">
            {ONBOARDING_STEPS.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentStep(index)}
                className={`h-3 w-3 rounded-full transition-colors cursor-pointer ${
                  index === currentStep
                    ? "bg-blue-500"
                    : index < currentStep
                      ? "bg-blue-300"
                      : "bg-gray-200"
                }`}
              />
            ))}
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-3 w-full">
            {currentStep > 0 && (
              <Button variant="outline" onClick={handlePrev}>
                上一步
              </Button>
            )}
            {step.action ? (
              <Button
                className="flex-1"
                onClick={() => handleActionClick(step.action!.href)}
              >
                {step.action.label}
              </Button>
            ) : (
              <Button onClick={handleNext} className="flex-1">
                {isLastStep ? "完成" : "下一步"}
              </Button>
            )}
            {!isLastStep && (
              <Button variant="outline" onClick={handleSkip}>
                跳过
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// API Key 缺失提示
export function ApiKeyAlert() {
  const [isVisible, setIsVisible] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/config")
      .then((res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((data) => {
        if (!data || cancelled) return;
        const hasConfig =
          data.text?.configured ||
          data.image?.configured ||
          data.video?.configured;
        if (!hasConfig) {
          setIsVisible(true);
        }
      })
      .catch((e) => {
        errorLogger.warn("[ApiKeyAlert] Failed to check API config", e);
      });
    return () => { cancelled = true; };
  }, []);

  if (!isVisible) return null;

  return (
    <div className="bg-yellow-900/20 border border-yellow-800 rounded-lg p-4 mb-4">
      <div className="flex items-start gap-3">
        <Sparkles className="h-5 w-5 text-yellow-400 mt-0.5" />
        <div className="flex-1">
          <h4 className="font-medium text-yellow-300">API Key 未配置</h4>
          <p className="text-sm text-yellow-400 mt-1">
            你还没有配置 AI 服务的 API Key。部分功能可能无法正常使用。
          </p>
          <button
            onClick={() => router.push("/settings")}
            className="inline-flex items-center gap-1 text-sm font-medium text-yellow-300 hover:text-yellow-200 mt-2 underline"
          >
            去设置 <Settings className="h-3 w-3" />
          </button>
        </div>
        <button
          onClick={() => setIsVisible(false)}
          className="text-yellow-400 hover:text-yellow-300"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
