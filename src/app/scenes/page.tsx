"use client";

import { useState, useRef, useCallback, useEffect, Suspense } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useDirtyState } from "@/shared/hooks/use-dirty-state";
import {
  useScenes,
} from "@/modules/scene";
import {
  useStories,
} from "@/modules/story";
import {
  useMediaAssets,
  useCreateMediaAsset,
} from "@/modules/asset";
import { sceneService } from "@/modules/scene";
import { errorLogger } from "@/shared/error-logger";
import { resolveImageUrl } from "@/shared/utils/image-url";
import { PageErrorBoundary } from "@/shared/presentation/PageErrorBoundary";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { Badge } from "@/shared/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import type { Scene } from "@/domain/schemas";
import {
  Plus,
  Wand2,
  Save,
  ImageIcon,
  X,
  Loader2,
  Upload,
  ScanLine,
  AlertTriangle,
  Sparkles,
  Folder,
} from "lucide-react";
import { BatchOperations } from "@/modules/asset";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { useGlobalKeyboardActions } from "@/shared/hooks/use-global-keyboard-actions";
import { SceneListItem } from "@/modules/scene";
import { MediaExporter } from "@/modules/asset";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { ModelSelector } from "@/modules/prompt";
import {
  defaultScene,
  typeSuggestions,
  timeSuggestions,
  weatherSuggestions,
  moodSuggestions,
  elementSuggestions,
  colorSuggestions,
  angleSuggestions,
  distanceSuggestions,
  movementSuggestions,
  useSceneImage,
  useSceneCRUD,
} from "@/modules/scene";
import { confirm } from "@/shared/utils/confirm";
import { SaveStatusIndicator } from "@/shared/presentation/SaveStatusIndicator";

export default function ScenesPage() {
  return (
    <Suspense>
      <ScenesPageContent />
    </Suspense>
  );
}

function ScenesPageContent() {
  const { markDirty, markClean, isDirty } = useDirtyState();
  const queryClient = useQueryClient();
  const createMediaAssetMutation = useCreateMediaAsset();
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");

  const { data: scenes = [] } = useScenes();
  const { data: stories = [] } = useStories();
  const { data: assets = [] } = useMediaAssets();
  const [showAssetSelector, setShowAssetSelector] = useState(false);
  const [currentScene, setCurrentSceneRaw] = useState<Scene>(defaultScene);
  const currentSceneRef = useRef(currentScene);
  useEffect(() => { currentSceneRef.current = currentScene; }, [currentScene]);
  const setCurrentScene = useCallback(
    (update: Scene | ((prev: Scene) => Scene)) => {
      markDirty("scenes");
      setCurrentSceneRaw(update);
    },
    [markDirty],
  );
  const [customElement, setCustomElement] = useState("");
  const [customColor, setCustomColor] = useState("");
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
    generatedImage,
    setGeneratedImage,
    isUploading,
    isAnalyzing,
    isOptimizingPrompt,
    imageSize,
    setImageSize,
    fileInputRef,
    analyzeFileInputRef,
    selectedImageModel,
    setSelectedImageModel,
    generatePrompt,
    optimizePrompt,
    generateImage,
    saveImageToScene,
    handleFileUpload,
    handleAnalyzeFileUpload,
    clearImage,
  } = useSceneImage({
    currentScene,
    currentSceneRef,
    setCurrentScene,
    addAssetToLibrary,
    success,
    showError,
  });

  const {
    deleteDialogOpen,
    setDeleteDialogOpen,
    sceneToDelete,
    referenceCheck,
    handleSave,
    saveStatus,
    saveError,
    handleDelete,
    performDelete,
    addItem,
    removeItem,
  } = useSceneCRUD({
    currentScene,
    setCurrentScene,
    generatedImage,
    setCustomElement,
    setCustomColor,
    setGeneratedImage,
    addAssetToLibrary,
    generatePrompt,
    success,
    showError,
    stories,
    markDirty,
    markClean,
    onUpdateStoriesAfterDelete: async (sceneId, storiesList) => {
      const { storyService } = await import("@/modules/story");
      const updatedStories = storiesList.map((story) => {
        const updatedBeats = (story.beats || []).map((beat) => {
          const updated = { ...beat };
          if (updated.scene === sceneId) delete updated.scene;
          if (updated.sceneId === sceneId) delete updated.sceneId;
          return updated;
        });
        const updatedScenes = (story.scenes || []).filter((sid) => sid !== sceneId);
        return { ...story, scenes: updatedScenes, beats: updatedBeats };
      });
      for (const updatedStory of updatedStories) {
        const original = storiesList.find((s) => s.id === updatedStory.id);
        const wasAffected = original?.beats?.some((b) => b.scene === sceneId || b.sceneId === sceneId) || original?.scenes?.includes(sceneId);
        if (wasAffected) {
          const result = await storyService.update(updatedStory.id, updatedStory);
          if (!result.ok) throw result.error;
        }
      }
    },
  });

  const handleSaveRef = useRef(handleSave);
  useEffect(() => { handleSaveRef.current = handleSave; }, [handleSave]);

  useGlobalKeyboardActions({
    onSave: () => handleSaveRef.current(),
  });

  useEffect(() => {
    if (!highlightId || scenes.length === 0) return;
    const found = scenes.find((s) => s.id === highlightId);
    if (found) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCurrentSceneRaw(found);
      markDirty("scenes");
      setGeneratedImage(found.generatedImage || found.scenePath || null);
    }
  }, [highlightId, scenes, markDirty, setGeneratedImage]);

  return (
    <PageErrorBoundary pageName="场景">
      <div className="h-full flex gap-3">
        {/* Left: Scene List */}
        <div className="w-[280px] shrink-0 flex flex-col border border-border rounded-lg bg-card overflow-hidden">
          <div className="px-3 py-2.5 border-b border-border shrink-0 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-cyan-400" />
                <span className="text-sm font-semibold">场景</span>
                <span className="text-xs text-muted-foreground">
                  {scenes.length}
                </span>
              </div>
              {scenes.length > 0 && (
                <BatchOperations
                  type="scene"
                  items={scenes}
                  onComplete={(results) => {
                    errorLogger.info("批量生成完成", results);
                  }}
                  onSave={async (itemId, imageUrl, _variantIndex) => {
                    const item = scenes.find((s) => s.id === itemId);
                    if (item) {
                      const updated = {
                        ...item,
                        scenePath: imageUrl,
                        generatedImage: imageUrl,
                      };
                      try {
                        const result = await sceneService.update(itemId, updated);
                        if (!result.ok) throw result.error;
                        queryClient.invalidateQueries({ queryKey: ["scenes"] });
                      } catch (e) {
                        errorLogger.warn(
                          "[Scenes] 批量保存失败",
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
                if (currentScene.id && isDirty("scenes")) {
                  if (
                    !(await confirm(
                      "当前场景有未保存的修改，切换将丢失这些修改。确定要继续吗？",
                      "未保存的修改",
                    ))
                  )
                    return;
                }
                setCurrentScene(defaultScene);
                setCustomElement("");
                setCustomColor("");
              }}
            >
              <Plus className="w-3 h-3" />
              创建新场景
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {scenes.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="font-medium">暂无场景</p>
                <p className="text-xs mt-1">点击「创建新场景」开始构建你的动画世界</p>
              </div>
            ) : (
              scenes.map((scene) => {
                const getSceneImage = (s: Scene): string | undefined => {
                  return resolveImageUrl(s.scenePath || s.generatedImage);
                };
                return (
                  <SceneListItem
                    key={scene.id}
                    scene={scene}
                    onClick={async () => {
                      if (currentScene.id && currentScene.id !== scene.id && isDirty("scenes")) {
                        if (
                          !(await confirm(
                            "当前场景有未保存的修改，切换将丢失这些修改。确定要继续吗？",
                            "未保存的修改",
                          ))
                        )
                          return;
                      }
                      setCurrentScene(scene);
                      setGeneratedImage(getSceneImage(scene) || null);
                    }}
                    onDelete={(e) => {
                      e.stopPropagation();
                      handleDelete(scene.id);
                    }}
                  />
                );
              })
            )}
          </div>
        </div>

        {/* Right: Scene Editor */}
        <div className="flex-1 min-w-0 border border-border rounded-lg bg-card overflow-hidden">
          <div className="h-full overflow-y-auto">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold">
                {currentScene.id ? "编辑场景" : "创建新场景"}
              </h3>
              <p className="text-xs text-muted-foreground">
                自由填写，所有字段都是可选的
              </p>
            </div>
            <div className="p-4">
              <Tabs defaultValue="basic" className="space-y-6">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="basic">基础设定</TabsTrigger>
                  <TabsTrigger value="atmosphere">氛围视觉</TabsTrigger>
                  <TabsTrigger value="camera">镜头设置</TabsTrigger>
                </TabsList>

                <TabsContent value="basic" className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">场景名称</Label>
                    <Input
                      id="name"
                      placeholder="输入场景名称..."
                      value={currentScene.name}
                      onChange={(e) =>
                        setCurrentScene((prev) => ({
                          ...prev,
                          name: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="type">场景类型（自由输入）</Label>
                    <Input
                      id="type"
                      list="type-suggestions"
                      placeholder="例如：赛博朋克街区、魔法森林、太空站..."
                      value={currentScene.type}
                      onChange={(e) =>
                        setCurrentScene((prev) => ({
                          ...prev,
                          type: e.target.value,
                        }))
                      }
                    />
                    <datalist id="type-suggestions">
                      {typeSuggestions.map((t) => (
                        <option key={t} value={t} />
                      ))}
                    </datalist>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {typeSuggestions.slice(0, 8).map((type) => (
                        <Badge
                          key={type}
                          variant={
                            currentScene.type === type ? "default" : "outline"
                          }
                          className="cursor-pointer text-xs"
                          onClick={() =>
                            setCurrentScene((prev) => ({ ...prev, type }))
                          }
                        >
                          {type}
                        </Badge>
                      ))}
                      <span className="text-xs text-muted-foreground self-center">
                        ...等
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">场景描述</Label>
                    <Textarea
                      id="description"
                      placeholder="详细描述场景的布局、特色、重要元素...自由发挥"
                      rows={4}
                      value={currentScene.description}
                      onChange={(e) =>
                        setCurrentScene((prev) => ({
                          ...prev,
                          description: e.target.value,
                        }))
                      }
                    />
                  </div>
                </TabsContent>

                <TabsContent value="atmosphere" className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="timeOfDay">时间段</Label>
                      <Input
                        id="timeOfDay"
                        list="time-suggestions"
                        placeholder="例如：黄昏、午夜、极光之夜..."
                        value={currentScene.timeOfDay}
                        onChange={(e) =>
                          setCurrentScene((prev) => ({
                            ...prev,
                            timeOfDay: e.target.value,
                          }))
                        }
                      />
                      <datalist id="time-suggestions">
                        {timeSuggestions.map((t) => (
                          <option key={t} value={t} />
                        ))}
                      </datalist>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="weather">天气/环境</Label>
                      <Input
                        id="weather"
                        list="weather-suggestions"
                        placeholder="例如：雷雨、极光、沙尘暴..."
                        value={currentScene.weather}
                        onChange={(e) =>
                          setCurrentScene((prev) => ({
                            ...prev,
                            weather: e.target.value,
                          }))
                        }
                      />
                      <datalist id="weather-suggestions">
                        {weatherSuggestions.map((w) => (
                          <option key={w} value={w} />
                        ))}
                      </datalist>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="mood">场景氛围</Label>
                    <Input
                      id="mood"
                      list="mood-suggestions"
                      placeholder="例如：神秘、史诗、压抑..."
                      value={currentScene.mood}
                      onChange={(e) =>
                        setCurrentScene((prev) => ({
                          ...prev,
                          mood: e.target.value,
                        }))
                      }
                    />
                    <datalist id="mood-suggestions">
                      {moodSuggestions.map((m) => (
                        <option key={m} value={m} />
                      ))}
                    </datalist>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {moodSuggestions.slice(0, 10).map((mood) => (
                        <Badge
                          key={mood}
                          variant={
                            currentScene.mood === mood ? "default" : "outline"
                          }
                          className="cursor-pointer text-xs"
                          onClick={() =>
                            setCurrentScene((prev) => ({ ...prev, mood }))
                          }
                        >
                          {mood}
                        </Badge>
                      ))}
                      <span className="text-xs text-muted-foreground self-center">
                        ...等
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>场景元素</Label>
                    <div className="flex gap-2">
                      <Input
                        list="element-suggestions"
                        placeholder="输入元素，按回车添加..."
                        value={customElement}
                        onChange={(e) => setCustomElement(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addItem("elements", customElement);
                          }
                        }}
                        className="flex-1"
                      />
                      <Button
                        onClick={() => addItem("elements", customElement)}
                      >
                        添加
                      </Button>
                    </div>
                    <datalist id="element-suggestions">
                      {elementSuggestions.map((e) => (
                        <option key={e} value={e} />
                      ))}
                    </datalist>
                    {currentScene.elements.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {currentScene.elements.map((element) => (
                          <Badge
                            key={element}
                            className="cursor-pointer gap-1"
                            onClick={() => removeItem("elements", element)}
                          >
                            {element}
                            <X className="w-3 h-3" />
                          </Badge>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1 mt-2">
                      {elementSuggestions.slice(0, 12).map((element) => (
                        <Badge
                          key={element}
                          variant={
                            currentScene.elements.includes(element)
                              ? "default"
                              : "outline"
                          }
                          className="cursor-pointer text-xs opacity-70 hover:opacity-100"
                          onClick={() => addItem("elements", element)}
                        >
                          {element}
                        </Badge>
                      ))}
                      <span className="text-xs text-muted-foreground self-center">
                        ...等
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>色调风格</Label>
                    <div className="flex gap-2">
                      <Input
                        list="color-suggestions"
                        placeholder="输入色调，按回车添加..."
                        value={customColor}
                        onChange={(e) => setCustomColor(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addItem("colors", customColor);
                          }
                        }}
                        className="flex-1"
                      />
                      <Button onClick={() => addItem("colors", customColor)}>
                        添加
                      </Button>
                    </div>
                    <datalist id="color-suggestions">
                      {colorSuggestions.map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                    {currentScene.colors.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {currentScene.colors.map((color) => (
                          <Badge
                            key={color}
                            className="cursor-pointer gap-1"
                            onClick={() => removeItem("colors", color)}
                          >
                            {color}
                            <X className="w-3 h-3" />
                          </Badge>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1 mt-2">
                      {colorSuggestions.map((color) => (
                        <Badge
                          key={color}
                          variant={
                            currentScene.colors.includes(color)
                              ? "default"
                              : "outline"
                          }
                          className="cursor-pointer text-xs opacity-70 hover:opacity-100"
                          onClick={() => addItem("colors", color)}
                        >
                          {color}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="camera" className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="cameraAngle">镜头角度</Label>
                    <Input
                      id="cameraAngle"
                      list="angle-suggestions"
                      placeholder="例如：鸟瞰、POV第一人称、过肩镜头..."
                      value={currentScene.camera?.angle || ""}
                      onChange={(e) =>
                        setCurrentScene((prev) => ({
                          ...prev,
                          camera: { ...prev.camera, angle: e.target.value },
                        }))
                      }
                    />
                    <datalist id="angle-suggestions">
                      {angleSuggestions.map((a) => (
                        <option key={a} value={a} />
                      ))}
                    </datalist>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {angleSuggestions.map((angle) => (
                        <Badge
                          key={angle}
                          variant={
                            currentScene.camera?.angle === angle
                              ? "default"
                              : "outline"
                          }
                          className="cursor-pointer text-xs"
                          onClick={() =>
                            setCurrentScene((prev) => ({
                              ...prev,
                              camera: { ...prev.camera, angle },
                            }))
                          }
                        >
                          {angle}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="cameraDistance">镜头距离</Label>
                    <Input
                      id="cameraDistance"
                      list="distance-suggestions"
                      placeholder="例如：特写、全景..."
                      value={currentScene.camera?.distance || ""}
                      onChange={(e) =>
                        setCurrentScene((prev) => ({
                          ...prev,
                          camera: {
                            ...prev.camera,
                            distance: e.target.value,
                          },
                        }))
                      }
                    />
                    <datalist id="distance-suggestions">
                      {distanceSuggestions.map((d) => (
                        <option key={d} value={d} />
                      ))}
                    </datalist>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {distanceSuggestions.map((distance) => (
                        <Badge
                          key={distance}
                          variant={
                            currentScene.camera?.distance === distance
                              ? "default"
                              : "outline"
                          }
                          className="cursor-pointer text-xs"
                          onClick={() =>
                            setCurrentScene((prev) => ({
                              ...prev,
                              camera: { ...prev.camera, distance },
                            }))
                          }
                        >
                          {distance}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="cameraMovement">镜头运动</Label>
                    <Input
                      id="cameraMovement"
                      list="movement-suggestions"
                      placeholder="例如：环绕、跟随、手持晃动..."
                      value={currentScene.camera?.movement}
                      onChange={(e) =>
                        setCurrentScene((prev) => ({
                          ...prev,
                          camera: {
                            ...prev.camera,
                            movement: e.target.value,
                          },
                        }))
                      }
                    />
                    <datalist id="movement-suggestions">
                      {movementSuggestions.map((m) => (
                        <option key={m} value={m} />
                      ))}
                    </datalist>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {movementSuggestions.map((movement) => (
                        <Badge
                          key={movement}
                          variant={
                            currentScene.camera?.movement === movement
                              ? "default"
                              : "outline"
                          }
                          className="cursor-pointer text-xs"
                          onClick={() =>
                            setCurrentScene((prev) => ({
                              ...prev,
                              camera: { ...prev.camera, movement },
                            }))
                          }
                        >
                          {movement}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              {/* Generated Prompt Preview */}
              <div className="mt-6 p-4 rounded-lg bg-slate-900/50 border border-blue-800/30 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium text-blue-200">
                    图片生成提示词
                  </Label>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 border-blue-700 bg-blue-900/20 hover:bg-blue-900/40 text-blue-200"
                    onClick={optimizePrompt}
                    disabled={isOptimizingPrompt}
                  >
                    {isOptimizingPrompt ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    {isOptimizingPrompt ? "优化中..." : "AI优化"}
                  </Button>
                </div>
                <Textarea
                  value={
                    currentScene.imageGenerationPrompt ||
                    generatePrompt(currentScene)
                  }
                  onChange={(e) =>
                    setCurrentScene((prev) => ({
                      ...prev,
                      imageGenerationPrompt: e.target.value,
                    }))
                  }
                  placeholder="输入图片生成提示词，或点击 'AI优化' 按钮自动优化..."
                  rows={6}
                  className="bg-slate-800/50 border-blue-700/50 text-blue-100 placeholder:text-blue-400/60 focus-visible:ring-blue-500 resize-none"
                />
                {!currentScene.imageGenerationPrompt && (
                  <p className="text-xs text-blue-400/60">
                    提示：首次使用时会自动填充提示词，你可以直接编辑或点击
                    AI优化 来优化它
                  </p>
                )}
              </div>

              {/* Image Preview */}
              {(generatedImage ||
                currentScene.scenePath ||
                currentScene.generatedImage) && (
                <div className="mt-6 p-4 rounded-lg bg-slate-900/50 border border-cyan-800/30 space-y-3">
                  <Label className="text-sm font-medium text-cyan-200">
                    场景图像
                  </Label>
                  <div className="relative aspect-video max-w-lg mx-auto rounded-lg overflow-hidden border border-cyan-700/50 shadow-lg shadow-cyan-500/20">
                    <img
                      src={resolveImageUrl(
                        generatedImage ||
                          currentScene.scenePath ||
                          currentScene.generatedImage,
                      )}
                      alt="Generated scene"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-2"
                      onClick={saveImageToScene}
                      disabled={!currentScene.id}
                    >
                      <Save className="w-4 h-4" />
                      保存到场景
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={clearImage}
                    >
                      <X className="w-4 h-4" />
                      清除
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2 mt-6">
                <SaveStatusIndicator
                  status={isDirty("scenes") ? "unsaved" : saveStatus}
                  errorMessage={saveError}
                />
                <Button
                  className="flex-1 gap-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 shadow-lg shadow-cyan-500/20"
                  onClick={handleSave}
                  disabled={saveStatus === "saving"}
                >
                  {saveStatus === "saving" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {saveStatus === "saving" ? "保存中..." : "保存场景"}
                </Button>
                <div className="flex gap-2">
                  <Select
                    value={imageSize}
                    onValueChange={(v) => { if (v) setImageSize(v); }}
                  >
                    <SelectTrigger className="w-36 border-blue-700 bg-blue-900/30 text-blue-100">
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
                    className="gap-2 border-blue-700 bg-blue-900/20 hover:bg-blue-900/40 text-blue-200"
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
                  className="gap-2 border-cyan-700 bg-cyan-900/20 hover:bg-cyan-900/40 text-cyan-200"
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
                  className="gap-2 bg-teal-900/30 hover:bg-teal-900/50 text-teal-200 border-teal-700 border"
                  onClick={() => analyzeFileInputRef.current?.click()}
                  disabled={isAnalyzing || isUploading}
                >
                  {isAnalyzing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ScanLine className="w-4 h-4" />
                  )}
                  {isAnalyzing ? "识别中..." : "图片识别场景"}
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

      {currentScene.id && <MediaExporter type="scene" item={currentScene} />}

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              确认删除场景
            </DialogTitle>
            <DialogDescription>
              {referenceCheck && referenceCheck.references.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-destructive font-medium">
                    该场景正在被 {referenceCheck.references.length}{" "}
                    个引用关联
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
                    删除后，相关故事中的场景引用将失效。建议先修改故事内容。
                  </p>
                </div>
              ) : (
                "确定要删除这个场景吗？此操作不可撤销。"
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => sceneToDelete && performDelete(sceneToDelete)}
            >
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 素材选择器 */}
      <Dialog open={showAssetSelector} onOpenChange={setShowAssetSelector}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>从素材库选择</DialogTitle>
            <DialogDescription>选择一张图片作为场景图像</DialogDescription>
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
                      if (currentScene.id) {
                        try {
                          const result = await sceneService.update(currentScene.id, {
                            ...currentScene,
                            scenePath: asset.url,
                            generatedImage: asset.url,
                          });
                          if (!result.ok) throw result.error;
                          queryClient.invalidateQueries({ queryKey: ["scenes"] });
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
