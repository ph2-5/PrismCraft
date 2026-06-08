import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import type { Scene } from "@/domain/schemas";
import { t } from "@/shared/constants";
import { BasicTab } from "./BasicTab";
import { AtmosphereTab } from "./AtmosphereTab";
import { CameraTab } from "./CameraTab";

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
        <TabsTrigger value="basic">{t("scene.tabBasic")}</TabsTrigger>
        <TabsTrigger value="atmosphere">{t("scene.tabAtmosphere")}</TabsTrigger>
        <TabsTrigger value="camera">{t("scene.tabCamera")}</TabsTrigger>
      </TabsList>

      <TabsContent value="basic" className="space-y-4">
        <BasicTab currentScene={currentScene} setCurrentScene={setCurrentScene} />
      </TabsContent>

      <TabsContent value="atmosphere" className="space-y-6">
        <AtmosphereTab
          currentScene={currentScene}
          setCurrentScene={setCurrentScene}
          customElement={customElement}
          setCustomElement={setCustomElement}
          customColor={customColor}
          setCustomColor={setCustomColor}
          addItem={addItem}
          removeItem={removeItem}
        />
      </TabsContent>

      <TabsContent value="camera" className="space-y-4">
        <CameraTab currentScene={currentScene} setCurrentScene={setCurrentScene} />
      </TabsContent>
    </Tabs>
  );
}
