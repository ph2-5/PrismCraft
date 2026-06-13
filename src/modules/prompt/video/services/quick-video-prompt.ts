import {
  buildCharacterFullDesc,
  buildSceneAtmosphereDesc,
  buildFixedImageDesc,
  buildReferenceVideoDesc,
  buildTemplateDesc,
} from "../../base";
import { shotInstructionToPrompt } from "@/domain/utils";
import type { Character, FixedImageConfig, ReferenceVideoConfig, Scene, ShotInstructionTemplate, TemplateConfig } from "@/domain/schemas";

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
  shotInstruction?: ShotInstructionTemplate;
  promptLayers?: { coreElements: string; cameraAction: string; styleAtmosphere?: string };
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
    shotInstruction,
    promptLayers,
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

  if (shotInstruction) {
    const shotPrompt = shotInstructionToPrompt(shotInstruction);
    if (shotPrompt) contextParts.push(`镜头指令：${shotPrompt}`);
  }

  if (promptLayers?.styleAtmosphere) {
    contextParts.push(`风格氛围：${promptLayers.styleAtmosphere}`);
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
