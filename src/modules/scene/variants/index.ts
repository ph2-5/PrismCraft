/**
 * Q3-1 — Scene Variants 子域
 *
 * 场景变体系统公共 API。对称 character/variants 子域。
 */

// Domain schemas（从 @/domain/schemas 重新导出，方便使用）
export {
  sceneVariantSchema,
  createSceneVariantInputSchema,
  updateSceneVariantInputSchema,
} from "@/domain/schemas";
export type {
  SceneVariant,
  CreateSceneVariantInput,
  UpdateSceneVariantInput,
} from "@/domain/schemas";

// Services
export {
  listVariantsForScene,
  listAllVariants,
  getVariantById,
  getDefaultVariant,
  createVariant,
  updateVariant,
  deleteVariant,
  setDefaultVariant,
  updateVariantImage,
} from "./services/variant-crud";

// Hooks
export {
  useSceneVariants,
  useAllSceneVariants,
  useSceneVariant,
  useCreateSceneVariant,
  useUpdateSceneVariant,
  useDeleteSceneVariant,
  useSetDefaultSceneVariant,
  SCENE_VARIANT_QUERY_KEYS,
} from "./hooks/use-scene-variants";

// Components
export { SceneVariantList } from "./presentation/variant-list";
export type { SceneVariantListProps } from "./presentation/variant-list";
export { SceneVariantListContainer } from "./presentation/variant-list-container";
export { SceneVariantDialog, variantToForm } from "./presentation/variant-dialog";
export type { SceneVariantFormState } from "./presentation/variant-dialog";

// Module manifest
import "./contract.json";
