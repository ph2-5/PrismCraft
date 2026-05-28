import { safeQuery, safeRun, safeTransaction } from "./sqlite-core";
import { parseRecordWithTable, toSqlValue, trackChange, buildInsert } from "./core";
import type { DbRunResult } from "./core";
import type { StoryVersion } from "@/domain/schemas";
import { characterStorage } from "./characters";
import { sceneStorage } from "./scenes";
import { storyStorage } from "./stories";
import { videoTaskStorage } from "./video-tasks";
import type { VideoTask, MediaAsset } from "@/domain/schemas";
import { mediaAssetRepository } from "@/infrastructure/database";
import { storyboardStorage } from "./storyboard";
import { collectionStorage } from "./collections";
import { versionStorage } from "./versions";
import { errorLogger } from "@/shared/error-logger";
import { sanitizeIdentifier, sanitizeTable } from "./sql-sanitizer";

function camelToSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function convertRecordToCamel(record: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    result[snakeToCamel(key)] = value;
  }
  return result;
}

const TABLE_PRIMARY_KEYS: Record<string, string> = {
  characters: "id",
  scenes: "id",
  stories: "id",
  video_tasks: "id",
  media_assets: "id",
  story_versions: "id",
  storyboard_assets: "id",
  collections: "id",
  video_templates: "id",
  video_cache: "task_id",
  ast_templates: "id",
  asset_tags: "asset_id",
  auto_saves: "id",
};

export const importExportStorage = {
  async exportAll(): Promise<Record<string, unknown[]>> {
    const [
      characters,
      scenes,
      stories,
      videoTasks,
      assets,
      videoTemplates,
      storyVersions,
      storyboardAssets,
      collections,
      collectionAssets,
      videoCache,
      astTemplates,
      assetTags,
      autoSaves,
    ] = await Promise.all([
      characterStorage.getCharacters(),
      sceneStorage.getScenes(),
      storyStorage.getStories(),
      videoTaskStorage.getVideoTasks(),
      (async () => {
        const r = await mediaAssetRepository.findAll();
        return r.ok ? r.value : [];
      })(),
      safeQuery<Record<string, unknown>>("SELECT * FROM video_templates"),
      safeQuery<Record<string, unknown>>("SELECT * FROM story_versions"),
      storyboardStorage.getStoryboardAssets(),
      collectionStorage.getCollections(),
      collectionStorage.getCollectionAssets(),
      safeQuery<Record<string, unknown>>("SELECT * FROM video_cache"),
      safeQuery<Record<string, unknown>>("SELECT * FROM ast_templates"),
      safeQuery<Record<string, unknown>>("SELECT * FROM asset_tags"),
      safeQuery<Record<string, unknown>>("SELECT * FROM auto_saves"),
    ]);
    return {
      characters,
      scenes,
      stories,
      videoTasks,
      assets,
      videoTemplates: videoTemplates.map((r) => parseRecordWithTable(r, "video_templates")),
      storyVersions: storyVersions.map((r) => parseRecordWithTable(r, "story_versions")),
      storyboardAssets,
      collections,
      collectionAssets,
      videoCache: videoCache.map((r) => parseRecordWithTable(r, "video_cache")),
      astTemplates: astTemplates.map((r) => parseRecordWithTable(r, "ast_templates")),
      assetTags: assetTags.map((r) => parseRecordWithTable(r, "asset_tags")),
      autoSaves: autoSaves.map((r) => parseRecordWithTable(r, "auto_saves")),
    };
  },

  async importData(
    data: Record<string, unknown[]>,
    strategy: "replace" | "merge" | "skip" = "skip",
  ): Promise<Record<string, number>> {
    const result: Record<string, number> = {};

    const tables: {
      key: string;
      tableName: string;
      createFn: (item: Record<string, unknown>) => Promise<void | string | DbRunResult>;
    }[] = [
      {
        key: "characters",
        tableName: "characters",
        createFn: (item) => characterStorage.createCharacter(item),
      },
      {
        key: "scenes",
        tableName: "scenes",
        createFn: (item) => sceneStorage.createScene(item),
      },
      {
        key: "stories",
        tableName: "stories",
        createFn: (item) => storyStorage.createStory(item),
      },
      {
        key: "videoTasks",
        tableName: "video_tasks",
        createFn: (item) => videoTaskStorage.createVideoTask(item as Partial<VideoTask> & { taskId: string }),
      },
      {
        key: "assets",
        tableName: "media_assets",
        createFn: async (item) => {
          const record = item as Record<string, unknown>;
          await mediaAssetRepository.create({
            id: String(record.id || ""),
            name: String(record.name || ""),
            description: record.description ? String(record.description) : undefined,
            type: (record.type as "image" | "video") || "image",
            url: String(record.url || ""),
            thumbnailUrl: record.thumbnailUrl ? String(record.thumbnailUrl) : undefined,
            tags: Array.isArray(record.tags) ? record.tags.map(String) : undefined,
            createdAt: record.createdAt ? String(record.createdAt) : undefined,
            updatedAt: record.updatedAt ? String(record.updatedAt) : undefined,
            boundTo: record.boundTo
              ? {
                  type: (record.boundTo as Record<string, unknown>).type as "character" | "scene",
                  id: String((record.boundTo as Record<string, unknown>).id || ""),
                  name: String((record.boundTo as Record<string, unknown>).name || ""),
                }
              : undefined,
            fileSize: typeof record.fileSize === "number" ? record.fileSize : undefined,
            mimeType: record.mimeType ? String(record.mimeType) : undefined,
            width: typeof record.width === "number" ? record.width : undefined,
            height: typeof record.height === "number" ? record.height : undefined,
            duration: typeof record.duration === "number" ? record.duration : undefined,
          } as Partial<MediaAsset> & { id: string });
        },
      },
      {
        key: "storyVersions",
        tableName: "story_versions",
        createFn: (item) => {
          return versionStorage.createStoryVersion(item as unknown as StoryVersion);
        },
      },
      {
        key: "storyboardAssets",
        tableName: "storyboard_assets",
        createFn: (item) => storyboardStorage.createStoryboardAsset(item),
      },
      {
        key: "collections",
        tableName: "collections",
        createFn: async (item: Record<string, unknown>) => {
          await collectionStorage.createCollection(
            String(item.name || ""),
            item.id ? String(item.id) : undefined,
          );
        },
      },
      {
        key: "videoCache",
        tableName: "video_cache",
        createFn: (item) =>
          safeRun(
            `INSERT OR IGNORE INTO video_cache (task_id, file_path, original_url, mime_type, file_size, cached_at, owner_id, version, sync_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              item.task_id,
              item.file_path || null,
              item.original_url || null,
              item.mime_type || null,
              item.file_size || 0,
              item.cached_at || Math.floor(Date.now() / 1000),
              1,
              1,
              null,
            ],
          ),
      },
      {
        key: "astTemplates",
        tableName: "ast_templates",
        createFn: (item) =>
          safeRun(
            `INSERT OR IGNORE INTO ast_templates (id, name, description, category, genre, tone, tags, author, total_duration, beats_count, characters_count, scenes_count, ast_file_path, ast_file_size, is_public, parent_template_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              item.id,
              item.name || "",
              item.description || null,
              item.category || null,
              item.genre || null,
              item.tone || null,
              item.tags || null,
              item.author || null,
              item.total_duration || 0,
              item.beats_count || 0,
              item.characters_count || 0,
              item.scenes_count || 0,
              item.ast_file_path || null,
              item.ast_file_size || null,
              item.is_public ? 1 : 0,
              item.parent_template_id || null,
              item.created_at || Math.floor(Date.now() / 1000),
              item.updated_at || Math.floor(Date.now() / 1000),
            ],
          ),
      },
      {
        key: "assetTags",
        tableName: "asset_tags",
        createFn: (item) =>
          safeRun(
            `INSERT OR IGNORE INTO asset_tags (asset_id, asset_type, tag, confidence, created_at) VALUES (?, ?, ?, ?, ?)`,
            [
              item.asset_id,
              item.asset_type || "character",
              item.tag,
              item.confidence || 1.0,
              item.created_at || Math.floor(Date.now() / 1000),
            ],
          ),
      },
      {
        key: "autoSaves",
        tableName: "auto_saves",
        createFn: (item) =>
          safeRun(
            `INSERT OR IGNORE INTO auto_saves (id, type, data_json, timestamp) VALUES (?, ?, ?, ?)`,
            [
              item.id,
              item.type || item.auto_saved ? "story" : "character",
              toSqlValue(item.data_json || item.data),
              item.timestamp ||
                item.created_at ||
                Math.floor(Date.now() / 1000),
            ],
          ),
      },
    ];

    for (const table of tables) {
      const items = data[table.key];
      if (!Array.isArray(items)) continue;

      if (strategy === "replace") {
        const VALID_TABLE_NAMES = new Set(tables.map((t) => t.tableName));

        for (const insTable of tables) {
          const insItems = data[insTable.key];
          if (!Array.isArray(insItems) || insItems.length === 0) continue;
          if (!VALID_TABLE_NAMES.has(insTable.tableName)) continue;
          let tableImported = 0;
          const importedIds: string[] = [];
          const pk = TABLE_PRIMARY_KEYS[insTable.tableName] || "id";
          for (const item of insItems) {
            try {
              await insTable.createFn(item as Record<string, unknown>);
              tableImported++;
              const record = item as Record<string, unknown>;
              const idValue = record[pk] || record.id;
              if (idValue) importedIds.push(String(idValue));
            } catch (e) {
              errorLogger.warn(
              `[Import] replace导入 ${insTable.tableName} 记录失败`,
              e,
            );
            }
          }
          if (importedIds.length > 0) {
            const safeTable = sanitizeTable(insTable.tableName);
            const safePk = sanitizeIdentifier(pk);
            const placeholders = importedIds.map(() => "?").join(",");
            await safeRun(
              `DELETE FROM ${safeTable} WHERE ${safePk} NOT IN (${placeholders})`,
              importedIds,
            );
          }
          result[insTable.key] = tableImported;
        }

        if (Array.isArray(data.stories) && data.stories.length > 0) {
          const importedStoryIds = (data.stories as Record<string, unknown>[])
            .map((s) => String(s.id || ""))
            .filter(Boolean);
          if (importedStoryIds.length > 0) {
            const placeholders = importedStoryIds.map(() => "?").join(",");
            await safeTransaction([
              { sql: `DELETE FROM story_characters WHERE story_id NOT IN (${placeholders})`, params: importedStoryIds },
              { sql: `DELETE FROM story_scenes WHERE story_id NOT IN (${placeholders})`, params: importedStoryIds },
              { sql: `DELETE FROM story_beats WHERE story_id NOT IN (${placeholders})`, params: importedStoryIds },
              { sql: `DELETE FROM story_elements WHERE story_id NOT IN (${placeholders})`, params: importedStoryIds },
            ]);
          }
        }
      } else if (strategy === "merge") {
        let imported = 0;
        let updated = 0;
        for (const item of items) {
          const record = item as Record<string, unknown>;
          const pk = TABLE_PRIMARY_KEYS[table.tableName] || "id";
          const pkValue = record[pk] || record.id;
          if (!pkValue) continue;
          const existing = await safeQuery(
            `SELECT ${sanitizeIdentifier(pk)} FROM ${sanitizeTable(table.tableName)} WHERE ${sanitizeIdentifier(pk)} = ?`,
            [pkValue],
          );
          try {
            if (existing.length > 0) {
              const camelRecord = convertRecordToCamel(record);
              const hasUpdateFn =
                (table.tableName === "characters" &&
                  characterStorage.updateCharacter) ||
                (table.tableName === "scenes" && sceneStorage.updateScene) ||
                (table.tableName === "stories" && storyStorage.updateStory) ||
                (table.tableName === "video_tasks" &&
                  videoTaskStorage.updateVideoTask);
              if (hasUpdateFn) {
                if (table.tableName === "characters") {
                  await characterStorage.updateCharacter(
                    pkValue as string,
                    camelRecord,
                  );
                } else if (table.tableName === "scenes") {
                  await sceneStorage.updateScene(pkValue as string, camelRecord);
                } else if (table.tableName === "stories") {
                  await storyStorage.updateStory(pkValue as string, camelRecord);
                } else if (table.tableName === "video_tasks") {
                  await videoTaskStorage.updateVideoTask(
                    pkValue as string,
                    camelRecord,
                  );
                }
                updated++;
              } else {
                // Fallback: generic UPDATE for tables without specific update function
                const columns = Object.keys(record).filter(
                  (k) =>
                    k !== pk &&
                    !k.startsWith("_") &&
                    /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k),
                );
                if (columns.length > 0) {
                  const safeColumns = columns.map((c) => sanitizeIdentifier(camelToSnakeCase(c)));
                  const safePk = sanitizeIdentifier(pk);
                  const sets = safeColumns
                    .map((c) => `${c} = ?`)
                    .join(", ");
                  const values = columns.map((c) => toSqlValue(record[c]));
                  await safeRun(
                    `UPDATE ${sanitizeIdentifier(table.tableName)} SET ${sets} WHERE ${safePk} = ?`,
                    [...values, pkValue],
                  );
                  updated++;
                }
              }
            } else {
              await table.createFn(record);
              imported++;
            }
          } catch (e) {
            errorLogger.warn(
              `[Import] merge导入 ${table.tableName} 记录失败`,
              { pkValue, error: e },
            );
          }
        }
        result[table.key] = imported + updated;
      } else {
        const VALID_TABLE_NAMES = new Set(tables.map((t) => t.tableName));
        if (!VALID_TABLE_NAMES.has(table.tableName)) {
          result[table.key] = 0;
          continue;
        }
        let imported = 0;
        for (const item of items) {
          const record = item as Record<string, unknown>;
          const pk = TABLE_PRIMARY_KEYS[table.tableName] || "id";
          const pkValue = record[pk] || record.id;
          if (!pkValue) {
            continue;
          }
          const existing = await safeQuery(
            `SELECT ${sanitizeIdentifier(pk)} FROM ${sanitizeTable(table.tableName)} WHERE ${sanitizeIdentifier(pk)} = ?`,
            [pkValue],
          );
          if (existing.length > 0) continue;
          try {
            await table.createFn(item as Record<string, unknown>);
            imported++;
          } catch (e) {
            errorLogger.warn(
              `[Import] 导入 ${table.tableName} 记录失败`,
              { recordId: record.id, error: e },
            );
          }
        }
        result[table.key] = imported;
      }
    }

    if (Array.isArray(data.collectionAssets)) {
      let imported = 0;
      const importedKeys: string[] = [];
      for (const ca of data.collectionAssets) {
        const item = ca as Record<string, unknown>;
        try {
          await collectionStorage.addAssetToCollection(
            String(item.collectionId || item.collection_id),
            String(item.assetType || item.asset_type),
            String(item.assetId || item.asset_id),
          );
          imported++;
          importedKeys.push(`${String(item.collectionId || item.collection_id)}:${String(item.assetType || item.asset_type)}:${String(item.assetId || item.asset_id)}`);
        } catch (e) {
          errorLogger.warn("[Import] collectionAssets 导入失败", e);
        }
      }
      if (strategy === "replace" && importedKeys.length > 0) {
        const placeholders = importedKeys.map(() => "?").join(",");
        await safeRun(
          `DELETE FROM collection_assets WHERE concat(collection_id, ':', asset_type, ':', asset_id) NOT IN (${placeholders})`,
          importedKeys,
        );
      }
      result.collectionAssets = imported;
    }

    return result;
  },
};
