"use client";

import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Character } from "@/domain/schemas";
import { useModelSelection } from "@/modules/prompt";
import { container } from "@/infrastructure/di";
import { getErrorMessage } from "@/shared/error-handler";
import type { CustomApiConfig } from "@/domain/types";
import { generateCharacterImagePrompt, generateCharacterDetailedPromptInstruction } from "@/modules/prompt";
import { characterService } from "../services";
import { errorLogger } from "@/shared/error-logger";

interface UseCharacterImageProps {
  currentCharacter: Character;
  currentCharacterRef: React.MutableRefObject<Character>;
  setCurrentCharacter: React.Dispatch<React.SetStateAction<Character>>;
  addAssetToLibrary: (
    url: string,
    type: "image" | "video",
    name: string,
    boundTo?: { type: "character" | "scene"; id: string; name: string },
  ) => void;
  success: (title: string, description?: string) => void;
  showError: (title: string, description?: string) => void;
}

export function useCharacterImage({
  currentCharacter,
  currentCharacterRef,
  setCurrentCharacter,
  addAssetToLibrary,
  success,
  showError,
}: UseCharacterImageProps) {
  const queryClient = useQueryClient();
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const isAnalyzingRef = useRef(false);
  const [useDetailedPrompt, setUseDetailedPrompt] = useState(false);
  const analyzeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [imageSize, setImageSize] = useState("1920x1920");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const analyzeFileInputRef = useRef<HTMLInputElement>(null);
  const [selectedImageModel, setSelectedImageModel] = useModelSelection("character-image-model");

  useEffect(() => {
    return () => {
      if (analyzeTimeoutRef.current) clearTimeout(analyzeTimeoutRef.current);
    };
  }, []);

  const generatePrompt = (char: Character) => {
    const result = generateCharacterImagePrompt(char);
    return result || "请输入角色信息生成提示词...";
  };

  const generateImage = async () => {
    const basicPrompt = generatePrompt(currentCharacter);
    if (!basicPrompt || basicPrompt === "请输入角色信息生成提示词...") {
      showError("请填写角色信息", "至少需要填写一些角色信息才能生成图像");
      return;
    }

    setIsGenerating(true);
    try {
      let finalPrompt = basicPrompt;
      if (useDetailedPrompt) {
        const detailedPromptInstruction = generateCharacterDetailedPromptInstruction(currentCharacter);
        const detailedPromptResponse = await container.textProvider.generateText(detailedPromptInstruction || basicPrompt, {
          maxTokens: 300,
          temperature: 0.7,
        });
        if (detailedPromptResponse.success && detailedPromptResponse.data?.text) {
          finalPrompt = detailedPromptResponse.data.text;
        } else {
          errorLogger.warn({ code: "PROMPT_GENERATE_FAILED", message: "提示词生成失败，使用基础提示词继续生成图片" });
        }
      }

      const imageOptions: CustomApiConfig & { size?: string } = { size: imageSize };
      if (selectedImageModel) {
        imageOptions.providerId = selectedImageModel.providerId;
        imageOptions.modelId = selectedImageModel.modelId;
      }
      const result = await container.imageProvider.generateImage(finalPrompt, "character", imageOptions);

      if (result.success && result.data?.imageUrl) {
        setGeneratedImage(result.data.imageUrl);
        success("图像生成成功", "角色图像已生成，记得保存到角色哦");
      } else {
        showError("图像生成失败", result.error || "请检查 API 配置后重试");
      }
    } catch (err) {
      errorLogger.error({ code: "IMAGE_GENERATE_ERROR", message: "生成图像失败", cause: err });
      showError("图像生成失败", getErrorMessage(err));
    } finally {
      setIsGenerating(false);
    }
  };

  const saveImageToCharacter = async () => {
    if (generatedImage && currentCharacter.id) {
      try {
        const result = await characterService.update(currentCharacter.id, {
          ...currentCharacter,
          refImagePath: generatedImage,
          generatedImage: generatedImage,
        });
        if (!result.ok) throw result.error;
        queryClient.invalidateQueries({ queryKey: ["characters"] });
        addAssetToLibrary(generatedImage, "image", currentCharacter.name || "角色图片", {
          type: "character",
          id: currentCharacter.id,
          name: currentCharacter.name || "未命名角色",
        });
        success("保存成功", "图像已保存到角色并加入素材库");
      } catch (err) {
        showError("保存失败", err instanceof Error ? err.message : "未知错误");
      }
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
        if (currentCharacter.id) {
          try {
            const updateResult = await characterService.update(currentCharacter.id, {
              ...currentCharacter,
              refImagePath: imageUrl,
              generatedImage: imageUrl,
            });
            if (!updateResult.ok) throw updateResult.error;
            queryClient.invalidateQueries({ queryKey: ["characters"] });
            addAssetToLibrary(imageUrl, "image", currentCharacter.name || "角色图片", {
              type: "character",
              id: currentCharacter.id,
              name: currentCharacter.name || "未命名角色",
            });
          } catch (err) {
            showError("保存失败", err instanceof Error ? err.message : "未知错误");
          }
        } else {
          addAssetToLibrary(imageUrl, "image", "上传的图片");
        }
        success("上传成功", "图片已上传并保存到素材库");
      } else {
        showError("上传失败", result.error || "请重试");
      }
    } catch (err) {
      errorLogger.error({ code: "UPLOAD_ERROR", message: "上传失败", cause: err });
      showError("上传失败", getErrorMessage(err));
    } finally {
      setIsUploading(false);
    }
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
    isAnalyzingRef.current = true;
    analyzeTimeoutRef.current = setTimeout(() => {
      if (isAnalyzingRef.current) {
        isAnalyzingRef.current = false;
        setIsAnalyzing(false);
        showError("分析超时", "分析过程超时，已自动重置状态");
      }
    }, 60000);

    setIsAnalyzing(true);
    try {
      const { width, height } = await validateImageSize(imageUrl);
      const MIN_SIZE = 14;
      if (width < MIN_SIZE || height < MIN_SIZE) {
        showError("图片尺寸过小", `最小允许尺寸: ${MIN_SIZE}像素。当前尺寸: 宽度 = ${width}, 高度 = ${height}。`);
        return;
      }

      const analyzeOptions: { providerId?: string; modelId?: string } = {};
      if (selectedImageModel?.providerId && selectedImageModel?.modelId) {
        analyzeOptions.providerId = selectedImageModel.providerId;
        analyzeOptions.modelId = selectedImageModel.modelId;
      }

      const result = await container.imageProvider.analyzeImage(imageUrl, "character", undefined, { providerId: analyzeOptions.providerId, modelId: analyzeOptions.modelId });
      if (result.success && result.data?.analyzed) {
        const analyzed = result.data.analyzed as Partial<Character>;
        const charRef = currentCharacterRef.current;
        const updatedCharacter = {
          ...charRef,
          name: analyzed.name || charRef.name,
          gender: analyzed.gender || charRef.gender,
          age: analyzed.age || charRef.age,
          style: analyzed.style || charRef.style,
          personality: analyzed.personality || charRef.personality,
          appearance: {
            hairColor: analyzed.appearance?.hairColor || charRef.appearance.hairColor,
            hairStyle: analyzed.appearance?.hairStyle || charRef.appearance.hairStyle,
            eyeColor: analyzed.appearance?.eyeColor || charRef.appearance.eyeColor,
            height: analyzed.appearance?.height || charRef.appearance.height,
            build: analyzed.appearance?.build || charRef.appearance.build,
            clothing: analyzed.appearance?.clothing || charRef.appearance.clothing,
          },
          description: analyzed.description || charRef.description,
          refImagePath: imageUrl,
          generatedImage: imageUrl,
        };

        setCurrentCharacter(updatedCharacter);
        if (charRef.id) {
          try {
            const updateResult = await characterService.update(charRef.id, updatedCharacter);
            if (!updateResult.ok) throw updateResult.error;
            queryClient.invalidateQueries({ queryKey: ["characters"] });
          } catch (err) {
            showError("保存失败", err instanceof Error ? err.message : "未知错误");
          }
        }

        addAssetToLibrary(imageUrl, "image", analyzed.name || currentCharacter.name || "角色图片", {
          type: "character",
          id: currentCharacter.id,
          name: analyzed.name || currentCharacter.name || "未命名角色",
        });
        success("分析完成", `已自动填充角色信息：${analyzed.name || "未命名角色"}，并保存到素材库`);
      } else {
        showError("分析失败", result.error || result.message || "请重试");
      }
    } catch (err) {
      errorLogger.error({ code: "ANALYZE_ERROR", message: "分析失败", cause: err });
      showError("分析失败", getErrorMessage(err));
    } finally {
      if (analyzeTimeoutRef.current) {
        clearTimeout(analyzeTimeoutRef.current);
        analyzeTimeoutRef.current = null;
      }
      isAnalyzingRef.current = false;
      setIsAnalyzing(false);
    }
  };

  const handleAnalyzeFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const result = await container.fileUploader.uploadFile(file);
      if (result.success && result.data?.url) {
        await analyzeImage(result.data.url);
      } else {
        showError("上传失败", result.error || "请重试");
      }
    } catch (err) {
      errorLogger.error({ code: "UPLOAD_ERROR", message: "上传失败", cause: err });
      showError("上传失败", getErrorMessage(err));
    } finally {
      setIsUploading(false);
    }
  };

  const clearImage = () => setGeneratedImage(null);

  return {
    isGenerating, setIsGenerating, generatedImage, setGeneratedImage,
    isUploading, isAnalyzing, useDetailedPrompt, setUseDetailedPrompt,
    imageSize, setImageSize, fileInputRef, analyzeFileInputRef,
    selectedImageModel, setSelectedImageModel,
    generatePrompt, generateImage, saveImageToCharacter,
    handleFileUpload, handleAnalyzeFileUpload, clearImage,
  };
}
