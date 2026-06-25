import { useState, useEffect, useRef, useCallback } from "react";
import { X, Sparkles, Settings, Image as ImageIcon, Video, FileText } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { errorLogger } from "@/shared/error-logger";
import { useNavigationGuard } from "./BeforeUnloadGuard";
import { checkConfigStatus } from "@/shared/api-config";
import { usePreference } from "@/shared/utils/preferences";
import { t } from "@/shared/constants";

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
    title: t("onboarding.welcomeStudioTitle"),
    description: t("onboarding.welcomeStudioDesc"),
    icon: <Sparkles className="h-8 w-8" style={{ color: "var(--warning)" }} />,
  },
  {
    title: t("onboarding.configApiKeyTitle"),
    description: t("onboarding.configApiKeyDesc"),
    icon: <Settings className="h-8 w-8" style={{ color: "var(--primary)" }} />,
    action: {
      label: t("onboarding.goToSettings"),
      href: "/settings",
    },
  },
  {
    title: t("onboarding.createCharTitle"),
    description: t("onboarding.createCharDesc"),
    icon: <FileText className="h-8 w-8" style={{ color: "var(--success)" }} />,
    action: {
      label: t("onboarding.createCharTitle"),
      href: "/characters",
    },
  },
  {
    title: t("onboarding.designSceneTitle"),
    description: t("onboarding.designSceneDesc"),
    icon: <ImageIcon className="h-8 w-8 text-purple-500" />,
    action: {
      label: t("onboarding.designScene"),
      href: "/scenes",
    },
  },
  {
    title: t("onboarding.genVideoTitle"),
    description: t("onboarding.genVideoDesc"),
    icon: <Video className="h-8 w-8" style={{ color: "var(--destructive)" }} />,
    action: {
      label: t("onboarding.startCreate"),
      href: "/storyboard",
    },
  },
];

const ONBOARDING_KEY = "onboarding-completed";

export function OnboardingGuide() {
  const [completed, setCompleted] = usePreference<boolean>(ONBOARDING_KEY, false);
  const [currentStep, setCurrentStep] = useState(0);
  const { guardedPush } = useNavigationGuard();
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (navTimerRef.current) {
        clearTimeout(navTimerRef.current);
      }
    };
  }, []);

  const handleClose = useCallback(() => {
    setCompleted(true);
  }, [setCompleted]);

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleActionClick = (href: string) => {
    handleClose();
    navTimerRef.current = setTimeout(() => {
      guardedPush(href);
    }, 100);
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

  if (completed) return null;

  const step = ONBOARDING_STEPS[currentStep]!;
  const isLastStep = currentStep === ONBOARDING_STEPS.length - 1;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background border rounded-xl shadow-xl max-w-md w-full p-6 relative">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 hover:text-foreground transition-colors"
          style={{ color: "var(--muted-fg)" }}
          aria-label={t("aria.close")}
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex flex-col items-center text-center">
          <div className="mb-4">{step.icon}</div>
          <h2 className="text-xl font-semibold mb-2" style={{ color: "var(--muted-fg)" }}>
            {step.title}
          </h2>
          <p className="mb-6" style={{ color: "var(--muted-fg)" }}>{step.description}</p>

          <div className="flex gap-2 mb-6">
            {ONBOARDING_STEPS.map((step, index) => (
              <button
                key={step.title}
                onClick={() => setCurrentStep(index)}
                className={`h-3 w-3 rounded-full transition-colors cursor-pointer ${
                  index === currentStep
                    ? "bg-primary"
                    : index < currentStep
                      ? "bg-primary/60"
                      : "bg-muted"
                }`}
              />
            ))}
          </div>

          <div className="flex gap-3 w-full">
            {currentStep > 0 && (
              <Button variant="outline" onClick={handlePrev}>
                {t("onboarding.prevStep")}
              </Button>
            )}
            {step.action ? (
              <Button
                className="flex-1"
                onClick={() => step.action && handleActionClick(step.action.href)}
              >
                {step.action.label}
              </Button>
            ) : (
              <Button onClick={handleNext} className="flex-1">
                {isLastStep ? t("onboarding.finish") : t("onboarding.nextStep")}
              </Button>
            )}
            {!isLastStep && (
              <Button variant="outline" onClick={handleSkip}>
                {t("onboarding.skip")}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ApiKeyAlert() {
  const [isVisible, setIsVisible] = useState(false);
  const { guardedPush } = useNavigationGuard();

  useEffect(() => {
    let cancelled = false;
    checkConfigStatus()
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
        <Sparkles className="h-5 w-5 mt-0.5" style={{ color: "var(--warning)" }} />
        <div className="flex-1">
          <h4 className="font-medium text-yellow-300">{t("onboarding.apiKeyNotConfigured")}</h4>
          <p className="text-sm mt-1" style={{ color: "var(--warning)" }}>
            {t("onboarding.apiKeyNotConfiguredDesc")}
          </p>
          <button
            onClick={() => guardedPush("/settings")}
            className="inline-flex items-center gap-1 text-sm font-medium text-yellow-300 hover:text-yellow-200 mt-2 underline"
          >
            {t("onboarding.goToSettingsLink")} <Settings className="h-3 w-3" />
          </button>
        </div>
        <button
          onClick={() => setIsVisible(false)}
          className="hover:text-warning"
          style={{ color: "var(--warning)" }}
          aria-label={t("aria.close")}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
