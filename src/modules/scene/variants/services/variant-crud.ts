/**
 * Q3-1 — Scene Variant CRUD Service
 *
 * 场景变体业务逻辑层。薄封装 sceneVariantStorage，提供：
 *   - 基础 CRUD（listForScene/getById/create/update/remove）
 *   - 默认变体管理（setDefault）
 *   - 变体图更新（updateImage）
 *   - Compositor 生成结果保存为变体（createFromCompositorAsset）
 *
 * 通过 DI container 访问 storage，禁止直接导入 infrastructure/storage。
 *
 * 依赖方向：@/domain/schemas + @/infrastructure/di
 */

import { container } from "@/infrastructure/di";
import { errorLogger } from "@/shared/error-logger";
import type {
  SceneVariant,
  CreateSceneVariantInput,
  UpdateSceneVariantInput,
} from "@/domain/schemas";

export async function listVariantsForScene(sceneId: string): Promise<SceneVariant[]> {
  return container.sceneVariantStorage.getVariantsForScene(sceneId);
}

export async function listAllVariants(): Promise<Map<string, SceneVariant[]>> {
  return container.sceneVariantStorage.getAllVariants();
}

export async function getVariantById(id: string): Promise<SceneVariant | null> {
  return container.sceneVariantStorage.getVariantById(id);
}

export async function getDefaultVariant(sceneId: string): Promise<SceneVariant | null> {
  return container.sceneVariantStorage.getDefaultVariant(sceneId);
}

export async function createVariant(input: CreateSceneVariantInput): Promise<SceneVariant> {
  const variant = await container.sceneVariantStorage.createVariant(input);
  // 如果新建时 isDefault=true，需要确保其他变体取消默认
  // 补偿：setDefaultVariant 失败时删除刚创建的 variant，避免中间态
  if (input.isDefault) {
    try {
      await container.sceneVariantStorage.setDefaultVariant(input.sceneId, variant.id);
    } catch (err) {
      try {
        await container.sceneVariantStorage.deleteVariant(variant.id);
      } catch (cleanupErr) {
        errorLogger.error(
          {
            code: "SceneVariantCreateRollbackFailed",
            message: `setDefaultVariant 失败后回滚删除 variant 也失败: ${variant.id}`,
            cause: cleanupErr,
          },
          "scene-variant-crud",
        );
      }
      throw err;
    }
  }
  return variant;
}

export async function updateVariant(id: string, patch: UpdateSceneVariantInput): Promise<void> {
  await container.sceneVariantStorage.updateVariant(id, patch);
}

export async function deleteVariant(id: string): Promise<void> {
  await container.sceneVariantStorage.deleteVariant(id);
}

export async function setDefaultVariant(sceneId: string, variantId: string): Promise<void> {
  await container.sceneVariantStorage.setDefaultVariant(sceneId, variantId);
}

export async function updateVariantImage(
  variantId: string,
  imageUrl: string,
  localImagePath?: string,
): Promise<void> {
  await container.sceneVariantStorage.updateVariantImage(variantId, imageUrl, localImagePath);
}
