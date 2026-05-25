"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { Progress } from "@/shared/ui/progress";
import { Badge } from "@/shared/ui/badge";
import { useMemoryMonitor } from "@/shared/hooks/use-memory-monitor";
import { Trash2, AlertCircle, CheckCircle, AlertTriangle } from "lucide-react";

interface MemoryMonitorPanelProps {
  clearErrorLogs?: () => Promise<void>;
}

export function MemoryMonitorPanel({ clearErrorLogs }: MemoryMonitorPanelProps) {
  const { memory, warningLevel, manualCleanup, thresholds: _thresholds } = useMemoryMonitor({ clearErrorLogs });

  if (!memory) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>内存监控</CardTitle>
          <CardDescription>当前浏览器不支持内存监控 API</CardDescription>
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
            过高
          </Badge>
        );
      case "medium":
        return (
          <Badge variant="default" className="bg-yellow-500 gap-1">
            <AlertTriangle className="w-3 h-3" />
            偏高
          </Badge>
        );
      case "low":
        return (
          <Badge variant="outline" className="text-yellow-600 border-yellow-500 gap-1">
            <AlertTriangle className="w-3 h-3" />
            注意
          </Badge>
        );
      default:
        return (
          <Badge variant="default" className="bg-green-500 gap-1">
            <CheckCircle className="w-3 h-3" />
            正常
          </Badge>
        );
    }
  };

  const getProgressColor = () => {
    switch (warningLevel) {
      case "high":
        return "bg-red-500";
      case "medium":
        return "bg-yellow-500";
      case "low":
        return "bg-yellow-400";
      default:
        return "bg-green-500";
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              内存监控
            </CardTitle>
            <CardDescription>监控应用内存使用情况</CardDescription>
          </div>
          {getStatusBadge()}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 内存使用进度条 */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">已使用</span>
            <span className="font-medium">{usagePercent}%</span>
          </div>
          <Progress 
            value={usagePercent} 
            className={`h-2 ${getProgressColor()}`}
          />
        </div>

        {/* 内存详情 */}
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-xs text-muted-foreground">已使用</p>
            <p className="text-lg font-semibold">{memory.usedJSHeapSize}</p>
            <p className="text-xs text-muted-foreground">MB</p>
          </div>
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-xs text-muted-foreground">总分配</p>
            <p className="text-lg font-semibold">{memory.totalJSHeapSize}</p>
            <p className="text-xs text-muted-foreground">MB</p>
          </div>
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-xs text-muted-foreground">上限</p>
            <p className="text-lg font-semibold">{memory.jsHeapSizeLimit}</p>
            <p className="text-xs text-muted-foreground">MB</p>
          </div>
        </div>

        {/* 警告提示 */}
        {warningLevel !== "none" && (
          <div className={`p-3 rounded-lg text-sm ${
            warningLevel === "high" 
              ? "bg-red-50 text-red-700 border border-red-200" 
              : "bg-yellow-50 text-yellow-700 border border-yellow-200"
          }`}>
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5" />
              <div>
                <p className="font-medium">
                  {warningLevel === "high" 
                    ? "内存使用过高" 
                    : "内存使用偏高"}
                </p>
                <p className="text-xs mt-1">
                  {warningLevel === "high"
                    ? "建议立即清理内存，避免应用崩溃"
                    : "建议适当清理内存，保持流畅运行"}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 清理按钮 */}
        <Button 
          variant="outline" 
          onClick={manualCleanup}
          className="w-full"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          清理内存
        </Button>

        <p className="text-xs text-muted-foreground text-center">
          内存过高时会自动清理未使用的资源
        </p>
      </CardContent>
    </Card>
  );
}
