import type { ShotInstructionTemplate } from "@/domain/schemas";

export const SHOT_SIZE_OPTIONS: Array<{
  value: ShotInstructionTemplate["shotSize"];
  label: string; // 兼容 prompt 构造（保留中文，用于 AI prompt）
  labelKey: string; // UI 显示用 i18n key
  description: string; // 兼容 prompt 构造（保留中文，用于 AI prompt）
  descKey: string; // UI 显示用 i18n key
  keyword: string;
}> = [
  {
    value: "extreme_close",
    label: "特写",
    labelKey: "shotOption.size.extreme-close.label",
    description: "极度放大的局部画面，强调细节",
    descKey: "shotOption.size.extreme-close.desc",
    keyword: "extreme close-up shot",
  },
  {
    value: "close",
    label: "近景",
    labelKey: "shotOption.size.close.label",
    description: "人物胸部以上的画面，突出表情",
    descKey: "shotOption.size.close.desc",
    keyword: "close-up shot",
  },
  {
    value: "medium",
    label: "中景",
    labelKey: "shotOption.size.medium.label",
    description: "人物腰部以上的画面，展示动作",
    descKey: "shotOption.size.medium.desc",
    keyword: "medium shot",
  },
  {
    value: "wide",
    label: "全景",
    labelKey: "shotOption.size.wide.label",
    description: "人物全身及周围环境的画面",
    descKey: "shotOption.size.wide.desc",
    keyword: "wide shot",
  },
  {
    value: "extreme_wide",
    label: "远景",
    labelKey: "shotOption.size.extreme-wide.label",
    description: "大范围场景画面，强调环境",
    descKey: "shotOption.size.extreme-wide.desc",
    keyword: "extreme wide shot, establishing shot",
  },
];

export const CAMERA_MOVEMENT_OPTIONS: Array<{
  value: ShotInstructionTemplate["cameraMovement"];
  label: string; // 兼容 prompt 构造（保留中文，用于 AI prompt）
  labelKey: string; // UI 显示用 i18n key
  description: string; // 兼容 prompt 构造（保留中文，用于 AI prompt）
  descKey: string; // UI 显示用 i18n key
  keyword: string;
}> = [
  {
    value: "static",
    label: "固定",
    labelKey: "shotOption.movement.static.label",
    description: "镜头不动，画面稳定",
    descKey: "shotOption.movement.static.desc",
    keyword: "static camera, fixed shot",
  },
  {
    value: "push",
    label: "推",
    labelKey: "shotOption.movement.push.label",
    description: "镜头向主体推进，放大画面",
    descKey: "shotOption.movement.push.desc",
    keyword: "push in, zoom in, dolly in",
  },
  {
    value: "pull",
    label: "拉",
    labelKey: "shotOption.movement.pull.label",
    description: "镜头远离主体，缩小画面",
    descKey: "shotOption.movement.pull.desc",
    keyword: "pull out, zoom out, dolly out",
  },
  {
    value: "pan",
    label: "摇",
    labelKey: "shotOption.movement.pan.label",
    description: "镜头左右或上下旋转",
    descKey: "shotOption.movement.pan.desc",
    keyword: "pan shot, camera pan",
  },
  {
    value: "orbit",
    label: "环绕",
    labelKey: "shotOption.movement.orbit.label",
    description: "镜头围绕主体旋转拍摄",
    descKey: "shotOption.movement.orbit.desc",
    keyword: "orbit shot, 360 degree rotation around subject",
  },
  {
    value: "crane_up",
    label: "升",
    labelKey: "shotOption.movement.crane-up.label",
    description: "镜头向上移动，俯瞰场景",
    descKey: "shotOption.movement.crane-up.desc",
    keyword: "crane up, rising shot, ascending",
  },
  {
    value: "crane_down",
    label: "降",
    labelKey: "shotOption.movement.crane-down.label",
    description: "镜头向下移动，仰视场景",
    descKey: "shotOption.movement.crane-down.desc",
    keyword: "crane down, descending shot",
  },
  {
    value: "tracking",
    label: "跟拍",
    labelKey: "shotOption.movement.tracking.label",
    description: "镜头跟随主体移动",
    descKey: "shotOption.movement.tracking.desc",
    keyword: "tracking shot, following shot",
  },
];

export const CAMERA_ANGLE_OPTIONS: Array<{
  value: ShotInstructionTemplate["cameraAngle"];
  label: string; // 兼容 prompt 构造（保留中文，用于 AI prompt）
  labelKey: string; // UI 显示用 i18n key
  description: string; // 兼容 prompt 构造（保留中文，用于 AI prompt）
  descKey: string; // UI 显示用 i18n key
  keyword: string;
}> = [
  {
    value: "eye_level",
    label: "平拍",
    labelKey: "shotOption.angle.eye-level.label",
    description: "与主体视线平齐",
    descKey: "shotOption.angle.eye-level.desc",
    keyword: "eye level shot",
  },
  {
    value: "low",
    label: "仰视",
    labelKey: "shotOption.angle.low.label",
    description: "从低处向上拍摄，主体显高大",
    descKey: "shotOption.angle.low.desc",
    keyword: "low angle shot, looking up",
  },
  {
    value: "high",
    label: "俯视",
    labelKey: "shotOption.angle.high.label",
    description: "从高处向下拍摄，主体显渺小",
    descKey: "shotOption.angle.high.desc",
    keyword: "high angle shot, looking down",
  },
  {
    value: "birds_eye",
    label: "鸟瞰",
    labelKey: "shotOption.angle.birds-eye.label",
    description: "正上方垂直向下拍摄",
    descKey: "shotOption.angle.birds-eye.desc",
    keyword: "bird's eye view, overhead shot",
  },
  {
    value: "worms_eye",
    label: "虫视",
    labelKey: "shotOption.angle.worms-eye.label",
    description: "从地面仰视拍摄",
    descKey: "shotOption.angle.worms-eye.desc",
    keyword: "worm's eye view, ground level looking up",
  },
  {
    value: "dutch",
    label: "倾斜",
    labelKey: "shotOption.angle.dutch.label",
    description: "镜头倾斜，制造不安感",
    descKey: "shotOption.angle.dutch.desc",
    keyword: "dutch angle, tilted frame, canted angle",
  },
];

export function shotInstructionToPrompt(instruction: ResolvedShotInstruction): string {
  const parts: string[] = [];
  const shotSize = SHOT_SIZE_OPTIONS.find((o) => o.value === instruction.shotSize);
  if (shotSize) parts.push(shotSize.keyword);
  const cameraMovement = CAMERA_MOVEMENT_OPTIONS.find((o) => o.value === instruction.cameraMovement);
  if (cameraMovement) parts.push(cameraMovement.keyword);
  const cameraAngle = CAMERA_ANGLE_OPTIONS.find((o) => o.value === instruction.cameraAngle);
  if (cameraAngle) parts.push(cameraAngle.keyword);
  return parts.join(", ");
}

export interface ResolvedShotInstruction {
  shotSize?: string;
  cameraMovement?: string;
  cameraAngle?: string;
}

/**
 * Resolves the effective shot instruction.
 *
 * PR 7：旧字段 `beat.shotType` / `beat.camera.angle` / `beat.camera.movement` 已删除，
 * 现在只从 `shotInstruction` 读取。旧数据由 migration v8 迁移到 shotInstruction。
 */
export function resolveShotInstruction(beat: {
  shotInstruction?: ShotInstructionTemplate;
}): ResolvedShotInstruction | null {
  if (beat.shotInstruction) {
    return {
      shotSize: beat.shotInstruction.shotSize,
      cameraMovement: beat.shotInstruction.cameraMovement,
      cameraAngle: beat.shotInstruction.cameraAngle,
    };
  }

  return null;
}
