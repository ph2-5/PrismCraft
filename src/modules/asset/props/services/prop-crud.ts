/**
 * Task 2A.8 — Prop CRUD Service
 *
 * 道具库业务逻辑层。薄封装 propStorage，提供：
 *   - 基础 CRUD（getAll/getById/create/update/remove）
 *   - 按类型筛选（listByType）
 *   - 按标签筛选（listByTag）
 *   - 服装数据迁移（migrateOutfits）
 *
 * 通过 DI container 访问 storage，禁止直接导入 infrastructure/storage。
 *
 * 依赖方向：@/domain/schemas + @/infrastructure/di（同模块子域间通过 index.ts 通信）
 */
import { container } from "@/infrastructure/di";
import type {
  Prop,
  PropType,
  CreatePropInput,
  UpdatePropInput,
} from "@/domain/schemas";

export async function getAllProps(): Promise<Prop[]> {
  return container.propStorage.getAllProps();
}

export async function getPropById(id: string): Promise<Prop | null> {
  return container.propStorage.getPropById(id);
}

export async function listPropsByType(type: PropType): Promise<Prop[]> {
  return container.propStorage.getPropsByType(type);
}

export async function listPropsByTag(tag: string): Promise<Prop[]> {
  return container.propStorage.getPropsByTag(tag);
}

export async function createProp(input: CreatePropInput): Promise<Prop> {
  return container.propStorage.createProp(input);
}

export async function updateProp(id: string, patch: UpdatePropInput): Promise<void> {
  await container.propStorage.updateProp(id, patch);
}

export async function deleteProp(id: string): Promise<void> {
  await container.propStorage.deleteProp(id);
}

/**
 * Task 2A.8: 从 character_outfits 迁移到 props 表
 *
 * 幂等操作：已迁移的 outfit 不会重复迁移。
 * 返回迁移的记录数。
 */
export async function migrateOutfitsToProps(): Promise<number> {
  return container.propStorage.migrateOutfitsToProps();
}
