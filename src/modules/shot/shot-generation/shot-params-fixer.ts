import { buildShotInstructionFromLegacy } from "@/shared-logic/prompt";

const SHOT_TYPE_ALIASES: Record<string, string> = {
  特写: "close",
  近景: "close",
  中景: "medium",
  全景: "wide",
  远景: "wide",
  大远景: "wide",
  俯视: "birdseye",
  仰视: "wormseye",
  低角度: "low",
  高角度: "high",
  close_up: "close",
  extreme_close_up: "extreme_close",
  wide_shot: "wide",
  medium_shot: "medium",
  full_shot: "wide",
  establishing: "wide",
  over_the_shoulder: "close",
  two_shot: "medium",
};

const CAMERA_MOVEMENT_ALIASES: Record<string, string> = {
  推: "push",
  拉: "pull",
  摇: "pan",
  移: "tracking",
  升: "crane_up",
  降: "crane_down",
  环绕: "orbit",
  静止: "static",
  固定: "static",
  zoom_in: "push",
  zoom_out: "pull",
  dolly_in: "push",
  dolly_out: "pull",
  tilt: "pan",
  pan_left: "pan",
  pan_right: "pan",
};

const CAMERA_ANGLE_ALIASES: Record<string, string> = {
  平视: "eye_level",
  低角度: "low",
  高角度: "high",
  鸟瞰: "birds_eye",
  仰视: "worms_eye",
  倾斜: "dutch",
  eye: "eye_level",
  normal: "eye_level",
  top: "birds_eye",
  bottom: "worms_eye",
};

export function normalizeEnumValue(
  value: string | undefined,
  aliases: Record<string, string>,
  validValues: string[],
): string | undefined {
  if (!value) return undefined;
  const lower = value.toLowerCase().replace(/[\s-]/g, "_");
  if (validValues.includes(lower)) return lower;
  if (aliases[value]) return aliases[value]!;
  if (aliases[lower]) return aliases[lower]!;
  for (const [alias, target] of Object.entries(aliases)) {
    const aliasLower = alias.toLowerCase();
    if (
      lower === aliasLower ||
      lower.startsWith(aliasLower + "_") ||
      lower.endsWith("_" + aliasLower) ||
      lower.includes("_" + aliasLower + "_")
    ) {
      return target;
    }
  }
  return undefined;
}

interface FieldFixResult {
  value: unknown;
  message?: string;
}

function fixEnumField(
  rawValue: unknown,
  aliases: Record<string, string>,
  validValues: string[],
  defaultValue: string,
  fieldName: string,
): FieldFixResult {
  const normalized = normalizeEnumValue(
    rawValue as string,
    aliases,
    validValues,
  );
  if (normalized && normalized !== rawValue) {
    return {
      value: normalized,
      message: `${fieldName}: "${rawValue}" → "${normalized}"`,
    };
  }
  if (!rawValue) {
    return {
      value: defaultValue,
      message: `${fieldName}: 缺失 → "${defaultValue}" (默认值)`,
    };
  }
  if (!normalized && rawValue) {
    return {
      value: defaultValue,
      message: `${fieldName}: "${rawValue}" 无效 → "${defaultValue}" (默认值)`,
    };
  }
  return { value: normalized };
}

function fixOptionalEnumField(
  rawValue: unknown,
  aliases: Record<string, string>,
  validValues: string[],
  defaultValue: string,
  fieldName: string,
): FieldFixResult {
  const normalized = normalizeEnumValue(
    rawValue as string,
    aliases,
    validValues,
  );
  if (normalized && normalized !== rawValue) {
    return {
      value: normalized,
      message: `${fieldName}: "${rawValue}" → "${normalized}"`,
    };
  }
  if (!normalized && rawValue) {
    return {
      value: defaultValue,
      message: `${fieldName}: "${rawValue}" 无效 → "${defaultValue}" (默认值)`,
    };
  }
  return { value: normalized };
}

function fixDurationField(rawValue: unknown): FieldFixResult {
  if (typeof rawValue === "number") {
    if (rawValue < 2) {
      return { value: 2, message: `duration: ${rawValue} → 2 (最小值)` };
    }
    if (rawValue > 30) {
      return { value: 30, message: `duration: ${rawValue} → 30 (最大值)` };
    }
    return { value: rawValue };
  }
  if (rawValue === undefined || rawValue === null) {
    return { value: 5, message: "duration: 缺失 → 5 (默认值)" };
  }
  return { value: rawValue };
}

function fixPromptField(
  prompt: unknown,
  context: { shotType?: string; cameraMovement?: string; cameraAngle?: string },
): FieldFixResult {
  if (typeof prompt !== "string" || prompt.length >= 10) {
    return { value: prompt };
  }
  // PR 2d Step 4g：从传入的 context 读取（不再依赖 fixed 上的旧字段）
  const contextParts = [
    context.shotType ? `${context.shotType} shot` : "",
    context.cameraMovement ? `${context.cameraMovement} camera` : "",
    context.cameraAngle ? `${context.cameraAngle} angle` : "",
  ]
    .filter(Boolean)
    .join(", ");
  if (!contextParts) return { value: prompt };
  return {
    value: `${prompt}, ${contextParts}`,
    message: `prompt: 过短(${prompt.length}字符)，已补充镜头上下文`,
  };
}

const VALID_SHOT_TYPES = [
  "wide",
  "medium",
  "close",
  "extreme_close",
  "low",
  "high",
  "birdseye",
  "wormseye",
];

const VALID_CAMERA_MOVEMENTS = [
  "static",
  "push",
  "pull",
  "pan",
  "orbit",
  "crane_up",
  "crane_down",
  "tracking",
];

const VALID_CAMERA_ANGLES = [
  "eye_level",
  "low",
  "high",
  "birds_eye",
  "worms_eye",
  "dutch",
];

export function fixShotParams(data: Record<string, unknown>): {
  fixed: Record<string, unknown>;
  autoFixed: string[];
} {
  const fixed: Record<string, unknown> = {};
  const autoFixed: string[] = [];

  // PR 2d Step 4g：清除写入端 dual-write — 不再写 shotType / cameraAngle / cameraMovement 顶层字段
  // 输入读取仍兼容旧字段名（data.shotType / data.cameraAngle / data.cameraMovement）
  const shotTypeFix = fixEnumField(
    data.shotType,
    SHOT_TYPE_ALIASES,
    VALID_SHOT_TYPES,
    "medium",
    "shotType",
  );
  if (shotTypeFix.message) autoFixed.push(shotTypeFix.message);

  const movementFix = fixOptionalEnumField(
    data.cameraMovement,
    CAMERA_MOVEMENT_ALIASES,
    VALID_CAMERA_MOVEMENTS,
    "static",
    "cameraMovement",
  );
  if (movementFix.message) autoFixed.push(movementFix.message);

  const angleFix = fixOptionalEnumField(
    data.cameraAngle,
    CAMERA_ANGLE_ALIASES,
    VALID_CAMERA_ANGLES,
    "eye_level",
    "cameraAngle",
  );
  if (angleFix.message) autoFixed.push(angleFix.message);

  const durationFix = fixDurationField(data.duration);
  fixed.duration = durationFix.value;
  if (durationFix.message) autoFixed.push(durationFix.message);

  const promptFix = fixPromptField(data.prompt, {
    shotType: shotTypeFix.value as string | undefined,
    cameraMovement: movementFix.value as string | undefined,
    cameraAngle: angleFix.value as string | undefined,
  });
  fixed.prompt = promptFix.value;
  if (promptFix.message) autoFixed.push(promptFix.message);

  // PR 2d Step 4g：仅写入 shotInstruction（读取端已迁移至 shotInstruction，依赖 migration v8）
  const shotInstruction = buildShotInstructionFromLegacy({
    shotType: shotTypeFix.value as string | undefined,
    cameraAngle: angleFix.value as string | undefined,
    cameraMovement: movementFix.value as string | undefined,
  });
  if (shotInstruction) {
    fixed.shotInstruction = shotInstruction;
  }

  // 透传非镜头相关字段
  if (data.characterIds !== undefined) fixed.characterIds = data.characterIds;
  if (data.sceneId !== undefined) fixed.sceneId = data.sceneId;

  return { fixed, autoFixed };
}

export function generateFallbackParams(
  data: Record<string, unknown>,
  context?: { content?: string; genre?: string },
): Record<string, unknown> {
  const content = (data.content ||
    data.description ||
    context?.content ||
    "") as string;
  const genre = context?.genre || "drama";

  const genreDefaults: Record<
    string,
    {
      shotType: string;
      cameraMovement: string;
      cameraAngle: string;
      duration: number;
    }
  > = {
    action: {
      shotType: "close",
      cameraMovement: "push",
      cameraAngle: "low",
      duration: 3,
    },
    comedy: {
      shotType: "medium",
      cameraMovement: "static",
      cameraAngle: "eye_level",
      duration: 5,
    },
    thriller: {
      shotType: "extreme_close",
      cameraMovement: "push",
      cameraAngle: "dutch",
      duration: 4,
    },
    romance: {
      shotType: "close",
      cameraMovement: "orbit",
      cameraAngle: "eye_level",
      duration: 5,
    },
    scifi: {
      shotType: "wide",
      cameraMovement: "crane_up",
      cameraAngle: "eye_level",
      duration: 6,
    },
    fantasy: {
      shotType: "wide",
      cameraMovement: "orbit",
      cameraAngle: "low",
      duration: 6,
    },
    horror: {
      shotType: "extreme_close",
      cameraMovement: "push",
      cameraAngle: "worms_eye",
      duration: 3,
    },
    drama: {
      shotType: "medium",
      cameraMovement: "static",
      cameraAngle: "eye_level",
      duration: 5,
    },
  };

  const defaults = genreDefaults[genre] ?? genreDefaults.drama!;

  // PR 2d Step 4g：清除写入端 dual-write — 仅输出 shotInstruction，不再输出旧顶层字段
  const shotInstruction = buildShotInstructionFromLegacy({
    shotType: defaults.shotType,
    cameraAngle: defaults.cameraAngle,
    cameraMovement: defaults.cameraMovement,
  });

  return {
    prompt:
      content.length >= 10
        ? content
        : `A ${genre} scene with cinematic composition`,
    shotInstruction,
    duration: defaults.duration,
    characterIds: data.characterIds || [],
    sceneId: data.sceneId || undefined,
  };
}

function normalizeStoryBeatFields(data: Record<string, unknown>): Record<string, unknown> {
  // PR 2d Step 4g：清除写入端 dual-write — 不再输出 shotType / shotSize / cameraAngle / cameraMovement 顶层字段
  // 输入读取仍兼容旧字段（用于推断 shotInstruction）
  const shotSize = data.ss || data.shotSize || data.st || data.shotType;
  const cameraAngle = data.ca || data.cameraAngle;
  const cameraMovement = data.cm || data.cameraMovement;
  const inputShotInstruction = data.shotInstruction as
    | { shotSize?: string; cameraAngle?: string; cameraMovement?: string }
    | undefined;

  // PR 2d Step 4g：若输入已有 shotInstruction，优先保留；否则从旧字段构造
  const shotInstruction =
    inputShotInstruction ||
    buildShotInstructionFromLegacy({
      shotType: shotSize as string | undefined,
      cameraAngle: cameraAngle as string | undefined,
      cameraMovement: cameraMovement as string | undefined,
    });

  return {
    title: data.t || data.title,
    content: data.c || data.content,
    description: data.desc || data.description,
    duration: data.d ?? data.duration,
    type: data.tp || data.type,
    characterIds: data.ci || data.characterIds,
    sceneId: data.si || data.sceneId,
    ...(shotInstruction ? { shotInstruction } : {}),
  };
}

function inferShotTypeFromContent(content: string): string {
  if (content.includes("全景") || content.includes("establishing")) {
    return "wide";
  }
  if (content.includes("特写") || content.includes("close-up")) {
    return "close";
  }
  return "medium";
}

function inferBeatTypeFromContent(content: string): string {
  if (content.includes("对话") || content.includes("说") || content.includes('"')) {
    return "dialogue";
  }
  if (content.includes("转场") || content.includes("过渡")) {
    return "transition";
  }
  if (content.includes("特效") || content.includes("效果")) {
    return "effect";
  }
  return "action";
}

export function fixStoryBeat(data: Record<string, unknown>): {
  fixed: Record<string, unknown>;
  autoFixed: string[];
} {
  const normalized = normalizeStoryBeatFields(data);
  const fixed = { ...normalized };
  const autoFixed: string[] = [];

  if (!fixed.title && fixed.content) {
    fixed.title = (fixed.content as string).slice(0, 20) + "...";
    autoFixed.push("title: 缺失，从content自动生成");
  }

  if (!fixed.content && fixed.description) {
    fixed.content = fixed.description;
    autoFixed.push("content: 缺失，从description复制");
  }

  if (!fixed.duration || typeof fixed.duration !== "number") {
    fixed.duration = 5;
    autoFixed.push("duration: 缺失 → 5 (默认值)");
  }

  // PR 2d Step 4g：清除写入端 dual-write — 不再赋值 fixed.shotType / fixed.shotSize
  // 若 shotInstruction 缺失 shotSize，从 content 推断后补全 shotInstruction
  const existingShotInstruction = fixed.shotInstruction as
    | { shotSize?: string; cameraAngle?: string; cameraMovement?: string }
    | undefined;
  if (!existingShotInstruction?.shotSize) {
    const inferred = inferShotTypeFromContent(
      (fixed.content || fixed.description || "") as string,
    );
    autoFixed.push(`shotSize: 缺失 → "${inferred}" (根据内容推断)`);
    fixed.shotInstruction = {
      ...(existingShotInstruction || {}),
      shotSize: inferred,
    };
  }

  if (!fixed.type) {
    const content = (fixed.content || fixed.description || "") as string;
    fixed.type = inferBeatTypeFromContent(content);
    autoFixed.push(`type: 缺失 → "${fixed.type as string}" (根据内容推断)`);
  }

  return { fixed, autoFixed };
}
