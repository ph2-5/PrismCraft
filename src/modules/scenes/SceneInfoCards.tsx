import { X } from "lucide-react";
import { t } from "@/shared/constants/messages";
import {
  typeSuggestions,
  timeSuggestions,
  weatherSuggestions,
} from "@/modules/scene";
import type { Scene } from "@/domain/schemas";
import type { SetCurrentScene } from "./SceneEditorParts";

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
