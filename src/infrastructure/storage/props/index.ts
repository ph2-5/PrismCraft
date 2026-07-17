/**
 * Task 2A.8 — Prop Storage (CRUD)
 *
 * 道具库的持久化存储。支持：
 *   - 基础 CRUD：getAllProps / getPropById / createProp / updateProp / deleteProp
 *   - 按类型筛选：getPropsByType
 *   - 按标签筛选：getPropsByTag
 *   - 从 character_outfits 迁移：migrateOutfitsToProps
 *
 * 表结构：props（见 electron/src/database/db-schema.ts）
 *   - id (TEXT PRIMARY KEY)
 *   - name / type / description / reference_image / local_image_path / thumbnail_path
 *   - tags_json (JSON 数组)
 *   - source_character_id / source_outfit_id（迁移来源追踪）
 *   - metadata_json（扩展元数据）
 *   - BASE_COLUMNS（owner_id/created_at/updated_at/is_deleted/deleted_at/version/sync_id）
 *
 * 访问模式：通过 DI container（container.propStorage）访问。
 * 参考实现：auto-save.ts / novel-projects/index.ts（同样的 plain object + safeQuery/safeRun 模式）
 */

import { safeQuery, safeRun, safeTransaction } from "../sqlite-core";
import { parseRecordWithTable } from "../core";
import { safeJsonParseArray } from "@/shared/utils/safe-json";
import type {
  Prop,
  PropType,
  CreatePropInput,
  UpdatePropInput,
} from "@/domain/schemas";

/** DB 行类型（snake_case） */
interface PropRow {
  id: string;
  name: string;
  type: string;
  description: string | null;
  reference_image: string | null;
  local_image_path: string | null;
  thumbnail_path: string | null;
  tags_json: string | null;
  source_character_id: string | null;
  source_outfit_id: string | null;
  metadata_json: string | null;
  owner_id: number;
  created_at: number;
  updated_at: number;
  is_deleted: number;
  deleted_at: number | null;
  version: number;
  sync_id: string | null;
}

/** DB 行 → Prop 域对象 */
function rowToProp(row: PropRow): Prop {
  const parsed = parseRecordWithTable(
    row as unknown as Record<string, unknown>,
    "props",
  );
  const tagsRaw = parsed.tags_json;
  const tags = Array.isArray(tagsRaw)
    ? (tagsRaw as string[])
    : safeJsonParseArray<string>(typeof tagsRaw === "string" ? tagsRaw : "[]");
  const metadataRaw = parsed.metadata_json;
  let metadata: Record<string, unknown> = {};
  if (metadataRaw && typeof metadataRaw === "object") {
    metadata = metadataRaw as Record<string, unknown>;
  } else if (typeof metadataRaw === "string") {
    try {
      metadata = JSON.parse(metadataRaw) as Record<string, unknown>;
    } catch {
      metadata = {};
    }
  }
  return {
    id: String(parsed.id ?? ""),
    name: String(parsed.name ?? ""),
    type: (String(parsed.type ?? "prop") as PropType) || "prop",
    description: parsed.description ? String(parsed.description) : "",
    referenceImage: parsed.reference_image ? String(parsed.reference_image) : undefined,
    localImagePath: parsed.local_image_path ? String(parsed.local_image_path) : undefined,
    thumbnailPath: parsed.thumbnail_path ? String(parsed.thumbnail_path) : undefined,
    tags,
    sourceCharacterId: parsed.source_character_id
      ? String(parsed.source_character_id)
      : undefined,
    sourceOutfitId: parsed.source_outfit_id ? String(parsed.source_outfit_id) : undefined,
    metadata,
    createdAt: new Date(Number(parsed.created_at) * 1000).toISOString(),
    updatedAt: new Date(Number(parsed.updated_at) * 1000).toISOString(),
  };
}

/** 生成道具 ID */
function generatePropId(): string {
  return `prop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const propStorage = {
  /** 获取所有道具（按 updated_at 降序） */
  async getAllProps(): Promise<Prop[]> {
    const rows = await safeQuery<PropRow>(
      "SELECT * FROM props WHERE is_deleted = 0 ORDER BY updated_at DESC",
    );
    return rows.map(rowToProp);
  },

  /** 获取单个道具 */
  async getPropById(id: string): Promise<Prop | null> {
    const rows = await safeQuery<PropRow>(
      "SELECT * FROM props WHERE id = ? AND is_deleted = 0",
      [id],
    );
    if (rows.length === 0) return null;
    return rowToProp(rows[0]!);
  },

  /** 按类型筛选道具 */
  async getPropsByType(type: PropType): Promise<Prop[]> {
    const rows = await safeQuery<PropRow>(
      "SELECT * FROM props WHERE type = ? AND is_deleted = 0 ORDER BY updated_at DESC",
      [type],
    );
    return rows.map(rowToProp);
  },

  /** 按标签筛选道具（精确匹配任一标签） */
  async getPropsByTag(tag: string): Promise<Prop[]> {
    // SQLite JSON 查询：tags_json LIKE '%"tag"%'（简化实现，兼容性最好）
    const rows = await safeQuery<PropRow>(
      `SELECT * FROM props WHERE tags_json LIKE ? AND is_deleted = 0 ORDER BY updated_at DESC`,
      [`%"${tag.replace(/["\\]/g, "")}"`],
    );
    return rows.map(rowToProp);
  },

  /** 创建新道具 */
  async createProp(input: CreatePropInput): Promise<Prop> {
    const id = input.id || generatePropId();
    const now = Math.floor(Date.now() / 1000);
    const nowIso = new Date(now * 1000).toISOString();
    await safeRun(
      `INSERT INTO props
        (id, name, type, description, reference_image, local_image_path, thumbnail_path,
         tags_json, source_character_id, source_outfit_id, metadata_json,
         owner_id, created_at, updated_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 1)`,
      [
        id,
        input.name,
        input.type,
        input.description ?? "",
        input.referenceImage ?? null,
        input.localImagePath ?? null,
        input.thumbnailPath ?? null,
        JSON.stringify(input.tags ?? []),
        input.sourceCharacterId ?? null,
        input.sourceOutfitId ?? null,
        JSON.stringify(input.metadata ?? {}),
        now,
        now,
      ],
    );
    return {
      id,
      name: input.name,
      type: input.type,
      description: input.description ?? "",
      referenceImage: input.referenceImage,
      localImagePath: input.localImagePath,
      thumbnailPath: input.thumbnailPath,
      tags: input.tags ?? [],
      sourceCharacterId: input.sourceCharacterId,
      sourceOutfitId: input.sourceOutfitId,
      metadata: input.metadata ?? {},
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  },

  /** 更新道具（部分更新） */
  async updateProp(id: string, patch: UpdatePropInput): Promise<void> {
    const sets: string[] = [];
    const params: (string | null)[] = [];

    if (patch.name !== undefined) {
      sets.push("name = ?");
      params.push(patch.name);
    }
    if (patch.type !== undefined) {
      sets.push("type = ?");
      params.push(patch.type);
    }
    if (patch.description !== undefined) {
      sets.push("description = ?");
      params.push(patch.description);
    }
    if (patch.referenceImage !== undefined) {
      sets.push("reference_image = ?");
      params.push(patch.referenceImage);
    }
    if (patch.localImagePath !== undefined) {
      sets.push("local_image_path = ?");
      params.push(patch.localImagePath);
    }
    if (patch.thumbnailPath !== undefined) {
      sets.push("thumbnail_path = ?");
      params.push(patch.thumbnailPath);
    }
    if (patch.tags !== undefined) {
      sets.push("tags_json = ?");
      params.push(JSON.stringify(patch.tags));
    }
    if (patch.metadata !== undefined) {
      sets.push("metadata_json = ?");
      params.push(JSON.stringify(patch.metadata));
    }
    if (patch.sourceCharacterId !== undefined) {
      sets.push("source_character_id = ?");
      params.push(patch.sourceCharacterId);
    }
    if (patch.sourceOutfitId !== undefined) {
      sets.push("source_outfit_id = ?");
      params.push(patch.sourceOutfitId);
    }

    if (sets.length === 0) return;

    sets.push("updated_at = ?");
    params.push(String(Math.floor(Date.now() / 1000)));
    params.push(id);

    await safeRun(
      `UPDATE props SET ${sets.join(", ")} WHERE id = ?`,
      params,
    );
  },

  /** 软删除道具 */
  async deleteProp(id: string): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await safeRun(
      `UPDATE props SET is_deleted = 1, deleted_at = ?, updated_at = ? WHERE id = ?`,
      [String(now), String(now), id],
    );
  },

  /**
   * Task 2A.8: 从 character_outfits 迁移到 props 表
   *
   * 将所有 character_outfits 记录转换为 type='clothing' 的道具。
   * 幂等性：通过 source_outfit_id 去重，已迁移的 outfit 不会重复迁移。
   *
   * @returns 迁移的记录数
   */
  async migrateOutfitsToProps(): Promise<number> {
    // 1. 查询所有 character_outfits
    const outfits = await safeQuery<{
      id: string;
      character_id: string;
      name: string;
      description: string | null;
      clothing: string | null;
      accessories_json: string | null;
      image_url: string | null;
      local_image_path: string | null;
      thumbnail_path: string | null;
      is_default: number;
    }>("SELECT * FROM character_outfits ORDER BY created_at ASC");

    if (outfits.length === 0) return 0;

    // 2. 查询已迁移的 outfit IDs（避免重复）
    const migrated = await safeQuery<{ source_outfit_id: string }>(
      "SELECT source_outfit_id FROM props WHERE source_outfit_id IS NOT NULL AND is_deleted = 0",
    );
    const migratedSet = new Set(migrated.map((r) => r.source_outfit_id));

    // 3. 构造批量插入语句
    const now = Math.floor(Date.now() / 1000);
    const statements: { sql: string; params: unknown[] }[] = [];
    let count = 0;

    for (const outfit of outfits) {
      if (migratedSet.has(outfit.id)) continue;

      const propId = `prop-migrated-${outfit.id}`;
      const description = [outfit.description, outfit.clothing]
        .filter(Boolean)
        .join(" | ");
      const accessories = (() => {
        try {
          return JSON.parse(outfit.accessories_json ?? "[]");
        } catch {
          return [];
        }
      })();

      statements.push({
        sql: `INSERT OR IGNORE INTO props
          (id, name, type, description, reference_image, local_image_path, thumbnail_path,
           tags_json, source_character_id, source_outfit_id, metadata_json,
           owner_id, created_at, updated_at, version)
         VALUES (?, ?, 'clothing', ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 1)`,
        params: [
          propId,
          outfit.name || "未命名服装",
          description,
          outfit.image_url,
          outfit.local_image_path,
          outfit.thumbnail_path,
          JSON.stringify(outfit.is_default ? ["default"] : []),
          outfit.character_id,
          outfit.id,
          JSON.stringify({
            migratedFrom: "character_outfits",
            isDefault: Boolean(outfit.is_default),
            accessories,
            originalClothing: outfit.clothing,
          }),
          now,
          now,
        ],
      });
      count++;
    }

    if (statements.length === 0) return 0;

    // 4. 事务执行批量插入
    await safeTransaction(statements);
    return count;
  },
};
