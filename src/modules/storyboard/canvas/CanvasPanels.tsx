import { useEffect, useState } from "react";
import { Panel } from "@xyflow/react";
import { Film, LayoutGrid, Map as MapIcon, MapPin, Maximize, Plus, User, X } from "lucide-react";
import { t } from "@/shared/constants";
import { resolveMediaUrl } from "@/shared/utils/image-url";
import type { StoryBeat, Character, Scene } from "@/domain/schemas";
import { ResourceReferencePanel } from "./ResourceReferencePanel";
import type { ResourceKind } from "./types";

interface CanvasToolbarProps {
  onAddBeat: () => void;
  onAutoLayout: () => void;
  onFitView: () => void;
  showMinimap: boolean;
  onToggleMinimap: () => void;
  /** 当前打开的资源面板类型（null = 关闭） */
  resourcePickerKind: ResourceKind | null;
  onOpenResourcePicker: (kind: ResourceKind) => void;
}

/** 画布工具栏（添加分镜 / 添加角色 / 添加场景 / 自动布局 / 适应视图 / 迷你地图） */
export function CanvasToolbar({
  onAddBeat,
  onAutoLayout,
  onFitView,
  showMinimap,
  onToggleMinimap,
  resourcePickerKind,
  onOpenResourcePicker,
}: CanvasToolbarProps) {
  return (
    <Panel position="top-left">
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn btn-primary btn-sm" onClick={onAddBeat}>
          <Plus style={{ width: 14, height: 14, display: "inline", verticalAlign: "middle", marginRight: 4 }} aria-hidden="true" />
          {t("storyboard.canvas.addBeat")}
        </button>
        <button
          className={`btn btn-sm ${resourcePickerKind === "character" ? "btn-primary" : "btn-outline"}`}
          onClick={() => onOpenResourcePicker("character")}
          title={t("storyboard.canvas.addCharacter")}
          aria-label={t("storyboard.canvas.addCharacter")}
        >
          <User style={{ width: 13, height: 13, display: "inline", verticalAlign: "middle", marginRight: 4 }} aria-hidden="true" />
          {t("storyboard.canvas.addCharacter")}
        </button>
        <button
          className={`btn btn-sm ${resourcePickerKind === "scene" ? "btn-primary" : "btn-outline"}`}
          onClick={() => onOpenResourcePicker("scene")}
          title={t("storyboard.canvas.addScene")}
          aria-label={t("storyboard.canvas.addScene")}
        >
          <MapPin style={{ width: 13, height: 13, display: "inline", verticalAlign: "middle", marginRight: 4 }} aria-hidden="true" />
          {t("storyboard.canvas.addScene")}
        </button>
        <button
          className="btn btn-outline btn-sm"
          onClick={onAutoLayout}
          title={t("storyboard.canvas.autoLayout")}
          aria-label={t("storyboard.canvas.autoLayout")}
        >
          <LayoutGrid style={{ width: 13, height: 13, display: "inline", verticalAlign: "middle" }} aria-hidden="true" />
        </button>
        <button
          className="btn btn-outline btn-sm"
          onClick={onFitView}
          title={t("storyboard.canvas.fitView")}
          aria-label={t("storyboard.canvas.fitView")}
        >
          <Maximize style={{ width: 13, height: 13, display: "inline", verticalAlign: "middle" }} aria-hidden="true" />
        </button>
        <button
          className={`btn btn-sm ${showMinimap ? "btn-outline" : "btn-ghost"}`}
          onClick={onToggleMinimap}
          title={t("storyboard.canvas.minimap")}
          aria-label={t("storyboard.canvas.minimap")}
        >
          <MapIcon style={{ width: 13, height: 13, display: "inline", verticalAlign: "middle" }} aria-hidden="true" />
        </button>
      </div>
    </Panel>
  );
}

export interface SelectedResourceInfo {
  kind: ResourceKind;
  name: string;
  referencedBeatIds: string[];
}

interface CanvasOverlayPanelProps {
  beats: StoryBeat[];
  selectedResourceInfo: SelectedResourceInfo | null;
  onSelectBeat: (beatId: string) => void;
  onClose: () => void;
}

/** 右上浮层：绑定引导提示 + 资源节点引用反查面板 */
export function CanvasOverlayPanel({
  beats,
  selectedResourceInfo,
  onSelectBeat,
  onClose,
}: CanvasOverlayPanelProps) {
  return (
    <Panel position="top-right">
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
        {!selectedResourceInfo && (
          <div
            style={{
              fontSize: 11,
              color: "var(--muted-fg)",
              background: "var(--panel)",
              padding: "4px 10px",
              borderRadius: 8,
              border: "1px solid var(--border)",
            }}
          >
            {t("storyboard.canvas.connectToBind")}
          </div>
        )}
        {selectedResourceInfo && (
          <ResourceReferencePanel
            resourceName={selectedResourceInfo.name}
            kind={selectedResourceInfo.kind}
            beats={beats}
            referencedBeatIds={selectedResourceInfo.referencedBeatIds}
            onSelectBeat={onSelectBeat}
            onClose={onClose}
          />
        )}
      </div>
    </Panel>
  );
}

interface ResourcePickerPanelProps {
  beats: StoryBeat[];
  characters: Character[];
  scenes: Scene[];
  hiddenResourceIds: Set<string>;
  /** 打开面板时预选的资源类型（null = 全部） */
  initialKind: ResourceKind | null;
  onToggle: (id: string, visible: boolean) => void;
  onShowAll: () => void;
  onShowBoundOnly: () => void;
  onClose: () => void;
}

function resolveResourceImage(kind: ResourceKind, resource: Character | Scene): string | undefined {
  return kind === "character"
    ? resolveMediaUrl(
        (resource as Character).avatarPath ?? (resource as Character).thumbnailPath,
        (resource as Character).generatedImage ?? (resource as Character).refImagePath,
      )
    : resolveMediaUrl(
        (resource as Scene).scenePath ??
          (resource as Scene).thumbnailPath ??
          (resource as Scene).refImagePath,
        (resource as Scene).imageUrl,
      );
}

function ResourcePickerRow({
  id,
  name,
  visible,
  image,
  icon,
  onToggle,
}: {
  id: string;
  name: string;
  visible: boolean;
  image?: string;
  icon: React.ReactNode;
  onToggle: (id: string, visible: boolean) => void;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 12,
        cursor: "pointer",
        padding: "3px 0",
      }}
    >
      <input
        type="checkbox"
        checked={visible}
        onChange={(e) => onToggle(id, e.target.checked)}
        style={{ margin: 0, accentColor: "var(--primary)", flexShrink: 0 }}
      />
      {image ? (
        <img
          src={image}
          alt={name}
          style={{
            width: 24,
            height: 24,
            borderRadius: 5,
            objectFit: "cover",
            flexShrink: 0,
          }}
        />
      ) : (
        <span
          style={{
            width: 24,
            height: 24,
            borderRadius: 5,
            background: "var(--muted)",
            color: "var(--muted-fg)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {icon}
        </span>
      )}
      <span
        style={{
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {name}
      </span>
    </label>
  );
}

/** 资源是否被任一 beat 绑定（引用） */
function isBound(beats: StoryBeat[], kind: ResourceKind, resourceId: string): boolean {
  return beats.some((beat) =>
    kind === "character"
      ? (beat.characterIds ?? []).includes(resourceId)
      : beat.sceneId === resourceId,
  );
}

interface ResourceGroupProps {
  title: string;
  items: { id: string; name: string; image?: string; kind: ResourceKind }[];
  hiddenResourceIds: Set<string>;
  onToggle: (id: string, visible: boolean) => void;
}

function ResourceGroup({ title, items, hiddenResourceIds, onToggle }: ResourceGroupProps) {
  if (items.length === 0) return null;
  return (
    <>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-fg)", marginTop: 4 }}>
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {items.map((item) => (
          <ResourcePickerRow
            key={item.id}
            id={item.id}
            name={item.name}
            visible={!hiddenResourceIds.has(item.id)}
            image={item.image}
            icon={
              item.kind === "character" ? (
                <User style={{ width: 12, height: 12 }} aria-hidden="true" />
              ) : (
                <MapPin style={{ width: 12, height: 12 }} aria-hidden="true" />
              )
            }
            onToggle={onToggle}
          />
        ))}
      </div>
    </>
  );
}

/**
 * 资源节点选择面板（"添加角色" / "添加场景" 入口）。
 *
 * 面向大量角色/场景的策略：
 * - 从工具栏按钮进入时预筛对应类型，面板内可切换「全部 / 角色 / 场景」
 * - 搜索框按名称过滤
 * - 「显示全部 / 仅显示已绑定」一键切换
 * - 按"已绑定 / 未绑定"分组展示（含缩略图），默认只显示已绑定资源
 */
export function ResourcePickerPanel({
  beats,
  characters,
  scenes,
  hiddenResourceIds,
  initialKind,
  onToggle,
  onShowAll,
  onShowBoundOnly,
  onClose,
}: ResourcePickerPanelProps) {
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | ResourceKind>(
    initialKind ?? "all",
  );

  // 工具栏按钮再次打开面板时，重置为对应类型筛选
  useEffect(() => {
    setKindFilter(initialKind ?? "all");
  }, [initialKind]);

  const keyword = query.trim().toLowerCase();
  const matches = (name: string) => !keyword || name.toLowerCase().includes(keyword);

  const allItems = [
    ...characters.map((c) => ({
      id: c.id,
      name: c.name,
      kind: "character" as ResourceKind,
      image: resolveResourceImage("character", c),
      bound: isBound(beats, "character", c.id),
    })),
    ...scenes.map((s) => ({
      id: s.id,
      name: s.name,
      kind: "scene" as ResourceKind,
      image: resolveResourceImage("scene", s),
      bound: isBound(beats, "scene", s.id),
    })),
  ].filter(
    (item) =>
      (kindFilter === "all" || item.kind === kindFilter) && matches(item.name),
  );

  const boundItems = allItems.filter((item) => item.bound);
  const unboundItems = allItems.filter((item) => !item.bound);

  return (
    <div
      className="card"
      role="dialog"
      aria-label={t("storyboard.canvas.resourcePickerTitle")}
      style={{
        width: 280,
        maxHeight: 400,
        display: "flex",
        flexDirection: "column",
        padding: 12,
        gap: 6,
        boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ flex: 1, fontSize: 12, fontWeight: 600 }}>
          {t("storyboard.canvas.resourcePickerTitle")}
        </span>
        <button
          className="btn btn-ghost btn-xs"
          onClick={onClose}
          aria-label={t("aria.close")}
        >
          <X size={13} aria-hidden="true" />
        </button>
      </div>

      {/* 类型筛选 */}
      <div style={{ display: "flex", gap: 4 }}>
        {(["all", "character", "scene"] as const).map((kind) => (
          <button
            key={kind}
            className={`btn btn-xs ${kindFilter === kind ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setKindFilter(kind)}
          >
            {kind === "all"
              ? t("storyboard.canvas.allKinds")
              : kind === "character"
                ? t("storyboard.canvas.characterSection")
                : t("storyboard.canvas.sceneSection")}
          </button>
        ))}
      </div>

      {/* 搜索 */}
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input
          className="input"
          style={{ flex: 1, fontSize: 12, padding: "4px 8px" }}
          placeholder={t("storyboard.canvas.searchResources")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={t("storyboard.canvas.searchResources")}
        />
        <button
          className="btn btn-outline btn-xs"
          onClick={onShowAll}
          title={t("storyboard.canvas.showAll")}
        >
          {t("storyboard.canvas.showAll")}
        </button>
        <button
          className="btn btn-outline btn-xs"
          onClick={onShowBoundOnly}
          title={t("storyboard.canvas.showBoundOnly")}
        >
          {t("storyboard.canvas.showBoundOnly")}
        </button>
      </div>

      {/* 分组列表 */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
        {allItems.length === 0 ? (
          <div style={{ fontSize: 11, color: "var(--muted-fg)", textAlign: "center", padding: "16px 0" }}>
            {t("storyboard.canvas.noMatch")}
          </div>
        ) : (
          <>
            <ResourceGroup
              title={t("storyboard.canvas.boundSection", { count: boundItems.length })}
              items={boundItems}
              hiddenResourceIds={hiddenResourceIds}
              onToggle={onToggle}
            />
            <ResourceGroup
              title={t("storyboard.canvas.unboundSection", { count: unboundItems.length })}
              items={unboundItems}
              hiddenResourceIds={hiddenResourceIds}
              onToggle={onToggle}
            />
          </>
        )}
      </div>
    </div>
  );
}

/** 资源节点选择面板浮层（位于画布工具栏下方） */
export function ResourcePickerOverlay(props: ResourcePickerPanelProps) {
  return (
    <div style={{ position: "absolute", top: 44, left: 12, zIndex: 10 }}>
      <ResourcePickerPanel {...props} />
    </div>
  );
}

/** 画布空态提示（无分镜时覆盖显示） */
export function CanvasEmptyState() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          textAlign: "center",
          color: "var(--muted-fg)",
          fontSize: 13,
          background: "var(--panel)",
          padding: "16px 24px",
          borderRadius: 12,
          border: "1px dashed var(--border)",
        }}
      >
        <Film style={{ width: 28, height: 28, margin: "0 auto 8px", opacity: 0.4 }} aria-hidden="true" />
        <p>{t("storyboard.canvas.emptyTitle")}</p>
      </div>
    </div>
  );
}
