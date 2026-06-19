import { ImageIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { t } from "@/shared/constants";

interface Asset {
  id: string;
  name: string;
  url: string;
  type: "image" | "video";
  boundTo?: { type: string; id: string; name: string };
}

interface AssetSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assets: Asset[];
  description: string;
  onSelect: (asset: Asset) => void;
}

export function AssetSelectorDialog({
  open,
  onOpenChange,
  assets,
  description,
  onSelect,
}: AssetSelectorDialogProps) {
  const imageAssets = assets.filter((a) => a.type === "image");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{t("dialog.selectAsset")}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 p-4">
            {imageAssets.map((asset) => (
              <div
                key={asset.id}
                onClick={() => onSelect(asset)}
                className="cursor-pointer group relative aspect-square rounded-lg overflow-hidden border border-slate-700 hover:border-amber-500 transition-all focus:outline-none focus:ring-2 focus:ring-amber-500"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(asset);
                  }
                }}
                aria-label={t("dialog.selectAssetItem", { name: asset.name })}
              >
                <img
                  src={asset.url}
                  alt={asset.name}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="absolute bottom-0 left-0 right-0 p-2">
                    <p className="text-xs text-white font-medium truncate">
                      {asset.name}
                    </p>
                    {asset.boundTo && (
                      <p className="text-xs text-amber-300 truncate">
                        {t("dialog.boundTo", { name: asset.boundTo.name })}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {imageAssets.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <ImageIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{t("dialog.noImagesInLibrary")}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export type { Asset, AssetSelectorDialogProps };
