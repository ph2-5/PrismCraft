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
import type { Character, FeatureAnchoringConfig, FixedImageConfig, Scene, ShotInstructionTemplate, StoryBeat, StoryElement } from "@/domain/schemas";

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

export function generateBeatImagePrompt(params: BeatImagePromptParams): string {
  const {
    beat,
    characters,
    scenes,
    isEnhanced,
    fixedImage,
    featureAnchoring,
    shotInstruction,
  } = params;

  const parts: string[] = [];

  if (featureAnchoring?.enabled) {
    parts.push("【特征锚定约束 - 生成分镜预览图，作为视频生成的构图参考】");

    for (const anchor of featureAnchoring.characterAnchors) {
      const featureDesc =
        anchor.featureTags.length > 0
          ? `，核心特征：${anchor.featureTags.join("、")}`
          : "";
      parts.push(
        `角色参考图：严格继承参考图中角色的外观、脸型、发型、服装、配色等全部视觉特征${featureDesc}，仅调整构图和镜头角度`,
      );
    }

    if (featureAnchoring.propAnchors) {
      for (const anchor of featureAnchoring.propAnchors) {
        const featureDesc =
          anchor.featureTags && anchor.featureTags.length > 0
            ? `，核心特征：${anchor.featureTags.join("、")}`
            : "";
        parts.push(
          `道具参考图：严格继承参考图中道具的外观、材质、配色等全部视觉特征${featureDesc}，仅调整位置和角度`,
        );
      }
    }
  } else if (fixedImage?.enabled) {
    const fixedImageDesc = buildFixedImageDesc(fixedImage);
    if (fixedImageDesc) {
      parts.push(fixedImageDesc);
    }
  }

  if (shotInstruction) {
    parts.push(`镜头构图：${shotInstructionToPrompt(shotInstruction)}`);
  }

  const sceneId = beat.sceneId || beat.scene;
  if (sceneId) {
    const sceneObj = scenes.find((s) => s.id === sceneId);
    if (sceneObj) {
      parts.push(`场景：${sceneObj.name}，${sceneObj.description || ""}`);
      parts.push(buildSceneAtmosphereDesc(sceneObj));
      parts.push(buildSceneVisualDesc(sceneObj));
    }
  }

  if (isEnhanced && beat.sceneElements && beat.sceneElements.length > 0) {
    const elementDescs = [...beat.sceneElements]
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map((el) => {
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
      });
    parts.push(`画面内容：${elementDescs.join("；")}`);
  } else {
    const charIds = getBeatCharacterIds(beat);
    const charDescs = charIds
      .map((id) => {
        const char = characters.find((c) => c.id === id);
        return char
          ? `${char.name}（${buildCharacterAppearanceDesc(char)}）`
          : null;
      })
      .filter(Boolean);
    if (charDescs.length > 0) parts.push(`角色：${charDescs.join("；")}`);
  }

  if (isEnhanced) {
    const resolvedShot = resolveShotInstruction(beat);
    if (resolvedShot) {
      const shotPrompt = shotInstructionToPrompt({
        shotSize: resolvedShot.shotSize,
        cameraMovement: resolvedShot.cameraMovement,
        cameraAngle: resolvedShot.cameraAngle,
      });
      if (shotPrompt) parts.push(shotPrompt);
    }
  }

  const contentPart = beat.content || beat.description || "";
  if (contentPart) parts.push(contentPart);

  const charIds = getBeatCharacterIds(beat);
  const referencedChar = charIds
    .map((id) => characters.find((c) => c.id === id))
    .find((c) => c?.style);
  const style = referencedChar?.style || (characters.length > 0 ? characters[0]?.style : undefined) || "anime";
  const styleKeywords = getStyleKeywords(style);

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

  const simpleSceneId = beat.sceneId || beat.scene;
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
