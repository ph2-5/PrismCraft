/**
 * Embedding 模型状态与下载引导组件
 *
 * 拆分自 EmbeddingModelPanelParts.tsx（P2.1 拆分超长组件文件）。
 *
 * 包含：
 * - StatusCard：总体状态卡片
 * - PrewarmCard：预热 Embedding 缓存卡片
 * - DownloadGuide：下载引导卡片（仅当无已安装模型时显示）
 */

import {
  CheckCircle2,
  XCircle,
  Zap,
  Loader2,
  Download,
  Terminal,
  Copy,
  ExternalLink,
} from "lucide-react";
import { t } from "@/shared/constants";
import {
  type ModelStatus,
  type LocalModelEntry,
} from "@/shared/embedding";
import {
  RECOMMENDED_MODELS,
  type PrewarmProgressInfo,
} from "./embedding-model-constants";

interface StatusCardProps {
  status: ModelStatus | null;
  installedModels: LocalModelEntry[];
  activeEntry: LocalModelEntry | null;
}

/** 总体状态卡片 */
export function StatusCard({ status, installedModels, activeEntry }: StatusCardProps) {
  return (
    <div className="card mb-3">
      <div className="flex items-center gap-2 mb-2 text-[13px] font-semibold">
        {status?.available ? (
          <>
            <CheckCircle2 size={16} className="text-success" />
            {t("settings.embeddingModelInstalled")}
          </>
        ) : (
          <>
            <XCircle size={16} className="text-muted-foreground" />
            {t("settings.embeddingModelNotInstalled")}
          </>
        )}
      </div>
      <div className="text-xs text-muted-foreground">
        {t("settings.embeddingModelInstalledCount", { count: installedModels.length })}
        {" · "}
        {activeEntry ? (
          <>
            {t("settings.embeddingModelActive")}：{activeEntry.modelName}
          </>
        ) : (
          t("settings.embeddingModelNoActive")
        )}
      </div>
    </div>
  );
}

interface PrewarmCardProps {
  prewarming: boolean;
  prewarmProgress: PrewarmProgressInfo | null;
  uploading: boolean;
  onPrewarm: () => void;
}

/** 预热 Embedding 缓存卡片（预训练数据-4） */
export function PrewarmCard({
  prewarming,
  prewarmProgress,
  uploading,
  onPrewarm,
}: PrewarmCardProps) {
  return (
    <div className="card mb-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 text-[13px] font-semibold">
          <Zap size={16} className="text-primary" />
          {t("settings.embeddingPrewarmTitle")}
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm text-[11px]"
          onClick={onPrewarm}
          disabled={prewarming || uploading}
        >
          {prewarming ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
          {t("settings.embeddingPrewarmButton")}
        </button>
      </div>
      <div className="text-[11px] text-muted-foreground leading-relaxed">
        {t("settings.embeddingPrewarmHint")}
      </div>
      {/* 预热进度条 */}
      {prewarming && prewarmProgress && prewarmProgress.total > 0 && (
        <div className="mt-2.5">
          <div className="text-[11px] text-muted-foreground mb-1">
            {prewarmProgress.message ?? t("settings.embeddingPrewarmProcessing", {
              current: prewarmProgress.current,
              total: prewarmProgress.total,
            })}
          </div>
          <div className="progress-container">
            <div
              className="h-full bg-primary rounded-[3px] transition-[width] duration-200"
              style={{ width: `${Math.round((prewarmProgress.current / Math.max(prewarmProgress.total, 1)) * 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

interface DownloadGuideProps {
  onCopyCommand: (repoId: string) => void;
  onOpenHuggingFace: (repoId: string) => void;
}

/** 下载引导卡片（仅当无已安装模型时显示） */
export function DownloadGuide({ onCopyCommand, onOpenHuggingFace }: DownloadGuideProps) {
  return (
    <div className="card mb-3">
      <div className="flex items-center gap-2 mb-2.5 text-[13px] font-semibold">
        <Download size={16} className="text-primary" />
        {t("settings.embeddingModelDownloadGuide")}
      </div>
      <div className="text-[11px] text-muted-foreground mb-3 leading-relaxed">
        {t("settings.embeddingModelDownloadHint")}
      </div>

      {/* 方式一：运行下载脚本 */}
      <div className="mb-3.5 p-2.5 bg-card2 rounded-lg">
        <div className="flex items-center gap-1.5 text-xs font-semibold mb-2">
          <Terminal size={13} /> {t("settings.embeddingModelDownloadScript")}
          <span className="text-[10px] text-success ml-1">
            {t("settings.embeddingModelRecommended")}
          </span>
        </div>
        <div className="text-[11px] text-muted-foreground mb-2">
          {t("settings.embeddingModelScriptHint")}
        </div>
        {/* 推荐模型列表 */}
        <div className="flex flex-col gap-1.5">
          {RECOMMENDED_MODELS.map((m) => (
            <div
              key={m.repoId}
              className="flex items-center justify-between gap-2 px-2.5 py-2 bg-card border border-border rounded-md"
            >
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold font-mono">
                  {m.repoId}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {m.description}
                  {" · "}
                  {t("settings.embeddingModelDimensions")}: {m.dimensions}
                  {" · "}
                  {m.size}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm text-[11px]"
                  onClick={() => onCopyCommand(m.repoId)}
                  title={t("settings.embeddingModelCopyCommand")}
                >
                  <Copy size={12} />
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm text-[11px]"
                  onClick={() => onOpenHuggingFace(m.repoId)}
                  title={t("settings.embeddingModelOpenHuggingFace")}
                >
                  <ExternalLink size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 方式二：手动下载并拖拽 */}
      <div className="p-2.5 bg-card2 rounded-lg">
        <div className="flex items-center gap-1.5 text-xs font-semibold mb-1.5">
          <ExternalLink size={13} /> {t("settings.embeddingModelManualDownload")}
        </div>
        <div className="text-[11px] text-muted-foreground leading-relaxed">
          {t("settings.embeddingModelManualHint")}
        </div>
      </div>
    </div>
  );
}
