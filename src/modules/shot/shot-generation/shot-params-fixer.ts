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

export function fixShotParams(data: Record<string, unknown>): {
  fixed: Record<string, unknown>;
  autoFixed: string[];
} {
  const fixed = { ...data };
  const autoFixed: string[] = [];

  const validShotTypes = [
    "wide",
    "medium",
    "close",
    "extreme_close",
    "low",
    "high",
    "birdseye",
    "wormseye",
  ];
  const normalizedShotType = normalizeEnumValue(
    data.shotType as string,
    SHOT_TYPE_ALIASES,
    validShotTypes,
  );
  if (normalizedShotType && normalizedShotType !== data.shotType) {
    fixed.shotType = normalizedShotType;
    autoFixed.push(`shotType: "${data.shotType}" → "${normalizedShotType}"`);
  } else if (!data.shotType) {
    fixed.shotType = "medium";
    autoFixed.push('shotType: 缺失 → "medium" (默认值)');
  } else if (!normalizedShotType && data.shotType) {
    fixed.shotType = "medium";
    autoFixed.push(`shotType: "${data.shotType}" 无效 → "medium" (默认值)`);
  }

  const validMovements = [
    "static",
    "push",
    "pull",
    "pan",
    "orbit",
    "crane_up",
    "crane_down",
    "tracking",
  ];
  const normalizedMovement = normalizeEnumValue(
    data.cameraMovement as string,
    CAMERA_MOVEMENT_ALIASES,
    validMovements,
  );
  if (normalizedMovement && normalizedMovement !== data.cameraMovement) {
    fixed.cameraMovement = normalizedMovement;
    autoFixed.push(
      `cameraMovement: "${data.cameraMovement}" → "${normalizedMovement}"`,
    );
  } else if (!normalizedMovement && data.cameraMovement) {
    fixed.cameraMovement = "static";
    autoFixed.push(
      `cameraMovement: "${data.cameraMovement}" 无效 → "static" (默认值)`,
    );
  }

  const validAngles = [
    "eye_level",
    "low",
    "high",
    "birds_eye",
    "worms_eye",
    "dutch",
  ];
  const normalizedAngle = normalizeEnumValue(
    data.cameraAngle as string,
    CAMERA_ANGLE_ALIASES,
    validAngles,
  );
  if (normalizedAngle && normalizedAngle !== data.cameraAngle) {
    fixed.cameraAngle = normalizedAngle;
    autoFixed.push(`cameraAngle: "${data.cameraAngle}" → "${normalizedAngle}"`);
  } else if (!normalizedAngle && data.cameraAngle) {
    fixed.cameraAngle = "eye_level";
    autoFixed.push(
      `cameraAngle: "${data.cameraAngle}" 无效 → "eye_level" (默认值)`,
    );
  }

  if (typeof data.duration === "number") {
    if (data.duration < 2) {
      fixed.duration = 2;
      autoFixed.push(`duration: ${data.duration} → 2 (最小值)`);
    } else if (data.duration > 30) {
      fixed.duration = 30;
      autoFixed.push(`duration: ${data.duration} → 30 (最大值)`);
    }
  } else if (data.duration === undefined || data.duration === null) {
    fixed.duration = 5;
    autoFixed.push("duration: 缺失 → 5 (默认值)");
  }

  if (typeof data.prompt === "string") {
    if (data.prompt.length < 10) {
      const context = [
        data.shotType ? `${fixed.shotType} shot` : "",
        data.cameraMovement ? `${fixed.cameraMovement} camera` : "",
        data.cameraAngle ? `${fixed.cameraAngle} angle` : "",
      ]
        .filter(Boolean)
        .join(", ");

      if (context) {
        fixed.prompt = `${data.prompt}, ${context}`;
        autoFixed.push(
          `prompt: 过短(${data.prompt.length}字符)，已补充镜头上下文`,
        );
      }
    }
  }

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

export function fixStoryBeat(data: Record<string, unknown>): {
  fixed: Record<string, unknown>;
  autoFixed: string[];
} {
  const normalized: Record<string, unknown> = {
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
    if (content.includes("全景") || content.includes("establishing")) {
      fixed.shotType = "wide";
    } else if (content.includes("特写") || content.includes("close-up")) {
      fixed.shotType = "close";
    } else {
      fixed.shotType = "medium";
    }
    autoFixed.push(`shotType: 缺失 → "${fixed.shotType}" (根据内容推断)`);
  }

  if (!fixed.type) {
    const content = (fixed.content || fixed.description || "") as string;
    if (
      content.includes("对话") ||
      content.includes("说") ||
      content.includes('"')
    ) {
      fixed.type = "dialogue";
    } else if (content.includes("转场") || content.includes("过渡")) {
      fixed.type = "transition";
    } else if (content.includes("特效") || content.includes("效果")) {
      fixed.type = "effect";
    } else {
      fixed.type = "action";
    }
    autoFixed.push(`type: 缺失 → "${fixed.type}" (根据内容推断)`);
  }

  return { fixed, autoFixed };
}
