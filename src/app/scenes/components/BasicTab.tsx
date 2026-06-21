import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { Badge } from "@/shared/ui/badge";
import type { Scene } from "@/domain/schemas";
import { t } from "@/shared/constants";
import { typeSuggestions } from "@/modules/scene";

interface BasicTabProps {
  currentScene: Scene;
  setCurrentScene: (update: Scene | ((prev: Scene) => Scene), shouldMarkDirty?: boolean) => void;
}

export function BasicTab({ currentScene, setCurrentScene }: BasicTabProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">{t("scene.name")}</Label>
        <Input
          id="name"
          data-testid="scene-name-input"
          placeholder={t("scene.namePlaceholder")}
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
        <Label htmlFor="type">{t("scene.typeLabel")}</Label>
        <Input
          id="type"
          data-testid="scene-type-input"
          list="type-suggestions"
          placeholder={t("scene.typePlaceholder")}
          value={currentScene.type}
          onChange={(e) =>
            setCurrentScene((prev) => ({
              ...prev,
              type: e.target.value,
            }), true)
          }
        />
        <datalist id="type-suggestions">
          {typeSuggestions.map((suggestion) => (
            <option key={suggestion} value={suggestion} />
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
            {t("scene.etc")}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">{t("scene.description")}</Label>
        <Textarea
          id="description"
          placeholder={t("scene.descriptionPlaceholder")}
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
    </div>
  );
}
