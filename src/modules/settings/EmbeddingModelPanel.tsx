/**
 * 向量模型管理面板（M5 多模型管理）
 *
 * 功能：
 * - 展示已安装模型列表（多模型）+ 当前启用模型
 * - 启用 / 删除 单个模型
 * - 拖拽/点击上传模型文件，安装到子目录（支持 *.onnx 量化变体 + tokenizer.json + config.json）
 * - 上传进度反馈（current/total + 当前文件名）
 * - 完整性校验错误展示（active 模型）
 *
 * 依赖：
 * - @/infrastructure/embedding 的 detectLocalModel / installModelFromFiles / setActiveModel / removeModel /
 *   ACCEPTED_ONNX_FILES / deriveModelId / type ModelStatus / type LocalModelEntry
 * - @/shared/presentation/Toast 的通知
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
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
  detectLocalModel,
  installModelFromFiles,
  setActiveModel,
  removeModel,
  deriveModelId,
  ACCEPTED_ONNX_FILES,
  type ModelStatus,
  type LocalModelEntry,
} from "@/shared/embedding";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { errorLogger } from "@/shared/error-logger";
import { prewarmEmbeddings } from "@/modules/agent";

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
const RECOMMENDED_MODELS = [
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
const REQUIRED_NON_ONNX_FILES = ["tokenizer.json", "config.json"] as const;

/**
 * 判断文件名是否为可接受的上传目标
 *
 * ONNX 候选任意一个 + 必需非 ONNX 文件
 */
function isAcceptedFile(fileName: string): boolean {
  if (REQUIRED_NON_ONNX_FILES.includes(fileName as (typeof REQUIRED_NON_ONNX_FILES)[number])) {
    return true;
  }
  return (ACCEPTED_ONNX_FILES as readonly string[]).includes(fileName);
}

/** 上传进度信息 */
interface UploadProgress {
  current: number;
  total: number;
  fileName: string;
}

// ── 样式 ──

// 复用 globals.css 中的 .card / .card-mb / .tip-box / .warn-box / .err-box /
// .info-row / .info-label / .info-value / .progress-container / .enabled-badge /
// .dropzone / .dropzone.active / .embedding-active-card 等通用类，避免重复定义。

// ── 组件 ──

export function EmbeddingModelPanel() {
  const [status, setStatus] = useState<ModelStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  /** 当前正在切换/删除的模型 id（用于按钮 loading 态） */
  const [pendingId, setPendingId] = useState<string | null>(null);
  /** 预热状态（预训练数据-4） */
  const [prewarming, setPrewarming] = useState(false);
  const [prewarmProgress, setPrewarmProgress] = useState<{
    current: number;
    total: number;
    message?: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { success, error } = useToastHelpers();

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    try {
      const s = await detectLocalModel();
      setStatus(s);
    } catch (e) {
      errorLogger.warn("[EmbeddingModelPanel] 检测模型失败", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  // ── 上传安装 ──

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      setUploading(true);
      setUploadProgress(null);
      try {
        const fileArray = Array.from(files);
        const acceptedFiles = fileArray.filter((f) => isAcceptedFile(f.name));
        const total = acceptedFiles.length;

        if (total === 0) {
          error(t("settings.embeddingModelUploadFailed"), t("settings.embeddingModelRequiredFiles"));
          return;
        }

        // 必须包含 config.json
        const configFile = acceptedFiles.find((f) => f.name === "config.json");
        if (!configFile) {
          error(t("settings.embeddingModelInstallFailed"), t("settings.embeddingModelConfigRequired"));
          return;
        }

        // 解析 config.json 获取 modelName → 派生 modelId
        let modelId: string;
        try {
          const configText = await configFile.text();
          const config = JSON.parse(configText) as Record<string, unknown>;
          const modelName = String(config.modelName ?? "");
          if (!modelName.trim()) {
            error(t("settings.embeddingModelInstallFailed"), "config.json 缺少 modelName");
            return;
          }
          modelId = deriveModelId(modelName);
        } catch (e) {
          error(
            t("settings.embeddingModelInstallFailed"),
            `config.json 解析失败：${e instanceof Error ? e.message : String(e)}`,
          );
          return;
        }

        // 读取所有文件为 ArrayBuffer
        const fileEntries: Array<{ name: string; data: ArrayBuffer }> = [];
        for (let i = 0; i < total; i++) {
          const file = acceptedFiles[i]!;
          setUploadProgress({ current: i, total, fileName: file.name });
          const data = await file.arrayBuffer();
          fileEntries.push({ name: file.name, data });
        }
        setUploadProgress({ current: total, total, fileName: "" });

        // 安装到子目录
        const result = await installModelFromFiles(modelId, fileEntries);
        if (result.success) {
          success(t("settings.embeddingModelInstallSuccess"), result.entry?.modelName ?? "");
          await refreshStatus();
        } else {
          error(t("settings.embeddingModelInstallFailed"), result.error ?? "");
        }
      } catch (e) {
        error(t("settings.embeddingModelInstallFailed"), e instanceof Error ? e.message : String(e));
      } finally {
        setUploading(false);
        setUploadProgress(null);
      }
    },
    [refreshStatus, success, error],
  );

  // ── 启用模型 ──

  const handleEnable = useCallback(
    async (entry: LocalModelEntry) => {
      setPendingId(entry.id);
      try {
        const result = await setActiveModel(entry.id);
        if (result.success) {
          await refreshStatus();
        } else {
          error(t("settings.embeddingModelInstallFailed"), result.error ?? "");
        }
      } finally {
        setPendingId(null);
      }
    },
    [refreshStatus, error],
  );

  // ── 删除模型 ──

  const handleRemove = useCallback(
    async (entry: LocalModelEntry) => {
      if (!window.confirm(t("settings.embeddingModelRemoveConfirm", { name: entry.modelName }))) {
        return;
      }
      setPendingId(entry.id);
      try {
        const result = await removeModel(entry.id);
        if (result.success) {
          success(t("settings.embeddingModelDeleteSuccess"), "");
          await refreshStatus();
        } else {
          error(t("settings.embeddingModelDeleteFailed"), result.error ?? "");
        }
      } finally {
        setPendingId(null);
      }
    },
    [refreshStatus, success, error],
  );

  // ── 下载引导：复制下载命令到剪贴板 ──

  const handleCopyCommand = useCallback(
    async (repoId: string) => {
      const cmd = `node scripts/download-embedding-model.mjs --model ${repoId}`;
      try {
        await navigator.clipboard.writeText(cmd);
        success(t("settings.embeddingModelCommandCopied"), cmd);
      } catch (e) {
        errorLogger.warn("[EmbeddingModelPanel] 复制命令失败", e);
        // 降级：用 textarea + execCommand
        const textarea = document.createElement("textarea");
        textarea.value = cmd;
        document.body.appendChild(textarea);
        textarea.select();
        try {
          document.execCommand("copy");
          success(t("settings.embeddingModelCommandCopied"), cmd);
        } catch {
          error(t("settings.embeddingModelCopyFailed"), cmd);
        }
        document.body.removeChild(textarea);
      }
    },
    [success, error],
  );

  // ── 下载引导：打开 HuggingFace 模型页面 ──

  const handleOpenHuggingFace = useCallback((repoId: string) => {
    const url = `https://huggingface.co/${repoId}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  // ── 预热 Embedding 缓存（预训练数据-4） ──

  const handlePrewarm = useCallback(async () => {
    setPrewarming(true);
    setPrewarmProgress({ current: 0, total: 0 });
    try {
      const result = await prewarmEmbeddings((progress) => {
        setPrewarmProgress({
          current: progress.current,
          total: progress.total,
          message: progress.message,
        });
      });

      if (result.success) {
        if (result.total === 0) {
          success(t("settings.embeddingPrewarmEmpty"), "");
        } else {
          const strategyLabel = result.strategy === "api"
            ? t("settings.embeddingPrewarmStrategyApi")
            : result.strategy === "local"
              ? t("settings.embeddingPrewarmStrategyLocal")
              : result.strategy ?? "";
          success(
            t("settings.embeddingPrewarmSuccess"),
            t("settings.embeddingPrewarmResult", {
              total: result.total,
              strategy: strategyLabel,
            }),
          );
        }
      } else {
        error(
          t("settings.embeddingPrewarmFailed"),
          result.message ?? t("settings.embeddingPrewarmNoStrategy"),
        );
      }
    } catch (e) {
      errorLogger.warn("[EmbeddingModelPanel] 预热失败", e);
      error(
        t("settings.embeddingPrewarmFailed"),
        e instanceof Error ? e.message : String(e),
      );
    } finally {
      setPrewarming(false);
      setPrewarmProgress(null);
    }
  }, [success, error]);

  // ── 拖拽 ──

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFiles(files);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
      // 重置 input 以便相同文件可重复选择
      e.target.value = "";
    }
  };

  const dropZoneClassName = isDragOver ? "dropzone active" : "dropzone";

  /** 渲染上传进度（current/total + 文件名 + 进度条） */
  const renderUploadProgress = () => {
    if (!uploadProgress) return null;
    const percent = uploadProgress.total > 0
      ? Math.round((uploadProgress.current / uploadProgress.total) * 100)
      : 0;
    return (
      <div className="w-full mt-1">
        <div className="text-xs text-muted-foreground mb-1">
          {uploadProgress.fileName
            ? t("settings.embeddingModelUploadingProgress", {
                current: uploadProgress.current + 1,
                total: uploadProgress.total,
                fileName: uploadProgress.fileName,
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
  };

  /** 渲染单个模型卡片 */
  const renderModelCard = (entry: LocalModelEntry) => {
    const isActive = status?.activeModelId === entry.id;
    const isPending = pendingId === entry.id;
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
                onClick={() => handleEnable(entry)}
                disabled={isPending || uploading}
              >
                {isPending ? <Loader2 size={12} className="animate-spin" /> : <Power size={12} />}
                {t("settings.embeddingModelEnable")}
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-sm text-destructive text-[11px]"
              onClick={() => handleRemove(entry)}
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
  };

  // ── 渲染 ──

  if (loading) {
    return (
      <div className="card mb-3">
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          <Loader2 size={14} className="animate-spin" />
          {t("settings.embeddingModelLoading")}
        </div>
      </div>
    );
  }

  const installedModels = status?.installedModels ?? [];
  const activeEntry = status?.activeModelId
    ? installedModels.find((m) => m.id === status.activeModelId) ?? null
    : null;

  return (
    <div>
      {/* 说明 */}
      <div className="tip-box mb-3">
        <Brain className="inline-block" size={12} /> {t("settings.embeddingModelTip")}
      </div>

      {/* 总体状态 */}
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

      {/* 预热 Embedding 缓存（预训练数据-4） — 仅当有可用模型或 API embedding 时显示 */}
      {(status?.available || installedModels.length > 0) && (
        <div className="card mb-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 text-[13px] font-semibold">
              <Zap size={16} className="text-primary" />
              {t("settings.embeddingPrewarmTitle")}
            </div>
            <button
              type="button"
              className="btn btn-primary btn-sm text-[11px]"
              onClick={handlePrewarm}
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
      )}

      {/* 模型列表 */}
      {installedModels.length > 0 && (
        <div>
          {installedModels.map((entry) => renderModelCard(entry))}
        </div>
      )}

      {/* 下载引导（仅当无已安装模型时显示） */}
      {installedModels.length === 0 && (
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
                      onClick={() => handleCopyCommand(m.repoId)}
                      title={t("settings.embeddingModelCopyCommand")}
                    >
                      <Copy size={12} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm text-[11px]"
                      onClick={() => handleOpenHuggingFace(m.repoId)}
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
      )}

      {/* 上传区域（始终显示，支持追加安装新模型） */}
      <div className="card mb-3">
        <div
          className={dropZoneClassName}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onClick={handleClick}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleClick();
            }
          }}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 size={32} className="animate-spin mx-auto" />
              <div className="text-[13px] font-semibold">{t("settings.embeddingModelUploading")}</div>
              {renderUploadProgress()}
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
          onChange={handleFileInputChange}
        />
      </div>
    </div>
  );
}
