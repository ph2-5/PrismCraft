/**
 * Task 2A.9 — CompositorPanel 主组件
 *
 * 三栏布局（参考 design-preview.html page-composer）：
 *   - 左栏 240px：素材面板（Tab 切换 角色/场景/道具）
 *   - 中栏 flex:1：画布（1024×1024 预览区）+ 操作按钮
 *   - 右栏 260px：P图工具 + 图层列表 + 合成提示词 + 生成按钮
 *
 * 数据来源：
 *   - 角色：useCharacters()
 *   - 场景：useScenes()
 *   - 道具：useProps()
 *   - 编译器状态：useCompositor()
 */

import { useState, useRef } from "react";
import { ImagePlus as ImagePlusIcon } from "lucide-react";
import { useCharacters } from "@/modules/character";
import { useScenes } from "@/modules/scene";
import { useProps } from "@/modules/asset";
import { Tabs } from "@/shared/presentation/Tabs";
import { SafeImage } from "@/shared/presentation/SafeImage";
import { EmptyState } from "@/shared/presentation/EmptyState";
import { IconButton } from "@/shared/presentation/IconButton";
import { t } from "@/shared/constants";
import { resolveImageUrl } from "@/shared/utils/image-url";
import { isElectron } from "@/shared/utils/platform";
import { useCompositor } from "../hooks/use-compositor";
import type { Character, Scene, Prop } from "@/domain/schemas";
import type { ComposerLayer } from "../domain/compositor.schema";

type AssetTab = "character" | "scene" | "prop";

/** 左栏素材面板 */
function AssetPanel({
  activeTab,
  onTabChange,
  onAddCharacter,
  onAddScene,
  onAddProp,
}: {
  activeTab: AssetTab;
  onTabChange: (tab: AssetTab) => void;
  onAddCharacter: (c: Character) => void;
  onAddScene: (s: Scene) => void;
  onAddProp: (p: Prop) => void;
}) {
  const { data: characters, isLoading: charLoading } = useCharacters();
  const { data: scenes, isLoading: sceneLoading } = useScenes();
  const { data: props, isLoading: propLoading } = useProps();

  const tabs = [
    { id: "character", label: t("compositor.tab.character") },
    { id: "scene", label: t("compositor.tab.scene") },
    { id: "prop", label: t("compositor.tab.prop") },
  ];

  return (
    <div
      // 第 6 轮审计修复：最小宽度从 180px 提升到 200px，避免小屏拥挤
      className="w-[200px] lg:w-[240px] xl:w-[260px] shrink-0 border-r border-border flex flex-col overflow-hidden"
    >
      <Tabs
        tabs={tabs}
        activeTab={activeTab}
        onChange={(id) => onTabChange(id as AssetTab)}
      />
      <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
        {activeTab === "character" && (
          <>
            {charLoading && <div style={{ padding: 12, color: "var(--muted-fg)" }}>{t("common.loading")}</div>}
            {!charLoading && characters && characters.length === 0 && (
              <EmptyState icon={ImagePlusIcon} title={t("compositor.empty.character")} compact />
            )}
            {characters?.map((c) => (
              <AssetCard
                key={c.id}
                emoji="👤"
                name={c.name}
                desc={c.description || c.gender || ""}
                imageUrl={c.generatedImage ? resolveImageUrl(c.generatedImage) : undefined}
                onClick={() => onAddCharacter(c)}
              />
            ))}
          </>
        )}
        {activeTab === "scene" && (
          <>
            {sceneLoading && <div style={{ padding: 12, color: "var(--muted-fg)" }}>{t("common.loading")}</div>}
            {!sceneLoading && scenes && scenes.length === 0 && (
              <EmptyState icon={ImagePlusIcon} title={t("compositor.empty.scene")} compact />
            )}
            {scenes?.map((s) => (
              <AssetCard
                key={s.id}
                emoji="🏞"
                name={s.name}
                desc={s.description || s.type || ""}
                imageUrl={s.generatedImage ? resolveImageUrl(s.generatedImage) : undefined}
                onClick={() => onAddScene(s)}
              />
            ))}
          </>
        )}
        {activeTab === "prop" && (
          <>
            {propLoading && <div style={{ padding: 12, color: "var(--muted-fg)" }}>{t("common.loading")}</div>}
            {!propLoading && props && props.length === 0 && (
              <EmptyState icon={ImagePlusIcon} title={t("compositor.empty.prop")} compact />
            )}
            {props?.map((p) => (
              <AssetCard
                key={p.id}
                emoji="🎁"
                name={p.name}
                desc={p.description || t(`prop.type.${p.type}`)}
                imageUrl={p.referenceImage ? resolveImageUrl(p.referenceImage) : undefined}
                onClick={() => onAddProp(p)}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

/** 素材卡片（参考 design-preview element-card 模式） */
function AssetCard({
  emoji,
  name,
  desc,
  imageUrl,
  onClick,
}: {
  emoji: string;
  name: string;
  desc: string;
  imageUrl?: string;
  onClick: () => void;
}) {
  return (
    <div
      className="element-card"
      style={{ alignItems: "center", cursor: "pointer", marginBottom: 4 }}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {imageUrl ? (
        <SafeImage src={imageUrl} alt={name} width={32} height={32} />
      ) : (
        <div
          className="element-avatar character"
          style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <span>{emoji}</span>
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {name}
        </div>
        <div
          style={{
            fontSize: 10,
            color: "var(--muted-fg)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {desc}
        </div>
      </div>
      <span style={{ fontSize: 10, color: "var(--muted-fg)" }}>+</span>
    </div>
  );
}

/** 中栏画布 */
function CompositorCanvas({
  layers,
  selectedLayerId,
  onSelectLayer,
  onMoveLayer,
  onRemoveLayer,
  resultImageUrl,
  status,
}: {
  layers: ComposerLayer[];
  selectedLayerId: string | null;
  onSelectLayer: (id: string | null) => void;
  onMoveLayer: (id: string, x: number, y: number) => void;
  onRemoveLayer: (id: string) => void;
  resultImageUrl?: string;
  status: string;
}) {
  const draggingRef = useRef<{ layerId: string; offsetX: number; offsetY: number } | null>(null);

  const handleMouseDown = (e: React.MouseEvent, layer: ComposerLayer) => {
    draggingRef.current = {
      layerId: layer.layerId,
      offsetX: e.clientX - layer.x,
      offsetY: e.clientY - layer.y,
    };
    onSelectLayer(layer.layerId);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - draggingRef.current.offsetX;
    const y = e.clientY - rect.top - draggingRef.current.offsetY;
    onMoveLayer(draggingRef.current.layerId, x, y);
  };

  const handleMouseUp = () => {
    draggingRef.current = null;
  };

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
        padding: 20,
      }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          maxWidth: 700,
          maxHeight: 700,
          aspectRatio: "1",
          background: "var(--card2)",
          border: "2px dashed var(--border)",
          borderRadius: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 8,
          color: "var(--muted-fg)",
          position: "relative",
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) onSelectLayer(null);
        }}
      >
        {resultImageUrl ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            <SafeImage
              src={resultImageUrl}
              alt={t("compositor.result.alt")}
              fill
            />
          </div>
        ) : layers.length === 0 ? (
          <EmptyState icon={ImagePlusIcon} title={t("compositor.canvas.empty")} />
        ) : null}

        {/* 图层节点（仅在没有生成结果时显示） */}
        {!resultImageUrl &&
          layers.map((layer) => (
            <div
              key={layer.layerId}
              style={{
                position: "absolute",
                left: layer.x,
                top: layer.y,
                transform: `scale(${layer.scale})`,
                transformOrigin: "top left",
                zIndex: layer.zIndex,
                cursor: "move",
                background: "rgba(0,0,0,0.5)",
                borderRadius: 8,
                padding: "8px 12px",
                border: `1px solid ${selectedLayerId === layer.layerId ? "var(--primary)" : "var(--border)"}`,
                fontSize: 12,
                display: "flex",
                alignItems: "center",
                gap: 6,
                color: "#fff",
              }}
              onMouseDown={(e) => handleMouseDown(e, layer)}
              onDoubleClick={() => onRemoveLayer(layer.layerId)}
            >
              <span>{layer.emoji}</span>
              <span>{layer.name}</span>
            </div>
          ))}

        {/* 生成中遮罩 */}
        {(status === "generating" || status === "building-prompt" || status === "saving") && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0,0,0,0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: 14,
              borderRadius: 10,
            }}
          >
            {t(`compositor.status.${status}`)}
          </div>
        )}
      </div>
    </div>
  );
}

/** 右栏：P图工具 + 图层列表 + 合成提示词 + 生成按钮 */
function ToolsSidebar({
  layers,
  selectedLayerId,
  onSelectLayer,
  onRemoveLayer,
  extraPrompt,
  onExtraPromptChange,
  onGenerate,
  onClear,
  canGenerate,
  error,
  status,
}: {
  layers: ComposerLayer[];
  selectedLayerId: string | null;
  onSelectLayer: (id: string | null) => void;
  onRemoveLayer: (id: string) => void;
  extraPrompt: string;
  onExtraPromptChange: (text: string) => void;
  onGenerate: () => void;
  onClear: () => void;
  canGenerate: boolean;
  error: string | null;
  status: string;
}) {
  // P 图工具占位（实际功能可后续接入 ImageEditorToolbar）
  const editTools = [
    { id: "crop", label: t("compositor.tool.crop"), emoji: "✂️" },
    { id: "scale", label: t("compositor.tool.scale"), emoji: "🔍" },
    { id: "rotate", label: t("compositor.tool.rotate"), emoji: "🔄" },
    { id: "flip", label: t("compositor.tool.flip"), emoji: "↔️" },
    { id: "filter", label: t("compositor.tool.filter"), emoji: "🎨" },
    { id: "adjust", label: t("compositor.tool.adjust"), emoji: "🎚️" },
    { id: "cutout", label: t("compositor.tool.cutout"), emoji: "🪄" },
    { id: "text", label: t("compositor.tool.text"), emoji: "📝" },
    { id: "brush", label: t("compositor.tool.brush"), emoji: "🖌️" },
    { id: "eraser", label: t("compositor.tool.eraser"), emoji: "🧽" },
    { id: "mask", label: t("compositor.tool.mask"), emoji: "🎭" },
    { id: "ai-expand", label: t("compositor.tool.aiExpand"), emoji: "🤖" },
  ];

  return (
    <div
      // 第 6 轮审计修复：最小宽度从 200px 提升到 220px，与左栏 AssetPanel 视觉平衡
      className="w-[220px] lg:w-[260px] xl:w-[280px] shrink-0 border-l border-border flex flex-col overflow-hidden"
    >
      {/* P 图工具区 */}
      <div style={{ flexShrink: 0, padding: 8, borderBottom: "1px solid var(--border)" }}>
        <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6, color: "var(--muted-fg)" }}>
          {t("compositor.tools.title")}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 4,
          }}
        >
          {editTools.map((tool) => (
            <button
              key={tool.id}
              type="button"
              className="btn btn-ghost btn-xs"
              title={tool.label}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "6px 4px" }}
            >
              <span style={{ fontSize: 16 }}>{tool.emoji}</span>
              <span style={{ fontSize: 9, color: "var(--muted-fg)" }}>{tool.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 图层列表 */}
      <div style={{ flex: 1, overflowY: "auto", padding: 8, borderBottom: "1px solid var(--border)" }}>
        <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6, color: "var(--muted-fg)" }}>
          {t("compositor.layers.title")}
        </div>
        {layers.length === 0 ? (
          <EmptyState
            icon={ImagePlusIcon}
            title={t("compositor.layers.empty")}
            hint={t("compositor.layers.emptyHint")}
            compact
          />
        ) : (
          layers.map((layer) => (
            <div
              key={layer.layerId}
              className="element-card"
              style={{
                alignItems: "center",
                padding: "6px 8px",
                cursor: "pointer",
                marginBottom: 4,
                border: `1px solid ${selectedLayerId === layer.layerId ? "var(--primary)" : "var(--border)"}`,
              }}
              onClick={() => onSelectLayer(layer.layerId)}
            >
              <span style={{ fontSize: 16 }}>{layer.emoji}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {layer.name}
                </div>
              </div>
              <IconButton aria-label={t("common.delete")} onClick={(e) => { e.stopPropagation(); onRemoveLayer(layer.layerId); }}>
                ✕
              </IconButton>
            </div>
          ))
        )}
      </div>

      {/* 合成提示词 + 生成按钮 */}
      <div style={{ flexShrink: 0, padding: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6, color: "var(--muted-fg)" }}>
          {t("compositor.prompt.title")}
        </div>
        <textarea
          value={extraPrompt}
          onChange={(e) => onExtraPromptChange(e.target.value)}
          placeholder={t("compositor.prompt.placeholder")}
          style={{
            width: "100%",
            minHeight: 80,
            fontSize: 12,
            padding: 8,
            border: "1px solid var(--border)",
            borderRadius: 6,
            resize: "vertical",
            marginBottom: 8,
            background: "var(--input-bg, var(--bg))",
            color: "var(--fg)",
          }}
        />
        {error && (
          <div style={{ fontSize: 11, color: "var(--danger, #d33)", marginBottom: 6, wordBreak: "break-word" }}>
            {error}
          </div>
        )}
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onGenerate}
            disabled={!canGenerate}
            style={{ flex: 1 }}
          >
            {status === "generating" || status === "building-prompt" || status === "saving"
              ? t("compositor.generate.generating")
              : t("compositor.generate.button")}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClear}
            title={t("compositor.clear")}
          >
            {t("compositor.clear")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 主组件：三栏布局 */
export function CompositorPanel() {
  const [activeTab, setActiveTab] = useState<AssetTab>("character");
  const compositor = useCompositor();

  if (!isElectron()) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "var(--muted-fg)" }}>
        {t("compositor.requiresDesktop")}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <AssetPanel
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onAddCharacter={compositor.addCharacterLayer}
          onAddScene={compositor.addSceneLayer}
          onAddProp={compositor.addPropLayer}
        />
        <CompositorCanvas
          layers={compositor.layers}
          selectedLayerId={compositor.selectedLayerId}
          onSelectLayer={compositor.selectLayer}
          onMoveLayer={compositor.moveLayer}
          onRemoveLayer={compositor.removeLayer}
          resultImageUrl={compositor.result?.imageUrl}
          status={compositor.status}
        />
        <ToolsSidebar
          layers={compositor.layers}
          selectedLayerId={compositor.selectedLayerId}
          onSelectLayer={compositor.selectLayer}
          onRemoveLayer={compositor.removeLayer}
          extraPrompt={compositor.extraPrompt}
          onExtraPromptChange={compositor.setExtraPrompt}
          onGenerate={compositor.generate}
          onClear={compositor.clearCanvas}
          canGenerate={compositor.canGenerate}
          error={compositor.error}
          status={compositor.status}
        />
      </div>
    </div>
  );
}
