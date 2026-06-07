import type { Result } from "@/domain/types";
import { fromAsyncThrowable } from "@/domain/types";
import type { StoryBeat, Character, Scene, StoryStyleGuide, StoryElement } from "@/domain/schemas";
import type { ITextProvider } from "@/domain/ports";
import { errorLogger } from "@/shared/error-logger";

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

export async function generateFramePrompts(
  input: FramePromptInput,
): Promise<Result<FramePromptOutput>> {
  return fromAsyncThrowable(async () => {
    const { beat, index, characters, scenes, styleGuide, prevBeatDescription, nextBeatDescription, textProvider } = input;

    const charIds = beat.characters?.length > 0 ? beat.characters : (beat.character ? [beat.character] : []);
    const charDesc = buildCharacterVisualDesc(characters, charIds);
    const sceneDesc = buildSceneVisualDesc(scenes, beat.sceneId || beat.scene);

    const beatContent = beat.content || beat.description || "";
    if (!beatContent.trim() && !charDesc && !sceneDesc) {
      return {
        firstFramePrompt: "",
        lastFramePrompt: "",
      };
    }

    const styleSection = styleGuide
      ? `整体风格：${styleGuide.artStyle || "未指定"}；氛围：${styleGuide.moodAtmosphere || "未指定"}${styleGuide.colorPalette?.length ? `；配色：${styleGuide.colorPalette.join("、")}` : ""}`
      : "";

    const shotTypeMap: Record<string, string> = {
      wide: "远景", medium: "中景", close: "特写",
      extreme_close: "大特写", low: "低角度", high: "高角度",
      birdseye: "鸟瞰", wormseye: "仰视",
    };
    const shotLabel = beat.shotType ? shotTypeMap[beat.shotType] || beat.shotType : "中景";

    const cameraInfo = beat.camera
      ? `角度：${beat.camera.angle || "平视"}，运动：${beat.camera.movement || "静止"}，景别：${shotLabel}`
      : `景别：${shotLabel}`;

    const contextParts: string[] = [];
    if (prevBeatDescription) contextParts.push(`上一镜头内容：${prevBeatDescription}`);
    if (nextBeatDescription) contextParts.push(`下一镜头内容：${nextBeatDescription}`);
    const contextSection = contextParts.length > 0 ? `\n\n上下文：\n${contextParts.join("\n")}` : "";

    const prompt = `你是一位专业的动画分镜师。请为以下分镜生成首帧和尾帧的视觉描述提示词。

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

    const result = await textProvider.generateText(prompt, {
      maxTokens: 600,
      temperature: 0.7,
    });

    if (!result.success || !result.data?.text) {
      throw new Error(result.error || "LLM 帧提示词生成失败");
    }

    const text = result.data.text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      errorLogger.warn(
        { code: "FRAME_PROMPT_FORMAT_ERROR", message: `LLM 帧提示词返回格式异常: ${text.substring(0, 100)}` },
        "FramePromptService",
      );
      return {
        firstFramePrompt: beat.content || beat.description || "",
        lastFramePrompt: beat.content || beat.description || "",
      };
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]) as FramePromptOutput;
      return {
        firstFramePrompt: parsed.firstFramePrompt || beat.content || beat.description || "",
        lastFramePrompt: parsed.lastFramePrompt || beat.content || beat.description || "",
      };
    } catch {
      errorLogger.warn(
        { code: "FRAME_PROMPT_PARSE_ERROR", message: `LLM 帧提示词 JSON 解析失败: ${text.substring(0, 100)}` },
        "FramePromptService",
      );
      return {
        firstFramePrompt: beat.content || beat.description || "",
        lastFramePrompt: beat.content || beat.description || "",
      };
    }
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
