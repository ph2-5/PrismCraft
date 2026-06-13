import {
  buildCharacterAppearanceDesc,
  buildSceneAtmosphereDesc,
  buildSceneVisualDesc,
  buildElementEffectDesc,
  buildFixedImageDesc,
  buildReferenceVideoDesc,
  buildTemplateDesc,
  TRANSITION_KEYWORDS,
} from "../../base";
import { shotInstructionToPrompt, resolveShotInstruction } from "@/domain/utils";
import { promptBuilder } from "../../builder";
import type { Character, FeatureAnchoringConfig, FixedImageConfig, ReferenceVideoConfig, Scene, SceneElement, StoryBeat, StoryElement, TemplateConfig } from "@/domain/schemas";

interface EnhancedVideoPromptParams {
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

export function generateEnhancedVideoPrompt(
  params: EnhancedVideoPromptParams,
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
    .map((beat, index) => {
      const parts: string[] = [];
      parts.push(`【镜头${index + 1}】${beat.title || "未命名"}`);

      const resolvedShot = resolveShotInstruction(beat);
      if (resolvedShot) {
        const shotPrompt = shotInstructionToPrompt({
          shotSize: resolvedShot.shotSize,
          cameraMovement: resolvedShot.cameraMovement,
          cameraAngle: resolvedShot.cameraAngle,
        });
        if (shotPrompt) parts.push(`镜头指令：${shotPrompt}`);
      }

      if (beat.sceneId || beat.scene) {
        const sceneObj = scenes.find((s) => s.id === (beat.sceneId || beat.scene));
        if (sceneObj) {
          parts.push(
            `场景：${sceneObj.name}，${buildSceneAtmosphereDesc(sceneObj)}，${buildSceneVisualDesc(sceneObj)}`,
          );
        }
      }

      if (beat.sceneElements && beat.sceneElements.length > 0) {
        const groups = new Map<number, SceneElement[]>();
        beat.sceneElements.forEach((el) => {
          const group = el.timelineGroup ?? 0;
          if (!groups.has(group)) groups.set(group, []);
          const groupList = groups.get(group);
          if (groupList) groupList.push(el);
        });

        const sortedGroups = Array.from(groups.entries()).sort(
          ([a], [b]) => a - b,
        );

        if (sortedGroups.length > 1) {
          sortedGroups.forEach(([group, elementsInGroup], groupIndex) => {
            const elementDescs = [...elementsInGroup]
              .sort((a, b) => (a.timelineOrder ?? 0) - (b.timelineOrder ?? 0))
              .map((el) => {
                const elParts: string[] = [];
                if (el.type === "existing_character" && el.characterId) {
                  const char = characters.find((c) => c.id === el.characterId);
                  if (char)
                    elParts.push(
                      `${char.name}（${buildCharacterAppearanceDesc(char)}）`,
                    );
                  else
                    elParts.push(el.name || el.description || "未知角色");
                } else {
                  elParts.push(el.name);
                }
                const effects = buildElementEffectDesc(el);
                if (effects) elParts.push(effects);
                return elParts.join("，");
              });
            const isFirst = groupIndex === 0;
            const hasMultipleElements = elementsInGroup.length > 1;
            const label = hasMultipleElements ? "同时进行" : "进行";
            parts.push(
              `${isFirst ? "" : "→ "}时间${group + 1}：${elementDescs.join("；")}${hasMultipleElements ? `（${label}）` : ""}`,
            );
          });
        } else {
          const elementDescs = [...beat.sceneElements]
            .sort((a, b) => (a.timelineOrder ?? 0) - (b.timelineOrder ?? 0))
            .map((el) => {
              const elParts: string[] = [];
              if (el.type === "existing_character" && el.characterId) {
                const char = characters.find((c) => c.id === el.characterId);
                if (char)
                  elParts.push(
                    `${char.name}（${buildCharacterAppearanceDesc(char)}）`,
                  );
                else
                  elParts.push(el.name || el.description || "未知角色");
              } else {
                elParts.push(el.name);
              }
              const effects = buildElementEffectDesc(el);
              if (effects) elParts.push(effects);
              return elParts.join("，");
            });
          const hasMultipleElements = elementDescs.length > 1;
          parts.push(
            `场景元素：${elementDescs.join("；")}${hasMultipleElements ? "（同时进行）" : ""}`,
          );
        }
      }

      if (beat.elementBindings && elements && elements.length > 0) {
        const bindingDescs = Object.entries(beat.elementBindings)
          .map(([elementId, binding]) => {
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
          })
          .filter(Boolean);
        if (bindingDescs.length > 0) {
          parts.push(`元素绑定：${bindingDescs.join("；")}`);
        }
      }

      if (beat.transition && beat.transition !== "无") {
        const transKeyword =
          TRANSITION_KEYWORDS[beat.transition] || beat.transition;
        parts.push(`转场：${transKeyword}`);
      }

      parts.push(`内容：${beat.description || beat.content || "无描述"}`);
      parts.push(`时长：${beat.duration || 5}秒`);

      if (beat.promptLayers) {
        const layerParts: string[] = [];
        if (beat.promptLayers.coreElements)
          layerParts.push(`核心元素：${beat.promptLayers.coreElements}`);
        if (beat.promptLayers.cameraAction)
          layerParts.push(`镜头动作：${beat.promptLayers.cameraAction}`);
        if (beat.promptLayers.styleAtmosphere)
          layerParts.push(`风格氛围：${beat.promptLayers.styleAtmosphere}`);
        if (layerParts.length > 0) parts.push(`提示词层级：${layerParts.join("；")}`);
      }

      if (beat.reference && beat.reference.direction !== "none") {
        const directionMap: Record<string, string> = {
          previous: "上一个镜头",
          next: "下一个镜头",
          custom: "指定镜头",
        };
        const dirLabel = directionMap[beat.reference.direction] || "其他镜头";
        const contentTypeMap: Record<string, string> = {
          full_video: "完整视频",
          last_frame: "尾帧画面",
          first_frame: "首帧画面",
          video_segment: "视频片段",
        };
        const ctLabel = contentTypeMap[beat.reference.contentType] || beat.reference.contentType;
        parts.push(`镜头引用：引用${dirLabel}的${ctLabel}作为参考，保持视觉连贯性`);
        if (beat.reference.segmentDuration) {
          parts.push(`引用片段时长：${beat.reference.segmentDuration}秒`);
        }
      }

      return parts.join("\n");
    })
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

分镜详情（增强模式）：
${beatDetails}${globalSection}${featureAnchoringSection}${aiEnhanceSection}

请根据以上详细的分镜信息，为每个镜头生成精确的视频生成提示词，要求：
1. 严格按照场景元素描述生成画面，保持角色外观一致性
2. 准确执行每个元素的动作、表情和对话
3. 按照指定的运镜方式拍摄
4. 在镜头之间使用指定的转场效果
5. 保持整体节奏和氛围的一致性`;
}

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
