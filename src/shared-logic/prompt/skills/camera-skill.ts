/**
 * Camera Skill — 镜头/运动/景别专项指令构建器（Task 4.7 v5.3 增强）
 *
 * 借鉴 seedance-2.0（MIT 许可）的 seedance-camera SKILL 模式。
 *
 * 触发场景：用户消息含镜头相关关键词（镜头/景别/运镜/推拉摇移/特写/全景等）。
 * 行为：构建镜头专项指令片段，覆盖景别 + 运动方式 + 镜头参数。
 *
 * 本文件属于 shared-logic 层，零外部依赖。
 */

import type { AgentContext, Skill } from "./index";
import type {
  ShotSize,
  CameraMovement,
  LensParameter,
  CameraInstruction,
} from "./extended-types";

// === 景别描述表 ===
const SHOT_SIZE_DESCRIPTIONS: Record<ShotSize, string> = {
  extreme_wide: "极远景（交代环境，主体占画面 <15%）",
  wide: "远景（主体占画面 30-50%，含环境）",
  medium: "中景（主体膝盖以上，强调动作）",
  close_up: "近景（主体胸部以上，强调表情）",
  extreme_close_up: "特写（局部细节，如眼睛/手部）",
};

// === 运镜描述表 ===
const CAMERA_MOVEMENT_DESCRIPTIONS: Record<CameraMovement, string> = {
  static: "固定镜头（相机不动，适合静态构图）",
  pan: "摇镜（相机水平转动，适合跟随运动或展示全景）",
  tilt: "俯仰镜（相机垂直转动，适合展示高度）",
  dolly: "推拉镜（相机沿光轴前后移动，推近强调主体，拉远揭示环境）",
  handheld: "手持感（轻微晃动，营造真实/紧张氛围）",
  tracking: "跟拍（相机跟随主体移动，适合运动镜头）",
  crane: "摇臂镜（垂直升降，适合宏大牌场或俯瞰）",
};

// === 镜头参数表 ===
const LENS_DESCRIPTIONS: Record<LensParameter, string> = {
  "35mm": "35mm 广角（适合远景和环境交代，透视感强）",
  "85mm": "85mm 人像（适合近景和人像，背景虚化明显）",
  zoom: "变焦（推拉变焦制造紧张感或集中注意力）",
  macro: "微距（适合细节特写，如珠宝/纹理）",
};

// === 情绪 → 镜头推荐映射 ===
const MOOD_TO_CAMERA: Record<string, CameraInstruction> = {
  紧张: { shotSize: "close_up", movement: "handheld", lens: "85mm" },
  温馨: { shotSize: "medium", movement: "static", lens: "35mm" },
  神秘: { shotSize: "wide", movement: "dolly", lens: "85mm" },
  热血: { shotSize: "medium", movement: "tracking", lens: "35mm" },
  忧郁: { shotSize: "close_up", movement: "static", lens: "85mm" },
  史诗: { shotSize: "extreme_wide", movement: "crane", lens: "35mm" },
};

export const cameraSkill: Skill = {
  id: "camera",
  matchers: [
    "镜头",
    "景别",
    "运镜",
    "推近",
    "拉远",
    "摇镜",
    "特写",
    "全景",
    "中景",
    "近景",
    "远景",
    "手持",
    "跟拍",
    "俯瞰",
    "camera",
    "shot",
    "zoom",
  ],

  buildInstructions(ctx: AgentContext): string {
    // 从用户消息中检测情绪关键词，推荐对应镜头
    const recommendedCamera = detectMoodRecommendation(ctx.userMessage);

    return [
      "## 镜头专项指令（Camera Skill）",
      "",
      "本片段构建镜头语言指令，覆盖景别 + 运动方式 + 镜头参数三部分。",
      "",
      "### 景别（Shot Size）",
      ...Object.entries(SHOT_SIZE_DESCRIPTIONS).map(([k, v]) => `- ${k}：${v}`),
      "",
      "### 运动方式（Camera Movement）",
      ...Object.entries(CAMERA_MOVEMENT_DESCRIPTIONS).map(([k, v]) => `- ${k}：${v}`),
      "",
      "### 镜头参数（Lens）",
      ...Object.entries(LENS_DESCRIPTIONS).map(([k, v]) => `- ${k}：${v}`),
      "",
      "### 构建规则",
      "- 景别与情绪匹配：紧张→close_up；温馨→medium；史诗→extreme_wide",
      "- 运镜与动作幅度匹配：静态对话→static；追逐→tracking；混乱→handheld",
      "- 镜头参数与景别匹配：广角(35mm)适合远景；人像(85mm)适合近景",
      "- 每个镜头只选 1 个景别 + 1 个运镜 + 0-1 个镜头参数",
      "- 输出格式：「景别，运镜，镜头参数（可选）」如「中景，缓慢推近，35mm」",
      recommendedCamera
        ? `\n### 当前推荐\n根据用户消息检测到情绪关键词，推荐：\n- 景别：${SHOT_SIZE_DESCRIPTIONS[recommendedCamera.shotSize]}\n- 运镜：${CAMERA_MOVEMENT_DESCRIPTIONS[recommendedCamera.movement]}${recommendedCamera.lens ? `\n- 镜头：${LENS_DESCRIPTIONS[recommendedCamera.lens]}` : ""}`
        : "",
    ].filter(Boolean).join("\n");
  },
};

function detectMoodRecommendation(message: string): CameraInstruction | null {
  for (const [mood, camera] of Object.entries(MOOD_TO_CAMERA)) {
    if (message.includes(mood)) {
      return camera;
    }
  }
  return null;
}

// === 导出构建函数（供 recipe-skill-mapper 调用） ===

export function buildCameraInstruction(
  shotSize: ShotSize,
  movement: CameraMovement,
  lens?: LensParameter,
): string {
  const parts = [
    SHOT_SIZE_DESCRIPTIONS[shotSize],
    CAMERA_MOVEMENT_DESCRIPTIONS[movement],
  ];
  if (lens) {
    parts.push(LENS_DESCRIPTIONS[lens]);
  }
  return parts.join("；");
}

export function recommendCameraByMood(mood: string): CameraInstruction | null {
  return MOOD_TO_CAMERA[mood] ?? null;
}
