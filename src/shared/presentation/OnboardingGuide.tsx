"use client";

import { useState } from "react";
import { Button } from "@/shared/ui/button";
import { X, ChevronRight, Lightbulb } from "lucide-react";

interface GuideStep {
  id: string;
  title: string;
  description: string;
  element?: string;
  position?: "top" | "bottom" | "left" | "right";
}

const ONBOARDING_STEPS: GuideStep[] = [
  {
    id: "welcome",
    title: "欢迎使用 AI 动画工作室",
    description: "这是一个强大的动画生成工具，让我们快速了解一下主要功能。",
  },
  {
    id: "create-story",
    title: "创建你的第一个故事",
    description: "点击顶部的新建按钮开始创建你的动画项目。",
  },
  {
    id: "add-beats",
    title: "添加分镜",
    description: "为每个场景添加关键分镜，这是动画的基础。",
  },
  {
    id: "generate-video",
    title: "生成视频",
    description: "选择视频模型并一键生成精彩的动画视频。",
  },
];

const GUIDE_KEY = "ai-animation-studio-onboarding-complete";

export function OnboardingGuide() {
  const [showGuide, setShowGuide] = useState(() => {
    if (typeof window === 'undefined') return false;
    return !localStorage.getItem(GUIDE_KEY);
  });
  const [currentStep, setCurrentStep] = useState(0);

  const completeGuide = () => {
    localStorage.setItem(GUIDE_KEY, "true");
    setShowGuide(false);
  };

  const nextStep = () => {
    if (currentStep < ONBOARDING_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      completeGuide();
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  if (!showGuide) return null;

  const step = ONBOARDING_STEPS[currentStep];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-800 rounded-xl shadow-2xl p-6 max-w-md w-full mx-4 border border-gray-700">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="bg-blue-500/20 p-3 rounded-lg">
              <Lightbulb className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">{step.title}</h3>
              <p className="text-sm text-gray-400 mt-1">
                {step.description}
              </p>
            </div>
          </div>
          <button
            onClick={completeGuide}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-2 mb-6">
          {ONBOARDING_STEPS.map((_, index) => (
            <div
              key={index}
              className={`flex-1 h-1 rounded-full transition-colors ${
                index <= currentStep ? "bg-blue-500" : "bg-gray-600"
              }`}
            />
          ))}
        </div>

        <div className="flex justify-between gap-3">
          {currentStep > 0 && (
            <Button variant="outline" onClick={prevStep} className="flex-1">
              上一步
            </Button>
          )}
          <Button
            onClick={nextStep}
            className="flex-1"
          >
            {currentStep === ONBOARDING_STEPS.length - 1
              ? "开始使用"
              : "下一步"}
            <ChevronRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function resetOnboarding() {
  localStorage.removeItem(GUIDE_KEY);
}
