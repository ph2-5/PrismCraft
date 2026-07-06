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
  fixed: Record<string, unknown>,
): FieldFixResult {
  if (typeof prompt !== "string" || prompt.length >= 10) {
    return { value: prompt };
  }
  const context = [
    fixed.shotType ? `${fixed.shotType} shot` : "",
    fixed.cameraMovement ? `${fixed.cameraMovement} camera` : "",
    fixed.cameraAngle ? `${fixed.cameraAngle} angle` : "",
  ]
    .filter(Boolean)
    .join(", ");
  if (!context) return { value: prompt };
  return {
    value: `${prompt}, ${context}`,
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
  const fixed = { ...data };
  const autoFixed: string[] = [];

  const shotTypeFix = fixEnumField(
    data.shotType,
    SHOT_TYPE_ALIASES,
    VALID_SHOT_TYPES,
    "medium",
    "shotType",
  );
  fixed.shotType = shotTypeFix.value;
  if (shotTypeFix.message) autoFixed.push(shotTypeFix.message);

  const movementFix = fixOptionalEnumField(
    data.cameraMovement,
    CAMERA_MOVEMENT_ALIASES,
    VALID_CAMERA_MOVEMENTS,
    "static",
    "cameraMovement",
  );
  fixed.cameraMovement = movementFix.value;
  if (movementFix.message) autoFixed.push(movementFix.message);

  const angleFix = fixOptionalEnumField(
    data.cameraAngle,
    CAMERA_ANGLE_ALIASES,
    VALID_CAMERA_ANGLES,
    "eye_level",
    "cameraAngle",
  );
  fixed.cameraAngle = angleFix.value;
  if (angleFix.message) autoFixed.push(angleFix.message);

  const durationFix = fixDurationField(data.duration);
  fixed.duration = durationFix.value;
  if (durationFix.message) autoFixed.push(durationFix.message);

  const promptFix = fixPromptField(data.prompt, fixed);
  fixed.prompt = promptFix.value;
  if (promptFix.message) autoFixed.push(promptFix.message);

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

  return {
    prompt:
      content.length >= 10
        ? content
        : `A ${genre} scene with cinematic composition`,
    shotType: defaults.shotType,
    cameraAngle: defaults.cameraAngle,
    cameraMovement: defaults.cameraMovement,
    duration: defaults.duration,
    characterIds: data.characterIds || [],
    sceneId: data.sceneId || undefined,
  };
}

function normalizeStoryBeatFields(data: Record<string, unknown>): Record<string, unknown> {
  return {
    title: data.t || data.title,
    content: data.c || data.content,
    description: data.desc || data.description,
    shotType: data.st || data.shotType,
    cameraAngle: data.ca || data.cameraAngle,
    cameraMovement: data.cm || data.cameraMovement,
    duration: data.d ?? data.duration,
    type: data.tp || data.type,
    characterIds: data.ci || data.characterIds,
    sceneId: data.si || data.sceneId,
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

  if (!fixed.shotType) {
    const content = (fixed.content || fixed.description || "") as string;
    fixed.shotType = inferShotTypeFromContent(content);
    autoFixed.push(`shotType: 缺失 → "${fixed.shotType}" (根据内容推断)`);
  }

  if (!fixed.type) {
    const content = (fixed.content || fixed.description || "") as string;
    fixed.type = inferBeatTypeFromContent(content);
    autoFixed.push(`type: 缺失 → "${fixed.type}" (根据内容推断)`);
  }

  return { fixed, autoFixed };
}
