/**
 * Q3-1 — Scene Variant Storage
 *
 * 场景变体的持久化存储。对称 characters/variant-manager.ts。
 *
 * 表结构：scene_variants（见 electron/src/database/db-schema.ts）
 *   - id (TEXT PRIMARY KEY)
 *   - scene_id (TEXT, FK scenes(id) ON DELETE CASCADE)
 *   - name / description / prompt_fragment
 *   - reference_image_path / image_url / local_image_path / thumbnail_path
 *   - 8 维参数：time_of_day / weather / lighting / mood / crowd_level / camera_angle / season / color_palette
 *   - source_compositor_asset_id（由 Compositor 生成）
 *   - is_default / is_canonical
 *   - metadata_json
 *   - BASE_COLUMNS（owner_id/created_at/updated_at/is_deleted/deleted_at/version/sync_id）
 *
 * 访问模式：通过 DI container（container.sceneVariantStorage）访问。
 * 参考实现：characters/variant-manager.ts（同样的 plain object + safeQuery/safeRun 模式）
 */

import { safeQuery, safeRun, safeTransaction } from "../sqlite-core";
import { parseRecordWithTable } from "../core";
import { errorLogger } from "@/shared/error-logger";
import type {
  SceneVariant,
  CreateSceneVariantInput,
  UpdateSceneVariantInput,
} from "@/domain/schemas";

/** DB 行 → SceneVariant 域对象 */
function rowToVariant(row: Record<string, unknown>): SceneVariant {
  const parsed = parseRecordWithTable(row, "scene_variants");

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
    sceneId: String(parsed.scene_id ?? ""),
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
  return `scene-variant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

function paramToColumn(key: keyof SceneVariant): string | null {
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

export const sceneVariantStorage = {
  /** 获取场景的所有变体（按 is_default DESC, created_at ASC） */
  async getVariantsForScene(sceneId: string): Promise<SceneVariant[]> {
    const rows = await safeQuery<Record<string, unknown>>(
      "SELECT * FROM scene_variants WHERE scene_id = ? AND is_deleted = 0 ORDER BY is_default DESC, created_at ASC",
      [sceneId],
    );
    return rows.map(rowToVariant);
  },

  /** 获取所有变体（按 scene_id 分组） */
  async getAllVariants(): Promise<Map<string, SceneVariant[]>> {
    const rows = await safeQuery<Record<string, unknown>>(
      "SELECT * FROM scene_variants WHERE is_deleted = 0 ORDER BY is_default DESC, created_at ASC",
    );
    const map = new Map<string, SceneVariant[]>();
    for (const row of rows) {
      const variant = rowToVariant(row);
      const list = map.get(variant.sceneId);
      if (list) {
        list.push(variant);
      } else {
        map.set(variant.sceneId, [variant]);
      }
    }
    return map;
  },

  /** 获取单个变体 */
  async getVariantById(id: string): Promise<SceneVariant | null> {
    const rows = await safeQuery<Record<string, unknown>>(
      "SELECT * FROM scene_variants WHERE id = ? AND is_deleted = 0",
      [id],
    );
    if (rows.length === 0) return null;
    return rowToVariant(rows[0]!);
  },

  /** 获取场景的默认变体（is_default = 1 的第一个） */
  async getDefaultVariant(sceneId: string): Promise<SceneVariant | null> {
    const rows = await safeQuery<Record<string, unknown>>(
      "SELECT * FROM scene_variants WHERE scene_id = ? AND is_default = 1 AND is_deleted = 0 LIMIT 1",
      [sceneId],
    );
    if (rows.length === 0) return null;
    return rowToVariant(rows[0]!);
  },

  /** 创建新变体 */
  async createVariant(input: CreateSceneVariantInput): Promise<SceneVariant> {
    const id = input.id || generateVariantId();
    const now = Math.floor(Date.now() / 1000);
    const nowIso = new Date(now * 1000).toISOString();

    const paramValues: (string | null)[] = PARAM_COLUMNS.map((col) => {
      const keyMap: Record<string, keyof SceneVariant> = {
        time_of_day: "timeOfDay",
        weather: "weather",
        lighting: "lighting",
        mood: "mood",
        crowd_level: "crowdLevel",
        camera_angle: "cameraAngle",
        season: "season",
        color_palette: "colorPalette",
      };
      const value = input[keyMap[col] as keyof CreateSceneVariantInput];
      return value === undefined || value === null ? null : String(value);
    });

    await safeRun(
      `INSERT INTO scene_variants
        (id, scene_id, name, description, prompt_fragment,
         reference_image_path, image_url, local_image_path, thumbnail_path,
         time_of_day, weather, lighting, mood, crowd_level, camera_angle, season, color_palette,
         source_compositor_asset_id,
         is_default, is_canonical, metadata_json,
         owner_id, created_at, updated_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 1)`,
      [
        id,
        input.sceneId,
        input.name,
        input.description ?? "",
        input.promptFragment ?? "",
        input.referenceImagePath ?? null,
        input.imageUrl ?? null,
        input.localImagePath ?? null,
        input.thumbnailPath ?? null,
        ...paramValues,
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
      sceneId: input.sceneId,
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
      sourceCompositorAssetId: input.sourceCompositorAssetId,
      isDefault: input.isDefault ?? false,
      isCanonical: input.isCanonical ?? false,
      metadata: input.metadata ?? {},
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  },

  /** 更新变体（部分更新） */
  async updateVariant(id: string, patch: UpdateSceneVariantInput): Promise<void> {
    const sets: string[] = [];
    const params: (string | number | null)[] = [];

    const fieldMap: Array<[keyof UpdateSceneVariantInput, string]> = [
      ["name", "name"],
      ["description", "description"],
      ["promptFragment", "prompt_fragment"],
      ["referenceImagePath", "reference_image_path"],
      ["imageUrl", "image_url"],
      ["localImagePath", "local_image_path"],
      ["thumbnailPath", "thumbnail_path"],
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
      const col = paramToColumn(key as keyof SceneVariant);
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
      `UPDATE scene_variants SET ${sets.join(", ")} WHERE id = ?`,
      params,
    );
  },

  /** 软删除变体 */
  async deleteVariant(id: string): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await safeRun(
      `UPDATE scene_variants SET is_deleted = 1, deleted_at = ?, updated_at = ? WHERE id = ?`,
      [now, now, id],
    );
  },

  /** 删除场景的所有变体（硬删除，用于场景级联删除） */
  async deleteVariantsForScene(sceneId: string): Promise<void> {
    await safeRun(`DELETE FROM scene_variants WHERE scene_id = ?`, [
      sceneId,
    ]);
  },

  /** 设置默认变体（取消其他默认） */
  async setDefaultVariant(sceneId: string, variantId: string): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await safeTransaction([
      {
        sql: `UPDATE scene_variants SET is_default = 0, updated_at = ? WHERE scene_id = ? AND id != ?`,
        params: [now, sceneId, variantId],
      },
      {
        sql: `UPDATE scene_variants SET is_default = 1, updated_at = ? WHERE id = ? AND scene_id = ?`,
        params: [now, variantId, sceneId],
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
      `UPDATE scene_variants SET ${sets.join(", ")} WHERE id = ?`,
      values,
    );
  },
};

/**
 * 从 Compositor 生成的资产创建场景变体（对称 character variants 的 createVariantFromCompositorAsset）。
 * 由 Compositor 生成图后调用，将生成结果保存为场景的新变体。
 */
export async function createSceneVariantFromCompositorAsset(
  sceneId: string,
  asset: { id: string; url: string; prompt: string },
  name: string,
  options: Partial<Pick<CreateSceneVariantInput, "promptFragment" | "isDefault" | "isCanonical" | "timeOfDay" | "weather" | "lighting" | "mood" | "crowdLevel" | "cameraAngle" | "season" | "colorPalette" | "description">> = {},
): Promise<SceneVariant> {
  try {
    return await sceneVariantStorage.createVariant({
      sceneId,
      name,
      description: options.description ?? "",
      promptFragment: options.promptFragment ?? "",
      imageUrl: asset.url,
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
    errorLogger.warn("[SceneVariantCrud] 从 Compositor 资产创建场景变体失败", err);
    throw err;
  }
}
