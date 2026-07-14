import {
  joinParts,
  buildCharacterAppearanceDesc,
  buildSceneAtmosphereDesc,
  buildSceneVisualDesc,
  buildElementEffectDesc,
  buildFixedImageDesc,
  getStyleKeywords,
  QUALITY_TAGS_IMAGE,
} from "./prompt-vocabulary";
import { shotInstructionToPrompt, resolveShotInstruction } from "./shot-prompt";
import type { Character, FeatureAnchoringConfig, FixedImageConfig, Scene, SceneElement, ShotInstructionTemplate, StoryBeat, StoryElement } from "@/domain/schemas";

export function getBeatCharacterIds(beat: { characterIds?: string[] }): string[] {
  return beat.characterIds ?? [];
}

export interface BeatImagePromptParams {
  beat: StoryBeat;
  characters: Character[];
  scenes: Scene[];
  isEnhanced?: boolean;
  fixedImage?: FixedImageConfig;
  featureAnchoring?: FeatureAnchoringConfig;
  elements?: StoryElement[];
  shotInstruction?: ShotInstructionTemplate;
}

/** 构建特征锚定部分（角色/道具参考图约束） */
function buildFeatureAnchoringSection(config: FeatureAnchoringConfig): string[] {
  const parts: string[] = ["【特征锚定约束 - 生成分镜预览图，作为视频生成的构图参考】"];

  for (const anchor of config.characterAnchors) {
    const featureDesc = anchor.featureTags.length > 0
      ? `，核心特征：${anchor.featureTags.join("、")}`
      : "";
    parts.push(
      `角色参考图：严格继承参考图中角色的外观、脸型、发型、服装、配色等全部视觉特征${featureDesc}，仅调整构图和镜头角度`,
    );
  }

  if (config.propAnchors) {
    for (const anchor of config.propAnchors) {
      const featureDesc = anchor.featureTags && anchor.featureTags.length > 0
        ? `，核心特征：${anchor.featureTags.join("、")}`
        : "";
      parts.push(
        `道具参考图：严格继承参考图中道具的外观、材质、配色等全部视觉特征${featureDesc}，仅调整位置和角度`,
      );
    }
  }

  return parts;
}

/** 构建场景描述部分 */
function buildSceneSection(beat: StoryBeat, scenes: Scene[]): string[] {
  const sceneId = beat.sceneId;
  if (!sceneId) return [];
  const sceneObj = scenes.find((s) => s.id === sceneId);
  if (!sceneObj) return [];
  return [
    `场景：${sceneObj.name}，${sceneObj.description || ""}`,
    buildSceneAtmosphereDesc(sceneObj),
    buildSceneVisualDesc(sceneObj),
  ];
}

/** 构建单个元素描述（增强模式） */
function buildElementDesc(
  el: SceneElement,
  characters: Character[],
): string {
  const elParts: string[] = [];
  if (el.type === "existing_character" && el.characterId) {
    const char = characters.find((c) => c.id === el.characterId);
    if (char) {
      const charParts: string[] = [char.name];
      if (char.gender) charParts.push(char.gender);
      if (char.age) charParts.push(`${char.age}岁`);
      const appearance = buildCharacterAppearanceDesc(char);
      if (appearance) charParts.push(appearance);
      elParts.push(charParts.join("，"));
    }
  } else {
    elParts.push(el.name);
  }
  if (el.description) elParts.push(el.description);
  const effects = buildElementEffectDesc(el);
  if (effects) elParts.push(effects);
  return elParts.join("，");
}

/** 构建增强模式元素描述部分 */
function buildEnhancedElementsSection(beat: StoryBeat, characters: Character[]): string[] {
  if (!beat.sceneElements || beat.sceneElements.length === 0) return [];
  const elementDescs = [...beat.sceneElements]
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((el) => buildElementDesc(el, characters));
  return [`画面内容：${elementDescs.join("；")}`];
}

/** 构建普通模式角色描述部分 */
function buildCharacterSection(beat: StoryBeat, characters: Character[]): string[] {
  const charIds = getBeatCharacterIds(beat);
  const charDescs = charIds
    .map((id) => {
      const char = characters.find((c) => c.id === id);
      return char ? `${char.name}（${buildCharacterAppearanceDesc(char)}）` : null;
    })
    .filter(Boolean);
  return charDescs.length > 0 ? [`角色：${charDescs.join("；")}`] : [];
}

/** 构建解析后的镜头指令部分（增强模式） */
function buildResolvedShotSection(beat: StoryBeat): string[] {
  const resolvedShot = resolveShotInstruction(beat);
  if (!resolvedShot) return [];
  const shotPrompt = shotInstructionToPrompt({
    shotSize: resolvedShot.shotSize,
    cameraMovement: resolvedShot.cameraMovement,
    cameraAngle: resolvedShot.cameraAngle,
  });
  return shotPrompt ? [shotPrompt] : [];
}

/** 解析风格关键词 */
function resolveStyleKeywords(beat: StoryBeat, characters: Character[]): string[] {
  const charIds = getBeatCharacterIds(beat);
  const referencedChar = charIds
    .map((id) => characters.find((c) => c.id === id))
    .find((c) => c?.style);
  const style = referencedChar?.style || (characters.length > 0 ? characters[0]?.style : undefined) || "anime";
  return getStyleKeywords(style);
}

export function generateBeatImagePrompt(params: BeatImagePromptParams): string {
  const { beat, characters, scenes, isEnhanced, fixedImage, featureAnchoring, shotInstruction } = params;
  const parts: string[] = [];

  if (featureAnchoring?.enabled) {
    parts.push(...buildFeatureAnchoringSection(featureAnchoring));
  } else if (fixedImage?.enabled) {
    const desc = buildFixedImageDesc(fixedImage);
    if (desc) parts.push(desc);
  }

  if (shotInstruction) {
    parts.push(`镜头构图：${shotInstructionToPrompt(shotInstruction)}`);
  }

  parts.push(...buildSceneSection(beat, scenes));

  if (isEnhanced) {
    parts.push(...buildEnhancedElementsSection(beat, characters));
    parts.push(...buildResolvedShotSection(beat));
  } else {
    parts.push(...buildCharacterSection(beat, characters));
  }

  const contentPart = beat.content || beat.description || "";
  if (contentPart) parts.push(contentPart);

  const styleKeywords = resolveStyleKeywords(beat, characters);

  return joinParts([
    ...parts,
    ...styleKeywords,
    "animation still",
    "key visual",
    ...QUALITY_TAGS_IMAGE,
  ]);
}

export function generateSimpleBeatImagePrompt(
  beat: StoryBeat,
  characters: Character[],
  scenes: Scene[],
  frameType?: string,
): string {
  const parts: string[] = [];

  if (frameType) {
    parts.push(
      `这是动画${frameType}，请生成动作${frameType === "首帧" ? "开始" : "结束"}时的画面`,
    );
  }

  const simpleSceneId = beat.sceneId;
  if (simpleSceneId) {
    const sceneObj = scenes.find((s) => s.id === simpleSceneId);
    if (sceneObj) {
      parts.push(`场景：${sceneObj.name}，${sceneObj.description || ""}`);
      parts.push(buildSceneAtmosphereDesc(sceneObj));
    }
  }

  const charIds = getBeatCharacterIds(beat);
  const charDescs = charIds
    .map((id) => {
      const char = characters.find((c) => c.id === id);
      if (!char) return null;
      const appearance = buildCharacterAppearanceDesc(char);
      return appearance ? `${char.name}（${appearance}）` : char.name;
    })
    .filter(Boolean);
  if (charDescs.length > 0) parts.push(`角色：${charDescs.join("；")}`);

  const contentPart = beat.content || beat.description || "";
  if (contentPart) parts.push(contentPart);

  const charIdsForStyle = getBeatCharacterIds(beat);
  const referencedChar = charIdsForStyle
    .map((id) => characters.find((c) => c.id === id))
    .find((c) => c?.style);
  const style = referencedChar?.style || (characters.length > 0 ? characters[0]?.style : undefined) || "anime";
  const styleKeywords = getStyleKeywords(style);

  return joinParts([...parts, ...styleKeywords, "high quality", "detailed"]);
}
