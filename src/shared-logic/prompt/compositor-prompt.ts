/**
 * Task 2A.9 — Compositor Prompt 拼装
 *
 * 复用 prompt-engine 的 buildCharacterFullDesc / buildSceneAtmosphereDesc / buildSceneVisualDesc
 * 拼装"角色 + 道具 + 场景 → 单图合成"的英文 prompt。
 *
 * 零依赖：仅依赖同目录的 prompt-engine 和 prompt-service 类型。
 */

import {
  joinParts,
  buildCharacterFullDesc,
  buildSceneAtmosphereDesc,
  buildSceneVisualDesc,
  QUALITY_TAGS_IMAGE,
  STYLE_KEYWORDS,
} from "./prompt-engine";
import type { CharacterInput, SceneInput } from "./prompt-service";

/** 道具输入（与 prop domain schema 对应，但保持零依赖） */
export interface PropInput {
  id?: string;
  name?: string;
  /** 类型：clothing / weapon / accessory / prop / other */
  type?: string;
  description?: string;
  /** 标签 */
  tags?: string[];
}

/** Compositor prompt 拼装入参 */
export interface CompositorPromptParams {
  /** 主角色（必填） */
  character: CharacterInput;
  /** 道具列表 */
  props?: PropInput[];
  /** 场景（可选） */
  scene?: SceneInput;
  /** 用户自定义补充 */
  extraPrompt?: string;
}

const PROP_TYPE_LABEL: Record<string, string> = {
  clothing: "Clothing/Outfit",
  weapon: "Weapon",
  accessory: "Accessory",
  prop: "Prop",
  other: "Item",
};

function buildPropDesc(prop: PropInput): string {
  const parts: string[] = [];
  const typeLabel = prop.type ? PROP_TYPE_LABEL[prop.type] || "Item" : "Item";
  parts.push(`${prop.name || "unnamed item"} (${typeLabel})`);
  if (prop.description) parts.push(prop.description);
  if (prop.tags && prop.tags.length > 0) {
    parts.push(`tags: ${prop.tags.join(", ")}`);
  }
  return parts.join(", ");
}

/**
 * 拼装 Compositor 合成 prompt（英文）。
 *
 * 结构：
 *   [Subject Character] 角色全描述
 *   [Character Requirements] 保持外观一致
 *   [Scene]（可选）场景氛围 + 视觉
 *   [Composited Items]（可选）道具列表
 *   [Extra Instructions]（可选）用户自定义
 *   [Quality Tags]
 */
export function generateCompositorPrompt(params: CompositorPromptParams): string {
  const { character, props = [], scene, extraPrompt } = params;
  const parts: string[] = [];

  // 1. 主角色
  const charDesc = buildCharacterFullDesc(character);
  const charImgNote = character.generatedImage
    ? `[Important] Keep character appearance fully consistent with reference image: ${character.name || "the character"}`
    : "";
  parts.push(
    `[Subject Character]\n${character.name || "A character"}: ${charDesc}${charImgNote ? `\n${charImgNote}` : ""}`,
  );
  parts.push(
    "[Character Requirements] Keep the appearance, clothing, hair, eye color, and features of the character fully consistent with the reference. Do not alter the character's identity.",
  );

  // 2. 场景
  if (scene) {
    const atmosphere = buildSceneAtmosphereDesc(scene);
    const visual = buildSceneVisualDesc(scene);
    const sceneImgNote = scene.generatedImage
      ? "[Important] Keep scene background fully consistent with reference image"
      : "";
    parts.push(
      `[Background Scene]\n${scene.name || "Scene"}: ${[atmosphere, visual].filter(Boolean).join(", ")}${sceneImgNote ? `\n${sceneImgNote}` : ""}`,
    );
  }

  // 3. 道具组合
  if (props.length > 0) {
    const propDescs = props.map((p) => `- ${buildPropDesc(p)}`).join("\n");
    parts.push(
      `[Composited Items]\n${propDescs}\n[Integration] Naturally integrate the above items with the character. Maintain correct scale, perspective, and lighting consistency.`,
    );
  }

  // 4. 用户自定义补充
  if (extraPrompt && extraPrompt.trim()) {
    parts.push(`[Extra Instructions]\n${extraPrompt.trim()}`);
  }

  // 5. 合成指令
  parts.push(
    "[Composition] Compose a single coherent image. High-quality composite, cinematic lighting, seamless integration, consistent style.",
  );

  // 6. 风格（如角色指定了 style）
  if (character.style) {
    const styleKw = STYLE_KEYWORDS[character.style.toLowerCase()];
    if (styleKw) parts.push(`[Style] ${styleKw}`);
  }

  // 7. 质量标签
  parts.push(`[Quality] ${QUALITY_TAGS_IMAGE.join(", ")}`);

  return joinParts(parts);
}
