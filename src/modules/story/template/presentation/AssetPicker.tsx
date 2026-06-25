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

  if (!isOpen) return null;

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

  const acceptMime =
    accept === "image"
      ? "image/*"
      : accept === "video"
        ? "video/*"
        : "image/*,video/*";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-[600px] max-h-[75vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2">
            {previewAsset && (
              <button
                onClick={() => setPreviewAsset(null)}
                className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                style={{ color: "var(--muted-fg)" }}
              >
                <ArrowLeft size={16} />
              </button>
            )}
            <h3 className="font-medium" style={{ color: "var(--muted-fg)" }}>
              {previewAsset
                ? t("assetPicker.confirmSelection")
                : title || (accept === "video" ? t("assetPicker.selectVideo") : accept === "image" ? t("assetPicker.selectImage") : t("assetPicker.selectAsset"))}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
            style={{ color: "var(--muted-fg)" }}
          >
            <X size={18} />
          </button>
        </div>

        {previewAsset ? (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="aspect-video rounded-lg overflow-hidden border dark:border-gray-600" style={{ borderColor: "var(--border)", background: "var(--muted)" }}>
              {previewAsset.type === "video" ? (
                <video
                  src={previewAsset.url}
                  className="w-full h-full object-contain"
                  controls
                  onError={createSimpleVideoErrorHandler()}
                />
              ) : (
                <img
                  src={previewAsset.thumbnailUrl || previewAsset.url}
                  alt={previewAsset.name}
                  className="w-full h-full object-contain"
                />
              )}
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium truncate" style={{ color: "var(--muted-fg)" }}>
                {previewAsset.name}
              </p>
              <div className="flex gap-3 text-xs" style={{ color: "var(--muted-fg)" }}>
                <span>{previewAsset.type === "video" ? t("assetPicker.video") : t("assetPicker.image")}</span>
                {previewAsset.width && previewAsset.height && (
                  <span>{previewAsset.width}x{previewAsset.height}</span>
                )}
                {previewAsset.duration && (
                  <span>{previewAsset.duration.toFixed(1)}s</span>
                )}
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                className="btn btn-outline flex-1"
                onClick={() => setPreviewAsset(null)}
              >
                {t("assetPicker.backToSelect")}
              </button>
              <button
                type="button"
                className="btn btn-primary flex-1"
                onClick={handleConfirmSelection}
              >
                <Check className="w-4 h-4 mr-1" />
                {t("assetPicker.confirmSelection")}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex border-b" style={{ borderColor: "var(--border)" }}>
              <button
                onClick={() => setActiveTab("library")}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "library"
                    ? "border-blue-500"
                    : "border-transparent text-gray-500 hover:text-gray-700"
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
                    ? "border-blue-500"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
                style={activeTab === "local" ? { color: "var(--primary)" } : undefined}
              >
                <Upload size={16} />
                {t("assetPicker.localFileTab")}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {activeTab === "library" && (
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
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={t("assetPicker.searchPlaceholder")}
                      className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white text-sm"
                      style={{ color: "var(--muted-fg)" }}
                    />
                  </div>
                  {filteredAssets.length === 0 ? (
                    <div className="text-center py-12" style={{ color: "var(--muted-fg)" }}>
                      {accept === "image" ? (
                        <ImageIcon size={40} className="mx-auto mb-2 opacity-50" />
                      ) : (
                        <Video size={40} className="mx-auto mb-2 opacity-50" />
                      )}
                      <p className="text-sm">{t("assetPicker.noAssetsInLibrary", { type: accept === "video" ? t("assetPicker.video") : t("assetPicker.image") })}</p>
                      <p className="text-xs mt-1">{t("assetPicker.switchToLocalTab")}</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {filteredAssets.map((asset) => (
                        <button
                          key={asset.id}
                          onClick={() => setPreviewAsset(asset)}
                          className="relative group aspect-video rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
                        >
                          {asset.type === "video" ? (
                            <div className="w-full h-full flex items-center justify-center" style={{ background: "var(--muted)" }}>
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
                            <p className="text-xs text-white truncate">
                              {asset.name}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}

              {activeTab === "local" && (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-12 text-center cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
                >
                  {accept === "video" ? (
                    <Video size={40} className="mx-auto mb-3" style={{ color: "var(--muted-fg)" }} />
                  ) : (
                    <ImageIcon size={40} className="mx-auto mb-3" style={{ color: "var(--muted-fg)" }} />
                  )}
                  <p className="text-sm" style={{ color: "var(--muted-fg)" }}>
                    {t("assetPicker.clickToSelectFile", { type: accept === "video" ? t("assetPicker.video") : accept === "image" ? t("assetPicker.image") : t("assetPicker.selectAsset") })}
                  </p>
                  <p className="text-xs mt-1" style={{ color: "var(--muted-fg)" }}>
                    {t("assetPicker.orDragHere")}
                  </p>
                </div>
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
      </div>
    </div>
  );
}
