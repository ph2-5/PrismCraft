"use client";

import {
  Play,
  Loader2,
  CheckCircle,
  AlertCircle,
  Shield,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { resolveMediaUrl } from "@/shared/utils/image-url";
import { createVideoErrorHandler } from "@/shared/utils/media-error-handler";
import { Badge } from "@/shared/ui/badge";
import Link from "next/link";
import type { StoryBeat, ShotGenerationStatus } from "@/domain/schemas";

interface ShotGenerationPanelProps {
  beat: StoryBeat;
  isGenerating: boolean;
  onGenerate: () => Promise<void>;
  onRegenerate?: () => Promise<void>;
}

const statusConfig: Record<ShotGenerationStatus, { label: string; color: string; icon: typeof Play | null }> = {
  idle: {
    label: "未生成",
    color: "bg-gray-500",
    icon: null,
  },
  pending: {
    label: "等待中",
    color: "bg-yellow-500",
    icon: null,
  },
  generating: {
    label: "生成中",
    color: "bg-blue-500",
    icon: Loader2,
  },
  completed: {
    label: "已完成",
    color: "bg-green-500",
    icon: CheckCircle,
  },
  failed: {
    label: "失败",
    color: "bg-red-500",
    icon: AlertCircle,
  },
};

export function ShotGenerationPanel({
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
  const consistencyCheck = beat.consistencyCheck;

  return (
    <div className="space-y-4">
      {isFeatureAnchored && (
        <div className="bg-purple-900/20 border border-purple-700/30 rounded-lg p-3 text-xs text-purple-300">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-4 h-4" />
            <span className="font-medium">特征锚定模式已启用</span>
          </div>
          <p>
            本分镜将独立生成，通过角色参考图做特征约束，预览图作为构图参考传入但不绑定首尾帧。支持乱序生成和单独修改重生成。
          </p>
          <div className="mt-2 flex gap-2">
            <Badge className="bg-blue-600/50 text-[10px]">
              角色: {beat.featureAnchoring!.characterAnchors.length}
            </Badge>
            {beat.featureAnchoring!.previewImageUrl && (
              <Badge className="bg-cyan-600/50 text-[10px]">预览图参考</Badge>
            )}
            <Badge className="bg-amber-600/50 text-[10px]">
              帧绑定: 已禁用
            </Badge>
            <Badge className="bg-purple-600/50 text-[10px]">
              一致性:{" "}
              {Math.round(
                (beat.featureAnchoring!.featureConsistencyStrength || 0.8) *
                  100,
              )}
              %
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
              <Link href={`/story/beat/${beat.id}`}>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-purple-600/50 text-purple-100 hover:bg-purple-900/30"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  详情
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
                  重新生成
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
                    生成中...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    {status === "completed"
                      ? "重新生成"
                      : "独立生成分镜"}
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
              className={`mt-4 p-3 rounded-lg border ${consistencyCheck.passed ? "bg-green-900/10 border-green-700/30" : "bg-amber-900/10 border-amber-700/30"}`}
            >
              <div className="flex items-center gap-2 mb-2">
                {consistencyCheck.passed ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                )}
                <span
                  className={`text-sm font-medium ${consistencyCheck.passed ? "text-green-400" : "text-amber-400"}`}
                >
                  视觉一致性：{consistencyCheck.passed ? "通过" : "需关注"}
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
                  角色&ldquo;{cs.elementName}&rdquo;：
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
                      建议重新生成
                    </Button>
                  </div>
                )}
            </div>
          )}

          {error && (
            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-500" />
                <span className="text-sm text-red-500">{error}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="text-sm text-muted-foreground">
        <p>提示：</p>
        <ul className="list-disc list-inside space-y-1 mt-2">
          {isFeatureAnchored ? (
            <>
              <li>特征锚定模式下，本分镜独立生成，不影响其他分镜</li>
              <li>角色参考图约束外观一致性，不绑定首帧/尾帧</li>
              <li>预览图作为构图参考传入视频生成，但不作为首尾帧</li>
              <li>支持乱序生成、单独修改重生成</li>
              <li>同一角色在所有分镜中调用同一张原始绑定图</li>
            </>
          ) : (
            <>
              <li>单独生成不会影响其他分镜</li>
              <li>生成前请确认元素绑定和引用配置已设置</li>
              <li>被引用的分镜必须已完成生成</li>
            </>
          )}
        </ul>
      </div>
    </div>
  );
}
