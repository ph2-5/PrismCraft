import { Settings, Film } from "lucide-react";
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
            <label className="text-foreground mb-2 block">
              {t("beat.beatTitle")}
            </label>
            <input
              className="input bg-muted/50 border-border"
              data-testid="beat-title-input"
              value={beat.title || ""}
              onChange={(e) =>
                onUpdateField("title", e.target.value)
              }
              placeholder={t("beat.beatTitlePlaceholder")}
            />
          </div>
          <div>
            <label className="text-foreground mb-2 block">
              {t("beat.sceneSelect")}
            </label>
            <select
              className="select bg-muted/50 border-border"
              value={beat.sceneId || ""}
              onChange={(e) =>
                onUpdateField("sceneId", e.target.value || undefined)
              }
            >
              <option value="">{t("beat.sceneSelectPlaceholder")}</option>
              {scenes.map((scene) => (
                <option key={scene.id} value={scene.id}>
                  {scene.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="text-foreground mb-2 block">
                {t("beat.duration")}
              </label>
              <div className="flex items-center gap-2">
                <input
                  className="input bg-muted/50 border-border"
                  type="number"
                  value={beat.duration ?? 0}
                  onChange={(e) =>
                    onUpdateField(
                      "duration",
                      parseInt(e.target.value) || 0,
                    )
                  }
                  min={1}
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
        <textarea
          className="textarea bg-muted/50 border-border resize-none"
          data-testid="beat-content-textarea"
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
        />
      </div>
    </>
  );
}
