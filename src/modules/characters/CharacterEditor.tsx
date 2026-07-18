 
import {
  personalitySuggestions,
  styleSuggestions,
  genderSuggestions,
  heightSuggestions,
  buildSuggestions,
  // Task 2A.10: 角色变体容器（替代原 OutfitList）
  VariantListContainer,
} from "@/modules/character";
import { resolveImageUrl } from "@/shared/utils/image-url";
import { SaveStatusIndicator, type SaveStatus } from "@/shared/presentation/SaveStatusIndicator";
import type { Character, ModelSelection } from "@/domain/schemas";
import {
  X,
  Save,
  Trash2,
  Upload,
  User,
  Loader2,
} from "lucide-react";
import { t } from "@/shared/constants/messages";
import { useState, useId } from "react";
import { AiRequestPreview } from "./AiRequestPreview";

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
  referencedBeats: { id: string; title: string; status?: string }[];
  isDirty: boolean;
  saveStatus: SaveStatus;
  saveError: string | null | undefined;
  handleSave: () => void;
  handleDelete: () => void;
}

function EquipmentCard() {
  return (
    <div className="card">
      <div className="section-label">{t("character.equipmentProps")}</div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label className="section-label !text-[11px]">{t("character.weapon")}</label>
          <input className="input" placeholder={t("character.weaponPlaceholder")} disabled />
        </div>
        <div className="flex flex-col gap-1">
          <label className="section-label !text-[11px]">{t("character.items")}</label>
          <input className="input" placeholder={t("character.itemsPlaceholder")} disabled />
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground mt-1.5">
        {t("character.equipmentPropsHint")}
      </p>
    </div>
  );
}

function ReferencedBeatsCard({ beats }: { beats: { id: string; title: string; status?: string }[] }) {
  return (
    <div className="card">
      <div className="section-label">{t("character.referencedShots")}</div>
      {beats.length > 0 ? (
        <div className="flex flex-col gap-1">
          {beats.map((beat) => (
            <div key={beat.id} className="flex justify-between items-center py-1 border-b border-border">
              <span className="text-[13px]">{beat.title}</span>
              {beat.status && <span className="badge badge-success">{beat.status}</span>}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground text-center p-3">
          {t("character.noReferencedShots")}
        </p>
      )}
    </div>
  );
}

interface BasicInfoCardProps {
  character: Character;
  setCurrentCharacter: (update: Character | ((prev: Character) => Character), shouldMarkDirty?: boolean) => void;
}

function BasicInfoCard({ character, setCurrentCharacter }: BasicInfoCardProps) {
  return (
    <div className="card">
      <div className="section-label">{t("character.basicInfo")}</div>
      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col gap-1">
          <label className="section-label !text-[11px]">{t("character.gender")}</label>
          <select
            className="select"
            value={character.gender}
            onChange={(e) => setCurrentCharacter({ ...character, gender: e.target.value }, true)}
          >
            <option value="">{t("character.custom")}</option>
            {genderSuggestions.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="section-label !text-[11px]">{t("character.height")}</label>
          <input
            className="input"
            list="height-suggestions"
            placeholder={t("character.heightPlaceholder")}
            value={character.appearance.height}
            onChange={(e) => setCurrentCharacter({ ...character, appearance: { ...character.appearance, height: e.target.value } }, true)}
          />
          <datalist id="height-suggestions">
            {heightSuggestions.map((h) => <option key={h} value={h} />)}
          </datalist>
        </div>
        <div className="flex flex-col gap-1">
          <label className="section-label !text-[11px]">{t("character.build")}</label>
          <select
            className="select"
            value={character.appearance.build}
            onChange={(e) => setCurrentCharacter({ ...character, appearance: { ...character.appearance, build: e.target.value } }, true)}
          >
            <option value="">-</option>
            {buildSuggestions.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}

function AppearanceCard({ character, setCurrentCharacter }: BasicInfoCardProps) {
  return (
    <div className="card">
      <div className="section-label">{t("character.appearanceDesc")}</div>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <input
          className="input"
          data-testid="character-hair-color-input"
          placeholder={t("character.hairColorPlaceholder")}
          value={character.appearance.hairColor}
          onChange={(e) => setCurrentCharacter({ ...character, appearance: { ...character.appearance, hairColor: e.target.value } }, true)}
        />
        <input
          className="input"
          data-testid="character-hair-style-input"
          placeholder={t("character.hairStylePlaceholder")}
          value={character.appearance.hairStyle}
          onChange={(e) => setCurrentCharacter({ ...character, appearance: { ...character.appearance, hairStyle: e.target.value } }, true)}
        />
      </div>
      <textarea
        className="textarea"
        placeholder={t("character.clothingPlaceholder")}
        rows={3}
        value={character.appearance.clothing}
        onChange={(e) => setCurrentCharacter({ ...character, appearance: { ...character.appearance, clothing: e.target.value } }, true)}
      />
    </div>
  );
}

interface PersonalityStyleCardProps extends BasicInfoCardProps {
  customTrait: string;
  setCustomTrait: (v: string) => void;
  addTrait: (trait: string) => void;
  removeTrait: (trait: string) => void;
}

function PersonalityStyleCard({
  character, setCurrentCharacter, customTrait, setCustomTrait, addTrait, removeTrait,
}: PersonalityStyleCardProps) {
  const [showStyleSuggestions, setShowStyleSuggestions] = useState(false);
  return (
    <div className="card">
      <div className="section-label">{t("character.personalityStyle")}</div>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div className="flex flex-col gap-1">
          <label className="section-label !text-[11px]">{t("character.personality")}</label>
          <div className="flex gap-1">
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
          {character.personality.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {character.personality.map((trait) => (
                <span
                  key={trait}
                  className="badge badge-info cursor-pointer flex items-center gap-0.5"
                  onClick={() => removeTrait(trait)}
                  role="button"
                  tabIndex={0}
                  aria-label={`${t("common.remove")} ${trait}`}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      removeTrait(trait);
                    }
                  }}
                >
                  {trait}
                  <X className="w-2.5 h-2.5" />
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label className="section-label !text-[11px]">{t("character.style")}</label>
          <input
            className="input"
            data-testid="character-style-input"
            placeholder={t("character.stylePlaceholder")}
            value={character.style}
            onChange={(e) => setCurrentCharacter({ ...character, style: e.target.value }, true)}
            onFocus={() => setShowStyleSuggestions(true)}
          />
          {showStyleSuggestions && (
            <div className="flex flex-wrap gap-1 mt-1">
              {styleSuggestions.slice(0, 8).map((style) => (
                <span
                  key={style.value}
                  className="badge cursor-pointer"
                  onClick={() => { setCurrentCharacter({ ...character, style: style.value }, true); setShowStyleSuggestions(false); }}
                  role="button"
                  tabIndex={0}
                  aria-label={t(style.labelKey)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setCurrentCharacter({ ...character, style: style.value }, true);
                      setShowStyleSuggestions(false);
                    }
                  }}
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
        data-testid="character-description-input"
        placeholder={t("character.descriptionPlaceholder")}
        rows={3}
        value={character.description}
        onChange={(e) => setCurrentCharacter({ ...character, description: e.target.value }, true)}
      />
    </div>
  );
}

interface CharacterHeaderProps {
  character: Character;
  avatarUrl: string | undefined;
  isUploading: boolean;
  referencedBeats: { id: string; title: string; status?: string }[];
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onNameChange: (name: string) => void;
  nameError?: string;
}

function CharacterHeader({
  character, avatarUrl, isUploading, referencedBeats, fileInputRef, onFileUpload, onNameChange, nameError,
}: CharacterHeaderProps) {
  const nameErrorId = useId();
  return (
    <div className="card flex items-center gap-3 !p-3">
      <div
        className="element-avatar !w-16 !h-16 !shrink-0 !rounded-md overflow-hidden"
      >
        {avatarUrl ? (
          <img src={resolveImageUrl(avatarUrl)} alt={character.name} className="w-full h-full object-cover" />
        ) : (
          <User size={28} />
        )}
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <input
          className="input !text-base !font-semibold"
          data-testid="character-name-input"
          placeholder={`${t("character.namePlaceholder")} *`}
          value={character.name}
          onChange={(e) => onNameChange(e.target.value)}
          required
          aria-label={`${t("character.name")}（${t("common.requiredAriaLabel")}）`}
          aria-invalid={!!nameError}
          aria-errormessage={nameError ? nameErrorId : undefined}
        />
        {nameError && (
          <p id={nameErrorId} role="alert" className="text-xs text-destructive">{nameError}</p>
        )}
        <div className="flex gap-1.5 flex-wrap">
          {character.gender && (
            <span className="badge badge-info">{character.gender}</span>
          )}
          <span className="badge">{t("character.referencedBy", { count: referencedBeats.length })}</span>
        </div>
      </div>
      <button
        className="btn btn-outline btn-xs gap-1"
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading}
        aria-live="polite"
      >
        {isUploading ? <Loader2 className="animate-spin w-3 h-3" /> : <Upload className="w-3 h-3" />}
        {t("character.changeAvatar")}
      </button>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileUpload} />
    </div>
  );
}

interface CharacterActionFooterProps {
  isDirty: boolean;
  saveStatus: SaveStatus;
  saveError: string | null | undefined;
  canSave: boolean;
  onSave: () => void;
  onDelete: () => void;
}

function CharacterActionFooter({
  isDirty, saveStatus, saveError, canSave, onSave, onDelete,
}: CharacterActionFooterProps) {
  return (
    <div className="sticky bottom-0 left-0 right-0 flex gap-2 items-center py-2.5 mt-2 bg-background border-t border-border z-10">
      <SaveStatusIndicator status={isDirty ? "unsaved" : saveStatus} errorMessage={saveError ?? undefined} />
      <button
        className="btn btn-ghost btn-xs gap-1 !text-destructive"
        onClick={onDelete}
        aria-label={t("character.deleteCharacter")}
      >
        <Trash2 className="w-3 h-3" />
        {t("character.deleteCharacter")}
      </button>
      <button
        className="btn btn-primary btn-sm flex-1 gap-1 justify-center"
        data-testid="character-save-button"
        onClick={onSave}
        disabled={saveStatus === "saving"}
        title={saveStatus !== "saving" && !canSave ? t("hint.saveCharacter") : undefined}
      >
        <Save className="w-3.5 h-3.5" />
        {saveStatus === "saving" ? t("common.saving") : t("character.saveCharacter")}
      </button>
    </div>
  );
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
  referencedBeats,
  isDirty,
  saveStatus,
  saveError,
  handleSave,
  handleDelete,
}: CharacterEditorProps) {
  const avatarUrl = generatedImage || currentCharacter.avatarPath || currentCharacter.generatedImage || currentCharacter.refImagePath;
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateAndSave = () => {
    const newErrors: Record<string, string> = {};
    if (!currentCharacter.name.trim()) {
      newErrors.name = t("validation.characterNameRequired");
    }
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;
    handleSave();
  };

  return (
    <>
      <CharacterHeader
        character={currentCharacter}
        avatarUrl={avatarUrl}
        isUploading={isUploading}
        referencedBeats={referencedBeats}
        fileInputRef={fileInputRef}
        onFileUpload={handleFileUpload}
        onNameChange={(name) => {
          setCurrentCharacter({ ...currentCharacter, name }, true);
          if (errors.name) setErrors((prev) => ({ ...prev, name: "" }));
        }}
        nameError={errors.name}
      />

      {/* 基本信息 card */}
      <BasicInfoCard character={currentCharacter} setCurrentCharacter={setCurrentCharacter} />

      {/* 外观描述 card */}
      <AppearanceCard character={currentCharacter} setCurrentCharacter={setCurrentCharacter} />

      {/* 性格与风格 card */}
      <PersonalityStyleCard
        character={currentCharacter}
        setCurrentCharacter={setCurrentCharacter}
        customTrait={customTrait}
        setCustomTrait={setCustomTrait}
        addTrait={addTrait}
        removeTrait={removeTrait}
      />

      {/* 装备与道具 card (新功能，P2A 占位) */}
      <EquipmentCard />

      {/* Task 2A.10: 角色变体 card（替代原 OutfitList，作为唯一的造型变体系统） */}
      {currentCharacter.id && (
        <VariantListContainer characterId={currentCharacter.id} />
      )}

      {/* 引用此角色的分镜 card */}
      <ReferencedBeatsCard beats={referencedBeats} />

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
      <CharacterActionFooter
        isDirty={isDirty}
        saveStatus={saveStatus}
        saveError={saveError}
        canSave={!!currentCharacter.name.trim()}
        onSave={validateAndSave}
        onDelete={handleDelete}
      />
    </>
  );
}
