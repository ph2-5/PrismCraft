export { sceneService } from "./services";
export {
  defaultScene,
  typeSuggestions,
  timeSuggestions,
  weatherSuggestions,
  moodSuggestions,
  elementSuggestions,
  colorSuggestions,
  angleSuggestions,
  distanceSuggestions,
  movementSuggestions,
} from "./constants";
export {
  useSceneImage,
  useScenes,
  useScene,
  useSceneCount,
  useCreateScene,
  useUpdateScene,
  useDeleteScene,
  useSceneCRUD,
} from "./hooks";

export { SceneListItem } from "./presentation";

// Q3-1: 场景变体子域
export {
  sceneVariantSchema,
  createSceneVariantInputSchema,
  updateSceneVariantInputSchema,
  listVariantsForScene,
  listAllVariants,
  getVariantById,
  getDefaultVariant,
  createVariant as createSceneVariant,
  updateVariant as updateSceneVariant,
  deleteVariant as deleteSceneVariant,
  setDefaultVariant as setDefaultSceneVariant,
  updateVariantImage as updateSceneVariantImage,
  useSceneVariants,
  useAllSceneVariants,
  useSceneVariant,
  useCreateSceneVariant,
  useUpdateSceneVariant,
  useDeleteSceneVariant,
  useSetDefaultSceneVariant,
  SCENE_VARIANT_QUERY_KEYS,
  SceneVariantList,
  SceneVariantListContainer,
  SceneVariantDialog,
  variantToForm as sceneVariantToForm,
} from "./variants";
export type {
  SceneVariant,
  CreateSceneVariantInput,
  UpdateSceneVariantInput,
  SceneVariantListProps,
  SceneVariantFormState,
} from "./variants";
