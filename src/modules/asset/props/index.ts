/**
 * Asset/Props 子域入口 — 道具库管理（Task 2A.8）
 *
 * 提供：
 *   - Services：CRUD + 类型/标签筛选 + 服装数据迁移
 *   - Hooks：useProps/usePropsByType/usePropsByTag/useCreateProp/useUpdateProp/useDeleteProp/useMigrateOutfits
 *
 * 依赖方向：@/domain/schemas + @/infrastructure/di
 */
export {
  getAllProps,
  getPropById,
  listPropsByType,
  listPropsByTag,
  createProp,
  updateProp,
  deleteProp,
  migrateOutfitsToProps,
} from "./services/prop-crud";

export { initializePropMigration } from "./services/migrate-outfits";

export {
  useProps,
  usePropsByType,
  usePropsByTag,
  useCreateProp,
  useUpdateProp,
  useDeleteProp,
  useMigrateOutfits,
  PROP_QUERY_KEYS,
} from "./hooks/use-prop-library";
