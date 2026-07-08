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

// 预览页面上传区域外层样式：
// padding:20px;border-bottom:1px solid var(--border);background:var(--card2);
const uploadAreaWrapperStyle: React.CSSProperties = {
  padding: 20,
  borderBottom: "1px solid var(--border)",
  background: "var(--card2)",
};

// 预览页面上传区域内层样式：
// border:2px dashed var(--border);border-radius:12px;padding:24px;text-align:center;cursor:pointer;
const uploadDropZoneStyle: React.CSSProperties = {
  border: "2px dashed var(--border)",
  borderRadius: 12,
  padding: 24,
  textAlign: "center",
  cursor: "pointer",
};

const uploadIconStyle: React.CSSProperties = {
  fontSize: 32,
  marginBottom: 8,
};

const uploadTitleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
};

const uploadDescStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--muted-fg)",
  marginTop: 4,
};

const closeBtnRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  marginTop: 8,
};

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

  const dropZoneStyle: React.CSSProperties = isDragOver
    ? { ...uploadDropZoneStyle, borderColor: "var(--primary)", background: "rgba(var(--primary-rgb), 0.08)" }
    : uploadDropZoneStyle;

  // 预览页面：上传区域默认隐藏，点击"上传素材"按钮才显示
  if (!visible) {
    return (
      <input
        ref={fileInputRef}
        type="file"
        accept=".asa,image/*,video/*"
        style={{ display: "none" }}
        onChange={onImport}
      />
    );
  }

  return (
    <div style={uploadAreaWrapperStyle}>
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
        <div style={uploadIconStyle}><Upload size={32} style={{ margin: "0 auto" }} /></div>
        <div style={uploadTitleStyle}>{t("asset.dragOrClickToUpload")}</div>
        <div style={uploadDescStyle}>{t("asset.uploadFormatHint")}</div>
      </div>
      {onClose && (
        <div style={closeBtnRowStyle}>
          <button type="button" className="btn btn-ghost btn-xs" onClick={onClose}>
            <X className="w-3 h-3" /> {t("common.close")}
          </button>
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept=".asa,image/*,video/*"
        style={{ display: "none" }}
        onChange={onImport}
      />
    </div>
  );
}
