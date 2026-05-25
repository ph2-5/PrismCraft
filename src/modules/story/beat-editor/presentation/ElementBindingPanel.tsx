import { useState, useEffect, useRef, useMemo } from "react";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { container } from "@/infrastructure/di";
import { resolveImageUrl } from "@/shared/utils/image-url";
import {
  Plus,
  Trash2,
  Upload,
  Image as ImageIcon,
  Shield,
  AlertTriangle,
  CheckCircle,
  FolderOpen,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Textarea } from "@/shared/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Badge } from "@/shared/ui/badge";
import { Card, CardContent } from "@/shared/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import type { StoryElement, ReferenceImageQuality, ElementType, StoryBeat, Character, Scene } from "@/domain/schemas";

interface MinimalAsset {
  id: string;
  name: string;
  type: string;
  url?: string;
}

import { validateReferenceImageQuality, buildFeatureAnchoringConfig } from "@/modules/shot";

const elementTypeConfig: Record<string, { label: string; color: string }> = {
  character: { label: "角色", color: "bg-blue-500" },
  prop: { label: "道具", color: "bg-yellow-500" },
  effect: { label: "特效", color: "bg-purple-500" },
};

interface ElementBindingPanelProps {
  beat: StoryBeat;
  elements: StoryElement[];
  characters?: Character[];
  scenes?: Scene[];
  assets?: MinimalAsset[];
  onUpdateBeat: (updatedBeat: StoryBeat) => void;
}

export function ElementBindingPanel({
  beat,
  elements,
  characters = [],
  scenes: _scenes = [],
  assets = [],
  onUpdateBeat,
}: ElementBindingPanelProps) {
  const { error: showError, success: showSuccess } = useToastHelpers();
  const [assetSelectorOpen, setAssetSelectorOpen] = useState(false);
  const [selectingImageForElement, setSelectingImageForElement] = useState<
    string | null
  >(null);
  const boundElementIds = useMemo(
    () => beat.elementIds || [],
    [beat.elementIds],
  );
  const boundElements = boundElementIds
    .map((id) => elements.find((e) => e.id === id))
    .filter((e): e is StoryElement => !!e);

  const [imageQualityMap, setImageQualityMap] = useState<
    Record<string, ReferenceImageQuality>
  >({});

  const getElementBinding = (elementId: string) => {
    return beat.elementBindings?.[elementId] || {};
  };

  const prevBoundElementIdsRef = useRef<string>("");
  const prevAnchoringRef = useRef<string>("");
  useEffect(() => {
    const currentIds = boundElementIds.sort().join(",");
    if (
      boundElementIds.length > 0 &&
      currentIds !== prevBoundElementIdsRef.current
    ) {
      prevBoundElementIdsRef.current = currentIds;
      const config = buildFeatureAnchoringConfig(beat, elements, characters);
      const currentConfig = JSON.stringify(beat.featureAnchoring);
      const newConfig = JSON.stringify(config);
      if (
        currentConfig !== newConfig &&
        newConfig !== prevAnchoringRef.current
      ) {
        prevAnchoringRef.current = newConfig;
        onUpdateBeat({
          ...beat,
          featureAnchoring: config,
        } as StoryBeat);
      }
    }
  }, [boundElementIds, beat, elements, characters, onUpdateBeat]);

  const checkImageQuality = async (
    elementId: string,
    imageUrl: string,
    elementType: ElementType,
  ) => {
    const quality = await validateReferenceImageQuality(imageUrl, elementType);
    setImageQualityMap((prev) => ({ ...prev, [elementId]: quality }));

    if (!quality.isValid) {
      const element = elements.find((e) => e.id === elementId);
      if (element) {
        const em = await container.elementManager;
        await em.updateElement(elementId, {
          referenceImageQuality: quality,
        });
      }
    }
  };

  const handleAddFromCharacter = async (
    character: Character,
    outfitId?: string,
  ) => {
    const existingElement = elements.find(
      (e) => e.type === "character" && e.name === character.name,
    );

    let newElement: StoryElement;
    if (existingElement) {
      newElement = existingElement;
    } else {
      const em = await container.elementManager;
      newElement = await em.createElement(
        "character",
        character.name,
        character.description || character.prompt || "",
      );

      let imageUrl = character.generatedImage;
      if (outfitId && character.outfits) {
        const outfit = character.outfits.find((o) => o.id === outfitId);
        if (outfit?.imageUrl) {
          imageUrl = outfit.imageUrl;
        }
      }

      if (imageUrl) {
        const em2 = await container.elementManager;
        await em2.updateElement(newElement.id, {
          bindings: [
            {
              type: "image" as const,
              url: imageUrl,
              name: `${character.name} 参考图`,
              uploadedAt: new Date().toISOString(),
              isPrimary: true,
            },
          ],
        });
        checkImageQuality(newElement.id, imageUrl, "character");
      }
    }

    const newElementIds = [...boundElementIds, newElement.id];
    const newElementBindings = { ...beat.elementBindings };
    let bindingImageUrl = character.generatedImage;
    if (outfitId && character.outfits) {
      const outfit = character.outfits.find((o) => o.id === outfitId);
      if (outfit?.imageUrl) {
        bindingImageUrl = outfit.imageUrl;
      }
    }
    newElementBindings[newElement.id] = {
      imageUrl: bindingImageUrl,
      text: character.description || character.prompt || "",
      description: character.description || character.prompt || "",
    };

    // 更新角色服装选择
    const newCharacterOutfits = { ...beat.characterOutfits };
    if (outfitId) {
      newCharacterOutfits[character.id] = outfitId;
    }

    onUpdateBeat({
      ...beat,
      elementIds: newElementIds,
      elementBindings: newElementBindings,
      characterOutfits: newCharacterOutfits,
    });
  };

  const [newElementType, setNewElementType] = useState<ElementType>(
    "character",
  );

  const handleCreateNewElement = async () => {
    const em = await container.elementManager;
    const newElement = await em.createElement(
      newElementType,
      "新元素",
      "",
    );

    const newElementIds = [...boundElementIds, newElement.id];
    const newElementBindings = { ...beat.elementBindings };
    newElementBindings[newElement.id] = {};

    onUpdateBeat({
      ...beat,
      elementIds: newElementIds,
      elementBindings: newElementBindings,
    });
  };

  const handleRemoveElement = (elementId: string) => {
    const newElementIds = boundElementIds.filter((id) => id !== elementId);
    const newElementBindings = { ...beat.elementBindings };
    delete newElementBindings[elementId];

    onUpdateBeat({
      ...beat,
      elementIds: newElementIds,
      elementBindings: newElementBindings,
    });
  };

  const handleUpdateElement = async (
    elementId: string,
    updates: Partial<StoryElement>,
  ) => {
    const em = await container.elementManager;
    await em.updateElement(elementId, updates);
  };

  const handleUpdateBinding = (
    elementId: string,
    field: string,
    value: string,
  ) => {
    const newElementBindings = { ...beat.elementBindings };
    newElementBindings[elementId] = {
      ...newElementBindings[elementId],
      [field]: value,
    };

    onUpdateBeat({
      ...beat,
      elementBindings: newElementBindings,
    });
  };

  const handleImageUpload = (
    elementId: string,
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_IMAGE_SIZE) {
      showError("图片过大", "图片不能超过5MB，请压缩后上传");
      return;
    }

    const element = elements.find((el) => el.id === elementId);
    if (!element) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const imageUrl = e.target?.result as string;

      handleUpdateBinding(elementId, "imageUrl", imageUrl);

      const existingBindings = element.bindings || [];
      const hasPrimary = existingBindings.some((b) => b.isPrimary);
      const updatedBindings = [
        ...existingBindings,
        {
          type: "image" as const,
          url: imageUrl,
          name: file.name,
          uploadedAt: new Date().toISOString(),
          isPrimary: !hasPrimary,
        },
      ];
      handleUpdateElement(elementId, { bindings: updatedBindings });
      checkImageQuality(elementId, imageUrl, element.type);
    };
    reader.readAsDataURL(file);
  };

  const handleSelectFromAssetLibrary = (elementId: string) => {
    setSelectingImageForElement(elementId);
    setAssetSelectorOpen(true);
  };

  const handleSelectAsset = (asset: MinimalAsset) => {
    if (!selectingImageForElement) return;

    const element = elements.find((el) => el.id === selectingImageForElement);
    if (!element) return;

    handleUpdateBinding(selectingImageForElement, "imageUrl", asset.url || "");

    const existingBindings = element.bindings || [];
    const hasPrimary = existingBindings.some((b) => b.isPrimary);
    const updatedBindings = [
      ...existingBindings,
      {
        type: "image" as const,
        url: asset.url || "",
        name: asset.name,
        uploadedAt: new Date().toISOString(),
        isPrimary: !hasPrimary,
      },
    ];
    handleUpdateElement(selectingImageForElement, {
      bindings: updatedBindings,
    });
    checkImageQuality(selectingImageForElement, asset.url || "", element.type);

    setAssetSelectorOpen(false);
    setSelectingImageForElement(null);
    showSuccess("选择成功", "已从素材库选择图片作为参考图");
  };

  const availableCharacters = characters.filter(
    (char) =>
      !boundElements.some(
        (el) => el.type === "character" && el.name === char.name,
      ),
  );

  return (
    <div className="space-y-4">
      <div className="bg-blue-900/20 border border-blue-700/30 rounded-lg p-3 text-xs text-blue-300">
        <div className="flex items-center gap-2 mb-1">
          <Shield className="w-4 h-4" />
          <span className="font-medium">特征锚定模式</span>
        </div>
        <p>
          绑定角色参考图作为特征锚点，约束角色外观一致性，不绑定任何帧、不约束动作和镜头时序。场景请在分镜编辑器的场景选择中指定。支持绑定多个角色。
        </p>
      </div>

      <div className="flex gap-2">
        <Select
          onValueChange={(value) => {
            const val = typeof value === "string" ? value : String(value ?? "");
            if (!val) return;
            const [charId, outfitId] = val.split("|");
            const char = characters.find((c) => c.id === charId);
            if (char) handleAddFromCharacter(char, outfitId || undefined);
          }}
          disabled={availableCharacters.length === 0}
        >
          <SelectTrigger className="flex-1 bg-slate-800 border-slate-700">
            <div className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              <span>
                {availableCharacters.length > 0 ? "添加角色" : "暂无可用角色"}
              </span>
            </div>
          </SelectTrigger>
          {availableCharacters.length > 0 && (
            <SelectContent className="bg-slate-800 border-slate-700">
              {availableCharacters.map((char) => (
                <div key={char.id}>
                  <SelectItem value={char.id}>
                    <div className="flex items-center gap-2">
                      {char.generatedImage && (
                        <img
                          src={resolveImageUrl(char.generatedImage) || ""}
                          alt={char.name}
                          className="w-6 h-6 rounded object-cover"
                        />
                      )}
                      <span>{char.name}（默认服装）</span>
                    </div>
                  </SelectItem>
                  {char.outfits?.map((outfit) => (
                    <SelectItem
                      key={`${char.id}|${outfit.id}`}
                      value={`${char.id}|${outfit.id}`}
                    >
                      <div className="flex items-center gap-2 pl-6">
                        {outfit.imageUrl && (
                          <img
                            src={resolveImageUrl(outfit.imageUrl) || ""}
                            alt={outfit.name}
                            className="w-6 h-6 rounded object-cover"
                          />
                        )}
                        <span>
                          {char.name} - {outfit.name}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </div>
              ))}
            </SelectContent>
          )}
        </Select>

        <Select
          value={newElementType}
          onValueChange={(v) => setNewElementType(v as ElementType)}
        >
          <SelectTrigger className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(elementTypeConfig).map(([type, config]) => (
              <SelectItem key={type} value={type}>
                {config.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          onClick={handleCreateNewElement}
          className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500"
        >
          <Plus className="w-4 h-4 mr-2" />
          新建元素
        </Button>
      </div>

      {boundElements.length === 0 ? (
        <div className="text-center py-12 text-slate-400 border-2 border-dashed border-slate-700 rounded-xl">
          <ImageIcon className="w-12 h-12 mx-auto mb-3 text-slate-500" />
          <p className="text-sm">还没有添加任何角色元素</p>
          <p className="text-xs text-slate-500 mt-1">
            绑定角色参考图作为特征锚点，支持多角色
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {boundElements.map((element) => {
            const config = elementTypeConfig[element.type] || {
              label: "元素",
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
                              handleUpdateElement(element.id, {
                                name: e.target.value,
                              })
                            }
                            className="bg-slate-700 border-slate-600 text-white w-40"
                          />
                          {element.bindings?.some((b) => b.isPrimary) && (
                            <Badge className="bg-amber-600 text-[10px]">
                              主参考图
                            </Badge>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-slate-400 hover:text-red-400 hover:bg-red-900/20"
                          onClick={() => handleRemoveElement(element.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>

                      {quality && !quality.isValid && (
                        <div className="bg-red-900/20 border border-red-700/30 rounded p-2 text-xs text-red-400">
                          {quality.issues.map((issue, i) => (
                            <div key={i} className="flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              <span>{issue}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="space-y-3">
                        <div>
                          <label className="text-sm font-medium text-slate-300 mb-1.5 block">
                            参考图（特征锚点）
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
                                  handleImageUpload(element.id, syntheticEvent);
                                  input.remove();
                                };
                                input.oncancel = () => {
                                  input.remove();
                                };
                                input.click();
                              }}
                            >
                              <Upload className="w-4 h-4 mr-2" />
                              上传参考图
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              className="bg-slate-700 hover:bg-slate-600"
                              onClick={() =>
                                handleSelectFromAssetLibrary(element.id)
                              }
                              disabled={assets.length === 0}
                            >
                              <FolderOpen className="w-4 h-4 mr-2" />
                              从素材库选择
                            </Button>
                            {imageUrl && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-slate-400 hover:text-red-400"
                                onClick={() =>
                                  handleUpdateBinding(
                                    element.id,
                                    "imageUrl",
                                    "",
                                  )
                                }
                              >
                                清除
                              </Button>
                            )}
                          </div>
                        </div>

                        <div>
                          <label className="text-sm font-medium text-slate-300 mb-1.5 block">
                            特征描述
                          </label>
                          <Textarea
                            value={binding.text || binding.description || ""}
                            onChange={(e) => {
                              const value = e.target.value;
                              handleUpdateBinding(element.id, "text", value);
                              if (binding.description !== undefined) {
                                handleUpdateBinding(
                                  element.id,
                                  "description",
                                  value,
                                );
                              }
                            }}
                            placeholder="描述角色的核心特征（长相、服饰、配色等）"
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
        </div>
      )}

      <Dialog open={assetSelectorOpen} onOpenChange={setAssetSelectorOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-4xl">
          <DialogHeader>
            <DialogTitle>从素材库选择图片</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 py-4 max-h-96 overflow-y-auto">
            {assets.filter((asset) => asset.type === "image").length > 0 ? (
              assets
                .filter((asset) => asset.type === "image")
                .map((asset) => (
                  <div
                    key={asset.id}
                    onClick={() => handleSelectAsset(asset)}
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
                <p className="text-sm">素材库中还没有可用的图片</p>
                <p className="text-xs text-slate-500 mt-1">
                  请先创建角色或场景，或者在素材库中上传图片
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
