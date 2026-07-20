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
 * - @/shared/embedding 的 detectLocalModel / installModelFromFiles / setActiveModel / removeModel /
 *   ACCEPTED_ONNX_FILES / deriveModelId / type ModelStatus / type LocalModelEntry
 * - @/shared/presentation/Toast 的通知
 *
 * 实现拆分（降低函数行数与圈复杂度）：
 * - 状态与处理器 → use-embedding-model-handlers.ts
 * - 子组件与共享常量 → EmbeddingModelPanelParts.tsx
 */

import { Loader2, Brain } from "lucide-react";
import { t } from "@/shared/constants";
import { useEmbeddingModelHandlers } from "./use-embedding-model-handlers";
import { useFaceEmbeddingModel } from "./use-face-embedding-model";
import {
  StatusCard,
  PrewarmCard,
  ModelCard,
  DownloadGuide,
  UploadArea,
  FaceModelCard,
} from "./EmbeddingModelPanelParts";

export function EmbeddingModelPanel() {
  const {
    status,
    loading,
    uploading,
    uploadProgress,
    isDragOver,
    pendingId,
    prewarming,
    prewarmProgress,
    fileInputRef,
    handleEnable,
    handleRemove,
    handleCopyCommand,
    handleOpenHuggingFace,
    handlePrewarm,
    handleDrop,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleClick,
    handleFileInputChange,
  } = useEmbeddingModelHandlers();

  const faceModel = useFaceEmbeddingModel();

  // ── 加载中占位 ──
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
  const showPrewarm = status?.available || installedModels.length > 0;
  const hasInstalledModels = installedModels.length > 0;

  return (
    <div>
      {/* 说明 */}
      <div className="tip-box mb-3">
        <Brain className="inline-block" size={12} /> {t("settings.embeddingModelTip")}
      </div>

      {/* 总体状态 */}
      <StatusCard
        status={status}
        installedModels={installedModels}
        activeEntry={activeEntry}
      />

      {/* 预热 Embedding 缓存（预训练数据-4） — 仅当有可用模型或 API embedding 时显示 */}
      {showPrewarm && (
        <PrewarmCard
          prewarming={prewarming}
          prewarmProgress={prewarmProgress}
          uploading={uploading}
          onPrewarm={handlePrewarm}
        />
      )}

      {/* 模型列表 */}
      {hasInstalledModels && (
        <div>
          {installedModels.map((entry) => (
            <ModelCard
              key={entry.id}
              entry={entry}
              isActive={status?.activeModelId === entry.id}
              isPending={pendingId === entry.id}
              uploading={uploading}
              status={status}
              onEnable={handleEnable}
              onRemove={handleRemove}
            />
          ))}
        </div>
      )}

      {/* 下载引导（仅当无已安装模型时显示） */}
      {!hasInstalledModels && (
        <DownloadGuide
          onCopyCommand={handleCopyCommand}
          onOpenHuggingFace={handleOpenHuggingFace}
        />
      )}

      {/* Face Embedding 模型配置（独立路径，不走 file 上传，配置本地目录） */}
      <FaceModelCard
        savedPath={faceModel.savedPath}
        inputPath={faceModel.inputPath}
        verifyStatus={faceModel.verifyStatus}
        saving={faceModel.saving}
        onInputChange={faceModel.setInputPath}
        onBrowse={faceModel.handleBrowse}
        onVerify={faceModel.handleVerify}
        onSave={faceModel.handleSave}
        onClear={faceModel.handleClear}
      />

      {/* 上传区域（始终显示，支持追加安装新模型） */}
      <UploadArea
        uploading={uploading}
        uploadProgress={uploadProgress}
        isDragOver={isDragOver}
        fileInputRef={fileInputRef}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onClick={handleClick}
        onFileInputChange={handleFileInputChange}
      />
    </div>
  );
}
