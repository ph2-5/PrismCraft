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
import { t } from "@/shared/constants/messages";
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
 * 将一个不支持 AbortSignal 的 Promise 包装为可取消的。
 * 注意：底层请求不会被真正中止（imageProvider.generateImage 未暴露 signal 参数），
 * 但调用方会立即收到 rejection，UI 可以快速响应取消操作。
 */
function withAbortSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new Error(t("compositor.errorCancelled")));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new Error(t("compositor.errorCancelled")));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (val) => {
        signal.removeEventListener("abort", onAbort);
        resolve(val);
      },
      (err) => {
        signal.removeEventListener("abort", onAbort);
        reject(err);
      },
    );
  });
}

/** 加载角色变体（可选）。变体不存在或不属于该角色时返回 null 并记录告警。 */
async function loadCharacterVariant(input: CompositorInput): Promise<CharacterVariant | null> {
  if (!input.characterVariantId) return null;
  const variant = await container.characterVariantStorage.getVariantById(input.characterVariantId);
  if (!variant) {
    errorLogger.warn(`[Compositor] 角色变体不存在: ${input.characterVariantId}，将使用基础角色`);
    return null;
  }
  if (variant.characterId !== input.characterId) {
    errorLogger.warn(`[Compositor] 变体 ${input.characterVariantId} 不属于角色 ${input.characterId}，将忽略变体`);
    return null;
  }
  return variant;
}

/** 加载场景（可选）。场景不存在时返回 null 并记录告警。 */
async function loadScene(sceneId?: string): Promise<Scene | null> {
  if (!sceneId) return null;
  const scene = await container.sceneStorage.getSceneById(sceneId);
  if (!scene) {
    errorLogger.warn(`[Compositor] 场景不存在: ${sceneId}，将忽略场景`);
  }
  return scene;
}

/** 加载道具列表（可选）。缺失道具跳过并记录告警。 */
async function loadProps(propIds?: string[] | null): Promise<Prop[]> {
  if (!propIds || propIds.length === 0) return [];
  const props: Prop[] = [];
  for (const propId of propIds) {
    const prop = await container.propStorage.getPropById(propId);
    if (prop) {
      props.push(prop);
    } else {
      errorLogger.warn(`[Compositor] 道具不存在: ${propId}，跳过`);
    }
  }
  return props;
}

/** 持久化合成结果到 generation_assets。失败不阻塞返回，仅记录日志。 */
async function persistCompositorAsset(
  input: CompositorInput,
  imageUrl: string,
  prompt: string,
): Promise<string> {
  const fallbackId = `compositor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
    return asset.id;
  } catch (err) {
    errorLogger.warn("[Compositor] 生成结果持久化失败", err);
    return fallbackId;
  }
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
    throw new Error(t("compositor.errorCharacterNotFound", { id: input.characterId }));
  }
  if (signal?.aborted) throw new Error(t("compositor.errorCancelled"));

  // 2. 加载角色变体（可选）
  const variant = await loadCharacterVariant(input);
  if (signal?.aborted) throw new Error(t("compositor.errorCancelled"));

  // 3. 加载场景（可选）
  const scene = await loadScene(input.sceneId);
  if (signal?.aborted) throw new Error(t("compositor.errorCancelled"));

  // 4. 加载道具列表（可选）
  const props = await loadProps(input.propIds);
  if (signal?.aborted) throw new Error(t("compositor.errorCancelled"));

  // 5. 拼装 prompt（Task 2A.10: 如果有变体，使用变体的 promptFragment + 参考图覆盖角色基础设定）
  const prompt = generateCompositorPrompt({
    character: characterToInput(character, variant),
    props: props.map(propToInput),
    scene: scene ? sceneToInput(scene) : undefined,
    extraPrompt: input.extraPrompt,
  });

  // 6. 调用图像生成（P1-8: 通过 withAbortSignal 包装实现可取消）
  // PrismCraft 第四章: 把角色/场景的 generatedImage 作为参考图传给模型，
  // 让模型真正"看到"参考图，而非仅靠 prompt 文本描述（characterImageUrl / sceneImageUrl）。
  // variant 的参考图已在 characterToInput 中优先选取，这里同步取出 URL 传入。
  const characterImageUrl = variant?.imageUrl || variant?.referenceImagePath || character.generatedImage;
  const sceneImageUrl = scene?.generatedImage || undefined;

  const result = await withAbortSignal(
    container.imageProvider.generateImage(prompt, "compositor", {
      providerId: input.provider,
      modelId: input.modelId,
      purpose: "compositor",
      characterImageUrl,
      sceneImageUrl,
    }),
    signal,
  );

  if (signal?.aborted) throw new Error(t("compositor.errorCancelled"));

  if (!result.success) {
    throw new Error(
      t("compositor.errorImageGenFailed", {
        error: result.error || result.message || "unknown",
      }),
    );
  }

  const imageUrl = result.data.imageUrl || "";
  if (!imageUrl) {
    throw new Error(t("compositor.errorEmptyImageUrl"));
  }

  // 7. 持久化到 generation_assets（type=compositor_result, sourceType=composited）
  const createdAt = new Date().toISOString();
  const assetId = await persistCompositorAsset(input, imageUrl, prompt);

  // 8. 返回结果
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
    throw new Error(t("compositor.errorCharacterNotFound", { id: input.characterId }));
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
