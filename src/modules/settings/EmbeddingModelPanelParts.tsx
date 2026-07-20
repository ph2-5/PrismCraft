/**
 * EmbeddingModelPanel 的子组件与共享常量
 *
 * 拆分自 EmbeddingModelPanel.tsx，用于降低主组件的函数行数与圈复杂度。
 *
 * 包含：
 * - 共享常量：RECOMMENDED_MODELS / REQUIRED_NON_ONNX_FILES / isAcceptedFile
 * - 子组件：UploadProgress / ModelCard / StatusCard / PrewarmCard / DownloadGuide / UploadArea
 */

import React from "react";
import {
  Upload,
  Trash2,
  CheckCircle2,
  XCircle,
  Loader2,
  Brain,
  FileWarning,
  AlertTriangle,
  Power,
  Download,
  ExternalLink,
  Copy,
  Terminal,
  Zap,
} from "lucide-react";
import { t } from "@/shared/constants";
import {
  ACCEPTED_ONNX_FILES,
  type ModelStatus,
  type LocalModelEntry,
} from "@/shared/embedding";

// ── 共享常量 ──

/**
 * 推荐模型预设（与 scripts/download-embedding-model.mjs 中的 MODEL_PRESETS 保持一致）。
 *
 * 用于在 UI 中展示下载引导，让用户知道有哪些可用模型以及如何下载。
 * 字段含义：
 * - repoId：HuggingFace 仓库 ID（下载命令和页面链接用）
 * - modelName：显示名
 * - language：语言
 * - dimensions：向量维度
 * - size：量化版大致体积（仅供参考）
 * - description：简短描述
 */
export const RECOMMENDED_MODELS = [
  {
    repoId: "Xenova/all-MiniLM-L6-v2",
    modelName: "all-MiniLM-L6-v2",
    language: "en",
    dimensions: 384,
    size: "~33MB",
    description: "轻量英文模型，体积小速度快（推荐）",
  },
  {
    repoId: "Xenova/bge-small-zh-v1.5",
    modelName: "bge-small-zh-v1.5",
    language: "zh",
    dimensions: 512,
    size: "~50MB",
    description: "轻量中文模型，适合中文记忆检索",
  },
  {
    repoId: "Xenova/multilingual-e5-small",
    modelName: "multilingual-e5-small",
    language: "multilingual",
    dimensions: 384,
    size: "~120MB",
    description: "多语言模型，支持中英混合场景",
  },
  {
    repoId: "Xenova/gte-small",
    modelName: "gte-small",
    language: "en",
    dimensions: 384,
    size: "~33MB",
    description: "英文模型，检索效果略优于 MiniLM",
  },
] as const;

/**
 * 必需的非 ONNX 文件（文件名固定，不支持变体）
 *
 * 注意：ONNX 候选文件名从 ACCEPTED_ONNX_FILES 动态引用，不在此处硬编码。
 */
export const REQUIRED_NON_ONNX_FILES = ["tokenizer.json", "config.json"] as const;

/**
 * 判断文件名是否为可接受的上传目标
 *
 * ONNX 候选任意一个 + 必需非 ONNX 文件
 */
export function isAcceptedFile(fileName: string): boolean {
  if (REQUIRED_NON_ONNX_FILES.includes(fileName as (typeof REQUIRED_NON_ONNX_FILES)[number])) {
    return true;
  }
  return (ACCEPTED_ONNX_FILES as readonly string[]).includes(fileName);
}

// ── 共享类型 ──

/** 上传进度信息 */
export interface UploadProgressInfo {
  current: number;
  total: number;
  fileName: string;
}

/** 预热进度信息 */
export interface PrewarmProgressInfo {
  current: number;
  total: number;
  message?: string;
}

// ── 子组件 ──

interface UploadProgressProps {
  progress: UploadProgressInfo;
}

/** 渲染上传进度（current/total + 文件名 + 进度条） */
export function UploadProgress({ progress }: UploadProgressProps) {
  const percent = progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0;
  return (
    <div className="w-full mt-1">
      <div className="text-xs text-muted-foreground mb-1">
        {progress.fileName
          ? t("settings.embeddingModelUploadingProgress", {
              current: progress.current + 1,
              total: progress.total,
              fileName: progress.fileName,
            })
          : t("settings.embeddingModelUploading")}
      </div>
      <div className="progress-container">
        <div
          className="h-full bg-primary rounded-[3px] transition-[width] duration-200"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

interface ModelCardProps {
  entry: LocalModelEntry;
  isActive: boolean;
  isPending: boolean;
  uploading: boolean;
  status: ModelStatus | null;
  onEnable: (entry: LocalModelEntry) => void;
  onRemove: (entry: LocalModelEntry) => void;
}

/** 渲染单个模型卡片 */
export function ModelCard({
  entry,
  isActive,
  isPending,
  uploading,
  status,
  onEnable,
  onRemove,
}: ModelCardProps) {
  return (
    <div
      key={entry.id}
      className={`card mb-3 ${isActive ? "embedding-active-card" : ""}`}
    >
      {/* 标题行：名称 + 操作 */}
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2 text-[13px] font-semibold min-w-0">
          {isActive ? (
            <CheckCircle2 size={16} className="text-success shrink-0" />
          ) : (
            <Brain size={16} className="text-muted-foreground shrink-0" />
          )}
          <span className="overflow-hidden text-ellipsis whitespace-nowrap">
            {entry.modelName}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {isActive ? (
            <span className="enabled-badge">
              <CheckCircle2 size={11} /> {t("settings.embeddingModelEnabled")}
            </span>
          ) : (
            <button
              type="button"
              className="btn btn-ghost btn-sm text-[11px]"
              onClick={() => onEnable(entry)}
              disabled={isPending || uploading}
            >
              {isPending ? <Loader2 size={12} className="animate-spin" /> : <Power size={12} />}
              {t("settings.embeddingModelEnable")}
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-sm text-destructive text-[11px]"
            onClick={() => onRemove(entry)}
            disabled={isPending || uploading}
          >
            {isPending ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
          </button>
        </div>
      </div>

      {/* 元信息 */}
      <div className="mb-2">
        <div className="info-row">
          <span className="info-label">{t("settings.embeddingModelDimensions")}</span>
          <span className="info-value">{entry.dimensions}</span>
        </div>
        <div className="info-row">
          <span className="info-label">{t("settings.embeddingModelMaxTokens")}</span>
          <span className="info-value">{entry.maxTokens}</span>
        </div>
        <div className="info-row">
          <span className="info-label">{t("settings.embeddingModelLanguage")}</span>
          <span className="info-value">{entry.language}</span>
        </div>
        <div className="info-row">
          <span className="info-label">ONNX</span>
          <span className="info-value font-mono text-[11px]">{entry.modelFileName}</span>
        </div>
        {entry.description && (
          <div className="info-row">
            <span className="info-label">{t("settings.embeddingModelDescription")}</span>
            <span className="info-value">{entry.description}</span>
          </div>
        )}
      </div>

      {/* active 模型的缺失文件 / 完整性错误 */}
      {isActive && status && !status.available && (
        <>
          {status.missingFiles.length > 0 && (
            <div className="warn-box">
              <FileWarning size={14} className="shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold mb-0.5">
                  {t("settings.embeddingModelMissingFiles")}
                </div>
                <div>{status.missingFiles.join(", ")}</div>
              </div>
            </div>
          )}
          {status.integrityErrors.length > 0 && (
            <div className="err-box">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold mb-0.5">
                  {t("settings.embeddingModelIntegrityErrors")}
                </div>
                <div className="mb-1">
                  {t("settings.embeddingModelIntegrityTip")}
                </div>
                <ul className="m-0 pl-4">
                  {status.integrityErrors.map((err, idx) => (
                    <li key={idx} className="mb-0.5">{err}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

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

interface UploadAreaProps {
  uploading: boolean;
  uploadProgress: UploadProgressInfo | null;
  isDragOver: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnter: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: (e: React.DragEvent<HTMLDivElement>) => void;
  onClick: () => void;
  onFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

/** 上传区域（拖拽 + 点击选择文件） */
export function UploadArea({
  uploading,
  uploadProgress,
  isDragOver,
  fileInputRef,
  onDrop,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onClick,
  onFileInputChange,
}: UploadAreaProps) {
  const dropZoneClassName = isDragOver ? "dropzone active" : "dropzone";
  return (
    <div className="card mb-3">
      <div
        className={dropZoneClassName}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onClick={onClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
          }
        }}
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 size={32} className="animate-spin mx-auto" />
            <div className="text-[13px] font-semibold">{t("settings.embeddingModelUploading")}</div>
            {uploadProgress && <UploadProgress progress={uploadProgress} />}
          </div>
        ) : (
          <>
            <div className="text-[32px] mb-2">
              <Upload size={32} className="mx-auto" />
            </div>
            <div className="text-[13px] font-semibold">{t("settings.embeddingModelDragHint")}</div>
            <div className="text-[11px] text-muted-foreground mt-1">
              {t("settings.embeddingModelRequiredFiles")}
            </div>
          </>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".onnx,.json"
        multiple
        className="hidden"
        onChange={onFileInputChange}
      />
    </div>
  );
}
