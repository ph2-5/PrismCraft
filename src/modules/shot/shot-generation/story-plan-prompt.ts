import type { Character, Scene, Story, StoryElement } from "@/domain/schemas";

/**
 * 仅把可被大模型访问的 URL（http/https/data）拼到 prompt 文本中。
 * file:// / blob: / 本地路径对大模型无意义，且会暴露本地文件结构。
 * 与 prompt-builder.ts 保持一致（详见 isShareableUrl）。
 */
const SHAREABLE_URL_PROTOCOL = /^(https?:|data:)/i;
function isShareableUrl(url: string | undefined | null): url is string {
  return typeof url === "string" && SHAREABLE_URL_PROTOCOL.test(url);
}

interface StoryPlanPromptContext {
  story: Partial<Story>;
  characters: Character[];
  scenes: Scene[];
  elements: StoryElement[];
  language: "en" | "zh" | "auto";
}

export function buildStoryPlanPrompt(
  story: Partial<Story>,
  characters: Character[],
  scenes: Scene[],
  elements: StoryElement[] = [],
  language: "en" | "zh" | "auto" = "zh",
): string {
  const ctx: StoryPlanPromptContext = {
    story,
    characters,
    scenes,
    elements,
    language,
  };
  const sections: string[] = [];

  sections.push(buildStoryHeader(ctx));
  if (characters.length > 0) sections.push(buildCharacterList(characters, language));
  if (scenes.length > 0) sections.push(buildSceneList(scenes, language));
  if (elements.length > 0) sections.push(buildElementDefinitions(elements, language));
  sections.push(buildJsonSchema(ctx));
  sections.push(buildFieldLegend(ctx));
  sections.push(buildRequirements(ctx));

  return sections.join("\n\n");
}

function buildStoryHeader(ctx: StoryPlanPromptContext): string {
  const { story, language } = ctx;
  if (language === "en") {
    return [
      "Create a detailed storyboard plan for the following story:",
      "",
      `Title: ${story.title || "Untitled"}`,
      `Genre: ${story.genre || "Drama"}`,
      `Tone: ${story.tone || "Neutral"}`,
      `Target Duration: ${story.targetDuration || 60}s`,
      `Synopsis: ${story.description || "None"}`,
    ].join("\n");
  }
  return [
    "请为以下故事创建详细的分镜规划：",
    "",
    `故事标题：${story.title || "未命名"}`,
    `类型：${story.genre || "剧情"}`,
    `基调：${story.tone || "中性"}`,
    `目标时长：${story.targetDuration || 60}秒`,
    `故事简介：${story.description || "无"}`,
  ].join("\n");
}

function buildCharacterList(characters: Character[], language: "en" | "zh" | "auto"): string {
  const lines = [language === "en" ? "Characters:" : "角色列表："];
  for (const c of characters) {
    lines.push(`- ${c.name}: ${c.description || (language === "en" ? "No description" : "无描述")}`);
  }
  return lines.join("\n");
}

function buildSceneList(scenes: Scene[], language: "en" | "zh" | "auto"): string {
  const lines = [language === "en" ? "Scenes:" : "场景列表："];
  for (const s of scenes) {
    lines.push(`- ${s.name}: ${s.description || (language === "en" ? "No description" : "无描述")}`);
  }
  return lines.join("\n");
}

function buildElementDefinitions(elements: StoryElement[], language: "en" | "zh" | "auto"): string {
  const isEn = language === "en";
  const lines = isEn
    ? [
        "[Global Element Definitions - Maintain Consistency Across Shots]",
        "The following elements are defined in the element library. Strictly use their IDs and definitions in the storyboard plan to ensure cross-shot consistency:",
      ]
    : [
        "【全局元素定义 - 跨分镜保持一致】",
        "以下元素已在元素库中定义，请在分镜规划中严格使用这些元素的编号和定义，确保跨分镜一致性：",
      ];
  for (const el of elements) {
    const typeLabel = isEn
      ? el.type === "character" ? "Character" : el.type === "prop" ? "Prop" : "Effect"
      : el.type === "character" ? "角色" : el.type === "prop" ? "道具" : "特效";
    lines.push(`- ${el.id}（${typeLabel}）：${el.name}`);
    if (el.description) lines.push(isEn ? `  Description: ${el.description}` : `  描述：${el.description}`);
    if (el.bindings && el.bindings.length > 0) {
      const primary = el.bindings.find((b) => b.isPrimary) || el.bindings[0];
      if (primary) {
        // 本地 URL（file://、blob: 等）对大模型无意义，仅提示已附加。
        const refLabel = isEn ? "Reference Image" : "参考图";
        const refValue = isShareableUrl(primary.url)
          ? primary.url
          : isEn ? "(attached via reference channel)" : "（已通过 reference 通道附加）";
        lines.push(`  ${refLabel}: ${refValue}`);
      }
    }
    if (
      el.featureAnchor?.featureTags &&
      el.featureAnchor.featureTags.length > 0
    ) {
      lines.push(isEn ? `  Visual Features: ${el.featureAnchor.featureTags.join(", ")}` : `  视觉特征：${el.featureAnchor.featureTags.join("、")}`);
    }
    lines.push(
      isEn
        ? "  Consistency Constraint: Strictly inherit all visual features from the reference image, maintaining visual consistency of the same element across shots"
        : "  一致性约束：严格继承参考图中的全部视觉特征，跨分镜必须保持同一元素的视觉一致性",
    );
  }
  lines.push("", isEn ? "[Element Usage Guidelines]" : "【元素使用规范】");
  if (isEn) {
    lines.push("1. When referencing elements in shot content, use element IDs (e.g., CHAR_001, PROP_001)");
    lines.push("2. Ensure descriptions of the same element across different shots are consistent with its global definition");
    lines.push("3. If a shot involves multiple elements, clearly label each element's ID and action");
  } else {
    lines.push("1. 在分镜的 content 中引用元素时，请使用元素编号（如 CHAR_001、PROP_001）");
    lines.push("2. 确保同一元素在不同分镜中的描述与其全局定义一致");
    lines.push("3. 如果分镜涉及多个元素，请明确标注每个元素的编号和动作");
  }
  return lines.join("\n");
}

function buildJsonSchema(ctx: StoryPlanPromptContext): string {
  const { elements, language } = ctx;
  const isEn = language === "en";
  const lines = isEn
    ? [
        "Output in compact JSON array format with abbreviated field names:",
        "```json",
        "[",
        "  {",
        '    "t": "Shot title",',
        '    "c": "Detailed visual description, including visual details, character actions, environmental atmosphere",',
        '    "ss": "wide|medium|close|extreme_close|extreme_wide",',
        '    "ca": "eye_level|low|high|birds_eye|worms_eye|dutch",',
        '    "cm": "static|push|pull|pan|orbit|crane_up|crane_down|tracking",',
        '    "d": 5,',
        '    "tp": "action|dialogue|scene|transition|effect",',
        '    "ci": ["Character ID"],',
        '    "si": "Scene ID",',
        '    "kp": "Keyframe prompt: detailed English description of composition, character pose, scene atmosphere for generating a single preview image",',
        '    "fp": "First frame prompt: description of the moment when the action starts, in English, including character starting pose, expression, environment",',
        '    "lp": "Last frame prompt: description of the moment when the action ends, in English, including character ending pose, expression, environment, forming a coherent action with the first frame"',
      ]
    : [
        "请以紧凑的JSON数组格式输出，使用缩写字段名：",
        "```json",
        "[",
        "  {",
        '    "t": "分镜标题",',
        '    "c": "详细画面描述，含视觉细节、角色动作、环境氛围",',
        '    "ss": "wide|medium|close|extreme_close|extreme_wide",',
        '    "ca": "eye_level|low|high|birds_eye|worms_eye|dutch",',
        '    "cm": "static|push|pull|pan|orbit|crane_up|crane_down|tracking",',
        '    "d": 5,',
        '    "tp": "action|dialogue|scene|transition|effect",',
        '    "ci": ["角色ID"],',
        '    "si": "场景ID",',
        '    "kp": "预览图提示词：画面构图、角色姿态、场景氛围的详细英文描述，用于生成单张预览图",',
        '    "fp": "首帧提示词：动作开始瞬间的画面描述，英文，包含角色起始姿态、表情、环境",',
        '    "lp": "尾帧提示词：动作结束瞬间的画面描述，英文，包含角色结束姿态、表情、环境，与首帧形成连贯动作"'
      ];

  if (elements.length > 0) {
    if (isEn) {
      lines.push(',\n    "ei": ["Element ID list, e.g., CHAR_001, PROP_001"],');
      lines.push(
        '    "eb": { "CHAR_001": { "role": "main_character|supporting|background|prop", "action": "Action description", "position": "Position description", "emotion": "Emotional state" } }',
      );
    } else {
      lines.push(',\n    "ei": ["元素ID列表，如 CHAR_001, PROP_001"],');
      lines.push(
        '    "eb": { "CHAR_001": { "role": "main_character|supporting|background|prop", "action": "动作描述", "position": "位置描述", "emotion": "情绪状态" } }',
      );
    }
  }

  lines.push("  }", "]", "```");
  return lines.join("\n");
}

function buildFieldLegend(ctx: StoryPlanPromptContext): string {
  const { elements, language } = ctx;
  const base =
    "t=title, c=content, ss=shotSize, ca=cameraAngle, cm=cameraMovement, d=duration, tp=type, ci=characterIds, si=sceneId, kp=keyframePrompt, fp=firstFramePrompt, lp=lastFramePrompt";
  const parts: string[] = [base];
  if (elements.length > 0) parts.push("ei=elementIds, eb=elementBindings");
  return language === "en"
    ? `Field abbreviation reference: ${parts.join(", ")}`
    : `字段缩写对照：${parts.join(", ")}`;
}

function buildRequirements(ctx: StoryPlanPromptContext): string {
  const { elements, language } = ctx;
  const isEn = language === "en";
  const lines = isEn
    ? [
        "Requirements:",
        "1. Each shot's content must be specific and visual, including visual details",
        "2. Camera parameters must match the content (e.g., action scenes use close+push, scene introductions use wide+crane_up)",
        "3. Reasonable duration: action 2-4s, dialogue 4-6s, scene 5-8s",
        "4. Ensure narrative rhythm with proper setup, development, climax, and resolution",
        "5. Diversify shot types, avoid consecutive identical shot sizes",
        "6. kp/fp/lp must be output in English, containing detailed visual descriptions for AI image generation",
        "7. fp (first frame) and lp (last frame) must describe the start and end points of the same action, ensuring visual continuity",
      ]
    : [
        "要求：",
        "1. 每个分镜的content必须具体、有画面感，包含视觉细节",
        "2. 镜头参数必须与内容匹配（如动作场景用close+push，场景介绍用wide+crane_up）",
        "3. 时长合理：动作2-4秒，对话4-6秒，场景5-8秒",
        "4. 确保起承转合的节奏感",
        "5. 镜头类型多样化，避免连续相同景别",
        "6. kp/fp/lp 必须用英文输出，包含详细的画面描述，用于AI图像生成",
        "7. fp（首帧）和 lp（尾帧）必须描述同一个动作的起点和终点，确保视觉连贯",
      ];

  let reqIndex = 8;
  if (elements.length > 0) {
    if (isEn) {
      lines.push(
        `${reqIndex}. [Element Reference] When describing characters/props/effects in content, use element IDs (e.g., CHAR_001, PROP_001) to ensure correspondence with global element definitions`,
      );
      reqIndex++;
      lines.push(
        `${reqIndex}. Descriptions of the same element across different shots must maintain visual consistency, strictly inheriting its reference image features from the global definition`,
      );
      reqIndex++;
    } else {
      lines.push(
        `${reqIndex}. 【元素引用规范】在content中描述角色/道具/特效时，必须使用元素编号（如CHAR_001、PROP_001），确保与全局元素定义对应`,
      );
      reqIndex++;
      lines.push(
        `${reqIndex}. 同一元素在不同分镜中的描述必须保持视觉一致性，严格继承其全局定义的参考图特征`,
      );
      reqIndex++;
    }
  }

  lines.push(isEn ? `${reqIndex}. Output only the JSON array, no other text` : `${reqIndex}. 只输出JSON数组，不要其他文本`);
  return lines.join("\n");
}

export function buildRetryPrompt(basePrompt: string, errors: string[], language: "en" | "zh" | "auto" = "zh"): string {
  if (language === "en") {
    return `${basePrompt}\n\n[Important Correction Requirements] The previous generation had the following issues. Please correct them and regenerate:\n${errors.map((e, i) => `${i + 1}. ${e}`).join("\n")}\n\nEnsure the corrected output strictly conforms to the field requirements and enum values.`;
  }
  return `${basePrompt}\n\n【重要修正要求】上一轮生成的参数存在以下问题，请务必修正后重新输出：\n${errors.map((e, i) => `${i + 1}. ${e}`).join("\n")}\n\n请确保修正后的输出严格符合字段要求和枚举值。`;
}
