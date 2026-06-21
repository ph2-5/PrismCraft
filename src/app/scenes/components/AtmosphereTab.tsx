import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import type { Scene } from "@/domain/schemas";
import { X } from "lucide-react";
import { t } from "@/shared/constants";
import {
  timeSuggestions,
  weatherSuggestions,
  moodSuggestions,
  elementSuggestions,
  colorSuggestions,
} from "@/modules/scene";

interface AtmosphereTabProps {
  currentScene: Scene;
  setCurrentScene: (update: Scene | ((prev: Scene) => Scene), shouldMarkDirty?: boolean) => void;
  customElement: string;
  setCustomElement: (value: string) => void;
  customColor: string;
  setCustomColor: (value: string) => void;
  addItem: (field: "elements" | "colors", value: string) => void;
  removeItem: (field: "elements" | "colors", value: string) => void;
}

export function AtmosphereTab({
  currentScene,
  setCurrentScene,
  customElement,
  setCustomElement,
  customColor,
  setCustomColor,
  addItem,
  removeItem,
}: AtmosphereTabProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="timeOfDay">{t("scene.timeOfDay")}</Label>
          <Input
            id="timeOfDay"
            data-testid="scene-time-of-day-input"
            list="time-suggestions"
            placeholder={t("scene.timeOfDayPlaceholder")}
            value={currentScene.timeOfDay}
            onChange={(e) =>
              setCurrentScene((prev) => ({
                ...prev,
                timeOfDay: e.target.value,
              }), true)
            }
          />
          <datalist id="time-suggestions">
            {timeSuggestions.map((suggestion) => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>
        </div>
        <div className="space-y-2">
          <Label htmlFor="weather">{t("scene.weather")}</Label>
          <Input
            id="weather"
            data-testid="scene-weather-input"
            list="weather-suggestions"
            placeholder={t("scene.weatherPlaceholder")}
            value={currentScene.weather}
            onChange={(e) =>
              setCurrentScene((prev) => ({
                ...prev,
                weather: e.target.value,
              }), true)
            }
          />
          <datalist id="weather-suggestions">
            {weatherSuggestions.map((w) => (
              <option key={w} value={w} />
            ))}
          </datalist>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="mood">{t("scene.mood")}</Label>
        <Input
          id="mood"
          data-testid="scene-mood-input"
          list="mood-suggestions"
          placeholder={t("scene.moodPlaceholder")}
          value={currentScene.mood}
          onChange={(e) =>
            setCurrentScene((prev) => ({
              ...prev,
              mood: e.target.value,
            }), true)
          }
        />
        <datalist id="mood-suggestions">
          {moodSuggestions.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        <div className="flex flex-wrap gap-1 mt-2">
          {moodSuggestions.slice(0, 10).map((mood) => (
            <Badge
              key={mood}
              variant={
                currentScene.mood === mood ? "default" : "outline"
              }
              className="cursor-pointer text-xs"
              onClick={() =>
                setCurrentScene((prev) => ({ ...prev, mood }), true)
              }
            >
              {mood}
            </Badge>
          ))}
          <span className="text-xs text-muted-foreground self-center">
            {t("scene.etc")}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        <Label>{t("scene.elements")}</Label>
        <div className="flex gap-2">
          <Input
            list="element-suggestions"
            placeholder={t("scene.addElementPlaceholder")}
            value={customElement}
            onChange={(e) => setCustomElement(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addItem("elements", customElement);
              }
            }}
            className="flex-1"
          />
          <Button
            onClick={() => addItem("elements", customElement)}
          >
            {t("common.add")}
          </Button>
        </div>
        <datalist id="element-suggestions">
          {elementSuggestions.map((e) => (
            <option key={e} value={e} />
          ))}
        </datalist>
        {currentScene.elements.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {currentScene.elements.map((element) => (
              <Badge
                key={element}
                className="cursor-pointer gap-1"
                onClick={() => removeItem("elements", element)}
              >
                {element}
                <X className="w-3 h-3" />
              </Badge>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-1 mt-2">
          {elementSuggestions.slice(0, 12).map((element) => (
            <Badge
              key={element}
              variant={
                currentScene.elements.includes(element)
                  ? "default"
                  : "outline"
              }
              className="cursor-pointer text-xs opacity-70 hover:opacity-100"
              onClick={() => addItem("elements", element)}
            >
              {element}
            </Badge>
          ))}
          <span className="text-xs text-muted-foreground self-center">
            {t("scene.etc")}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        <Label>{t("scene.colorStyle")}</Label>
        <div className="flex gap-2">
          <Input
            list="color-suggestions"
            placeholder={t("scene.addColorPlaceholder")}
            value={customColor}
            onChange={(e) => setCustomColor(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addItem("colors", customColor);
              }
            }}
            className="flex-1"
          />
          <Button onClick={() => addItem("colors", customColor)}>
            {t("common.add")}
          </Button>
        </div>
        <datalist id="color-suggestions">
          {colorSuggestions.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        {currentScene.colors.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {currentScene.colors.map((color) => (
              <Badge
                key={color}
                className="cursor-pointer gap-1"
                onClick={() => removeItem("colors", color)}
              >
                {color}
                <X className="w-3 h-3" />
              </Badge>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-1 mt-2">
          {colorSuggestions.map((color) => (
            <Badge
              key={color}
              variant={
                currentScene.colors.includes(color)
                  ? "default"
                  : "outline"
              }
              className="cursor-pointer text-xs opacity-70 hover:opacity-100"
              onClick={() => addItem("colors", color)}
            >
              {color}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );
}
