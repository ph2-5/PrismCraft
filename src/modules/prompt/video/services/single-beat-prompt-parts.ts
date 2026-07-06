import {
  buildCharacterAppearanceDesc,
  buildSceneAtmosphereDesc,
  buildSceneVisualDesc,
  buildElementEffectDesc,
  buildFixedImageDesc,
  buildReferenceVideoDesc,
  buildTemplateDesc,
} from "../../base";
import {
  shotInstructionToPrompt,
  resolveShotInstruction,
  SHOT_SIZE_OPTIONS,
  getBeatCharacterIds,
} from "@/domain/utils";
import { promptBuilder } from "../../builder";
import type {
  Character,
  FeatureAnchoringConfig,
  FixedImageConfig,
  ReferenceVideoConfig,
  Scene,
  SceneElement,
  ShotInstructionTemplate,
  StoryBeat,
  StoryElement,
  TemplateConfig,
} from "@/domain/schemas";

const BEAT_TYPE_MAP: Record<string, string> = {
  dialogue: "对话镜头",
  action: "动作镜头",
  transition: "转场镜头",
  establishing: "建立镜头",
  montage: "蒙太奇",
  flashback: "闪回",
  "point-of-view": "主观视角",
  narration: "旁白镜头",
};

const TRANSITION_TYPE_MAP: Record<string, string> = {
  cut: "硬切",
  dissolve: "溶解",
  wipe: "擦除",
  fade: "淡入淡出",
};

const REFERENCE_DIRECTION_MAP: Record<string, string> = {
  previous: "上一个镜头",
  next: "下一个镜头",
  custom: "指定镜头",
};

const REFERENCE_CONTENT_TYPE_MAP: Record<string, string> = {
  full_video: "完整视频",
  last_frame: "尾帧画面",
  first_frame: "首帧画面",
  video_segment: "视频片段",
};

const SEGMENT_POSITION_MAP: Record<string, string> = {
  start: "开头",
  end: "结尾",
};

const FEATURE_ANCHORED_REQUIREMENTS =
  "请根据以上信息生成视频，要求：\n1. 严格按照分镜描述生成画面，参考图仅做特征约束不绑定帧\n2. 严格保持角色外观和场景氛围与参考图一致\n3. 准确执行运镜方式，镜头和动作完全自由\n4. 本分镜独立生成，不依赖其他分镜结果\n5. 避免画面崩坏和角色变形\n6. 风格统一，视觉连贯";

const STANDARD_REQUIREMENTS =
  "请根据以上信息生成视频，要求：\n1. 严格按照分镜描述生成画面\n2. 保持角色外观和场景氛围的一致性\n3. 准确执行运镜方式\n4. 避免画面崩坏和角色变形\n5. 风格统一，视觉连贯";

export function appendGlobalElements(
  parts: string[],
  elements?: StoryElement[],
): void {
  if (!elements || elements.length === 0) return;
  const globalElements = promptBuilder.buildGlobalElementDefinitions(elements);
  if (!globalElements) return;
  parts.push(globalElements);
  parts.push("");
}

export function appendBeatHeader(
  parts: string[],
  beat: StoryBeat,
  index: number,
): void {
  parts.push("【镜头 " + (index + 1) + "】" + (beat.title || "未命名镜头"));
  if (beat.type) {
    const typeLabel = BEAT_TYPE_MAP[beat.type] || beat.type;
    parts.push("镜头类型：" + typeLabel);
  }
  parts.push("时长：" + (beat.duration || 5) + " 秒");
}

export function appendFeatureAnchoring(
  parts: string[],
  featureAnchoring: FeatureAnchoringConfig,
): void {
  parts.push("");
  parts.push("【特征锚定约束 - 核心一致性保障】");
  parts.push(
    "以下参考图仅做特征锚点，约束角色的外观一致性，不绑定任何帧、不约束动作和镜头时序。",
  );
  appendCharacterAnchors(parts, featureAnchoring);
  appendPropAnchors(parts, featureAnchoring);
  if (featureAnchoring.previewImageUrl) {
    parts.push(
      "分镜预览图：作为本分镜的构图和画面参考，帮助理解镜头构图、角色位置和场景布局，但不作为首帧或尾帧绑定。预览图仅供参考，视频动态和镜头运动完全自由。",
    );
  }
  parts.push(
    "特征一致性强度：" +
      Math.round(featureAnchoring.featureConsistencyStrength * 100) +
      "%，帧绑定状态：已禁用（参考图不绑定首帧/尾帧）",
  );
}

function appendCharacterAnchors(
  parts: string[],
  featureAnchoring: FeatureAnchoringConfig,
): void {
  for (const anchor of featureAnchoring.characterAnchors) {
    const featureDesc =
      anchor.featureTags.length > 0
        ? `核心特征：${anchor.featureTags.join("、")}。`
        : "";
    parts.push(
      `角色参考图：严格继承参考图中角色的外观、脸型、发型、服装、配色等全部视觉特征。${featureDesc}仅约束外观和风格，不约束动作姿态和镜头位置。一致性权重：${Math.round(anchor.weight * 100)}%`,
    );
  }
}

function appendPropAnchors(
  parts: string[],
  featureAnchoring: FeatureAnchoringConfig,
): void {
  if (!featureAnchoring.propAnchors) return;
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

export function appendFixedImageSection(
  parts: string[],
  fixedImageConfig?: FixedImageConfig,
): void {
  if (!fixedImageConfig?.enabled) return;
  const fixedDesc = buildFixedImageDesc(fixedImageConfig);
  if (!fixedDesc) return;
  parts.push("");
  parts.push("【参考图片说明】");
  parts.push(fixedDesc);
}

export function appendShotInstruction(
  parts: string[],
  beat: StoryBeat,
  shotInstruction?: ShotInstructionTemplate,
): void {
  const resolvedShot = shotInstruction
    ? {
        shotSize: shotInstruction.shotSize,
        cameraMovement: shotInstruction.cameraMovement,
        cameraAngle: shotInstruction.cameraAngle,
      }
    : resolveShotInstruction(beat);
  if (!resolvedShot) return;
  const shotLabel = SHOT_SIZE_OPTIONS.find(
    (o) => o.value === resolvedShot.shotSize,
  )?.label;
  const shotPrompt = shotInstructionToPrompt({
    shotSize: resolvedShot.shotSize,
    cameraMovement: resolvedShot.cameraMovement,
    cameraAngle: resolvedShot.cameraAngle,
  });
  if (!shotPrompt) return;
  parts.push("");
  parts.push("【镜头指令】");
  if (shotLabel) parts.push("景别：" + shotLabel);
  parts.push(shotPrompt);
}

export function appendSceneInfo(
  parts: string[],
  beat: StoryBeat,
  scenes: Scene[],
): void {
  const sceneId = beat.sceneId;
  if (!sceneId) return;
  const sceneObj = scenes.find((s) => s.id === sceneId);
  if (!sceneObj) return;
  parts.push("");
  parts.push("场景：" + sceneObj.name);
  const sceneDesc = buildSceneAtmosphereDesc(sceneObj);
  if (sceneDesc) parts.push("场景氛围：" + sceneDesc);
  const sceneVisual = buildSceneVisualDesc(sceneObj);
  if (sceneVisual) parts.push("场景视觉：" + sceneVisual);
}

export function appendSceneTransitions(
  parts: string[],
  beat: StoryBeat,
  scenes: Scene[],
): void {
  if (!beat.sceneTransitions || beat.sceneTransitions.length === 0) return;
  const transitionLines = beat.sceneTransitions.map((t, i) => {
    const targetScene = scenes.find((s) => s.id === t.sceneId);
    const sceneName = targetScene?.name || "未知场景";
    const typeLabel = t.transitionType
      ? TRANSITION_TYPE_MAP[t.transitionType] || t.transitionType
      : "转场";
    const desc = t.description ? ` — ${t.description}` : "";
    return `${i + 1}. ${typeLabel}至"${sceneName}"${desc}`;
  });
  parts.push("");
  parts.push("【场景转换】");
  parts.push(...transitionLines);
}

export function appendCharacters(
  parts: string[],
  beat: StoryBeat,
  characters: Character[],
  characterOutfits?: Record<string, string>,
): void {
  const charIds = getBeatCharacterIds(beat);
  if (charIds.length === 0) return;
  const charDescs = charIds
    .map((id) => buildCharacterDesc(id, characters, characterOutfits))
    .filter(Boolean);
  if (charDescs.length > 0) {
    parts.push("角色：" + charDescs.join("；"));
  }
}

function buildCharacterDesc(
  id: string,
  characters: Character[],
  characterOutfits?: Record<string, string>,
): string | null {
  const char = characters.find((c) => c.id === id);
  if (!char) return null;
  const outfitId = characterOutfits?.[id];
  let charToUse = char;
  if (outfitId && char.outfits) {
    const outfit = char.outfits.find((o) => o.id === outfitId);
    if (outfit) {
      charToUse = {
        ...char,
        appearance: {
          ...char.appearance,
          clothing: outfit.clothing,
        },
      };
    }
  }
  return charToUse.name + "（" + buildCharacterAppearanceDesc(charToUse) + "）";
}

export function appendSceneElements(
  parts: string[],
  beat: StoryBeat,
  characters: Character[],
): void {
  if (!beat.sceneElements || beat.sceneElements.length === 0) return;
  const elementDescs = [...beat.sceneElements]
    .sort(
      (a, b) =>
        (a.timelineOrder ?? a.order ?? 0) - (b.timelineOrder ?? b.order ?? 0),
    )
    .map((el) => buildSceneElementDesc(el, characters));
  parts.push("画面元素：" + elementDescs.join("；"));
}

function buildSceneElementDesc(
  el: SceneElement,
  characters: Character[],
): string {
  const elParts: string[] = [];
  if (el.type === "existing_character" && el.characterId) {
    const char = characters.find((c) => c.id === el.characterId);
    if (char) {
      elParts.push(char.name);
    } else if (el.name) {
      elParts.push(el.name);
    }
  } else {
    elParts.push(el.name);
  }
  if (el.description) elParts.push(el.description);
  const effects = buildElementEffectDesc(el);
  if (effects) elParts.push(effects);
  return elParts.join("，");
}

export function appendContentDescription(
  parts: string[],
  beat: StoryBeat,
): void {
  if (beat.content) parts.push("内容：" + beat.content);
  if (beat.description) parts.push("详细描述：" + beat.description);
}

export function appendBeatReference(
  parts: string[],
  beat: StoryBeat,
): void {
  if (!beat.reference || beat.reference.direction === "none") return;
  parts.push("");
  const dirLabel =
    REFERENCE_DIRECTION_MAP[beat.reference.direction] || "其他镜头";
  const ctLabel =
    REFERENCE_CONTENT_TYPE_MAP[beat.reference.contentType] ||
    beat.reference.contentType;
  parts.push(
    "【镜头引用】本镜头引用" +
      dirLabel +
      "的" +
      ctLabel +
      "作为参考，保持视觉连贯性。",
  );
  if (beat.reference.segmentDuration) {
    parts.push("引用片段时长：" + beat.reference.segmentDuration + "秒");
  }
  if (beat.reference.segmentPosition) {
    const posLabel =
      SEGMENT_POSITION_MAP[beat.reference.segmentPosition] ||
      beat.reference.segmentPosition;
    parts.push("引用位置：" + posLabel);
  }
}

export function appendPreviousLastFrameRef(
  parts: string[],
  previousLastFrameUrl?: string,
): void {
  if (!previousLastFrameUrl) return;
  parts.push("");
  parts.push(
    "【上一分镜尾帧参考】本分镜的首帧画面应与上一分镜的尾帧画面保持视觉连贯，确保角色位置、姿态和场景布局的平滑过渡。",
  );
}

export function appendPromptLayers(parts: string[], beat: StoryBeat): void {
  if (!beat.promptLayers) return;
  parts.push("");
  parts.push("【提示词层级】");
  if (beat.promptLayers.coreElements)
    parts.push("核心元素：" + beat.promptLayers.coreElements);
  if (beat.promptLayers.cameraAction)
    parts.push("镜头动作：" + beat.promptLayers.cameraAction);
  if (beat.promptLayers.styleAtmosphere)
    parts.push("风格氛围：" + beat.promptLayers.styleAtmosphere);
}

export function buildReferenceSection(
  referenceVideoConfig?: ReferenceVideoConfig,
  templateConfig?: TemplateConfig,
): string {
  const referenceParts: string[] = [];
  if (referenceVideoConfig?.enabled) {
    const refDesc = buildReferenceVideoDesc(referenceVideoConfig);
    if (refDesc) referenceParts.push(refDesc);
  }
  if (templateConfig?.enabled) {
    const tplDesc = buildTemplateDesc(templateConfig);
    if (tplDesc) referenceParts.push(tplDesc);
  }
  return referenceParts.length > 0
    ? "\n\n【参考素材说明】\n" + referenceParts.join("\n\n")
    : "";
}

export function appendGenerationRequirements(
  parts: string[],
  featureAnchoring?: FeatureAnchoringConfig,
): void {
  parts.push("");
  const requirements = featureAnchoring?.enabled
    ? FEATURE_ANCHORED_REQUIREMENTS
    : STANDARD_REQUIREMENTS;
  parts.push(requirements);
}
