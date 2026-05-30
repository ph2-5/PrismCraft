"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Sparkles,
  User,
  Image,
  Wand2,
  RefreshCw,
  CheckCircle2,
  Plus,
  LayoutTemplate,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Textarea } from "@/shared/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/shared/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Label } from "@/shared/ui/label";
import {
  generateQuickModeVideoPrompt,
  getDurationOptionsForModel,
  getResolutionOptionsForModel,
  getStyleOptionsForModel,
} from "@/modules/prompt";
import {
  applyVideoTemplate,
  type VideoTemplate,
} from "@/modules/video";
import {
  useCharacters,
} from "@/modules/character";
import {
  useScenes,
} from "@/modules/scene";
import {
  useCreateMediaAsset,
} from "@/modules/asset";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { useVideoTaskManager, useVideoTaskStore, type VideoTask } from "@/modules/video";
import { getVideoUrlWithCache } from "@/modules/video";
import { PageErrorBoundary } from "@/shared/presentation/PageErrorBoundary";
import { ModelSelector, useModelSelection } from "@/modules/prompt";
import { errorLogger } from "@/shared/error-logger";
import { mapUserFacingError } from "@/shared/utils/user-facing-error";
import { t } from "@/shared/constants";
import { useNavigationGuard } from "@/shared/presentation/BeforeUnloadGuard";
import { TemplateSelectDialog } from "./TemplateSelectDialog";
import { TaskResultPanel } from "./TaskResultPanel";
import { AdvancedSettingsCard } from "./AdvancedSettingsCard";

export default function QuickGeneratePage() {
  const { guardedPush } = useNavigationGuard();
  const {
    success: showSuccess,
    error: showError,
    warning: showWarning,
  } = useToastHelpers();

  const { data: characters = [], isLoading: charactersLoading } = useCharacters();
  const { data: scenes = [], isLoading: scenesLoading } = useScenes();
  const createMediaAssetMutation = useCreateMediaAsset();

  const [promptText, setPromptText] = useState("");
  const [duration, setDuration] = useState(5);
  const [selectedStyle, setSelectedStyle] = useState("电影感");
  const [selectedResolution, setSelectedResolution] = useState<string>("1920x1080");
  const [selectedCharacters, setSelectedCharacters] = useState<string[]>([]);
  const [selectedScene, setSelectedScene] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [enableSmartOptimization, setEnableSmartOptimization] = useState(true);
  const [negativePrompt, setNegativePrompt] = useState("");
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [referenceVideo, setReferenceVideo] = useState<string | null>(null);
  const [referenceVideoFile, setReferenceVideoFile] = useState<File | null>(
    null,
  );
  const [referenceVideoName, setReferenceVideoName] = useState<string | null>(
    null,
  );
  const [generatedPrompt, setGeneratedPrompt] = useState<string | null>(null);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [cachedVideoUrl, setCachedVideoUrl] = useState<string | null>(null);
  const [cachedVideoUrlTaskId, setCachedVideoUrlTaskId] = useState<string | null>(null);
  const [isSavingToAssets, setIsSavingToAssets] = useState(false);
  const referenceVideoBlobRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (cachedVideoUrl && cachedVideoUrl.startsWith("blob:")) {
        URL.revokeObjectURL(cachedVideoUrl);
      }
    };
  }, [cachedVideoUrl]);

  useEffect(() => {
    return () => {
      if (referenceVideoBlobRef.current) {
        URL.revokeObjectURL(referenceVideoBlobRef.current);
      }
    };
  }, []);

  const {
    tasks,
    isGenerating,
    activeTaskId,
    createTask,
    clearCompletedTasks,
    initialize,
  } = useVideoTaskManager();

  const [selectedVideoModel, setSelectedVideoModel] =
    useModelSelection("video");

  useEffect(() => {
    initialize();
    return () => {
      useVideoTaskStore.getState().cleanup();
    };
  }, [initialize]);

  const currentTask = activeTaskId
    ? tasks.find((t) => t.taskId === activeTaskId)
    : null;

  useEffect(() => {
    if (
      currentTask?.videoUrl &&
      currentTask?.taskId &&
      currentTask.status === "completed"
    ) {
      let cancelled = false;
      const taskId = currentTask.taskId;
      getVideoUrlWithCache(currentTask.taskId, currentTask.videoUrl).then(
        (result) => {
          if (!cancelled && result.ok && result.value.url) {
            setCachedVideoUrlTaskId(taskId);
            setCachedVideoUrl(result.value.url);
          }
        },
      ).catch((e) => {
        errorLogger.warn("[QuickGenerate] 获取视频缓存URL失败:", e);
      });
      return () => {
        cancelled = true;
      };
    }
  }, [currentTask?.videoUrl, currentTask?.taskId, currentTask?.status]);

  const effectiveVideoUrl = useMemo(() => {
    if (currentTask?.status !== "completed") return null;
    if (cachedVideoUrl && cachedVideoUrlTaskId === currentTask?.taskId) {
      return cachedVideoUrl;
    }
    return currentTask?.videoUrl || null;
  }, [currentTask?.status, currentTask?.videoUrl, currentTask?.taskId, cachedVideoUrl, cachedVideoUrlTaskId]);

  const toggleCharacter = (charId: string) => {
    setSelectedCharacters((prev) =>
      prev.includes(charId)
        ? prev.filter((id) => id !== charId)
        : [...prev, charId],
    );
  };

  const toggleScene = (sceneId: string) => {
    setSelectedScene((prev) => (prev === sceneId ? null : sceneId));
  };

  const getSelectedCharacterObjects = useCallback(() => {
    return characters.filter((c) => selectedCharacters.includes(c.id));
  }, [characters, selectedCharacters]);

  const getSelectedSceneObject = useCallback(() => {
    return scenes.find((s) => s.id === selectedScene) || null;
  }, [scenes, selectedScene]);

  const handleGenerate = async () => {
    if (!promptText.trim()) {
      showError("请输入视频描述");
      return;
    }
    if (!selectedVideoModel?.providerId || !selectedVideoModel?.modelId) {
      showError(t("video.selectModel"), t("video.selectModelHint"));
      return;
    }

    try {
      const selectedCharObjs = getSelectedCharacterObjects();
      const selectedSceneObj = getSelectedSceneObject();

      const prompt = generateQuickModeVideoPrompt({
        prompt: promptText,
        duration,
        resolution: selectedResolution,
        style: selectedStyle,
        characters: selectedCharObjs,
        scene: selectedSceneObj || undefined,
        referenceImage: referenceImage || undefined,
        enableSmartOptimization,
        negativePrompt: negativePrompt || undefined,
      });

      setGeneratedPrompt(prompt);

      const imageUrl =
        referenceImage ||
        selectedSceneObj?.generatedImage ||
        (selectedCharObjs.length > 0
          ? selectedCharObjs[0].generatedImage
          : undefined);

      let referenceVideoBase64: string | null = null;
      if (referenceVideoFile) {
        const MAX_VIDEO_SIZE = 50 * 1024 * 1024;
        if (referenceVideoFile.size > MAX_VIDEO_SIZE) {
          showError(t("error.fileTooLarge"), t("video.refVideoSizeLimit"));
          return;
        }
        referenceVideoBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(referenceVideoFile!);
        });
      }

      const task = await createTask(prompt, undefined, {
        fixedImageUrl: imageUrl,
        fixedImageLockType: selectedSceneObj ? "scene" : "character",
        referenceVideo: referenceVideoBase64,
        providerId: selectedVideoModel.providerId,
        modelId: selectedVideoModel.modelId,
        format: selectedVideoModel.format,
      });

      if (task?.promptWasTruncated) {
        showWarning("提示词过长", "提示词已被自动截断，可能影响生成效果");
      }

      showSuccess("开始生成视频");
    } catch (error) {
      errorLogger.error("生成失败:", error);
      showError("生成失败", mapUserFacingError(error));
    }
  };

  const handleDownload = async (
    videoUrl: string | undefined,
    filename: string,
  ) => {
    if (!videoUrl) return;
    try {
      const response = await fetch(videoUrl);
      if (!response.ok) throw new Error(`下载失败: ${response.status}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      const link = document.createElement("a");
      link.href = videoUrl;
      link.download = filename;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleSaveToAssets = async (task: VideoTask) => {
    if (!task.videoUrl || isSavingToAssets) return;

    setIsSavingToAssets(true);
    try {
      await createMediaAssetMutation.mutateAsync({
        name: `快速生成 - ${promptText.slice(0, 20)}...`,
        description: promptText,
        type: "video",
        url: task.videoUrl,
        tags: [selectedStyle, `${duration}秒`],
        duration: duration,
      });
      showSuccess("已保存到素材库");
    } catch (_error) {
      showError("保存失败", mapUserFacingError(_error));
    } finally {
      setIsSavingToAssets(false);
    }
  };

  const handleApplyTemplate = useCallback(
    (template: VideoTemplate) => {
      const {
        prompt,
        duration: templateDuration,
        style,
      } = applyVideoTemplate(template);
      setPromptText(prompt);
      setDuration(templateDuration);
      setSelectedStyle(style);
      setTemplateDialogOpen(false);
      showSuccess("模板已应用", `已应用"${template.name}"模板`);
    },
    [showSuccess],
  );

  const handleUploadReferenceVideo = useCallback(
    (file: File) => {
      if (referenceVideo && referenceVideo.startsWith("blob:")) {
        URL.revokeObjectURL(referenceVideo);
      }
      const blobUrl = URL.createObjectURL(file);
      referenceVideoBlobRef.current = blobUrl;
      setReferenceVideo(blobUrl);
      setReferenceVideoFile(file);
      setReferenceVideoName(file.name);
      showSuccess("参考视频已上传");
    },
    [showSuccess, referenceVideo],
  );

  const handleRemoveReferenceVideo = useCallback(() => {
    if (referenceVideo && referenceVideo.startsWith("blob:")) {
      URL.revokeObjectURL(referenceVideo);
    }
    referenceVideoBlobRef.current = null;
    setReferenceVideo(null);
    setReferenceVideoFile(null);
    setReferenceVideoName(null);
  }, [referenceVideo]);

  const handleRetry = useCallback(
    (task: VideoTask) => {
      if (task.prompt) {
        setPromptText(task.prompt);
      }
      handleGenerate();
    },
    [handleGenerate],
  );

  const quickExamples = [
    "一只白色猫咪在海边沙滩上奔跑，日落暖光，治愈电影感",
    "一个古风美女在樱花树下弹古筝，花瓣飘落，唯美浪漫",
    "赛博朋克城市夜景，霓虹灯闪烁，未来科技感",
  ];

  return (
    <PageErrorBoundary pageName="快速生成">
      <div className="h-full max-w-5xl mx-auto">
        <header className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-900/40 border border-purple-700/50 mb-4">
            <Wand2 className="w-4 h-4 text-purple-400" />
            <span className="text-purple-300 font-medium text-sm">
              快速视频生成
            </span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            一句话，生成你的动画视频
          </h1>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            不需要学习复杂的分镜，输入你的想法，一键生成专业级动画视频
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <Card className="border-2 border-purple-800/30 bg-slate-900/80 backdrop-blur">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-purple-400" />
                      描述你的视频
                    </CardTitle>
                    <CardDescription>
                      输入视频的核心内容，越详细效果越好
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setTemplateDialogOpen(true)}
                    className="gap-2 border-purple-700 hover:bg-purple-900/20 text-purple-200"
                  >
                    <LayoutTemplate className="w-4 h-4" />
                    选择模板
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  placeholder="例如：一只白色猫咪在海边沙滩上奔跑，日落暖光，治愈电影感..."
                  className="min-h-32 text-base resize-y bg-slate-800 border-slate-700 focus:border-purple-500"
                />
                <p className="text-sm text-slate-500">
                  提示：可以包含剧情、角色动作、画面风格、氛围描述
                </p>

                <div className="pt-4">
                  <Label className="text-sm text-slate-400 mb-2 block">
                    快速尝试：
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {quickExamples.map((example, idx) => (
                      <Button
                        key={idx}
                        variant="outline"
                        size="sm"
                        className="text-xs border-slate-700 hover:border-purple-600 hover:bg-purple-900/20 text-slate-300"
                        onClick={() => setPromptText(example)}
                      >
                        {example.slice(0, 20)}...
                      </Button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-slate-800 bg-slate-900/60">
              <CardHeader>
                <CardTitle className="text-lg">配置视频参数</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label className="text-slate-300">视频模型</Label>
                  <ModelSelector
                    capability="video"
                    value={selectedVideoModel}
                    onChange={setSelectedVideoModel}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-300">视频时长</Label>
                  <div className="flex flex-wrap gap-2">
                    {getDurationOptionsForModel(selectedVideoModel?.modelId).map((opt) => (
                      <Button
                        key={opt.value}
                        variant={duration === opt.value ? "default" : "outline"}
                        size="sm"
                        className={`
                          ${
                            duration === opt.value
                              ? "bg-purple-600 hover:bg-purple-700 text-white border-purple-600"
                              : "border-slate-700 hover:border-purple-500 text-slate-300"
                          }
                        `}
                        onClick={() => setDuration(opt.value)}
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-300">画面风格</Label>
                  <div className="flex flex-wrap gap-2">
                    {getStyleOptionsForModel(selectedVideoModel?.modelId).map((style) => (
                      <Button
                        key={style.value}
                        variant={
                          selectedStyle === style.value ? "default" : "outline"
                        }
                        size="sm"
                        className={`
                          ${
                            selectedStyle === style.value
                              ? "bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
                              : "border-slate-700 hover:border-purple-500 text-slate-300"
                          }
                        `}
                        onClick={() => setSelectedStyle(style.value)}
                      >
                        {style.label}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-300">分辨率</Label>
                  <Select
                    value={selectedResolution}
                    onValueChange={(v) => {
                      if (v)
                        setSelectedResolution(v);
                    }}
                  >
                    <SelectTrigger className="bg-slate-800 border-slate-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      {getResolutionOptionsForModel(selectedVideoModel?.modelId).map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-300 flex items-center gap-2">
                    <User className="w-4 h-4" />
                    锁定主角（可选）
                  </Label>
                  {charactersLoading ? (
                    <div className="flex items-center gap-2 p-3">
                      <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">加载角色中...</span>
                    </div>
                  ) : characters.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {characters.map((char) => (
                        <button
                          key={char.id}
                          onClick={() => toggleCharacter(char.id)}
                          className={`
                            flex items-center gap-2 p-2 rounded-lg border-2 transition-all
                            ${
                              selectedCharacters.includes(char.id)
                                ? "border-purple-500 bg-purple-900/40"
                                : "border-slate-700 bg-slate-800/50 hover:border-slate-600"
                            }
                          `}
                        >
                          {char.generatedImage && (
                            <img
                              src={char.generatedImage}
                              alt={char.name}
                              className="w-8 h-8 rounded object-cover"
                            />
                          )}
                          <span className="text-sm text-slate-300">
                            {char.name}
                          </span>
                          {selectedCharacters.includes(char.id) && (
                            <CheckCircle2 className="w-4 h-4 text-purple-400" />
                          )}
                        </button>
                      ))}
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-dashed border-slate-600"
                        onClick={() => guardedPush("/characters")}
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        新建角色
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-dashed border-slate-600 w-full"
                      onClick={() => guardedPush("/characters")}
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      创建角色以锁定主角形象
                    </Button>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-300 flex items-center gap-2">
                    <Image className="w-4 h-4" />
                    锁定场景（可选）
                  </Label>
                  {scenesLoading ? (
                    <div className="flex items-center gap-2 p-3">
                      <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">加载场景中...</span>
                    </div>
                  ) : scenes.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {scenes.map((scene) => (
                        <button
                          key={scene.id}
                          onClick={() => toggleScene(scene.id)}
                          className={`
                            flex items-center gap-2 p-2 rounded-lg border-2 transition-all
                            ${
                              selectedScene === scene.id
                                ? "border-blue-500 bg-blue-900/40"
                                : "border-slate-700 bg-slate-800/50 hover:border-slate-600"
                            }
                          `}
                        >
                          {scene.generatedImage && (
                            <img
                              src={scene.generatedImage}
                              alt={scene.name}
                              className="w-8 h-8 rounded object-cover"
                            />
                          )}
                          <span className="text-sm text-slate-300">
                            {scene.name}
                          </span>
                          {selectedScene === scene.id && (
                            <CheckCircle2 className="w-4 h-4 text-blue-400" />
                          )}
                        </button>
                      ))}
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-dashed border-slate-600"
                        onClick={() => guardedPush("/scenes")}
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        新建场景
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-dashed border-slate-600 w-full"
                      onClick={() => guardedPush("/scenes")}
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      创建场景以锁定背景环境
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            <AdvancedSettingsCard
              showAdvanced={showAdvanced}
              onToggleAdvanced={() => setShowAdvanced(!showAdvanced)}
              enableSmartOptimization={enableSmartOptimization}
              onSmartOptimizationChange={setEnableSmartOptimization}
              negativePrompt={negativePrompt}
              onNegativePromptChange={setNegativePrompt}
              referenceImage={referenceImage}
              onReferenceImageChange={setReferenceImage}
              referenceVideo={referenceVideo}
              referenceVideoName={referenceVideoName}
              onUploadReferenceVideo={handleUploadReferenceVideo}
              onRemoveReferenceVideo={handleRemoveReferenceVideo}
            />

            <Button
              size="lg"
              className="w-full h-14 text-lg font-semibold bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 shadow-xl shadow-purple-900/30"
              onClick={handleGenerate}
              disabled={isGenerating || !promptText.trim()}
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                  正在生成视频...
                </>
              ) : (
                <>
                  <Wand2 className="w-5 h-5 mr-2" />
                  立即生成视频
                </>
              )}
            </Button>

            {generatedPrompt && (
              <Card className="border-purple-200 bg-purple-50/50 dark:border-purple-800 dark:bg-purple-950/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-purple-700 dark:text-purple-300">
                    实际发送的提示词
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                    {generatedPrompt}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          <TaskResultPanel
            currentTask={currentTask ?? null}
            effectiveVideoUrl={effectiveVideoUrl}
            tasks={tasks}
            activeTaskId={activeTaskId ?? null}
            isGenerating={isGenerating}
            onDownload={handleDownload}
            onSaveToAssets={handleSaveToAssets}
            onRetry={handleRetry}
            onClearCompleted={clearCompletedTasks}
            characterPosterImage={getSelectedCharacterObjects()[0]?.generatedImage}
          />
        </div>

        <TemplateSelectDialog
          open={templateDialogOpen}
          onOpenChange={setTemplateDialogOpen}
          onApplyTemplate={handleApplyTemplate}
        />
      </div>
    </PageErrorBoundary>
  );
}
