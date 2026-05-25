import { safeQuery, safeRun, safeTransaction } from "./sqlite-core";
import { parseRecordWithTable, trackChange } from "./core";
import { errorLogger } from "@/shared/error-logger";
import type { Collection, CollectionAsset } from "@/domain/schemas";

function parseCollection(record: Record<string, unknown>): Collection {
  const parsed = parseRecordWithTable(record, "collections");
  return {
    id: String(parsed.id || ""),
    name: String(parsed.name || ""),
    createdAt: parsed.created_at ? String(parsed.created_at) : "",
    updatedAt: parsed.updated_at ? String(parsed.updated_at) : "",
  };
}

function parseCollectionAsset(
  record: Record<string, unknown>,
): CollectionAsset {
  const parsed = parseRecordWithTable(record, "collection_assets");
  return {
    id: String(parsed.id || ""),
    collectionId: String(parsed.collection_id || ""),
    assetType: String(parsed.asset_type || "") as CollectionAsset["assetType"],
    assetId: String(parsed.asset_id || ""),
  };
}

export const collectionStorage = {
  async getCollections(): Promise<Collection[]> {
    const result = await safeQuery<Record<string, unknown>>(
      "SELECT * FROM collections ORDER BY created_at DESC",
    );
    return result.map(parseCollection);
  },

  async getCollectionById(id: string): Promise<Collection | null> {
    const result = await safeQuery<Record<string, unknown>>(
      "SELECT * FROM collections WHERE id = ?",
      [id],
    );
    return result.length > 0 ? parseCollection(result[0]) : null;
  },

  async createCollection(name: string, id?: string): Promise<Collection> {
    const now = Math.floor(Date.now() / 1000);
    const collectionId =
      id || `col_${crypto.randomUUID()}`;
    await safeRun(
      "INSERT OR IGNORE INTO collections (id, name, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      [collectionId, name, 1, now, now],
    );
    try {
      await trackChange("collection", collectionId, "insert");
    } catch (e) { errorLogger.warn("[Storage] trackChange failed for collection:insert", e); }
    return {
      id: collectionId,
      name,
      createdAt: String(now),
      updatedAt: String(now),
    };
  },

  async deleteCollection(id: string): Promise<void> {
    await safeTransaction([
      {
        sql: "DELETE FROM collection_assets WHERE collection_id = ?",
        params: [id],
      },
      { sql: "DELETE FROM collections WHERE id = ?", params: [id] },
    ]);
    try {
      await trackChange("collection", id, "delete");
    } catch (e) { errorLogger.warn("[Storage] trackChange failed for collection:delete", e); }
  },

  async getCollectionAssets(): Promise<CollectionAsset[]> {
    const result = await safeQuery<Record<string, unknown>>(
      "SELECT * FROM collection_assets ORDER BY created_at DESC",
    );
    return result.map(parseCollectionAsset);
  },

  async getAssetsInCollection(
    collectionId: string,
  ): Promise<CollectionAsset[]> {
    const result = await safeQuery<Record<string, unknown>>(
      "SELECT * FROM collection_assets WHERE collection_id = ?",
      [collectionId],
    );
    return result.map(parseCollectionAsset);
  },

  async addAssetToCollection(
    collectionId: string,
    assetType: string,
    assetId: string,
  ): Promise<void> {
    const id = `ca_${collectionId}_${assetType}_${assetId}`;
    const now = Math.floor(Date.now() / 1000);
    await safeRun(
      "INSERT OR IGNORE INTO collection_assets (id, collection_id, asset_type, asset_id, created_at) VALUES (?, ?, ?, ?, ?)",
      [id, collectionId, assetType, assetId, now],
    );
    try {
      await trackChange("collection", collectionId, "update");
    } catch (e) { errorLogger.warn("[Storage] trackChange failed for collection:addAsset", e); }
  },

  async removeAssetFromCollection(
    collectionId: string,
    assetType: string,
    assetId: string,
  ): Promise<void> {
    await safeRun(
      "DELETE FROM collection_assets WHERE collection_id = ? AND asset_type = ? AND asset_id = ?",
      [collectionId, assetType, assetId],
    );
    try {
      await trackChange("collection", collectionId, "update");
    } catch (e) { errorLogger.warn("[Storage] trackChange failed for collection:removeAsset", e); }
  },

  async getCollectionAssetsByAsset(
    assetType: string,
    assetId: string,
  ): Promise<CollectionAsset[]> {
    const result = await safeQuery<Record<string, unknown>>(
      "SELECT * FROM collection_assets WHERE asset_type = ? AND asset_id = ?",
      [assetType, assetId],
    );
    return result.map(parseCollectionAsset);
  },
};
