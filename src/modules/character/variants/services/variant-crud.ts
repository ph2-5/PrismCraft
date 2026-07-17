/**
 * Task 2A.10 — Character Variant CRUD Service
 *
 * 角色变体业务逻辑层。薄封装 characterVariantStorage，提供：
 *   - 基础 CRUD（listForCharacter/getById/create/update/remove）
 *   - 默认变体管理（setDefault）
 *   - 变体图更新（updateImage）
 *   - 服装数据迁移（migrateOutfits，幂等）
 *   - Compositor 生成结果保存为变体（createFromCompositorAsset）
 *
 * 通过 DI container 访问 storage，禁止直接导入 infrastructure/storage。
 *
 * 依赖方向：@/domain/schemas + @/infrastructure/di
 */

import { container } from "@/infrastructure/di";
import { errorLogger } from "@/shared/error-logger";
import type {
  CharacterVariant,
  CreateCharacterVariantInput,
  UpdateCharacterVariantInput,
  GenerationAsset,
} from "@/domain/schemas";

export async function listVariantsForCharacter(characterId: string): Promise<CharacterVariant[]> {
  return container.characterVariantStorage.getVariantsForCharacter(characterId);
}

export async function listAllVariants(): Promise<Map<string, CharacterVariant[]>> {
  return container.characterVariantStorage.getAllVariants();
}

export async function getVariantById(id: string): Promise<CharacterVariant | null> {
  return container.characterVariantStorage.getVariantById(id);
}

export async function getDefaultVariant(characterId: string): Promise<CharacterVariant | null> {
  return container.characterVariantStorage.getDefaultVariant(characterId);
}

export async function createVariant(input: CreateCharacterVariantInput): Promise<CharacterVariant> {
  const variant = await container.characterVariantStorage.createVariant(input);
  // 如果新建时 isDefault=true，需要确保其他变体取消默认
  if (input.isDefault) {
    await container.characterVariantStorage.setDefaultVariant(input.characterId, variant.id);
  }
  return variant;
}

export async function updateVariant(id: string, patch: UpdateCharacterVariantInput): Promise<void> {
  await container.characterVariantStorage.updateVariant(id, patch);
}

export async function deleteVariant(id: string): Promise<void> {
  await container.characterVariantStorage.deleteVariant(id);
}

export async function setDefaultVariant(characterId: string, variantId: string): Promise<void> {
  await container.characterVariantStorage.setDefaultVariant(characterId, variantId);
}

export async function updateVariantImage(
  variantId: string,
  imageUrl: string,
  localImagePath?: string,
): Promise<void> {
  await container.characterVariantStorage.updateVariantImage(variantId, imageUrl, localImagePath);
}

/**
 * Task 2A.10: 从 character_outfits 迁移到 character_variants
 *
 * 幂等操作：已迁移的 outfit 不会重复迁移（通过 source_outfit_id 去重）。
 * 返回迁移的记录数。
 */
export async function migrateOutfitsToVariants(): Promise<number> {
  return container.characterVariantStorage.migrateOutfitsToVariants();
}

/**
 * Task 2A.10: 从 Compositor 生成的资产创建变体
 *
 * 由 Compositor 生成图后，调用此函数将生成结果保存为角色的新变体。
 * 关联通过 source_compositor_asset_id 字段追溯。
 *
 * @param characterId 角色ID
 * @param asset Compositor 生成的 generation_assets 记录
 * @param name 变体名
 * @param options 额外参数（promptFragment、isDefault、8 维参数等）
 */
export async function createVariantFromCompositorAsset(
  characterId: string,
  asset: Pick<GenerationAsset, "id" | "url" | "prompt">,
  name: string,
  options: Partial<Pick<CreateCharacterVariantInput, "promptFragment" | "isDefault" | "isCanonical" | "timeOfDay" | "weather" | "lighting" | "mood" | "crowdLevel" | "cameraAngle" | "season" | "colorPalette" | "description">> = {},
): Promise<CharacterVariant> {
  try {
    return await createVariant({
      characterId,
      name,
      description: options.description ?? "",
      promptFragment: options.promptFragment ?? "",
      imageUrl: asset.url,
      // 从 Compositor 资产的 prompt 中提取（用户可在创建时手动指定 promptFragment）
      sourceCompositorAssetId: asset.id,
      isDefault: options.isDefault ?? false,
      isCanonical: options.isCanonical ?? false,
      timeOfDay: options.timeOfDay,
      weather: options.weather,
      lighting: options.lighting,
      mood: options.mood,
      crowdLevel: options.crowdLevel,
      cameraAngle: options.cameraAngle,
      season: options.season,
      colorPalette: options.colorPalette,
      metadata: {
        compositorPrompt: asset.prompt,
      },
    });
  } catch (err) {
    errorLogger.warn("[VariantCrud] 从 Compositor 资产创建变体失败", err);
    throw err;
  }
}
