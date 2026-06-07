import type { Character, Scene } from "@/domain/schemas";
import {
  buildSceneAtmosphereDesc,
  buildSceneVisualDesc,
  QUALITY_TAGS_VIDEO,
} from "../base";
import { getModelParameterProfile } from "@/shared/model-capabilities";

interface QuickModeParams {
  prompt: string;
  duration: number;
  resolution: string;
  style: string;
  characters?: Character[];
  scene?: Scene;
  referenceImage?: string;
  enableSmartOptimization?: boolean;
  negativePrompt?: string;
}

const BASE_NEGATIVE = [
  "no clipping",
  "no face distortion",
  "no extra limbs",
  "no frame jumping",
  "no scene inconsistency",
  "no character appearance change",
  "no blur or overexposure",
  "no watermark or subtitle",
  "no distortion or deformation",
  "no horror content",
].join(", ");

const STYLE_PRESETS: Record<string, string> = {
  写实: "真实摄影风格，自然光线，细腻纹理",
  动漫: "日本动漫风格，明亮色彩，流畅线条",
  二次元: "二次元插画风格，鲜艳色彩，萌系风格",
  电影感: "电影大片风格，电影级构图，戏剧性光线",
  国潮: "中国风，传统元素，东方美学",
  赛博朋克: "赛博朋克风格，霓虹灯光，未来都市",
  古风: "中国古典风格，水墨元素，古代场景",
  "3D卡通": "3D卡通渲染风格，圆润造型，明亮色彩",
  像素风: "像素艺术风格，复古游戏感",
  水彩: "水彩画风格，柔和过渡，艺术感",
};

const RESOLUTION_CONFIG: Record<string, { desc: string; aspect?: string }> = {
  "1280x720": { desc: "1280x720 高清分辨率", aspect: "16:9" },
  "1920x1080": { desc: "1920x1080 全高清分辨率", aspect: "16:9" },
  "3840x2160": { desc: "3840x2160 4K超高清分辨率", aspect: "16:9" },
  "720p": { desc: "1280x720 高清分辨率", aspect: "16:9" },
  "1080p": { desc: "1920x1080 全高清分辨率", aspect: "16:9" },
  "4K": { desc: "3840x2160 4K超高清分辨率", aspect: "16:9" },
};

export function generateQuickModeVideoPrompt(params: QuickModeParams): string {
  const {
    prompt,
    duration,
    resolution,
    style,
    characters = [],
    scene,
    referenceImage,
    enableSmartOptimization = true,
    negativePrompt,
  } = params;

  const promptParts: string[] = [];

  if (characters.length > 0) {
    const characterDescs = characters.map((char) => {
      const baseDesc = char.description || char.name;
      const imageNote = char.generatedImage
        ? `【重要】保持角色形象与参考图片完全一致：${char.name}`
        : "";
      return `${char.name}：${baseDesc}${imageNote}`;
    });
    promptParts.push(`【核心角色】\n${characterDescs.join("\n")}`);
    promptParts.push(
      `【角色要求】视频全程保持以上角色的形象、服装、特征完全一致，不发生任何变化`,
    );
  }

  if (scene) {
    const sceneDesc = buildSceneAtmosphereDesc(scene);
    const sceneVisual = buildSceneVisualDesc(scene);
    const sceneFullDesc = [sceneDesc, sceneVisual].filter(Boolean).join("，");
    const imageNote = scene.generatedImage
      ? `【重要】保持场景与参考图片完全一致`
      : "";
    promptParts.push(`【固定场景】${scene.name}：${sceneFullDesc}${imageNote}`);
    promptParts.push(
      `【场景要求】视频全程在该场景中进行，保持场景环境、光线、空间结构完全一致`,
    );
  }

  promptParts.push(`【视频内容】\n${prompt}`);

  const styleDesc = STYLE_PRESETS[style] || style;
  const resConfig = RESOLUTION_CONFIG[resolution] ?? RESOLUTION_CONFIG["1080p"]!;
  promptParts.push(`【画面风格】${styleDesc}`);
  promptParts.push(
    `【技术参数】${resConfig.desc}，视频时长${duration}秒，画面流畅清晰，稳定无抖动`,
  );

  if (referenceImage) {
    promptParts.push(
      `【参考素材】请参考提供的图片进行生成，保持画面风格、构图、氛围一致`,
    );
  }

  if (enableSmartOptimization) {
    promptParts.push(`【智能优化】优化构图，保持节奏流畅，细节丰富`);
  }

  promptParts.push(`【质量要求】\n${QUALITY_TAGS_VIDEO.join(", ")}`);

  const finalNegative = negativePrompt
    ? `${BASE_NEGATIVE}, ${negativePrompt}`
    : BASE_NEGATIVE;
  promptParts.push(`【禁止内容】\n${finalNegative}`);

  return promptParts.join("\n\n");
}

export const AVAILABLE_STYLES = Object.keys(STYLE_PRESETS);

export const DURATION_OPTIONS = [
  { value: 2, label: "2秒" },
  { value: 5, label: "5秒" },
  { value: 10, label: "10秒" },
  { value: 15, label: "15秒" },
  { value: 30, label: "30秒" },
];

export const RESOLUTION_OPTIONS = [
  { value: "1280x720", label: "720p HD", width: 1280, height: 720 },
  { value: "1920x1080", label: "1080p Full HD", width: 1920, height: 1080 },
  { value: "3840x2160", label: "4K Ultra HD", width: 3840, height: 2160 },
];

export function getDurationOptionsForModel(modelId: string | undefined): Array<{ value: number; label: string }> {
  if (!modelId) return DURATION_OPTIONS;
  const profile = getModelParameterProfile(modelId);
  if (profile?.parameters?.durations?.length) return profile.parameters.durations;
  return DURATION_OPTIONS;
}

export function getResolutionOptionsForModel(modelId: string | undefined): Array<{ value: string; label: string; width: number; height: number }> {
  if (!modelId) return RESOLUTION_OPTIONS;
  const profile = getModelParameterProfile(modelId);
  if (profile?.parameters?.resolutions?.length) return profile.parameters.resolutions;
  return RESOLUTION_OPTIONS;
}

export function getStyleOptionsForModel(modelId: string | undefined): Array<{ value: string; label: string; description?: string }> {
  if (!modelId) return AVAILABLE_STYLES.map(s => ({ value: s, label: s }));
  const profile = getModelParameterProfile(modelId);
  if (profile?.parameters?.styles?.length) return profile.parameters.styles;
  return AVAILABLE_STYLES.map(s => ({ value: s, label: s }));
}
