import { useState, useRef, useEffect } from "react";
import {
  Image as ImageIcon,
  Video,
  FolderOpen,
  Upload,
  X,
  Search,
  Check,
  ArrowLeft,
} from "lucide-react";
import { createSimpleVideoErrorHandler } from "@/shared/utils/media-error-handler";
import { t } from "@/shared/constants";
import { Modal } from "@/shared/presentation/Modal";

interface AssetItem {
  id: string;
  name: string;
  url: string;
  thumbnailUrl?: string;
  type: "image" | "video";
  width?: number;
  height?: number;
  duration?: number;
}

interface AssetPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (asset: { url: string; type: "image" | "video"; name: string }) => void;
  accept: "image" | "video" | "both";
  title?: string;
  assets: AssetItem[];
}

// ============= 辅助函数 =============

/** 根据 accept 计算文件选择器的 MIME 类型 */
function getAcceptMime(accept: AssetPickerProps["accept"]): string {
  if (accept === "image") return "image/*";
  if (accept === "video") return "video/*";
  return "image/*,video/*";
}

/** 根据类型选择图标组件 */
function pickTypeIcon(
  type: AssetPickerProps["accept"],
  className: string,
  size: number,
): React.ReactNode {
  if (type === "image") {
    return <ImageIcon size={size} className={className} style={{ color: "var(--muted-fg)" }} />;
  }
  if (type === "video") {
    return <Video size={size} className={className} style={{ color: "var(--muted-fg)" }} />;
  }
  return <ImageIcon size={size} className={className} style={{ color: "var(--muted-fg)" }} />;
}

// ============= 子组件：预览面板 =============

interface AssetPreviewPanelProps {
  asset: AssetItem;
  onBack: () => void;
  onConfirm: () => void;
}

function AssetPreviewPanel({ asset, onBack, onConfirm }: AssetPreviewPanelProps) {
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <div
        className="aspect-video rounded-lg overflow-hidden border border-border"
        style={{ borderColor: "var(--border)", background: "var(--muted)" }}
      >
        {asset.type === "video" ? (
          <video
            src={asset.url}
            className="w-full h-full object-contain"
            controls
            onError={createSimpleVideoErrorHandler()}
          />
        ) : (
          <img
            src={asset.thumbnailUrl || asset.url}
            alt={asset.name}
            className="w-full h-full object-contain"
          />
        )}
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium truncate" style={{ color: "var(--muted-fg)" }}>
          {asset.name}
        </p>
        <div className="flex gap-3 text-xs" style={{ color: "var(--muted-fg)" }}>
          <span>{asset.type === "video" ? t("assetPicker.video") : t("assetPicker.image")}</span>
          {asset.width && asset.height && (
            <span>{asset.width}x{asset.height}</span>
          )}
          {asset.duration && (
            <span>{asset.duration.toFixed(1)}s</span>
          )}
        </div>
      </div>
      <div className="flex gap-2 pt-2">
        <button type="button" className="btn btn-outline flex-1" onClick={onBack}>
          {t("assetPicker.backToSelect")}
        </button>
        <button type="button" className="btn btn-primary flex-1" onClick={onConfirm}>
          <Check className="w-4 h-4 mr-1" />
          {t("assetPicker.confirmSelection")}
        </button>
      </div>
    </div>
  );
}

// ============= 子组件：素材网格项 =============

interface AssetGridItemProps {
  asset: AssetItem;
  onClick: () => void;
}

function AssetGridItem({ asset, onClick }: AssetGridItemProps) {
  return (
    <button
      onClick={onClick}
      className="relative group aspect-video rounded-lg overflow-hidden border border-border hover:border-primary transition-colors"
    >
      {asset.type === "video" ? (
        <div
          className="w-full h-full flex items-center justify-center"
          style={{ background: "var(--muted)" }}
        >
          <Video size={24} style={{ color: "var(--muted-fg)" }} />
        </div>
      ) : (
        <img
          src={asset.thumbnailUrl || asset.url}
          alt={asset.name}
          className="w-full h-full object-cover"
        />
      )}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
      <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-gradient-to-t from-black/60 to-transparent">
        <p className="text-xs text-white truncate">{asset.name}</p>
      </div>
    </button>
  );
}

// ============= 子组件：素材库 Tab =============

interface AssetLibraryTabProps {
  assets: AssetItem[];
  accept: AssetPickerProps["accept"];
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  onPreviewAsset: (asset: AssetItem) => void;
}

function AssetLibraryTab({
  assets,
  accept,
  searchQuery,
  onSearchQueryChange,
  onPreviewAsset,
}: AssetLibraryTabProps) {
  const filteredAssets = assets.filter((asset) => {
    if (accept === "image" && asset.type !== "image") return false;
    if (accept === "video" && asset.type !== "video") return false;
    if (
      searchQuery &&
      !asset.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
      return false;
    return true;
  });

  return (
    <>
      <div className="relative mb-3">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2"
          style={{ color: "var(--muted-fg)" }}
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          placeholder={t("assetPicker.searchPlaceholder")}
          className="w-full pl-9 pr-3 py-2 border border-border rounded-lg bg-card text-sm"
          style={{ color: "var(--muted-fg)" }}
        />
      </div>
      {filteredAssets.length === 0 ? (
        <div className="text-center py-12" style={{ color: "var(--muted-fg)" }}>
          {pickTypeIcon(accept, "mx-auto mb-2 opacity-50", 40)}
          <p className="text-sm">
            {t("assetPicker.noAssetsInLibrary", {
              type: accept === "video" ? t("assetPicker.video") : t("assetPicker.image"),
            })}
          </p>
          <p className="text-xs mt-1">{t("assetPicker.switchToLocalTab")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {filteredAssets.map((asset) => (
            <AssetGridItem
              key={asset.id}
              asset={asset}
              onClick={() => onPreviewAsset(asset)}
            />
          ))}
        </div>
      )}
    </>
  );
}

// ============= 子组件：本地文件 Tab =============

interface AssetLocalTabProps {
  accept: AssetPickerProps["accept"];
  onPick: () => void;
}

function AssetLocalTab({ accept, onPick }: AssetLocalTabProps) {
  const typeLabel =
    accept === "video"
      ? t("assetPicker.video")
      : accept === "image"
        ? t("assetPicker.image")
        : t("assetPicker.selectAsset");

  return (
    <div
      onClick={onPick}
      className="border-2 border-dashed border-border rounded-lg p-12 text-center cursor-pointer hover:border-primary transition-colors"
      role="button"
      tabIndex={0}
      aria-label={t("assetPicker.clickToSelectFile", { type: typeLabel })}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPick();
        }
      }}
    >
      {pickTypeIcon(accept, "mx-auto mb-3", 40)}
      <p className="text-sm" style={{ color: "var(--muted-fg)" }}>
        {t("assetPicker.clickToSelectFile", { type: typeLabel })}
      </p>
      <p className="text-xs mt-1" style={{ color: "var(--muted-fg)" }}>
        {t("assetPicker.orDragHere")}
      </p>
    </div>
  );
}

// ============= 主组件 =============

export default function AssetPicker({
  isOpen,
  onClose,
  onSelect,
  accept,
  title,
  assets,
}: AssetPickerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"library" | "local">("library");
  const [previewAsset, setPreviewAsset] = useState<AssetItem | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const blobUrlRef = useRef<string | null>(null);

  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (prevIsOpen !== isOpen) {
    setPrevIsOpen(isOpen);
    if (!isOpen) {
      setPreviewAsset(null);
      setSearchQuery("");
      setActiveTab("library");
    }
  }

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
    };
  }, []);

  const handleLocalFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
    }
    const url = URL.createObjectURL(file);
    blobUrlRef.current = url;
    const type = file.type.startsWith("video/") ? "video" : "image";
    onSelect({ url, type, name: file.name });
    onClose();
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleConfirmSelection = () => {
    if (!previewAsset) return;
    onSelect({
      url: previewAsset.url,
      type: previewAsset.type,
      name: previewAsset.name,
    });
    onClose();
  };

  const acceptMime = getAcceptMime(accept);

  const modalTitle = previewAsset
    ? t("assetPicker.confirmSelection")
    : title ||
      (accept === "video"
        ? t("assetPicker.selectVideo")
        : accept === "image"
          ? t("assetPicker.selectImage")
          : t("assetPicker.selectAsset"));

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      ariaLabel={modalTitle}
      style={{
        maxWidth: "600px",
        maxHeight: "75vh",
        padding: 0,
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
      }}
    >
      <div
        className="flex items-center justify-between px-5 py-3 border-b"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-2">
          {previewAsset && (
            <button
              onClick={() => setPreviewAsset(null)}
              className="p-1 rounded-lg hover:bg-muted"
              style={{ color: "var(--muted-fg)" }}
              aria-label={t("aria.goBack")}
            >
              <ArrowLeft size={16} />
            </button>
          )}
          <h3 className="font-medium" style={{ color: "var(--muted-fg)" }}>
            {modalTitle}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-muted"
          style={{ color: "var(--muted-fg)" }}
          aria-label={t("aria.close")}
        >
          <X size={18} />
        </button>
      </div>

      {previewAsset ? (
        <AssetPreviewPanel
          asset={previewAsset}
          onBack={() => setPreviewAsset(null)}
          onConfirm={handleConfirmSelection}
        />
      ) : (
        <>
          <div className="flex border-b" style={{ borderColor: "var(--border)" }}>
            <button
              onClick={() => setActiveTab("library")}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "library"
                  ? "border-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              style={activeTab === "library" ? { color: "var(--primary)" } : undefined}
            >
              <FolderOpen size={16} />
              {t("assetPicker.libraryTab")}
            </button>
            <button
              onClick={() => setActiveTab("local")}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "local"
                  ? "border-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              style={activeTab === "local" ? { color: "var(--primary)" } : undefined}
            >
              <Upload size={16} />
              {t("assetPicker.localFileTab")}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {activeTab === "library" && (
              <AssetLibraryTab
                assets={assets}
                accept={accept}
                searchQuery={searchQuery}
                onSearchQueryChange={setSearchQuery}
                onPreviewAsset={setPreviewAsset}
              />
            )}

            {activeTab === "local" && (
              <AssetLocalTab
                accept={accept}
                onPick={() => fileInputRef.current?.click()}
              />
            )}
          </div>
        </>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={acceptMime}
        onChange={handleLocalFile}
        className="hidden"
      />
    </Modal>
  );
}
