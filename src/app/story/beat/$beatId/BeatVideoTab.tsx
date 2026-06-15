import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import { Progress } from "@/shared/ui/progress";
import {
  AlertTriangle,
  Copy,
  RefreshCw,
} from "lucide-react";
import { t } from "@/shared/constants";
import { mapUserFacingError } from "@/shared/utils/user-facing-error";
import type { StoryBeat } from "@/domain/schemas";
import type { VideoTask } from "@/modules/video";

interface BeatVideoTabProps {
  beat: StoryBeat;
  task?: VideoTask;
  videoUrl?: string;
  isRefreshingUrl: boolean;
  handleCopyVideoUrl: () => void;
  handleRefreshVideoUrl: () => void;
  success: (title: string, description?: string) => void;
  getStatusColor: (status?: string) => string;
  getStatusLabel: (status?: string) => string;
  onRegenerate?: () => Promise<void>;
  isRegenerating?: boolean;
}

export function BeatVideoTab({
  beat,
  task,
  videoUrl,
  isRefreshingUrl,
  handleCopyVideoUrl,
  handleRefreshVideoUrl,
  success,
  getStatusColor,
  getStatusLabel,
  onRegenerate,
  isRegenerating,
}: BeatVideoTabProps) {
  return (
    <>
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-foreground">
            {t("beat.genStatus")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t("beat.status")}</span>
            <Badge
              className={getStatusColor(
                beat.videoGen?.status || task?.status,
              )}
            >
              {getStatusLabel(beat.videoGen?.status || task?.status)}
            </Badge>
          </div>
          {beat.videoGen?.status === "generating" && (
            <>
              <Progress value={task?.progress || 0} className="h-2" />
              <div className="text-xs text-right text-muted-foreground">
                {task?.progress || 0}%
              </div>
            </>
          )}
          {beat.videoGen?.error && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30">
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm font-medium">{t("beat.statusFailed")}</span>
              </div>
              <p className="text-xs text-destructive/80 mt-1">
                {mapUserFacingError(beat.videoGen.error)}
              </p>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t("beat.taskId")}</span>
            <div className="flex items-center gap-1">
              <code className="text-xs bg-muted px-2 py-1 rounded">
                {beat.videoGen?.taskId || task?.taskId || t("story.notCreated")}
              </code>
              {beat.videoGen?.taskId && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={async () => {
                    const taskId = beat.videoGen?.taskId;
                    if (taskId) {
                      try {
                        await navigator.clipboard.writeText(taskId);
                        success(t("success.copied"), t("success.taskIdCopied"));
                      } catch {
                        // 剪贴板权限被拒绝时静默失败
                      }
                    }
                  }}
                  aria-label={t("aria.copyTaskId")}
                >
                  <Copy className="w-3 h-3" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-foreground">
            {t("beat.videoUrl")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="p-3 rounded-lg bg-muted/50 border border-border">
            <code className="text-xs text-muted-foreground break-all">
              {videoUrl ||
                beat.videoGen?.videoUrl ||
                task?.videoUrl ||
                t("beat.noVideoUrl")}
            </code>
          </div>
          <div className="flex gap-2">
            {(videoUrl ||
              beat.videoGen?.videoUrl ||
              task?.videoUrl) && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2 flex-1"
                onClick={handleCopyVideoUrl}
              >
                <Copy className="w-3.5 h-3.5" />
                {t("beat.copyUrl")}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="gap-2 flex-1"
              onClick={handleRefreshVideoUrl}
              disabled={isRefreshingUrl}
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isRefreshingUrl ? "animate-spin" : ""}`}
              />
              {isRefreshingUrl ? t("beat.fetching") : t("beat.manualFetchUrl")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("beat.manualFetchHint")}
          </p>
        </CardContent>
      </Card>

      {beat.consistencyCheck && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-foreground">
              {t("beat.consistencyCheck")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t("beat.overallScore")}</span>
              <div className="flex items-center gap-2">
                <Progress
                  value={
                    (beat.consistencyCheck.overallScore || 0) * 100
                  }
                  className="w-20 h-2"
                />
                <span className="text-sm font-medium">
                  {(
                    (beat.consistencyCheck.overallScore || 0) * 100
                  ).toFixed(0)}
                  %
                </span>
              </div>
            </div>
            {beat.consistencyCheck.characterScores?.map((score) => (
              <div key={score.elementId} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {score.elementName}
                  </span>
                  <span className="text-xs">
                    {(score.score * 100).toFixed(0)}%
                  </span>
                </div>
                <Progress
                  value={score.score * 100}
                  className="h-1.5"
                />
              </div>
            ))}
            {beat.consistencyCheck.recommendation && (
              <div className="flex items-center gap-2">
                <Badge
                  className={
                    beat.consistencyCheck.recommendation === "accept"
                      ? "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200"
                      : beat.consistencyCheck.recommendation ===
                          "adjust"
                        ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200"
                        : "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200"
                  }
                >
                  {beat.consistencyCheck.recommendation === "accept" &&
                    t("beat.passed")}
                  {beat.consistencyCheck.recommendation === "adjust" &&
                    t("beat.needsAdjust")}
                  {beat.consistencyCheck.recommendation ===
                    "regenerate" && t("beat.suggestRegenerate")}
                </Badge>
                {(beat.consistencyCheck.recommendation === "adjust" ||
                  beat.consistencyCheck.recommendation === "regenerate") &&
                  onRegenerate && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onRegenerate}
                      disabled={isRegenerating}
                    >
                      {isRegenerating ? t("beat.regenerating") : t("beat.regenerate")}
                    </Button>
                  )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}
