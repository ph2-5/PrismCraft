"use client";

import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import type { Scene } from "@/domain/schemas";
import { X } from "lucide-react";
import {
  typeSuggestions,
  timeSuggestions,
  weatherSuggestions,
  moodSuggestions,
  elementSuggestions,
  colorSuggestions,
  angleSuggestions,
  distanceSuggestions,
  movementSuggestions,
} from "@/modules/scene";

interface SceneEditorTabsProps {
  currentScene: Scene;
  setCurrentScene: (update: Scene | ((prev: Scene) => Scene), shouldMarkDirty?: boolean) => void;
  customElement: string;
  setCustomElement: (value: string) => void;
  customColor: string;
  setCustomColor: (value: string) => void;
  addItem: (field: "elements" | "colors", value: string) => void;
  removeItem: (field: "elements" | "colors", value: string) => void;
}

export function SceneEditorTabs({
  currentScene,
  setCurrentScene,
  customElement,
  setCustomElement,
  customColor,
  setCustomColor,
  addItem,
  removeItem,
}: SceneEditorTabsProps) {
  return (
    <Tabs defaultValue="basic" className="space-y-6">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="basic">基础设定</TabsTrigger>
        <TabsTrigger value="atmosphere">氛围视觉</TabsTrigger>
        <TabsTrigger value="camera">镜头设置</TabsTrigger>
      </TabsList>

      <TabsContent value="basic" className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">场景名称</Label>
          <Input
            id="name"
            placeholder="输入场景名称..."
            value={currentScene.name}
            onChange={(e) =>
              setCurrentScene((prev) => ({
                ...prev,
                name: e.target.value,
              }), true)
            }
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="type">场景类型（自由输入）</Label>
          <Input
            id="type"
            list="type-suggestions"
            placeholder="例如：赛博朋克街区、魔法森林、太空站..."
            value={currentScene.type}
            onChange={(e) =>
              setCurrentScene((prev) => ({
                ...prev,
                type: e.target.value,
              }), true)
            }
          />
          <datalist id="type-suggestions">
            {typeSuggestions.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          <div className="flex flex-wrap gap-1 mt-2">
            {typeSuggestions.slice(0, 8).map((type) => (
              <Badge
                key={type}
                variant={
                  currentScene.type === type ? "default" : "outline"
                }
                className="cursor-pointer text-xs"
                onClick={() =>
                  setCurrentScene((prev) => ({ ...prev, type }), true)
                }
              >
                {type}
              </Badge>
            ))}
            <span className="text-xs text-muted-foreground self-center">
              ...等
            </span>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">场景描述</Label>
          <Textarea
            id="description"
            placeholder="详细描述场景的布局、特色、重要元素...自由发挥"
            rows={4}
            value={currentScene.description}
            onChange={(e) =>
              setCurrentScene((prev) => ({
                ...prev,
                description: e.target.value,
              }), true)
            }
          />
        </div>
      </TabsContent>

      <TabsContent value="atmosphere" className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="timeOfDay">时间段</Label>
            <Input
              id="timeOfDay"
              list="time-suggestions"
              placeholder="例如：黄昏、午夜、极光之夜..."
              value={currentScene.timeOfDay}
              onChange={(e) =>
                setCurrentScene((prev) => ({
                  ...prev,
                  timeOfDay: e.target.value,
                }), true)
              }
            />
            <datalist id="time-suggestions">
              {timeSuggestions.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>
          <div className="space-y-2">
            <Label htmlFor="weather">天气/环境</Label>
            <Input
              id="weather"
              list="weather-suggestions"
              placeholder="例如：雷雨、极光、沙尘暴..."
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
          <Label htmlFor="mood">场景氛围</Label>
          <Input
            id="mood"
            list="mood-suggestions"
            placeholder="例如：神秘、史诗、压抑..."
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
              ...等
            </span>
          </div>
        </div>

        <div className="space-y-2">
          <Label>场景元素</Label>
          <div className="flex gap-2">
            <Input
              list="element-suggestions"
              placeholder="输入元素，按回车添加..."
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
              添加
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
              ...等
            </span>
          </div>
        </div>

        <div className="space-y-2">
          <Label>色调风格</Label>
          <div className="flex gap-2">
            <Input
              list="color-suggestions"
              placeholder="输入色调，按回车添加..."
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
              添加
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
      </TabsContent>

      <TabsContent value="camera" className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="cameraAngle">镜头角度</Label>
          <Input
            id="cameraAngle"
            list="angle-suggestions"
            placeholder="例如：鸟瞰、POV第一人称、过肩镜头..."
            value={currentScene.camera?.angle || ""}
            onChange={(e) =>
              setCurrentScene((prev) => ({
                ...prev,
                camera: { ...prev.camera, angle: e.target.value },
              }), true)
            }
          />
          <datalist id="angle-suggestions">
            {angleSuggestions.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
          <div className="flex flex-wrap gap-1 mt-2">
            {angleSuggestions.map((angle) => (
              <Badge
                key={angle}
                variant={
                  currentScene.camera?.angle === angle
                    ? "default"
                    : "outline"
                }
                className="cursor-pointer text-xs"
                onClick={() =>
                  setCurrentScene((prev) => ({
                    ...prev,
                    camera: { ...prev.camera, angle },
                  }), true)
                }
              >
                {angle}
              </Badge>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="cameraDistance">镜头距离</Label>
          <Input
            id="cameraDistance"
            list="distance-suggestions"
            placeholder="例如：特写、全景..."
            value={currentScene.camera?.distance || ""}
            onChange={(e) =>
              setCurrentScene((prev) => ({
                ...prev,
                camera: {
                  ...prev.camera,
                  distance: e.target.value,
                },
              }), true)
            }
          />
          <datalist id="distance-suggestions">
            {distanceSuggestions.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
          <div className="flex flex-wrap gap-1 mt-2">
            {distanceSuggestions.map((distance) => (
              <Badge
                key={distance}
                variant={
                  currentScene.camera?.distance === distance
                    ? "default"
                    : "outline"
                }
                className="cursor-pointer text-xs"
                onClick={() =>
                  setCurrentScene((prev) => ({
                    ...prev,
                    camera: { ...prev.camera, distance },
                  }), true)
                }
              >
                {distance}
              </Badge>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="cameraMovement">镜头运动</Label>
          <Input
            id="cameraMovement"
            list="movement-suggestions"
            placeholder="例如：环绕、跟随、手持晃动..."
            value={currentScene.camera?.movement}
            onChange={(e) =>
              setCurrentScene((prev) => ({
                ...prev,
                camera: {
                  ...prev.camera,
                  movement: e.target.value,
                },
              }), true)
            }
          />
          <datalist id="movement-suggestions">
            {movementSuggestions.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          <div className="flex flex-wrap gap-1 mt-2">
            {movementSuggestions.map((movement) => (
              <Badge
                key={movement}
                variant={
                  currentScene.camera?.movement === movement
                    ? "default"
                    : "outline"
                }
                className="cursor-pointer text-xs"
                onClick={() =>
                  setCurrentScene((prev) => ({
                    ...prev,
                    camera: { ...prev.camera, movement },
                  }), true)
                }
              >
                {movement}
              </Badge>
            ))}
          </div>
        </div>
      </TabsContent>
    </Tabs>
  );
}
