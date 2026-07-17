/**
 * Task 2A.10 — Character Variant Storage
 *
 * 角色变体的持久化存储。替代 outfit-manager.ts 的功能。
 *
 * 表结构：character_variants（见 electron/src/database/db-schema.ts）
 *   - id (TEXT PRIMARY KEY)
 *   - character_id (TEXT, FK characters(id) ON DELETE CASCADE)
 *   - name / description / prompt_fragment
 *   - reference_image_path / image_url / local_image_path / thumbnail_path
 *   - 8 维参数：time_of_day / weather / lighting / mood / crowd_level / camera_angle / season / color_palette
 *   - source_outfit_id（迁移自 character_outfits）
 *   - source_compositor_asset_id（由 Compositor 生成）
 *   - is_default / is_canonical
 *   - metadata_json
 *   - BASE_COLUMNS（owner_id/created_at/updated_at/is_deleted/deleted_at/version/sync_id）
 *
 * 访问模式：通过 DI container（container.characterVariantStorage）访问。
 * 参考实现：outfit-manager.ts / props/index.ts（同样的 plain object + safeQuery/safeRun 模式）
 */

import { safeQuery, safeRun, safeTransaction } from "../sqlite-core";
import { parseRecordWithTable } from "../core";
import { errorLogger } from "@/shared/error-logger";
import type {
  CharacterVariant,
  CreateCharacterVariantInput,
  UpdateCharacterVariantInput,
} from "@/domain/schemas";

/** DB 行 → CharacterVariant 域对象 */
function rowToVariant(row: Record<string, unknown>): CharacterVariant {
  const parsed = parseRecordWithTable(row, "character_variants");

  const parseMetadata = (raw: unknown): Record<string, unknown> => {
    if (raw && typeof raw === "object") return raw as Record<string, unknown>;
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return {};
      }
    }
    return {};
  };

  const tsToString = (v: unknown): string => {
    if (!v) return new Date().toISOString();
    if (typeof v === "number") return new Date(v * 1000).toISOString();
    return String(v);
  };

  return {
    id: String(parsed.id ?? ""),
    characterId: String(parsed.character_id ?? ""),
    name: String(parsed.name ?? ""),
    description: String(parsed.description ?? ""),
    promptFragment: String(parsed.prompt_fragment ?? ""),
    referenceImagePath: parsed.reference_image_path
      ? String(parsed.reference_image_path)
      : undefined,
    imageUrl: parsed.image_url ? String(parsed.image_url) : undefined,
    localImagePath: parsed.local_image_path
      ? String(parsed.local_image_path)
      : undefined,
    thumbnailPath: parsed.thumbnail_path
      ? String(parsed.thumbnail_path)
      : undefined,
    timeOfDay: parsed.time_of_day ? String(parsed.time_of_day) : undefined,
    weather: parsed.weather ? String(parsed.weather) : undefined,
    lighting: parsed.lighting ? String(parsed.lighting) : undefined,
    mood: parsed.mood ? String(parsed.mood) : undefined,
    crowdLevel: parsed.crowd_level ? String(parsed.crowd_level) : undefined,
    cameraAngle: parsed.camera_angle ? String(parsed.camera_angle) : undefined,
    season: parsed.season ? String(parsed.season) : undefined,
    colorPalette: parsed.color_palette ? String(parsed.color_palette) : undefined,
    sourceOutfitId: parsed.source_outfit_id
      ? String(parsed.source_outfit_id)
      : undefined,
    sourceCompositorAssetId: parsed.source_compositor_asset_id
      ? String(parsed.source_compositor_asset_id)
      : undefined,
    isDefault: !!parsed.is_default,
    isCanonical: !!parsed.is_canonical,
    metadata: parseMetadata(parsed.metadata_json),
    createdAt: tsToString(parsed.created_at),
    updatedAt: tsToString(parsed.updated_at),
  };
}

/** 生成变体 ID */
function generateVariantId(): string {
  return `variant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 8 维参数列名列表（用于 INSERT/UPDATE 动态构造） */
const PARAM_COLUMNS = [
  "time_of_day",
  "weather",
  "lighting",
  "mood",
  "crowd_level",
  "camera_angle",
  "season",
  "color_palette",
] as const;

function paramToColumn(key: keyof CharacterVariant): string | null {
  const map: Record<string, string> = {
    timeOfDay: "time_of_day",
    weather: "weather",
    lighting: "lighting",
    mood: "mood",
    crowdLevel: "crowd_level",
    cameraAngle: "camera_angle",
    season: "season",
    colorPalette: "color_palette",
  };
  return map[String(key)] || null;
}

export const characterVariantStorage = {
  /** 获取角色的所有变体（按 is_default DESC, created_at ASC） */
  async getVariantsForCharacter(characterId: string): Promise<CharacterVariant[]> {
    const rows = await safeQuery<Record<string, unknown>>(
      "SELECT * FROM character_variants WHERE character_id = ? AND is_deleted = 0 ORDER BY is_default DESC, created_at ASC",
      [characterId],
    );
    return rows.map(rowToVariant);
  },

  /** 获取所有变体（按 character_id 分组） */
  async getAllVariants(): Promise<Map<string, CharacterVariant[]>> {
    const rows = await safeQuery<Record<string, unknown>>(
      "SELECT * FROM character_variants WHERE is_deleted = 0 ORDER BY is_default DESC, created_at ASC",
    );
    const map = new Map<string, CharacterVariant[]>();
    for (const row of rows) {
      const variant = rowToVariant(row);
      const list = map.get(variant.characterId);
      if (list) {
        list.push(variant);
      } else {
        map.set(variant.characterId, [variant]);
      }
    }
    return map;
  },

  /** 获取单个变体 */
  async getVariantById(id: string): Promise<CharacterVariant | null> {
    const rows = await safeQuery<Record<string, unknown>>(
      "SELECT * FROM character_variants WHERE id = ? AND is_deleted = 0",
      [id],
    );
    if (rows.length === 0) return null;
    return rowToVariant(rows[0]!);
  },

  /** 获取角色的默认变体（is_default = 1 的第一个） */
  async getDefaultVariant(characterId: string): Promise<CharacterVariant | null> {
    const rows = await safeQuery<Record<string, unknown>>(
      "SELECT * FROM character_variants WHERE character_id = ? AND is_default = 1 AND is_deleted = 0 LIMIT 1",
      [characterId],
    );
    if (rows.length === 0) return null;
    return rowToVariant(rows[0]!);
  },

  /** 创建新变体 */
  async createVariant(input: CreateCharacterVariantInput): Promise<CharacterVariant> {
    const id = input.id || generateVariantId();
    const now = Math.floor(Date.now() / 1000);
    const nowIso = new Date(now * 1000).toISOString();

    const paramValues: (string | null)[] = PARAM_COLUMNS.map((col) => {
      const keyMap: Record<string, keyof CharacterVariant> = {
        time_of_day: "timeOfDay",
        weather: "weather",
        lighting: "lighting",
        mood: "mood",
        crowd_level: "crowdLevel",
        camera_angle: "cameraAngle",
        season: "season",
        color_palette: "colorPalette",
      };
      const value = input[keyMap[col] as keyof CreateCharacterVariantInput];
      return value === undefined || value === null ? null : String(value);
    });

    await safeRun(
      `INSERT INTO character_variants
        (id, character_id, name, description, prompt_fragment,
         reference_image_path, image_url, local_image_path, thumbnail_path,
         time_of_day, weather, lighting, mood, crowd_level, camera_angle, season, color_palette,
         source_outfit_id, source_compositor_asset_id,
         is_default, is_canonical, metadata_json,
         owner_id, created_at, updated_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 1)`,
      [
        id,
        input.characterId,
        input.name,
        input.description ?? "",
        input.promptFragment ?? "",
        input.referenceImagePath ?? null,
        input.imageUrl ?? null,
        input.localImagePath ?? null,
        input.thumbnailPath ?? null,
        ...paramValues,
        input.sourceOutfitId ?? null,
        input.sourceCompositorAssetId ?? null,
        input.isDefault ? 1 : 0,
        input.isCanonical ? 1 : 0,
        JSON.stringify(input.metadata ?? {}),
        now,
        now,
      ],
    );

    return {
      id,
      characterId: input.characterId,
      name: input.name,
      description: input.description ?? "",
      promptFragment: input.promptFragment ?? "",
      referenceImagePath: input.referenceImagePath,
      imageUrl: input.imageUrl,
      localImagePath: input.localImagePath,
      thumbnailPath: input.thumbnailPath,
      timeOfDay: input.timeOfDay,
      weather: input.weather,
      lighting: input.lighting,
      mood: input.mood,
      crowdLevel: input.crowdLevel,
      cameraAngle: input.cameraAngle,
      season: input.season,
      colorPalette: input.colorPalette,
      sourceOutfitId: input.sourceOutfitId,
      sourceCompositorAssetId: input.sourceCompositorAssetId,
      isDefault: input.isDefault ?? false,
      isCanonical: input.isCanonical ?? false,
      metadata: input.metadata ?? {},
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  },

  /** 更新变体（部分更新） */
  async updateVariant(id: string, patch: UpdateCharacterVariantInput): Promise<void> {
    const sets: string[] = [];
    const params: (string | number | null)[] = [];

    const fieldMap: Array<[keyof UpdateCharacterVariantInput, string]> = [
      ["name", "name"],
      ["description", "description"],
      ["promptFragment", "prompt_fragment"],
      ["referenceImagePath", "reference_image_path"],
      ["imageUrl", "image_url"],
      ["localImagePath", "local_image_path"],
      ["thumbnailPath", "thumbnail_path"],
      ["sourceOutfitId", "source_outfit_id"],
      ["sourceCompositorAssetId", "source_compositor_asset_id"],
      ["isDefault", "is_default"],
      ["isCanonical", "is_canonical"],
    ];

    for (const [key, col] of fieldMap) {
      if (patch[key] !== undefined) {
        sets.push(`${col} = ?`);
        const value = patch[key];
        if (typeof value === "boolean") {
          params.push(value ? 1 : 0);
        } else {
          params.push((value as string) ?? null);
        }
      }
    }

    // 8 维参数
    for (const [key, value] of Object.entries(patch)) {
      const col = paramToColumn(key as keyof CharacterVariant);
      if (col && value !== undefined) {
        sets.push(`${col} = ?`);
        params.push(value === null ? null : String(value));
      }
    }

    // metadata
    if (patch.metadata !== undefined) {
      sets.push("metadata_json = ?");
      params.push(JSON.stringify(patch.metadata));
    }

    if (sets.length === 0) return;

    sets.push("updated_at = ?");
    params.push(Math.floor(Date.now() / 1000));
    params.push(id);

    await safeRun(
      `UPDATE character_variants SET ${sets.join(", ")} WHERE id = ?`,
      params,
    );
  },

  /** 软删除变体 */
  async deleteVariant(id: string): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await safeRun(
      `UPDATE character_variants SET is_deleted = 1, deleted_at = ?, updated_at = ? WHERE id = ?`,
      [now, now, id],
    );
  },

  /** 删除角色的所有变体（硬删除，用于角色级联删除） */
  async deleteVariantsForCharacter(characterId: string): Promise<void> {
    await safeRun(`DELETE FROM character_variants WHERE character_id = ?`, [
      characterId,
    ]);
  },

  /** 设置默认变体（取消其他默认） */
  async setDefaultVariant(characterId: string, variantId: string): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await safeTransaction([
      {
        sql: `UPDATE character_variants SET is_default = 0, updated_at = ? WHERE character_id = ? AND id != ?`,
        params: [now, characterId, variantId],
      },
      {
        sql: `UPDATE character_variants SET is_default = 1, updated_at = ? WHERE id = ? AND character_id = ?`,
        params: [now, variantId, characterId],
      },
    ]);
  },

  /** 更新变体生成图 */
  async updateVariantImage(
    variantId: string,
    imageUrl: string,
    localImagePath?: string,
  ): Promise<void> {
    const sets = ["image_url = ?", "updated_at = ?"];
    const values: unknown[] = [imageUrl, Math.floor(Date.now() / 1000)];
    if (localImagePath !== undefined) {
      sets.push("local_image_path = ?");
      values.push(localImagePath);
    }
    values.push(variantId);
    await safeRun(
      `UPDATE character_variants SET ${sets.join(", ")} WHERE id = ?`,
      values,
    );
  },

  /**
   * Task 2A.10: 从 character_outfits 迁移到 character_variants
   *
   * 将所有 character_outfits 记录转换为变体。
   * 幂等性：通过 source_outfit_id 去重，已迁移的 outfit 不会重复迁移。
   *
   * @returns 迁移的记录数
   */
  async migrateOutfitsToVariants(): Promise<number> {
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
      "SELECT source_outfit_id FROM character_variants WHERE source_outfit_id IS NOT NULL AND is_deleted = 0",
    );
    const migratedSet = new Set(migrated.map((r) => r.source_outfit_id));

    // 3. 构造批量插入语句
    const now = Math.floor(Date.now() / 1000);
    const statements: { sql: string; params: unknown[] }[] = [];
    let count = 0;

    for (const outfit of outfits) {
      if (migratedSet.has(outfit.id)) continue;

      const variantId = `variant-migrated-${outfit.id}`;
      // clothing 是中文描述，迁移时直接作为 prompt_fragment（用户后续可手动优化为英文）
      const promptFragment = outfit.clothing || "";
      const accessories = (() => {
        try {
          return JSON.parse(outfit.accessories_json ?? "[]");
        } catch {
          return [];
        }
      })();

      statements.push({
        sql: `INSERT OR IGNORE INTO character_variants
          (id, character_id, name, description, prompt_fragment,
           image_url, local_image_path, thumbnail_path,
           source_outfit_id, is_default, is_canonical, metadata_json,
           owner_id, created_at, updated_at, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 1, ?, ?, 1)`,
        params: [
          variantId,
          outfit.character_id,
          outfit.name || "未命名变体",
          outfit.description || "",
          promptFragment,
          outfit.image_url,
          outfit.local_image_path,
          outfit.thumbnail_path,
          outfit.id,
          outfit.is_default ? 1 : 0,
          JSON.stringify({
            migratedFrom: "character_outfits",
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
    try {
      await safeTransaction(statements);
    } catch (err) {
      errorLogger.warn("[VariantMigration] 迁移事务执行失败", err);
      throw err;
    }
    return count;
  },
};
