import { joinParts, QUALITY_TAGS_IMAGE } from "../../base";

interface FramePairPromptParams {
  keyframePrompt: string;
  actionDescription?: string;
  characterRef?: string;
  sceneRef?: string;
  duration?: number;
}

export function generateFirstFramePrompt(params: FramePairPromptParams): string {
  const parts: string[] = [];
  parts.push("生成视频的第一帧（起始画面），要求：");
  parts.push("这是视频的起始画面，角色处于动作开始前的初始状态。");

  if (params.keyframePrompt) {
    parts.push(`基于以下预览图的风格和构图：${params.keyframePrompt}`);
  }

  if (params.actionDescription) {
    parts.push(`动作起始状态：${params.actionDescription}（开始前的瞬间）`);
  }

  parts.push("画面要求：清晰展示角色起始姿态、表情自然、光影与预览图保持一致。");

  return joinParts([...parts, ...QUALITY_TAGS_IMAGE]);
}

export function generateLastFramePrompt(params: FramePairPromptParams): string {
  const parts: string[] = [];
  parts.push("生成视频的最后一帧（结束画面），要求：");
  parts.push("这是视频的结束画面，角色处于动作完成后的最终状态。");

  if (params.keyframePrompt) {
    parts.push(`基于以下预览图的风格和构图：${params.keyframePrompt}`);
  }

  if (params.actionDescription) {
    parts.push(`动作结束状态：${params.actionDescription}（完成后的瞬间）`);
  }

  if (params.duration) {
    parts.push(`视频时长约 ${params.duration} 秒后的最终状态。`);
  }

  parts.push("画面要求：清晰展示角色结束姿态、动作完成感强、光影与预览图和首帧保持一致。");

  return joinParts([...parts, ...QUALITY_TAGS_IMAGE]);
}

interface KeyframePromptParams {
  characterRef?: string;
  sceneRef?: string;
  prevKeyframe?: string;
  shotRequirement?: {
    shotType?: string;
    cameraAngle?: string;
    cameraMovement?: string;
    action?: string;
  };
  content?: string;
}

export function generateKeyframePrompt(params: KeyframePromptParams): string {
  const parts: string[] = [];

  parts.push("生成一张高质量的分镜预览图，要求：");

  if (params.content) {
    parts.push(`画面内容：${params.content}`);
  }

  if (params.shotRequirement) {
    const { shotType, cameraAngle, cameraMovement, action } = params.shotRequirement;
    if (shotType) parts.push(`景别：${shotType}`);
    if (cameraAngle) parts.push(`镜头角度：${cameraAngle}`);
    if (cameraMovement) parts.push(`运镜方式：${cameraMovement}`);
    if (action) parts.push(`动作：${action}`);
  }

  if (params.prevKeyframe) {
    parts.push("保持与上一分镜相同的色调、光影风格和构图语言，确保分镜之间的视觉连贯性。");
  }

  parts.push("画面要求：构图精美、光影自然、细节丰富、适合作为动画分镜参考。");

  return joinParts([...parts, ...QUALITY_TAGS_IMAGE]);
}

export function generateCharacterAnalysisPrompt(): string {
  return `分析这张图片中的角色，提取以下信息并以 JSON 格式返回：
{
  "name": "角色名称",
  "gender": "性别",
  "age": "年龄数字",
  "style": "艺术风格",
  "personality": ["性格特征1", "性格特征2"],
  "appearance": {
    "hairColor": "发色",
    "hairStyle": "发型",
    "eyeColor": "眼睛颜色",
    "height": "身高描述",
    "build": "体型",
    "clothing": "服装描述"
  },
  "description": "角色整体描述"
}`;
}

export function generateSceneAnalysisPrompt(): string {
  return `分析这张图片中的场景，提取以下信息并以 JSON 格式返回：
{
  "name": "场景名称",
  "type": "场景类型",
  "timeOfDay": "时间（早晨/中午/傍晚/夜晚）",
  "weather": "天气",
  "mood": "氛围/情绪",
  "elements": ["元素1", "元素2", "元素3"],
  "colorPalette": "色调描述",
  "description": "场景整体描述"
}`;
}
