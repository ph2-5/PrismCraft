import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Scene } from "@/domain/schemas";
import { useModelSelection } from "@/modules/prompt";
import { generateSceneImagePrompt, generateSimpleSceneImagePrompt, generateScenePromptOptimization } from "@/modules/prompt";
import { container } from "@/infrastructure/di";
import { getErrorMessage } from "@/shared/error-handler";
import type { CustomApiConfig } from "@/domain/types";
import { errorLogger } from "@/shared/error-logger";
import { t } from "@/shared/constants";
import { sceneService } from "../services";

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

export function useSceneImage({
  currentScene, currentSceneRef, setCurrentScene, addAssetToLibrary, success, showError,
}: UseSceneImageProps) {
  const queryClient = useQueryClient();
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const isAnalyzingRef = useRef(false);
  const analyzeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
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
    } catch (err) { errorLogger.error(t("error.promptOptimizeFailed"), err); showError(t("image.optimizeFailed"), getErrorMessage(err)); }
    finally { setIsOptimizingPrompt(false); }
  };

  const generateImage = async () => {
    const basicPrompt = currentScene.imageGenerationPrompt || generateSimpleSceneImagePrompt(currentScene);
    if (!basicPrompt || basicPrompt === "请输入场景信息生成提示词...") { showError(t("image.fillInfo"), t("image.fillInfoHint")); return; }
    setIsGenerating(true);
    try {
      const imageOptions: CustomApiConfig & { size?: string } = { size: imageSize };
      if (selectedImageModel) { imageOptions.providerId = selectedImageModel.providerId; imageOptions.modelId = selectedImageModel.modelId; }
      const result = await container.imageProvider.generateImage(basicPrompt, "scene", imageOptions);
      if (result.success && result.data?.imageUrl) { setGeneratedImage(result.data.imageUrl); success(t("success.imageGenerated"), t("success.sceneImageGeneratedDesc")); }
      else { showError(t("image.generateFailed"), result.error || t("image.checkApiConfig")); }
    } catch (err) { errorLogger.error({ code: "IMAGE_GENERATE_ERROR", message: t("error.imageGenerateFailed"), cause: err }); showError(t("image.generateFailed"), getErrorMessage(err)); }
    finally { setIsGenerating(false); }
  };

  const saveImageToScene = async () => {
    if (generatedImage && currentScene.id) {
      try {
        const result = await sceneService.update(currentScene.id, { ...currentScene, scenePath: generatedImage, generatedImage });
        if (!result.ok) throw result.error;
        queryClient.invalidateQueries({ queryKey: ["scenes"] });
        addAssetToLibrary(generatedImage, "image", currentScene.name || "场景图片", { type: "scene", id: currentScene.id, name: currentScene.name || "未命名场景" });
        success(t("success.saved"), t("success.imageSavedToLibrary"));
      } catch (err) { errorLogger.error("[SceneImage] 保存图像到场景失败", err instanceof Error ? err : undefined); showError(t("error.saveFailed"), err instanceof Error ? err.message : t("error.unknown")); }
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const result = await container.fileUploader.uploadFile(file);
      if (result.success && result.data?.url) {
        const imageUrl = result.data.url;
        setGeneratedImage(imageUrl);
        if (currentScene.id) {
          try {
            const updateResult = await sceneService.update(currentScene.id, { ...currentScene, scenePath: imageUrl, generatedImage: imageUrl });
            if (!updateResult.ok) throw updateResult.error;
            queryClient.invalidateQueries({ queryKey: ["scenes"] });
            addAssetToLibrary(imageUrl, "image", currentScene.name || "场景图片", { type: "scene", id: currentScene.id, name: currentScene.name || "未命名场景" });
          } catch (err) { errorLogger.error("[SceneImage] 上传后保存图像到场景失败", err instanceof Error ? err : undefined); showError(t("error.saveFailed"), err instanceof Error ? err.message : t("error.unknown")); }
        } else { addAssetToLibrary(imageUrl, "image", "上传的图片"); }
        success(t("success.uploaded"), t("success.imageSavedToLibrary"));
      } else { showError(t("error.uploadFailed"), result.error || t("common.retry")); }
    } catch (err) { errorLogger.error({ code: "UPLOAD_ERROR", message: "上传失败", cause: err }); showError(t("error.uploadFailed"), getErrorMessage(err)); }
    finally { setIsUploading(false); }
  };

  const validateImageSize = async (imageUrl: string): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.width, height: img.height });
      img.onerror = () => reject(new Error("图片加载失败，无法验证尺寸"));
      img.src = imageUrl;
    });
  };

  const analyzeImage = async (imageUrl: string) => {
    if (isAnalyzingRef.current) return;
    const sceneIdAtStart = currentSceneRef.current.id;
    analyzeTimeoutRef.current = setTimeout(() => {
      setIsAnalyzing((prev) => { if (prev) { isAnalyzingRef.current = false; showError(t("image.analyzeTimeout")); return false; } return prev; });
    }, 60000);
    isAnalyzingRef.current = true;
    setIsAnalyzing(true);
    try {
      const { width, height } = await validateImageSize(imageUrl);
      const MIN_SIZE = 14;
      if (width < MIN_SIZE || height < MIN_SIZE) { showError(t("error.imageTooSmall"), t("error.imageSizeMin", { size: `${MIN_SIZE}像素。当前尺寸: 宽度 = ${width}, 高度 = ${height}。` })); return; }
      const analyzeOptions: { providerId?: string; modelId?: string } = {};
      if (selectedImageModel?.providerId && selectedImageModel?.modelId) { analyzeOptions.providerId = selectedImageModel.providerId; analyzeOptions.modelId = selectedImageModel.modelId; }
      const result = await container.imageProvider.analyzeImage(imageUrl, "scene", undefined, { providerId: analyzeOptions.providerId, modelId: analyzeOptions.modelId });
      if (currentSceneRef.current.id !== sceneIdAtStart) return;

      if (result.success && result.data?.analyzed) {
        const analyzed = result.data.analyzed as Partial<Scene>;
        setCurrentScene((prev) => ({
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
        if (currentSceneRef.current.id) {
          try {
            const updateResult = await sceneService.update(currentSceneRef.current.id, {
              ...currentSceneRef.current,
              scenePath: imageUrl,
              generatedImage: imageUrl,
            }); if (!updateResult.ok) throw updateResult.error; queryClient.invalidateQueries({ queryKey: ["scenes"] }); }
          catch (err) { errorLogger.error("[SceneImage] 分析后保存图像到场景失败", err instanceof Error ? err : undefined); showError(t("error.saveFailed"), err instanceof Error ? err.message : t("error.unknown")); }
        }
        addAssetToLibrary(imageUrl, "image", analyzed.name || currentSceneRef.current.name || "场景图片", { type: "scene", id: currentSceneRef.current.id, name: analyzed.name || currentSceneRef.current.name || "未命名场景" });
        success(t("success.analysisComplete"), t("success.sceneAnalysisResult", { name: analyzed.name || "未命名场景" }));
      } else { showError(t("image.analyzeFailed"), result.error || result.message || t("common.retry")); }
    } catch (err) { errorLogger.error("分析失败:", err); showError(t("image.analyzeFailed"), getErrorMessage(err)); }
    finally { if (analyzeTimeoutRef.current) { clearTimeout(analyzeTimeoutRef.current); analyzeTimeoutRef.current = null; } isAnalyzingRef.current = false; setIsAnalyzing(false); }
  };

  const handleAnalyzeFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try { const result = await container.fileUploader.uploadFile(file); if (result.success && result.data?.url) { await analyzeImage(result.data.url); } else { showError(t("error.uploadFailed"), result.error || t("common.retry")); } }
    catch (err) { errorLogger.error({ code: "UPLOAD_ERROR", message: "上传失败", cause: err }); showError(t("error.uploadFailed"), getErrorMessage(err)); }
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
