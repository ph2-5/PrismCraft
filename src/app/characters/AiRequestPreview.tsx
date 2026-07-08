import { useState, useMemo } from "react";
import { ModelSelector } from "@/modules/prompt";
import { resolveImageUrl } from "@/shared/utils/image-url";
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
    return <div style={{ fontSize: 11, color: "var(--muted-fg)", fontStyle: "italic" }}>{t("character.noReferenceImages")}</div>;
  }
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {images.map((img, idx) => (
        <div
          key={`${img.url}-${idx}`}
          style={{ position: "relative", width: 56, height: 56, borderRadius: 6, overflow: "hidden", border: "1px solid var(--border)" }}
          title={img.label}
        >
          <img src={resolveImageUrl(img.url)} alt={img.label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <span style={{
            position: "absolute", bottom: 0, left: 0, right: 0,
            fontSize: 9, color: "white", background: "rgba(0,0,0,0.6)",
            padding: "1px 4px", textAlign: "center", whiteSpace: "nowrap",
            overflow: "hidden", textOverflow: "ellipsis",
          }}>
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
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <Link2 style={{ width: 12, height: 12, color: "var(--muted-fg)" }} />
        <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>{t("character.relatedContent")} ({beats.length})</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {beats.map((beat) => (
          <div
            key={beat.id}
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, padding: "3px 6px", background: "var(--hover-bg, rgba(0,0,0,0.03))", borderRadius: 4 }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <Film style={{ width: 10, height: 10, color: "var(--muted-fg)" }} />
              {beat.title}
            </span>
            {beat.status && <span className="badge badge-success" style={{ fontSize: 9 }}>{beat.status}</span>}
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
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
      <button className="btn btn-primary btn-sm" onClick={generateImage} disabled={isGenerating} style={{ width: "100%", justifyContent: "center", gap: 4 }}>
        {isGenerating ? <Loader2 className="animate-spin" style={{ width: 14, height: 14 }} /> : <Wand2 style={{ width: 14, height: 14 }} />}
        {isGenerating ? t("common.generating") : t("character.generateImage")}
      </button>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        <button className="btn btn-outline btn-xs" onClick={saveImageToCharacter} disabled={!currentCharacter.id} style={{ gap: 4 }} title={!currentCharacter.id ? t("hint.saveToCharacter") : undefined}>
          <Save style={{ width: 12, height: 12 }} />
          {t("character.saveToCharacter")}
        </button>
        <button className="btn btn-outline btn-xs" onClick={() => fileInputRef.current?.click()} disabled={isUploading} style={{ gap: 4 }}>
          {isUploading ? <Loader2 className="animate-spin" style={{ width: 12, height: 12 }} /> : <Upload style={{ width: 12, height: 12 }} />}
          {isUploading ? t("common.uploading") : t("character.uploadImage")}
        </button>
        <button className="btn btn-outline btn-xs" onClick={() => setShowAssetSelector(true)} style={{ gap: 4 }}>
          <Folder style={{ width: 12, height: 12 }} />
          {t("character.selectFromLibrary")}
        </button>
        <button className="btn btn-outline btn-xs" onClick={() => analyzeFileInputRef.current?.click()} disabled={isAnalyzing || isUploading} style={{ gap: 4 }}>
          {isAnalyzing ? <Loader2 className="animate-spin" style={{ width: 12, height: 12 }} /> : <ScanLine style={{ width: 12, height: 12 }} />}
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
    <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8 }}>
      <button
        className="btn btn-ghost btn-xs"
        onClick={() => setShowFullRequest(!showFullRequest)}
        style={{ gap: 4, fontSize: 11 }}
      >
        {showFullRequest ? <ChevronDown style={{ width: 12, height: 12 }} /> : <ChevronRight style={{ width: 12, height: 12 }} />}
        {showFullRequest ? t("character.hideFullRequest") : t("character.showFullRequest")}
      </button>
      {showFullRequest && (
        <pre style={{
          marginTop: 6, padding: 8,
          background: "var(--hover-bg, rgba(0,0,0,0.03))", borderRadius: 4,
          fontSize: 10, lineHeight: 1.5, overflowX: "auto", maxHeight: 200, overflowY: "auto",
        }}>
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div>
          <div className="section-label">{t("character.requestPreview")}</div>
          <div style={{ fontSize: 10, color: "var(--muted-fg)", marginTop: 2 }}>{t("character.requestPreviewHint")}</div>
        </div>
        <button
          className={`btn ${useDetailedPrompt ? "btn-primary" : "btn-outline"} btn-xs`}
          onClick={() => setUseDetailedPrompt(!useDetailedPrompt)}
          style={{ gap: 4 }}
        >
          <Sparkles style={{ width: 12, height: 12 }} />
          {useDetailedPrompt ? t("character.aiOptimized") : t("character.aiOptimize")}
        </button>
      </div>

      <div className="card2" style={{ padding: 10, fontSize: 12, lineHeight: 1.7, marginBottom: 10, maxHeight: 120, overflowY: "auto" }}>
        {generatePrompt(currentCharacter)}
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: "var(--muted-fg)", marginBottom: 4 }}>{t("character.modelConfig")}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <ModelSelector capability="image" value={selectedImageModel} onChange={setSelectedImageModel} />
          <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>
            {t("character.imageSize")}: <code style={{ fontSize: 11 }}>{imageSize}</code>
          </span>
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
          <ImageIcon style={{ width: 12, height: 12, color: "var(--muted-fg)" }} />
          <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>{t("character.referenceImages")} ({referenceImages.length})</span>
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
