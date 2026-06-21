import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import {
  Search,
  Trash2,
  Download,
  FolderOpen,
  Loader2,
} from "lucide-react";
import { t } from "@/shared/constants";
import type { AssetTab } from "./AssetCardGrid";

interface AssetToolbarProps {
  activeTab: AssetTab;
  searchQuery: string;
  onSearchChange: (value: string) => void;
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
  searchQuery,
  onSearchChange,
  selectedIdsSize,
  isBatchDeleting,
  onBatchDelete,
  onBatchExport,
  onOpenCollectionDialog,
  onClearSelection,
  onSelectAll,
  showSelectAll,
}: AssetToolbarProps) {
  return (
    <div className="mt-4 flex flex-col md:flex-row gap-4">
      <div className="flex-1">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            data-testid="asset-search-input"
            placeholder={
              activeTab === "storyboards"
                ? t("asset.searchStoryboard")
                : activeTab === "collections"
                  ? t("asset.searchCollection")
                  : t("asset.searchNameDescTag")
            }
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>
      {selectedIdsSize > 0 && activeTab !== "collections" && (
        <div className="flex gap-2 items-center">
          <span className="text-sm text-muted-foreground">
            {t("asset.selectedCount", { count: selectedIdsSize })}
          </span>
          <Button variant="outline" size="sm" onClick={onBatchExport}>
            <Download className="w-4 h-4 mr-1" />
            {t("asset.export")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenCollectionDialog}
          >
            <FolderOpen className="w-4 h-4 mr-1" />
            {t("asset.addToCollection")}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={isBatchDeleting}
            onClick={onBatchDelete}
          >
            {isBatchDeleting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1" />}
            {isBatchDeleting ? t("common.deleting") : t("common.delete")}
          </Button>
          <Button variant="ghost" size="sm" onClick={onClearSelection}>
            {t("asset.deselect")}
          </Button>
        </div>
      )}
      {activeTab !== "collections" && showSelectAll && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onSelectAll}
        >
          {t("asset.selectAll")}
        </Button>
      )}
    </div>
  );
}
