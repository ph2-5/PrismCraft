import React from "react";
import { X, Upload } from "lucide-react";
import { t } from "@/shared/constants";

interface AssetUploadSectionProps {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDropFiles?: (files: FileList) => void;
  visible?: boolean;
  onClose?: () => void;
}

export function AssetUploadSection({
  fileInputRef,
  onImport,
  onDropFiles,
  visible = false,
  onClose,
}: AssetUploadSectionProps) {
  const [isDragOver, setIsDragOver] = React.useState(false);

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      if (onDropFiles) {
        onDropFiles(files);
      } else if (fileInputRef.current) {
        const dt = new DataTransfer();
        for (let i = 0; i < files.length; i++) {
          const f = files.item(i);
          if (f) dt.items.add(f);
        }
        fileInputRef.current.files = dt.files;
        fileInputRef.current.dispatchEvent(new Event("change", { bubbles: true }));
      }
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

  // 预览页面：上传区域默认隐藏，点击"上传素材"按钮才显示
  if (!visible) {
    return (
      <input
        ref={fileInputRef}
        type="file"
        accept=".asa,image/*,video/*"
        className="hidden"
        onChange={onImport}
      />
    );
  }

  return (
    <div className="p-5 border-b border-border bg-card2">
      <div
        className={`dropzone !p-6 ${isDragOver ? "active" : ""}`}
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
        <div className="mb-2"><Upload size={32} className="mx-auto" /></div>
        <div className="text-[13px] font-semibold">{t("asset.dragOrClickToUpload")}</div>
        <div className="text-[11px] text-muted-foreground mt-1">{t("asset.uploadFormatHint")}</div>
      </div>
      {onClose && (
        <div className="flex justify-end mt-2">
          <button type="button" className="btn btn-ghost btn-xs" onClick={onClose}>
            <X className="w-3 h-3" /> {t("common.close")}
          </button>
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept=".asa,image/*,video/*"
        className="hidden"
        onChange={onImport}
      />
    </div>
  );
}
