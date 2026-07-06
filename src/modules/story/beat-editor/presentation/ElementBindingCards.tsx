import { useState } from "react";
import { t } from "@/shared/constants";
import type {
  StoryElement,
  StoryBeat,
  Scene,
  SceneTransition,
} from "@/domain/schemas";
import {
  ElementAvatar,
  ReferenceImageActions,
  RemoveElementButton,
  SceneTransitionList,
  type ElementBinding,
} from "./ElementBindingPanelParts";

interface CharacterElementCardProps {
  element: StoryElement;
  binding: ElementBinding;
  onUpdateElement: (elementId: string, updates: Partial<StoryElement>) => void;
  onUpdateBinding: (elementId: string, field: string, value: string) => void;
  onRemove: (elementId: string) => void;
  onImageUpload: (elementId: string, event: Event) => void;
  onSelectFromAssetLibrary: (elementId: string) => void;
}

export function CharacterElementCard({
  element,
  binding,
  onUpdateElement,
  onUpdateBinding,
  onRemove,
  onImageUpload,
  onSelectFromAssetLibrary,
}: CharacterElementCardProps) {
  const imageUrl = binding.imageUrl || element.bindings?.find((b) => b.isPrimary)?.url;
  return (
    <div className="element-card">
      <ElementAvatar type="character" imageUrl={imageUrl} name={element.name} placeholder="👤" />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <input
            className="input"
            style={{ fontSize: 13, fontWeight: 600, padding: "2px 4px", background: "transparent", border: "none" }}
            value={element.name}
            onChange={(e) => onUpdateElement(element.id, { name: e.target.value })}
          />
          <span className="badge badge-info">{t("element.characterLabel")}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
          <div>
            <label style={{ fontSize: 9, color: "var(--muted-fg)", display: "block" }}>{t("element.roleInShot")}</label>
            <select
              className="select"
              style={{ fontSize: 11, padding: "4px 6px", width: "100%" }}
              value={binding.role || ""}
              onChange={(e) => onUpdateBinding(element.id, "role", e.target.value)}
            >
              <option value="">{t("element.selectRole")}</option>
              <option value="主角">{t("element.protagonist")}</option>
              <option value="配角">{t("element.supporting")}</option>
              <option value="背景">{t("element.background")}</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 9, color: "var(--muted-fg)", display: "block" }}>{t("element.position")}</label>
            <select
              className="select"
              style={{ fontSize: 11, padding: "4px 6px", width: "100%" }}
              value={binding.position || ""}
              onChange={(e) => onUpdateBinding(element.id, "position", e.target.value)}
            >
              <option value="">{t("element.selectPosition")}</option>
              <option value="前景">{t("element.foreground")}</option>
              <option value="中景">{t("element.middleGround")}</option>
              <option value="背景">{t("element.background")}</option>
              <option value="画面中央">{t("element.center")}</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 9, color: "var(--muted-fg)", display: "block" }}>{t("element.action")}</label>
            <input
              className="input"
              style={{ fontSize: 11, padding: "4px 6px" }}
              value={binding.action || ""}
              onChange={(e) => onUpdateBinding(element.id, "action", e.target.value)}
              placeholder={t("element.actionPlaceholder")}
            />
          </div>
          <div>
            <label style={{ fontSize: 9, color: "var(--muted-fg)", display: "block" }}>{t("element.emotion")}</label>
            <select
              className="select"
              style={{ fontSize: 11, padding: "4px 6px", width: "100%" }}
              value={binding.emotion || ""}
              onChange={(e) => onUpdateBinding(element.id, "emotion", e.target.value)}
            >
              <option value="">{t("element.selectEmotion")}</option>
              <option value="坚定">{t("element.determined")}</option>
              <option value="平静">{t("element.calm")}</option>
              <option value="紧张">{t("element.tense")}</option>
              <option value="悲伤">{t("element.sad")}</option>
              <option value="喜悦">{t("element.joyful")}</option>
            </select>
          </div>
        </div>
        <div>
          <label style={{ fontSize: 9, color: "var(--muted-fg)", display: "block" }}>{t("element.supplementaryDesc")}</label>
          <input
            className="input"
            style={{ fontSize: 11, padding: "4px 6px" }}
            value={binding.description || ""}
            onChange={(e) => onUpdateBinding(element.id, "description", e.target.value)}
            placeholder={t("element.supplementaryPlaceholder")}
          />
        </div>
        <ReferenceImageActions
          elementId={element.id}
          onImageUpload={onImageUpload}
          onSelectFromAssetLibrary={onSelectFromAssetLibrary}
        />
        <RemoveElementButton onClick={() => onRemove(element.id)} />
      </div>
    </div>
  );
}

interface SceneElementCardProps {
  element: StoryElement;
  binding: ElementBinding;
  beat: StoryBeat;
  scenes: Scene[];
  onUpdateBinding: (elementId: string, field: string, value: string) => void;
  onRemove: (elementId: string) => void;
  onAddSceneTransition: (targetSceneId: string) => void;
  onRemoveSceneTransition: (targetSceneId: string) => void;
  onUpdateSceneTransition: (targetSceneId: string, updates: Partial<SceneTransition>) => void;
}

export function SceneElementCard({
  element,
  binding,
  beat,
  scenes,
  onUpdateBinding,
  onRemove,
  onAddSceneTransition,
  onRemoveSceneTransition,
  onUpdateSceneTransition,
}: SceneElementCardProps) {
  const [showSceneTransitionMenu, setShowSceneTransitionMenu] = useState(false);
  const scene = scenes.find((s) => s.name === element.name);
  const imageUrl = binding.imageUrl || scene?.scenePath || scene?.generatedImage;
  const isMainScene = scene && beat.sceneId === scene.id;
  const sceneTransitions = beat.sceneTransitions || [];

  return (
    <div className="element-card">
      <ElementAvatar type="scene" imageUrl={imageUrl} name={element.name} placeholder="🏙" />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{element.name}</span>
          <span className="badge badge-success">{t("element.sceneLabel")}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
          <div>
            <label style={{ fontSize: 9, color: "var(--muted-fg)", display: "block" }}>{t("element.sceneRole")}</label>
            <select
              className="select"
              style={{ fontSize: 11, padding: "4px 6px", width: "100%" }}
              value={binding.role || ""}
              onChange={(e) => onUpdateBinding(element.id, "role", e.target.value)}
            >
              <option value="">{t("element.selectSceneRole")}</option>
              <option value="主场景">{t("element.mainScene")}</option>
              <option value="背景">{t("element.background")}</option>
              <option value="过渡">{t("element.transition")}</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 9, color: "var(--muted-fg)", display: "block" }}>{t("element.time")}</label>
            <select
              className="select"
              style={{ fontSize: 11, padding: "4px 6px", width: "100%" }}
              value={(binding as Record<string, string>).time || ""}
              onChange={(e) => onUpdateBinding(element.id, "time", e.target.value)}
            >
              <option value="">{t("element.selectTime")}</option>
              <option value="清晨">{t("element.morning")}</option>
              <option value="白天">{t("element.daytime")}</option>
              <option value="傍晚">{t("element.evening")}</option>
              <option value="夜晚">{t("element.night")}</option>
            </select>
          </div>
        </div>
        <div>
          <label style={{ fontSize: 9, color: "var(--muted-fg)", display: "block" }}>{t("element.supplementaryDesc")}</label>
          <input
            className="input"
            style={{ fontSize: 11, padding: "4px 6px" }}
            value={binding.description || ""}
            onChange={(e) => onUpdateBinding(element.id, "description", e.target.value)}
            placeholder={t("element.supplementaryPlaceholder")}
          />
        </div>
        {isMainScene && (
          <SceneTransitionList
            sceneId={scene.id}
            scenes={scenes}
            sceneTransitions={sceneTransitions}
            showMenu={showSceneTransitionMenu}
            onShowMenu={setShowSceneTransitionMenu}
            onAdd={onAddSceneTransition}
            onRemove={onRemoveSceneTransition}
            onUpdate={onUpdateSceneTransition}
          />
        )}
        <RemoveElementButton onClick={() => onRemove(element.id)} />
      </div>
    </div>
  );
}

interface PropElementCardProps {
  element: StoryElement;
  binding: ElementBinding;
  onUpdateElement: (elementId: string, updates: Partial<StoryElement>) => void;
  onUpdateBinding: (elementId: string, field: string, value: string) => void;
  onRemove: (elementId: string) => void;
  onImageUpload: (elementId: string, event: Event) => void;
  onSelectFromAssetLibrary: (elementId: string) => void;
}

export function PropElementCard({
  element,
  binding,
  onUpdateElement,
  onUpdateBinding,
  onRemove,
  onImageUpload,
  onSelectFromAssetLibrary,
}: PropElementCardProps) {
  const imageUrl = binding.imageUrl || element.bindings?.find((b) => b.isPrimary)?.url;
  return (
    <div className="element-card">
      <ElementAvatar type={element.type} imageUrl={imageUrl} name={element.name} placeholder="📦" />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <input
            className="input"
            style={{ fontSize: 13, fontWeight: 600, padding: "2px 4px", background: "transparent", border: "none" }}
            value={element.name}
            onChange={(e) => onUpdateElement(element.id, { name: e.target.value })}
          />
          <span className="badge">
            {element.type === "prop" ? t("element.propLabel") : t("element.effectLabel")}
          </span>
        </div>
        <div>
          <label style={{ fontSize: 9, color: "var(--muted-fg)", display: "block" }}>{t("element.supplementaryDesc")}</label>
          <input
            className="input"
            style={{ fontSize: 11, padding: "4px 6px" }}
            value={binding.description || ""}
            onChange={(e) => onUpdateBinding(element.id, "description", e.target.value)}
            placeholder={t("element.supplementaryPlaceholder")}
          />
        </div>
        <ReferenceImageActions
          elementId={element.id}
          onImageUpload={onImageUpload}
          onSelectFromAssetLibrary={onSelectFromAssetLibrary}
        />
        <RemoveElementButton onClick={() => onRemove(element.id)} />
      </div>
    </div>
  );
}
