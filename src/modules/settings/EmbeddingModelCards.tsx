/**
 * Embedding 模型卡片组件
 *
 * 拆分自 EmbeddingModelPanelParts.tsx（P2.1 拆分超长组件文件）。
 *
 * 包含：
 * - ModelCard：文本 Embedding 模型卡片（已安装模型列表项）
 * - FaceModelCard：Face Embedding 模型配置卡片（本地目录路径配置）
 */

import {
  CheckCircle2,
  Brain,
  Loader2,
  Power,
  Trash2,
  FileWarning,
  AlertTriangle,
  ScanFace,
  FolderOpen,
  FlaskConical,
  Save,
  Eraser,
} from "lucide-react";
import { t } from "@/shared/constants";
import {
  type ModelStatus,
  type LocalModelEntry,
} from "@/shared/embedding";
import type {
  VerifyStatus,
} from "./use-face-embedding-model";

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

// ── Face Embedding 模型卡片 ──

interface FaceModelCardProps {
  savedPath: string | null;
  inputPath: string;
  verifyStatus: VerifyStatus;
  saving: boolean;
  onInputChange: (v: string) => void;
  onBrowse: () => void;
  onVerify: () => void;
  onSave: () => void;
  onClear: () => void;
}

/**
 * Face Embedding 模型配置卡片。
 *
 * 与 text embedding 的 ModelCard 不同：
 * - 不通过文件上传安装，而是直接配置本地模型目录路径
 * - 提供"测试模型"按钮，调用 verifyFaceModelIntegrity 静态校验目录完整性
 * - 模型路径保存到 config.faceEmbeddingModelPath（null=未配置，走 VLM/noop 降级）
 *
 * 配置后，consistency-qc/face-embedding-service.ts 在首次调用时通过
 * getConfig("faceEmbeddingModelPath") 读取，自动激活 ONNX provider。
 */
export function FaceModelCard({
  savedPath,
  inputPath,
  verifyStatus,
  saving,
  onInputChange,
  onBrowse,
  onVerify,
  onSave,
  onClear,
}: FaceModelCardProps) {
  const isConfigured = !!savedPath;
  const isDirty = inputPath.trim() !== (savedPath ?? "");

  return (
    <div className="card mb-3">
      {/* 标题行 */}
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2 text-[13px] font-semibold min-w-0">
          {isConfigured ? (
            <CheckCircle2 size={16} className="text-success shrink-0" />
          ) : (
            <ScanFace size={16} className="text-muted-foreground shrink-0" />
          )}
          <span className="overflow-hidden text-ellipsis whitespace-nowrap">
            {t("settings.faceEmbeddingModelTitle")}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {isConfigured ? (
            <span className="enabled-badge">
              <CheckCircle2 size={11} /> {t("settings.faceEmbeddingModelConfigured")}
            </span>
          ) : (
            <span className="text-[11px] text-muted-foreground">
              {t("settings.faceEmbeddingModelNotConfigured")}
            </span>
          )}
        </div>
      </div>

      {/* 说明 */}
      <div className="text-[11px] text-muted-foreground mb-2.5 leading-relaxed">
        {t("settings.faceEmbeddingModelHint")}
      </div>

      {/* 路径输入框 + 浏览按钮 */}
      <div className="flex items-center gap-1.5 mb-2">
        <input
          type="text"
          className="input flex-1 text-[12px] font-mono"
          value={inputPath}
          onChange={(e) => onInputChange(e.target.value)}
          placeholder={t("settings.faceEmbeddingModelPathPlaceholder")}
          spellCheck={false}
        />
        <button
          type="button"
          className="btn btn-ghost btn-sm text-[11px]"
          onClick={onBrowse}
          title={t("settings.faceEmbeddingModelBrowseTitle")}
        >
          <FolderOpen size={12} />
          {t("settings.faceEmbeddingModelBrowseButton")}
        </button>
      </div>

      {/* 已保存路径展示 */}
      {isConfigured && (
        <div className="info-row mb-2">
          <span className="info-label">{t("settings.faceEmbeddingModelSavedPathLabel")}</span>
          <span className="info-value font-mono text-[11px] break-all">{savedPath}</span>
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex items-center gap-1.5 mb-2">
        <button
          type="button"
          className="btn btn-ghost btn-sm text-[11px]"
          onClick={onVerify}
          disabled={verifyStatus.kind === "verifying" || !inputPath.trim()}
        >
          {verifyStatus.kind === "verifying" ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <FlaskConical size={12} />
          )}
          {t("settings.faceEmbeddingModelVerifyButton")}
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm text-[11px]"
          onClick={onSave}
          disabled={saving || !isDirty}
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          {t("settings.faceEmbeddingModelSaveButton")}
        </button>
        {isConfigured && (
          <button
            type="button"
            className="btn btn-ghost btn-sm text-destructive text-[11px]"
            onClick={onClear}
            disabled={saving}
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Eraser size={12} />}
            {t("settings.faceEmbeddingModelClearButton")}
          </button>
        )}
      </div>

      {/* 校验结果 */}
      {verifyStatus.kind === "ok" && (
        <div className="ok-box">
          <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold mb-0.5">
              {t("settings.faceEmbeddingModelVerifyOkTitle")}
            </div>
            <div className="text-[11px]">
              {t("settings.faceEmbeddingModelVerifyOkDetail", {
                modelName: verifyStatus.result.modelName ?? "—",
                dimensions: verifyStatus.result.dimensions ?? "—",
                onnxFile: verifyStatus.result.onnxFileName ?? "—",
              })}
            </div>
          </div>
        </div>
      )}
      {verifyStatus.kind === "error" && (
        <div className="err-box">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold mb-0.5">
              {t("settings.faceEmbeddingModelVerifyFailedTitle")}
            </div>
            <div className="text-[11px] break-all">{verifyStatus.message}</div>
          </div>
        </div>
      )}

      {/* 依赖说明 */}
      <div className="tip-box mt-2">
        <Brain className="inline-block" size={12} /> {t("settings.faceEmbeddingModelDependencyHint")}
      </div>
    </div>
  );
}
