import {
  validateStoryPlanOutput,
  validateShotParams,
  formatValidationResult,
  type ValidationResult,
} from "./shot-validator";
import { enrichPromptWithFewShot } from "./dynamic-few-shot";
import { container } from "@/infrastructure/di";
import type { ApiResponse, Character, Scene, Story, StoryBeat, StoryElement } from "@/domain/schemas";
import { errorLogger, extractErrorMessage } from "@/shared/error-logger";

export interface PipelineProgress {
  stage:
    | "validating"
    | "generating"
    | "post_validating"
    | "completed"
    | "failed";
  message: string;
  progress: number;
  validationResults?: ValidationResult[];
  autoFixedCount?: number;
  retryCount?: number;
  fixDetails?: string[];
}

export interface PipelineOptions {
  maxRetries: number;
  autoFix: boolean;
  fewShotCount: number;
  strictMode: boolean;
  showFixDetails: boolean;
  enhancedGeneration: boolean; // 是否启用增强模式（few-shot + schema硬约束）
  onProgress?: (progress: PipelineProgress) => void;
}

export const DEFAULT_OPTIONS: PipelineOptions = {
  maxRetries: 5,
  autoFix: true,
  fewShotCount: 3,
  strictMode: false,
  showFixDetails: true,
  enhancedGeneration: true,
};

export const STRICT_OPTIONS: PipelineOptions = {
  maxRetries: 8,
  autoFix: false,
  fewShotCount: 3,
  strictMode: true,
  showFixDetails: true,
  enhancedGeneration: true,
};

function notifyProgress(
  onProgress: PipelineOptions["onProgress"],
  progress: PipelineProgress,
) {
  onProgress?.(progress);
}

export async function generateStoryPlanWithValidation(
  story: Partial<Story>,
  characters: Character[],
  scenes: Scene[],
  elements: StoryElement[] = [],
  options: Partial<PipelineOptions> = {},
  globalEnhancedGeneration: boolean = true,
): Promise<{
  beats: StoryBeat[];
  validationResults: ValidationResult[];
  autoFixedCount: number;
  retryCount: number;
  fixDetails: string[];
}> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const validationResults: ValidationResult[] = [];
  let autoFixedCount = 0;
  let retryCount = 0;
  const fixDetails: string[] = [];

  notifyProgress(opts.onProgress, {
    stage: "generating",
    message: "正在生成故事规划...",
    progress: 0.1,
  });

  const basePrompt = buildStoryPlanPrompt(story, characters, scenes, elements);
  const enrichedPrompt = opts.enhancedGeneration
    ? enrichPromptWithFewShot(basePrompt, {
        genre: story.genre || "drama",
        tone: story.tone || "neutral",
        beatIndex: 0,
        totalBeats: Math.floor((story.targetDuration || 60) / 5),
        characters,
        scenes,
        elements,
      })
    : basePrompt;

  let rawBeats: unknown[] | null = null;
  let lastValidationErrors: string[] | undefined;
  let planValidation: ValidationResult | null = null;

  const maxAttempts = opts.enhancedGeneration ? opts.maxRetries : 1;

  for (let attempt = 0; attempt <= maxAttempts; attempt++) {
    try {
      const promptToSend =
        opts.enhancedGeneration && lastValidationErrors
          ? buildRetryPrompt(enrichedPrompt, lastValidationErrors)
          : enrichedPrompt;

      const result: ApiResponse<{ text: string }> = await container.textProvider.generateText(
        promptToSend,
        {
          maxTokens: 4000,
          temperature: 0.7,
        },
      );

      if (!result.success || !result.data?.text) {
        throw new Error(result.error || "AI 未返回有效文本");
      }

      rawBeats = parseStoryPlanJSON(result.data.text);
      if (!rawBeats || rawBeats.length === 0) {
        throw new Error("无法解析故事规划 JSON");
      }

      planValidation = validateStoryPlanOutput(rawBeats);
      validationResults.push(planValidation);

      if (!opts.enhancedGeneration || planValidation.errors.length === 0) {
        break;
      }

      lastValidationErrors = planValidation.errors.map((e) => e.message);
      retryCount++;

      notifyProgress(opts.onProgress, {
        stage: "generating",
        message: `参数校验未通过，第${attempt + 1}次修正...`,
        progress: 0.1 + (attempt / maxAttempts) * 0.3,
        retryCount,
      });
    } catch (error) {
      retryCount++;
      if (attempt >= maxAttempts) {
        notifyProgress(opts.onProgress, {
          stage: "failed",
          message: `故事规划生成失败: ${extractErrorMessage(error)}`,
          progress: 0,
          retryCount,
        });
        throw error;
      }

      notifyProgress(opts.onProgress, {
        stage: "generating",
        message: `生成失败，第${attempt + 1}次重试...`,
        progress: 0.1 + (attempt / maxAttempts) * 0.2,
        retryCount,
      });
    }
  }

  if (!rawBeats || !planValidation) {
    throw new Error("故事规划生成失败");
  }

  notifyProgress(opts.onProgress, {
    stage: "post_validating",
    message: "正在校验和修复分镜数据...",
    progress: 0.6,
  });

  if (planValidation.autoFixed.length > 0) {
    autoFixedCount += planValidation.autoFixed.length;
    fixDetails.push(...planValidation.autoFixed.map((f) => `[规划] ${f}`));
    errorLogger.info("[Pipeline] 自动修复", planValidation.autoFixed.join("; "));
  }

  // 如果经过所有重试后仍有错误
  if (planValidation.errors.length > 0) {
    const errorMsgs = planValidation.errors.map((e) => e.message);

    if (opts.strictMode) {
      notifyProgress(opts.onProgress, {
        stage: "failed",
        message: `校验失败: ${errorMsgs.join("; ")}`,
        progress: 0,
        validationResults,
        fixDetails,
      });
      throw new Error(`故事规划校验失败: ${errorMsgs.join("; ")}`);
    }

    if (!opts.autoFix) {
      notifyProgress(opts.onProgress, {
        stage: "failed",
        message: `校验失败且未启用自动修复: ${errorMsgs.join("; ")}`,
        progress: 0,
        validationResults,
        fixDetails,
      });
      throw new Error("故事规划校验失败，请检查输入");
    }

    // 温和模式：应用自动修复后继续
    errorLogger.warn(
      `[Pipeline] 经过 ${opts.maxRetries} 次重试后仍有错误，应用自动修复`,
      errorMsgs,
    );
  }

  const beats = convertToStoryBeats(
    planValidation.data as Record<string, unknown>[],
    story,
    globalEnhancedGeneration,
  );

  for (const beat of beats) {
    if (beat.shotType || beat.camera) {
      const shotValidation = validateShotParams({
        prompt: beat.content || beat.description || "",
        shotType: beat.shotType,
        duration: beat.duration,
        cameraAngle: beat.camera?.angle,
        cameraMovement: beat.camera?.movement,
      });
      validationResults.push(shotValidation);

      if (shotValidation.autoFixed.length > 0) {
        autoFixedCount += shotValidation.autoFixed.length;
        fixDetails.push(
          ...shotValidation.autoFixed.map(
            (f) => `[${beat.title || "未命名分镜"}] ${f}`,
          ),
        );
      }

      if (shotValidation.autoFixed.length > 0 && opts.autoFix) {
        for (const fix of shotValidation.autoFixed) {
          if (fix.includes("shotType")) {
            beat.shotType = shotValidation.data
              .shotType as StoryBeat["shotType"];
          }
          if (fix.includes("duration")) {
            beat.duration = shotValidation.data.duration;
          }
          if (fix.includes("cameraAngle") && beat.camera) {
            beat.camera.angle = shotValidation.data
              .cameraAngle as typeof beat.camera.angle;
          }
          if (fix.includes("cameraMovement") && beat.camera) {
            beat.camera.movement = shotValidation.data
              .cameraMovement as typeof beat.camera.movement;
          }
        }
      }

      // 删除兜底参数逻辑：不再自动套用默认值
      // 用户可以选择是否继续，而不是被强制修改
    }
  }

  notifyProgress(opts.onProgress, {
    stage: "completed",
    message: `故事规划生成完成，${beats.length}个分镜，自动修复${autoFixedCount}处`,
    progress: 1,
    validationResults,
    autoFixedCount,
    retryCount,
    fixDetails,
  });

  return { beats, validationResults, autoFixedCount, retryCount, fixDetails };
}

function buildRetryPrompt(basePrompt: string, errors: string[]): string {
  return `${basePrompt}\n\n【重要修正要求】上一轮生成的参数存在以下问题，请务必修正后重新输出：\n${errors.map((e, i) => `${i + 1}. ${e}`).join("\n")}\n\n请确保修正后的输出严格符合字段要求和枚举值。`;
}

interface StoryPlanPromptContext {
  story: Partial<Story>;
  characters: Character[];
  scenes: Scene[];
  elements: StoryElement[];
}

function buildStoryPlanPrompt(
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

function parseStoryPlanJSON(text: string): unknown[] | null {
  let jsonStr = text.trim();

  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  const jsonMatch = jsonStr.match(/\[[\s\S]*?\]/);
  if (jsonMatch) {
    jsonStr = jsonMatch[0];
  }

  try {
    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    const bracketStart = jsonStr.indexOf("[");
    const bracketEnd = jsonStr.lastIndexOf("]");
    if (bracketStart !== -1 && bracketEnd > bracketStart) {
      try {
        const parsed = JSON.parse(jsonStr.slice(bracketStart, bracketEnd + 1));
        if (Array.isArray(parsed)) return parsed;
      } catch {
        return null;
      }
    }
  }

  return null;
}

function convertToStoryBeats(
  rawBeats: Record<string, unknown>[],
  _story: Partial<Story>,
  globalEnhancedGeneration: boolean = true,
): StoryBeat[] {
  return rawBeats.map((raw, index) => {
    const title = String(raw.t || raw.title || "");
    const content = String(raw.c || raw.content || "");
    const description = String(raw.desc || raw.description || content || "");
    const shotType = String(raw.st || raw.shotType || "");
    const cameraAngle = String(raw.ca || raw.cameraAngle || "");
    const cameraMovement = String(raw.cm || raw.cameraMovement || "");
    const rawDuration = raw.d ?? raw.duration;
    const duration =
      typeof rawDuration === "number" && !isNaN(rawDuration) ? rawDuration : 5;
    const type = String(raw.tp || raw.type || "");
    const rawCharacterIds = raw.ci || raw.characterIds;
    const characterIds = Array.isArray(rawCharacterIds)
      ? rawCharacterIds.map(String)
      : [];
    const sceneId =
      raw.si || raw.sceneId ? String(raw.si || raw.sceneId) : undefined;
    const keyframePrompt = String(raw.kp || raw.keyframePrompt || "");
    const firstFramePrompt = String(raw.fp || raw.firstFramePrompt || "");
    const lastFramePrompt = String(raw.lp || raw.lastFramePrompt || "");

    // 优先从结构化字段解析元素绑定（ei = elementIds, eb = elementBindings）
    const rawElementIds = raw.ei || raw.elementIds;
    const structuredElementIds = Array.isArray(rawElementIds)
      ? rawElementIds.map(String)
      : [];

    const rawElementBindings = raw.eb || raw.elementBindings;
    const structuredElementBindings: StoryBeat["elementBindings"] = {};
    if (rawElementBindings && typeof rawElementBindings === "object") {
      for (const [elId, binding] of Object.entries(rawElementBindings)) {
        if (binding && typeof binding === "object") {
          const b = binding as Record<string, unknown>;
          structuredElementBindings[elId] = {
            role:
              (b.role as string | undefined) ||
              (elId.startsWith("CHAR") ? "main_character" : "prop"),
            action: b.action ? String(b.action) : undefined,
            position: b.position ? String(b.position) : undefined,
            emotion: b.emotion ? String(b.emotion) : undefined,
            description: b.description ? String(b.description) : undefined,
          };
        }
      }
    }

    // 降级：如果结构化字段为空，从 content 文本中解析元素引用
    let fallbackElementIds: string[] = [];
    const fallbackElementBindings: StoryBeat["elementBindings"] = {};
    if (structuredElementIds.length === 0) {
      const elementIdRegex = /\b(CHAR|PROP|EFFECT)_\d{3}\b/g;
      const extractedElementIds = content.match(elementIdRegex) || [];
      fallbackElementIds = [...new Set(extractedElementIds)];
      for (const elId of fallbackElementIds) {
        fallbackElementBindings[elId] = {
          role: elId.startsWith("CHAR") ? "main_character" : "prop",
        };
      }
    }

    const finalElementIds =
      structuredElementIds.length > 0
        ? structuredElementIds
        : fallbackElementIds;
    const finalElementBindings =
      Object.keys(structuredElementBindings).length > 0
        ? structuredElementBindings
        : Object.keys(fallbackElementBindings).length > 0
          ? fallbackElementBindings
          : undefined;

    // 生成稳定 ID（优先使用 crypto.randomUUID，降级使用 timestamp + random）
    const beatId = `beat_${crypto.randomUUID()}`;

    const beat: StoryBeat = {
      id: beatId,
      sequence: index + 1,
      title: title || `分镜${index + 1}`,
      content: content || "",
      description: description || content || "",
      duration: duration,
      type: (type as StoryBeat["type"]) || "action",
      shotType: (shotType as StoryBeat["shotType"]) || "medium",
      characters: characterIds || [],
      characterIds: characterIds || [],
      elementIds: finalElementIds.length > 0 ? finalElementIds : [],
      sceneId: sceneId || undefined,
      camera: {
        angle: cameraAngle || undefined,
        movement: cameraMovement || undefined,
      },
      imageGenerationPrompt: keyframePrompt || undefined,
      firstFramePrompt: firstFramePrompt || undefined,
      lastFramePrompt: lastFramePrompt || undefined,
      enhancedGeneration: globalEnhancedGeneration || false,
      elementBindings: finalElementBindings,
      character: undefined,
      scene: undefined,
      generationPrompt: undefined,
      transition: undefined,
      imageUrl: undefined,
      videoReferenceUrl: undefined,
      uploadedKeyframe: undefined,
      uploadedVideo: undefined,
      customChainTarget: undefined,
    };

    if (raw.dialogue) {
      beat.content = `${beat.content}\n对话：${raw.dialogue}`;
    }

    if (raw.emotion) {
      beat.content = `${beat.content}\n情绪：${raw.emotion}`;
    }

    return beat;
  });
}

export { formatValidationResult };
