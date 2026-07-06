import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Scene } from "@/domain/schemas";
import { useModelSelection } from "@/modules/prompt";
import { generateSceneImagePrompt, generateSimpleSceneImagePrompt, generateScenePromptOptimization } from "@/modules/prompt";
import { container } from "@/infrastructure/di";
import { mapUserFacingError } from "@/shared/utils/user-facing-error";
import type { CustomApiConfig } from "@/domain/types";
import { errorLogger } from "@/shared/error-logger";
import { t } from "@/shared/constants";
import { sceneService } from "../services";
import { validateImageSize } from "@/shared/hooks/use-entity-image";

interface UseSceneImageProps {
  currentScene: Scene;
  currentSceneRef: React.MutableRefObject<Scene>;
  setCurrentScene: (update: Scene | ((prev: Scene) => Scene), shouldMarkDirty?: boolean) => void;
  addAssetToLibrary: (
    url: string, type: "image" | "video", name: string,
    boundTo?: { type: "character" | "scene"; id: string; name: string },
  ) => void;
  success: (title: string, description?: string) => void;
  showError: (title: string, description?: string) => void;
}

const ANALYZE_TIMEOUT_MS = 60000;
const MIN_IMAGE_SIZE = 14;

function buildImageOptions(
  imageSize: string,
  selectedImageModel: { providerId: string; modelId: string } | null,
): CustomApiConfig & { size?: string } {
  const options: CustomApiConfig & { size?: string } = { size: imageSize };
  if (selectedImageModel) {
    options.providerId = selectedImageModel.providerId;
    options.modelId = selectedImageModel.modelId;
  }
  return options;
}

async function saveImageToSceneRecord(
  scene: Scene,
  imageUrl: string,
  queryClient: ReturnType<typeof useQueryClient>,
  addAssetToLibrary: UseSceneImageProps["addAssetToLibrary"],
  success: (title: string, description?: string) => void,
  showError: (title: string, description?: string) => void,
): Promise<void> {
  if (!scene.id) return;
  try {
    const result = await sceneService.update(scene.id, {
      ...scene,
      scenePath: imageUrl,
      generatedImage: imageUrl,
    });
    if (!result.ok) throw result.error;
    queryClient.invalidateQueries({ queryKey: ["scenes"] });
    addAssetToLibrary(imageUrl, "image", scene.name || "场景图片", {
      type: "scene",
      id: scene.id,
      name: scene.name || "未命名场景",
    });
    success(t("success.saved"), t("success.imageSavedToLibrary"));
  } catch (err) {
    errorLogger.error("[SceneImage] 保存图像到场景失败", err instanceof Error ? err : undefined);
    showError(t("error.saveFailed"), mapUserFacingError(err));
  }
}

interface AnalyzeOptions {
  selectedImageModel: { providerId: string; modelId: string } | null;
  queryClient: ReturnType<typeof useQueryClient>;
  currentSceneRef: React.MutableRefObject<Scene>;
  setCurrentScene: UseSceneImageProps["setCurrentScene"];
  addAssetToLibrary: UseSceneImageProps["addAssetToLibrary"];
  success: (title: string, description?: string) => void;
  showError: (title: string, description?: string) => void;
  isAnalyzingRef: React.MutableRefObject<boolean>;
  analyzeTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  setIsAnalyzing: (v: boolean | ((prev: boolean) => boolean)) => void;
}

async function persistAnalyzedSceneImage(
  imageUrl: string,
  analyzed: Partial<Scene>,
  opts: AnalyzeOptions,
): Promise<void> {
  const scene = opts.currentSceneRef.current;
  if (scene.id) {
    try {
      const updateResult = await sceneService.update(scene.id, {
        ...scene,
        scenePath: imageUrl,
        generatedImage: imageUrl,
      });
      if (!updateResult.ok) throw updateResult.error;
      opts.queryClient.invalidateQueries({ queryKey: ["scenes"] });
    } catch (err) {
      errorLogger.error("[SceneImage] 分析后保存图像到场景失败", err instanceof Error ? err : undefined);
      opts.showError(t("error.saveFailed"), mapUserFacingError(err));
    }
  }
  opts.addAssetToLibrary(imageUrl, "image", analyzed.name || scene.name || "场景图片", {
    type: "scene",
    id: scene.id,
    name: analyzed.name || scene.name || "未命名场景",
  });
  opts.success(t("success.analysisComplete"), t("success.sceneAnalysisResult", { name: analyzed.name || "未命名场景" }));
}

async function performSceneImageAnalysis(imageUrl: string, opts: AnalyzeOptions): Promise<void> {
  const sceneIdAtStart = opts.currentSceneRef.current.id;
  opts.analyzeTimeoutRef.current = setTimeout(() => {
    opts.setIsAnalyzing((prev) => {
      if (prev) {
        opts.isAnalyzingRef.current = false;
        opts.showError(t("image.analyzeTimeout"));
        return false;
      }
      return prev;
    });
  }, ANALYZE_TIMEOUT_MS);

  opts.isAnalyzingRef.current = true;
  opts.setIsAnalyzing(true);
  try {
    const { width, height } = await validateImageSize(imageUrl);
    if (width < MIN_IMAGE_SIZE || height < MIN_IMAGE_SIZE) {
      opts.showError(
        t("error.imageTooSmall"),
        t("error.imageSizeMin", { size: `${MIN_IMAGE_SIZE}像素。当前尺寸: 宽度 = ${width}, 高度 = ${height}。` }),
      );
      return;
    }

    const analyzeOptions: { providerId?: string; modelId?: string } = {};
    if (opts.selectedImageModel?.providerId && opts.selectedImageModel?.modelId) {
      analyzeOptions.providerId = opts.selectedImageModel.providerId;
      analyzeOptions.modelId = opts.selectedImageModel.modelId;
    }
    const result = await container.imageProvider.analyzeImage(
      imageUrl, "scene", undefined,
      { providerId: analyzeOptions.providerId, modelId: analyzeOptions.modelId },
    );
    if (opts.currentSceneRef.current.id !== sceneIdAtStart) return;

    if (!result.success || !result.data?.analyzed) {
      opts.showError(t("image.analyzeFailed"), result.error || result.message || t("common.retry"));
      return;
    }

    const analyzed = result.data.analyzed as Partial<Scene>;
    opts.setCurrentScene((prev) => ({
      ...prev,
      elements: analyzed.elements ?? prev.elements,
      colors: analyzed.colors ?? prev.colors,
      lighting: analyzed.lighting ?? prev.lighting,
      mood: analyzed.mood ?? prev.mood,
      weather: analyzed.weather ?? prev.weather,
      timeOfDay: analyzed.timeOfDay ?? prev.timeOfDay,
      scenePath: imageUrl,
      generatedImage: imageUrl,
    }), true);

    await persistAnalyzedSceneImage(imageUrl, analyzed, opts);
  } catch (err) {
    errorLogger.error("分析失败:", err);
    opts.showError(t("image.analyzeFailed"), mapUserFacingError(err));
  } finally {
    if (opts.analyzeTimeoutRef.current) {
      clearTimeout(opts.analyzeTimeoutRef.current);
      opts.analyzeTimeoutRef.current = null;
    }
    opts.isAnalyzingRef.current = false;
    opts.setIsAnalyzing(false);
  }
}

export function useSceneImage({
  currentScene, currentSceneRef, setCurrentScene, addAssetToLibrary, success, showError,
}: UseSceneImageProps) {
  const queryClient = useQueryClient();
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const isAnalyzingRef = useRef(false);
  const isGeneratingRef = useRef(false);
  const analyzeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isOptimizingPrompt, setIsOptimizingPrompt] = useState(false);
  const [imageSize, setImageSize] = useState("1920x1920");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const analyzeFileInputRef = useRef<HTMLInputElement>(null);
  const [selectedImageModel, setSelectedImageModel] = useModelSelection("scene-image-model");

  useEffect(() => {
    return () => { if (analyzeTimeoutRef.current) clearTimeout(analyzeTimeoutRef.current); };
  }, []);

  const generatePrompt = (scene: Scene) => generateSceneImagePrompt(scene) || "请输入场景信息生成提示词...";

  const optimizePrompt = async () => {
    const userDescription = currentScene.description || "";
    if (!userDescription) { showError(t("image.fillDescription"), t("image.fillDescriptionHint")); return; }
    setIsOptimizingPrompt(true);
    try {
      const prompt = generateScenePromptOptimization(userDescription);
      const result = await container.textProvider.generateText(prompt, { maxTokens: 300, temperature: 0.8 });
      const optimizedText = result.data?.text?.trim();
      if (result.success && optimizedText) {
        setCurrentScene((prev) => ({ ...prev, imageGenerationPrompt: optimizedText }), true);
        success(t("success.promptOptimized"), t("success.promptOptimizedDesc"));
      } else { showError(t("image.optimizeFailed"), result.error || t("image.checkApiConfig")); }
    } catch (err) { errorLogger.error(t("error.promptOptimizeFailed"), err); showError(t("image.optimizeFailed"), mapUserFacingError(err)); }
    finally { setIsOptimizingPrompt(false); }
  };

  const generateImage = async () => {
    if (isGeneratingRef.current) return;
    const basicPrompt = currentScene.imageGenerationPrompt || generateSimpleSceneImagePrompt(currentScene);
    if (!basicPrompt || basicPrompt === "请输入场景信息生成提示词...") { showError(t("image.fillInfo"), t("image.fillInfoHint")); return; }
    isGeneratingRef.current = true;
    setIsGenerating(true);
    try {
      const imageOptions = buildImageOptions(imageSize, selectedImageModel);
      const result = await container.imageProvider.generateImage(basicPrompt, "scene", imageOptions);
      if (result.success && result.data?.imageUrl) { setGeneratedImage(result.data.imageUrl); success(t("success.imageGenerated"), t("success.sceneImageGeneratedDesc")); }
      else { showError(t("image.generateFailed"), result.error || t("image.checkApiConfig")); }
    } catch (err) { errorLogger.error({ code: "IMAGE_GENERATE_ERROR", message: t("error.imageGenerateFailed"), cause: err }); showError(t("image.generateFailed"), mapUserFacingError(err)); }
    finally { isGeneratingRef.current = false; setIsGenerating(false); }
  };

  const saveImageToScene = async () => {
    if (generatedImage && currentScene.id) {
      await saveImageToSceneRecord(
        currentScene,
        generatedImage,
        queryClient,
        addAssetToLibrary,
        success,
        showError,
      );
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const result = await container.fileUploader.uploadFile(file);
      if (!result.success || !result.data?.url) {
        showError(t("error.uploadFailed"), result.error || t("common.retry"));
        return;
      }
      const imageUrl = result.data.url;
      setGeneratedImage(imageUrl);
      if (currentScene.id) {
        await saveImageToSceneRecord(
          currentScene,
          imageUrl,
          queryClient,
          addAssetToLibrary,
          success,
          showError,
        );
      } else {
        addAssetToLibrary(imageUrl, "image", "上传的图片");
      }
      success(t("success.uploaded"), t("success.imageSavedToLibrary"));
    } catch (err) {
      errorLogger.error({ code: "UPLOAD_ERROR", message: t("error.uploadFailed"), cause: err });
      showError(t("error.uploadFailed"), mapUserFacingError(err));
    }
    finally { setIsUploading(false); }
  };

  const analyzeImage = async (imageUrl: string) => {
    if (isAnalyzingRef.current) return;
    await performSceneImageAnalysis(imageUrl, {
      selectedImageModel,
      queryClient,
      currentSceneRef,
      setCurrentScene,
      addAssetToLibrary,
      success,
      showError,
      isAnalyzingRef,
      analyzeTimeoutRef,
      setIsAnalyzing,
    });
  };

  const handleAnalyzeFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try { const result = await container.fileUploader.uploadFile(file); if (result.success && result.data?.url) { await analyzeImage(result.data.url); } else { showError(t("error.uploadFailed"), result.error || t("common.retry")); } }
    catch (err) { errorLogger.error({ code: "UPLOAD_ERROR", message: t("error.uploadFailed"), cause: err }); showError(t("error.uploadFailed"), mapUserFacingError(err)); }
    finally { setIsUploading(false); }
  };

  const clearImage = () => setGeneratedImage(null);

  return {
    isGenerating, setIsGenerating, generatedImage, setGeneratedImage, isUploading, isAnalyzing,
    isOptimizingPrompt, imageSize, setImageSize, fileInputRef, analyzeFileInputRef,
    selectedImageModel, setSelectedImageModel, generatePrompt, optimizePrompt, generateImage,
    saveImageToScene, handleFileUpload, handleAnalyzeFileUpload, clearImage,
  };
}
