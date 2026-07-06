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

interface CardHeaderProps {
  title: string;
}

function CardHeader({ title }: CardHeaderProps) {
  return (
    <div style={{ paddingBottom: 12 }}>
      <div className="text-sm text-foreground" style={{ fontWeight: 600 }}>
        {title}
      </div>
    </div>
  );
}

interface GenerationStatusCardProps {
  beat: StoryBeat;
  task?: VideoTask;
  success: (title: string, description?: string) => void;
  getStatusColor: (status?: string) => string;
  getStatusLabel: (status?: string) => string;
}

function GenerationStatusCard({
  beat,
  task,
  success,
  getStatusColor,
  getStatusLabel,
}: GenerationStatusCardProps) {
  const status = beat.videoGen?.status || task?.status;
  const taskId = beat.videoGen?.taskId;
  const progress = task?.progress || 0;

  const handleCopyTaskId = async () => {
    if (!taskId) return;
    try {
      await navigator.clipboard.writeText(taskId);
      success(t("success.copied"), t("success.taskIdCopied"));
    } catch {
      // 剪贴板权限被拒绝时静默失败
    }
  };

  return (
    <div className="card">
      <CardHeader title={t("beat.genStatus")} />
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{t("beat.status")}</span>
          <span className={`badge ${getStatusColor(status)}`}>
            {getStatusLabel(status)}
          </span>
        </div>
        {beat.videoGen?.status === "generating" && (
          <>
            <div className="progress-bar"><div className="progress-fill" style={{ width: `${progress}%` }} /></div>
            <div className="text-xs text-right text-muted-foreground">{progress}%</div>
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
              {taskId || task?.taskId || t("story.notCreated")}
            </code>
            {taskId && (
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={handleCopyTaskId}
                aria-label={t("aria.copyTaskId")}
              >
                <Copy className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface VideoUrlCardProps {
  videoUrl?: string;
  beat: StoryBeat;
  task?: VideoTask;
  isRefreshingUrl: boolean;
  handleCopyVideoUrl: () => void;
  handleRefreshVideoUrl: () => void;
}

function VideoUrlCard({
  videoUrl,
  beat,
  task,
  isRefreshingUrl,
  handleCopyVideoUrl,
  handleRefreshVideoUrl,
}: VideoUrlCardProps) {
  const effectiveUrl = videoUrl || beat.videoGen?.videoUrl || task?.videoUrl;
  return (
    <div className="card">
      <CardHeader title={t("beat.videoUrl")} />
      <div className="space-y-3">
        <div className="p-3 rounded-lg bg-muted/50 border border-border">
          <code className="text-xs text-muted-foreground break-all">
            {effectiveUrl || t("beat.noVideoUrl")}
          </code>
        </div>
        <div className="flex gap-2">
          {effectiveUrl && (
            <button
              type="button"
              className="btn btn-outline btn-sm gap-2 flex-1"
              onClick={handleCopyVideoUrl}
            >
              <Copy className="w-3.5 h-3.5" />
              {t("beat.copyUrl")}
            </button>
          )}
          <button
            type="button"
            className="btn btn-outline btn-sm gap-2 flex-1"
            onClick={handleRefreshVideoUrl}
            disabled={isRefreshingUrl}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingUrl ? "animate-spin" : ""}`} />
            {isRefreshingUrl ? t("beat.fetching") : t("beat.manualFetchUrl")}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">{t("beat.manualFetchHint")}</p>
      </div>
    </div>
  );
}

interface ConsistencyCheckCardProps {
  beat: StoryBeat;
  onRegenerate?: () => Promise<void>;
  isRegenerating?: boolean;
}

function recommendationBadgeClass(recommendation: string): string {
  if (recommendation === "accept") return "bg-success/10 text-success";
  if (recommendation === "adjust") return "bg-warning/10 text-warning";
  return "bg-destructive/10 text-destructive";
}

function recommendationLabel(recommendation: string): string {
  if (recommendation === "accept") return t("beat.passed");
  if (recommendation === "adjust") return t("beat.needsAdjust");
  return t("beat.suggestRegenerate");
}

function ConsistencyCheckCard({ beat, onRegenerate, isRegenerating }: ConsistencyCheckCardProps) {
  const cc = beat.consistencyCheck;
  if (!cc) return null;
  const overallPercent = (cc.overallScore || 0) * 100;
  const showRegenerateButton =
    (cc.recommendation === "adjust" || cc.recommendation === "regenerate") && onRegenerate;

  return (
    <div className="card">
      <CardHeader title={t("beat.consistencyCheck")} />
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{t("beat.overallScore")}</span>
          <div className="flex items-center gap-2">
            <div className="progress-bar" style={{ width: 80 }}>
              <div className="progress-fill" style={{ width: `${overallPercent}%` }} />
            </div>
            <span className="text-sm font-medium">{overallPercent.toFixed(0)}%</span>
          </div>
        </div>
        {cc.characterScores?.map((score) => (
          <div key={score.elementId} className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{score.elementName}</span>
              <span className="text-xs">{(score.score * 100).toFixed(0)}%</span>
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${score.score * 100}%` }} />
            </div>
          </div>
        ))}
        {cc.recommendation && (
          <div className="flex items-center gap-2">
            <span className={`badge ${recommendationBadgeClass(cc.recommendation)}`}>
              {recommendationLabel(cc.recommendation)}
            </span>
            {showRegenerateButton && (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={onRegenerate}
                disabled={isRegenerating}
              >
                {isRegenerating ? t("beat.regenerating") : t("beat.regenerate")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
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
      <GenerationStatusCard
        beat={beat}
        task={task}
        success={success}
        getStatusColor={getStatusColor}
        getStatusLabel={getStatusLabel}
      />
      <VideoUrlCard
        videoUrl={videoUrl}
        beat={beat}
        task={task}
        isRefreshingUrl={isRefreshingUrl}
        handleCopyVideoUrl={handleCopyVideoUrl}
        handleRefreshVideoUrl={handleRefreshVideoUrl}
      />
      <ConsistencyCheckCard
        beat={beat}
        onRegenerate={onRegenerate}
        isRegenerating={isRegenerating}
      />
    </>
  );
}
