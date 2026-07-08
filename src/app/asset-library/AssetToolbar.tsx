import {
  Trash2,
  Loader2,
  FolderOpen,
  Upload,
} from "lucide-react";
import { t } from "@/shared/constants";
import type { AssetTab } from "./AssetCardGrid";

interface AssetToolbarProps {
  activeTab: AssetTab;
  selectedIdsSize: number;
  isBatchDeleting: boolean;
  onBatchDelete: () => void;
  onBatchExport: () => void;
  onOpenCollectionDialog: () => void;
  onClearSelection: () => void;
  onSelectAll: () => void;
  showSelectAll: boolean;
}

// 预览页面 batch toolbar 样式：
// padding:8px 16px;border-bottom:1px solid var(--border);background:rgba(var(--primary-rgb),0.08);
// align-items:center;gap:10px;
const batchToolbarStyle: React.CSSProperties = {
  padding: "8px 16px",
  borderBottom: "1px solid var(--border)",
  background: "rgba(var(--primary-rgb), 0.08)",
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const selectedCountStyle: React.CSSProperties = {
  fontSize: 12,
  color: "var(--muted-fg)",
};

const spacerStyle: React.CSSProperties = {
  flex: 1,
};

export function AssetToolbar({
  activeTab,
  selectedIdsSize,
  isBatchDeleting,
  onBatchDelete,
  onBatchExport,
  onOpenCollectionDialog,
  onClearSelection,
  onSelectAll,
  showSelectAll,
}: AssetToolbarProps) {
  // 仅在选中项时显示批量工具栏（对齐预览页面行为）
  if (selectedIdsSize === 0 || activeTab === "collections") {
    return null;
  }

  return (
    <div style={batchToolbarStyle} data-testid="asset-batch-toolbar">
      <span style={selectedCountStyle}>
        {t("asset.selectedCount", { count: selectedIdsSize })}
      </span>
      {showSelectAll && (
        <button type="button" className="btn btn-ghost btn-xs" onClick={onSelectAll}>
          {t("asset.selectAll")}
        </button>
      )}
      <button type="button" className="btn btn-ghost btn-xs" onClick={onClearSelection}>
        {t("asset.deselect")}
      </button>
      <div style={spacerStyle} />
      <button
        type="button"
        className="btn btn-outline btn-xs"
        onClick={onOpenCollectionDialog}
      >
        <FolderOpen className="inline-block" size={12} /> {t("asset.addToCollection")}
      </button>
      <button type="button" className="btn btn-outline btn-xs" onClick={onBatchExport}>
        <Upload className="inline-block" size={12} /> {t("asset.export")}
      </button>
      <button
        type="button"
        className="btn btn-danger btn-xs"
        disabled={isBatchDeleting}
        onClick={onBatchDelete}
      >
        {isBatchDeleting ? (
          <Loader2 size={12} className="animate-spin" style={{ marginRight: 4 }} />
        ) : (
          <Trash2 size={12} style={{ marginRight: 4 }} />
        )}
        {isBatchDeleting ? t("common.deleting") : t("common.delete")}
      </button>
    </div>
  );
}
