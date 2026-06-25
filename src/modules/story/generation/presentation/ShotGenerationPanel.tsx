import {
  Play,
  Loader2,
  CheckCircle,
  AlertCircle,
  Shield,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import { memo } from "react";

import { cn } from "@/shared/utils/utils";
import { resolveMediaUrl } from "@/shared/utils/image-url";
import { createVideoErrorHandler } from "@/shared/utils/media-error-handler";
import { Link } from "react-router-dom";
import type { StoryBeat, ShotGenerationStatus } from "@/domain/schemas";
import { t } from "@/shared/constants";

const DEFAULT_CONSISTENCY_STRENGTH = 0.8;

interface ShotGenerationPanelProps {
  beat: StoryBeat;
  isGenerating: boolean;
  onGenerate: () => Promise<void>;
  onRegenerate?: () => Promise<void>;
}

const statusConfig: Record<ShotGenerationStatus, { label: string; color: string; icon: typeof Play | null }> = {
  idle: {
    label: t("shot.notGenerated"),
    color: "bg-muted",
    icon: null,
  },
  pending: {
    label: t("shot.waiting"),
    color: "bg-warning",
    icon: null,
  },
  generating: {
    label: t("shot.generating"),
    color: "bg-primary",
    icon: Loader2,
  },
  completed: {
    label: t("shot.completed"),
    color: "bg-success",
    icon: CheckCircle,
  },
  failed: {
    label: t("shot.failedStatus"),
    color: "bg-destructive",
    icon: AlertCircle,
  },
};

export const ShotGenerationPanel = memo(function ShotGenerationPanel({
  beat,
  isGenerating,
  onGenerate,
  onRegenerate,
}: ShotGenerationPanelProps) {
  const status = beat.generationStatus || "idle";
  const config = statusConfig[status];
  const Icon = config.icon;

  const videoUrl = beat.videoGen?.videoUrl || beat.generationResult?.videoUrl;
  const localVideoPath = beat.localVideoPath;
  const error = beat.generationResult?.error;
  const isFeatureAnchored = beat.featureAnchoring?.enabled;
  const anchoring = isFeatureAnchored ? beat.featureAnchoring : undefined;
  const consistencyCheck = beat.consistencyCheck;

  return (
    <div className="space-y-4">
      {isFeatureAnchored && anchoring && (
        <div className="bg-primary/20 border border-primary/30 rounded-lg p-3 text-xs text-primary">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-4 h-4" />
            <span className="font-medium">{t("shot.featureAnchoringEnabled")}</span>
          </div>
          <p>
            {t("shot.featureAnchoringDesc")}
          </p>
          <div className="mt-2 flex gap-2">
            <span className="badge badge-info bg-primary/50 text-[10px]">
              {t("shot.characterCount", { count: anchoring.characterAnchors.length })}
            </span>
            {anchoring.previewImageUrl && (
              <span className="badge badge-info bg-primary/50 text-[10px]">{t("shot.previewRef")}</span>
            )}
            <span className="badge badge-info bg-warning/50 text-[10px]">
              {t("shot.frameBindingDisabled")}
            </span>
            <span className="badge badge-info bg-primary/50 text-[10px]">
              {t("shot.consistency", { percent: Math.round((anchoring.featureConsistencyStrength ?? DEFAULT_CONSISTENCY_STRENGTH) * 100) })}
            </span>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 16 }}>
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className={cn("badge badge-info", config.color)}>{config.label}</span>
              {Icon && (
                <Icon
                  className={`w-4 h-4 ${status === "generating" ? "animate-spin" : ""}`}
                />
              )}
            </div>
            <div className="flex gap-2">
              <Link to={`/story/beat/${beat.id}`}>
                <button
                  type="button"
                  className="btn btn-outline btn-sm gap-1.5 border-primary/50 text-primary hover:bg-primary/30"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  {t("shot.detail")}
                </button>
              </Link>
              {status === "completed" && onRegenerate && (
                <button
                  type="button"
                  onClick={onRegenerate}
                  disabled={isGenerating}
                  className="btn btn-outline btn-sm gap-1.5 border-primary/50 text-primary hover:bg-primary/30"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  {t("shot.regenerate")}
                </button>
              )}
              <button
                type="button"
                onClick={onGenerate}
                disabled={isGenerating}
                className="btn btn-primary gap-2"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t("common.generating")}
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    {status === "completed"
                      ? t("shot.regenerate")
                      : t("shot.independentGenerate")}
                  </>
                )}
              </button>
            </div>
          </div>

          {videoUrl && (
            <div className="mt-4">
              <video src={resolveMediaUrl(localVideoPath, videoUrl)} controls className="w-full rounded-lg" onError={createVideoErrorHandler()} />
            </div>
          )}

          {consistencyCheck && (
            <div
              className={`mt-4 p-3 rounded-lg border ${consistencyCheck.passed ? "border-success/30" : "bg-warning/10 border-warning/30"}`}
              style={consistencyCheck.passed ? { background: "rgba(var(--success-rgb), 0.1)" } : undefined}
            >
              <div className="flex items-center gap-2 mb-2">
                {consistencyCheck.passed ? (
                  <CheckCircle className="w-4 h-4" style={{ color: "var(--success)" }} />
                ) : (
                  <AlertCircle className="w-4 h-4 text-warning" />
                )}
                <span
                  className={`text-sm font-medium ${consistencyCheck.passed ? "" : "text-warning"}`}
                  style={consistencyCheck.passed ? { color: "var(--success)" } : undefined}
                >
                  {t("shot.visualConsistency", { status: consistencyCheck.passed ? t("shot.consistencyPassed") : t("shot.consistencyAttention") })}
                </span>
                <span
                  className={cn(
                    "badge badge-info",
                    consistencyCheck.overallScore >= 0.8
                      ? "bg-success"
                      : consistencyCheck.overallScore >= 0.5
                        ? "bg-warning"
                        : "bg-destructive",
                  )}
                >
                  {Math.round(consistencyCheck.overallScore * 100)}%
                </span>
              </div>
              {consistencyCheck.characterScores.map((cs) => (
                <div key={cs.elementId} className="text-xs text-muted-foreground ml-6">
                  {t("shot.characterQuote", { name: cs.elementName })}
                  {Math.round(cs.score * 100)}%
                  {cs.issues.length > 0 && ` - ${cs.issues.join("；")}`}
                </div>
              ))}
              {consistencyCheck.recommendation === "regenerate" &&
                onRegenerate && (
                  <div className="mt-2 ml-6">
                    <button
                      type="button"
                      className="btn btn-outline btn-sm text-warning border-warning/50 hover:bg-warning/20"
                      onClick={onRegenerate}
                    >
                      <RefreshCw className="w-3 h-3 mr-1" />
                      {t("shot.suggestRegenerate")}
                    </button>
                  </div>
                )}
            </div>
          )}

          {error && (
            <div className="mt-4 p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4" style={{ color: "var(--destructive)" }} />
                <span className="text-sm" style={{ color: "var(--destructive)" }}>{error}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="text-sm text-muted-foreground">
        <p>{t("shot.tips")}</p>
        <ul className="list-disc list-inside space-y-1 mt-2">
          {isFeatureAnchored ? (
            <>
              <li>{t("shot.tipFeatureAnchored1")}</li>
              <li>{t("shot.tipFeatureAnchored2")}</li>
              <li>{t("shot.tipFeatureAnchored3")}</li>
              <li>{t("shot.tipFeatureAnchored4")}</li>
              <li>{t("shot.tipFeatureAnchored5")}</li>
            </>
          ) : (
            <>
              <li>{t("shot.tipIndependent1")}</li>
              <li>{t("shot.tipIndependent2")}</li>
              <li>{t("shot.tipIndependent3")}</li>
            </>
          )}
        </ul>
      </div>
    </div>
  );
});
