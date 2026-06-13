import type { Result } from "@/domain/types";
import { fromAsyncThrowable } from "@/domain/types";
import { container } from "@/infrastructure/di";
import {
  generateBeatImagePrompt,
  generateSimpleBeatImagePrompt,
  getBeatCharacterIds,
  resolveShotInstruction,
  SHOT_SIZE_OPTIONS,
  CAMERA_MOVEMENT_OPTIONS,
  CAMERA_ANGLE_OPTIONS,
} from "@/domain/utils";
import type { Character, Scene, StoryBeat } from "@/domain/schemas";

export type PromptEditorContext = "keyframe" | "firstFrame" | "lastFrame";

export interface PromptEditorRequest {
  context: PromptEditorContext;
  beat: StoryBeat;
  keyframeImageUrl?: string;
  userMessage?: string;
  characters?: Character[];
  scenes?: Scene[];
}

export interface PromptEditorResult {
  prompt: string;
  context: PromptEditorContext;
}

function buildSystemPrompt(context: PromptEditorContext): string {
  const contextLabels: Record<PromptEditorContext, string> = {
    keyframe: "分镜预览图",
    firstFrame: "首帧",
    lastFrame: "尾帧",
  };

  return `你是一位专业的AI动画提示词工程师。你的任务是根据用户提供的分镜信息，生成高质量的图像生成提示词。

当前需要生成的是：${contextLabels[context]}的提示词。

要求：
1. 提示词必须用中文编写，使用逗号分隔的关键词描述格式
2. 包含画面构图、角色外观、场景氛围、光照、风格等视觉要素
3. 控制在80-150个中文字符之间
4. 如果是首帧提示词，描述动作开始前的初始状态
5. 如果是尾帧提示词，描述动作完成后的最终状态
6. 如果是预览图提示词，描述分镜的整体画面构图
7. 只返回提示词文本，不要其他说明
8. 使用简洁精准的视觉描述语言，适合图像生成模型理解`;
}

function buildContextSection(request: PromptEditorRequest): string {
  const { context, beat, keyframeImageUrl, characters, scenes } = request;
  const parts: string[] = [];

  parts.push(`【分镜信息】`);
  parts.push(`标题：${beat.title || "未命名"}`);
  parts.push(`内容：${beat.content || beat.description || "无描述"}`);
  parts.push(`时长：${beat.duration}秒`);

  const resolvedShot = resolveShotInstruction(beat);
  if (resolvedShot?.shotSize) {
    const label = SHOT_SIZE_OPTIONS.find(o => o.value === resolvedShot.shotSize)?.label || resolvedShot.shotSize;
    parts.push(`景别：${label}`);
  }
  if (resolvedShot?.cameraAngle) {
    const label = CAMERA_ANGLE_OPTIONS.find(o => o.value === resolvedShot.cameraAngle)?.label || resolvedShot.cameraAngle;
    parts.push(`镜头角度：${label}`);
  }
  if (resolvedShot?.cameraMovement) {
    const label = CAMERA_MOVEMENT_OPTIONS.find(o => o.value === resolvedShot.cameraMovement)?.label || resolvedShot.cameraMovement;
    parts.push(`运镜：${label}`);
  }
  if (beat.type) parts.push(`镜头类型：${beat.type}`);

  if (characters && characters.length > 0) {
    const charIds = getBeatCharacterIds(beat);
    const boundChars = charIds
      .map((id) => characters.find((c) => c.id === id))
      .filter((c): c is Character => c !== undefined);
    if (boundChars.length > 0) {
      parts.push("");
      parts.push("【绑定角色】");
      for (const char of boundChars) {
        const charParts = [`名称：${char.name}`];
        if (char.appearance) charParts.push(`外观：${char.appearance}`);
        if (char.style) charParts.push(`风格：${char.style}`);
        parts.push(charParts.join("，"));
      }
    }
  }

  if (scenes && scenes.length > 0 && (beat.sceneId || beat.scene)) {
    const boundScene = scenes.find((s) => s.id === (beat.sceneId || beat.scene));
    if (boundScene) {
      parts.push("");
      parts.push("【绑定场景】");
      const sceneParts = [`名称：${boundScene.name}`];
      if (boundScene.description) sceneParts.push(`描述：${boundScene.description}`);
      if (boundScene.mood) sceneParts.push(`氛围：${boundScene.mood}`);
      if (boundScene.lighting) sceneParts.push(`光照：${boundScene.lighting}`);
      parts.push(sceneParts.join("，"));
    }
  }

  if (beat.sceneElements && beat.sceneElements.length > 0) {
    parts.push(`场景元素：${beat.sceneElements.map((el) => el.name).join("、")}`);
  }

  if (beat.promptLayers) {
    if (beat.promptLayers.coreElements)
      parts.push(`核心元素：${beat.promptLayers.coreElements}`);
    if (beat.promptLayers.cameraAction)
      parts.push(`镜头动作：${beat.promptLayers.cameraAction}`);
    if (beat.promptLayers.styleAtmosphere)
      parts.push(`风格氛围：${beat.promptLayers.styleAtmosphere}`);
  }

  if (context === "firstFrame" || context === "lastFrame") {
    parts.push("");
    parts.push(`【重要】当前需要生成${context === "firstFrame" ? "首帧" : "尾帧"}的提示词。`);
    parts.push(
      context === "firstFrame"
        ? "首帧是视频的起始画面，角色处于动作开始前的初始状态。"
        : "尾帧是视频的结束画面，角色处于动作完成后的最终状态。",
    );

    if (keyframeImageUrl) {
      parts.push("");
      parts.push("【预览图参考】本分镜已有预览图，首尾帧应与预览图保持风格和构图一致。");
      parts.push("预览图描述：" + (beat.keyframe?.prompt || "无预览图提示词"));
    }
  }

  if (beat.imageGenerationPrompt) {
    parts.push("");
    parts.push(`【已有预览图提示词参考】${beat.imageGenerationPrompt}`);
  }

  return parts.join("\n");
}

export async function generatePromptWithAI(
  request: PromptEditorRequest,
  options?: {
    providerId?: string;
    modelId?: string;
  },
): Promise<Result<PromptEditorResult>> {
  return fromAsyncThrowable(async () => {
    const systemPrompt = buildSystemPrompt(request.context);
    const contextSection = buildContextSection(request);

    const userParts: string[] = [];
    userParts.push(contextSection);

    if (request.userMessage) {
      userParts.push("");
      userParts.push(`【用户要求】${request.userMessage}`);
    }

    userParts.push("");
    userParts.push("请生成提示词：");

    const fullPrompt = `${systemPrompt}\n\n${userParts.join("\n")}`;

    const result = await container.textProvider.generateText(fullPrompt, {
      maxTokens: 300,
      temperature: 0.7,
      providerId: options?.providerId,
      modelId: options?.modelId,
    });

    if (!result.success || !result.data) {
      throw new Error(result.error || "AI提示词生成失败");
    }

    return {
      prompt: result.data.text.trim(),
      context: request.context,
    };
  });
}

export function buildDefaultPrompt(request: PromptEditorRequest): string {
  const { context, beat, characters, scenes } = request;

  if (context === "keyframe") {
    if (characters && scenes && characters.length > 0) {
      return generateBeatImagePrompt({
        beat,
        characters,
        scenes,
        isEnhanced: true,
        featureAnchoring: beat.featureAnchoring,
        shotInstruction: beat.shotInstruction,
      });
    }
    if (characters && scenes) {
      return generateSimpleBeatImagePrompt(beat, characters, scenes);
    }
    const parts: string[] = [];
    parts.push(beat.content || beat.description || "");
    const resolvedShot = resolveShotInstruction(beat);
    if (resolvedShot?.shotSize) parts.push(`${resolvedShot.shotSize} shot`);
    if (resolvedShot?.cameraAngle) parts.push(`${resolvedShot.cameraAngle} angle`);
    parts.push("animation still", "key visual", "high quality", "detailed");
    return parts.filter(Boolean).join(", ");
  }

  if (context === "firstFrame" || context === "lastFrame") {
    const frameType = context === "firstFrame" ? "首帧" : "尾帧";

    if (characters && scenes && (characters.length > 0 || scenes.length > 0)) {
      const basePrompt = generateSimpleBeatImagePrompt(
        beat,
        characters,
        scenes,
        frameType,
      );
      const extraParts: string[] = [];
      if (beat.keyframe?.prompt) {
        extraParts.push(`风格参考：${beat.keyframe.prompt}`);
      }
      if (beat.promptLayers?.coreElements) {
        extraParts.push(`核心元素：${beat.promptLayers.coreElements}`);
      }
      if (beat.promptLayers?.styleAtmosphere) {
        extraParts.push(`风格氛围：${beat.promptLayers.styleAtmosphere}`);
      }
      return [basePrompt, ...extraParts].filter(Boolean).join(", ");
    }

    const parts: string[] = [];
    parts.push(
      context === "firstFrame"
        ? "first frame of animation video"
        : "last frame of animation video",
    );
    parts.push(
      context === "firstFrame"
        ? "starting position, before action begins"
        : "ending position, after action completes",
    );
    parts.push(beat.content || beat.description || "");
    if (beat.keyframe?.prompt) {
      parts.push(`style reference: ${beat.keyframe.prompt}`);
    }
    parts.push("high quality", "detailed");
    return parts.filter(Boolean).join(", ");
  }

  return beat.content || beat.description || "";
}
