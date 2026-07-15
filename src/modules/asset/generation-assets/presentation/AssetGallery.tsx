/**
 * AssetGallery — 生成资产画廊组件（Task 4.11）
 *
 * 功能：按类型/项目筛选生成资产，缩略图网格展示，支持删除和清理未引用资产
 */
import { memo, useState } from "react";
import { Trash2, Image, Film, FileVideo, Sparkles } from "lucide-react";
import { t } from "@/shared/constants";
import type { GenerationAsset } from "@/domain/schemas";
import { useGenerationAssets } from "../hooks/use-generation-assets";

const FILTER_OPTIONS = [
  { value: "", label: "genAsset.filterAll" },
  { value: "keyframe", label: "genAsset.filterKeyframe" },
  { value: "first_frame", label: "genAsset.filterFirstFrame" },
  { value: "last_frame", label: "genAsset.filterLastFrame" },
  { value: "video", label: "genAsset.filterVideo" },
  { value: "character_image", label: "genAsset.filterCharacterImage" },
  { value: "scene_image", label: "genAsset.filterSceneImage" },
  { value: "variant_image", label: "genAsset.filterVariantImage" },
  { value: "uploaded", label: "genAsset.filterUploaded" },
] as const;

function getAssetIcon(type: string) {
  if (type === "video") return Film;
  if (type === "uploaded") return FileVideo;
  return Image;
}

interface AssetGalleryProps {
  projectId?: string;
}

export const AssetGallery = memo(function AssetGallery({ projectId }: AssetGalleryProps) {
  const [filterType, setFilterType] = useState<string>("");
  const { assets, loading, remove, cleanUnreferenced } = useGenerationAssets({
    type: filterType || undefined,
    projectId,
  });
  const [selected, setSelected] = useState<GenerationAsset | null>(null);

  const handleClean = async () => {
    await cleanUnreferenced();
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between">
        <span className="section-label flex items-center gap-1">
          <Sparkles size={14} /> {t("genAsset.title")}
        </span>
        <button
          className="btn btn-sm btn-ghost"
          onClick={handleClean}
          title={t("genAsset.deleteUnreferenced")}
        >
          {t("genAsset.deleteUnreferenced")}
        </button>
      </div>

      <div className="flex flex-wrap gap-1">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            className={`btn btn-sm ${filterType === opt.value ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setFilterType(opt.value)}
          >
            {t(opt.label)}
          </button>
        ))}
      </div>

      {loading && <div className="text-muted text-sm">...</div>}

      {!loading && assets.length === 0 && (
        <div className="text-muted text-sm flex items-center justify-center py-8">
          {t("genAsset.empty")}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-3 gap-2">
          {assets.map((asset) => {
            const Icon = getAssetIcon(asset.type);
            return (
              <div
                key={asset.id}
                className="border rounded p-1 cursor-pointer hover:border-primary"
                style={{ borderColor: "var(--border)" }}
                onClick={() => setSelected(asset)}
              >
                <div className="aspect-square rounded overflow-hidden bg-muted mb-1 flex items-center justify-center">
                  {asset.thumbnailPath || asset.url ? (
                    <img
                      src={asset.thumbnailPath || asset.url}
                      alt={asset.type}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Icon size={24} className="text-muted" />
                  )}
                </div>
                <div className="text-xs truncate">{asset.type}</div>
              </div>
            );
          })}
        </div>
      </div>

      {selected && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-background rounded-lg p-4 max-w-md w-full mx-4 flex flex-col gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium">{selected.type}</span>
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  void remove(selected.id);
                  setSelected(null);
                }}
              >
                <Trash2 size={14} /> {t("genAsset.delete")}
              </button>
            </div>
            {selected.url && (
              <img src={selected.url} alt={selected.type} className="w-full rounded" />
            )}
            {selected.prompt && (
              <div className="text-xs">
                <span className="text-muted">{t("genAsset.prompt")}:</span> {selected.prompt}
              </div>
            )}
            {selected.modelId && (
              <div className="text-xs">
                <span className="text-muted">{t("genAsset.model")}:</span> {selected.modelId}
              </div>
            )}
            <div className="text-xs text-muted">{t("genAsset.createdAt")}: {selected.createdAt}</div>
          </div>
        </div>
      )}
    </div>
  );
});
