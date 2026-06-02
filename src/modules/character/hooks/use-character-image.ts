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
import { t } from "@/shared/constants";

interface UseCharacterImageProps {
  currentCharacter: Character;
  currentCharacterRef: React.MutableRefObject<Character>;
  setCurrentCharacter: (update: Character | ((prev: Character) => Character), shouldMarkDirty?: boolean) => void;
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
      showError(t("image.fillCharacterInfo"), t("image.fillCharacterInfoHint"));
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
        success(t("success.imageGenerated"), t("success.characterImageGeneratedDesc"));
      } else {
        showError(t("image.generateFailed"), result.error || t("image.checkApiConfig"));
      }
    } catch (err) {
      errorLogger.error({ code: "IMAGE_GENERATE_ERROR", message: "生成图像失败", cause: err });
      showError(t("image.generateFailed"), getErrorMessage(err));
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
        success(t("success.saved"), t("success.imageSavedToCharacter"));
      } catch (err) {
        errorLogger.error("[CharacterImage] 保存图像到角色失败", err instanceof Error ? err : undefined);
        showError(t("error.saveFailed"), err instanceof Error ? err.message : t("error.unknown"));
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
            errorLogger.error("[CharacterImage] 上传后保存图像到角色失败", err instanceof Error ? err : undefined);
            showError(t("error.saveFailed"), err instanceof Error ? err.message : t("error.unknown"));
          }
        } else {
          addAssetToLibrary(imageUrl, "image", "上传的图片");
        }
        success(t("success.uploaded"), t("success.imageSavedToLibrary"));
      } else {
        showError(t("error.uploadFailed"), result.error || t("common.retry"));
      }
    } catch (err) {
      errorLogger.error({ code: "UPLOAD_ERROR", message: "上传失败", cause: err });
      showError(t("error.uploadFailed"), getErrorMessage(err));
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
    const characterIdAtStart = currentCharacterRef.current.id;
    analyzeTimeoutRef.current = setTimeout(() => {
      if (isAnalyzingRef.current) {
        isAnalyzingRef.current = false;
        setIsAnalyzing(false);
        showError(t("image.analyzeTimeout"));
      }
    }, 60000);

    setIsAnalyzing(true);
    try {
      const { width, height } = await validateImageSize(imageUrl);
      const MIN_SIZE = 14;
      if (width < MIN_SIZE || height < MIN_SIZE) {
        showError(t("error.imageTooSmall"), t("error.imageSizeMin", { size: `${MIN_SIZE}像素。当前尺寸: 宽度 = ${width}, 高度 = ${height}。` }));
        return;
      }

      const analyzeOptions: { providerId?: string; modelId?: string } = {};
      if (selectedImageModel?.providerId && selectedImageModel?.modelId) {
        analyzeOptions.providerId = selectedImageModel.providerId;
        analyzeOptions.modelId = selectedImageModel.modelId;
      }

      const result = await container.imageProvider.analyzeImage(imageUrl, "character", undefined, { providerId: analyzeOptions.providerId, modelId: analyzeOptions.modelId });
      if (currentCharacterRef.current.id !== characterIdAtStart) return;

      if (result.success && result.data?.analyzed) {
        const analyzed = result.data.analyzed as Partial<Character>;

        setCurrentCharacter((prev) => ({
          ...prev,
          style: analyzed.style ?? prev.style,
          personality: analyzed.personality ?? prev.personality,
          appearance: {
            hairColor: analyzed.appearance?.hairColor ?? prev.appearance.hairColor,
            hairStyle: analyzed.appearance?.hairStyle ?? prev.appearance.hairStyle,
            eyeColor: analyzed.appearance?.eyeColor ?? prev.appearance.eyeColor,
            height: analyzed.appearance?.height ?? prev.appearance.height,
            build: analyzed.appearance?.build ?? prev.appearance.build,
            clothing: analyzed.appearance?.clothing ?? prev.appearance.clothing,
          },
          refImagePath: imageUrl,
          generatedImage: imageUrl,
        }), true);
        if (currentCharacterRef.current.id) {
          try {
            const updateResult = await characterService.update(currentCharacterRef.current.id, {
              ...currentCharacterRef.current,
              refImagePath: imageUrl,
              generatedImage: imageUrl,
            });
            if (!updateResult.ok) throw updateResult.error;
            queryClient.invalidateQueries({ queryKey: ["characters"] });
          } catch (err) {
            errorLogger.error("[CharacterImage] 分析后保存图像到角色失败", err instanceof Error ? err : undefined);
            showError(t("error.saveFailed"), err instanceof Error ? err.message : t("error.unknown"));
          }
        }

        addAssetToLibrary(imageUrl, "image", analyzed.name || currentCharacterRef.current.name || "角色图片", {
          type: "character",
          id: currentCharacterRef.current.id,
          name: analyzed.name || currentCharacterRef.current.name || "未命名角色",
        });
        success(t("success.analysisComplete"), t("success.characterAnalysisResult", { name: analyzed.name || "未命名角色" }));
      } else {
        showError(t("image.analyzeFailed"), result.error || result.message || t("common.retry"));
      }
    } catch (err) {
      errorLogger.error({ code: "ANALYZE_ERROR", message: "分析失败", cause: err });
      showError(t("image.analyzeFailed"), getErrorMessage(err));
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
        showError(t("error.uploadFailed"), result.error || t("common.retry"));
      }
    } catch (err) {
      errorLogger.error({ code: "UPLOAD_ERROR", message: "上传失败", cause: err });
      showError(t("error.uploadFailed"), getErrorMessage(err));
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
