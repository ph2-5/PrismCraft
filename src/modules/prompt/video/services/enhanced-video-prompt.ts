import {
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
import type { Character, FixedImageConfig, ReferenceVideoConfig, Scene, SceneElement, TemplateConfig, StoryBeat } from "@/domain/schemas";

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
          const groupList = groups.get(group);
          if (groupList) groupList.push(el);
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
