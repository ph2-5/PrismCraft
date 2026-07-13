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
    <div
      className="flex items-center gap-2.5 py-2 px-4 border-b border-border bg-primary/8"
      data-testid="asset-batch-toolbar"
    >
      <span className="text-xs text-muted-foreground">
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
      <div className="flex-1" />
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
          <Loader2 size={12} className="animate-spin mr-1" />
        ) : (
          <Trash2 size={12} className="mr-1" />
        )}
        {isBatchDeleting ? t("common.deleting") : t("common.delete")}
      </button>
    </div>
  );
}
