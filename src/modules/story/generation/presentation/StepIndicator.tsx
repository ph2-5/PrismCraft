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
                    ? "bg-success/20 text-success"
                    : isActive
                      ? "bg-primary/20"
                      : "bg-muted text-muted-foreground"
                }`}
                style={!isCompleted && isActive ? { color: "var(--primary)" } : undefined}
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
                    ? "text-success"
                    : isActive
                      ? ""
                      : isPending
                        ? "text-muted-foreground"
                        : "text-muted-foreground"
                }`}
                style={!isCompleted && isActive ? { color: "var(--primary)" } : undefined}
              >
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div
                className={`flex-1 h-px mx-2 ${
                  isCompleted ? "bg-success/30" : "bg-muted"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
