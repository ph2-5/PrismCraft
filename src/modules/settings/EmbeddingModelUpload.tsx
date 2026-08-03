/**
 * Embedding 模型上传相关组件
 *
 * 拆分自 EmbeddingModelPanelParts.tsx（P2.1 拆分超长组件文件）。
 *
 * 包含：
 * - UploadProgress：上传进度（current/total + 文件名 + 进度条）
 * - UploadArea：上传区域（拖拽 + 点击选择文件）
 */

import React from "react";
import { Loader2, Upload } from "lucide-react";
import { t } from "@/shared/constants";
import type {
  UploadProgressInfo,
} from "./embedding-model-constants";

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
