import { useState, useEffect } from "react";
import { usePerformanceMonitor } from "@/shared/utils/performance";
import { BarChart3, Clock, Zap, AlertTriangle, CheckCircle2 } from "lucide-react";
import { t } from "@/shared/constants/messages";

declare global {
  interface Performance {
    memory?: {
      usedJSHeapSize: number;
      totalJSHeapSize: number;
      jsHeapSizeLimit: number;
    };
  }
}

interface PerformanceMetric {
  label: string;
  value: string;
  status: "good" | "warning" | "error";
  icon: React.ReactNode;
}

export function PerformanceMonitorPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [memoryUsage, setMemoryUsage] = useState<number | null>(null);
  const metrics = usePerformanceMonitor(true);

  useEffect(() => {
    if (typeof window !== "undefined" && window.performance && window.performance.memory) {
      const updateMemoryUsage = () => {
        const memory = window.performance.memory;
        if (memory) {
          const usedMB = (memory.usedJSHeapSize / (1024 * 1024)).toFixed(1);
          setMemoryUsage(parseFloat(usedMB));
        }
      };

      updateMemoryUsage();
      const intervalId = setInterval(updateMemoryUsage, 5000);

      return () => clearInterval(intervalId);
    }
  }, []);

  const getPerformanceMetrics = (): PerformanceMetric[] => {
    const metricsList: PerformanceMetric[] = [];

    if (metrics.pageLoadTime !== undefined) {
      const loadTime = metrics.pageLoadTime;
      metricsList.push({
        label: t("perf.pageLoadTime"),
        value: `${loadTime.toFixed(0)}ms`,
        status: loadTime < 2000 ? "good" : loadTime < 4000 ? "warning" : "error",
        icon: <Clock className="w-4 h-4" />
      });
    }

    if (metrics.fcp !== undefined) {
      const fcp = metrics.fcp;
      metricsList.push({
        label: t("perf.fcp"),
        value: `${fcp.toFixed(0)}ms`,
        status: fcp < 1000 ? "good" : fcp < 2000 ? "warning" : "error",
        icon: <CheckCircle2 className="w-4 h-4" />
      });
    }

    if (metrics.lcp !== undefined) {
      const lcp = metrics.lcp;
      metricsList.push({
        label: t("perf.lcp"),
        value: `${lcp.toFixed(0)}ms`,
        status: lcp < 2500 ? "good" : lcp < 4000 ? "warning" : "error",
        icon: <Zap className="w-4 h-4" />
      });
    }

    if (metrics.cls !== undefined) {
      const cls = metrics.cls;
      metricsList.push({
        label: t("perf.cls"),
        value: cls.toFixed(2),
        status: cls < 0.1 ? "good" : cls < 0.25 ? "warning" : "error",
        icon: <AlertTriangle className="w-4 h-4" />
      });
    }

    return metricsList;
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-full shadow-lg hover:bg-primary/90 transition-colors"
      >
        <BarChart3 className="w-4 h-4" />
        <span className="text-sm font-medium">{t("perf.toggle")}</span>
      </button>

      {isOpen && (
        <div className="mt-2 p-4 bg-background border rounded-lg shadow-xl max-w-md">
          <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            {t("perf.title")}
          </h3>

          <div className="space-y-2">
            {getPerformanceMetrics().map((metric, index) => (
              <div key={metric.label || index} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`${
                    metric.status === "good" ? "text-success" :
                    metric.status === "warning" ? "text-warning" :
                    "text-destructive"
                  }`}>
                    {metric.icon}
                  </span>
                  <span className="text-xs text-muted-foreground">{metric.label}</span>
                </div>
                <span className={`text-sm font-medium ${
                  metric.status === "good" ? "text-success" :
                  metric.status === "warning" ? "text-warning" :
                  "text-destructive"
                }`}>
                  {metric.value}
                </span>
              </div>
            ))}

            {memoryUsage !== null && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4" style={{ color: "var(--primary)" }} />
                  <span className="text-xs text-muted-foreground">{t("perf.memoryUsage")}</span>
                </div>
                <span className="text-sm font-medium" style={{ color: "var(--primary)" }}>
                  {memoryUsage}MB
                </span>
              </div>
            )}
          </div>

          <button
            onClick={() => setIsOpen(false)}
            className="mt-4 w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {t("ui.close")}
          </button>
        </div>
      )}
    </div>
  );
}
