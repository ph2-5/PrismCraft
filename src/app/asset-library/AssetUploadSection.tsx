import React from "react";
import { t } from "@/shared/constants";

interface AssetUploadSectionProps {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
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
  visible = false,
  onClose,
}: AssetUploadSectionProps) {
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
      <div style={uploadDropZoneStyle}>
        <div style={uploadIconStyle}>📤</div>
        <div style={uploadTitleStyle}>{t("asset.dragOrClickToUpload")}</div>
        <div style={uploadDescStyle}>{t("asset.uploadFormatHint")}</div>
      </div>
      {onClose && (
        <div style={closeBtnRowStyle}>
          <button type="button" className="btn btn-ghost btn-xs" onClick={onClose}>
            ✕ {t("common.close")}
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
