import { useState, useMemo } from "react";
import { ModelSelector } from "@/modules/prompt";
import { resolveImageUrl } from "@/shared/utils/image-url";
import { useGenerationStage } from "@/shared/presentation/use-generation-stage";
import type { Character, ModelSelection } from "@/domain/schemas";
import {
  Wand2,
  Loader2,
  Save,
  Upload,
  ScanLine,
  Sparkles,
  Folder,
  ChevronDown,
  ChevronRight,
  Image as ImageIcon,
  Film,
  Link2,
} from "lucide-react";
import { t } from "@/shared/constants/messages";

interface AiRequestPreviewProps {
  currentCharacter: Character;
  generatedImage: string | null;
  useDetailedPrompt: boolean;
  setUseDetailedPrompt: (v: boolean) => void;
  selectedImageModel: ModelSelection | null;
  setSelectedImageModel: (v: ModelSelection | null) => void;
  imageSize: string;
  isGenerating: boolean;
  isUploading: boolean;
  isAnalyzing: boolean;
  generatePrompt: (char: Character) => string;
  generateImage: () => void;
  saveImageToCharacter: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  analyzeFileInputRef: React.RefObject<HTMLInputElement | null>;
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleAnalyzeFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  setShowAssetSelector: (v: boolean) => void;
  setGeneratedImage: (v: string | null) => void;
  referencedBeats: { id: string; title: string; status?: string }[];
}

function useReferenceImages(character: Character, generatedImage: string | null) {
  return useMemo(() => {
    const imgs: { url: string; label: string }[] = [];
    if (generatedImage) imgs.push({ url: generatedImage, label: t("character.refImageGenerated") });
    if (character.avatarPath) imgs.push({ url: character.avatarPath, label: t("character.avatar") });
    if (character.generatedImage) imgs.push({ url: character.generatedImage, label: t("character.refImageGeneratedExisting") });
    if (character.refImagePath) imgs.push({ url: character.refImagePath, label: t("character.refImage") });
    (character.outfits || []).forEach((outfit, idx) => {
      const outfitImg = outfit.imageUrl || outfit.localImagePath || outfit.thumbnailPath;
      if (outfitImg) {
        imgs.push({ url: outfitImg, label: outfit.name || t("character.outfitLabel", { index: idx + 1 }) });
      }
    });
    return imgs;
  }, [character, generatedImage]);
}

function useFullRequest(
  character: Character,
  selectedImageModel: ModelSelection | null,
  imageSize: string,
  useDetailedPrompt: boolean,
  referenceImages: { url: string; label: string }[],
  referencedBeats: { id: string; title: string; status?: string }[],
  generatePrompt: (char: Character) => string,
) {
  return useMemo(() => {
    return {
      type: "image-generation",
      subtype: "character",
      prompt: generatePrompt(character),
      model: selectedImageModel
        ? { providerId: selectedImageModel.providerId, modelId: selectedImageModel.modelId }
        : null,
      options: { size: imageSize, detailedPrompt: useDetailedPrompt },
      character: {
        id: character.id || "(unsaved)",
        name: character.name || "(unnamed)",
        style: character.style || null,
      },
      referenceImages: referenceImages.map((img) => img.url),
      referencedByBeats: referencedBeats.map((b) => ({ id: b.id, title: b.title, status: b.status })),
    };
  }, [character, selectedImageModel, imageSize, useDetailedPrompt, referenceImages, referencedBeats, generatePrompt]);
}

function ReferenceImageList({ images }: { images: { url: string; label: string }[] }) {
  if (images.length === 0) {
    return <div className="text-[11px] text-muted-foreground italic">{t("character.noReferenceImages")}</div>;
  }
  return (
    <div className="flex gap-1.5 flex-wrap">
      {images.map((img, idx) => (
        <div
          key={`${img.url}-${idx}`}
          className="relative w-14 h-14 rounded-md overflow-hidden border border-border"
          title={img.label}
        >
          <img src={resolveImageUrl(img.url)} alt={img.label} className="w-full h-full object-cover" />
          <span className="absolute bottom-0 left-0 right-0 text-[9px] text-white bg-black/60 px-1 py-px text-center whitespace-nowrap overflow-hidden text-ellipsis">
            {img.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function ReferencedBeatsList({ beats }: { beats: { id: string; title: string; status?: string }[] }) {
  if (beats.length === 0) return null;
  return (
    <div className="mb-2.5">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Link2 className="w-3 h-3 text-muted-foreground" />
        <span className="text-[11px] text-muted-foreground">{t("character.relatedContent")} ({beats.length})</span>
      </div>
      <div className="flex flex-col gap-[3px]">
        {beats.map((beat) => (
          <div
            key={beat.id}
            className="flex justify-between items-center text-[11px] py-[3px] px-1.5 bg-[var(--hover-bg,rgba(0,0,0,0.03))] rounded"
          >
            <span className="flex items-center gap-1">
              <Film className="w-2.5 h-2.5 text-muted-foreground" />
              {beat.title}
            </span>
            {beat.status && <span className="badge badge-success !text-[9px]">{beat.status}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function ActionButtons({
  isGenerating, isUploading, isAnalyzing, currentCharacter,
  generateImage, saveImageToCharacter, fileInputRef, analyzeFileInputRef,
  handleFileUpload, handleAnalyzeFileUpload, setShowAssetSelector,
  generatedImage, setGeneratedImage,
}: {
  isGenerating: boolean;
  isUploading: boolean;
  isAnalyzing: boolean;
  currentCharacter: Character;
  generateImage: () => void;
  saveImageToCharacter: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  analyzeFileInputRef: React.RefObject<HTMLInputElement | null>;
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleAnalyzeFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  setShowAssetSelector: (v: boolean) => void;
  generatedImage: string | null;
  setGeneratedImage: (v: string | null) => void;
}) {
  const { stageLabel } = useGenerationStage(isGenerating, {
    initialKey: "generate.stage.imageInitial",
  });

  return (
    <div className="flex flex-col gap-1.5 mb-2">
      <button className="btn btn-primary btn-sm w-full justify-center gap-1" onClick={generateImage} disabled={isGenerating} aria-live="polite">
        {isGenerating ? <Loader2 className="animate-spin w-3.5 h-3.5" /> : <Wand2 className="w-3.5 h-3.5" />}
        {isGenerating ? t("common.generating") : t("character.generateImage")}
      </button>
      {isGenerating && (
        <div role="status" aria-live="polite" className="text-xs text-muted-foreground text-center -mt-0.5">
          {stageLabel}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        <button className="btn btn-outline btn-xs gap-1" onClick={saveImageToCharacter} disabled={!currentCharacter.id} title={!currentCharacter.id ? t("hint.saveToCharacter") : undefined}>
          <Save className="w-3 h-3" />
          {t("character.saveToCharacter")}
        </button>
        <button className="btn btn-outline btn-xs gap-1" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
          {isUploading ? <Loader2 className="animate-spin w-3 h-3" /> : <Upload className="w-3 h-3" />}
          {isUploading ? t("common.uploading") : t("character.uploadImage")}
        </button>
        <button className="btn btn-outline btn-xs gap-1" onClick={() => setShowAssetSelector(true)}>
          <Folder className="w-3 h-3" />
          {t("character.selectFromLibrary")}
        </button>
        <button className="btn btn-outline btn-xs gap-1" onClick={() => analyzeFileInputRef.current?.click()} disabled={isAnalyzing || isUploading}>
          {isAnalyzing ? <Loader2 className="animate-spin w-3 h-3" /> : <ScanLine className="w-3 h-3" />}
          {isAnalyzing ? t("common.analyzing") : t("character.recognizePerson")}
        </button>
        {generatedImage && (
          <button className="btn btn-ghost btn-xs" onClick={() => setGeneratedImage(null)}>
            {t("character.clear")}
          </button>
        )}
      </div>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
      <input ref={analyzeFileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAnalyzeFileUpload} />
    </div>
  );
}

function FullRequestJson({ request }: { request: unknown }) {
  const [showFullRequest, setShowFullRequest] = useState(false);
  return (
    <div className="border-t border-border pt-2">
      <button
        className="btn btn-ghost btn-xs gap-1"
        onClick={() => setShowFullRequest(!showFullRequest)}
      >
        {showFullRequest ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        {showFullRequest ? t("character.hideFullRequest") : t("character.showFullRequest")}
      </button>
      {showFullRequest && (
        <pre className="mt-1.5 p-2 bg-[var(--hover-bg,rgba(0,0,0,0.03))] rounded text-[10px] leading-[1.5] overflow-auto max-h-[200px]">
          {JSON.stringify(request, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function AiRequestPreview({
  currentCharacter,
  generatedImage,
  useDetailedPrompt,
  setUseDetailedPrompt,
  selectedImageModel,
  setSelectedImageModel,
  imageSize,
  isGenerating,
  isUploading,
  isAnalyzing,
  generatePrompt,
  generateImage,
  saveImageToCharacter,
  fileInputRef,
  analyzeFileInputRef,
  handleFileUpload,
  handleAnalyzeFileUpload,
  setShowAssetSelector,
  setGeneratedImage,
  referencedBeats,
}: AiRequestPreviewProps) {
  const referenceImages = useReferenceImages(currentCharacter, generatedImage);
  const fullRequest = useFullRequest(
    currentCharacter, selectedImageModel, imageSize, useDetailedPrompt,
    referenceImages, referencedBeats, generatePrompt,
  );

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="section-label">{t("character.requestPreview")}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">{t("character.requestPreviewHint")}</div>
        </div>
        <button
          className={`btn ${useDetailedPrompt ? "btn-primary" : "btn-outline"} btn-xs gap-1`}
          onClick={() => setUseDetailedPrompt(!useDetailedPrompt)}
        >
          <Sparkles className="w-3 h-3" />
          {useDetailedPrompt ? t("character.aiOptimized") : t("character.aiOptimize")}
        </button>
      </div>

      <div className="card2 p-2.5 text-xs leading-[1.7] mb-2.5 max-h-[120px] overflow-y-auto">
        {generatePrompt(currentCharacter)}
      </div>

      <div className="mb-2.5">
        <div className="text-[11px] text-muted-foreground mb-1">{t("character.modelConfig")}</div>
        <div className="flex items-center gap-2 flex-wrap">
          <ModelSelector capability="image" value={selectedImageModel} onChange={setSelectedImageModel} />
          <span className="text-[11px] text-muted-foreground">
            {t("character.imageSize")}: <code className="text-[11px]">{imageSize}</code>
          </span>
        </div>
      </div>

      <div className="mb-2.5">
        <div className="flex items-center gap-1.5 mb-1.5">
          <ImageIcon className="w-3 h-3 text-muted-foreground" />
          <span className="text-[11px] text-muted-foreground">{t("character.referenceImages")} ({referenceImages.length})</span>
        </div>
        <ReferenceImageList images={referenceImages} />
      </div>

      <ReferencedBeatsList beats={referencedBeats} />

      <ActionButtons
        isGenerating={isGenerating}
        isUploading={isUploading}
        isAnalyzing={isAnalyzing}
        currentCharacter={currentCharacter}
        generateImage={generateImage}
        saveImageToCharacter={saveImageToCharacter}
        fileInputRef={fileInputRef}
        analyzeFileInputRef={analyzeFileInputRef}
        handleFileUpload={handleFileUpload}
        handleAnalyzeFileUpload={handleAnalyzeFileUpload}
        setShowAssetSelector={setShowAssetSelector}
        generatedImage={generatedImage}
        setGeneratedImage={setGeneratedImage}
      />

      <FullRequestJson request={fullRequest} />
    </div>
  );
}
