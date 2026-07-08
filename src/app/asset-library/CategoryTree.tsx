import { Package, Download, Upload } from "lucide-react";
import { t } from "@/shared/constants/messages";
import type { AssetTab } from "./AssetCardGrid";

const categoryTreeStyle: React.CSSProperties = {
  width: 200,
  flexShrink: 0,
  borderRight: "1px solid var(--border)",
  overflowY: "auto",
  padding: 12,
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

const categoryDividerStyle: React.CSSProperties = {
  borderTop: "1px solid var(--border)",
  margin: "8px 0",
};

const categoryBtnBaseStyle: React.CSSProperties = {
  justifyContent: "flex-start",
  width: "100%",
};

const categoryBtnActiveStyle: React.CSSProperties = {
  background: "rgba(var(--primary-rgb), 0.1)",
  color: "var(--fg)",
};

const countBadgeStyle: React.CSSProperties = {
  fontSize: 10,
  color: "var(--muted-fg)",
  marginLeft: "auto",
};

const propSubCatsStyle: React.CSSProperties = {
  marginLeft: 12,
  display: "flex",
  flexDirection: "column",
  gap: 1,
};

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
  const extraStyle: React.CSSProperties =
    size === "xs"
      ? { justifyContent: "flex-start", width: "100%", fontSize: 11 }
      : { ...categoryBtnBaseStyle };
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      data-active={active ? "true" : undefined}
      className={btnClassName}
      style={{
        ...extraStyle,
        ...(active ? categoryBtnActiveStyle : {}),
      }}
      onClick={onClick}
    >
      <span style={{ marginRight: 6 }}>{icon}</span>
      {label}
      {count !== undefined && count > 0 && (
        <span style={countBadgeStyle}>{count}</span>
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
    <div role="tablist" aria-label={t("asset.category")} style={categoryTreeStyle}>
      <div className="section-label" style={{ marginBottom: 6 }}>
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
      <div style={propSubCatsStyle}>
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
      <div style={categoryDividerStyle} />
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
    <div className="top-tabs" style={{ justifyContent: "space-between" }}>
      <span style={{ fontWeight: 600, fontSize: 14 }}>
        <Package className="inline-block" size={14} /> {t("asset.libraryTitle")}
      </span>
      <div className="toolbar">
        <input
          className="input"
          data-testid="asset-search-input"
          placeholder={t("asset.searchNameDescTag")}
          style={{ fontSize: 12, padding: "6px 10px", width: 180 }}
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
