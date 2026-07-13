import { Camera } from "lucide-react";
import type { StoryBeat, ShotInstructionTemplate } from "@/domain/schemas";
import {
  SHOT_SIZE_OPTIONS,
  CAMERA_MOVEMENT_OPTIONS,
  CAMERA_ANGLE_OPTIONS,
} from "@/modules/shot";
import { t } from "@/shared/constants";

interface ShotInstructionSectionProps {
  beat: StoryBeat;
  onUpdateField: (
    field: keyof StoryBeat,
    value: StoryBeat[keyof StoryBeat],
  ) => void;
}

const DEFAULT_SHOT_INSTRUCTION: ShotInstructionTemplate = {
  shotSize: "medium" as ShotInstructionTemplate["shotSize"],
  cameraMovement: "static" as ShotInstructionTemplate["cameraMovement"],
  cameraAngle: "eye_level" as ShotInstructionTemplate["cameraAngle"],
};

export function ShotInstructionSection({
  beat,
  onUpdateField,
}: ShotInstructionSectionProps) {
  const currentInstruction = beat.shotInstruction || DEFAULT_SHOT_INSTRUCTION;

  const handleUpdateShotInstruction = (
    partial: Partial<ShotInstructionTemplate>,
  ) => {
    onUpdateField("shotInstruction", {
      ...currentInstruction,
      ...partial,
    });
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
        <Camera className="w-5 h-5 text-primary" />
        {t("beat.shotInstruction")}
      </h3>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="text-foreground mb-2 block">{t("beat.shotSize")}</label>
          <select
            className="select bg-muted/50 border-border"
            value={currentInstruction.shotSize}
            onChange={(e) =>
              handleUpdateShotInstruction({
                shotSize: e.target.value as ShotInstructionTemplate["shotSize"],
              })
            }
          >
            {SHOT_SIZE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {t(opt.labelKey)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-foreground mb-2 block">{t("beat.cameraMovement")}</label>
          <select
            className="select bg-muted/50 border-border"
            value={currentInstruction.cameraMovement}
            onChange={(e) =>
              handleUpdateShotInstruction({
                cameraMovement:
                  e.target.value as ShotInstructionTemplate["cameraMovement"],
              })
            }
          >
            {CAMERA_MOVEMENT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {t(opt.labelKey)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-foreground mb-2 block">{t("beat.angle")}</label>
          <select
            className="select bg-muted/50 border-border"
            value={currentInstruction.cameraAngle}
            onChange={(e) =>
              handleUpdateShotInstruction({
                cameraAngle: e.target.value as ShotInstructionTemplate["cameraAngle"],
              })
            }
          >
            {CAMERA_ANGLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {t(opt.labelKey)}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
