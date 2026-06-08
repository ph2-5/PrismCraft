import type { Character, Scene, Story, StoryElement } from "@/domain/schemas";

interface StoryPlanPromptContext {
  story: Partial<Story>;
  characters: Character[];
  scenes: Scene[];
  elements: StoryElement[];
}

export function buildStoryPlanPrompt(
  story: Partial<Story>,
  characters: Character[],
  scenes: Scene[],
  elements: StoryElement[] = [],
): string {
  const ctx: StoryPlanPromptContext = {
    story,
    characters,
    scenes,
    elements,
  };
  const sections: string[] = [];

  sections.push(buildStoryHeader(ctx));
  if (characters.length > 0) sections.push(buildCharacterList(characters));
  if (scenes.length > 0) sections.push(buildSceneList(scenes));
  if (elements.length > 0) sections.push(buildElementDefinitions(elements));
  sections.push(buildJsonSchema(ctx));
  sections.push(buildFieldLegend(ctx));
  sections.push(buildRequirements(ctx));

  return sections.join("\n\n");
}

function buildStoryHeader(ctx: StoryPlanPromptContext): string {
  const { story } = ctx;
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

function buildCharacterList(characters: Character[]): string {
  const lines = ["角色列表："];
  for (const c of characters) {
    lines.push(`- ${c.name}: ${c.description || "无描述"}`);
  }
  return lines.join("\n");
}

function buildSceneList(scenes: Scene[]): string {
  const lines = ["场景列表："];
  for (const s of scenes) {
    lines.push(`- ${s.name}: ${s.description || "无描述"}`);
  }
  return lines.join("\n");
}

function buildElementDefinitions(elements: StoryElement[]): string {
  const lines = [
    "【全局元素定义 - 跨分镜保持一致】",
    "以下元素已在元素库中定义，请在分镜规划中严格使用这些元素的编号和定义，确保跨分镜一致性：",
  ];
  for (const el of elements) {
    const typeLabel =
      el.type === "character" ? "角色" : el.type === "prop" ? "道具" : "特效";
    lines.push(`- ${el.id}（${typeLabel}）：${el.name}`);
    if (el.description) lines.push(`  描述：${el.description}`);
    if (el.bindings && el.bindings.length > 0) {
      const primary = el.bindings.find((b) => b.isPrimary) || el.bindings[0];
      if (primary) lines.push(`  参考图：${primary.url}`);
    }
    if (
      el.featureAnchor?.featureTags &&
      el.featureAnchor.featureTags.length > 0
    ) {
      lines.push(`  视觉特征：${el.featureAnchor.featureTags.join("、")}`);
    }
    lines.push(
      "  一致性约束：严格继承参考图中的全部视觉特征，跨分镜必须保持同一元素的视觉一致性",
    );
  }
  lines.push("", "【元素使用规范】");
  lines.push(
    "1. 在分镜的 content 中引用元素时，请使用元素编号（如 CHAR_001、PROP_001）",
  );
  lines.push("2. 确保同一元素在不同分镜中的描述与其全局定义一致");
  lines.push("3. 如果分镜涉及多个元素，请明确标注每个元素的编号和动作");
  return lines.join("\n");
}

function buildJsonSchema(ctx: StoryPlanPromptContext): string {
  const { elements } = ctx;
  const lines = [
    "请以紧凑的JSON数组格式输出，使用缩写字段名：",
    "```json",
    "[",
    "  {",
    '    "t": "分镜标题",',
    '    "c": "详细画面描述，含视觉细节、角色动作、环境氛围",',
    '    "st": "wide|medium|close|extreme_close|low|high|birdseye|wormseye",',
    '    "ca": "eye_level|low|high|birds_eye|worms_eye|dutch",',
    '    "cm": "static|push|pull|pan|orbit|crane_up|crane_down|tracking",',
    '    "d": 5,',
    '    "tp": "action|dialogue|scene|transition|effect",',
    '    "ci": ["角色ID"],',
    '    "si": "场景ID",',
    '    "kp": "预览图提示词：画面构图、角色姿态、场景氛围的详细英文描述，用于生成单张预览图",',
    '    "fp": "首帧提示词：动作开始瞬间的画面描述，英文，包含角色起始姿态、表情、环境",',
    '    "lp": "尾帧提示词：动作结束瞬间的画面描述，英文，包含角色结束姿态、表情、环境，与首帧形成连贯动作"',
  ];

  if (elements.length > 0) {
    lines.push(',\n    "ei": ["元素ID列表，如 CHAR_001, PROP_001"],');
    lines.push(
      '    "eb": { "CHAR_001": { "role": "main_character|supporting|background|prop", "action": "动作描述", "position": "位置描述", "emotion": "情绪状态" } }',
    );
  }

  lines.push("  }", "]", "```");
  return lines.join("\n");
}

function buildFieldLegend(ctx: StoryPlanPromptContext): string {
  const { elements } = ctx;
  const base =
    "t=title, c=content, st=shotType, ca=cameraAngle, cm=cameraMovement, d=duration, tp=type, ci=characterIds, si=sceneId, kp=keyframePrompt, fp=firstFramePrompt, lp=lastFramePrompt";
  const parts: string[] = [base];
  if (elements.length > 0) parts.push("ei=elementIds, eb=elementBindings");
  return `字段缩写对照：${parts.join(", ")}`;
}

function buildRequirements(ctx: StoryPlanPromptContext): string {
  const { elements } = ctx;
  const lines = [
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
    lines.push(
      `${reqIndex}. 【元素引用规范】在content中描述角色/道具/特效时，必须使用元素编号（如CHAR_001、PROP_001），确保与全局元素定义对应`,
    );
    reqIndex++;
    lines.push(
      `${reqIndex}. 同一元素在不同分镜中的描述必须保持视觉一致性，严格继承其全局定义的参考图特征`,
    );
    reqIndex++;
  }

  lines.push(`${reqIndex}. 只输出JSON数组，不要其他文本`);
  return lines.join("\n");
}

export function buildRetryPrompt(basePrompt: string, errors: string[]): string {
  return `${basePrompt}\n\n【重要修正要求】上一轮生成的参数存在以下问题，请务必修正后重新输出：\n${errors.map((e, i) => `${i + 1}. ${e}`).join("\n")}\n\n请确保修正后的输出严格符合字段要求和枚举值。`;
}
