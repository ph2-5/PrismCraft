import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Badge } from "@/shared/ui/badge";
import type { Scene } from "@/domain/schemas";
import { t } from "@/shared/constants";
import {
  angleSuggestions,
  distanceSuggestions,
  movementSuggestions,
} from "@/modules/scene";

interface CameraTabProps {
  currentScene: Scene;
  setCurrentScene: (update: Scene | ((prev: Scene) => Scene), shouldMarkDirty?: boolean) => void;
}

export function CameraTab({ currentScene, setCurrentScene }: CameraTabProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="cameraAngle">{t("scene.cameraAngle")}</Label>
        <Input
          id="cameraAngle"
          data-testid="scene-camera-angle-input"
          list="angle-suggestions"
          placeholder={t("scene.cameraAnglePlaceholder")}
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
        <Label htmlFor="cameraDistance">{t("scene.cameraDistance")}</Label>
        <Input
          id="cameraDistance"
          list="distance-suggestions"
          placeholder={t("scene.cameraDistancePlaceholder")}
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
        <Label htmlFor="cameraMovement">{t("scene.cameraMovement")}</Label>
        <Input
          id="cameraMovement"
          list="movement-suggestions"
          placeholder={t("scene.cameraMovementPlaceholder")}
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
    </div>
  );
}
