"use client";

import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Scene } from "@/domain/schemas";
import { useModelSelection } from "@/modules/prompt";
import { generateSceneImagePrompt, generateSimpleSceneImagePrompt, generateScenePromptOptimization } from "@/modules/prompt";
import { container } from "@/infrastructure/di";
import { getErrorMessage } from "@/shared/error-handler";
import type { CustomApiConfig } from "@/domain/types";
import { errorLogger } from "@/shared/error-logger";
import { sceneService } from "../services";

interface UseSceneImageProps {
  currentScene: Scene;
  currentSceneRef: React.MutableRefObject<Scene>;
  setCurrentScene: React.Dispatch<React.SetStateAction<Scene>>;
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
    if (!userDescription) { showError("请填写场景描述", "需要先填写场景描述才能优化提示词"); return; }
    setIsOptimizingPrompt(true);
    try {
      const prompt = generateScenePromptOptimization(userDescription);
      const result = await container.textProvider.generateText(prompt, { maxTokens: 300, temperature: 0.8 });
      if (result.success && result.data?.text) {
        setCurrentScene((prev) => ({ ...prev, imageGenerationPrompt: result.data!.text.trim() }));
        success("提示词优化成功", "提示词已优化完成");
      } else { showError("提示词优化失败", result.error || "请检查 API 配置后重试"); }
    } catch (err) { errorLogger.error("提示词优化失败:", err); showError("提示词优化失败", getErrorMessage(err)); }
    finally { setIsOptimizingPrompt(false); }
  };

  const generateImage = async () => {
    const basicPrompt = currentScene.imageGenerationPrompt || generateSimpleSceneImagePrompt(currentScene);
    if (!basicPrompt || basicPrompt === "请输入场景信息生成提示词...") { showError("请填写场景信息", "至少需要填写一些场景信息才能生成图像"); return; }
    setIsGenerating(true);
    try {
      const imageOptions: CustomApiConfig & { size?: string } = { size: imageSize };
      if (selectedImageModel) { imageOptions.providerId = selectedImageModel.providerId; imageOptions.modelId = selectedImageModel.modelId; }
      const result = await container.imageProvider.generateImage(basicPrompt, "scene", imageOptions);
      if (result.success && result.data?.imageUrl) { setGeneratedImage(result.data.imageUrl); success("图像生成成功", "场景图像已生成，记得保存到场景哦"); }
      else { showError("图像生成失败", result.error || "请检查 API 配置后重试"); }
    } catch (err) { errorLogger.error({ code: "IMAGE_GENERATE_ERROR", message: "生成图像失败", cause: err }); showError("图像生成失败", getErrorMessage(err)); }
    finally { setIsGenerating(false); }
  };

  const saveImageToScene = async () => {
    if (generatedImage && currentScene.id) {
      try {
        const result = await sceneService.update(currentScene.id, { ...currentScene, scenePath: generatedImage, generatedImage });
        if (!result.ok) throw result.error;
        queryClient.invalidateQueries({ queryKey: ["scenes"] });
        addAssetToLibrary(generatedImage, "image", currentScene.name || "场景图片", { type: "scene", id: currentScene.id, name: currentScene.name || "未命名场景" });
        success("保存成功", "图像已保存到场景并加入素材库");
      } catch (err) { showError("保存失败", err instanceof Error ? err.message : "未知错误"); }
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
          } catch (err) { showError("保存失败", err instanceof Error ? err.message : "未知错误"); }
        } else { addAssetToLibrary(imageUrl, "image", "上传的图片"); }
        success("上传成功", "图片已上传并保存到素材库");
      } else { showError("上传失败", result.error || "请重试"); }
    } catch (err) { errorLogger.error({ code: "UPLOAD_ERROR", message: "上传失败", cause: err }); showError("上传失败", getErrorMessage(err)); }
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
    analyzeTimeoutRef.current = setTimeout(() => {
      setIsAnalyzing((prev) => { if (prev) { isAnalyzingRef.current = false; showError("分析超时", "分析过程超时，已自动重置状态"); return false; } return prev; });
    }, 60000);
    isAnalyzingRef.current = true;
    setIsAnalyzing(true);
    try {
      const { width, height } = await validateImageSize(imageUrl);
      const MIN_SIZE = 14;
      if (width < MIN_SIZE || height < MIN_SIZE) { showError("图片尺寸过小", `最小允许尺寸: ${MIN_SIZE}像素。当前尺寸: 宽度 = ${width}, 高度 = ${height}。`); return; }
      const analyzeOptions: { providerId?: string; modelId?: string } = {};
      if (selectedImageModel?.providerId && selectedImageModel?.modelId) { analyzeOptions.providerId = selectedImageModel.providerId; analyzeOptions.modelId = selectedImageModel.modelId; }
      const result = await container.imageProvider.analyzeImage(imageUrl, "scene", undefined, { providerId: analyzeOptions.providerId, modelId: analyzeOptions.modelId });
      if (result.success && result.data?.analyzed) {
        const analyzed = result.data.analyzed as Partial<Scene>;
        const sceneRef = currentSceneRef.current;
        const updatedScene = {
          ...sceneRef, name: analyzed.name || sceneRef.name, type: analyzed.type || sceneRef.type,
          timeOfDay: analyzed.timeOfDay || sceneRef.timeOfDay, weather: analyzed.weather || sceneRef.weather,
          mood: analyzed.mood || sceneRef.mood, lighting: analyzed.lighting || sceneRef.lighting,
          elements: analyzed.elements || sceneRef.elements, colors: analyzed.colors || sceneRef.colors,
          description: analyzed.description || sceneRef.description, scenePath: imageUrl, generatedImage: imageUrl,
        };
        setCurrentScene(updatedScene);
        if (sceneRef.id) {
          try { const updateResult = await sceneService.update(sceneRef.id, updatedScene); if (!updateResult.ok) throw updateResult.error; queryClient.invalidateQueries({ queryKey: ["scenes"] }); }
          catch (err) { showError("保存失败", err instanceof Error ? err.message : "未知错误"); }
        }
        addAssetToLibrary(imageUrl, "image", analyzed.name || sceneRef.name || "场景图片", { type: "scene", id: sceneRef.id, name: analyzed.name || sceneRef.name || "未命名场景" });
        success("分析完成", `已自动填充场景信息：${analyzed.name || "未命名场景"}，并保存到素材库`);
      } else { showError("分析失败", result.error || result.message || "请重试"); }
    } catch (err) { errorLogger.error("分析失败:", err); showError("分析失败", getErrorMessage(err)); }
    finally { if (analyzeTimeoutRef.current) { clearTimeout(analyzeTimeoutRef.current); analyzeTimeoutRef.current = null; } isAnalyzingRef.current = false; setIsAnalyzing(false); }
  };

  const handleAnalyzeFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try { const result = await container.fileUploader.uploadFile(file); if (result.success && result.data?.url) { await analyzeImage(result.data.url); } else { showError("上传失败", result.error || "请重试"); } }
    catch (err) { errorLogger.error({ code: "UPLOAD_ERROR", message: "上传失败", cause: err }); showError("上传失败", getErrorMessage(err)); }
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
