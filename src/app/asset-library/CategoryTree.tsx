import { Package, Download, Upload } from "lucide-react";
import { t } from "@/shared/constants/messages";
import type { AssetTab } from "./AssetCardGrid";

const CATEGORY_TREE_CLASS = "w-[200px] shrink-0 border-r border-border overflow-y-auto p-3 flex flex-col gap-0.5";

const CATEGORY_DIVIDER_CLASS = "border-t border-border my-2";

const COUNT_BADGE_CLASS = "text-[10px] text-muted-foreground ml-auto";

const PROP_SUB_CATS_CLASS = "ml-3 flex flex-col gap-px";

interface CategoryButtonProps {
  icon: string;
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
  size?: "sm" | "xs";
}

export function CategoryButton({
  icon,
  label,
  count,
  active,
  onClick,
  size = "sm",
}: CategoryButtonProps) {
  const btnClassName =
    size === "xs" ? "btn btn-ghost btn-xs" : "btn btn-ghost btn-sm";
  const extraClassName =
    size === "xs"
      ? "justify-start w-full text-[11px]"
      : "justify-start w-full";
  const activeClassName = active ? "bg-primary/10 text-foreground" : "";
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      data-active={active ? "true" : undefined}
      className={`${btnClassName} ${extraClassName} ${activeClassName}`}
      onClick={onClick}
    >
      <span className="mr-1.5">{icon}</span>
      {label}
      {count !== undefined && count > 0 && (
        <span className={COUNT_BADGE_CLASS}>{count}</span>
      )}
    </button>
  );
}

interface CategoryTreeProps {
  activeTab: AssetTab;
  onTabChange: (tab: AssetTab) => void;
  charactersCount: number;
  scenesCount: number;
  storyboardsCount: number;
  collectionsCount: number;
}

export function CategoryTree({
  activeTab,
  onTabChange,
  charactersCount,
  scenesCount,
  storyboardsCount,
  collectionsCount,
}: CategoryTreeProps) {
  return (
    <div role="tablist" aria-label={t("asset.category")} className={CATEGORY_TREE_CLASS}>
      <div className="section-label mb-1.5">
        {t("asset.category")}
      </div>
      <CategoryButton
        icon=""
        label={t("asset.allAssets")}
        active={activeTab === "all"}
        onClick={() => onTabChange("all")}
      />
      <CategoryButton
        icon=""
        label={t("asset.characterLibrary")}
        count={charactersCount}
        active={activeTab === "characters"}
        onClick={() => onTabChange("characters")}
      />
      <CategoryButton
        icon=""
        label={t("asset.sceneLibrary")}
        count={scenesCount}
        active={activeTab === "scenes"}
        onClick={() => onTabChange("scenes")}
      />
      <CategoryButton
        icon=""
        label={t("asset.storyboardLibrary")}
        count={storyboardsCount}
        active={activeTab === "storyboards"}
        onClick={() => onTabChange("storyboards")}
      />
      <CategoryButton
        icon=""
        label={t("asset.props")}
        active={activeTab === "props"}
        onClick={() => onTabChange("props")}
      />
      <div className={PROP_SUB_CATS_CLASS}>
        <CategoryButton
          icon="└"
          label={t("asset.propClothing")}
          active={activeTab === "prop-clothing"}
          onClick={() => onTabChange("prop-clothing")}
          size="xs"
        />
        <CategoryButton
          icon="└"
          label={t("asset.propWeapon")}
          active={activeTab === "prop-weapon"}
          onClick={() => onTabChange("prop-weapon")}
          size="xs"
        />
        <CategoryButton
          icon="└"
          label={t("asset.propAccessory")}
          active={activeTab === "prop-accessory"}
          onClick={() => onTabChange("prop-accessory")}
          size="xs"
        />
        <CategoryButton
          icon="└"
          label={t("asset.propProp")}
          active={activeTab === "prop-prop"}
          onClick={() => onTabChange("prop-prop")}
          size="xs"
        />
      </div>
      <div className={CATEGORY_DIVIDER_CLASS} />
      <CategoryButton
        icon=""
        label={t("asset.myCollections")}
        count={collectionsCount}
        active={activeTab === "collections"}
        onClick={() => onTabChange("collections")}
      />
      <CategoryButton
        icon=""
        label={t("asset.media")}
        active={activeTab === "media"}
        onClick={() => onTabChange("media")}
      />
    </div>
  );
}

interface TopHeaderProps {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onShowUploadArea: () => void;
  onOpenImportDialog: () => void;
  onBatchExport: () => void;
}

export function TopHeader({
  searchQuery,
  onSearchQueryChange,
  onShowUploadArea,
  onOpenImportDialog,
  onBatchExport,
}: TopHeaderProps) {
  return (
    <div className="top-tabs justify-between">
      <span className="font-semibold text-sm">
        <Package className="inline-block" size={14} /> {t("asset.libraryTitle")}
      </span>
      <div className="toolbar">
        <input
          className="input !text-xs !py-1.5 !px-2.5 w-[180px]"
          data-testid="asset-search-input"
          placeholder={t("asset.searchNameDescTag")}
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
        />
        <button
          className="btn btn-primary btn-sm"
          onClick={onShowUploadArea}
        >
          + {t("common.upload")}
        </button>
        <button
          className="btn btn-outline btn-sm"
          onClick={onOpenImportDialog}
        >
          <Download className="inline-block" size={12} /> {t("asset.importAsa")}
        </button>
        <button
          className="btn btn-outline btn-sm"
          onClick={onBatchExport}
        >
          <Upload className="inline-block" size={12} /> {t("asset.export")}
        </button>
      </div>
    </div>
  );
}
