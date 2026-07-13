import {
  Play,
  Loader2,
  CheckCircle,
  AlertCircle,
  Shield,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import { Link } from "react-router-dom";

import { cn } from "@/shared/utils/utils";
import { resolveMediaUrl } from "@/shared/utils/image-url";
import { createVideoErrorHandler } from "@/shared/utils/media-error-handler";
import type { StoryBeat, ShotGenerationStatus } from "@/domain/schemas";
import { t } from "@/shared/constants";

const DEFAULT_CONSISTENCY_STRENGTH = 0.8;

export const statusConfig: Record<
  ShotGenerationStatus,
  { label: string; color: string; icon: typeof Play | null }
> = {
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

interface FeatureAnchoringBannerProps {
  anchoring: NonNullable<StoryBeat["featureAnchoring"]>;
}

export function FeatureAnchoringBanner({ anchoring }: FeatureAnchoringBannerProps) {
  return (
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
  );
}

interface ActionButtonsProps {
  beatId: string;
  status: ShotGenerationStatus;
  isGenerating: boolean;
  onGenerate: () => Promise<void>;
  onRegenerate?: () => Promise<void>;
}

export function ActionButtons({
  beatId,
  status,
  isGenerating,
  onGenerate,
  onRegenerate,
}: ActionButtonsProps) {
  return (
    <div className="flex gap-2">
      <Link to={`/story/beat/${beatId}`}>
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
  );
}

interface VideoPreviewProps {
  videoUrl: string;
  localVideoPath?: string;
}

export function VideoPreview({ videoUrl, localVideoPath }: VideoPreviewProps) {
  return (
    <div className="mt-4">
      <video
        src={resolveMediaUrl(localVideoPath, videoUrl)}
        controls
        className="w-full rounded-lg"
        onError={createVideoErrorHandler()}
      />
    </div>
  );
}

interface ConsistencyCheckCardProps {
  consistencyCheck: NonNullable<StoryBeat["consistencyCheck"]>;
  onRegenerate?: () => Promise<void>;
}

export function ConsistencyCheckCard({
  consistencyCheck,
  onRegenerate,
}: ConsistencyCheckCardProps) {
  const passed = consistencyCheck.passed;
  return (
    <div
      className={`mt-4 p-3 rounded-lg border ${passed ? "border-success/30" : "bg-warning/10 border-warning/30"}`}
      style={passed ? { background: "rgba(var(--success-rgb), 0.1)" } : undefined}
    >
      <div className="flex items-center gap-2 mb-2">
        {passed ? (
          <CheckCircle className="w-4 h-4" style={{ color: "var(--success)" }} />
        ) : (
          <AlertCircle className="w-4 h-4 text-warning" />
        )}
        <span
          className={`text-sm font-medium ${passed ? "" : "text-warning"}`}
          style={passed ? { color: "var(--success)" } : undefined}
        >
          {t("shot.visualConsistency", { status: passed ? t("shot.consistencyPassed") : t("shot.consistencyAttention") })}
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
      {consistencyCheck.recommendation === "regenerate" && onRegenerate && (
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
  );
}

interface ErrorBlockProps {
  error: string;
}

export function ErrorBlock({ error }: ErrorBlockProps) {
  return (
    <div className="mt-4 p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
      <div className="flex items-center gap-2">
        <AlertCircle className="w-4 h-4" style={{ color: "var(--destructive)" }} />
        <span className="text-sm" style={{ color: "var(--destructive)" }}>{error}</span>
      </div>
    </div>
  );
}

interface GenerationTipsProps {
  isFeatureAnchored: boolean;
}

export function GenerationTips({ isFeatureAnchored }: GenerationTipsProps) {
  return (
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
  );
}
