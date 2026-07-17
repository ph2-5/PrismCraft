/**
 * Task 2A.9 — Compositor Engine Service
 *
 * 业务编排：
 *   1. 接收 CompositorInput（角色 + 道具 + 场景 + 用户补充）
 *   2. 从 storage 加载完整实体（Character / Scene / Prop）
 *   3. 转换为 prompt-service 可识别的 CharacterInput / SceneInput / PropInput
 *   4. 调用 generateCompositorPrompt 生成英文 prompt
 *   5. 调用 container.imageProvider.generateImage 生成图像
 *   6. 通过 @/modules/asset 的 createAsset 持久化到 generation_assets 表
 *   7. 返回 CompositorResult
 *
 * 依赖：
 *   - @/domain/schemas: Character / Scene / Prop 类型
 *   - @/infrastructure/di: container.imageProvider / characterStorage / sceneStorage
 *   - @/shared-logic/prompt: generateCompositorPrompt
 *   - @/modules/asset: createAsset（持久化生成结果）
 */

import { container } from "@/infrastructure/di";
import type { Character, Scene, Prop, CharacterVariant } from "@/domain/schemas";
import {
  generateCompositorPrompt,
  type CharacterInput,
  type SceneInput,
  type PropInput,
} from "@/shared-logic/prompt";
import { errorLogger, extractErrorMessage } from "@/shared/error-logger";
import { createAsset } from "@/modules/asset";
import type {
  CompositorInput,
  CompositorResult,
} from "../domain/compositor.schema";

/**
 * 将 Character 实体映射为 CharacterInput（prompt-service 输入）。
 * Task 2A.10: 如果传入 variant，用 variant 的 promptFragment 覆盖 clothing，
 * 并优先使用 variant 的参考图作为 generatedImage（保持外观一致性）。
 */
function characterToInput(c: Character, variant?: CharacterVariant | null): CharacterInput {
  const baseClothing = c.appearance?.clothing || undefined;
  const clothing = variant?.promptFragment
    ? variant.promptFragment
    : baseClothing;
  const generatedImage =
    variant?.imageUrl ||
    variant?.referenceImagePath ||
    c.generatedImage;

  return {
    name: c.name,
    gender: c.gender || undefined,
    age: c.age,
    style: c.style || undefined,
    description: c.description || undefined,
    personality: c.personality,
    appearance: {
      hairColor: c.appearance?.hairColor || undefined,
      hairStyle: c.appearance?.hairStyle || undefined,
      eyeColor: c.appearance?.eyeColor || undefined,
      build: c.appearance?.build || undefined,
      clothing,
    },
    generatedImage,
  };
}

/** 将 Scene 实体映射为 SceneInput */
function sceneToInput(s: Scene): SceneInput {
  return {
    name: s.name,
    type: s.type || undefined,
    timeOfDay: s.timeOfDay || undefined,
    weather: s.weather || undefined,
    mood: s.mood || undefined,
    lighting: s.lighting || undefined,
    atmosphere: s.atmosphere || undefined,
    description: s.description || undefined,
    elements: s.elements,
    colors: s.colors,
    generatedImage: s.generatedImage,
  };
}

/** 将 Prop 实体映射为 PropInput */
function propToInput(p: Prop): PropInput {
  return {
    id: p.id,
    name: p.name,
    type: p.type,
    description: p.description || undefined,
    tags: p.tags,
  };
}

export interface ComposeOptions {
  /** AbortSignal 用于取消 */
  signal?: AbortSignal;
}

/**
 * 执行一次合成：拼装 prompt → 调用图像模型 → 持久化结果
 *
 * @throws 当角色未找到、图像生成失败或持久化失败时抛出
 */
export async function composeImage(
  input: CompositorInput,
  options: ComposeOptions = {},
): Promise<CompositorResult> {
  const { signal } = options;

  // 1. 加载角色（必填）
  const character = await container.characterStorage.getCharacterById(input.characterId);
  if (!character) {
    throw new Error(`[Compositor] 角色不存在: ${input.characterId}`);
  }
  if (signal?.aborted) throw new Error("[Compositor] 已取消");

  // Task 2A.10: 加载角色变体（可选）
  let variant: CharacterVariant | null = null;
  if (input.characterVariantId) {
    variant = await container.characterVariantStorage.getVariantById(input.characterVariantId);
    if (!variant) {
      errorLogger.warn(`[Compositor] 角色变体不存在: ${input.characterVariantId}，将使用基础角色`);
    } else if (variant.characterId !== input.characterId) {
      errorLogger.warn(`[Compositor] 变体 ${input.characterVariantId} 不属于角色 ${input.characterId}，将忽略变体`);
      variant = null;
    }
  }
  if (signal?.aborted) throw new Error("[Compositor] 已取消");

  // 2. 加载场景（可选）
  let scene: Scene | null = null;
  if (input.sceneId) {
    scene = await container.sceneStorage.getSceneById(input.sceneId);
    if (!scene) {
      errorLogger.warn(`[Compositor] 场景不存在: ${input.sceneId}，将忽略场景`);
    }
  }
  if (signal?.aborted) throw new Error("[Compositor] 已取消");

  // 3. 加载道具列表（可选）
  const props: Prop[] = [];
  if (input.propIds && input.propIds.length > 0) {
    for (const propId of input.propIds) {
      const prop = await container.propStorage.getPropById(propId);
      if (prop) {
        props.push(prop);
      } else {
        errorLogger.warn(`[Compositor] 道具不存在: ${propId}，跳过`);
      }
    }
  }
  if (signal?.aborted) throw new Error("[Compositor] 已取消");

  // 4. 拼装 prompt（Task 2A.10: 如果有变体，使用变体的 promptFragment + 参考图覆盖角色基础设定）
  const prompt = generateCompositorPrompt({
    character: characterToInput(character, variant),
    props: props.map(propToInput),
    scene: scene ? sceneToInput(scene) : undefined,
    extraPrompt: input.extraPrompt,
  });

  // 5. 调用图像生成
  const result = await container.imageProvider.generateImage(prompt, "compositor", {
    providerId: input.provider,
    modelId: input.modelId,
    purpose: "compositor",
  });

  if (signal?.aborted) throw new Error("[Compositor] 已取消");

  if (!result.success) {
    throw new Error(
      `[Compositor] 图像生成失败: ${result.error || result.message || "未知错误"}`,
    );
  }

  const imageUrl = result.data.imageUrl || "";
  if (!imageUrl) {
    throw new Error("[Compositor] 图像生成返回空 URL");
  }

  // 6. 持久化到 generation_assets（type=compositor_result, sourceType=composited）
  const createdAt = new Date().toISOString();
  let assetId = `compositor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    const asset = await createAsset({
      type: "compositor_result",
      sourceType: "composited",
      url: imageUrl,
      prompt,
      modelId: input.modelId,
      providerId: input.provider,
      metadata: {
        characterId: input.characterId,
        characterVariantId: input.characterVariantId,
        propIds: input.propIds ?? [],
        sceneId: input.sceneId,
        extraPrompt: input.extraPrompt,
        resolution: input.resolution,
      },
      characterId: input.characterId,
      characterVariantId: input.characterVariantId,
      sceneId: input.sceneId,
    });
    assetId = asset.id;
  } catch (err) {
    // 持久化失败不阻塞返回，只记录日志（用户已得到生成图）
    errorLogger.warn("[Compositor] 生成结果持久化失败", err);
  }

  // 7. 返回结果
  return {
    id: assetId,
    characterId: input.characterId,
    characterVariantId: input.characterVariantId,
    propIds: input.propIds ?? [],
    sceneId: input.sceneId,
    imageUrl,
    prompt,
    createdAt,
  };
}

/**
 * 仅拼装 prompt（不调用模型，用于 UI 预览要发送给模型的 prompt）
 */
export async function buildCompositorPrompt(
  input: CompositorInput,
): Promise<string> {
  const character = await container.characterStorage.getCharacterById(input.characterId);
  if (!character) {
    throw new Error(`[Compositor] 角色不存在: ${input.characterId}`);
  }

  let scene: Scene | null = null;
  if (input.sceneId) {
    scene = await container.sceneStorage.getSceneById(input.sceneId);
  }

  const props: Prop[] = [];
  if (input.propIds && input.propIds.length > 0) {
    for (const propId of input.propIds) {
      const prop = await container.propStorage.getPropById(propId);
      if (prop) props.push(prop);
    }
  }

  return generateCompositorPrompt({
    character: characterToInput(character),
    props: props.map(propToInput),
    scene: scene ? sceneToInput(scene) : undefined,
    extraPrompt: input.extraPrompt,
  });
}

/**
 * 提取错误信息（供 UI 显示）
 */
export function getCompositorErrorMessage(err: unknown): string {
  return extractErrorMessage(err);
}
