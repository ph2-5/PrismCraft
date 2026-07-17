export { characterService } from "./services";
export {
  defaultCharacter,
  personalitySuggestions,
  styleSuggestions,
  genderSuggestions,
  heightSuggestions,
  buildSuggestions,
  type StyleOption,
} from "./constants";
export {
  useCharacterImage,
  useOutfitManagement,
  useCharacters,
  useCharacter,
  useCharacterCount,
  useCreateCharacter,
  useUpdateCharacter,
  useDeleteCharacter,
  useCharacterCRUD,
} from "./hooks";

export { CharacterListItem, OutfitDialog } from "./presentation";

// Task 2A.10: 角色变体子域（替代 character_outfits 功能）
export {
  // Schemas
  characterVariantSchema,
  createCharacterVariantInputSchema,
  updateCharacterVariantInputSchema,
  // Types
  type CharacterVariant,
  type CreateCharacterVariantInput,
  type UpdateCharacterVariantInput,
  // Services
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
  initializeVariantMigration,
  // Hooks
  useCharacterVariants,
  useAllCharacterVariants,
  useVariant,
  useCreateVariant,
  useUpdateVariant,
  useDeleteVariant,
  useSetDefaultVariant,
  useMigrateOutfitsToVariants,
  VARIANT_QUERY_KEYS,
  // Components
  VariantList,
  VariantListContainer,
  VariantDialog,
  variantToForm,
  type VariantListProps,
  type VariantFormState,
} from "./variants";
