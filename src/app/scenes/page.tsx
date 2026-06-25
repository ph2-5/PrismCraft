import { Suspense } from "react";
import { PageErrorBoundary } from "@/shared/presentation/PageErrorBoundary";
import { SaveStatusIndicator } from "@/shared/presentation/SaveStatusIndicator";
import { Wand2, Upload, ScanLine, Save, Loader2, Folder, Sparkles, X } from "lucide-react";
import { t } from "@/shared/constants/messages";
import { MediaExporter } from "@/modules/asset";
import { ModelSelector } from "@/modules/prompt";
import { SceneList } from "./components/SceneList";
import { DeleteConfirmDialog } from "@/shared/presentation/DeleteConfirmDialog";
import { AssetSelectorDialog } from "@/shared/presentation/AssetSelectorDialog";
import { useScenesPage } from "./hooks/useScenesPage";
import {
  typeSuggestions,
  timeSuggestions,
  weatherSuggestions,
} from "@/modules/scene";

export default function ScenesPage() {
  return (
    <Suspense>
      <ScenesPageContent />
    </Suspense>
  );
}

function ScenesPageContent() {
  const {
    scenesLoading,
    assets,
    currentScene,
    setCurrentScene,
    customElement,
    setCustomElement,
    generatedImage,
    isGenerating,
    isUploading,
    isAnalyzing,
    isOptimizingPrompt,
    fileInputRef,
    analyzeFileInputRef,
    selectedImageModel,
    setSelectedImageModel,
    generatePrompt,
    optimizePrompt,
    generateImage,
    saveImageToScene,
    handleFileUpload,
    handleAnalyzeFileUpload,
    clearImage,
    deleteDialogOpen,
    setDeleteDialogOpen,
    sceneToDelete,
    referenceCheck,
    handleSave,
    saveStatus,
    saveError,
    handleDelete,
    performDelete,
    isDeleting,
    addItem,
    removeItem,
    handleSelectScene,
    handleNewScene,
    handleAssetSelect,
    showAssetSelector,
    setShowAssetSelector,
    isDirty,
    searchQuery,
    setSearchQuery,
    showElementInput,
    setShowElementInput,
    filteredScenes,
    referencedBeats,
    avatarImage,
  } = useScenesPage();

  return (
    <PageErrorBoundary pageName={t("scene.pageName")}>
      <div
        className="fade-in"
        style={{ display: "flex", flexDirection: "column", height: "100%" }}
      >
        {/* Top Tabs Header */}
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
              onClick={handleNewScene}
            >
              + {t("scene.createNewScene")}
            </button>
          </div>
        </div>

        {/* Main Content - Left/Right Split */}
        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
          {/* Left: Scene List */}
          <SceneList
            scenes={filteredScenes}
            scenesLoading={scenesLoading}
            currentSceneId={currentScene.id}
            isDirty={isDirty}
            onSelectScene={handleSelectScene}
            onDeleteScene={handleDelete}
            onNewScene={handleNewScene}
          />

          {/* Right: Detail Editor */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              overflowY: "auto",
              padding: 16,
              gap: 12,
              minWidth: 0,
            }}
          >
            {/* Header: avatar + name + badges + 换封面 */}
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
                  value={currentScene.name}
                  placeholder={t("scene.namePlaceholder")}
                  onChange={(e) =>
                    setCurrentScene(
                      (prev) => ({ ...prev, name: e.target.value }),
                      true,
                    )
                  }
                />
                <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                  <span className="badge badge-info">
                    {currentScene.type || t("scene.label")}
                  </span>
                  <span className="badge" style={{ fontSize: 9 }}>
                    {t("scene.referencedBy", { count: referencedBeats.length })}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setShowAssetSelector(true)}
              >
                🔄 {t("scene.changeCover")}
              </button>
            </div>

            {/* 基本信息 card */}
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
                    style={{ fontSize: 12, width: "100%" }}
                    value={currentScene.timeOfDay}
                    onChange={(e) =>
                      setCurrentScene(
                        (prev) => ({ ...prev, timeOfDay: e.target.value }),
                        true,
                      )
                    }
                  >
                    <option value="">{t("scene.timeOfDayPlaceholder")}</option>
                    {timeSuggestions.map((s) => (
                      <option key={s} value={s}>
                        {s}
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
                    style={{ fontSize: 12, width: "100%" }}
                    value={currentScene.weather}
                    onChange={(e) =>
                      setCurrentScene(
                        (prev) => ({ ...prev, weather: e.target.value }),
                        true,
                      )
                    }
                  >
                    <option value="">{t("scene.weatherPlaceholder")}</option>
                    {weatherSuggestions.map((w) => (
                      <option key={w} value={w}>
                        {w}
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
                    style={{ fontSize: 12, width: "100%" }}
                    value={currentScene.type}
                    onChange={(e) =>
                      setCurrentScene(
                        (prev) => ({ ...prev, type: e.target.value }),
                        true,
                      )
                    }
                  >
                    <option value="">{t("scene.typePlaceholder")}</option>
                    {typeSuggestions.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* 氛围描述 card */}
            <div className="card" style={{ padding: 14 }}>
              <div className="section-label" style={{ marginBottom: 8 }}>
                {t("scene.atmosphereDesc")}
              </div>
              <textarea
                className="textarea"
                rows={3}
                style={{ fontSize: 12 }}
                value={currentScene.description}
                placeholder={t("scene.descriptionPlaceholder")}
                onChange={(e) =>
                  setCurrentScene(
                    (prev) => ({ ...prev, description: e.target.value }),
                    true,
                  )
                }
              />
            </div>

            {/* 空间描述 card */}
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
                    value={currentScene.lighting}
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
                    value={currentScene.mood}
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

            {/* 场景元素 card */}
            <div className="card" style={{ padding: 14 }}>
              <div className="section-label" style={{ marginBottom: 8 }}>
                {t("scene.elements")}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {currentScene.elements.map((element) => (
                  <span
                    key={element}
                    className="badge"
                    style={{ fontSize: 10, cursor: "pointer" }}
                    onClick={() => removeItem("elements", element)}
                    title={t("common.delete")}
                  >
                    {element} ✕
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
                        addItem("elements", customElement);
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

            {/* 引用此场景的分镜 card */}
            <div className="card" style={{ padding: 14 }}>
              <div className="section-label" style={{ marginBottom: 8 }}>
                📖 {t("scene.referencedShots")}
              </div>
              {referencedBeats.length === 0 ? (
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
                  {referencedBeats.map((beat) => {
                    const isCompleted =
                      beat.generationStatus === "completed" ||
                      Boolean(beat.imageUrl);
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
                          className={
                            isCompleted ? "badge badge-success" : "badge badge-info"
                          }
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

            {/* 图片生成区 */}
            <div className="card" style={{ padding: 14 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}
              >
                <div className="section-label">
                  {t("scene.imageGenerationPrompt")}
                </div>
                <button
                  type="button"
                  className={`btn ${isOptimizingPrompt ? "btn-primary" : "btn-outline"} btn-sm`}
                  onClick={optimizePrompt}
                  disabled={isOptimizingPrompt}
                  style={{ gap: 4 }}
                >
                  {isOptimizingPrompt ? (
                    <Loader2 className="animate-spin" style={{ width: 14, height: 14 }} />
                  ) : (
                    <Sparkles style={{ width: 14, height: 14 }} />
                  )}
                  {isOptimizingPrompt ? t("scene.optimizing") : t("scene.aiOptimize")}
                </button>
              </div>
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
                {generatePrompt(currentScene)}
              </div>
              {(generatedImage ||
                currentScene.scenePath ||
                currentScene.generatedImage) && (
                <div
                  style={{
                    width: "100%",
                    aspectRatio: "1 / 1",
                    maxWidth: 200,
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
              )}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={generateImage}
                  disabled={isGenerating}
                  style={{ gap: 4 }}
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
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={saveImageToScene}
                  disabled={!currentScene.id}
                  style={{ gap: 4 }}
                >
                  <Save style={{ width: 14, height: 14 }} />
                  {t("scene.saveToScene")}
                </button>
                {generatedImage && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={clearImage}
                    style={{ gap: 4 }}
                  >
                    <X style={{ width: 14, height: 14 }} />
                    {t("scene.clear")}
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  style={{ gap: 4 }}
                >
                  {isUploading ? (
                    <Loader2 className="animate-spin" style={{ width: 14, height: 14 }} />
                  ) : (
                    <Upload style={{ width: 14, height: 14 }} />
                  )}
                  {isUploading ? t("scene.uploading") : t("scene.uploadImage")}
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => setShowAssetSelector(true)}
                  style={{ gap: 4 }}
                >
                  <Folder style={{ width: 14, height: 14 }} />
                  {t("scene.selectFromLibrary")}
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => analyzeFileInputRef.current?.click()}
                  disabled={isAnalyzing || isUploading}
                  style={{ gap: 4 }}
                >
                  {isAnalyzing ? (
                    <Loader2 className="animate-spin" style={{ width: 14, height: 14 }} />
                  ) : (
                    <ScanLine style={{ width: 14, height: 14 }} />
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

            {/* Bottom action bar */}
            <div
              style={{
                display: "flex",
                gap: 8,
                justifyContent: "flex-end",
                alignItems: "center",
              }}
            >
              <SaveStatusIndicator
                status={isDirty ? "unsaved" : saveStatus}
                errorMessage={saveError}
              />
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() =>
                  handleDelete(currentScene.id, currentScene.name)
                }
                disabled={!currentScene.id}
              >
                🗑 {t("scene.deleteScene")}
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleSave}
                disabled={saveStatus === "saving"}
              >
                {saveStatus === "saving" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "💾"
                )}
                {saveStatus === "saving" ? t("scene.saving") : t("common.save")}
              </button>
            </div>
          </div>
        </div>
      </div>

      {currentScene.id && <MediaExporter type="scene" item={currentScene} />}

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        entityLabel={t("scene.label")}
        isDeleting={isDeleting}
        onConfirm={() => sceneToDelete && performDelete(sceneToDelete)}
        referenceCheck={referenceCheck}
      />

      <AssetSelectorDialog
        open={showAssetSelector}
        onOpenChange={setShowAssetSelector}
        assets={assets}
        description={t("scene.selectImage")}
        onSelect={handleAssetSelect}
      />
    </PageErrorBoundary>
  );
}
