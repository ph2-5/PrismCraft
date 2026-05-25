import {
  buildCharacterFullDesc,
  buildCharacterAppearanceDesc,
  buildSceneAtmosphereDesc,
  buildSceneVisualDesc,
  buildElementEffectDesc,
  buildFixedImageDesc,
  buildReferenceVideoDesc,
  buildTemplateDesc,
  CAMERA_MOVEMENT_KEYWORDS,
  TRANSITION_KEYWORDS,
} from "../../base";
import { shotInstructionToPrompt } from "@/domain/utils";
import { promptBuilder } from "../../builder";
import type { Character, FeatureAnchoringConfig, FixedImageConfig, ReferenceVideoConfig, Scene, SceneElement, ShotInstructionTemplate, StoryBeat, StoryElement, TemplateConfig } from "@/domain/schemas";

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
  fixedImage?: FixedImageConfig;
  referenceVideo?: ReferenceVideoConfig;
  template?: TemplateConfig;
}

export function generateProfessionalVideoPrompt(
  params: ProfessionalVideoPromptParams,
): string {
  const {
    story,
    beats,
    characters,
    scenes,
    fixedImage,
    referenceVideo,
    template,
  } = params;

  const genreLabel = story.genre || "剧情";
  const toneLabel = story.tone || "中性";

  const beatDetails = beats
    .map((beat, index) => {
      const parts: string[] = [];
      parts.push(`【镜头${index + 1}】${beat.title || "未命名"}`);

      const charIds =
        beat.characters || (beat.character ? [beat.character] : []);
      const charDescs = charIds
        .map((id) => {
          const char = characters.find((c) => c.id === id);
          return char
            ? `${char.name}（${buildCharacterAppearanceDesc(char)}）`
            : null;
        })
        .filter(Boolean);
      if (charDescs.length > 0) parts.push(`角色：${charDescs.join("；")}`);

      const sceneObj = beat.scene
        ? scenes.find((s) => s.id === beat.scene)
        : null;
      if (sceneObj) {
        parts.push(
          `场景：${sceneObj.name}，${buildSceneAtmosphereDesc(sceneObj)}`,
        );
      }

      parts.push(`内容：${beat.content || beat.description || "无描述"}`);
      parts.push(`时长：${beat.duration || 5}秒`);

      return parts.join("\n");
    })
    .join("\n\n");

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

  return `创作一个${genreLabel}类型的${toneLabel}动画故事，总时长约${story.targetDuration}秒。

故事标题：${story.title || "未命名"}
故事简介：${story.description || "无"}

分镜详情：
${beatDetails}${aiEnhanceSection}

请根据以上分镜信息，为每个镜头生成详细的视频生成提示词，要求：
1. 每个镜头的提示词要包含画面构图、角色动作、表情变化
2. 描述要具体可执行，便于AI视频模型理解
3. 注意镜头之间的连贯性和节奏感
4. 包含运镜和转场描述`;
}

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
    fixedImage,
    referenceVideo,
    template,
  } = params;

  const genreLabel = story.genre || "剧情";
  const toneLabel = story.tone || "中性";

  const beatDetails = beats
    .map((beat, index) => {
      const parts: string[] = [];
      parts.push(`【镜头${index + 1}】${beat.title || "未命名"}`);

      if (beat.sceneId) {
        const sceneObj = scenes.find((s) => s.id === beat.sceneId);
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
          groups.get(group)!.push(el);
        });

        const sortedGroups = Array.from(groups.entries()).sort(
          ([a], [b]) => a - b,
        );

        if (sortedGroups.length > 1) {
          sortedGroups.forEach(([group, elements], groupIndex) => {
            const elementDescs = [...elements]
              .sort((a, b) => (a.timelineOrder ?? 0) - (b.timelineOrder ?? 0))
              .map((el) => {
                const elParts: string[] = [];
                if (el.type === "existing_character" && el.characterId) {
                  const char = characters.find((c) => c.id === el.characterId);
                  if (char)
                    elParts.push(
                      `${char.name}（${buildCharacterAppearanceDesc(char)}）`,
                    );
                } else {
                  elParts.push(el.name);
                }
                const effects = buildElementEffectDesc(el);
                if (effects) elParts.push(effects);
                return elParts.join("，");
              });
            const isFirst = groupIndex === 0;
            const hasMultipleElements = elements.length > 1;
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

      if (beat.camera) {
        const cameraObj =
          typeof beat.camera === "string"
            ? { movement: beat.camera }
            : beat.camera;
        const movement = cameraObj?.movement || "";
        const cameraKeyword = CAMERA_MOVEMENT_KEYWORDS[movement] || movement;
        if (cameraKeyword) parts.push(`运镜：${cameraKeyword}`);
      }

      if (beat.transition && beat.transition !== "无") {
        const transKeyword =
          TRANSITION_KEYWORDS[beat.transition] || beat.transition;
        parts.push(`转场：${transKeyword}`);
      }

      parts.push(`内容：${beat.description || beat.content || "无描述"}`);
      parts.push(`时长：${beat.duration || 5}秒`);

      return parts.join("\n");
    })
    .join("\n\n");

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

  return `创作一个${genreLabel}类型的${toneLabel}动画故事，总时长约${story.targetDuration}秒。

故事标题：${story.title || "未命名"}
故事简介：${story.description || "无"}

分镜详情（增强模式）：
${beatDetails}${aiEnhanceSection}

请根据以上详细的分镜信息，为每个镜头生成精确的视频生成提示词，要求：
1. 严格按照场景元素描述生成画面，保持角色外观一致性
2. 准确执行每个元素的动作、表情和对话
3. 按照指定的运镜方式拍摄
4. 在镜头之间使用指定的转场效果
5. 保持整体节奏和氛围的一致性`;
}

interface QuickVideoPromptParams {
  story: {
    title: string;
    description: string;
    genre: string;
    tone: string;
    targetDuration: number;
  };
  content: string;
  characters: Character[];
  scenes: Scene[];
  fixedImage?: FixedImageConfig;
  referenceVideo?: ReferenceVideoConfig;
  template?: TemplateConfig;
}

export function generateQuickVideoPrompt(
  params: QuickVideoPromptParams,
): string {
  const {
    story,
    content,
    characters,
    scenes,
    fixedImage,
    referenceVideo,
    template,
  } = params;

  const genreLabel = story.genre || "剧情";
  const toneLabel = story.tone || "中性";

  const contextParts: string[] = [];
  if (characters.length > 0) {
    contextParts.push(
      `涉及角色：${characters.map((c) => `${c.name}（${buildCharacterFullDesc(c)}）`).join("；")}`,
    );
  }
  if (scenes.length > 0) {
    contextParts.push(
      `涉及场景：${scenes.map((s) => `${s.name}（${buildSceneAtmosphereDesc(s)}）`).join("；")}`,
    );
  }
  const contextSection =
    contextParts.length > 0 ? `\n\n${contextParts.join("\n")}` : "";

  const aiEnhanceParts: string[] = [];
  const fixedDesc = fixedImage ? buildFixedImageDesc(fixedImage) : "";
  if (fixedDesc) aiEnhanceParts.push(fixedDesc);
  const refDesc = referenceVideo ? buildReferenceVideoDesc(referenceVideo) : "";
  if (refDesc) aiEnhanceParts.push(refDesc);
  const tplDesc = template ? buildTemplateDesc(template) : "";
  if (tplDesc) aiEnhanceParts.push(tplDesc);
  const aiEnhanceSection =
    aiEnhanceParts.length > 0
      ? `\n\nAI生成增强要求：\n${aiEnhanceParts.map((p, i) => `${i + 1}. ${p}`).join("\n")}`
      : "";

  return `创作一个${genreLabel}类型的${toneLabel}动画故事，总时长约${story.targetDuration}秒。

故事内容：
${content}${contextSection}${aiEnhanceSection}

请生成详细的动画分镜脚本，要求：
1. 将故事内容拆分为合理的镜头序列
2. 每个镜头包含具体的画面描述、角色动作和对话
3. 包含运镜方式和转场效果
4. 保持角色外观和场景氛围的一致性
5. 注意节奏控制，高潮部分适当延长`;
}

interface SingleBeatPromptParams {
  beat: StoryBeat;
  index: number;
  characters: Character[];
  scenes: Scene[];
  fixedImageConfig?: FixedImageConfig;
  referenceVideoConfig?: ReferenceVideoConfig;
  templateConfig?: TemplateConfig;
  isFirstShot?: boolean;
  previousLastFrameUrl?: string;
  featureAnchoring?: FeatureAnchoringConfig;
  elements?: StoryElement[];
  shotInstruction?: ShotInstructionTemplate;
  characterOutfits?: Record<string, string>;
}

export function generateSingleBeatPrompt(
  params: SingleBeatPromptParams,
): string {
  const {
    beat,
    index,
    characters,
    scenes,
    fixedImageConfig,
    referenceVideoConfig,
    templateConfig,
    featureAnchoring,
    shotInstruction,
    previousLastFrameUrl,
    elements,
  } = params;
  const parts: string[] = [];

  if (elements && elements.length > 0) {
    const globalElements =
      promptBuilder.buildGlobalElementDefinitions(elements);
    if (globalElements) {
      parts.push(globalElements);
      parts.push("");
    }
  }

  parts.push("【镜头 " + (index + 1) + "】" + (beat.title || "未命名镜头"));

  if (beat.shotType) {
    const shotTypeMap: Record<string, string> = {
      wide: "远景", "wide-shot": "远景",
      medium: "中景", "medium-shot": "中景",
      close: "特写", "close-up": "特写",
      "extreme-close": "大特写", "extreme-close-up": "大特写",
      "medium-close": "中近景", "medium-close-up": "中近景",
      "full-shot": "全景", full: "全景",
      "over-shoulder": "过肩镜头", ots: "过肩镜头",
      "point-of-view": "主观视角", pov: "主观视角",
      "two-shot": "双人镜头", "establishing": "建立镜头",
    };
    const shotLabel = shotTypeMap[beat.shotType] || beat.shotType;
    parts.push("景别：" + shotLabel);
  }

  if (beat.type) {
    const typeMap: Record<string, string> = {
      dialogue: "对话镜头", action: "动作镜头",
      transition: "转场镜头", establishing: "建立镜头",
      montage: "蒙太奇", flashback: "闪回",
      "point-of-view": "主观视角", narration: "旁白镜头",
    };
    const typeLabel = typeMap[beat.type] || beat.type;
    parts.push("镜头类型：" + typeLabel);
  }

  parts.push("时长：" + (beat.duration || 5) + " 秒");

  if (featureAnchoring?.enabled) {
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
  } else if (fixedImageConfig?.enabled) {
    const fixedDesc = buildFixedImageDesc(fixedImageConfig);
    if (fixedDesc) {
      parts.push("");
      parts.push("【参考图片说明】");
      parts.push(fixedDesc);
    }
  }

  if (shotInstruction) {
    parts.push("");
    parts.push("【镜头指令】");
    parts.push(shotInstructionToPrompt(shotInstruction));
  }

  const sceneId = beat.sceneId || beat.scene;
  if (sceneId) {
    const sceneObj = scenes.find((s) => s.id === sceneId);
    if (sceneObj) {
      parts.push("");
      parts.push("场景：" + sceneObj.name);
      const sceneDesc = buildSceneAtmosphereDesc(sceneObj);
      if (sceneDesc) parts.push("场景氛围：" + sceneDesc);
      const sceneVisual = buildSceneVisualDesc(sceneObj);
      if (sceneVisual) parts.push("场景视觉：" + sceneVisual);
    }
  }

  const charIds = beat.characters || (beat.character ? [beat.character] : []);
  if (charIds.length > 0) {
    const charDescs = charIds
      .map((id) => {
        const char = characters.find((c) => c.id === id);
        if (!char) return null;

        const outfitId = params.characterOutfits?.[id];
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

        return (
          charToUse.name + "（" + buildCharacterAppearanceDesc(charToUse) + "）"
        );
      })
      .filter(Boolean);
    if (charDescs.length > 0) {
      parts.push("角色：" + charDescs.join("；"));
    }
  }

  if (beat.sceneElements && beat.sceneElements.length > 0) {
    const elementDescs = [...beat.sceneElements]
      .sort(
        (a, b) =>
          (a.timelineOrder ?? a.order ?? 0) - (b.timelineOrder ?? b.order ?? 0),
      )
      .map((el) => {
        const elParts: string[] = [];
        if (el.type === "existing_character" && el.characterId) {
          const char = characters.find((c) => c.id === el.characterId);
          if (char) elParts.push(char.name);
        } else {
          elParts.push(el.name);
        }
        if (el.description) elParts.push(el.description);
        const effects = buildElementEffectDesc(el);
        if (effects) elParts.push(effects);
        return elParts.join("，");
      });
    parts.push("画面元素：" + elementDescs.join("；"));
  }

  if (beat.content) parts.push("内容：" + beat.content);
  if (beat.description) parts.push("详细描述：" + beat.description);

  if (beat.reference && beat.reference.direction !== "none") {
    parts.push("");
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
    parts.push("【镜头引用】本镜头引用" + dirLabel + "的" + ctLabel + "作为参考，保持视觉连贯性。");
    if (beat.reference.segmentDuration) {
      parts.push("引用片段时长：" + beat.reference.segmentDuration + "秒");
    }
    if (beat.reference.segmentPosition) {
      const posMap: Record<string, string> = { start: "开头", end: "结尾" };
      parts.push("引用位置：" + (posMap[beat.reference.segmentPosition] || beat.reference.segmentPosition));
    }
  }

  if (previousLastFrameUrl) {
    parts.push("");
    parts.push(
      "【上一分镜尾帧参考】本分镜的首帧画面应与上一分镜的尾帧画面保持视觉连贯，确保角色位置、姿态和场景布局的平滑过渡。",
    );
  }

  if (beat.camera && !shotInstruction) {
    const cameraObj =
      typeof beat.camera === "string" ? { movement: beat.camera } : beat.camera;
    const movement = cameraObj?.movement || "";
    const cameraKeyword = CAMERA_MOVEMENT_KEYWORDS[movement] || movement;
    if (cameraKeyword) parts.push("运镜：" + cameraKeyword);
  }

  if (beat.promptLayers) {
    parts.push("");
    parts.push("【提示词层级】");
    if (beat.promptLayers.coreElements)
      parts.push("核心元素：" + beat.promptLayers.coreElements);
    if (beat.promptLayers.cameraAction)
      parts.push("镜头动作：" + beat.promptLayers.cameraAction);
    if (beat.promptLayers.styleAtmosphere)
      parts.push("风格氛围：" + beat.promptLayers.styleAtmosphere);
  }

  const referenceParts: string[] = [];

  if (referenceVideoConfig?.enabled) {
    const refDesc = buildReferenceVideoDesc(referenceVideoConfig);
    if (refDesc) referenceParts.push(refDesc);
  }

  if (templateConfig?.enabled) {
    const tplDesc = buildTemplateDesc(templateConfig);
    if (tplDesc) referenceParts.push(tplDesc);
  }

  const referenceSection =
    referenceParts.length > 0
      ? "\n\n【参考素材说明】\n" + referenceParts.join("\n\n")
      : "";

  const isFeatureAnchored = featureAnchoring?.enabled;
  parts.push("");
  if (isFeatureAnchored) {
    parts.push(
      "请根据以上信息生成视频，要求：\n1. 严格按照分镜描述生成画面，参考图仅做特征约束不绑定帧\n2. 严格保持角色外观和场景氛围与参考图一致\n3. 准确执行运镜方式，镜头和动作完全自由\n4. 本分镜独立生成，不依赖其他分镜结果\n5. 避免画面崩坏和角色变形\n6. 风格统一，视觉连贯",
    );
  } else {
    parts.push(
      "请根据以上信息生成视频，要求：\n1. 严格按照分镜描述生成画面\n2. 保持角色外观和场景氛围的一致性\n3. 准确执行运镜方式\n4. 避免画面崩坏和角色变形\n5. 风格统一，视觉连贯",
    );
  }

  return parts.join("\n") + referenceSection;
}
