"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Sparkles,
  User,
  Image,
  Wand2,
  Settings,
  ChevronDown,
  ChevronUp,
  Download,
  RefreshCw,
  Layers,
  CheckCircle2,
  AlertCircle,
  Plus,
  X,
  Trash2,
  Film,
  LayoutTemplate,
  Grid3x3,
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
import { Switch } from "@/shared/ui/switch";
import { Label } from "@/shared/ui/label";
import { Progress } from "@/shared/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/shared/ui/dialog";
import {
  generateQuickModeVideoPrompt,
  getDurationOptionsForModel,
  getResolutionOptionsForModel,
  getStyleOptionsForModel,
} from "@/modules/prompt";
import {
  templateCategories,
  getTemplatesByCategory,
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
import { createSimpleVideoErrorHandler, createVideoErrorHandler } from "@/shared/utils/media-error-handler";
import { confirm } from "@/shared/utils/confirm";
import { useNavigationGuard } from "@/shared/presentation/BeforeUnloadGuard";

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

  // 表单状态
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
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [cachedVideoUrl, setCachedVideoUrl] = useState<string | null>(null);
  const [cachedVideoUrlTaskId, setCachedVideoUrlTaskId] = useState<string | null>(null);
  const [isSavingToAssets, setIsSavingToAssets] = useState(false);

  useEffect(() => {
    return () => {
      if (cachedVideoUrl && cachedVideoUrl.startsWith("blob:")) {
        URL.revokeObjectURL(cachedVideoUrl);
      }
    };
  }, [cachedVideoUrl]);

  useEffect(() => {
    return () => {
      if (referenceVideo && referenceVideo.startsWith("blob:")) {
        URL.revokeObjectURL(referenceVideo);
      }
    };
  }, [referenceVideo]);

  // 视频任务管理
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

  // 当前任务
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

  // 处理角色选择
  const toggleCharacter = (charId: string) => {
    setSelectedCharacters((prev) =>
      prev.includes(charId)
        ? prev.filter((id) => id !== charId)
        : [...prev, charId],
    );
  };

  // 处理场景选择
  const toggleScene = (sceneId: string) => {
    setSelectedScene((prev) => (prev === sceneId ? null : sceneId));
  };

  // 获取选中的角色对象
  const getSelectedCharacterObjects = useCallback(() => {
    return characters.filter((c) => selectedCharacters.includes(c.id));
  }, [characters, selectedCharacters]);

  // 获取选中的场景对象
  const getSelectedSceneObject = useCallback(() => {
    return scenes.find((s) => s.id === selectedScene) || null;
  }, [scenes, selectedScene]);

  // 开始生成视频
  const handleGenerate = async () => {
    if (!promptText.trim()) {
      showError("请输入视频描述");
      return;
    }
    if (!selectedVideoModel?.providerId || !selectedVideoModel?.modelId) {
      showError("请先选择视频生成模型", "请在下方选择视频模型后再生成");
      return;
    }

    try {
      // 生成提示词
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
          showError("文件过大", "参考视频文件不能超过 50MB");
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
      showError("生成失败，请重试");
    }
  };

  // 处理下载
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

  // 处理保存到素材库
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
      showError("保存失败");
    } finally {
      setIsSavingToAssets(false);
    }
  };

  // 应用视频模板
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

  // 处理上传参考视频
  const handleUploadReferenceVideo = useCallback(
    (file: File) => {
      if (referenceVideo && referenceVideo.startsWith("blob:")) {
        URL.revokeObjectURL(referenceVideo);
      }
      const blobUrl = URL.createObjectURL(file);
      setReferenceVideo(blobUrl);
      setReferenceVideoFile(file);
      setReferenceVideoName(file.name);
      showSuccess("参考视频已上传");
    },
    [showSuccess, referenceVideo],
  );

  // 处理删除参考视频
  const handleRemoveReferenceVideo = useCallback(() => {
    if (referenceVideo && referenceVideo.startsWith("blob:")) {
      URL.revokeObjectURL(referenceVideo);
    }
    setReferenceVideo(null);
    setReferenceVideoFile(null);
    setReferenceVideoName(null);
  }, [referenceVideo]);

  // 快速示例
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
          {/* 左侧：配置区域 */}
          <div className="lg:col-span-2 space-y-6">
            {/* 核心输入区 */}
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

                {/* 快速示例 */}
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

            {/* 可视化配置区 */}
            <Card className="border border-slate-800 bg-slate-900/60">
              <CardHeader>
                <CardTitle className="text-lg">配置视频参数</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* 视频模型选择 */}
                <div className="space-y-2">
                  <Label className="text-slate-300">视频模型</Label>
                  <ModelSelector
                    capability="video"
                    value={selectedVideoModel}
                    onChange={setSelectedVideoModel}
                  />
                </div>
                {/* 时长选择 */}
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

                {/* 风格选择 */}
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

                {/* 分辨率选择 */}
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

                {/* 角色选择 */}
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

                {/* 场景选择 */}
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

            {/* 高级设置 */}
            <Card className="border border-slate-800 bg-slate-900/60">
              <CardHeader
                className="cursor-pointer"
                onClick={() => setShowAdvanced(!showAdvanced)}
              >
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Settings className="w-5 h-5 text-slate-400" />
                    高级设置
                  </CardTitle>
                  {showAdvanced ? (
                    <ChevronUp className="w-5 h-5 text-slate-500" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-slate-500" />
                  )}
                </div>
              </CardHeader>
              {showAdvanced && (
                <CardContent className="space-y-4">
                  {/* 智能优化 */}
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-slate-300">智能优化</Label>
                      <p className="text-sm text-slate-500">
                        自动优化提示词、画面构图和节奏控制
                      </p>
                    </div>
                    <Switch
                      checked={enableSmartOptimization}
                      onCheckedChange={setEnableSmartOptimization}
                    />
                  </div>

                  {/* 负面提示词 */}
                  <div className="space-y-2">
                    <Label className="text-slate-300">负面提示词</Label>
                    <Textarea
                      value={negativePrompt}
                      onChange={(e) => setNegativePrompt(e.target.value)}
                      placeholder="输入不希望出现的内容，例如：恐怖画面、血腥场景..."
                      className="bg-slate-800 border-slate-700 text-sm"
                    />
                  </div>

                  {/* 参考图片 */}
                  <div className="space-y-2">
                    <Label className="text-slate-300">参考图片</Label>
                    {referenceImage ? (
                      <div className="relative inline-block">
                        <img
                          src={referenceImage}
                          alt="参考"
                          className="w-32 h-32 rounded-lg object-cover border border-slate-700"
                        />
                        <Button
                          variant="destructive"
                          size="sm"
                          className="absolute -top-2 -right-2 w-6 h-6 p-0 rounded-full"
                          onClick={() => setReferenceImage(null)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center">
                        <p className="text-slate-500 text-sm mb-2">
                          点击上传参考图片
                        </p>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          id="ref-image-upload"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = (event) => {
                                setReferenceImage(
                                  event.target?.result as string,
                                );
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                        />
                        <Button
                          variant="outline"
                          onClick={() =>
                            document.getElementById("ref-image-upload")?.click()
                          }
                        >
                          选择图片
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* 参考视频 */}
                  <div className="space-y-2">
                    <Label className="text-slate-300 flex items-center gap-2">
                      <Film className="w-4 h-4" />
                      参考视频（可选）
                    </Label>
                    {referenceVideo ? (
                      <div className="relative">
                        <video
                          src={referenceVideo}
                          controls
                          className="w-full max-h-48 rounded-lg border border-slate-700"
                          onError={createSimpleVideoErrorHandler()}
                        />
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-sm text-slate-400">
                            {referenceVideoName}
                          </span>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={handleRemoveReferenceVideo}
                          >
                            <Trash2 className="w-4 h-4 mr-1" />
                            移除
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center">
                        <p className="text-slate-500 text-sm mb-2">
                          上传参考视频，让AI学习动作和风格
                        </p>
                        <input
                          type="file"
                          accept="video/*"
                          className="hidden"
                          id="ref-video-upload"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              handleUploadReferenceVideo(file);
                            }
                          }}
                        />
                        <Button
                          variant="outline"
                          onClick={() =>
                            document.getElementById("ref-video-upload")?.click()
                          }
                        >
                          <Film className="w-4 h-4 mr-2" />
                          选择视频
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              )}
            </Card>

            {/* 生成按钮 */}
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

          {/* 右侧：结果和历史 */}
          <div className="space-y-6">
            {/* 当前任务 */}
            {currentTask && (
              <Card className="border-2 border-purple-700/50 bg-slate-900/90">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Film className="w-5 h-5 text-purple-400" />
                    当前任务
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* 进度 */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">
                        {currentTask.status === "pending" && "排队中..."}
                        {currentTask.status === "generating" && "生成中..."}
                        {currentTask.status === "completed" && "已完成!"}
                        {currentTask.status === "failed" && "生成失败"}
                      </span>
                      <span className="text-slate-500">
                        {currentTask.progress}%
                      </span>
                    </div>
                    <Progress
                      value={currentTask.progress}
                      className="bg-slate-800"
                    />
                  </div>

                  {/* 错误信息 */}
                  {currentTask.status === "failed" && (
                    <div className="flex items-start gap-2 p-3 bg-red-900/30 rounded-lg border border-red-800/50">
                      <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                      <p className="text-sm text-red-300">
                        {currentTask.message || "生成失败，请重试"}
                      </p>
                    </div>
                  )}

                  {/* 视频预览 */}
                  {currentTask.status === "completed" &&
                    effectiveVideoUrl && (
                      <div className="space-y-4">
                        <div className="aspect-video bg-black rounded-lg overflow-hidden border border-slate-700">
                          <video
                            src={effectiveVideoUrl}
                            controls
                            className="w-full h-full"
                            poster={
                              getSelectedCharacterObjects()[0]?.generatedImage
                            }
                            onError={createVideoErrorHandler()}
                          />
                        </div>

                        {/* 操作按钮 */}
                        <div className="flex gap-2">
                          <Button
                            className="flex-1"
                            onClick={() =>
                              handleDownload(
                                effectiveVideoUrl || "",
                                `quick-video-${Date.now()}.mp4`,
                              )
                            }
                          >
                            <Download className="w-4 h-4 mr-2" />
                            下载视频
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => handleSaveToAssets(currentTask)}
                          >
                            <Layers className="w-4 h-4 mr-2" />
                            保存
                          </Button>
                        </div>
                      </div>
                    )}
                </CardContent>
              </Card>
            )}

            {/* 历史任务 */}
            {tasks.filter((t) => t.taskId !== activeTaskId).length > 0 && (
              <Card className="border border-slate-800 bg-slate-900/60">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">历史生成</CardTitle>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        if (
                          await confirm("确定要清空所有已完成的任务记录吗？", "清空任务记录")
                        ) {
                          clearCompletedTasks();
                        }
                      }}
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      清空
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 max-h-96 overflow-y-auto">
                  {tasks
                    .filter((t) => t.taskId !== activeTaskId)
                    .slice()
                    .reverse()
                    .map((task) => (
                      <div
                        key={task.taskId}
                        className="p-3 rounded-lg bg-slate-800/50 border border-slate-700"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span
                            className={`
                              text-xs px-2 py-0.5 rounded-full
                              ${
                                task.status === "completed"
                                  ? "bg-green-900/50 text-green-400"
                                  : task.status === "failed"
                                    ? "bg-red-900/50 text-red-400"
                                    : "bg-yellow-900/50 text-yellow-400"
                              }
                            `}
                          >
                            {task.status === "completed" && "已完成"}
                            {task.status === "failed" && "失败"}
                            {["pending", "generating"].includes(task.status) &&
                              "处理中"}
                          </span>
                          <span className="text-xs text-slate-500">
                            {new Date(task.createdAt).toLocaleTimeString()}
                          </span>
                        </div>
                        {task.videoUrl && (
                          <div className="flex gap-2 mt-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1"
                              onClick={() =>
                                handleDownload(
                                  task.videoUrl,
                                  `quick-video-${task.taskId}.mp4`,
                                )
                              }
                            >
                              <Download className="w-4 h-4 mr-1" />
                              下载
                            </Button>
                          </div>
                        )}
                        {task.status === "failed" && (
                          <div className="flex gap-2 mt-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1"
                              disabled={isGenerating}
                              onClick={() => {
                                if (isGenerating) return;
                                if (task.prompt) {
                                  setPromptText(task.prompt);
                                }
                                handleGenerate();
                              }}
                            >
                              <RefreshCw className="w-4 h-4 mr-1" />
                              重试
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                </CardContent>
              </Card>
            )}

            {/* 提示卡片 */}
            <Card className="border border-slate-800 bg-gradient-to-br from-purple-900/20 to-slate-900/60">
              <CardHeader>
                <CardTitle className="text-lg">温馨提示</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-slate-400">
                <p>💡 详细的描述会获得更好的效果</p>
                <p>🎭 创建并锁定角色，可以确保视频中角色形象一致</p>
                <p>🏠 锁定场景，可以保持画面环境的连贯性</p>
                <p>⚙️ 需要更精细的控制？可以进入专业模式进行编辑</p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* 模板选择对话框 */}
        <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
          <DialogContent className="max-w-3xl bg-slate-800 border-purple-700 text-slate-200">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-purple-100">
                <LayoutTemplate className="w-5 h-5" />
                选择视频模板
              </DialogTitle>
              <DialogDescription className="text-purple-300">
                选择一个预设模板，快速开始你的视频创作
              </DialogDescription>
            </DialogHeader>

            {/* 分类选择 */}
            <div className="flex flex-wrap gap-2 mb-4">
              {templateCategories.map((category) => (
                <Button
                  key={category.id}
                  variant={
                    selectedCategory === category.id ? "default" : "outline"
                  }
                  size="sm"
                  onClick={() => setSelectedCategory(category.id)}
                  className={
                    selectedCategory === category.id
                      ? "bg-purple-600 hover:bg-purple-700"
                      : "border-slate-700 text-slate-300 hover:border-purple-600 hover:bg-purple-900/20"
                  }
                >
                  {category.name}
                </Button>
              ))}
            </div>

            {/* 模板列表 */}
            <div className="space-y-3 max-h-[50vh] overflow-y-auto">
              {getTemplatesByCategory(selectedCategory).map((template) => (
                <div
                  key={template.id}
                  className="p-4 rounded-lg border border-purple-700/50 bg-slate-900/50 hover:bg-slate-900 cursor-pointer transition-all"
                  onClick={() => handleApplyTemplate(template)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-purple-100 flex items-center gap-2">
                        <Grid3x3 className="w-4 h-4 text-purple-400" />
                        {template.name}
                      </h3>
                      <p className="text-sm text-purple-300 mt-1">
                        {template.description}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 bg-slate-800 px-2 py-1 rounded">
                        {template.duration}秒
                      </span>
                      <span className="text-xs text-slate-400 bg-slate-800 px-2 py-1 rounded">
                        {template.style}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setTemplateDialogOpen(false)}
                className="border-purple-700 text-purple-200"
              >
                取消
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageErrorBoundary>
  );
}
