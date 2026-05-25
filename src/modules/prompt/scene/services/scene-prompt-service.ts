import type { Scene } from "@/domain/schemas";
import {
  joinParts,
  buildSceneAtmosphereDesc,
  buildSceneVisualDesc,
  getSceneTypeKeywords,
  getMoodKeywords,
  LIGHTING_KEYWORDS,
  CAMERA_ANGLE_KEYWORDS,
  QUALITY_TAGS_IMAGE,
} from "../../base";

export function generateSceneImagePrompt(scene: Scene): string {
  if (!scene.name && !scene.description) {
    return "";
  }

  const typeKeywords = getSceneTypeKeywords(scene.type);
  const moodKeywords = getMoodKeywords(scene.mood);
  const lightingKeyword = LIGHTING_KEYWORDS[scene.lighting] || "";
  const cameraAngle = scene.camera?.angle
    ? CAMERA_ANGLE_KEYWORDS[scene.camera.angle] || ""
    : "";

  const atmosphere = buildSceneAtmosphereDesc(scene);
  const visual = buildSceneVisualDesc(scene);

  const parts = [
    scene.description || scene.name,
    atmosphere ? `(${atmosphere})` : "",
    visual,
    ...typeKeywords,
    ...moodKeywords,
    lightingKeyword,
    cameraAngle,
    "scene design",
    "background art",
    ...QUALITY_TAGS_IMAGE,
  ];

  return joinParts(parts);
}

export function generateSimpleSceneImagePrompt(scene: Scene): string {
  const typeKeywords = getSceneTypeKeywords(scene.type);
  const moodKeywords = getMoodKeywords(scene.mood);
  const lightingKeyword = LIGHTING_KEYWORDS[scene.lighting] || "";
  
  const parts: string[] = [];
  if (scene.name) parts.push(scene.name);
  if (scene.description) parts.push(scene.description);
  if (scene.type) parts.push(`类型：${scene.type}`);
  if (scene.timeOfDay) parts.push(`时间：${scene.timeOfDay}`);
  if (scene.weather) parts.push(`天气：${scene.weather}`);
  
  return joinParts([
    ...parts,
    ...typeKeywords,
    ...moodKeywords,
    lightingKeyword,
    "scene design",
    "high quality",
    "detailed",
  ]);
}

export function generateScenePromptOptimization(userDescription: string): string {
  return `请将以下场景生成描述优化为更详细、更具体的提示词，使其更适合图像生成模型。

用户描述：
${userDescription}

要求：
1. 添加视觉细节描述，包括空间布局、光照、材质、色彩等
2. 使描述更生动具体
3. 保持原始意图和主题
4. 控制在300字以内
5. 只返回优化后的提示词，不要其他说明`;
}
