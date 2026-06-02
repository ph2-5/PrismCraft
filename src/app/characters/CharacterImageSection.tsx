import { Button } from "@/shared/ui/button";
import { Label } from "@/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { SaveStatusIndicator, type SaveStatus } from "@/shared/presentation/SaveStatusIndicator";
import { ModelSelector } from "@/modules/prompt";
import type { ModelSelection } from "@/domain/schemas";
import { resolveImageUrl } from "@/shared/utils/image-url";
import type { Character } from "@/domain/schemas";
import {
  Save,
  X,
  Loader2,
  Upload,
  ScanLine,
  Sparkles,
  Wand2,
  Folder,
} from "lucide-react";
import { t } from "@/shared/constants/messages";

interface CharacterImageSectionProps {
  currentCharacter: Character;
  generatedImage: string | null;
  setGeneratedImage: (v: string | null) => void;
  isGenerating: boolean;
  isUploading: boolean;
  isAnalyzing: boolean;
  useDetailedPrompt: boolean;
  setUseDetailedPrompt: (v: boolean) => void;
  imageSize: string;
  setImageSize: (v: string) => void;
  selectedImageModel: ModelSelection | null;
  setSelectedImageModel: (v: ModelSelection | null) => void;
  generatePrompt: (char: Character) => string;
  generateImage: () => void;
  saveImageToCharacter: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  analyzeFileInputRef: React.RefObject<HTMLInputElement | null>;
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleAnalyzeFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  setShowAssetSelector: (v: boolean) => void;
  isDirty: boolean;
  saveStatus: SaveStatus;
  saveError: string | null | undefined;
  handleSave: () => void;
}

export function CharacterImageSection({
  currentCharacter,
  generatedImage,
  setGeneratedImage,
  isGenerating,
  isUploading,
  isAnalyzing,
  useDetailedPrompt,
  setUseDetailedPrompt,
  imageSize,
  setImageSize,
  selectedImageModel,
  setSelectedImageModel,
  generatePrompt,
  generateImage,
  saveImageToCharacter,
  fileInputRef,
  analyzeFileInputRef,
  handleFileUpload,
  handleAnalyzeFileUpload,
  setShowAssetSelector,
  isDirty,
  saveStatus,
  saveError,
  handleSave,
}: CharacterImageSectionProps) {
  return (
    <>
      <div className="mt-6 p-4 rounded-lg bg-slate-900/50 border border-violet-800/30 space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium text-violet-200">
            {t("character.aiPrompt")}
          </Label>
          <Button
            variant="outline"
            size="sm"
            className={`gap-2 border-violet-700 ${useDetailedPrompt ? "bg-violet-900/40 text-violet-200" : "bg-violet-900/20 text-violet-300"} hover:bg-violet-900/40`}
            onClick={() => setUseDetailedPrompt(!useDetailedPrompt)}
          >
            <Sparkles className="w-4 h-4" />
            {useDetailedPrompt ? t("character.aiOptimized") : t("character.aiOptimize")}
          </Button>
        </div>
        <p className="text-sm text-slate-300 whitespace-pre-wrap">
          {generatePrompt(currentCharacter)}
        </p>
        {useDetailedPrompt && (
          <p className="text-xs text-violet-400/60">
            {t("character.aiOptimizeHint")}
          </p>
        )}
      </div>

      {(generatedImage ||
        currentCharacter.avatarPath ||
        currentCharacter.generatedImage ||
        currentCharacter.refImagePath) && (
        <div className="mt-6 p-4 rounded-lg bg-slate-900/50 border border-purple-800/30 space-y-3">
          <Label className="text-sm font-medium text-purple-200">
            {t("character.characterImage")}
          </Label>
          <div className="relative aspect-square max-w-sm mx-auto rounded-lg overflow-hidden border border-purple-700/50 shadow-lg shadow-purple-500/20">
            <img
              src={resolveImageUrl(
                generatedImage ||
                  currentCharacter.avatarPath ||
                  currentCharacter.generatedImage ||
                  currentCharacter.refImagePath,
              )}
              alt="Generated character"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-2"
              onClick={saveImageToCharacter}
              disabled={!currentCharacter.id}
            >
              <Save className="w-4 h-4" />
              {t("character.saveToCharacter")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => setGeneratedImage(null)}
            >
              <X className="w-4 h-4" />
              {t("character.clear")}
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mt-6">
        <SaveStatusIndicator
          status={isDirty ? "unsaved" : saveStatus}
          errorMessage={saveError ?? undefined}
        />
        <Button
          className="flex-1 gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 shadow-lg shadow-violet-500/20"
          onClick={handleSave}
          disabled={saveStatus === "saving"}
        >
          <Save className="w-4 h-4" />
          {saveStatus === "saving" ? t("common.saving") : t("character.saveCharacter")}
        </Button>
        <div className="flex gap-2">
          <Select value={imageSize} onValueChange={(v) => { if (v) setImageSize(v); }}>
            <SelectTrigger className="w-[140px] border-purple-700 bg-purple-900/30 text-purple-100">
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
            className="gap-2 border-purple-700 bg-purple-900/20 hover:bg-purple-900/40 text-purple-200"
            onClick={generateImage}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Wand2 className="w-4 h-4" />
            )}
            {isGenerating ? t("common.generating") : t("character.generateImage")}
          </Button>
        </div>
        <ModelSelector
          capability="image"
          value={selectedImageModel}
          onChange={setSelectedImageModel}
        />
        <Button
          variant="outline"
          className="gap-2 border-blue-700 bg-blue-900/20 hover:bg-blue-900/40 text-blue-200"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
        >
          {isUploading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Upload className="w-4 h-4" />
          )}
          {isUploading ? t("common.uploading") : t("character.uploadImage")}
        </Button>
        <Button
          variant="outline"
          className="gap-2 border-amber-700 bg-amber-900/20 hover:bg-amber-900/40 text-amber-200"
          onClick={() => setShowAssetSelector(true)}
        >
          <Folder className="w-4 h-4" />
          {t("character.selectFromLibrary")}
        </Button>
        <Button
          variant="secondary"
          className="gap-2 bg-cyan-900/30 hover:bg-cyan-900/50 text-cyan-200 border-cyan-700 border"
          onClick={() => analyzeFileInputRef.current?.click()}
          disabled={isAnalyzing || isUploading}
        >
          {isAnalyzing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <ScanLine className="w-4 h-4" />
          )}
          {isAnalyzing ? t("common.analyzing") : t("character.recognizePerson")}
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
    </>
  );
}
