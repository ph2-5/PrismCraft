import type { ShotInstructionTemplate } from "@/domain/schemas";

export const SHOT_SIZE_OPTIONS: Array<{
  value: ShotInstructionTemplate["shotSize"];
  label: string;
  description: string;
  keyword: string;
}> = [
  { value: "extreme_close", label: "特写", description: "极度放大的局部画面，强调细节", keyword: "extreme close-up shot" },
  { value: "close", label: "近景", description: "人物胸部以上的画面，突出表情", keyword: "close-up shot" },
  { value: "medium", label: "中景", description: "人物腰部以上的画面，展示动作", keyword: "medium shot" },
  { value: "wide", label: "全景", description: "人物全身及周围环境的画面", keyword: "wide shot" },
  { value: "extreme_wide", label: "远景", description: "大范围场景画面，强调环境", keyword: "extreme wide shot, establishing shot" },
];

export const CAMERA_MOVEMENT_OPTIONS: Array<{
  value: ShotInstructionTemplate["cameraMovement"];
  label: string;
  description: string;
  keyword: string;
}> = [
  { value: "static", label: "固定", description: "镜头不动，画面稳定", keyword: "static camera, fixed shot" },
  { value: "push", label: "推", description: "镜头向主体推进，放大画面", keyword: "push in, zoom in, dolly in" },
  { value: "pull", label: "拉", description: "镜头远离主体，缩小画面", keyword: "pull out, zoom out, dolly out" },
  { value: "pan", label: "摇", description: "镜头左右或上下旋转", keyword: "pan shot, camera pan" },
  { value: "orbit", label: "环绕", description: "镜头围绕主体旋转拍摄", keyword: "orbit shot, 360 degree rotation around subject" },
  { value: "crane_up", label: "升", description: "镜头向上移动，俯瞰场景", keyword: "crane up, rising shot, ascending" },
  { value: "crane_down", label: "降", description: "镜头向下移动，仰视场景", keyword: "crane down, descending shot" },
  { value: "tracking", label: "跟拍", description: "镜头跟随主体移动", keyword: "tracking shot, following shot" },
];

export const CAMERA_ANGLE_OPTIONS: Array<{
  value: ShotInstructionTemplate["cameraAngle"];
  label: string;
  description: string;
  keyword: string;
}> = [
  { value: "eye_level", label: "平拍", description: "与主体视线平齐", keyword: "eye level shot" },
  { value: "low", label: "仰视", description: "从低处向上拍摄，主体显高大", keyword: "low angle shot, looking up" },
  { value: "high", label: "俯视", description: "从高处向下拍摄，主体显渺小", keyword: "high angle shot, looking down" },
  { value: "birds_eye", label: "鸟瞰", description: "正上方垂直向下拍摄", keyword: "bird's eye view, overhead shot" },
  { value: "worms_eye", label: "虫视", description: "从地面仰视拍摄", keyword: "worm's eye view, ground level looking up" },
  { value: "dutch", label: "倾斜", description: "镜头倾斜，制造不安感", keyword: "dutch angle, tilted frame, canted angle" },
];

export function shotInstructionToPrompt(instruction: ShotInstructionTemplate): string {
  const parts: string[] = [];
  const shotSize = SHOT_SIZE_OPTIONS.find((o) => o.value === instruction.shotSize);
  if (shotSize) parts.push(shotSize.keyword);
  const cameraMovement = CAMERA_MOVEMENT_OPTIONS.find((o) => o.value === instruction.cameraMovement);
  if (cameraMovement) parts.push(cameraMovement.keyword);
  const cameraAngle = CAMERA_ANGLE_OPTIONS.find((o) => o.value === instruction.cameraAngle);
  if (cameraAngle) parts.push(cameraAngle.keyword);
  return parts.join(", ");
}
