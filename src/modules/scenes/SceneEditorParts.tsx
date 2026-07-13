/* eslint-disable max-lines -- 场景编辑器子组件集合，已合理拆分至独立函数 */
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
  Trash2,
  Building2,
  RefreshCw,
  BookOpen,
  Film,
  Check,
} from "lucide-react";
import { ModelSelector } from "@/modules/prompt";
import { SaveStatusIndicator, type SaveStatus } from "@/shared/presentation/SaveStatusIndicator";
import { t } from "@/shared/constants/messages";
import {
  typeSuggestions,
  timeSuggestions,
  weatherSuggestions,
} from "@/modules/scene";
import type { ModelSelection, Scene } from "@/domain/schemas";

type SetCurrentScene = (
  update: Scene | ((prev: Scene) => Scene),
  shouldMarkDirty?: boolean,
) => void;

export interface ReferencedBeat {
  storyId: string;
  storyTitle: string;
  sequence: number;
  title?: string;
  description: string;
  imageUrl?: string;
  generationStatus?: string;
}

interface ScenePageHeaderProps {
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  onNewScene: () => void;
}

export function ScenePageHeader({
  searchQuery,
  setSearchQuery,
  onNewScene,
}: ScenePageHeaderProps) {
  return (
    <div className="top-tabs justify-between">
      <span className="font-semibold text-sm"><Building2 className="inline-block" size={14} /> {t("scene.title")}</span>
      <div className="toolbar">
        <input
          className="input !text-xs !py-1.5 !px-2.5 w-[180px]"
          placeholder={t("scene.searchPlaceholder")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={onNewScene}
        >
          + {t("scene.createNewScene")}
        </button>
      </div>
    </div>
  );
}

interface SceneDetailHeaderProps {
  scene: Scene;
  avatarImage: string | undefined;
  referencedBeats: ReferencedBeat[];
  setCurrentScene: SetCurrentScene;
  onChangeCover: () => void;
}

export function SceneDetailHeader({
  scene,
  avatarImage,
  referencedBeats,
  setCurrentScene,
  onChangeCover,
}: SceneDetailHeaderProps) {
  return (
    <div className="flex items-center gap-3.5">
      <div
        className="element-avatar scene !w-16 !h-16 !text-[28px] !rounded-[14px] bg-cover bg-center"
        style={avatarImage ? { backgroundImage: `url(${avatarImage})` } : undefined}
      >
        {!avatarImage && ""}
      </div>
      <div className="flex-1 min-w-0">
        <input
          className="input !text-base !font-bold !py-1.5 !px-2.5"
          data-testid="scene-name-input"
          value={scene.name}
          placeholder={t("scene.namePlaceholder")}
          onChange={(e) =>
            setCurrentScene((prev) => ({ ...prev, name: e.target.value }), true)
          }
        />
        <div className="flex gap-1.5 mt-1">
          <span className="badge badge-info">
            {scene.type || t("scene.label")}
          </span>
          <span className="badge !text-[9px]">
            {t("scene.referencedBy", { count: referencedBeats.length })}
          </span>
        </div>
      </div>
      <button
        type="button"
        className="btn btn-outline btn-xs"
        onClick={onChangeCover}
      >
        <RefreshCw className="inline-block" size={12} /> {t("scene.changeCover")}
      </button>
    </div>
  );
}

interface SceneBasicInfoCardProps {
  scene: Scene;
  setCurrentScene: SetCurrentScene;
}

export function SceneBasicInfoCard({
  scene,
  setCurrentScene,
}: SceneBasicInfoCardProps) {
  return (
    <div className="card !p-3.5">
      <div className="section-label mb-2.5">
        {t("scene.basicInfo")}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-[10px] text-muted-foreground">
            {t("scene.timeLabel")}
          </label>
          <select
            className="select !text-xs w-full"
            data-testid="scene-time-of-day-input"
            value={scene.timeOfDay}
            onChange={(e) =>
              setCurrentScene(
                (prev) => ({ ...prev, timeOfDay: e.target.value }),
                true,
              )
            }
          >
            <option value="">{t("scene.timeOfDayPlaceholder")}</option>
            {timeSuggestions.map((s) => (
              <option key={s.value} value={s.value}>
                {t(s.labelKey)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground">
            {t("scene.weatherLabel")}
          </label>
          <select
            className="select !text-xs w-full"
            data-testid="scene-weather-input"
            value={scene.weather}
            onChange={(e) =>
              setCurrentScene(
                (prev) => ({ ...prev, weather: e.target.value }),
                true,
              )
            }
          >
            <option value="">{t("scene.weatherPlaceholder")}</option>
            {weatherSuggestions.map((w) => (
              <option key={w.value} value={w.value}>
                {t(w.labelKey)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground">
            {t("scene.sceneType")}
          </label>
          <select
            className="select !text-xs w-full"
            data-testid="scene-type-input"
            value={scene.type}
            onChange={(e) =>
              setCurrentScene(
                (prev) => ({ ...prev, type: e.target.value }),
                true,
              )
            }
          >
            <option value="">{t("scene.typePlaceholder")}</option>
            {typeSuggestions.map((s) => (
              <option key={s.value} value={s.value}>
                {t(s.labelKey)}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

export function SceneAtmosphereCard({
  scene,
  setCurrentScene,
}: SceneBasicInfoCardProps) {
  return (
    <div className="card !p-3.5">
      <div className="section-label mb-2">
        {t("scene.atmosphereDesc")}
      </div>
      <textarea
        className="textarea !text-xs"
        data-testid="scene-description-input"
        rows={3}
        value={scene.description}
        placeholder={t("scene.descriptionPlaceholder")}
        onChange={(e) =>
          setCurrentScene(
            (prev) => ({ ...prev, description: e.target.value }),
            true,
          )
        }
      />
    </div>
  );
}

export function SceneSpaceCard({
  scene,
  setCurrentScene,
}: SceneBasicInfoCardProps) {
  return (
    <div className="card !p-3.5">
      <div className="section-label mb-2">
        {t("scene.spaceDesc")}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-muted-foreground">
            {t("scene.lighting")}
          </label>
          <input
            className="input !text-xs !p-1.5"
            value={scene.lighting}
            placeholder={t("scene.lightingPlaceholder")}
            onChange={(e) =>
              setCurrentScene(
                (prev) => ({ ...prev, lighting: e.target.value }),
                true,
              )
            }
          />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground">
            {t("scene.colorTone")}
          </label>
          <input
            className="input !text-xs !p-1.5"
            value={scene.mood}
            placeholder={t("scene.colorTonePlaceholder")}
            onChange={(e) =>
              setCurrentScene(
                (prev) => ({ ...prev, mood: e.target.value }),
                true,
              )
            }
          />
        </div>
      </div>
    </div>
  );
}

interface SceneElementsCardProps {
  scene: Scene;
  customElement: string;
  setCustomElement: (v: string) => void;
  showElementInput: boolean;
  setShowElementInput: (v: boolean) => void;
  onAddItem: (field: "elements", value: string) => void;
  onRemoveItem: (field: "elements", value: string) => void;
}

export function SceneElementsCard({
  scene,
  customElement,
  setCustomElement,
  showElementInput,
  setShowElementInput,
  onAddItem,
  onRemoveItem,
}: SceneElementsCardProps) {
  return (
    <div className="card !p-3.5">
      <div className="section-label mb-2">
        {t("scene.elements")}
      </div>
      <div className="flex flex-wrap gap-1">
        {scene.elements.map((element) => (
          <span
            key={element}
            className="badge"
          >
            {element}
            <button
              type="button"
              aria-label={t("common.delete")}
              onClick={() => onRemoveItem("elements", element)}
              className="bg-transparent border-none cursor-pointer p-0 text-[11px] leading-none text-muted-foreground hover:text-destructive"
            >
              <X size={10} />
            </button>
          </span>
        ))}
        {showElementInput ? (
          <input
            className="input !text-[10px] w-[120px] !py-0.5 !px-1.5"
            value={customElement}
            autoFocus
            onChange={(e) => setCustomElement(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onAddItem("elements", customElement);
                setShowElementInput(false);
              } else if (e.key === "Escape") {
                setShowElementInput(false);
              }
            }}
            onBlur={() => setShowElementInput(false)}
            placeholder={t("scene.addElementPlaceholder")}
          />
        ) : (
          <span
            className="badge badge-info cursor-pointer"
            onClick={() => setShowElementInput(true)}
            role="button"
            tabIndex={0}
            aria-label={t("scene.addElement")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setShowElementInput(true);
              }
            }}
          >
            {t("scene.addElement")}
          </span>
        )}
      </div>
    </div>
  );
}

export function SceneReferencedBeatsCard({
  beats,
}: {
  beats: ReferencedBeat[];
}) {
  return (
    <div className="card !p-3.5">
      <div className="section-label mb-2">
        <BookOpen className="inline-block" size={14} /> {t("scene.referencedShots")}
      </div>
      {beats.length === 0 ? (
        <div className="text-xs text-muted-foreground">
          {t("scene.noReferences")}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {beats.map((beat) => {
            const isCompleted =
              beat.generationStatus === "completed" || Boolean(beat.imageUrl);
            return (
              <div
                key={`${beat.storyId}-${beat.sequence}`}
                className="element-card !items-center !p-2 cursor-pointer"
              >
                <span className="text-lg inline-flex items-center"><Film size={18} /></span>
                <span className="text-xs font-medium">
                  {t("scene.shotNumber", { n: beat.sequence })}
                  {beat.title ? ` · ${beat.title}` : ""}
                </span>
                <span
                  className={isCompleted ? "badge badge-success !text-[9px] ml-auto" : "badge badge-info !text-[9px] ml-auto"}
                >
                  {isCompleted ? <Check size={10} /> : null}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

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

interface SceneActionFooterProps {
  isDirty: boolean;
  saveStatus: SaveStatus;
  saveError: string | null | undefined;
  canSave: boolean;
  onSave: () => void;
  onDelete: () => void;
  deleteDisabled: boolean;
}

export function SceneActionFooter({
  isDirty,
  saveStatus,
  saveError,
  canSave,
  onSave,
  onDelete,
  deleteDisabled,
}: SceneActionFooterProps) {
  return (
    <div
      className="sticky bottom-0 left-0 right-0 flex gap-2 items-center py-2.5 mt-2 bg-background border-t border-border z-10"
    >
      <SaveStatusIndicator
        status={isDirty ? "unsaved" : saveStatus}
        errorMessage={saveError ?? undefined}
      />
      <button
        type="button"
        className="btn btn-ghost btn-xs !gap-1 !text-destructive"
        onClick={onDelete}
        disabled={deleteDisabled}
        aria-label={t("scene.deleteScene")}
      >
        <Trash2 size={12} /> {t("scene.deleteScene")}
      </button>
      <button
        type="button"
        data-testid="scene-save-button"
        className="btn btn-primary btn-sm flex-1 justify-center !gap-1"
        onClick={onSave}
        disabled={saveStatus === "saving" || !canSave}
        title={saveStatus !== "saving" && !canSave ? t("hint.saveScene") : undefined}
      >
        {saveStatus === "saving" ? (
          <Loader2 className="animate-spin" size={14} />
        ) : (
          <Save size={14} />
        )}
        {saveStatus === "saving" ? t("scene.saving") : t("common.save")}
      </button>
    </div>
  );
}
