/**
 * 场景变体（mood/weather/crowdLevel）→ 镜头语言（shotType/cameraMovement/cameraAngle）映射表。
 *
 * 本文件属于 shared-logic 层，零外部依赖。
 * 所有类型使用 inline 字符串字面量定义，不导入项目其他层。
 *
 * 镜头参数取值范围（与 src/domain/schemas/shot-system.ts 的 enum 对齐）：
 * - shotSize: "extreme_close" | "close" | "medium" | "wide" | "extreme_wide"
 * - cameraMovement: "static" | "push" | "pull" | "pan" | "orbit" | "crane_up" | "crane_down" | "tracking"
 * - cameraAngle: "eye_level" | "low" | "high" | "birds_eye" | "worms_eye" | "dutch"
 */

export type ShotSize = "extreme_close" | "close" | "medium" | "wide" | "extreme_wide";
export type CameraMovement = "static" | "push" | "pull" | "pan" | "orbit" | "crane_up" | "crane_down" | "tracking";
export type CameraAngle = "eye_level" | "low" | "high" | "birds_eye" | "worms_eye" | "dutch";

export interface MoodShotMapping {
  shotSize: ShotSize[];
  cameraMovement: CameraMovement[];
  cameraAngle: CameraAngle[];
  rationale: string;
}

/**
 * 情绪 → 镜头语言主映射表。
 *
 * 设计原则：
 * - 紧张/混乱 → 近景 + 动态运镜 + 倾斜/低角度，制造不稳定感
 * - 宁静/浪漫 → 中远景 + 静态/慢推 + 平视，保持稳定
 * - 神秘/忧郁 → 中远景 + 拉镜/摇镜 + 高角度/倾斜，营造窥视/孤独感
 * - 霓虹/暴风雨 → 动态运镜，增强视觉冲击
 */
export const MOOD_TO_CAMERA_MAPPING: Record<string, MoodShotMapping> = {
  // 紧张/混乱 → 手持感（tracking）+ 快摇（pan）+ 倾斜角度
  tense: {
    shotSize: ["close", "medium"],
    cameraMovement: ["tracking", "pan", "push"],
    cameraAngle: ["dutch", "low"],
    rationale: "紧张氛围适合 tracking 镜头制造不稳定感，倾斜角度增加压迫感",
  },
  chaotic: {
    shotSize: ["close", "medium"],
    cameraMovement: ["tracking", "pan", "push"],
    cameraAngle: ["dutch"],
    rationale: "混乱场景用 tracking + pan 制造失控感",
  },

  // 宁静/浪漫 → 固定镜头 + 慢推 + 平视
  peaceful: {
    shotSize: ["wide", "medium"],
    cameraMovement: ["static", "push", "pull"],
    cameraAngle: ["eye_level"],
    rationale: "宁静氛围用固定镜头保持稳定，慢推营造沉浸感",
  },
  romantic: {
    shotSize: ["medium", "close"],
    cameraMovement: ["push", "pull", "static"],
    cameraAngle: ["eye_level", "low"],
    rationale: "浪漫场景用 push 镜头营造亲密感",
  },

  // 神秘/忧郁 → 拉镜 + 摇镜 + 高角度
  mysterious: {
    shotSize: ["wide", "medium"],
    cameraMovement: ["pan", "pull", "orbit"],
    cameraAngle: ["high", "dutch"],
    rationale: "神秘氛围用 pan + 高角度制造窥视感",
  },
  melancholic: {
    shotSize: ["wide", "medium"],
    cameraMovement: ["static", "pan"],
    cameraAngle: ["high", "eye_level"],
    rationale: "忧郁场景用固定 + 高角度营造孤独感",
  },

  // 霓虹/暴风雨 → 动态镜头
  neon: {
    shotSize: ["medium", "close"],
    cameraMovement: ["orbit", "push", "pan"],
    cameraAngle: ["low", "eye_level"],
    rationale: "霓虹光照适合 orbit 环绕镜头展现光影",
  },
  stormy: {
    shotSize: ["wide", "medium"],
    cameraMovement: ["tracking", "crane_up", "pan"],
    cameraAngle: ["low", "dutch"],
    rationale: "暴风雨场景用 tracking + crane_up 增强冲击力",
  },

  // 欢乐/活力 → 中景 + 推拉 + 平视
  joyful: {
    shotSize: ["medium", "wide"],
    cameraMovement: ["push", "pan", "tracking"],
    cameraAngle: ["eye_level", "low"],
    rationale: "欢乐氛围用 push + 平视保持活力",
  },
  energetic: {
    shotSize: ["medium", "close"],
    cameraMovement: ["tracking", "push", "pan"],
    cameraAngle: ["low", "eye_level"],
    rationale: "活力场景用 tracking + 低角度增强动感",
  },
};

export interface WeatherModifier {
  cameraMovementPreference?: CameraMovement;
  rationale?: string;
}

/**
 * 天气修正：在 mood 主映射基础上叠加修正。
 * 暴风雨 → 偏好 tracking；晴天 → 偏好 static；雪天 → 偏好 static/pull。
 */
export const WEATHER_MODIFIERS: Record<string, WeatherModifier> = {
  stormy: {
    cameraMovementPreference: "tracking",
    rationale: "暴风雨天气偏好 tracking 增强动感",
  },
  rainy: {
    cameraMovementPreference: "pan",
    rationale: "雨天偏好 pan 营造氛围",
  },
  sunny: {
    cameraMovementPreference: "static",
    rationale: "晴天偏好 static 保持稳定",
  },
  snowy: {
    cameraMovementPreference: "pull",
    rationale: "雪天偏好 pull 营造宁静",
  },
  foggy: {
    cameraMovementPreference: "pan",
    rationale: "雾天偏好 pan 制造神秘感",
  },
};

export interface CrowdModifier {
  shotSizePreference?: ShotSize;
  rationale?: string;
}

/**
 * 人群密度修正：拥挤 → 偏好近景；空旷 → 偏好远景。
 */
export const CROWD_MODIFIERS: Record<string, CrowdModifier> = {
  crowded: {
    shotSizePreference: "close",
    rationale: "拥挤场景偏好 close 突出个体",
  },
  busy: {
    shotSizePreference: "medium",
    rationale: "繁忙场景偏好 medium 平衡个体与环境",
  },
  sparse: {
    shotSizePreference: "wide",
    rationale: "稀疏场景偏好 wide 展现空间",
  },
  empty: {
    shotSizePreference: "extreme_wide",
    rationale: "空旷场景偏好 extreme_wide 强调孤寂",
  },
};

export interface SceneVariantInput {
  mood: string;
  weather?: string;
  lighting?: string;
  crowdLevel?: string;
}

export interface ShotRecommendation {
  recommendedShotSize: ShotSize;
  recommendedCameraMovement: CameraMovement;
  recommendedCameraAngle: CameraAngle;
  alternatives: Array<ShotSize | CameraMovement | CameraAngle>;
  rationale: string;
}

/**
 * 根据场景变体推荐镜头语言。
 *
 * 算法：
 * 1. 优先按 mood 查 MOOD_TO_CAMERA_MAPPING；找不到则用 "peaceful" 作为默认
 * 2. weather 叠加修正：若 weather 修正器指定了 cameraMovementPreference，则覆盖
 * 3. crowdLevel 修正：若 crowd 修正器指定了 shotSizePreference，则覆盖
 * 4. 综合返回推荐 + 备选 + rationale
 */
export function recommendShotBySceneVariant(variant: SceneVariantInput): ShotRecommendation {
  // 1. mood 主映射
  const moodMapping = MOOD_TO_CAMERA_MAPPING[variant.mood] ?? MOOD_TO_CAMERA_MAPPING.peaceful!;

  let recommendedShotSize: ShotSize = moodMapping.shotSize[0]!;
  let recommendedCameraMovement: CameraMovement = moodMapping.cameraMovement[0]!;
  const recommendedCameraAngle: CameraAngle = moodMapping.cameraAngle[0]!;

  // 2. weather 修正
  const weatherModifier = variant.weather ? WEATHER_MODIFIERS[variant.weather] : undefined;
  if (weatherModifier?.cameraMovementPreference) {
    recommendedCameraMovement = weatherModifier.cameraMovementPreference;
  }

  // 3. crowdLevel 修正
  const crowdModifier = variant.crowdLevel ? CROWD_MODIFIERS[variant.crowdLevel] : undefined;
  if (crowdModifier?.shotSizePreference) {
    recommendedShotSize = crowdModifier.shotSizePreference;
  }

  // 4. 备选：mood 映射的其余项
  const alternatives: Array<ShotSize | CameraMovement | CameraAngle> = [
    ...moodMapping.shotSize.slice(1),
    ...moodMapping.cameraMovement.slice(1),
    ...moodMapping.cameraAngle.slice(1),
  ];

  // 5. rationale 拼接
  const rationales = [moodMapping.rationale, weatherModifier?.rationale, crowdModifier?.rationale]
    .filter(Boolean);

  return {
    recommendedShotSize,
    recommendedCameraMovement,
    recommendedCameraAngle,
    alternatives,
    rationale: rationales.join("；"),
  };
}
