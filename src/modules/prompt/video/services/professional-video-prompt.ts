import {
  buildCharacterAppearanceDesc,
  buildSceneAtmosphereDesc,
  buildFixedImageDesc,
  buildReferenceVideoDesc,
  buildTemplateDesc,
} from "../../base";
import type { Character, FixedImageConfig, ReferenceVideoConfig, Scene, TemplateConfig, StoryBeat } from "@/domain/schemas";
import { getBeatCharacterIds } from "@/domain/utils";

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
