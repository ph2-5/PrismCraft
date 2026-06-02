import {
  Trash2,
  Upload,
  Image as ImageIcon,
  AlertTriangle,
  CheckCircle,
  FolderOpen,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Textarea } from "@/shared/ui/textarea";
import { Badge } from "@/shared/ui/badge";
import { Card, CardContent } from "@/shared/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { resolveImageUrl } from "@/shared/utils/image-url";
import { t } from "@/shared/constants";
import type {
  StoryElement,
  ReferenceImageQuality,
  StoryBeat,
} from "@/domain/schemas";

export interface MinimalAsset {
  id: string;
  name: string;
  type: string;
  url?: string;
}

const elementTypeConfig: Record<string, { label: string; color: string }> = {
  character: { label: t("element.characterLabel"), color: "bg-blue-500" },
  prop: { label: t("element.propLabel"), color: "bg-yellow-500" },
  effect: { label: t("element.effectLabel"), color: "bg-purple-500" },
};

interface ReferenceBindingSectionProps {
  boundElements: StoryElement[];
  beat: StoryBeat;
  imageQualityMap: Record<string, ReferenceImageQuality>;
  assets: MinimalAsset[];
  assetSelectorOpen: boolean;
  selectingImageForElement: string | null;
  getElementBinding: (elementId: string) => Record<string, string>;
  onUpdateElement: (
    elementId: string,
    updates: Partial<StoryElement>,
  ) => Promise<void>;
  onRemoveElement: (elementId: string) => void;
  onUpdateBinding: (
    elementId: string,
    field: string,
    value: string,
  ) => void;
  onImageUpload: (
    elementId: string,
    event: React.ChangeEvent<HTMLInputElement>,
  ) => void;
  onSelectFromAssetLibrary: (elementId: string) => void;
  onSelectAsset: (asset: MinimalAsset) => void;
  onAssetSelectorOpenChange: (open: boolean) => void;
}

export function ReferenceBindingSection({
  boundElements,
  imageQualityMap,
  assets,
  assetSelectorOpen,
  selectingImageForElement: _selectingImageForElement,
  getElementBinding,
  onUpdateElement,
  onRemoveElement,
  onUpdateBinding,
  onImageUpload,
  onSelectFromAssetLibrary,
  onSelectAsset,
  onAssetSelectorOpenChange,
}: ReferenceBindingSectionProps) {
  if (boundElements.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400 border-2 border-dashed border-slate-700 rounded-xl">
        <ImageIcon className="w-12 h-12 mx-auto mb-3 text-slate-500" />
        <p className="text-sm">{t("element.noElementsYet")}</p>
        <p className="text-xs text-slate-500 mt-1">
          {t("element.bindCharacterRef")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {boundElements.map((element) => {
        const config = elementTypeConfig[element.type] || {
          label: t("element.elementLabel"),
          color: "bg-gray-500",
        };
        const binding = getElementBinding(element.id);
        const imageUrl =
          binding.imageUrl ||
          (element.bindings &&
            element.bindings.find((b) => b.isPrimary)?.url) ||
          (element.bindings && element.bindings[0]?.url) ||
          "";
        const quality =
          imageQualityMap[element.id] || element.referenceImageQuality;

        return (
          <Card
            key={element.id}
            className="bg-slate-800/50 border-slate-700"
          >
            <CardContent className="p-4">
              <div className="flex items-start gap-4">
                {imageUrl && (
                  <div className="w-24 h-24 flex-shrink-0 relative">
                    <img
                      src={resolveImageUrl(imageUrl) || ""}
                      alt={element.name}
                      className="w-full h-full object-cover rounded-lg border border-slate-600"
                    />
                    {quality && (
                      <div
                        className={`absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center ${quality.isValid ? "bg-green-500" : "bg-red-500"}`}
                      >
                        {quality.isValid ? (
                          <CheckCircle className="w-3 h-3 text-white" />
                        ) : (
                          <AlertTriangle className="w-3 h-3 text-white" />
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex-1 min-w-0 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge className={config.color}>{config.label}</Badge>
                      <Input
                        value={element.name ?? ""}
                        onChange={(e) =>
                          onUpdateElement(element.id, {
                            name: e.target.value,
                          })
                        }
                        className="bg-slate-700 border-slate-600 text-white w-40"
                      />
                      {element.bindings?.some((b) => b.isPrimary) && (
                        <Badge className="bg-amber-600 text-[10px]">
                          {t("element.primaryRefImage")}
                        </Badge>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-slate-400 hover:text-red-400 hover:bg-red-900/20"
                      onClick={() => onRemoveElement(element.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>

                  {quality && !quality.isValid && (
                    <div className="bg-red-900/20 border border-red-700/30 rounded p-2 text-xs text-red-400">
                      {quality.issues.map((issue) => (
                        <div key={issue} className="flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          <span>{issue}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium text-slate-300 mb-1.5 block">
                        {t("element.refImageAnchor")}
                      </label>
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          className="bg-slate-700 hover:bg-slate-600"
                          onClick={() => {
                            const input = document.createElement("input");
                            input.type = "file";
                            input.accept = "image/*";
                            input.onchange = (_e) => {
                              const syntheticEvent = {
                                target: input,
                              } as React.ChangeEvent<HTMLInputElement>;
                              onImageUpload(element.id, syntheticEvent);
                              input.remove();
                            };
                            input.oncancel = () => {
                              input.remove();
                            };
                            input.click();
                          }}
                        >
                          <Upload className="w-4 h-4 mr-2" />
                          {t("element.uploadRefImage")}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="bg-slate-700 hover:bg-slate-600"
                          onClick={() => onSelectFromAssetLibrary(element.id)}
                          disabled={assets.length === 0}
                        >
                          <FolderOpen className="w-4 h-4 mr-2" />
                          {t("element.selectFromLibrary")}
                        </Button>
                        {imageUrl && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-slate-400 hover:text-red-400"
                            onClick={() =>
                              onUpdateBinding(element.id, "imageUrl", "")
                            }
                          >
                            {t("common.remove")}
                          </Button>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-slate-300 mb-1.5 block">
                        {t("element.featureDescription")}
                      </label>
                      <Textarea
                        value={binding.text || binding.description || ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          onUpdateBinding(element.id, "text", value);
                          if (binding.description !== undefined) {
                            onUpdateBinding(
                              element.id,
                              "description",
                              value,
                            );
                          }
                        }}
                        placeholder={t("element.featureDescPlaceholder")}
                        rows={3}
                        className="bg-slate-700 border-slate-600 resize-none"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      <Dialog open={assetSelectorOpen} onOpenChange={onAssetSelectorOpenChange}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-4xl">
          <DialogHeader>
            <DialogTitle>{t("element.selectFromAssetLibrary")}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 py-4 max-h-96 overflow-y-auto">
            {assets.filter((asset) => asset.type === "image").length > 0 ? (
              assets
                .filter((asset) => asset.type === "image")
                .map((asset) => (
                  <div
                    key={asset.id}
                    onClick={() => onSelectAsset(asset)}
                    className="cursor-pointer group relative aspect-square rounded-lg overflow-hidden border border-slate-700 hover:border-blue-500 transition-all"
                  >
                    <img
                      src={resolveImageUrl(asset.url) || ""}
                      alt={asset.name}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="absolute bottom-0 left-0 right-0 p-2">
                        <p className="text-xs text-white font-medium truncate">
                          {asset.name}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
            ) : (
              <div className="col-span-full text-center py-8 text-slate-400">
                <ImageIcon className="w-12 h-12 mx-auto mb-3 text-slate-500" />
                <p className="text-sm">{t("element.noImagesInLibrary")}</p>
                <p className="text-xs text-slate-500 mt-1">
                  {t("element.createCharacterFirst")}
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
