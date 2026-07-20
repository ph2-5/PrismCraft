/**
 * EmbeddingModelPanel 的状态与事件处理器 Hook
 *
 * 拆分自 EmbeddingModelPanel.tsx，用于降低主组件的函数行数。
 *
 * 为了进一步控制每个 hook 函数的行数（≤150），将逻辑拆分为三个 hook：
 * - useEmbeddingModelInstall：上传安装状态 + handleFiles + 拖拽/点击处理器
 * - useEmbeddingModelPrewarm：预热状态 + handlePrewarm
 * - useEmbeddingModelHandlers：组合上述两个 hook，并补充模型状态与启用/删除/下载引导等处理器
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  detectLocalModel,
  installModelFromFiles,
  setActiveModel,
  removeModel,
  deriveModelId,
  type ModelStatus,
  type LocalModelEntry,
} from "@/shared/embedding";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { errorLogger } from "@/shared/error-logger";
import { t } from "@/shared/constants";
import { prewarmEmbeddings } from "@/modules/agent";
import {
  isAcceptedFile,
  type UploadProgressInfo,
  type PrewarmProgressInfo,
} from "./EmbeddingModelPanelParts";

/** useEmbeddingModelHandlers 的返回值类型 */
export interface EmbeddingModelHandlers {
  // 状态
  status: ModelStatus | null;
  loading: boolean;
  uploading: boolean;
  uploadProgress: UploadProgressInfo | null;
  isDragOver: boolean;
  pendingId: string | null;
  prewarming: boolean;
  prewarmProgress: PrewarmProgressInfo | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  // 刷新与安装
  refreshStatus: () => Promise<void>;
  handleFiles: (files: FileList | File[]) => Promise<void>;
  // 模型管理
  handleEnable: (entry: LocalModelEntry) => Promise<void>;
  handleRemove: (entry: LocalModelEntry) => Promise<void>;
  // 下载引导
  handleCopyCommand: (repoId: string) => Promise<void>;
  handleOpenHuggingFace: (repoId: string) => void;
  // 预热
  handlePrewarm: () => Promise<void>;
  // 拖拽与点击
  handleDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  handleDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  handleDragEnter: (e: React.DragEvent<HTMLDivElement>) => void;
  handleDragLeave: (e: React.DragEvent<HTMLDivElement>) => void;
  handleClick: () => void;
  handleFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

/**
 * 上传安装相关状态与处理器
 *
 * 管理 uploading / uploadProgress / isDragOver / fileInputRef，
 * 以及 handleFiles 与拖拽、点击选择文件相关的事件处理器。
 */
function useEmbeddingModelInstall(refreshStatus: () => Promise<void>) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgressInfo | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { success, error } = useToastHelpers();

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

  return {
    uploading,
    uploadProgress,
    isDragOver,
    fileInputRef,
    handleFiles,
    handleDrop,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleClick,
    handleFileInputChange,
  };
}

/**
 * 预热 Embedding 缓存相关状态与处理器（预训练数据-4）
 */
function useEmbeddingModelPrewarm() {
  const [prewarming, setPrewarming] = useState(false);
  const [prewarmProgress, setPrewarmProgress] = useState<PrewarmProgressInfo | null>(null);
  const { success, error } = useToastHelpers();

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

  return { prewarming, prewarmProgress, handlePrewarm };
}

/**
 * 管理 EmbeddingModelPanel 的全部状态与事件处理器
 *
 * 组合 useEmbeddingModelInstall 与 useEmbeddingModelPrewarm，
 * 并补充模型状态检测、启用/删除、下载引导等处理器。
 */
export function useEmbeddingModelHandlers(): EmbeddingModelHandlers {
  const [status, setStatus] = useState<ModelStatus | null>(null);
  const [loading, setLoading] = useState(true);
  /** 当前正在切换/删除的模型 id（用于按钮 loading 态） */
  const [pendingId, setPendingId] = useState<string | null>(null);
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

  // 启用模型
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

  // 删除模型
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

  // 下载引导：复制下载命令到剪贴板
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

  // 下载引导：打开 HuggingFace 模型页面
  const handleOpenHuggingFace = useCallback((repoId: string) => {
    const url = `https://huggingface.co/${repoId}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  // 组合子 hook
  const install = useEmbeddingModelInstall(refreshStatus);
  const prewarm = useEmbeddingModelPrewarm();

  return {
    status,
    loading,
    pendingId,
    refreshStatus,
    handleEnable,
    handleRemove,
    handleCopyCommand,
    handleOpenHuggingFace,
    ...install,
    ...prewarm,
  };
}
