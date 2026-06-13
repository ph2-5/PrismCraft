import { Settings, Film } from "lucide-react";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import type { StoryBeat, Scene } from "@/domain/schemas";
import { t } from "@/shared/constants";

interface BasicInfoSectionProps {
  beat: StoryBeat;
  scenes: Scene[];
  onUpdateBeat: (updatedBeat: StoryBeat) => void;
  onUpdateField: (
    field: keyof StoryBeat,
    value: StoryBeat[keyof StoryBeat],
  ) => void;
}

export function BasicInfoSection({
  beat,
  scenes,
  onUpdateBeat,
  onUpdateField,
}: BasicInfoSectionProps) {
  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary" />
            {t("beat.basicInfo")}
          </h3>
        </div>
        <div className="space-y-4">
          <div>
            <Label className="text-foreground mb-2 block">
              {t("beat.beatTitle")}
            </Label>
            <Input
              value={beat.title || ""}
              onChange={(e) =>
                onUpdateField("title", e.target.value)
              }
              placeholder={t("beat.beatTitlePlaceholder")}
              className="bg-muted/50 border-border"
            />
          </div>
          <div>
            <Label className="text-foreground mb-2 block">
              {t("beat.sceneSelect")}
            </Label>
            <Select
              value={(beat.sceneId || beat.scene) || ""}
              onValueChange={(value) =>
                onUpdateField("scene", value ?? undefined)
              }
            >
              <SelectTrigger className="bg-muted/50 border-border">
                <SelectValue placeholder={t("beat.sceneSelectPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {scenes.map((scene) => (
                  <SelectItem key={scene.id} value={scene.id}>
                    <div className="flex items-center gap-2">
                      {scene.generatedImage && (
                        <img
                          src={scene.generatedImage}
                          alt={scene.name}
                          className="w-8 h-8 rounded object-cover"
                        />
                      )}
                      <span>{scene.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Label className="text-foreground mb-2 block">
                {t("beat.duration")}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={beat.duration ?? 0}
                  onChange={(e) =>
                    onUpdateField(
                      "duration",
                      parseInt(e.target.value) || 0,
                    )
                  }
                  min={1}
                  className="bg-muted/50 border-border"
                />
                <span className="text-sm text-muted-foreground">
                  {t("beat.durationSeconds")}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Film className="w-5 h-5 text-primary" />
          {t("beat.beatContent")}
        </h3>
        <Textarea
          value={beat.content || beat.description || ""}
          onChange={(e) => {
            const value = e.target.value;
            onUpdateBeat({
              ...beat,
              content: value,
              description: value,
            });
          }}
          placeholder={t("beat.beatContentPlaceholder")}
          rows={9}
          className="bg-muted/50 border-border resize-none"
        />
      </div>
    </>
  );
}
