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
    <div className="top-tabs" style={{ justifyContent: "space-between" }}>
      <span style={{ fontWeight: 600, fontSize: 14 }}>🏙 {t("scene.title")}</span>
      <div className="toolbar">
        <input
          className="input"
          placeholder={t("scene.searchPlaceholder")}
          style={{ fontSize: 12, padding: "6px 10px", width: 180 }}
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
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <div
        className="element-avatar scene"
        style={{
          width: 64,
          height: 64,
          fontSize: 28,
          borderRadius: 14,
          backgroundImage: avatarImage ? `url(${avatarImage})` : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        {!avatarImage && "🏙"}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <input
          className="input"
          data-testid="scene-name-input"
          style={{ fontSize: 16, fontWeight: 700, padding: "6px 10px" }}
          value={scene.name}
          placeholder={t("scene.namePlaceholder")}
          onChange={(e) =>
            setCurrentScene((prev) => ({ ...prev, name: e.target.value }), true)
          }
        />
        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
          <span className="badge badge-info">
            {scene.type || t("scene.label")}
          </span>
          <span className="badge" style={{ fontSize: 9 }}>
            {t("scene.referencedBy", { count: referencedBeats.length })}
          </span>
        </div>
      </div>
      <button
        type="button"
        className="btn btn-outline btn-xs"
        onClick={onChangeCover}
      >
        🔄 {t("scene.changeCover")}
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
    <div className="card" style={{ padding: 14 }}>
      <div className="section-label" style={{ marginBottom: 10 }}>
        {t("scene.basicInfo")}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 8,
        }}
      >
        <div>
          <label style={{ fontSize: 10, color: "var(--muted-fg)" }}>
            {t("scene.timeLabel")}
          </label>
          <select
            className="select"
            data-testid="scene-time-of-day-input"
            style={{ fontSize: 12, width: "100%" }}
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
          <label style={{ fontSize: 10, color: "var(--muted-fg)" }}>
            {t("scene.weatherLabel")}
          </label>
          <select
            className="select"
            data-testid="scene-weather-input"
            style={{ fontSize: 12, width: "100%" }}
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
          <label style={{ fontSize: 10, color: "var(--muted-fg)" }}>
            {t("scene.sceneType")}
          </label>
          <select
            className="select"
            data-testid="scene-type-input"
            style={{ fontSize: 12, width: "100%" }}
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
    <div className="card" style={{ padding: 14 }}>
      <div className="section-label" style={{ marginBottom: 8 }}>
        {t("scene.atmosphereDesc")}
      </div>
      <textarea
        className="textarea"
        data-testid="scene-description-input"
        rows={3}
        style={{ fontSize: 12 }}
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
    <div className="card" style={{ padding: 14 }}>
      <div className="section-label" style={{ marginBottom: 8 }}>
        {t("scene.spaceDesc")}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
        }}
      >
        <div>
          <label style={{ fontSize: 10, color: "var(--muted-fg)" }}>
            {t("scene.lighting")}
          </label>
          <input
            className="input"
            style={{ fontSize: 12, padding: 6 }}
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
          <label style={{ fontSize: 10, color: "var(--muted-fg)" }}>
            {t("scene.colorTone")}
          </label>
          <input
            className="input"
            style={{ fontSize: 12, padding: 6 }}
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
    <div className="card" style={{ padding: 14 }}>
      <div className="section-label" style={{ marginBottom: 8 }}>
        {t("scene.elements")}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {scene.elements.map((element) => (
          <span
            key={element}
            className="badge"
            style={{
              fontSize: 10,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            {element}
            <button
              type="button"
              aria-label={t("common.delete")}
              onClick={() => onRemoveItem("elements", element)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
                fontSize: 11,
                lineHeight: 1,
                color: "var(--muted-fg)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--danger)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--muted-fg)";
              }}
            >
              ✕
            </button>
          </span>
        ))}
        {showElementInput ? (
          <input
            className="input"
            style={{ fontSize: 10, width: 120, padding: "2px 6px" }}
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
            className="badge badge-info"
            style={{
              fontSize: 10,
              cursor: "pointer",
            }}
            onClick={() => setShowElementInput(true)}
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
    <div className="card" style={{ padding: 14 }}>
      <div className="section-label" style={{ marginBottom: 8 }}>
        📖 {t("scene.referencedShots")}
      </div>
      {beats.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>
          {t("scene.noReferences")}
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {beats.map((beat) => {
            const isCompleted =
              beat.generationStatus === "completed" || Boolean(beat.imageUrl);
            return (
              <div
                key={`${beat.storyId}-${beat.sequence}`}
                className="element-card"
                style={{
                  alignItems: "center",
                  padding: 8,
                  cursor: "pointer",
                }}
              >
                <span style={{ fontSize: 18 }}>🎬</span>
                <span style={{ fontSize: 12, fontWeight: 500 }}>
                  {t("scene.shotNumber", { n: beat.sequence })}
                  {beat.title ? ` · ${beat.title}` : ""}
                </span>
                <span
                  className={isCompleted ? "badge badge-success" : "badge badge-info"}
                  style={{ fontSize: 9, marginLeft: "auto" }}
                >
                  {isCompleted ? "✓" : "⏳"}
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
    <div className="card" style={{ padding: 14 }}>
      <PromptHeader
        isOptimizingPrompt={isOptimizingPrompt}
        optimizePrompt={optimizePrompt}
      />
      <div
        className="card2"
        style={{
          padding: 10,
          fontSize: 12,
          lineHeight: 1.7,
          marginBottom: 8,
          maxHeight: 100,
          overflowY: "auto",
        }}
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
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 8,
      }}
    >
      <div className="section-label">{t("scene.imageGenerationPrompt")}</div>
      <button
        type="button"
        className={`btn ${isOptimizingPrompt ? "btn-primary" : "btn-outline"} btn-xs`}
        onClick={optimizePrompt}
        disabled={isOptimizingPrompt}
        style={{ gap: 4 }}
      >
        {isOptimizingPrompt ? (
          <Loader2 className="animate-spin" style={{ width: 12, height: 12 }} />
        ) : (
          <Sparkles style={{ width: 12, height: 12 }} />
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
      style={{
        width: "100%",
        aspectRatio: "16 / 9",
        maxWidth: 320,
        margin: "0 auto 8px",
        borderRadius: 8,
        overflow: "hidden",
        border: "1px solid var(--border)",
      }}
    >
      <img
        src={avatarImage}
        alt={t("scene.sceneImage")}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
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
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={generateImage}
          disabled={isGenerating}
          style={{ flex: 1, justifyContent: "center", gap: 4 }}
        >
          {isGenerating ? (
            <Loader2 className="animate-spin" style={{ width: 14, height: 14 }} />
          ) : (
            <Wand2 style={{ width: 14, height: 14 }} />
          )}
          {isGenerating ? t("scene.generating") : t("scene.generateImage")}
        </button>
        <ModelSelector
          capability="image"
          value={selectedImageModel}
          onChange={setSelectedImageModel}
        />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        <button
          type="button"
          className="btn btn-outline btn-xs"
          onClick={saveImageToScene}
          disabled={!canSave}
          style={{ gap: 4 }}
        >
          <Save style={{ width: 12, height: 12 }} />
          {t("scene.saveToScene")}
        </button>
        {generatedImage && (
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={clearImage}
            style={{ gap: 4 }}
          >
            <X style={{ width: 12, height: 12 }} />
            {t("scene.clear")}
          </button>
        )}
        <button
          type="button"
          className="btn btn-outline btn-xs"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          style={{ gap: 4 }}
        >
          {isUploading ? (
            <Loader2 className="animate-spin" style={{ width: 12, height: 12 }} />
          ) : (
            <Upload style={{ width: 12, height: 12 }} />
          )}
          {isUploading ? t("scene.uploading") : t("scene.uploadImage")}
        </button>
        <button
          type="button"
          className="btn btn-outline btn-xs"
          onClick={() => setShowAssetSelector(true)}
          style={{ gap: 4 }}
        >
          <Folder style={{ width: 12, height: 12 }} />
          {t("scene.selectFromLibrary")}
        </button>
        <button
          type="button"
          className="btn btn-outline btn-xs"
          onClick={() => analyzeFileInputRef.current?.click()}
          disabled={isAnalyzing || isUploading}
          style={{ gap: 4 }}
        >
          {isAnalyzing ? (
            <Loader2 className="animate-spin" style={{ width: 12, height: 12 }} />
          ) : (
            <ScanLine style={{ width: 12, height: 12 }} />
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
      <SaveStatusIndicator
        status={isDirty ? "unsaved" : saveStatus}
        errorMessage={saveError ?? undefined}
      />
      <button
        type="button"
        className="btn btn-ghost btn-xs"
        onClick={onDelete}
        disabled={deleteDisabled}
        aria-label={t("scene.deleteScene")}
        style={{ gap: 4, color: "var(--destructive)" }}
      >
        <Trash2 style={{ width: 12, height: 12 }} /> {t("scene.deleteScene")}
      </button>
      <button
        type="button"
        data-testid="scene-save-button"
        className="btn btn-primary btn-sm"
        onClick={onSave}
        disabled={saveStatus === "saving" || !canSave}
        style={{ flex: 1, justifyContent: "center", gap: 4 }}
      >
        {saveStatus === "saving" ? (
          <Loader2 className="animate-spin" style={{ width: 14, height: 14 }} />
        ) : (
          <Save style={{ width: 14, height: 14 }} />
        )}
        {saveStatus === "saving" ? t("scene.saving") : t("common.save")}
      </button>
    </div>
  );
}
