import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Character } from "@/domain/schemas";
import { useModelSelection } from "@/modules/prompt";
import { container } from "@/infrastructure/di";
import { mapUserFacingError } from "@/shared/utils/user-facing-error";
import type { CustomApiConfig } from "@/domain/types";
import { generateCharacterImagePrompt, generateCharacterDetailedPromptInstruction } from "@/modules/prompt";
import { characterService } from "../services";
import { errorLogger } from "@/shared/error-logger";
import { t } from "@/shared/constants";
import { validateImageSize } from "@/shared/hooks/use-entity-image";

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

const ANALYZE_TIMEOUT_MS = 60000;
const MIN_IMAGE_SIZE = 14;

async function buildDetailedPrompt(basicPrompt: string, character: Character): Promise<string> {
  const detailedPromptInstruction = generateCharacterDetailedPromptInstruction(character);
  const response = await container.textProvider.generateText(detailedPromptInstruction || basicPrompt, {
    maxTokens: 300,
    temperature: 0.7,
  });
  if (response.success && response.data?.text) {
    return response.data.text;
  }
  errorLogger.warn({ code: "PROMPT_GENERATE_FAILED", message: t("error.promptGenFailedUseBasic") });
  return basicPrompt;
}

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

async function saveImageToCharacterRecord(
  character: Character,
  imageUrl: string,
  queryClient: ReturnType<typeof useQueryClient>,
  addAssetToLibrary: UseCharacterImageProps["addAssetToLibrary"],
  success: (title: string, description?: string) => void,
  showError: (title: string, description?: string) => void,
): Promise<void> {
  if (!character.id) return;
  try {
    const result = await characterService.update(character.id, {
      ...character,
      refImagePath: imageUrl,
      generatedImage: imageUrl,
    });
    if (!result.ok) throw result.error;
    queryClient.invalidateQueries({ queryKey: ["characters"] });
    addAssetToLibrary(imageUrl, "image", character.name || "角色图片", {
      type: "character",
      id: character.id,
      name: character.name || "未命名角色",
    });
    success(t("success.saved"), t("success.imageSavedToCharacter"));
  } catch (err) {
    errorLogger.error("[CharacterImage] 保存图像到角色失败", err instanceof Error ? err : undefined);
    showError(t("error.saveFailed"), mapUserFacingError(err));
  }
}

interface AnalyzeOptions {
  selectedImageModel: { providerId: string; modelId: string } | null;
  queryClient: ReturnType<typeof useQueryClient>;
  currentCharacterRef: React.MutableRefObject<Character>;
  setCurrentCharacter: UseCharacterImageProps["setCurrentCharacter"];
  addAssetToLibrary: UseCharacterImageProps["addAssetToLibrary"];
  success: (title: string, description?: string) => void;
  showError: (title: string, description?: string) => void;
  isAnalyzingRef: React.MutableRefObject<boolean>;
  analyzeTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  setIsAnalyzing: (v: boolean) => void;
}

async function performImageAnalysis(
  imageUrl: string,
  opts: AnalyzeOptions,
): Promise<void> {
  const characterIdAtStart = opts.currentCharacterRef.current.id;
  opts.analyzeTimeoutRef.current = setTimeout(() => {
    if (opts.isAnalyzingRef.current) {
      opts.isAnalyzingRef.current = false;
      opts.setIsAnalyzing(false);
      opts.showError(t("image.analyzeTimeout"));
    }
  }, ANALYZE_TIMEOUT_MS);

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

    const providerOpts = opts.selectedImageModel?.providerId && opts.selectedImageModel?.modelId
      ? { providerId: opts.selectedImageModel.providerId, modelId: opts.selectedImageModel.modelId }
      : {};
    const result = await container.imageProvider.analyzeImage(imageUrl, "character", undefined, providerOpts);
    if (opts.currentCharacterRef.current.id !== characterIdAtStart) return;

    if (!result.success || !result.data?.analyzed) {
      opts.showError(t("image.analyzeFailed"), result.error || result.message || t("common.retry"));
      return;
    }

    const analyzed = result.data.analyzed as Partial<Character>;
    opts.setCurrentCharacter((prev) => ({
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

    await persistAnalyzedImage(imageUrl, analyzed, opts);
  } catch (err) {
    errorLogger.error({ code: "ANALYZE_ERROR", message: t("image.analyzeFailed"), cause: err });
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

async function persistAnalyzedImage(
  imageUrl: string,
  analyzed: Partial<Character>,
  opts: AnalyzeOptions,
): Promise<void> {
  const character = opts.currentCharacterRef.current;
  if (character.id) {
    try {
      const updateResult = await characterService.update(character.id, {
        ...character,
        refImagePath: imageUrl,
        generatedImage: imageUrl,
      });
      if (!updateResult.ok) throw updateResult.error;
      opts.queryClient.invalidateQueries({ queryKey: ["characters"] });
    } catch (err) {
      errorLogger.error("[CharacterImage] 分析后保存图像到角色失败", err instanceof Error ? err : undefined);
      opts.showError(t("error.saveFailed"), mapUserFacingError(err));
    }
  }
  opts.addAssetToLibrary(imageUrl, "image", analyzed.name || character.name || "角色图片", {
    type: "character",
    id: character.id,
    name: analyzed.name || character.name || "未命名角色",
  });
  opts.success(t("success.analysisComplete"), t("success.characterAnalysisResult", { name: analyzed.name || "未命名角色" }));
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
  const isGeneratingRef = useRef(false);
  const [useDetailedPrompt, setUseDetailedPrompt] = useState(false);
  const analyzeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    if (isGeneratingRef.current) return;
    const basicPrompt = generatePrompt(currentCharacter);
    if (!basicPrompt || basicPrompt === "请输入角色信息生成提示词...") {
      showError(t("image.fillCharacterInfo"), t("image.fillCharacterInfoHint"));
      return;
    }

    isGeneratingRef.current = true;
    setIsGenerating(true);
    try {
      const finalPrompt = useDetailedPrompt
        ? await buildDetailedPrompt(basicPrompt, currentCharacter)
        : basicPrompt;
      const imageOptions = buildImageOptions(imageSize, selectedImageModel);
      const result = await container.imageProvider.generateImage(finalPrompt, "character", imageOptions);

      if (result.success && result.data?.imageUrl) {
        setGeneratedImage(result.data.imageUrl);
        success(t("success.imageGenerated"), t("success.characterImageGeneratedDesc"));
      } else {
        showError(t("image.generateFailed"), result.error || t("image.checkApiConfig"));
      }
    } catch (err) {
      errorLogger.error({ code: "IMAGE_GENERATE_ERROR", message: t("error.imageGenerateFailed"), cause: err });
      showError(t("image.generateFailed"), mapUserFacingError(err));
    } finally {
      isGeneratingRef.current = false;
      setIsGenerating(false);
    }
  };

  const saveImageToCharacter = async () => {
    if (generatedImage && currentCharacter.id) {
      await saveImageToCharacterRecord(
        currentCharacter,
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
      if (currentCharacter.id) {
        await saveImageToCharacterRecord(
          currentCharacter,
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
    } finally {
      setIsUploading(false);
    }
  };

  const analyzeImage = async (imageUrl: string) => {
    if (isAnalyzingRef.current) return;
    isAnalyzingRef.current = true;
    await performImageAnalysis(imageUrl, {
      selectedImageModel,
      queryClient,
      currentCharacterRef,
      setCurrentCharacter,
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
    try {
      const result = await container.fileUploader.uploadFile(file);
      if (result.success && result.data?.url) {
        await analyzeImage(result.data.url);
      } else {
        showError(t("error.uploadFailed"), result.error || t("common.retry"));
      }
    } catch (err) {
      errorLogger.error({ code: "UPLOAD_ERROR", message: t("error.uploadFailed"), cause: err });
      showError(t("error.uploadFailed"), mapUserFacingError(err));
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
