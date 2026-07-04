import { useState, useMemo } from "react";
import {
  personalitySuggestions,
  styleSuggestions,
  genderSuggestions,
  heightSuggestions,
  buildSuggestions,
} from "@/modules/character";
import { resolveImageUrl } from "@/shared/utils/image-url";
import { SaveStatusIndicator, type SaveStatus } from "@/shared/presentation/SaveStatusIndicator";
import { ModelSelector } from "@/modules/prompt";
import type { Character, CharacterOutfit, ModelSelection } from "@/domain/schemas";
import {
  Plus,
  X,
  Wand2,
  Loader2,
  Shirt,
  Save,
  Trash2,
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

interface CharacterEditorProps {
  currentCharacter: Character;
  setCurrentCharacter: (update: Character | ((prev: Character) => Character), shouldMarkDirty?: boolean) => void;
  customTrait: string;
  setCustomTrait: (v: string) => void;
  addTrait: (trait: string) => void;
  removeTrait: (trait: string) => void;
  isGenerating: boolean;
  isUploading: boolean;
  isAnalyzing: boolean;
  generatedImage: string | null;
  setGeneratedImage: (v: string | null) => void;
  useDetailedPrompt: boolean;
  setUseDetailedPrompt: (v: boolean) => void;
  selectedImageModel: ModelSelection | null;
  setSelectedImageModel: (v: ModelSelection | null) => void;
  imageSize: string;
  generatePrompt: (char: Character) => string;
  generateImage: () => void;
  saveImageToCharacter: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  analyzeFileInputRef: React.RefObject<HTMLInputElement | null>;
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleAnalyzeFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  setShowAssetSelector: (v: boolean) => void;
  onAddOutfit: () => void;
  onEditOutfit: (outfit: CharacterOutfit) => void;
  onDeleteOutfit: (id: string) => void;
  onSetDefaultOutfit: (id: string) => void;
  onGenerateOutfitImage: (outfit: CharacterOutfit) => void;
  referencedBeats: { id: string; title: string; status?: string }[];
  isDirty: boolean;
  saveStatus: SaveStatus;
  saveError: string | null | undefined;
  handleSave: () => void;
  handleDelete: () => void;
}

export function CharacterEditor({
  currentCharacter,
  setCurrentCharacter,
  customTrait,
  setCustomTrait,
  addTrait,
  removeTrait,
  isGenerating,
  isUploading,
  isAnalyzing,
  generatedImage,
  setGeneratedImage,
  useDetailedPrompt,
  setUseDetailedPrompt,
  selectedImageModel,
  setSelectedImageModel,
  imageSize,
  generatePrompt,
  generateImage,
  saveImageToCharacter,
  fileInputRef,
  analyzeFileInputRef,
  handleFileUpload,
  handleAnalyzeFileUpload,
  setShowAssetSelector,
  onAddOutfit,
  onEditOutfit,
  onDeleteOutfit,
  onSetDefaultOutfit,
  onGenerateOutfitImage,
  referencedBeats,
  isDirty,
  saveStatus,
  saveError,
  handleSave,
  handleDelete,
}: CharacterEditorProps) {
  const [showStyleSuggestions, setShowStyleSuggestions] = useState(false);
  const avatarUrl = generatedImage || currentCharacter.avatarPath || currentCharacter.generatedImage || currentCharacter.refImagePath;

  return (
    <>
      {/* Header: avatar + name + badges + change avatar */}
      <div className="card" style={{ display: "flex", alignItems: "center", gap: 12, padding: 12 }}>
        <div
          className="element-avatar"
          style={{ width: 64, height: 64, flexShrink: 0, borderRadius: 8, overflow: "hidden" }}
        >
          {avatarUrl ? (
            <img src={resolveImageUrl(avatarUrl)} alt={currentCharacter.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <span style={{ fontSize: 28 }}>👤</span>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          <input
            className="input"
            data-testid="character-name-input"
            placeholder={t("character.namePlaceholder")}
            value={currentCharacter.name}
            onChange={(e) => setCurrentCharacter({ ...currentCharacter, name: e.target.value }, true)}
            style={{ fontSize: 16, fontWeight: 600 }}
          />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {currentCharacter.gender && (
              <span className="badge badge-info">{currentCharacter.gender}</span>
            )}
            <span className="badge">{t("character.referencedBy", { count: referencedBeats.length })}</span>
          </div>
        </div>
        <button
          className="btn btn-outline btn-xs"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          style={{ gap: 4 }}
        >
          {isUploading ? <Loader2 className="animate-spin" style={{ width: 12, height: 12 }} /> : <Upload style={{ width: 12, height: 12 }} />}
          {t("character.changeAvatar")}
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
      </div>

      {/* 基本信息 card */}
      <div className="card">
        <div className="section-label">{t("character.basicInfo")}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label className="section-label" style={{ fontSize: 11 }}>{t("character.gender")}</label>
            <select
              className="select"
              value={currentCharacter.gender}
              onChange={(e) => setCurrentCharacter({ ...currentCharacter, gender: e.target.value }, true)}
            >
              <option value="">{t("character.custom")}</option>
              {genderSuggestions.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label className="section-label" style={{ fontSize: 11 }}>{t("character.height")}</label>
            <input
              className="input"
              list="height-suggestions"
              placeholder={t("character.heightPlaceholder")}
              value={currentCharacter.appearance.height}
              onChange={(e) => setCurrentCharacter({ ...currentCharacter, appearance: { ...currentCharacter.appearance, height: e.target.value } }, true)}
            />
            <datalist id="height-suggestions">
              {heightSuggestions.map((h) => <option key={h} value={h} />)}
            </datalist>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label className="section-label" style={{ fontSize: 11 }}>{t("character.build")}</label>
            <select
              className="select"
              value={currentCharacter.appearance.build}
              onChange={(e) => setCurrentCharacter({ ...currentCharacter, appearance: { ...currentCharacter.appearance, build: e.target.value } }, true)}
            >
              <option value="">-</option>
              {buildSuggestions.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* 外观描述 card */}
      <div className="card">
        <div className="section-label">{t("character.appearanceDesc")}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
          <input
            className="input"
            placeholder={t("character.hairColorPlaceholder")}
            value={currentCharacter.appearance.hairColor}
            onChange={(e) => setCurrentCharacter({ ...currentCharacter, appearance: { ...currentCharacter.appearance, hairColor: e.target.value } }, true)}
          />
          <input
            className="input"
            placeholder={t("character.hairStylePlaceholder")}
            value={currentCharacter.appearance.hairStyle}
            onChange={(e) => setCurrentCharacter({ ...currentCharacter, appearance: { ...currentCharacter.appearance, hairStyle: e.target.value } }, true)}
          />
        </div>
        <textarea
          className="textarea"
          placeholder={t("character.clothingPlaceholder")}
          rows={3}
          value={currentCharacter.appearance.clothing}
          onChange={(e) => setCurrentCharacter({ ...currentCharacter, appearance: { ...currentCharacter.appearance, clothing: e.target.value } }, true)}
        />
      </div>

      {/* 性格与风格 card */}
      <div className="card">
        <div className="section-label">{t("character.personalityStyle")}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label className="section-label" style={{ fontSize: 11 }}>{t("character.personality")}</label>
            <div style={{ display: "flex", gap: 4 }}>
              <input
                className="input"
                list="trait-suggestions"
                placeholder={t("character.personalityPlaceholder")}
                value={customTrait}
                onChange={(e) => setCustomTrait(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTrait(customTrait); } }}
              />
              <datalist id="trait-suggestions">
                {personalitySuggestions.map((s) => <option key={s} value={s} />)}
              </datalist>
              <button className="btn btn-outline btn-xs" onClick={() => addTrait(customTrait)}>
                {t("character.add")}
              </button>
            </div>
            {currentCharacter.personality.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                {currentCharacter.personality.map((trait) => (
                  <span key={trait} className="badge badge-info" style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 2 }} onClick={() => removeTrait(trait)}>
                    {trait}
                    <X style={{ width: 10, height: 10 }} />
                  </span>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label className="section-label" style={{ fontSize: 11 }}>{t("character.style")}</label>
            <input
              className="input"
              placeholder={t("character.stylePlaceholder")}
              value={currentCharacter.style}
              onChange={(e) => setCurrentCharacter({ ...currentCharacter, style: e.target.value }, true)}
              onFocus={() => setShowStyleSuggestions(true)}
            />
            {showStyleSuggestions && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                {styleSuggestions.slice(0, 8).map((style) => (
                  <span
                    key={style.value}
                    className="badge"
                    style={{ cursor: "pointer" }}
                    onClick={() => { setCurrentCharacter({ ...currentCharacter, style: style.value }, true); setShowStyleSuggestions(false); }}
                  >
                    {t(style.labelKey)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <textarea
          className="textarea"
          placeholder={t("character.descriptionPlaceholder")}
          rows={3}
          value={currentCharacter.description}
          onChange={(e) => setCurrentCharacter({ ...currentCharacter, description: e.target.value }, true)}
        />
      </div>

      {/* 装备与道具 card (新功能，P2A 占位) */}
      <div className="card">
        <div className="section-label">{t("character.equipmentProps")}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label className="section-label" style={{ fontSize: 11 }}>{t("character.weapon")}</label>
            <input className="input" placeholder={t("character.weaponPlaceholder")} disabled />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label className="section-label" style={{ fontSize: 11 }}>{t("character.items")}</label>
            <input className="input" placeholder={t("character.itemsPlaceholder")} disabled />
          </div>
        </div>
        <p style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 6 }}>
          {t("character.equipmentPropsHint")}
        </p>
      </div>

      {/* 造型变体 card */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div className="section-label">{t("character.outfitBranch")}</div>
          <button className="btn btn-outline btn-xs" onClick={onAddOutfit} style={{ gap: 4 }}>
            <Plus style={{ width: 12, height: 12 }} />
            {t("character.addOutfit")}
          </button>
        </div>
        {currentCharacter.outfits && currentCharacter.outfits.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {currentCharacter.outfits.map((outfit) => (
              <div key={outfit.id} className="element-card" style={{ padding: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontWeight: 500, fontSize: 13 }}>{outfit.name}</span>
                      {outfit.isDefault && <span className="badge badge-success">{t("character.defaultOutfit")}</span>}
                    </div>
                    {outfit.description && (
                      <p style={{ fontSize: 12, color: "var(--muted-fg)", marginTop: 2 }}>{outfit.description}</p>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button className="btn btn-ghost btn-xs" onClick={() => onEditOutfit(outfit)} style={{ gap: 4 }}>
                      {t("character.edit")}
                    </button>
                    <button className="btn btn-ghost btn-xs" onClick={() => onDeleteOutfit(outfit.id)} aria-label={t("character.deleteOutfitLabel")} style={{ gap: 4 }}>
                      <Trash2 style={{ width: 12, height: 12 }} />
                    </button>
                  </div>
                </div>
                {outfit.imageUrl && (
                  <div style={{ width: 80, height: 80, borderRadius: 6, overflow: "hidden", marginTop: 6, border: "1px solid var(--border)" }}>
                    <img src={resolveImageUrl(outfit.imageUrl)} alt={outfit.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </div>
                )}
                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                  <button className="btn btn-primary btn-xs" onClick={() => onGenerateOutfitImage(outfit)} disabled={isGenerating} style={{ flex: 1, gap: 4 }}>
                    {isGenerating ? <Loader2 className="animate-spin" style={{ width: 12, height: 12 }} /> : <Wand2 style={{ width: 12, height: 12 }} />}
                    {t("character.generateImage")}
                  </button>
                  {!outfit.isDefault && (
                    <button className="btn btn-outline btn-xs" onClick={() => onSetDefaultOutfit(outfit.id)}>
                      {t("character.setDefault")}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: 24, color: "var(--muted-fg)" }}>
            <Shirt style={{ width: 32, height: 32, margin: "0 auto 8px", opacity: 0.5 }} />
            <p style={{ fontSize: 13 }}>{t("character.noOutfits")}</p>
            <p style={{ fontSize: 12 }}>{t("character.noOutfitsHint")}</p>
          </div>
        )}
      </div>

      {/* 引用此角色的分镜 card */}
      <div className="card">
        <div className="section-label">{t("character.referencedShots")}</div>
        {referencedBeats.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {referencedBeats.map((beat) => (
              <div key={beat.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
                <span style={{ fontSize: 13 }}>{beat.title}</span>
                {beat.status && <span className="badge badge-success">{beat.status}</span>}
              </div>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: 12, color: "var(--muted-fg)", textAlign: "center", padding: 12 }}>
            {t("character.noReferencedShots")}
          </p>
        )}
      </div>

      {/* AI 请求预览区（展示最终发送给大模型的完整内容） */}
      <AiRequestPreview
        currentCharacter={currentCharacter}
        generatedImage={generatedImage}
        useDetailedPrompt={useDetailedPrompt}
        setUseDetailedPrompt={setUseDetailedPrompt}
        selectedImageModel={selectedImageModel}
        setSelectedImageModel={setSelectedImageModel}
        imageSize={imageSize}
        isGenerating={isGenerating}
        isUploading={isUploading}
        isAnalyzing={isAnalyzing}
        generatePrompt={generatePrompt}
        generateImage={generateImage}
        saveImageToCharacter={saveImageToCharacter}
        fileInputRef={fileInputRef}
        analyzeFileInputRef={analyzeFileInputRef}
        handleFileUpload={handleFileUpload}
        handleAnalyzeFileUpload={handleAnalyzeFileUpload}
        setShowAssetSelector={setShowAssetSelector}
        setGeneratedImage={setGeneratedImage}
        referencedBeats={referencedBeats}
      />

      {/* 底部吸底操作栏 */}
      <div
        style={{
          position: "sticky",
          bottom: 0,
          left: 0,
          right: 0,
          display: "flex",
          gap: 8,
          alignItems: "center",
          padding: "10px 0",
          marginTop: 8,
          background: "var(--bg)",
          borderTop: "1px solid var(--border)",
          zIndex: 10,
        }}
      >
        <SaveStatusIndicator status={isDirty ? "unsaved" : saveStatus} errorMessage={saveError ?? undefined} />
        <button
          className="btn btn-ghost btn-xs"
          onClick={handleDelete}
          aria-label={t("character.deleteCharacter")}
          style={{ gap: 4, color: "var(--destructive)" }}
        >
          <Trash2 style={{ width: 12, height: 12 }} />
          {t("character.deleteCharacter")}
        </button>
        <button
          className="btn btn-primary btn-sm"
          data-testid="character-save-button"
          onClick={handleSave}
          disabled={saveStatus === "saving" || !currentCharacter.name.trim()}
          style={{ flex: 1, gap: 4, justifyContent: "center" }}
        >
          <Save style={{ width: 14, height: 14 }} />
          {saveStatus === "saving" ? t("common.saving") : t("character.saveCharacter")}
        </button>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AI 请求预览组件
// 展示最终发送给大模型的完整请求内容：
//   1. Prompt 文本（基础或 AI 优化后）
//   2. 模型配置（provider、modelId、图片尺寸）
//   3. 参考图片列表（avatar / generated / ref / outfits — 这些可能作为后续视频生成的参考资源）
//   4. 关联分镜引用（此角色被引用在哪些分镜中，对应视频生成请求会包含此角色图）
//   5. 可折叠的完整请求 JSON（便于调试）
//   6. 操作按钮区（生成、保存、上传、从库选、识别）
// ─────────────────────────────────────────────────────────────────────────────
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

function AiRequestPreview({
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
  const [showFullRequest, setShowFullRequest] = useState(false);

  // 收集当前角色的所有可用图片（这些会作为后续视频/分镜生成的参考资源）
  const referenceImages = useMemo(() => {
    const imgs: { url: string; label: string }[] = [];
    if (generatedImage) imgs.push({ url: generatedImage, label: "生成图" });
    if (currentCharacter.avatarPath) imgs.push({ url: currentCharacter.avatarPath, label: "头像" });
    if (currentCharacter.generatedImage) imgs.push({ url: currentCharacter.generatedImage, label: "已生成图" });
    if (currentCharacter.refImagePath) imgs.push({ url: currentCharacter.refImagePath, label: "参考图" });
    (currentCharacter.outfits || []).forEach((outfit, idx) => {
      const outfitImg = outfit.imageUrl || outfit.localImagePath || outfit.thumbnailPath;
      if (outfitImg) {
        imgs.push({
          url: outfitImg,
          label: outfit.name || `造型 ${idx + 1}`,
        });
      }
    });
    return imgs;
  }, [currentCharacter, generatedImage]);

  // 构造完整请求对象（用于 JSON 预览）
  const fullRequest = useMemo(() => {
    return {
      type: "image-generation",
      subtype: "character",
      prompt: generatePrompt(currentCharacter),
      model: selectedImageModel
        ? { providerId: selectedImageModel.providerId, modelId: selectedImageModel.modelId }
        : null,
      options: {
        size: imageSize,
        detailedPrompt: useDetailedPrompt,
      },
      character: {
        id: currentCharacter.id || "(unsaved)",
        name: currentCharacter.name || "(unnamed)",
        style: currentCharacter.style || null,
      },
      referenceImages: referenceImages.map((img) => img.url),
      referencedByBeats: referencedBeats.map((b) => ({ id: b.id, title: b.title, status: b.status })),
    };
  }, [currentCharacter, selectedImageModel, imageSize, useDetailedPrompt, referenceImages, referencedBeats, generatePrompt]);

  return (
    <div className="card">
      {/* 标题行 */}
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

      {/* 1. Prompt 文本预览 */}
      <div className="card2" style={{ padding: 10, fontSize: 12, lineHeight: 1.7, marginBottom: 10, maxHeight: 120, overflowY: "auto" }}>
        {generatePrompt(currentCharacter)}
      </div>

      {/* 2. 模型配置 */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: "var(--muted-fg)", marginBottom: 4 }}>{t("character.modelConfig")}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <ModelSelector capability="image" value={selectedImageModel} onChange={setSelectedImageModel} />
          <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>
            {t("character.imageSize")}: <code style={{ fontSize: 11 }}>{imageSize}</code>
          </span>
        </div>
      </div>

      {/* 3. 参考图片列表 */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
          <ImageIcon style={{ width: 12, height: 12, color: "var(--muted-fg)" }} />
          <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>
            {t("character.referenceImages")} ({referenceImages.length})
          </span>
        </div>
        {referenceImages.length > 0 ? (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {referenceImages.map((img, idx) => (
              <div
                key={`${img.url}-${idx}`}
                style={{ position: "relative", width: 56, height: 56, borderRadius: 6, overflow: "hidden", border: "1px solid var(--border)" }}
                title={img.label}
              >
                <img
                  src={resolveImageUrl(img.url)}
                  alt={img.label}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
                <span
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    fontSize: 9,
                    color: "white",
                    background: "rgba(0,0,0,0.6)",
                    padding: "1px 4px",
                    textAlign: "center",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {img.label}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 11, color: "var(--muted-fg)", fontStyle: "italic" }}>
            {t("character.noReferenceImages")}
          </div>
        )}
      </div>

      {/* 4. 关联分镜引用（视频生成请求会包含此角色作为参考） */}
      {referencedBeats.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <Link2 style={{ width: 12, height: 12, color: "var(--muted-fg)" }} />
            <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>
              {t("character.relatedContent")} ({referencedBeats.length})
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {referencedBeats.map((beat) => (
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
      )}

      {/* 5. 操作按钮区 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
        {/* 主操作：生成图片 */}
        <button className="btn btn-primary btn-sm" onClick={generateImage} disabled={isGenerating} style={{ width: "100%", justifyContent: "center", gap: 4 }}>
          {isGenerating ? <Loader2 className="animate-spin" style={{ width: 14, height: 14 }} /> : <Wand2 style={{ width: 14, height: 14 }} />}
          {isGenerating ? t("common.generating") : t("character.generateImage")}
        </button>
        {/* 次要操作：上传 / 库选 / 识别 / 保存 / 清除 */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <button className="btn btn-outline btn-xs" onClick={saveImageToCharacter} disabled={!currentCharacter.id} style={{ gap: 4 }}>
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

      {/* 6. 完整请求 JSON（可折叠） */}
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
          <pre
            style={{
              marginTop: 6,
              padding: 8,
              background: "var(--hover-bg, rgba(0,0,0,0.03))",
              borderRadius: 4,
              fontSize: 10,
              lineHeight: 1.5,
              overflowX: "auto",
              maxHeight: 200,
              overflowY: "auto",
            }}
          >
            {JSON.stringify(fullRequest, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
