import { CheckCircle, Loader2 } from "lucide-react";

interface StepInfo {
  id: string;
  label: string;
  completed: boolean;
}

interface StepIndicatorProps {
  steps: StepInfo[];
  activeStep: number;
  isGenerating: boolean;
}

export function StepIndicator({
  steps,
  activeStep,
  isGenerating,
}: StepIndicatorProps) {
  return (
    <div className="flex items-center gap-1">
      {steps.map((step, index) => {
        const isActive = index === activeStep;
        const isCompleted = step.completed;
        const isPending = index > activeStep;
        const isGeneratingStep = isActive && isGenerating;

        return (
          <div key={step.id} className="flex items-center gap-1 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 ${
                  isCompleted
                    ? "bg-emerald-500/20 text-emerald-400"
                    : isActive
                      ? "bg-blue-500/20 text-blue-400"
                      : "bg-slate-700/50 text-slate-500"
                }`}
              >
                {isGeneratingStep ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : isCompleted ? (
                  <CheckCircle className="w-3.5 h-3.5" />
                ) : (
                  index + 1
                )}
              </div>
              <span
                className={`text-xs truncate ${
                  isCompleted
                    ? "text-emerald-400"
                    : isActive
                      ? "text-blue-400"
                      : isPending
                        ? "text-slate-500"
                        : "text-slate-300"
                }`}
              >
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div
                className={`flex-1 h-px mx-2 ${
                  isCompleted ? "bg-emerald-500/30" : "bg-slate-700"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
