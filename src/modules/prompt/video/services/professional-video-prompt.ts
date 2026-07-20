import {
  buildCharacterAppearanceDesc,
  buildSceneAtmosphereDesc,
  buildFixedImageDesc,
  buildReferenceVideoDesc,
  buildTemplateDesc,
  TRANSITION_KEYWORDS,
} from "../../base";
import { shotInstructionToPrompt, resolveShotInstruction, getBeatCharacterIds } from "@/domain/utils";
import { promptBuilder } from "../../builder";
import type { Character, FeatureAnchoringConfig, FixedImageConfig, ReferenceVideoConfig, Scene, StoryBeat, StoryElement, TemplateConfig } from "@/domain/schemas";

interface ProfessionalVideoPromptParams {
  story: {
    title: string;
    description: string;
    genre: string;
    tone: string;
    targetDuration: number;
  };
  beats: StoryBeat[];
  characters: Character[];
  scenes: Scene[];
  elements?: StoryElement[];
  featureAnchoring?: FeatureAnchoringConfig;
  fixedImage?: FixedImageConfig;
  referenceVideo?: ReferenceVideoConfig;
  template?: TemplateConfig;
}

// ============= 镜头详情构建子函数 =============

/** 构建镜头的角色描述部分 */
function buildBeatCharacters(
  beat: StoryBeat,
  characters: Character[],
): string | null {
  const charIds = getBeatCharacterIds(beat);
  const charDescs = charIds
    .map((id) => {
      const char = characters.find((c) => c.id === id);
      return char
        ? `${char.name}（${buildCharacterAppearanceDesc(char)}）`
        : null;
    })
    .filter(Boolean);
  if (charDescs.length === 0) return null;
  return `角色：${charDescs.join("；")}`;
}

/** 构建镜头的场景描述部分 */
function buildBeatScene(
  beat: StoryBeat,
  scenes: Scene[],
): string | null {
  const sceneObj = beat.sceneId
    ? scenes.find((s) => s.id === beat.sceneId)
    : null;
  if (!sceneObj) return null;
  return `场景：${sceneObj.name}，${buildSceneAtmosphereDesc(sceneObj)}`;
}

/** 构建镜头的镜头指令部分 */
function buildBeatShotInstruction(beat: StoryBeat): string | null {
  const resolvedShot = resolveShotInstruction(beat);
  if (!resolvedShot) return null;
  const shotPrompt = shotInstructionToPrompt({
    shotSize: resolvedShot.shotSize,
    cameraMovement: resolvedShot.cameraMovement,
    cameraAngle: resolvedShot.cameraAngle,
  });
  return shotPrompt ? `镜头指令：${shotPrompt}` : null;
}

/** 构建元素绑定中单个元素的描述 */
function buildElementBindingDesc(
  elementId: string,
  binding: NonNullable<StoryBeat["elementBindings"]>[string],
  elements: StoryElement[],
): string | null {
  const element = elements.find((e) => e.id === elementId);
  if (!element) return null;
  const bindingParts: string[] = [element.name];
  if (binding.role) bindingParts.push(`角色：${binding.role}`);
  if (binding.position) bindingParts.push(`位置：${binding.position}`);
  if (binding.action) bindingParts.push(`动作：${binding.action}`);
  if (binding.emotion) bindingParts.push(`表情：${binding.emotion}`);
  if (binding.description) bindingParts.push(binding.description);
  if (binding.text) bindingParts.push(`台词："${binding.text}"`);
  if (binding.imageUrl) bindingParts.push(`参考图：${binding.imageUrl}`);
  return bindingParts.join("，");
}

/** 构建镜头的元素绑定部分 */
function buildBeatElementBindings(
  beat: StoryBeat,
  elements: StoryElement[],
): string | null {
  if (!beat.elementBindings || elements.length === 0) return null;
  const bindingDescs = Object.entries(beat.elementBindings)
    .map(([elementId, binding]) => buildElementBindingDesc(elementId, binding, elements))
    .filter(Boolean);
  if (bindingDescs.length === 0) return null;
  return `元素绑定：${bindingDescs.join("；")}`;
}

/** 构建镜头的提示词层级部分 */
function buildBeatPromptLayers(beat: StoryBeat): string | null {
  if (!beat.promptLayers) return null;
  const layerParts: string[] = [];
  if (beat.promptLayers.coreElements)
    layerParts.push(`核心元素：${beat.promptLayers.coreElements}`);
  if (beat.promptLayers.cameraAction)
    layerParts.push(`镜头动作：${beat.promptLayers.cameraAction}`);
  if (beat.promptLayers.styleAtmosphere)
    layerParts.push(`风格氛围：${beat.promptLayers.styleAtmosphere}`);
  if (layerParts.length === 0) return null;
  return `提示词层级：${layerParts.join("；")}`;
}

/** 构建镜头的转场部分 */
function buildBeatTransition(beat: StoryBeat): string | null {
  if (!beat.transition || beat.transition === "无") return null;
  const transKeyword = TRANSITION_KEYWORDS[beat.transition] || beat.transition;
  if (!transKeyword) return null;
  return `转场：${transKeyword}`;
}

/** 镜头引用方向映射表 */
const REFERENCE_DIRECTION_MAP: Record<string, string> = {
  previous: "上一个镜头",
  next: "下一个镜头",
  custom: "指定镜头",
};

/** 镜头引用内容类型映射表 */
const REFERENCE_CONTENT_TYPE_MAP: Record<string, string> = {
  full_video: "完整视频",
  last_frame: "尾帧画面",
  first_frame: "首帧画面",
  video_segment: "视频片段",
};

/** 构建镜头的引用部分 */
function buildBeatReference(beat: StoryBeat): string[] {
  const parts: string[] = [];
  if (!beat.reference || beat.reference.direction === "none") return parts;
  const dirLabel = REFERENCE_DIRECTION_MAP[beat.reference.direction] || "其他镜头";
  const ctLabel =
    REFERENCE_CONTENT_TYPE_MAP[beat.reference.contentType] || beat.reference.contentType;
  parts.push(`镜头引用：引用${dirLabel}的${ctLabel}作为参考，保持视觉连贯性`);
  if (beat.reference.segmentDuration) {
    parts.push(`引用片段时长：${beat.reference.segmentDuration}秒`);
  }
  return parts;
}

/** 构建单个镜头的完整详情 */
function buildBeatDetail(
  beat: StoryBeat,
  index: number,
  characters: Character[],
  scenes: Scene[],
  elements: StoryElement[],
): string {
  const parts: string[] = [];
  parts.push(`【镜头${index + 1}】${beat.title || "未命名"}`);

  const charPart = buildBeatCharacters(beat, characters);
  if (charPart) parts.push(charPart);

  const scenePart = buildBeatScene(beat, scenes);
  if (scenePart) parts.push(scenePart);

  parts.push(`内容：${beat.content || beat.description || "无描述"}`);
  parts.push(`时长：${beat.duration || 5}秒`);

  const shotPart = buildBeatShotInstruction(beat);
  if (shotPart) parts.push(shotPart);

  const bindingPart = buildBeatElementBindings(beat, elements);
  if (bindingPart) parts.push(bindingPart);

  const layerPart = buildBeatPromptLayers(beat);
  if (layerPart) parts.push(layerPart);

  const transitionPart = buildBeatTransition(beat);
  if (transitionPart) parts.push(transitionPart);

  parts.push(...buildBeatReference(beat));

  return parts.join("\n");
}

// ============= 特征锚定部分 =============

function buildFeatureAnchoringSection(
  featureAnchoring: FeatureAnchoringConfig,
): string {
  const parts: string[] = [];
  parts.push("");
  parts.push("【特征锚定约束 - 核心一致性保障】");
  parts.push(
    "以下参考图仅做特征锚点，约束角色的外观一致性，不绑定任何帧、不约束动作和镜头时序。",
  );

  for (const anchor of featureAnchoring.characterAnchors) {
    const featureDesc =
      anchor.featureTags.length > 0
        ? `核心特征：${anchor.featureTags.join("、")}。`
        : "";
    parts.push(
      `角色参考图：严格继承参考图中角色的外观、脸型、发型、服装、配色等全部视觉特征。${featureDesc}仅约束外观和风格，不约束动作姿态和镜头位置。一致性权重：${Math.round(anchor.weight * 100)}%`,
    );
  }

  if (featureAnchoring.propAnchors) {
    for (const anchor of featureAnchoring.propAnchors) {
      const featureDesc =
        anchor.featureTags && anchor.featureTags.length > 0
          ? `核心特征：${anchor.featureTags.join("、")}。`
          : "";
      parts.push(
        `道具参考图：严格继承参考图中道具的外观、材质、配色等全部视觉特征，仅约束外观，不约束位置和动作。${featureDesc}`,
      );
    }
  }

  if (featureAnchoring.previewImageUrl) {
    parts.push(
      `分镜预览图：作为本分镜的构图和画面参考，帮助理解镜头构图、角色位置和场景布局，但不作为首帧或尾帧绑定。预览图仅供参考，视频动态和镜头运动完全自由。`,
    );
  }

  parts.push(
    `特征一致性强度：${Math.round(featureAnchoring.featureConsistencyStrength * 100)}%，帧绑定状态：已禁用（参考图不绑定首帧/尾帧）`,
  );

  return "\n" + parts.join("\n");
}

// ============= 主函数 =============

export function generateProfessionalVideoPrompt(
  params: ProfessionalVideoPromptParams,
): string {
  const {
    story,
    beats,
    characters,
    scenes,
    elements,
    featureAnchoring,
    fixedImage,
    referenceVideo,
    template,
  } = params;

  const genreLabel = story.genre || "剧情";
  const toneLabel = story.tone || "中性";

  const globalElementSection =
    elements && elements.length > 0
      ? promptBuilder.buildGlobalElementDefinitions(elements)
      : "";

  const beatDetails = beats
    .map((beat, index) =>
      buildBeatDetail(beat, index, characters, scenes, elements ?? []),
    )
    .join("\n\n");

  const featureAnchoringSection =
    featureAnchoring?.enabled
      ? buildFeatureAnchoringSection(featureAnchoring)
      : "";

  const fixedDesc = fixedImage ? buildFixedImageDesc(fixedImage) : "";
  const refDesc = referenceVideo ? buildReferenceVideoDesc(referenceVideo) : "";
  const tplDesc = template ? buildTemplateDesc(template) : "";

  const aiEnhanceSectionParts: string[] = [];
  if (fixedDesc) aiEnhanceSectionParts.push(`【参考图片说明】\n${fixedDesc}`);
  const otherParts = [refDesc, tplDesc].filter(Boolean);
  if (otherParts.length > 0)
    aiEnhanceSectionParts.push(`【其他生成要求】\n${otherParts.join("\n")}`);

  const aiEnhanceSection =
    aiEnhanceSectionParts.length > 0
      ? `\n\n${aiEnhanceSectionParts.join("\n\n")}`
      : "";

  const globalSection = globalElementSection
    ? `\n\n${globalElementSection}`
    : "";

  return `创作一个${genreLabel}类型的${toneLabel}动画故事，总时长约${story.targetDuration}秒。

故事标题：${story.title || "未命名"}
故事简介：${story.description || "无"}

分镜详情：
${beatDetails}${globalSection}${featureAnchoringSection}${aiEnhanceSection}

请根据以上分镜信息，为每个镜头生成详细的视频生成提示词，要求：
1. 每个镜头的提示词要包含画面构图、角色动作、表情变化
2. 描述要具体可执行，便于AI视频模型理解
3. 注意镜头之间的连贯性和节奏感
4. 包含运镜和转场描述`;
}
