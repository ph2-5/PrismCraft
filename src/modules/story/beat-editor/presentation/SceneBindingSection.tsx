import { Plus, Trash2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/shared/ui/select";
import { resolveImageUrl } from "@/shared/utils/image-url";
import { t } from "@/shared/constants";
import { Badge } from "@/shared/ui/badge";
import type { Scene, StoryBeat } from "@/domain/schemas";

interface SceneBindingSectionProps {
  scenes: Scene[];
  beat: StoryBeat;
  onUpdateBeat: (updatedBeat: StoryBeat) => void;
}

export function SceneBindingSection({
  scenes,
  beat,
  onUpdateBeat,
}: SceneBindingSectionProps) {
  const boundSceneId = beat.sceneId || beat.scene;
  const boundScene = scenes.find((s) => s.id === boundSceneId);
  const availableScenes = scenes.filter((s) => s.id !== boundSceneId);

  if (scenes.length === 0) return null;

  return (
    <div className="space-y-2">
      <Select
        onValueChange={(value) => {
          const val = typeof value === "string" ? value : String(value ?? "");
          if (!val) return;
          onUpdateBeat({ ...beat, sceneId: val } as StoryBeat);
        }}
        disabled={availableScenes.length === 0}
      >
        <SelectTrigger className="flex-1 bg-slate-800 border-slate-700">
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            <span>
              {availableScenes.length > 0
                ? t("element.addScene")
                : t("element.noAvailableScenes")}
            </span>
          </div>
        </SelectTrigger>
        {availableScenes.length > 0 && (
          <SelectContent className="bg-slate-800 border-slate-700">
            {availableScenes.map((scene) => (
              <SelectItem key={scene.id} value={scene.id}>
                <div className="flex items-center gap-2">
                  {(scene.generatedImage || scene.imageUrl) && (
                    <img
                      src={
                        resolveImageUrl(
                          scene.generatedImage || scene.imageUrl || "",
                        ) || ""
                      }
                      alt={scene.name}
                      className="w-6 h-6 rounded object-cover"
                    />
                  )}
                  <span>{scene.name}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        )}
      </Select>

      {boundScene && (
        <div className="flex items-start gap-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
          {(boundScene.generatedImage || boundScene.imageUrl) && (
            <img
              src={
                resolveImageUrl(
                  boundScene.generatedImage || boundScene.imageUrl || "",
                ) || ""
              }
              alt={boundScene.name}
              className="w-16 h-16 rounded object-cover border border-slate-600"
            />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Badge className="bg-green-500">
                {t("element.sceneLabel")}
              </Badge>
              <span className="text-sm font-medium text-white">
                {boundScene.name}
              </span>
            </div>
            {boundScene.description && (
              <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                {boundScene.description}
              </p>
            )}
          </div>
          <button
            onClick={() =>
              onUpdateBeat({
                ...beat,
                sceneId: undefined,
              } as StoryBeat)
            }
            className="text-slate-400 hover:text-red-400 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
