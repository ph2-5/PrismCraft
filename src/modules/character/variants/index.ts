/**
 * Task 2A.10 — Character Variants 子域
 *
 * 角色变体系统公共 API。替代 character_outfits 功能。
 */

// Domain schemas（从 @/domain/schemas 重新导出，方便使用）
export {
  characterVariantSchema,
  createCharacterVariantInputSchema,
  updateCharacterVariantInputSchema,
} from "@/domain/schemas";
export type {
  CharacterVariant,
  CreateCharacterVariantInput,
  UpdateCharacterVariantInput,
} from "@/domain/schemas";

// Services
export {
  listVariantsForCharacter,
  listAllVariants,
  getVariantById,
  getDefaultVariant,
  createVariant,
  updateVariant,
  deleteVariant,
  setDefaultVariant,
  updateVariantImage,
  migrateOutfitsToVariants,
  createVariantFromCompositorAsset,
} from "./services/variant-crud";
export {
  initializeVariantMigration,
  _resetVariantMigrationState,
} from "./services/migrate-outfits";

// Hooks
export {
  useCharacterVariants,
  useAllCharacterVariants,
  useVariant,
  useCreateVariant,
  useUpdateVariant,
  useDeleteVariant,
  useSetDefaultVariant,
  useMigrateOutfitsToVariants,
  VARIANT_QUERY_KEYS,
} from "./hooks/use-character-variants";

// Components
export { VariantList } from "./presentation/variant-list";
export type { VariantListProps } from "./presentation/variant-list";
export { VariantListContainer } from "./presentation/variant-list-container";
export { VariantDialog, variantToForm } from "./presentation/variant-dialog";
export type { VariantFormState } from "./presentation/variant-dialog";

// Module manifest
import "./contract.json";
