"use client";

import { Camera } from "lucide-react";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import type { StoryBeat, ShotInstructionTemplate } from "@/domain/schemas";
import {
  SHOT_SIZE_OPTIONS,
  CAMERA_MOVEMENT_OPTIONS,
  CAMERA_ANGLE_OPTIONS,
} from "@/modules/shot";

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
        镜头指令
      </h3>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label className="text-foreground mb-2 block">景别</Label>
          <Select
            value={currentInstruction.shotSize}
            onValueChange={(value) =>
              handleUpdateShotInstruction({
                shotSize: value as ShotInstructionTemplate["shotSize"],
              })
            }
          >
            <SelectTrigger className="bg-muted/50 border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SHOT_SIZE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-foreground mb-2 block">运镜</Label>
          <Select
            value={currentInstruction.cameraMovement}
            onValueChange={(value) =>
              handleUpdateShotInstruction({
                cameraMovement:
                  value as ShotInstructionTemplate["cameraMovement"],
              })
            }
          >
            <SelectTrigger className="bg-muted/50 border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CAMERA_MOVEMENT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-foreground mb-2 block">角度</Label>
          <Select
            value={currentInstruction.cameraAngle}
            onValueChange={(value) =>
              handleUpdateShotInstruction({
                cameraAngle: value as ShotInstructionTemplate["cameraAngle"],
              })
            }
          >
            <SelectTrigger className="bg-muted/50 border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CAMERA_ANGLE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
