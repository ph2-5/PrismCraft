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

import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { resolveMediaUrl } from "@/shared/utils/image-url";
import { createVideoErrorHandler } from "@/shared/utils/media-error-handler";
import { Badge } from "@/shared/ui/badge";
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
    color: "bg-gray-500",
    icon: null,
  },
  pending: {
    label: t("shot.waiting"),
    color: "bg-yellow-500",
    icon: null,
  },
  generating: {
    label: t("shot.generating"),
    color: "bg-blue-500",
    icon: Loader2,
  },
  completed: {
    label: t("shot.completed"),
    color: "bg-green-500",
    icon: CheckCircle,
  },
  failed: {
    label: t("shot.failedStatus"),
    color: "bg-red-500",
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
        <div className="bg-purple-900/20 border border-purple-700/30 rounded-lg p-3 text-xs text-purple-300">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-4 h-4" />
            <span className="font-medium">{t("shot.featureAnchoringEnabled")}</span>
          </div>
          <p>
            {t("shot.featureAnchoringDesc")}
          </p>
          <div className="mt-2 flex gap-2">
            <Badge className="bg-blue-600/50 text-[10px]">
              {t("shot.characterCount", { count: anchoring.characterAnchors.length })}
            </Badge>
            {anchoring.previewImageUrl && (
              <Badge className="bg-cyan-600/50 text-[10px]">{t("shot.previewRef")}</Badge>
            )}
            <Badge className="bg-amber-600/50 text-[10px]">
              {t("shot.frameBindingDisabled")}
            </Badge>
            <Badge className="bg-purple-600/50 text-[10px]">
              {t("shot.consistency", { percent: Math.round((anchoring.featureConsistencyStrength ?? DEFAULT_CONSISTENCY_STRENGTH) * 100) })}
            </Badge>
          </div>
        </div>
      )}

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Badge className={config.color}>{config.label}</Badge>
              {Icon && (
                <Icon
                  className={`w-4 h-4 ${status === "generating" ? "animate-spin" : ""}`}
                />
              )}
            </div>
            <div className="flex gap-2">
              <Link to={`/story/beat/${beat.id}`}>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-purple-600/50 text-purple-100 hover:bg-purple-900/30"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  {t("shot.detail")}
                </Button>
              </Link>
              {status === "completed" && onRegenerate && (
                <Button
                  onClick={onRegenerate}
                  disabled={isGenerating}
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-purple-600/50 text-purple-100 hover:bg-purple-900/30"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  {t("shot.regenerate")}
                </Button>
              )}
              <Button
                onClick={onGenerate}
                disabled={isGenerating}
                className="gap-2"
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
              </Button>
            </div>
          </div>

          {videoUrl && (
            <div className="mt-4">
              <video src={resolveMediaUrl(localVideoPath, videoUrl)} controls className="w-full rounded-lg" onError={createVideoErrorHandler()} />
            </div>
          )}

          {consistencyCheck && (
            <div
              className={`mt-4 p-3 rounded-lg border ${consistencyCheck.passed ? "border-green-700/30" : "bg-amber-900/10 border-amber-700/30"}`}
              style={consistencyCheck.passed ? { background: "rgba(var(--success-rgb), 0.1)" } : undefined}
            >
              <div className="flex items-center gap-2 mb-2">
                {consistencyCheck.passed ? (
                  <CheckCircle className="w-4 h-4" style={{ color: "var(--success)" }} />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                )}
                <span
                  className={`text-sm font-medium ${consistencyCheck.passed ? "" : "text-amber-400"}`}
                  style={consistencyCheck.passed ? { color: "var(--success)" } : undefined}
                >
                  {t("shot.visualConsistency", { status: consistencyCheck.passed ? t("shot.consistencyPassed") : t("shot.consistencyAttention") })}
                </span>
                <Badge
                  className={
                    consistencyCheck.overallScore >= 0.8
                      ? "bg-green-600"
                      : consistencyCheck.overallScore >= 0.5
                        ? "bg-amber-600"
                        : "bg-red-600"
                  }
                >
                  {Math.round(consistencyCheck.overallScore * 100)}%
                </Badge>
              </div>
              {consistencyCheck.characterScores.map((cs) => (
                <div key={cs.elementId} className="text-xs text-slate-400 ml-6">
                  {t("shot.characterQuote", { name: cs.elementName })}
                  {Math.round(cs.score * 100)}%
                  {cs.issues.length > 0 && ` - ${cs.issues.join("；")}`}
                </div>
              ))}
              {consistencyCheck.recommendation === "regenerate" &&
                onRegenerate && (
                  <div className="mt-2 ml-6">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-amber-400 border-amber-600/50 hover:bg-amber-900/20"
                      onClick={onRegenerate}
                    >
                      <RefreshCw className="w-3 h-3 mr-1" />
                      {t("shot.suggestRegenerate")}
                    </Button>
                  </div>
                )}
            </div>
          )}

          {error && (
            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4" style={{ color: "var(--destructive)" }} />
                <span className="text-sm" style={{ color: "var(--destructive)" }}>{error}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

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
