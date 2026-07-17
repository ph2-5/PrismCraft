/**
 * Task 2A.10 — 角色变体迁移验证测试
 *
 * 验证 character_outfits → character_variants 的迁移逻辑：
 *   1. 基础迁移：outfit → variant 字段正确映射
 *   2. 幂等性：重复迁移不会产生重复记录
 *   3. 部分迁移：已迁移的不重复，未迁移的正常迁移
 *   4. is_default 标记保留
 *   5. accessories_json 保留到 metadata_json
 *   6. clothing → prompt_fragment
 *   7. 空表场景
 *   8. 多角色场景：每个角色的变体正确分组
 *   9. 迁移后能通过 getVariantsForCharacter 查询到
 *  10. 迁移后的变体可正常更新和删除
 *
 * 测试模式：参考 outfit-manager.test.ts，使用 vi.mock 模拟 safeQuery/safeRun/safeTransaction。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock sqlite-core
const mockSafeQuery = vi.hoisted(() => vi.fn());
const mockSafeRun = vi.hoisted(() => vi.fn());
const mockSafeTransaction = vi.hoisted(() => vi.fn());

vi.mock("@/infrastructure/storage/sqlite-core", () => ({
  safeQuery: mockSafeQuery,
  safeRun: mockSafeRun,
  safeTransaction: mockSafeTransaction,
}));

// Mock core 的 parseRecordWithTable
vi.mock("@/infrastructure/storage/core", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    parseRecordWithTable: vi.fn((row: Record<string, unknown>) => {
      // 简化版本：把 is_xxx 字段转为 boolean，其他保留
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(row)) {
        if (key.startsWith("is_")) {
          result[key] = value === 1 || value === true;
        } else {
          result[key] = value;
        }
      }
      return result;
    }),
  };
});

vi.mock("@/shared/error-logger", () => ({
  errorLogger: {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
  },
}));

import { characterVariantStorage } from "@/infrastructure/storage/characters/variant-manager";

// 内存状态：用于模拟 SQLite 表
interface OutfitRow {
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
  created_at?: number;
}

interface VariantRow {
  id: string;
  character_id: string;
  name: string;
  description: string;
  prompt_fragment: string;
  reference_image_path: string | null;
  image_url: string | null;
  local_image_path: string | null;
  thumbnail_path: string | null;
  time_of_day: string | null;
  weather: string | null;
  lighting: string | null;
  mood: string | null;
  crowd_level: string | null;
  camera_angle: string | null;
  season: string | null;
  color_palette: string | null;
  source_outfit_id: string | null;
  source_compositor_asset_id: string | null;
  is_default: number;
  is_canonical: number;
  metadata_json: string;
  is_deleted: number;
  created_at: number;
  updated_at: number;
}

let outfits: OutfitRow[];
let variants: VariantRow[];

/** 模拟 SQL 查询路由 */
function routeQuery(sql: string, params: unknown[]): unknown[] {
  const normalizedSql = sql.trim().replace(/\s+/g, " ");

  // SELECT * FROM character_outfits
  if (normalizedSql.startsWith("SELECT * FROM character_outfits")) {
    return [...outfits];
  }

  // SELECT source_outfit_id FROM character_variants WHERE source_outfit_id IS NOT NULL
  if (
    normalizedSql.startsWith("SELECT source_outfit_id FROM character_variants") &&
    normalizedSql.includes("source_outfit_id IS NOT NULL")
  ) {
    return variants
      .filter((v) => v.source_outfit_id !== null && v.is_deleted === 0)
      .map((v) => ({ source_outfit_id: v.source_outfit_id }));
  }

  // SELECT * FROM character_variants WHERE character_id = ? AND is_default = 1
  if (
    normalizedSql.startsWith("SELECT * FROM character_variants") &&
    normalizedSql.includes("character_id = ?") &&
    normalizedSql.includes("is_default = 1")
  ) {
    const characterId = params[0] as string;
    return variants.filter(
      (v) => v.character_id === characterId && v.is_default === 1 && v.is_deleted === 0,
    );
  }

  // SELECT * FROM character_variants WHERE character_id = ?
  if (
    normalizedSql.startsWith("SELECT * FROM character_variants") &&
    normalizedSql.includes("character_id = ?")
  ) {
    const characterId = params[0] as string;
    return variants.filter(
      (v) => v.character_id === characterId && v.is_deleted === 0,
    );
  }

  // SELECT * FROM character_variants WHERE id = ?
  if (
    normalizedSql.startsWith("SELECT * FROM character_variants") &&
    normalizedSql.includes("WHERE id = ?")
  ) {
    const id = params[0] as string;
    return variants.filter((v) => v.id === id && v.is_deleted === 0);
  }

  // SELECT * FROM character_variants WHERE is_deleted = 0
  if (
    normalizedSql.startsWith("SELECT * FROM character_variants") &&
    normalizedSql.includes("is_deleted = 0")
  ) {
    return variants.filter((v) => v.is_deleted === 0);
  }

  return [];
}

/** 模拟 SQL 写操作（INSERT/UPDATE/DELETE） */
function routeRun(sql: string, params: unknown[]): { changes: number; lastInsertRowid: number } {
  const normalizedSql = sql.trim().replace(/\s+/g, " ");

  // INSERT INTO character_variants
  if (normalizedSql.startsWith("INSERT")) {
    // 直接插入到 variants 数组
    const row: Partial<VariantRow> = {};
    // 简单解析：以 VALUES 后的 ? 数量对应 params
    // 由于实际 SQL 字段顺序固定，我们直接按位置映射
    // 这里仅处理迁移场景的 INSERT（16 个 ? 字段）
    if (normalizedSql.includes("INSERT OR IGNORE INTO character_variants")) {
      // 迁移 SQL 顺序：
      // id, character_id, name, description, prompt_fragment,
      // image_url, local_image_path, thumbnail_path,
      // source_outfit_id, is_default, metadata_json, created_at, updated_at
      const [
        id,
        character_id,
        name,
        description,
        prompt_fragment,
        image_url,
        local_image_path,
        thumbnail_path,
        source_outfit_id,
        is_default,
        metadata_json,
        created_at,
        updated_at,
      ] = params as [string, string, string, string, string, string | null, string | null, string | null, string | null, number, string, number, number];

      // 如果已存在同 id，跳过（INSERT OR IGNORE 行为）
      if (variants.find((v) => v.id === id)) {
        return { changes: 0, lastInsertRowid: 0 };
      }

      variants.push({
        id,
        character_id,
        name,
        description,
        prompt_fragment,
        reference_image_path: null,
        image_url,
        local_image_path,
        thumbnail_path,
        time_of_day: null,
        weather: null,
        lighting: null,
        mood: null,
        crowd_level: null,
        camera_angle: null,
        season: null,
        color_palette: null,
        source_outfit_id,
        source_compositor_asset_id: null,
        is_default,
        is_canonical: 0,
        metadata_json,
        is_deleted: 0,
        created_at,
        updated_at,
      });
      return { changes: 1, lastInsertRowid: variants.length };
    }

    // createVariant 的 INSERT（23 个字段）— 测试中不直接调用
    return { changes: 1, lastInsertRowid: variants.length };
  }

  // UPDATE character_variants SET is_deleted = 1
  if (normalizedSql.startsWith("UPDATE character_variants SET is_deleted = 1")) {
    const id = params[2] as string;
    const target = variants.find((v) => v.id === id);
    if (target) {
      target.is_deleted = 1;
      target.deleted_at = params[0] as number;
      target.updated_at = params[1] as number;
      return { changes: 1, lastInsertRowid: 0 };
    }
    return { changes: 0, lastInsertRowid: 0 };
  }

  // UPDATE character_variants SET name = ? ... (updateVariant)
  if (normalizedSql.startsWith("UPDATE character_variants SET") && !normalizedSql.includes("is_default = 0")) {
    const id = params[params.length - 1] as string;
    const target = variants.find((v) => v.id === id);
    if (!target) return { changes: 0, lastInsertRowid: 0 };

    // 简单解析：从 SET 子句提取字段
    const setMatch = normalizedSql.match(/SET\s+(.+?)\s+WHERE/i);
    if (setMatch) {
      const setClauses = setMatch[1]!.split(",").map((s) => s.trim());
      let paramIdx = 0;
      for (const clause of setClauses) {
        const colMatch = clause.match(/^(\w+)\s*=\s*\?$/);
        if (colMatch) {
          const col = colMatch[1]!;
          const value = params[paramIdx]!;
          (target as unknown as Record<string, unknown>)[col] = value;
          paramIdx++;
        }
      }
    }
    return { changes: 1, lastInsertRowid: 0 };
  }

  // DELETE FROM character_variants
  if (normalizedSql.startsWith("DELETE FROM character_variants")) {
    const characterId = params[0] as string;
    const before = variants.length;
    variants = variants.filter((v) => v.character_id !== characterId);
    return { changes: before - variants.length, lastInsertRowid: 0 };
  }

  return { changes: 0, lastInsertRowid: 0 };
}

/** 模拟事务：依次执行每个 statement */
function routeTransaction(statements: { sql: string; params: unknown[] }[]): unknown[] {
  const results: unknown[] = [];
  for (const { sql, params } of statements) {
    if (/^\s*SELECT\s/i.test(sql)) {
      results.push(routeQuery(sql, params));
    } else {
      results.push(routeRun(sql, params));
    }
  }
  return results;
}

describe("Task 2A.10 — character_outfits → character_variants 迁移验证", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    outfits = [];
    variants = [];

    mockSafeQuery.mockImplementation((sql: string, params: unknown[] = []) =>
      Promise.resolve(routeQuery(sql, params)),
    );
    mockSafeRun.mockImplementation((sql: string, params: unknown[] = []) =>
      Promise.resolve(routeRun(sql, params)),
    );
    mockSafeTransaction.mockImplementation(
      (statements: { sql: string; params: unknown[] }[]) =>
        Promise.resolve(routeTransaction(statements)),
    );
  });

  function insertOutfit(
    id: string,
    characterId: string,
    overrides: Partial<OutfitRow> = {},
  ) {
    outfits.push({
      id,
      character_id: characterId,
      name: "默认服装",
      description: "",
      clothing: "",
      accessories_json: "[]",
      image_url: null,
      local_image_path: null,
      thumbnail_path: null,
      is_default: 0,
      created_at: Math.floor(Date.now() / 1000),
      ...overrides,
    });
  }

  it("1. 基础迁移：outfit → variant 字段正确映射", async () => {
    insertOutfit("outfit-1", "char-1", {
      name: "战斗服",
      description: "黑色战斗服",
      clothing: "black combat suit",
      accessories_json: JSON.stringify(["scarf", "boots"]),
      image_url: "/images/outfit1.png",
      local_image_path: "/local/outfit1.png",
      thumbnail_path: "/thumb/outfit1.png",
      is_default: 1,
    });

    const count = await characterVariantStorage.migrateOutfitsToVariants();
    expect(count).toBe(1);

    const list = await characterVariantStorage.getVariantsForCharacter("char-1");
    expect(list).toHaveLength(1);
    const v = list[0]!;
    expect(v.characterId).toBe("char-1");
    expect(v.name).toBe("战斗服");
    expect(v.description).toBe("黑色战斗服");
    expect(v.promptFragment).toBe("black combat suit");
    expect(v.imageUrl).toBe("/images/outfit1.png");
    expect(v.localImagePath).toBe("/local/outfit1.png");
    expect(v.thumbnailPath).toBe("/thumb/outfit1.png");
    expect(v.isDefault).toBe(true);
    expect(v.sourceOutfitId).toBe("outfit-1");
    expect(v.metadata).toMatchObject({
      migratedFrom: "character_outfits",
      accessories: ["scarf", "boots"],
      originalClothing: "black combat suit",
    });
  });

  it("2. 幂等性：重复迁移不会产生重复记录", async () => {
    insertOutfit("outfit-2", "char-2", { name: "日常服" });

    const firstCount = await characterVariantStorage.migrateOutfitsToVariants();
    expect(firstCount).toBe(1);

    const secondCount = await characterVariantStorage.migrateOutfitsToVariants();
    expect(secondCount).toBe(0);

    const list = await characterVariantStorage.getVariantsForCharacter("char-2");
    expect(list).toHaveLength(1);
  });

  it("3. 部分迁移：已迁移的不重复，未迁移的正常迁移", async () => {
    insertOutfit("outfit-3a", "char-3", { name: "服装A" });
    insertOutfit("outfit-3b", "char-3", { name: "服装B" });

    const firstCount = await characterVariantStorage.migrateOutfitsToVariants();
    expect(firstCount).toBe(2);

    // 新增一个 outfit（模拟后续添加）
    insertOutfit("outfit-3c", "char-3", { name: "服装C" });

    const secondCount = await characterVariantStorage.migrateOutfitsToVariants();
    expect(secondCount).toBe(1);

    const list = await characterVariantStorage.getVariantsForCharacter("char-3");
    expect(list).toHaveLength(3);
    const names = list.map((v) => v.name).sort();
    expect(names).toEqual(["服装A", "服装B", "服装C"]);
  });

  it("4. is_default 标记保留", async () => {
    insertOutfit("outfit-4a", "char-4", { name: "默认服装", is_default: 1 });
    insertOutfit("outfit-4b", "char-4", { name: "备用服装", is_default: 0 });

    await characterVariantStorage.migrateOutfitsToVariants();

    const defaultVariant = await characterVariantStorage.getDefaultVariant("char-4");
    expect(defaultVariant).not.toBeNull();
    expect(defaultVariant!.name).toBe("默认服装");
    expect(defaultVariant!.isDefault).toBe(true);
  });

  it("5. accessories_json 保留到 metadata_json", async () => {
    insertOutfit("outfit-5", "char-5", {
      name: "配饰测试",
      accessories_json: JSON.stringify(["hat", "glasses", "watch"]),
    });

    await characterVariantStorage.migrateOutfitsToVariants();

    const list = await characterVariantStorage.getVariantsForCharacter("char-5");
    expect(list).toHaveLength(1);
    expect(list[0]!.metadata.accessories).toEqual(["hat", "glasses", "watch"]);
  });

  it("6. clothing 为空时 prompt_fragment 也为空", async () => {
    insertOutfit("outfit-6", "char-6", {
      name: "无服装描述",
      clothing: "",
    });

    await characterVariantStorage.migrateOutfitsToVariants();

    const list = await characterVariantStorage.getVariantsForCharacter("char-6");
    expect(list).toHaveLength(1);
    expect(list[0]!.promptFragment).toBe("");
  });

  it("7. 空表场景：无 outfit 时返回 0", async () => {
    const count = await characterVariantStorage.migrateOutfitsToVariants();
    expect(count).toBe(0);

    const list = await characterVariantStorage.getVariantsForCharacter("char-7");
    expect(list).toHaveLength(0);
  });

  it("8. 多角色场景：每个角色的变体正确分组", async () => {
    insertOutfit("outfit-8a1", "char-8a", { name: "Heidi 服装1" });
    insertOutfit("outfit-8a2", "char-8a", { name: "Heidi 服装2" });
    insertOutfit("outfit-8b1", "char-8b", { name: "Ivan 服装1" });

    const count = await characterVariantStorage.migrateOutfitsToVariants();
    expect(count).toBe(3);

    const allVariants = await characterVariantStorage.getAllVariants();
    expect(allVariants.size).toBe(2);
    expect(allVariants.get("char-8a")).toHaveLength(2);
    expect(allVariants.get("char-8b")).toHaveLength(1);
  });

  it("9. 迁移后的变体可被 getVariantById 查询", async () => {
    insertOutfit("outfit-9", "char-9", { name: "可查询变体" });

    await characterVariantStorage.migrateOutfitsToVariants();

    const list = await characterVariantStorage.getVariantsForCharacter("char-9");
    expect(list).toHaveLength(1);
    const variantId = list[0]!.id;
    const fetched = await characterVariantStorage.getVariantById(variantId);
    expect(fetched).not.toBeNull();
    expect(fetched!.name).toBe("可查询变体");
  });

  it("10. 迁移后的变体可正常更新和删除", async () => {
    insertOutfit("outfit-10", "char-10", { name: "可更新变体" });

    await characterVariantStorage.migrateOutfitsToVariants();

    const list = await characterVariantStorage.getVariantsForCharacter("char-10");
    expect(list).toHaveLength(1);
    const variantId = list[0]!.id;

    // 更新
    await characterVariantStorage.updateVariant(variantId, {
      name: "已更新名称",
      promptFragment: "updated prompt",
    });
    const updated = await characterVariantStorage.getVariantById(variantId);
    expect(updated!.name).toBe("已更新名称");
    expect(updated!.promptFragment).toBe("updated prompt");

    // 删除（软删除）
    await characterVariantStorage.deleteVariant(variantId);
    const deleted = await characterVariantStorage.getVariantById(variantId);
    expect(deleted).toBeNull();
  });
});
