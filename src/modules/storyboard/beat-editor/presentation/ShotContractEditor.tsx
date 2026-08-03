/**
 * 镜头契约表格编辑器（P3.2）。
 *
 * 批量编辑所有分镜的镜头参数（景别/运镜/角度/灯光/时长），
 * 编辑即时写回 beat（onUpdateBeat），实时影响后续画面生成。
 *
 * 数据模型：
 * - 景别/运镜/角度/灯光 → beat.shotInstruction
 * - 时长 → beat.duration
 *
 * 向后兼容：无 shotInstruction 的 beat 以默认值渲染，编辑时创建。
 */

import { useState } from "react";
import { Table2 } from "lucide-react";
import type { StoryBeat, ShotInstructionTemplate } from "@/domain/schemas";
import {
  SHOT_SIZE_OPTIONS,
  CAMERA_MOVEMENT_OPTIONS,
  CAMERA_ANGLE_OPTIONS,
  SHOT_LIGHTING_OPTIONS,
} from "@/domain/utils";
import { t } from "@/shared/constants";

export interface ShotContractEditorProps {
  beats: StoryBeat[];
  onUpdateBeat: (beatId: string, updates: Partial<StoryBeat>) => void;
}

const DEFAULT_SHOT_INSTRUCTION: ShotInstructionTemplate = {
  shotSize: "medium" as ShotInstructionTemplate["shotSize"],
  cameraMovement: "static" as ShotInstructionTemplate["cameraMovement"],
  cameraAngle: "eye_level" as ShotInstructionTemplate["cameraAngle"],
};

/** 从 beat 读取当前镜头指令（无则默认值） */
function resolveInstruction(beat: StoryBeat): ShotInstructionTemplate {
  return beat.shotInstruction || DEFAULT_SHOT_INSTRUCTION;
}

export function ShotContractEditor({ beats, onUpdateBeat }: ShotContractEditorProps) {
  const [showEditor, setShowEditor] = useState(false);

  const handleUpdate = (beatId: string, partial: Partial<ShotInstructionTemplate>, duration?: number) => {
    const beat = beats.find((b) => b.id === beatId);
    if (!beat) return;
    const instruction = resolveInstruction(beat);
    const updates: Partial<StoryBeat> = {
      shotInstruction: { ...instruction, ...partial },
    };
    if (duration !== undefined) {
      updates.duration = duration;
    }
    onUpdateBeat(beatId, updates);
  };

  return (
    <div className="rounded-lg border border-border bg-background">
      <button
        type="button"
        onClick={() => setShowEditor((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Table2 className="h-4 w-4 text-primary" />
          {t("shotContractEditor.title")}
        </span>
        <span className="text-xs text-muted-foreground">{t("shotContractEditor.subtitle")}</span>
      </button>

      {showEditor && (
        <div className="border-t border-border overflow-x-auto">
          {beats.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              {t("shotContractEditor.empty")}
            </p>
          ) : (
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">{t("shotContractEditor.beat")}</th>
                  <th className="px-2 py-2 font-medium">{t("beat.shotSize")}</th>
                  <th className="px-2 py-2 font-medium">{t("beat.cameraMovement")}</th>
                  <th className="px-2 py-2 font-medium">{t("beat.angle")}</th>
                  <th className="px-2 py-2 font-medium">{t("beat.lighting")}</th>
                  <th className="px-2 py-2 font-medium">{t("shotContractEditor.duration")}</th>
                </tr>
              </thead>
              <tbody>
                {beats.map((beat) => {
                  const instruction = resolveInstruction(beat);
                  return (
                    <tr key={beat.id} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-2 text-foreground">
                        <span className="mr-1 text-xs text-muted-foreground">{beat.sequence + 1}.</span>
                        {beat.title || beat.content?.slice(0, 12) || "未命名"}
                      </td>
                      <td className="px-2 py-2">
                        <select
                          className="select h-8 bg-muted/50 border-border text-xs"
                          value={instruction.shotSize}
                          onChange={(e) =>
                            handleUpdate(beat.id, {
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
                      </td>
                      <td className="px-2 py-2">
                        <select
                          className="select h-8 bg-muted/50 border-border text-xs"
                          value={instruction.cameraMovement}
                          onChange={(e) =>
                            handleUpdate(beat.id, {
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
                      </td>
                      <td className="px-2 py-2">
                        <select
                          className="select h-8 bg-muted/50 border-border text-xs"
                          value={instruction.cameraAngle}
                          onChange={(e) =>
                            handleUpdate(beat.id, {
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
                      </td>
                      <td className="px-2 py-2">
                        <select
                          className="select h-8 bg-muted/50 border-border text-xs"
                          value={instruction.lighting ?? "natural"}
                          onChange={(e) =>
                            handleUpdate(beat.id, {
                              lighting: e.target.value as NonNullable<
                                ShotInstructionTemplate["lighting"]
                              >,
                            })
                          }
                        >
                          {SHOT_LIGHTING_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {t(opt.labelKey)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min={1}
                          max={30}
                          className="input h-8 w-20 bg-muted/50 border-border text-xs"
                          value={beat.duration ?? 5}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            if (Number.isFinite(v) && v >= 1 && v <= 30) {
                              handleUpdate(beat.id, {}, v);
                            }
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
