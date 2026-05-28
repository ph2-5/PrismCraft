"use client";

import { useState, useRef, useEffect, useCallback, Suspense } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useDirtyState } from "@/shared/hooks/use-dirty-state";
import { useCharacters } from "@/modules/character";
import { useStories, storyService } from "@/modules/story";
import { useMediaAssets, useCreateMediaAsset } from "@/modules/asset";
import { characterService } from "@/modules/character";
import { errorLogger } from "@/shared/error-logger";
import { resolveImageUrl } from "@/shared/utils/image-url";
import { PageErrorBoundary } from "@/shared/presentation/PageErrorBoundary";
import { Button } from "@/shared/ui/button";
import {
  Card,
  CardContent,
} from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { Badge } from "@/shared/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import type { Character } from "@/domain/schemas";
import {
  Plus,
  Wand2,
  Save,
  Trash2,
  Users,
  X,
  Loader2,
  Upload,
  ImageIcon,
  ScanLine,
  AlertTriangle,
  Sparkles,
  Folder,
  Shirt,
  GitBranch,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { BatchOperations } from "@/modules/asset";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { useGlobalKeyboardActions } from "@/shared/hooks/use-global-keyboard-actions";
import {
  CharacterListItem,
} from "@/modules/character";
import { MediaExporter } from "@/modules/asset";
import { ModelSelector } from "@/modules/prompt";
import {
  defaultCharacter,
  personalitySuggestions,
  styleSuggestions,
  genderSuggestions,
  heightSuggestions,
  buildSuggestions,
  useCharacterImage,
  useCharacterCRUD,
  useOutfitManagement,
} from "@/modules/character";
import { confirm } from "@/shared/utils/confirm";
import { SaveStatusIndicator } from "@/shared/presentation/SaveStatusIndicator";

export default function CharactersPage() {
  return (
    <Suspense>
      <CharactersPageContent />
    </Suspense>
  );
}

function CharactersPageContent() {
  const { markDirty, markClean, isDirty } = useDirtyState();
  const queryClient = useQueryClient();
  const createMediaAssetMutation = useCreateMediaAsset();
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");

  const { data: characters = [], isLoading: charactersLoading } = useCharacters();
  const { data: stories = [] } = useStories();
  const { data: assets = [], isLoading: _assetsLoading } = useMediaAssets();
  const [showAssetSelector, setShowAssetSelector] = useState(false);
  const [currentCharacter, setCurrentCharacterRaw] =
    useState<Character>(defaultCharacter);
  const setCurrentCharacter = useCallback(
    (update: Character | ((prev: Character) => Character), shouldMarkDirty = false) => {
      setCurrentCharacterRaw(update);
      if (shouldMarkDirty) markDirty("characters");
    },
    [markDirty],
  );
  const currentCharacterRef = useRef(currentCharacter);
  useEffect(() => { currentCharacterRef.current = currentCharacter; }, [currentCharacter]);
  const [customTrait, setCustomTrait] = useState("");
  const [, setCustomStyle] = useState("");
  const { success, error: showError } = useToastHelpers();

  const addAssetToLibrary = async (
    url: string,
    type: "image" | "video",
    name: string,
    boundTo?: { type: "character" | "scene"; id: string; name: string },
  ) => {
    await createMediaAssetMutation.mutateAsync({
      name,
      type,
      url,
      description: "",
      tags: [],
      boundTo,
    });
  };

  const {
    isGenerating,
    setIsGenerating,
    generatedImage,
    setGeneratedImage,
    isUploading,
    isAnalyzing,
    useDetailedPrompt,
    setUseDetailedPrompt,
    imageSize,
    setImageSize,
    fileInputRef,
    analyzeFileInputRef,
    selectedImageModel,
    setSelectedImageModel,
    generatePrompt,
    generateImage,
    saveImageToCharacter,
    handleFileUpload,
    handleAnalyzeFileUpload,
  } = useCharacterImage({
    currentCharacter,
    currentCharacterRef,
    setCurrentCharacter,
    addAssetToLibrary,
    success,
    showError,
  });

  const {
    deleteDialogOpen,
    setDeleteDialogOpen,
    characterToDelete,
    referenceCheck,
    handleSave,
    saveStatus,
    saveError,
    handleDelete,
    performDelete,
    isDeleting,
    addTrait,
    removeTrait,
  } = useCharacterCRUD({
    currentCharacter,
    setCurrentCharacter,
    generatedImage,
    setCustomTrait,
    setCustomStyle,
    setGeneratedImage,
    addAssetToLibrary,
    generatePrompt,
    success,
    showError,
    stories,
    markDirty,
    markClean,
    onUpdateStoriesAfterDelete: async (characterId, storiesList) => {
      const updatedStories = storiesList.map((story) => {
        const updatedBeats = (story.beats || []).map((beat) => {
          const updated = { ...beat };
          if (updated.characterIds?.includes(characterId)) {
            updated.characterIds = updated.characterIds.filter(
              (cid) => cid !== characterId,
            );
          }
          if (updated.characters?.includes(characterId)) {
            updated.characters = updated.characters.filter(
              (cid) => cid !== characterId,
            );
          }
          if (updated.character === characterId) {
            delete updated.character;
          }
          return updated;
        });
        const updatedCharacters = (story.characters || []).filter(
          (cid) => cid !== characterId,
        );
        return { ...story, characters: updatedCharacters, beats: updatedBeats };
      });
      const failedStories: string[] = [];
      for (const updatedStory of updatedStories) {
        const original = storiesList.find((s) => s.id === updatedStory.id);
        const wasAffected =
          original?.characters?.includes(characterId) ||
          original?.beats?.some(
            (b) =>
              b.characterIds?.includes(characterId) ||
              b.characters?.includes(characterId) ||
              b.character === characterId,
          );
        if (wasAffected) {
          try {
            const result = await storyService.update(updatedStory.id, updatedStory);
            if (!result.ok) {
              failedStories.push(updatedStory.title || updatedStory.id.slice(0, 8));
            }
          } catch (e) {
            failedStories.push(updatedStory.title || updatedStory.id.slice(0, 8));
          }
        }
      }
      if (failedStories.length > 0) {
        showError("部分故事引用未清除", `以下故事引用更新失败: ${failedStories.join("、")}`);
      }
    },
  });

  const {
    showOutfitDialog,
    setShowOutfitDialog,
    editingOutfit,
    setEditingOutfit,
    outfitForm,
    setOutfitForm,
    customAccessory,
    setCustomAccessory,
    handleAddOutfit,
    handleDeleteOutfit,
    handleSetDefaultOutfit,
    handleEditOutfit,
    handleGenerateOutfitImage,
    addAccessory,
    removeAccessory,
  } = useOutfitManagement({
    currentCharacter,
    setCurrentCharacter,
    setIsGenerating,
    addAssetToLibrary,
    success,
    showError,
  });

  const handleSaveRef = useRef(handleSave);
  useEffect(() => { handleSaveRef.current = handleSave; }, [handleSave]);

  useGlobalKeyboardActions({
    onSave: () => handleSaveRef.current(),
  });

  useEffect(() => {
    if (!highlightId || characters.length === 0) return;
    const found = characters.find((c) => c.id === highlightId);
    if (found) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCurrentCharacterRaw(found);
      setGeneratedImage(found.generatedImage || found.refImagePath || null);
    }
  }, [highlightId, characters, setGeneratedImage]);

  return (
    <PageErrorBoundary pageName="角色">
      <div className="h-full flex gap-3">
        {/* Left: Character List */}
        <div className="w-[280px] shrink-0 flex flex-col border border-border rounded-lg bg-card overflow-hidden">
          <div className="px-3 py-2.5 border-b border-border shrink-0 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-violet-400" />
                <span className="text-sm font-semibold">角色</span>
                <span className="text-xs text-muted-foreground">
                  {characters.length}
                </span>
              </div>
              {characters.length > 0 && (
                <BatchOperations
                  type="character"
                  items={characters}
                  onComplete={(results) => {
                    errorLogger.info("批量生成完成", results);
                  }}
                  onSave={async (itemId, imageUrl, _variantIndex) => {
                    const item = characters.find((c) => c.id === itemId);
                    if (item) {
                      const updated = {
                        ...item,
                        refImagePath: imageUrl,
                        generatedImage: imageUrl,
                      };
                      try {
                        const result = await characterService.update(itemId, updated);
                        if (!result.ok) throw result.error;
                        queryClient.invalidateQueries({
                          queryKey: ["characters"],
                        });
                      } catch (e) {
                        errorLogger.warn(
                          "[Characters] 批量保存失败",
                          e instanceof Error ? e.message : e,
                        );
                      }
                    }
                  }}
                />
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2 h-7 text-xs"
              onClick={async () => {
                if (currentCharacter.id && isDirty("characters")) {
                  if (
                    !(await confirm(
                      "当前角色有未保存的修改，切换将丢失这些修改。确定要继续吗？",
                      "未保存的修改",
                    ))
                  )
                    return;
                }
                setCurrentCharacter(defaultCharacter);
                setCustomTrait("");
                setCustomStyle("");
              }}
            >
              <Plus className="w-3 h-3" />
              创建新角色
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {charactersLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : characters.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="font-medium">暂无角色</p>
                <p className="text-xs mt-1">点击「创建新角色」开始设计你的动画角色</p>
              </div>
            ) : (
              characters.map((char) => {
                const getCharacterImage = (
                  c: Character,
                ): string | undefined => {
                  return resolveImageUrl(
                    c.avatarPath || c.generatedImage || c.refImagePath,
                  );
                };
                return (
                  <CharacterListItem
                    key={char.id}
                    character={char}
                    onClick={async () => {
                      if (
                        currentCharacter.id &&
                        char.id !== currentCharacter.id &&
                        isDirty("characters")
                      ) {
                        if (
                          !(await confirm(
                            "当前角色有未保存的修改，切换将丢失这些修改。确定要继续吗？",
                            "未保存的修改",
                          ))
                        )
                          return;
                      }
                      setCurrentCharacter(char);
                      setGeneratedImage(getCharacterImage(char) || null);
                    }}
                    onDelete={(e) => {
                      e.stopPropagation();
                      handleDelete(char.id);
                    }}
                  />
                );
              })
            )}
          </div>
        </div>

        {/* Right: Character Editor */}
        <div className="flex-1 min-w-0 border border-border rounded-lg bg-card overflow-hidden">
          <div className="h-full overflow-y-auto">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold">
                {currentCharacter.id ? "编辑角色" : "创建新角色"}
              </h3>
              <p className="text-xs text-muted-foreground">
                自由填写，所有字段都是可选的
              </p>
            </div>
            <div className="p-4">
              <Tabs defaultValue="basic" className="space-y-6">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="basic">基础信息</TabsTrigger>
                  <TabsTrigger value="appearance">外貌设定</TabsTrigger>
                  <TabsTrigger value="outfits" className="gap-1">
                    <GitBranch className="w-3 h-3" />
                    服装分支
                  </TabsTrigger>
                  <TabsTrigger value="personality">性格特征</TabsTrigger>
                </TabsList>

                <TabsContent value="basic" className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">角色名称</Label>
                    <Input
                      id="name"
                      placeholder="输入角色名称..."
                      value={currentCharacter.name}
                      onChange={(e) =>
                        setCurrentCharacter({
                          ...currentCharacter,
                          name: e.target.value,
                        }, true)
                      }
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>性别</Label>
                      <div className="flex flex-wrap gap-2">
                        {genderSuggestions.map((g) => (
                          <Button
                            key={g}
                            type="button"
                            variant={currentCharacter.gender === g ? "default" : "outline"}
                            size="sm"
                            onClick={() =>
                              setCurrentCharacter({
                                ...currentCharacter,
                                gender: currentCharacter.gender === g ? "" : g,
                              }, true)
                            }
                          >
                            {g}
                          </Button>
                        ))}
                        <Input
                          className="w-20 h-8 text-xs"
                          placeholder="自定义"
                          value={genderSuggestions.includes(currentCharacter.gender) ? "" : currentCharacter.gender}
                          onChange={(e) =>
                            setCurrentCharacter({
                              ...currentCharacter,
                              gender: e.target.value,
                            }, true)
                          }
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="age">年龄</Label>
                      <Input
                        id="age"
                        type="number"
                        placeholder="输入年龄..."
                        value={currentCharacter.age ?? ""}
                        onChange={(e) => {
                          const val = e.target.value.trim();
                          const parsed =
                            val === ""
                              ? undefined
                              : Math.max(0, parseInt(val) || 0);
                          setCurrentCharacter({
                            ...currentCharacter,
                            age: parsed,
                          }, true);
                        }}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="style">艺术风格（自由输入或选择）</Label>
                    <div className="flex gap-2">
                      <Input
                        id="style"
                        list="style-suggestions"
                        placeholder="例如：赛博朋克、浮世绘、蒸汽朋克..."
                        value={currentCharacter.style}
                        onChange={(e) =>
                          setCurrentCharacter({
                            ...currentCharacter,
                            style: e.target.value,
                          }, true)
                        }
                        className="flex-1"
                      />
                    </div>
                    <datalist id="style-suggestions">
                      {styleSuggestions.map((s) => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {styleSuggestions.slice(0, 10).map((style) => (
                        <Badge
                          key={style}
                          variant={
                            currentCharacter.style === style
                              ? "default"
                              : "outline"
                          }
                          className="cursor-pointer text-xs"
                          onClick={() =>
                            setCurrentCharacter({
                              ...currentCharacter,
                              style,
                            }, true)
                          }
                        >
                          {style}
                        </Badge>
                      ))}
                      <span className="text-xs text-muted-foreground self-center">
                        ...还有更多
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">角色简介</Label>
                    <Textarea
                      id="description"
                      placeholder="描述角色的背景故事、职业、特点...自由发挥"
                      rows={4}
                      value={currentCharacter.description}
                      onChange={(e) =>
                        setCurrentCharacter({
                          ...currentCharacter,
                          description: e.target.value,
                        }, true)
                      }
                    />
                  </div>
                </TabsContent>

                <TabsContent value="appearance" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="hairColor">发色（自由描述）</Label>
                      <Input
                        id="hairColor"
                        placeholder="例如：银白色、渐变粉蓝、火焰红..."
                        value={currentCharacter.appearance.hairColor}
                        onChange={(e) =>
                          setCurrentCharacter({
                            ...currentCharacter,
                            appearance: {
                              ...currentCharacter.appearance,
                              hairColor: e.target.value,
                            },
                          }, true)
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="hairStyle">发型（自由描述）</Label>
                      <Input
                        id="hairStyle"
                        placeholder="例如：及腰长发、爆炸头、莫西干..."
                        value={currentCharacter.appearance.hairStyle}
                        onChange={(e) =>
                          setCurrentCharacter({
                            ...currentCharacter,
                            appearance: {
                              ...currentCharacter.appearance,
                              hairStyle: e.target.value,
                            },
                          }, true)
                        }
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="eyeColor">眼睛（自由描述）</Label>
                      <Input
                        id="eyeColor"
                        placeholder="例如：异色瞳、金色竖瞳、星光眼..."
                        value={currentCharacter.appearance.eyeColor}
                        onChange={(e) =>
                          setCurrentCharacter({
                            ...currentCharacter,
                            appearance: {
                              ...currentCharacter.appearance,
                              eyeColor: e.target.value,
                            },
                          }, true)
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="height">身高（自由输入）</Label>
                      <Input
                        id="height"
                        list="height-suggestions"
                        placeholder="例如：180cm、很矮、巨人..."
                        value={currentCharacter.appearance.height}
                        onChange={(e) =>
                          setCurrentCharacter({
                            ...currentCharacter,
                            appearance: {
                              ...currentCharacter.appearance,
                              height: e.target.value,
                            },
                          }, true)
                        }
                      />
                      <datalist id="height-suggestions">
                        {heightSuggestions.map((h) => (
                          <option key={h} value={h} />
                        ))}
                      </datalist>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="build">体型（自由输入）</Label>
                    <Input
                      id="build"
                      list="build-suggestions"
                      placeholder="例如：肌肉发达、骨瘦如柴、丰满..."
                      value={currentCharacter.appearance.build}
                      onChange={(e) =>
                          setCurrentCharacter({
                            ...currentCharacter,
                            appearance: {
                              ...currentCharacter.appearance,
                              build: e.target.value,
                            },
                          }, true)
                        }
                    />
                    <datalist id="build-suggestions">
                      {buildSuggestions.map((b) => (
                        <option key={b} value={b} />
                      ))}
                    </datalist>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="clothing">服装描述（自由发挥）</Label>
                    <Textarea
                      id="clothing"
                      placeholder="详细描述角色的穿着：风格、颜色、配饰、材质..."
                      rows={3}
                      value={currentCharacter.appearance.clothing}
                      onChange={(e) =>
                        setCurrentCharacter({
                          ...currentCharacter,
                          appearance: {
                            ...currentCharacter.appearance,
                            clothing: e.target.value,
                          },
                        }, true)
                      }
                    />
                  </div>
                </TabsContent>

                <TabsContent value="outfits" className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-base">服装分支</Label>
                      <p className="text-sm text-muted-foreground">
                        为角色创建不同的服装变体，用于不同场景
                      </p>
                    </div>
                    <Button
                      onClick={() => {
                        setEditingOutfit(null);
                        setOutfitForm({
                          name: "",
                          description: "",
                          clothing: "",
                          accessories: [],
                        });
                        setShowOutfitDialog(true);
                      }}
                      className="gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      添加服装
                    </Button>
                  </div>

                  {currentCharacter.outfits &&
                    currentCharacter.outfits.length > 0 && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {currentCharacter.outfits.map((outfit) => (
                          <Card
                            key={outfit.id}
                            className={`border ${outfit.isDefault ? "border-amber-500/50 bg-amber-950/20" : "border-slate-700"}`}
                          >
                            <CardContent className="p-4 space-y-3">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <h4 className="font-medium">
                                      {outfit.name}
                                    </h4>
                                    {outfit.isDefault && (
                                      <Badge
                                        variant="outline"
                                        className="text-amber-400 border-amber-400"
                                      >
                                        默认
                                      </Badge>
                                    )}
                                  </div>
                                  {outfit.description && (
                                    <p className="text-sm text-muted-foreground mt-1">
                                      {outfit.description}
                                    </p>
                                  )}
                                </div>
                                <div className="flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleEditOutfit(outfit)}
                                  >
                                    编辑
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-destructive"
                                    onClick={() =>
                                      handleDeleteOutfit(outfit.id)
                                    }
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </div>

                              <div className="space-y-2">
                                <p className="text-sm">
                                  <span className="text-muted-foreground">
                                    服装：
                                  </span>
                                  {outfit.clothing}
                                </p>
                                {outfit.accessories &&
                                  outfit.accessories.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                      {outfit.accessories.map((acc) => (
                                        <Badge
                                          key={acc}
                                          variant="secondary"
                                          className="text-xs"
                                        >
                                          {acc}
                                        </Badge>
                                      ))}
                                    </div>
                                  )}
                              </div>

                              {outfit.imageUrl && (
                                <div className="aspect-square max-w-[120px] rounded-lg overflow-hidden border border-slate-700">
                                  <img
                                    src={resolveImageUrl(outfit.imageUrl)}
                                    alt={outfit.name}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              )}

                              <div className="flex gap-2 pt-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="flex-1 gap-1"
                                  onClick={() =>
                                    handleGenerateOutfitImage(outfit)
                                  }
                                  disabled={isGenerating}
                                >
                                  {isGenerating ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Wand2 className="w-3 h-3" />
                                  )}
                                  生成图像
                                </Button>
                                {!outfit.isDefault && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      handleSetDefaultOutfit(outfit.id)
                                    }
                                  >
                                    设为默认
                                  </Button>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}

                  {(!currentCharacter.outfits ||
                    currentCharacter.outfits.length === 0) && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Shirt className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>暂无服装分支</p>
                      <p className="text-sm">点击上方按钮添加角色的不同服装</p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="personality" className="space-y-4">
                  <div className="space-y-2">
                    <Label>添加性格特征</Label>
                    <div className="flex gap-2">
                      <Input
                        list="trait-suggestions"
                        placeholder="输入性格特征，按回车添加..."
                        value={customTrait}
                        onChange={(e) => setCustomTrait(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addTrait(customTrait);
                          }
                        }}
                        className="flex-1"
                      />
                      <Button onClick={() => addTrait(customTrait)}>
                        添加
                      </Button>
                    </div>
                    <datalist id="trait-suggestions">
                      {personalitySuggestions.map((t) => (
                        <option key={t} value={t} />
                      ))}
                    </datalist>
                  </div>

                  {currentCharacter.personality.length > 0 && (
                    <div className="p-4 rounded-lg bg-muted">
                      <p className="text-sm font-medium mb-3">
                        已添加特征（点击删除）：
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {currentCharacter.personality.map((trait) => (
                          <Badge
                            key={trait}
                            className="cursor-pointer px-3 py-1 gap-1"
                            onClick={() => removeTrait(trait)}
                          >
                            {trait}
                            <X className="w-3 h-3" />
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label className="text-muted-foreground">
                      快捷参考（点击添加）：
                    </Label>
                    <div className="flex flex-wrap gap-1">
                      {personalitySuggestions.map((trait) => (
                        <Badge
                          key={trait}
                          variant={
                            currentCharacter.personality.includes(trait)
                              ? "default"
                              : "outline"
                          }
                          className="cursor-pointer px-2 py-1 text-xs opacity-70 hover:opacity-100"
                          onClick={() => {
                            if (!currentCharacter.personality.includes(trait)) {
                              setCurrentCharacter({
                                ...currentCharacter,
                                personality: [
                                  ...currentCharacter.personality,
                                  trait,
                                ],
                              }, true);
                            }
                          }}
                        >
                          {trait}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              {/* Generated Prompt Preview */}
              <div className="mt-6 p-4 rounded-lg bg-slate-900/50 border border-violet-800/30 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium text-violet-200">
                    AI生成提示词
                  </Label>
                  <Button
                    variant="outline"
                    size="sm"
                    className={`gap-2 border-violet-700 ${useDetailedPrompt ? "bg-violet-900/40 text-violet-200" : "bg-violet-900/20 text-violet-300"} hover:bg-violet-900/40`}
                    onClick={() => setUseDetailedPrompt(!useDetailedPrompt)}
                  >
                    <Sparkles className="w-4 h-4" />
                    {useDetailedPrompt ? "已启用优化" : "AI优化"}
                  </Button>
                </div>
                <p className="text-sm text-slate-300 whitespace-pre-wrap">
                  {generatePrompt(currentCharacter)}
                </p>
                {useDetailedPrompt && (
                  <p className="text-xs text-violet-400/60">
                    提示：已启用提示词优化，生成图片前会使用文本模型优化提示词（需配置文本API）
                  </p>
                )}
              </div>

              {/* Image Preview */}
              {(generatedImage ||
                currentCharacter.avatarPath ||
                currentCharacter.generatedImage ||
                currentCharacter.refImagePath) && (
                <div className="mt-6 p-4 rounded-lg bg-slate-900/50 border border-purple-800/30 space-y-3">
                  <Label className="text-sm font-medium text-purple-200">
                    角色图像
                  </Label>
                  <div className="relative aspect-square max-w-sm mx-auto rounded-lg overflow-hidden border border-purple-700/50 shadow-lg shadow-purple-500/20">
                    <img
                      src={resolveImageUrl(
                        generatedImage ||
                          currentCharacter.avatarPath ||
                          currentCharacter.generatedImage ||
                          currentCharacter.refImagePath,
                      )}
                      alt="Generated character"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-2"
                      onClick={saveImageToCharacter}
                      disabled={!currentCharacter.id}
                    >
                      <Save className="w-4 h-4" />
                      保存到角色
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => setGeneratedImage(null)}
                    >
                      <X className="w-4 h-4" />
                      清除
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2 mt-6">
                <SaveStatusIndicator
                  status={isDirty("characters") ? "unsaved" : saveStatus}
                  errorMessage={saveError}
                />
                <Button
                  className="flex-1 gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 shadow-lg shadow-violet-500/20"
                  onClick={handleSave}
                  disabled={saveStatus === "saving"}
                >
                  <Save className="w-4 h-4" />
                  {saveStatus === "saving" ? "保存中..." : "保存角色"}
                </Button>
                <div className="flex gap-2">
                  <Select value={imageSize} onValueChange={(v) => { if (v) setImageSize(v); }}>
                    <SelectTrigger className="w-[140px] border-purple-700 bg-purple-900/30 text-purple-100">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1920x1920">1920x1920</SelectItem>
                      <SelectItem value="2048x2048">2048x2048</SelectItem>
                      <SelectItem value="2560x1440">2560x1440</SelectItem>
                      <SelectItem value="3840x2160">3840x2160</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    className="gap-2 border-purple-700 bg-purple-900/20 hover:bg-purple-900/40 text-purple-200"
                    onClick={generateImage}
                    disabled={isGenerating}
                  >
                    {isGenerating ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Wand2 className="w-4 h-4" />
                    )}
                    {isGenerating ? "生成中..." : "生成图像"}
                  </Button>
                </div>
                <ModelSelector
                  capability="image"
                  value={selectedImageModel}
                  onChange={setSelectedImageModel}
                />
                <Button
                  variant="outline"
                  className="gap-2 border-blue-700 bg-blue-900/20 hover:bg-blue-900/40 text-blue-200"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  {isUploading ? "上传中..." : "上传图片"}
                </Button>
                <Button
                  variant="outline"
                  className="gap-2 border-amber-700 bg-amber-900/20 hover:bg-amber-900/40 text-amber-200"
                  onClick={() => setShowAssetSelector(true)}
                >
                  <Folder className="w-4 h-4" />
                  从素材库选择
                </Button>
                <Button
                  variant="secondary"
                  className="gap-2 bg-cyan-900/30 hover:bg-cyan-900/50 text-cyan-200 border-cyan-700 border"
                  onClick={() => analyzeFileInputRef.current?.click()}
                  disabled={isAnalyzing || isUploading}
                >
                  {isAnalyzing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ScanLine className="w-4 h-4" />
                  )}
                  {isAnalyzing ? "识别中..." : "图片识别人物"}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <input
                  ref={analyzeFileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAnalyzeFileUpload}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {currentCharacter.id && (
        <MediaExporter type="character" item={currentCharacter} />
      )}

      {/* 删除确认对话框 */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              确认删除角色
            </DialogTitle>
            <DialogDescription>
              {referenceCheck && referenceCheck.references.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-destructive font-medium">
                    该角色正在被 {referenceCheck.references.length} 个引用关联
                  </p>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {referenceCheck.references.map((ref) => (
                      <div
                        key={ref.elementId}
                        className="text-sm bg-muted p-2 rounded"
                      >
                        <span className="font-medium">{ref.elementName}</span>
                        {ref.usedInBeats.length > 0 && (
                          <span className="text-muted-foreground">
                            {" "}
                            ({ref.usedInBeats.length} 个镜头)
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    删除后，相关故事中的角色引用将失效。建议先修改故事内容。
                  </p>
                </div>
              ) : (
                "确定要删除这个角色吗？此操作不可撤销。"
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={isDeleting}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={isDeleting}
              onClick={() =>
                characterToDelete && performDelete(characterToDelete)
              }
            >
              {isDeleting ? "删除中..." : "确认删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 服装编辑对话框 */}
      <Dialog open={showOutfitDialog} onOpenChange={setShowOutfitDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingOutfit ? "编辑服装" : "添加服装"}</DialogTitle>
            <DialogDescription>为角色创建不同的服装变体</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="outfit-name">服装名称</Label>
              <Input
                id="outfit-name"
                placeholder="例如：战斗服、日常装、礼服..."
                value={outfitForm.name || ""}
                onChange={(e) =>
                  setOutfitForm({ ...outfitForm, name: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="outfit-description">服装描述</Label>
              <Textarea
                id="outfit-description"
                placeholder="描述这套服装的特点、用途..."
                rows={2}
                value={outfitForm.description || ""}
                onChange={(e) =>
                  setOutfitForm({
                    ...outfitForm,
                    description: e.target.value,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="outfit-clothing">服装详细描述</Label>
              <Textarea
                id="outfit-clothing"
                placeholder="详细描述穿着：风格、颜色、材质、配饰..."
                rows={3}
                value={outfitForm.clothing || ""}
                onChange={(e) =>
                  setOutfitForm({
                    ...outfitForm,
                    clothing: e.target.value,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>配饰</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="输入配饰，按回车添加..."
                  value={customAccessory}
                  onChange={(e) => setCustomAccessory(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addAccessory();
                    }
                  }}
                  className="flex-1"
                />
                <Button onClick={addAccessory}>添加</Button>
              </div>
              {outfitForm.accessories && outfitForm.accessories.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {outfitForm.accessories.map((acc) => (
                    <Badge
                      key={acc}
                      className="cursor-pointer px-3 py-1 gap-1"
                      onClick={() => removeAccessory(acc)}
                    >
                      {acc}
                      <X className="w-3 h-3" />
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowOutfitDialog(false)}
            >
              取消
            </Button>
            <Button onClick={handleAddOutfit}>
              {editingOutfit ? "保存修改" : "添加服装"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 素材选择器 */}
      <Dialog open={showAssetSelector} onOpenChange={setShowAssetSelector}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>从素材库选择</DialogTitle>
            <DialogDescription>选择一张图片作为角色图像</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 p-4">
              {assets
                .filter((a) => a.type === "image")
                .map((asset) => (
                  <div
                    key={asset.id}
                    onClick={async () => {
                      setGeneratedImage(asset.url);
                      if (currentCharacter.id) {
                        try {
                          const result = await characterService.update(
                            currentCharacter.id,
                            {
                              ...currentCharacter,
                              refImagePath: asset.url,
                              generatedImage: asset.url,
                            },
                          );
                          if (!result.ok) throw result.error;
                          queryClient.invalidateQueries({
                            queryKey: ["characters"],
                          });
                        } catch (err) {
                          showError(
                            "保存失败",
                            err instanceof Error ? err.message : "未知错误",
                          );
                        }
                      }
                      setShowAssetSelector(false);
                      success("选择成功", "已从素材库选择图片");
                    }}
                    className="cursor-pointer group relative aspect-square rounded-lg overflow-hidden border border-slate-700 hover:border-amber-500 transition-all"
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
                            绑定: {asset.boundTo.name}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
            {assets.filter((a) => a.type === "image").length === 0 && (
              <div className="text-center py-12 text-slate-400">
                <ImageIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>素材库中暂无图片</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </PageErrorBoundary>
  );
}
