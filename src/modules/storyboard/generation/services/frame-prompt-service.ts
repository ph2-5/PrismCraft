import type { Result } from "@/domain/types";
import { fromAsyncThrowable, ValidationError } from "@/domain/types";
import type { StoryBeat, Character, Scene, StoryStyleGuide, StoryElement } from "@/domain/schemas";
import type { ITextProvider } from "@/domain/ports";
import { getBeatCharacterIds, resolveShotInstruction, SHOT_SIZE_OPTIONS, CAMERA_MOVEMENT_OPTIONS, CAMERA_ANGLE_OPTIONS } from "@/domain/utils";
import { errorLogger } from "@/shared/error-logger";
import { t } from "@/shared/constants";
import { extractJsonObject } from "@/shared-logic/json";

interface FramePromptInput {
  beat: StoryBeat;
  index: number;
  characters: Character[];
  scenes: Scene[];
  elements?: StoryElement[];
  styleGuide?: StoryStyleGuide;
  prevBeatDescription?: string;
  nextBeatDescription?: string;
  textProvider: ITextProvider;
  providerId?: string;
  modelId?: string;
}

interface FramePromptOutput {
  firstFramePrompt: string;
  lastFramePrompt: string;
}

function buildCharacterVisualDesc(characters: Character[], charIds: string[]): string {
  return charIds
    .map((id) => {
      const char = characters.find((c) => c.id === id);
      if (!char) return null;
      const appearance = char.appearance;
      const parts: string[] = [char.name];
      if (appearance.hairColor) parts.push(`${appearance.hairColor}发`);
      if (appearance.hairStyle) parts.push(appearance.hairStyle);
      if (appearance.eyeColor) parts.push(`${appearance.eyeColor}眼`);
      if (appearance.build) parts.push(appearance.build);
      if (appearance.clothing) parts.push(`穿着${appearance.clothing}`);
      return parts.join("，");
    })
    .filter(Boolean)
    .join("；");
}

function buildSceneVisualDesc(scenes: Scene[], sceneId?: string): string {
  if (!sceneId) return "";
  const scene = scenes.find((s) => s.id === sceneId);
  if (!scene) return "";
  const parts: string[] = [scene.name];
  if (scene.atmosphere) parts.push(scene.atmosphere);
  if (scene.lighting) parts.push(`${scene.lighting}光线`);
  if (scene.timeOfDay) parts.push(scene.timeOfDay);
  return parts.join("，");
}

function buildCameraInfo(beat: StoryBeat): string {
  const resolvedShot = resolveShotInstruction(beat);
  const shotLabel = resolvedShot?.shotSize
    ? SHOT_SIZE_OPTIONS.find(o => o.value === resolvedShot.shotSize)?.label || resolvedShot.shotSize
    : "中景";
  const cameraMovementLabel = resolvedShot?.cameraMovement
    ? CAMERA_MOVEMENT_OPTIONS.find(o => o.value === resolvedShot.cameraMovement)?.label || resolvedShot.cameraMovement
    : "静止";
  const cameraAngleLabel = resolvedShot?.cameraAngle
    ? CAMERA_ANGLE_OPTIONS.find(o => o.value === resolvedShot.cameraAngle)?.label || resolvedShot.cameraAngle
    : "平视";

  return resolvedShot
    ? `角度：${cameraAngleLabel}，运动：${cameraMovementLabel}，景别：${shotLabel}`
    : `景别：${shotLabel}`;
}

function buildStyleSection(styleGuide: StoryStyleGuide | undefined): string {
  if (!styleGuide) return "";
  const palette = styleGuide.colorPalette?.length ? `；配色：${styleGuide.colorPalette.join("、")}` : "";
  return `整体风格：${styleGuide.artStyle || "未指定"}；氛围：${styleGuide.moodAtmosphere || "未指定"}${palette}`;
}

function buildContextSection(prev?: string, next?: string): string {
  const parts: string[] = [];
  if (prev) parts.push(`上一镜头内容：${prev}`);
  if (next) parts.push(`下一镜头内容：${next}`);
  return parts.length > 0 ? `\n\n上下文：\n${parts.join("\n")}` : "";
}

function buildFramePromptText(beat: StoryBeat, index: number, charDesc: string, sceneDesc: string, cameraInfo: string, styleSection: string, contextSection: string): string {
  return `你是一位专业的动画分镜师。请为以下分镜生成首帧和尾帧的视觉描述提示词。

分镜编号：第${index + 1}镜头
分镜标题：${beat.title || "未命名"}
分镜内容：${beat.content || beat.description || "无描述"}
时长：${beat.duration || 5}秒
${charDesc ? `角色：${charDesc}` : ""}
${sceneDesc ? `场景：${sceneDesc}` : ""}
镜头信息：${cameraInfo}
${styleSection}
${contextSection}

请严格按照以下JSON格式输出，不要输出任何其他内容：
{
  "firstFramePrompt": "首帧画面的详细视觉描述，包含构图、角色姿态与表情、场景布局、光影效果，用英文逗号分隔的关键词风格，适合AI图片生成模型理解",
  "lastFramePrompt": "尾帧画面的详细视觉描述，包含该镜头结束时角色姿态与表情、场景状态、光影效果，用英文逗号分隔的关键词风格，适合AI图片生成模型理解"
}

要求：
1. 首帧提示词要描述镜头开始时的画面，尾帧提示词要描述镜头结束时的画面
2. 两个画面之间要有明确的动作或时间推进关系
3. 描述要具体可执行，便于AI图片模型生成
4. 保持角色外观与风格描述一致
5. 如果有上一镜头信息，首帧应考虑与上一镜头的视觉衔接
6. 如果有下一镜头信息，尾帧应为下一镜头的视觉过渡做铺垫`;
}

function parseFramePromptResult(text: string, beat: StoryBeat): FramePromptOutput {
  const fallback = beat.content || beat.description || "";

  const jsonStr = extractJsonObject(text);
  if (!jsonStr) {
    errorLogger.warn(
      { code: "FRAME_PROMPT_FORMAT_ERROR", message: `LLM 帧提示词返回格式异常: ${text.substring(0, 100)}` },
      "FramePromptService",
    );
    return { firstFramePrompt: fallback, lastFramePrompt: fallback };
  }

  try {
    const parsed = JSON.parse(jsonStr) as FramePromptOutput;
    return {
      firstFramePrompt: parsed.firstFramePrompt || fallback,
      lastFramePrompt: parsed.lastFramePrompt || fallback,
    };
  } catch {
    errorLogger.warn(
      { code: "FRAME_PROMPT_PARSE_ERROR", message: `LLM 帧提示词 JSON 解析失败: ${text.substring(0, 100)}` },
      "FramePromptService",
    );
    return { firstFramePrompt: fallback, lastFramePrompt: fallback };
  }
}

export async function generateFramePrompts(
  input: FramePromptInput,
): Promise<Result<FramePromptOutput>> {
  return fromAsyncThrowable(async () => {
    const { beat, index, characters, scenes, styleGuide, prevBeatDescription, nextBeatDescription, textProvider, providerId, modelId } = input;

    const charIds = getBeatCharacterIds(beat);
    const charDesc = buildCharacterVisualDesc(characters, charIds);
    const sceneDesc = buildSceneVisualDesc(scenes, beat.sceneId);

    const beatContent = beat.content || beat.description || "";
    if (!beatContent.trim() && !charDesc && !sceneDesc) {
      throw new ValidationError(t("error.framePromptEmpty"));
    }

    const cameraInfo = buildCameraInfo(beat);
    const styleSection = buildStyleSection(styleGuide);
    const contextSection = buildContextSection(prevBeatDescription, nextBeatDescription);
    const prompt = buildFramePromptText(beat, index, charDesc, sceneDesc, cameraInfo, styleSection, contextSection);

    const result = await textProvider.generateText(prompt, {
      maxTokens: 600,
      temperature: 0.7,
      providerId,
      modelId,
    });

    if (!result.success || !result.data?.text) {
      throw new Error(result.error || t("error.framePromptGenFailed"));
    }

    return parseFramePromptResult(result.data.text.trim(), beat);
  });
}

export async function batchGenerateFramePrompts(
  beats: StoryBeat[],
  options: {
    characters: Character[];
    scenes: Scene[];
    elements?: StoryElement[];
    styleGuide?: StoryStyleGuide;
    textProvider: ITextProvider;
    providerId?: string;
    modelId?: string;
  },
): Promise<Result<Map<string, FramePromptOutput>>> {
  return fromAsyncThrowable(async () => {
    const results = new Map<string, FramePromptOutput>();

    for (let i = 0; i < beats.length; i++) {
      const beat = beats[i]!;
      const prevBeatDescription = i > 0 ? beats[i - 1]!.content || beats[i - 1]!.description : undefined;
      const nextBeatDescription = i < beats.length - 1 ? beats[i + 1]!.content || beats[i + 1]!.description : undefined;

      try {
        const result = await generateFramePrompts({
          beat,
          index: i,
          characters: options.characters,
          scenes: options.scenes,
          elements: options.elements,
          styleGuide: options.styleGuide,
          prevBeatDescription,
          nextBeatDescription,
          textProvider: options.textProvider,
          providerId: options.providerId,
          modelId: options.modelId,
        });

        if (result.ok) {
          results.set(beat.id, result.value);
        }
      } catch (error) {
        errorLogger.warn(
          { code: "BATCH_FRAME_PROMPT_ERROR", message: `批量帧提示词生成失败 (beat ${beat.id}): ${error instanceof Error ? error.message : String(error)}` },
          "FramePromptService",
        );
      }

      if (i < beats.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }

    return results;
  });
}
