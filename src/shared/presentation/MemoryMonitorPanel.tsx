import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { Progress } from "@/shared/ui/progress";
import { Badge } from "@/shared/ui/badge";
import { useMemoryMonitor } from "@/shared/hooks/use-memory-monitor";
import { Trash2, AlertCircle, CheckCircle, AlertTriangle } from "lucide-react";
import { t } from "@/shared/constants/messages";

interface MemoryMonitorPanelProps {
  clearErrorLogs?: () => Promise<void>;
}

export function MemoryMonitorPanel({ clearErrorLogs }: MemoryMonitorPanelProps) {
  const { memory, warningLevel, manualCleanup, thresholds: _thresholds } = useMemoryMonitor({ clearErrorLogs });

  if (!memory) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("memory.title")}</CardTitle>
          <CardDescription>{t("memory.notSupported")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const usagePercent = Math.round((memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100);

  const getStatusBadge = () => {
    switch (warningLevel) {
      case "high":
        return (
          <Badge variant="destructive" className="gap-1">
            <AlertCircle className="w-3 h-3" />
            {t("memory.statusHigh")}
          </Badge>
        );
      case "medium":
        return (
          <Badge variant="default" className="bg-warning gap-1">
            <AlertTriangle className="w-3 h-3" />
            {t("memory.statusMedium")}
          </Badge>
        );
      case "low":
        return (
          <Badge variant="outline" className="text-warning border-warning gap-1">
            <AlertTriangle className="w-3 h-3" />
            {t("memory.statusLow")}
          </Badge>
        );
      default:
        return (
          <Badge variant="default" className="bg-success gap-1">
            <CheckCircle className="w-3 h-3" />
            {t("memory.statusNormal")}
          </Badge>
        );
    }
  };

  const getProgressColor = () => {
    switch (warningLevel) {
      case "high":
        return "bg-destructive";
      case "medium":
        return "bg-warning";
      case "low":
        return "bg-warning";
      default:
        return "bg-success";
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              {t("memory.title")}
            </CardTitle>
            <CardDescription>{t("memory.monitorDesc")}</CardDescription>
          </div>
          {getStatusBadge()}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t("memory.used")}</span>
            <span className="font-medium">{usagePercent}%</span>
          </div>
          <Progress 
            value={usagePercent} 
            className={`h-2 ${getProgressColor()}`}
          />
        </div>

        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-xs text-muted-foreground">{t("memory.used")}</p>
            <p className="text-lg font-semibold">{memory.usedJSHeapSize}</p>
            <p className="text-xs text-muted-foreground">MB</p>
          </div>
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-xs text-muted-foreground">{t("memory.totalAllocated")}</p>
            <p className="text-lg font-semibold">{memory.totalJSHeapSize}</p>
            <p className="text-xs text-muted-foreground">MB</p>
          </div>
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-xs text-muted-foreground">{t("memory.limit")}</p>
            <p className="text-lg font-semibold">{memory.jsHeapSizeLimit}</p>
            <p className="text-xs text-muted-foreground">MB</p>
          </div>
        </div>

        {warningLevel !== "none" && (
          <div className={`p-3 rounded-lg text-sm ${
            warningLevel === "high"
              ? "bg-destructive/10 text-destructive border border-destructive/30"
              : "bg-warning/10 text-warning border border-warning/30"
          }`}>
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5" />
              <div>
                <p className="font-medium">
                  {warningLevel === "high" 
                    ? t("memory.usageHigh") 
                    : t("memory.usageMedium")}
                </p>
                <p className="text-xs mt-1">
                  {warningLevel === "high"
                    ? t("memory.usageHighHint")
                    : t("memory.usageMediumHint")}
                </p>
              </div>
            </div>
          </div>
        )}

        <Button 
          variant="outline" 
          onClick={manualCleanup}
          className="w-full"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          {t("memory.cleanup")}
        </Button>

        <p className="text-xs text-muted-foreground text-center">
          {t("memory.autoCleanupHint")}
        </p>
      </CardContent>
    </Card>
  );
}
