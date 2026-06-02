import { Button } from "@/shared/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { ModelSelector, type ModelSelection } from "@/modules/prompt";
import { SaveStatusIndicator, type SaveStatus } from "@/shared/presentation/SaveStatusIndicator";
import {
  Wand2,
  Save,
  Loader2,
  Upload,
  ScanLine,
  Folder,
} from "lucide-react";

type EntityType = "character" | "scene";

const ENTITY_CONFIG: Record<EntityType, {
  saveLabel: string;
  saveBtnClass: string;
  sizeSelectClass: string;
  generateBtnClass: string;
  analyzeLabel: string;
  analyzeBtnClass: string;
}> = {
  character: {
    saveLabel: "保存角色",
    saveBtnClass: "flex-1 gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 shadow-lg shadow-violet-500/20",
    sizeSelectClass: "w-[140px] border-purple-700 bg-purple-900/30 text-purple-100",
    generateBtnClass: "gap-2 border-purple-700 bg-purple-900/20 hover:bg-purple-900/40 text-purple-200",
    analyzeLabel: "图片识别人物",
    analyzeBtnClass: "gap-2 bg-cyan-900/30 hover:bg-cyan-900/50 text-cyan-200 border-cyan-700 border",
  },
  scene: {
    saveLabel: "保存场景",
    saveBtnClass: "flex-1 gap-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 shadow-lg shadow-cyan-500/20",
    sizeSelectClass: "w-36 border-blue-700 bg-blue-900/30 text-blue-100",
    generateBtnClass: "gap-2 border-blue-700 bg-blue-900/20 hover:bg-blue-900/40 text-blue-200",
    analyzeLabel: "图片识别场景",
    analyzeBtnClass: "gap-2 bg-teal-900/30 hover:bg-teal-900/50 text-teal-200 border-teal-700 border",
  },
};

interface ImageActionToolbarProps {
  isDirty: boolean;
  saveStatus: SaveStatus;
  saveError?: string;
  handleSave: () => void;
  isGenerating: boolean;
  imageSize: string;
  setImageSize: (size: string) => void;
  generateImage: () => void;
  selectedImageModel: ModelSelection | null;
  setSelectedImageModel: (selection: ModelSelection | null) => void;
  isUploading: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isAnalyzing: boolean;
  analyzeFileInputRef: React.RefObject<HTMLInputElement | null>;
  handleAnalyzeFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onShowAssetSelector: () => void;
  entityType: EntityType;
}

export function ImageActionToolbar({
  isDirty,
  saveStatus,
  saveError,
  handleSave,
  isGenerating,
  imageSize,
  setImageSize,
  generateImage,
  selectedImageModel,
  setSelectedImageModel,
  isUploading,
  fileInputRef,
  handleFileUpload,
  isAnalyzing,
  analyzeFileInputRef,
  handleAnalyzeFileUpload,
  onShowAssetSelector,
  entityType,
}: ImageActionToolbarProps) {
  const config = ENTITY_CONFIG[entityType];

  return (
    <div className="flex flex-wrap gap-2 mt-6">
      <SaveStatusIndicator
        status={isDirty ? "unsaved" : saveStatus}
        errorMessage={saveError}
      />
      <Button
        className={config.saveBtnClass}
        onClick={handleSave}
        disabled={saveStatus === "saving"}
      >
        {saveStatus === "saving" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {saveStatus === "saving" ? "保存中..." : config.saveLabel}
      </Button>
      <div className="flex gap-2">
        <Select
          value={imageSize}
          onValueChange={(v) => { if (v) setImageSize(v); }}
        >
          <SelectTrigger className={config.sizeSelectClass}>
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
          className={config.generateBtnClass}
          onClick={generateImage}
          disabled={isGenerating}
        >
          {isGenerating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Wand2 className="w-4 h-4" />
          )}
          {isGenerating ? "生成中..." : "生成图像"}
        </Button>
      </div>
      <ModelSelector
        capability="image"
        value={selectedImageModel}
        onChange={setSelectedImageModel}
      />
      <Button
        variant="outline"
        className="gap-2 border-cyan-700 bg-cyan-900/20 hover:bg-cyan-900/40 text-cyan-200"
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading}
      >
        {isUploading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Upload className="w-4 h-4" />
        )}
        {isUploading ? "上传中..." : "上传图片"}
      </Button>
      <Button
        variant="outline"
        className="gap-2 border-amber-700 bg-amber-900/20 hover:bg-amber-900/40 text-amber-200"
        onClick={onShowAssetSelector}
      >
        <Folder className="w-4 h-4" />
        从素材库选择
      </Button>
      <Button
        variant="secondary"
        className={config.analyzeBtnClass}
        onClick={() => analyzeFileInputRef.current?.click()}
        disabled={isAnalyzing || isUploading}
      >
        {isAnalyzing ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <ScanLine className="w-4 h-4" />
        )}
        {isAnalyzing ? "识别中..." : config.analyzeLabel}
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
  );
}
