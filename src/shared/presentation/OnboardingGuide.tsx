import { useState, useCallback } from "react";
import { Button } from "@/shared/ui/button";
import { X, ChevronRight, Lightbulb } from "lucide-react";
import { usePreference, preferencesStorage } from "@/shared/utils/preferences";
import { t } from "@/shared/constants";

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
    title: t("onboarding.welcomeTitle"),
    description: t("onboarding.welcomeDesc"),
  },
  {
    id: "create-story",
    title: t("onboarding.createStoryTitle"),
    description: t("onboarding.createStoryDesc"),
  },
  {
    id: "add-beats",
    title: t("onboarding.addBeatsTitle"),
    description: t("onboarding.addBeatsDesc"),
  },
  {
    id: "generate-video",
    title: t("onboarding.generateVideoTitle"),
    description: t("onboarding.generateVideoDesc"),
  },
];

const GUIDE_KEY = "ai-animation-studio-onboarding-complete";

export function OnboardingGuide() {
  const [completed, setCompleted] = usePreference<boolean>(GUIDE_KEY, false);
  const [currentStep, setCurrentStep] = useState(0);

  const completeGuide = useCallback(() => {
    setCompleted(true);
  }, [setCompleted]);

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

  if (completed) return null;

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
          {ONBOARDING_STEPS.map((step, index) => (
            <div
              key={step.id}
              className={`flex-1 h-1 rounded-full transition-colors ${
                index <= currentStep ? "bg-blue-500" : "bg-gray-600"
              }`}
            />
          ))}
        </div>

        <div className="flex justify-between gap-3">
          {currentStep > 0 && (
            <Button variant="outline" onClick={prevStep} className="flex-1">
              {t("onboarding.prevStep")}
            </Button>
          )}
          <Button
            onClick={nextStep}
            className="flex-1"
          >
            {currentStep === ONBOARDING_STEPS.length - 1
              ? t("onboarding.startUsing")
              : t("onboarding.nextStep")}
            <ChevronRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function resetOnboarding() {
  preferencesStorage.remove(GUIDE_KEY);
}
