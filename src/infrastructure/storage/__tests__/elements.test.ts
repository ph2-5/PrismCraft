import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/infrastructure/storage/sqlite-core", () => ({
  safeQuery: vi.fn(),
  safeRun: vi.fn(),
  safeTransaction: vi.fn(),
}));
vi.mock("@/infrastructure/storage/core", () => ({
  toSqlValue: vi.fn((v) => (v === undefined ? null : v)),
  trackChange: vi.fn(),
  isElectron: vi.fn(() => true),
}));
vi.mock("@/shared/error-logger", () => ({
  errorLogger: { warn: vi.fn(), error: vi.fn() },
}));

const mockSafeQuery = vi.mocked(
  (await import("@/infrastructure/storage/sqlite-core")).safeQuery,
);
const mockSafeRun = vi.mocked(
  (await import("@/infrastructure/storage/sqlite-core")).safeRun,
);
const mockSafeTransaction = vi.mocked(
  (await import("@/infrastructure/storage/sqlite-core")).safeTransaction,
);

let ElementStorage: typeof import("../elements").ElementStorage;
let elementStorage: import("../elements").ElementStorage;

beforeEach(async () => {
  vi.clearAllMocks();
  mockSafeQuery.mockResolvedValue([]);
  mockSafeRun.mockResolvedValue(undefined as unknown as DbRunResult);
  mockSafeTransaction.mockResolvedValue([]);
  const mod = await import("../elements");
  ElementStorage = mod.ElementStorage;
  elementStorage = mod.elementStorage;
});

describe("ElementStorage", () => {
  describe("subscribe/notify — 观察者模式", () => {
    it("订阅后调用 notify，监听器被调用", () => {
      const storage = new ElementStorage();
      const listener = vi.fn();
      storage.subscribe(listener);
      storage.notify();
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("取消订阅后调用 notify，监听器不再被调用", () => {
      const storage = new ElementStorage();
      const listener = vi.fn();
      const unsubscribe = storage.subscribe(listener);
      unsubscribe();
      storage.notify();
      expect(listener).not.toHaveBeenCalled();
    });

    it("多个监听器都收到通知", () => {
      const storage = new ElementStorage();
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      storage.subscribe(listener1);
      storage.subscribe(listener2);
      storage.notify();
      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });
  });

  describe("createElement ID 生成 — 使用 crypto.randomUUID()", () => {
    it("生成的 ID 应为 PREFIX_uuid 格式", async () => {
      const result = await elementStorage.createElement("character", "角色A");

      expect(result.id).toMatch(/^CHAR_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });
  });

  describe("createElement 前缀映射 — 不同 type 使用不同前缀", () => {
    it.each([
      ["character", "CHAR"],
      ["prop", "PROP"],
      ["effect", "EFFECT"],
    ] as const)(
      "type=%s → ID 前缀 %s",
      async (type, prefix) => {
        const result = await elementStorage.createElement(type, "测试");

        expect(result.id).toMatch(new RegExp(`^${prefix}_[0-9a-f]{8}-`));
      },
    );
  });

  describe("createElement 首次成功 — 直接生成 UUID ID", () => {
    it("生成的 ID 应包含正确的前缀和类型", async () => {
      const result = await elementStorage.createElement("character", "角色A");

      expect(result.id).toMatch(/^CHAR_/);
      expect(result.type).toBe("character");
      expect(result.name).toBe("角色A");
    });
  });

  describe("getLibrary nextCode 计算 — 从已有元素 ID 中提取最大编号+1", () => {
    it("已有 CHAR_005 时 nextCode.character === 6", async () => {
      mockSafeQuery.mockResolvedValue([
        {
          id: "CHAR_005",
          type: "character",
          name: "角色",
          description: null,
          character_config_json: null,
          scene_config_json: null,
          feature_anchor_json: null,
          reference_image_quality_json: null,
          bindings_json: null,
          created_at: 1000,
          updated_at: 1000,
        },
      ]);

      const library = await elementStorage.getLibrary();

      expect(library.nextCode.character).toBe(6);
      expect(library.nextCode.prop).toBe(1);
      expect(library.nextCode.effect).toBe(1);
    });
  });

  describe("updateElement 不存在 — 更新不存在的元素应抛错", () => {
    it("getElement 返回空时应抛出包含 not found 的错误", async () => {
      mockSafeQuery.mockResolvedValue([]);

      await expect(
        elementStorage.updateElement("CHAR_999", { name: "新名称" }),
      ).rejects.toThrow(/not found/i);
    });
  });

  describe("updateElement changes=0 — changes=0 时检查存在性", () => {
    it("safeRun 返回 changes=0 且元素不存在时应抛错", async () => {
      mockSafeQuery.mockImplementation((sql: string) => {
        if (sql.includes("WHERE id = ?") && !sql.includes("UPDATE")) {
          if (sql.includes("SELECT *")) {
            return Promise.resolve([
              {
                id: "CHAR_001",
                type: "character",
                name: "角色",
                description: "",
                character_config_json: null,
                scene_config_json: null,
                feature_anchor_json: null,
                reference_image_quality_json: null,
                bindings_json: "[]",
                created_at: 1000,
                updated_at: 1000,
              },
            ]);
          }
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      });
      mockSafeRun.mockResolvedValue({ changes: 0 });

      await expect(
        elementStorage.updateElement("CHAR_001", { name: "新名称" }),
      ).rejects.toThrow(/not found/i);
    });
  });

  describe("deleteElement 级联 — 删除元素应级联删除 story_elements", () => {
    it("safeTransaction 应包含 2 个语句：story_elements + elements", async () => {
      await elementStorage.deleteElement("CHAR_001");

      expect(mockSafeTransaction).toHaveBeenCalledTimes(1);
      const statements = mockSafeTransaction.mock.calls[0][0] as Array<{
        sql: string;
        params: unknown[];
      }>;
      expect(statements).toHaveLength(2);
      expect(statements[0].sql).toContain("story_elements");
      expect(statements[1].sql).toContain("elements");
      expect(statements[0].params).toEqual(["CHAR_001"]);
      expect(statements[1].params).toEqual(["CHAR_001"]);
    });
  });

  describe("getElement 存在 — 返回元素", () => {
    it("查询返回数据时应返回正确的元素", async () => {
      mockSafeQuery.mockResolvedValue([
        {
          id: "CHAR_001",
          type: "character",
          name: "角色A",
          description: "描述",
          character_config_json: null,
          scene_config_json: null,
          feature_anchor_json: null,
          reference_image_quality_json: null,
          bindings_json: "[]",
          created_at: 1700000000,
          updated_at: 1700000000,
        },
      ]);

      const result = await elementStorage.getElement("CHAR_001");

      expect(result).toBeDefined();
      expect(result!.id).toBe("CHAR_001");
      expect(result!.name).toBe("角色A");
      expect(result!.description).toBe("描述");
    });
  });

  describe("getElement 不存在 — 返回 undefined", () => {
    it("查询返回空数组时应返回 undefined", async () => {
      mockSafeQuery.mockResolvedValue([]);

      const result = await elementStorage.getElement("CHAR_999");

      expect(result).toBeUndefined();
    });
  });
});
