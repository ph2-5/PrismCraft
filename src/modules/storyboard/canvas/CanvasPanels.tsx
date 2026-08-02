import { Panel } from "@xyflow/react";
import { Film, LayoutGrid, Map as MapIcon, MapPin, Maximize, Plus, User, Users, X } from "lucide-react";
import { t } from "@/shared/constants";
import type { StoryBeat, Character, Scene } from "@/domain/schemas";
import { ResourceReferencePanel } from "./ResourceReferencePanel";
import type { ResourceKind } from "./types";

interface CanvasToolbarProps {
  onAddBeat: () => void;
  onAutoLayout: () => void;
  onFitView: () => void;
  showMinimap: boolean;
  onToggleMinimap: () => void;
  /** 资源节点选择面板开关 */
  resourcePickerActive: boolean;
  onToggleResourcePicker: () => void;
}

/** 画布工具栏（添加分镜 / 自动布局 / 适应视图 / 迷你地图 / 添加角色场景） */
export function CanvasToolbar({
  onAddBeat,
  onAutoLayout,
  onFitView,
  showMinimap,
  onToggleMinimap,
  resourcePickerActive,
  onToggleResourcePicker,
}: CanvasToolbarProps) {
  return (
    <Panel position="top-left">
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn btn-primary btn-sm" onClick={onAddBeat}>
          <Plus style={{ width: 14, height: 14, display: "inline", verticalAlign: "middle", marginRight: 4 }} aria-hidden="true" />
          {t("storyboard.canvas.addBeat")}
        </button>
        <button
          className={`btn btn-sm ${resourcePickerActive ? "btn-primary" : "btn-outline"}`}
          onClick={onToggleResourcePicker}
          title={t("storyboard.canvas.addResource")}
          aria-label={t("storyboard.canvas.addResource")}
        >
          <Users style={{ width: 13, height: 13, display: "inline", verticalAlign: "middle", marginRight: 4 }} aria-hidden="true" />
          {t("storyboard.canvas.addResource")}
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
  characters: Character[];
  scenes: Scene[];
  hiddenResourceIds: Set<string>;
  onToggle: (id: string, visible: boolean) => void;
  onClose: () => void;
}

function ResourcePickerRow({
  id,
  name,
  visible,
  icon,
  onToggle,
}: {
  id: string;
  name: string;
  visible: boolean;
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
        padding: "2px 0",
      }}
    >
      <input
        type="checkbox"
        checked={visible}
        onChange={(e) => onToggle(id, e.target.checked)}
        style={{ margin: 0, accentColor: "var(--primary)" }}
      />
      <span style={{ color: "var(--muted-fg)", display: "inline-flex" }}>{icon}</span>
      <span
        style={{
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

/**
 * 资源节点选择面板：勾选要在画布上显示的已有角色/场景（"添加角色/场景"入口）。
 * 数据即 story.characters / story.scenes，勾选状态仅影响画布显示，不改变绑定关系。
 */
export function ResourcePickerPanel({
  characters,
  scenes,
  hiddenResourceIds,
  onToggle,
  onClose,
}: ResourcePickerPanelProps) {
  return (
    <div
      className="card"
      role="dialog"
      aria-label={t("storyboard.canvas.resourcePickerTitle")}
      style={{
        width: 260,
        maxHeight: 340,
        overflowY: "auto",
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
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

      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-fg)", marginTop: 2 }}>
        {t("storyboard.canvas.characterSection")}
      </div>
      {characters.length === 0 ? (
        <div style={{ fontSize: 11, color: "var(--muted-fg)" }}>
          {t("element.noAvailableCharacters")}
        </div>
      ) : (
        characters.map((character) => (
          <ResourcePickerRow
            key={character.id}
            id={character.id}
            name={character.name}
            visible={!hiddenResourceIds.has(character.id)}
            icon={<User style={{ width: 12, height: 12 }} aria-hidden="true" />}
            onToggle={onToggle}
          />
        ))
      )}

      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-fg)", marginTop: 4 }}>
        {t("storyboard.canvas.sceneSection")}
      </div>
      {scenes.length === 0 ? (
        <div style={{ fontSize: 11, color: "var(--muted-fg)" }}>
          {t("storyboard.canvas.noScenes")}
        </div>
      ) : (
        scenes.map((scene) => (
          <ResourcePickerRow
            key={scene.id}
            id={scene.id}
            name={scene.name}
            visible={!hiddenResourceIds.has(scene.id)}
            icon={<MapPin style={{ width: 12, height: 12 }} aria-hidden="true" />}
            onToggle={onToggle}
          />
        ))
      )}
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
