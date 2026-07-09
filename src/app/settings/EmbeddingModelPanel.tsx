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
} from "@/infrastructure/embedding";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { errorLogger } from "@/shared/error-logger";

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

const cardStyle: React.CSSProperties = {
  padding: 16,
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  marginBottom: 12,
};

const dropZoneBaseStyle: React.CSSProperties = {
  border: "2px dashed var(--border)",
  borderRadius: 12,
  padding: 32,
  textAlign: "center",
  cursor: "pointer",
  transition: "border-color 0.2s, background 0.2s",
};

const infoRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  padding: "6px 0",
  borderBottom: "1px solid var(--border)",
  fontSize: 12,
};

const infoLabelStyle: React.CSSProperties = {
  color: "var(--muted-fg)",
  flexShrink: 0,
};

const infoValueStyle: React.CSSProperties = {
  fontWeight: 500,
  textAlign: "right",
  wordBreak: "break-all" as const,
};

/** 警告条样式（缺失文件，黄色） */
const warningBoxStyle: React.CSSProperties = {
  padding: "8px 12px",
  background: "rgba(234, 179, 8, 0.1)",
  border: "1px solid rgba(234, 179, 8, 0.3)",
  borderRadius: 6,
  marginBottom: 12,
  fontSize: 11,
  color: "#a16207",
  display: "flex",
  alignItems: "flex-start",
  gap: 6,
};

/** 错误条样式（完整性校验失败，红色） */
const errorBoxStyle: React.CSSProperties = {
  padding: "8px 12px",
  background: "rgba(239, 68, 68, 0.1)",
  border: "1px solid rgba(239, 68, 68, 0.3)",
  borderRadius: 6,
  marginBottom: 12,
  fontSize: 11,
  color: "#b91c1c",
  display: "flex",
  alignItems: "flex-start",
  gap: 6,
};

/** 进度条容器 */
const progressContainerStyle: React.CSSProperties = {
  width: "100%",
  height: 6,
  background: "var(--border)",
  borderRadius: 3,
  overflow: "hidden",
  marginTop: 8,
};

/** 启用中标记样式 */
const enabledBadgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "2px 8px",
  background: "rgba(34, 197, 94, 0.12)",
  border: "1px solid rgba(34, 197, 94, 0.3)",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 600,
  color: "#15803d",
};

// ── 组件 ──

export function EmbeddingModelPanel() {
  const [status, setStatus] = useState<ModelStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  /** 当前正在切换/删除的模型 id（用于按钮 loading 态） */
  const [pendingId, setPendingId] = useState<string | null>(null);
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

  const dropZoneStyle: React.CSSProperties = isDragOver
    ? { ...dropZoneBaseStyle, borderColor: "var(--primary)", background: "rgba(var(--primary-rgb), 0.08)" }
    : dropZoneBaseStyle;

  /** 渲染上传进度（current/total + 文件名 + 进度条） */
  const renderUploadProgress = () => {
    if (!uploadProgress) return null;
    const percent = uploadProgress.total > 0
      ? Math.round((uploadProgress.current / uploadProgress.total) * 100)
      : 0;
    return (
      <div style={{ width: "100%", marginTop: 4 }}>
        <div style={{ fontSize: 12, color: "var(--muted-fg)", marginBottom: 4 }}>
          {uploadProgress.fileName
            ? t("settings.embeddingModelUploadingProgress", {
                current: uploadProgress.current + 1,
                total: uploadProgress.total,
                fileName: uploadProgress.fileName,
              })
            : t("settings.embeddingModelUploading")}
        </div>
        <div style={progressContainerStyle}>
          <div
            style={{
              width: `${percent}%`,
              height: "100%",
              background: "var(--primary)",
              borderRadius: 3,
              transition: "width 0.2s ease",
            }}
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
        style={{
          ...cardStyle,
          ...(isActive
            ? { borderColor: "rgba(34, 197, 94, 0.4)", boxShadow: "0 0 0 1px rgba(34, 197, 94, 0.1)" }
            : {}),
        }}
      >
        {/* 标题行：名称 + 操作 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, minWidth: 0 }}>
            {isActive ? (
              <CheckCircle2 size={16} style={{ color: "var(--success)", flexShrink: 0 }} />
            ) : (
              <Brain size={16} style={{ color: "var(--muted-fg)", flexShrink: 0 }} />
            )}
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {entry.modelName}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            {isActive ? (
              <span style={enabledBadgeStyle}>
                <CheckCircle2 size={11} /> {t("settings.embeddingModelEnabled")}
              </span>
            ) : (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => handleEnable(entry)}
                disabled={isPending || uploading}
                style={{ fontSize: 11 }}
              >
                {isPending ? <Loader2 size={12} className="animate-spin" /> : <Power size={12} />}
                {t("settings.embeddingModelEnable")}
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => handleRemove(entry)}
              disabled={isPending || uploading}
              style={{ color: "var(--destructive)", fontSize: 11 }}
            >
              {isPending ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
            </button>
          </div>
        </div>

        {/* 元信息 */}
        <div style={{ marginBottom: 8 }}>
          <div style={infoRowStyle}>
            <span style={infoLabelStyle}>{t("settings.embeddingModelDimensions")}</span>
            <span style={infoValueStyle}>{entry.dimensions}</span>
          </div>
          <div style={infoRowStyle}>
            <span style={infoLabelStyle}>{t("settings.embeddingModelMaxTokens")}</span>
            <span style={infoValueStyle}>{entry.maxTokens}</span>
          </div>
          <div style={infoRowStyle}>
            <span style={infoLabelStyle}>{t("settings.embeddingModelLanguage")}</span>
            <span style={infoValueStyle}>{entry.language}</span>
          </div>
          <div style={infoRowStyle}>
            <span style={infoLabelStyle}>ONNX</span>
            <span style={{ ...infoValueStyle, fontFamily: "monospace", fontSize: 11 }}>
              {entry.modelFileName}
            </span>
          </div>
          {entry.description && (
            <div style={infoRowStyle}>
              <span style={infoLabelStyle}>{t("settings.embeddingModelDescription")}</span>
              <span style={infoValueStyle}>{entry.description}</span>
            </div>
          )}
        </div>

        {/* active 模型的缺失文件 / 完整性错误 */}
        {isActive && status && !status.available && (
          <>
            {status.missingFiles.length > 0 && (
              <div style={warningBoxStyle}>
                <FileWarning size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>
                    {t("settings.embeddingModelMissingFiles")}
                  </div>
                  <div>{status.missingFiles.join(", ")}</div>
                </div>
              </div>
            )}
            {status.integrityErrors.length > 0 && (
              <div style={errorBoxStyle}>
                <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>
                    {t("settings.embeddingModelIntegrityErrors")}
                  </div>
                  <div style={{ marginBottom: 4 }}>
                    {t("settings.embeddingModelIntegrityTip")}
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {status.integrityErrors.map((err, idx) => (
                      <li key={idx} style={{ marginBottom: 2 }}>{err}</li>
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
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--muted-fg)", fontSize: 12 }}>
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
      <div
        style={{
          padding: 12,
          background: "rgba(var(--primary-rgb), 0.08)",
          border: "1px solid rgba(var(--primary-rgb), 0.2)",
          borderRadius: 8,
          marginBottom: 12,
          fontSize: 11,
          color: "var(--muted-fg)",
        }}
      >
        <Brain className="inline-block" size={12} /> {t("settings.embeddingModelTip")}
      </div>

      {/* 总体状态 */}
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontSize: 13, fontWeight: 600 }}>
          {status?.available ? (
            <>
              <CheckCircle2 size={16} style={{ color: "var(--success)" }} />
              {t("settings.embeddingModelInstalled")}
            </>
          ) : (
            <>
              <XCircle size={16} style={{ color: "var(--muted-fg)" }} />
              {t("settings.embeddingModelNotInstalled")}
            </>
          )}
        </div>
        <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>
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

      {/* 模型列表 */}
      {installedModels.length > 0 && (
        <div>
          {installedModels.map((entry) => renderModelCard(entry))}
        </div>
      )}

      {/* 上传区域（始终显示，支持追加安装新模型） */}
      <div style={cardStyle}>
        <div
          style={dropZoneStyle}
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
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <Loader2 size={32} className="animate-spin" style={{ margin: "0 auto" }} />
              <div style={{ fontSize: 13, fontWeight: 600 }}>{t("settings.embeddingModelUploading")}</div>
              {renderUploadProgress()}
            </div>
          ) : (
            <>
              <div style={{ fontSize: 32, marginBottom: 8 }}>
                <Upload size={32} style={{ margin: "0 auto" }} />
              </div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{t("settings.embeddingModelDragHint")}</div>
              <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 4 }}>
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
          style={{ display: "none" }}
          onChange={handleFileInputChange}
        />
      </div>
    </div>
  );
}
