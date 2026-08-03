import type { RefObject } from "react";
import {
  Wand2,
  Upload,
  ScanLine,
  Save,
  Loader2,
  Folder,
  Sparkles,
  X,
} from "lucide-react";
import { ModelSelector } from "@/modules/prompt";
import { t } from "@/shared/constants/messages";
import type { ModelSelection, Scene } from "@/domain/schemas";

interface SceneImageGenerationCardProps {
  scene: Scene;
  avatarImage: string | undefined;
  generatedImage: string | null;
  isGenerating: boolean;
  isUploading: boolean;
  isAnalyzing: boolean;
  isOptimizingPrompt: boolean;
  selectedImageModel: ModelSelection | null;
  setSelectedImageModel: (v: ModelSelection | null) => void;
  generatePrompt: (scene: Scene) => string;
  optimizePrompt: () => void;
  generateImage: () => void;
  saveImageToScene: () => void;
  clearImage: () => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  analyzeFileInputRef: RefObject<HTMLInputElement | null>;
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleAnalyzeFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  setShowAssetSelector: (v: boolean) => void;
}

export function SceneImageGenerationCard({
  scene,
  avatarImage,
  generatedImage,
  isGenerating,
  isUploading,
  isAnalyzing,
  isOptimizingPrompt,
  selectedImageModel,
  setSelectedImageModel,
  generatePrompt,
  optimizePrompt,
  generateImage,
  saveImageToScene,
  clearImage,
  fileInputRef,
  analyzeFileInputRef,
  handleFileUpload,
  handleAnalyzeFileUpload,
  setShowAssetSelector,
}: SceneImageGenerationCardProps) {
  return (
    <div className="card !p-3.5">
      <PromptHeader
        isOptimizingPrompt={isOptimizingPrompt}
        optimizePrompt={optimizePrompt}
      />
      <div
        className="card2 p-2.5 text-xs leading-[1.7] mb-2 max-h-[100px] overflow-y-auto"
      >
        {generatePrompt(scene)}
      </div>
      <ImagePreview
        avatarImage={avatarImage}
        generatedImage={generatedImage}
        scene={scene}
      />
      <ImageActionButtons
        isGenerating={isGenerating}
        isUploading={isUploading}
        isAnalyzing={isAnalyzing}
        canSave={!!scene.id}
        generatedImage={generatedImage}
        selectedImageModel={selectedImageModel}
        setSelectedImageModel={setSelectedImageModel}
        generateImage={generateImage}
        saveImageToScene={saveImageToScene}
        clearImage={clearImage}
        fileInputRef={fileInputRef}
        analyzeFileInputRef={analyzeFileInputRef}
        handleFileUpload={handleFileUpload}
        handleAnalyzeFileUpload={handleAnalyzeFileUpload}
        setShowAssetSelector={setShowAssetSelector}
      />
    </div>
  );
}

function PromptHeader({
  isOptimizingPrompt,
  optimizePrompt,
}: {
  isOptimizingPrompt: boolean;
  optimizePrompt: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-2">
      <div className="section-label">{t("scene.imageGenerationPrompt")}</div>
      <button
        type="button"
        className={`btn ${isOptimizingPrompt ? "btn-primary" : "btn-outline"} btn-xs !gap-1`}
        onClick={optimizePrompt}
        disabled={isOptimizingPrompt}
      >
        {isOptimizingPrompt ? (
          <Loader2 className="animate-spin" size={12} />
        ) : (
          <Sparkles size={12} />
        )}
        {isOptimizingPrompt ? t("scene.optimizing") : t("scene.aiOptimize")}
      </button>
    </div>
  );
}

function ImagePreview({
  scene,
  avatarImage,
  generatedImage,
}: {
  scene: Scene;
  avatarImage: string | undefined;
  generatedImage: string | null;
}) {
  if (!(generatedImage || scene.scenePath || scene.generatedImage)) return null;
  return (
    <div
      className="w-full aspect-video max-w-[320px] mx-auto mb-2 rounded-lg overflow-hidden border border-border"
    >
      <img
        src={avatarImage}
        alt={t("scene.sceneImage")}
        className="w-full h-full object-cover"
      />
    </div>
  );
}

interface ImageActionButtonsProps {
  isGenerating: boolean;
  isUploading: boolean;
  isAnalyzing: boolean;
  canSave: boolean;
  generatedImage: string | null;
  selectedImageModel: ModelSelection | null;
  setSelectedImageModel: (v: ModelSelection | null) => void;
  generateImage: () => void;
  saveImageToScene: () => void;
  clearImage: () => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  analyzeFileInputRef: RefObject<HTMLInputElement | null>;
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleAnalyzeFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  setShowAssetSelector: (v: boolean) => void;
}

function ImageActionButtons({
  isGenerating,
  isUploading,
  isAnalyzing,
  canSave,
  generatedImage,
  selectedImageModel,
  setSelectedImageModel,
  generateImage,
  saveImageToScene,
  clearImage,
  fileInputRef,
  analyzeFileInputRef,
  handleFileUpload,
  handleAnalyzeFileUpload,
  setShowAssetSelector,
}: ImageActionButtonsProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-1.5 items-center">
        <button
          type="button"
          className="btn btn-primary btn-sm flex-1 justify-center !gap-1"
          onClick={generateImage}
          disabled={isGenerating}
        >
          {isGenerating ? (
            <Loader2 className="animate-spin" size={14} />
          ) : (
            <Wand2 size={14} />
          )}
          {isGenerating ? t("scene.generating") : t("scene.generateImage")}
        </button>
        <ModelSelector
          capability="image"
          value={selectedImageModel}
          onChange={setSelectedImageModel}
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          className="btn btn-outline btn-xs !gap-1"
          onClick={saveImageToScene}
          disabled={!canSave}
        >
          <Save size={12} />
          {t("scene.saveToScene")}
        </button>
        {generatedImage && (
          <button
            type="button"
            className="btn btn-ghost btn-xs !gap-1"
            onClick={clearImage}
          >
            <X size={12} />
            {t("scene.clear")}
          </button>
        )}
        <button
          type="button"
          className="btn btn-outline btn-xs !gap-1"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
        >
          {isUploading ? (
            <Loader2 className="animate-spin" size={12} />
          ) : (
            <Upload size={12} />
          )}
          {isUploading ? t("scene.uploading") : t("scene.uploadImage")}
        </button>
        <button
          type="button"
          className="btn btn-outline btn-xs !gap-1"
          onClick={() => setShowAssetSelector(true)}
        >
          <Folder size={12} />
          {t("scene.selectFromLibrary")}
        </button>
        <button
          type="button"
          className="btn btn-outline btn-xs !gap-1"
          onClick={() => analyzeFileInputRef.current?.click()}
          disabled={isAnalyzing || isUploading}
        >
          {isAnalyzing ? (
            <Loader2 className="animate-spin" size={12} />
          ) : (
            <ScanLine size={12} />
          )}
          {isAnalyzing ? t("scene.analyzing") : t("scene.analyzeScene")}
        </button>
      </div>
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
  );
}
