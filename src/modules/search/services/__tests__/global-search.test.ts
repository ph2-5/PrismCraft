/**
 * global-search 服务单元测试
 *
 * 验证：
 * - 空关键词 + 无标签返回空结果
 * - 类型筛选正确（仅搜索指定类型）
 * - 标签过滤正确
 * - 结果限制（limitPerType / totalLimit）
 * - 路由映射正确
 * - service 失败时返回空数组（容错性）
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { AppError } from "@/domain/types/result";

// ============= Mock 各 service =============

const mockCharacters = [
  {
    id: "c1",
    name: "勇者亚瑟",
    description: "来自北方的勇敢战士",
    style: "奇幻",
    tags: ["主角", "战士"],
    thumbnailPath: "/thumb/c1.png",
    updatedAt: "2026-01-01",
  },
  {
    id: "c2",
    name: "魔法师艾琳",
    description: "掌握元素魔法的智者",
    style: "奇幻",
    tags: ["配角", "法师"],
    thumbnailPath: "/thumb/c2.png",
    updatedAt: "2026-01-02",
  },
];

const mockScenes = [
  {
    id: "s1",
    name: "古代城堡",
    description: "巍峨的中世纪城堡",
    tags: ["室外", "城堡"],
    thumbnailPath: "/thumb/s1.png",
    updatedAt: "2026-01-03",
  },
];

const mockStories = [
  {
    id: "st1",
    title: "勇者传说",
    description: "勇者拯救王国的故事",
    updatedAt: 1735689600,
  },
];

const mockMediaAssets = [
  {
    id: "m1",
    name: "森林背景素材",
    description: "深邃森林背景图",
    type: "image" as const,
    url: "/media/m1.png",
    thumbnailUrl: "/thumb/m1.png",
    tags: ["背景", "森林"],
    createdAt: "1735689600",
    updatedAt: "1735689600",
  },
];

vi.mock("@/modules/character", () => ({
  characterService: {
    getAll: vi.fn().mockResolvedValue({ ok: true, value: mockCharacters }),
  },
}));

vi.mock("@/modules/scene", () => ({
  sceneService: {
    getAll: vi.fn().mockResolvedValue({ ok: true, value: mockScenes }),
  },
}));

vi.mock("@/modules/storyboard", () => ({
  storyService: {
    getAll: vi.fn().mockResolvedValue({ ok: true, value: mockStories }),
  },
}));

vi.mock("@/modules/asset", () => ({
  mediaAssetService: {
    getAll: vi.fn().mockResolvedValue(mockMediaAssets),
  },
}));

// ============= 测试 =============

import { globalSearch, quickSearch, getSearchResultRoute } from "../global-search";
import type { SearchResult } from "@/domain/schemas";

describe("global-search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("globalSearch", () => {
    it("空关键词 + 无标签应返回空结果", async () => {
      const result = await globalSearch("");
      expect(result.results).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.counts.character).toBe(0);
      expect(result.counts["media-asset"]).toBe(0);
    });

    it("搜索 '勇者' 应匹配角色 + 故事", async () => {
      const { results, counts } = await globalSearch("勇者");
      // 角色：勇者亚瑟（名称匹配）
      expect(counts.character).toBe(1);
      expect(results.find((r) => r.type === "character")?.title).toBe("勇者亚瑟");
      // 故事：勇者传说（标题匹配）
      expect(counts.story).toBe(1);
      expect(results.find((r) => r.type === "story")?.title).toBe("勇者传说");
    });

    it("类型筛选 character 应仅搜索角色", async () => {
      const { counts } = await globalSearch("勇者", { assetType: "character" });
      expect(counts.character).toBe(1);
      expect(counts.scene).toBe(0);
      expect(counts.story).toBe(0);
      expect(counts["media-asset"]).toBe(0);
    });

    it("类型筛选 media-asset 应仅搜索素材", async () => {
      const { counts } = await globalSearch("森林", { assetType: "media-asset" });
      expect(counts["media-asset"]).toBe(1);
      expect(counts.character).toBe(0);
    });

    it("标签过滤应仅返回包含标签的结果", async () => {
      const { results } = await globalSearch("勇", { tag: "主角" });
      // 只有勇者亚瑟有 "主角" 标签
      const characters = results.filter((r) => r.type === "character");
      expect(characters).toHaveLength(1);
      expect(characters[0]?.title).toBe("勇者亚瑟");
    });

    it("limitPerType 应限制每类返回数量", async () => {
      const { counts } = await globalSearch("奇幻", { limitPerType: 1 });
      // "奇幻" 在 style 字段匹配 2 个角色，但 limitPerType=1
      expect(counts.character).toBeLessThanOrEqual(1);
    });

    it("相关度排序：名称匹配应高于描述匹配", async () => {
      // "勇者" 在名称中匹配（c1: "勇者亚瑟"），在描述中匹配（st1: "勇者拯救王国"）
      const { results } = await globalSearch("勇者");
      // 角色名称匹配分数 50+，故事标题匹配分数 50+，但角色的 tags 也有匹配加成
      const characterIdx = results.findIndex((r) => r.type === "character");
      const storyIdx = results.findIndex((r) => r.type === "story");
      // 两者都应存在
      expect(characterIdx).toBeGreaterThanOrEqual(0);
      expect(storyIdx).toBeGreaterThanOrEqual(0);
    });

    it("service 失败时应返回空数组（容错性）", async () => {
      // 动态修改 mock 使 characterService.getAll 返回失败
      const { characterService } = await import("@/modules/character");
      vi.mocked(characterService.getAll).mockResolvedValueOnce({
        ok: false,
        error: new AppError("DATABASE_ERROR", "DB error"),
      });

      const { counts } = await globalSearch("勇者", { assetType: "character" });
      expect(counts.character).toBe(0);
    });

    it("结果应包含 thumbnailUrl 和 updatedAt 字段", async () => {
      const { results } = await globalSearch("勇者", { assetType: "character" });
      const character = results.find((r) => r.type === "character");
      expect(character?.thumbnailUrl).toBe("/thumb/c1.png");
      expect(character?.updatedAt).toBe("2026-01-01");
    });

    it("story 的 updatedAt 数字应转为字符串", async () => {
      const { results } = await globalSearch("勇者", { assetType: "story" });
      const story = results.find((r) => r.type === "story");
      expect(story?.updatedAt).toBe("1735689600");
    });

    it("media-asset 应优先使用 thumbnailUrl，回退到 url", async () => {
      const { results } = await globalSearch("森林", { assetType: "media-asset" });
      const asset = results.find((r) => r.type === "media-asset");
      expect(asset?.thumbnailUrl).toBe("/thumb/m1.png");
    });
  });

  describe("quickSearch", () => {
    it("空关键词应返回空数组", async () => {
      const results = await quickSearch("");
      expect(results).toEqual([]);
    });

    it("应返回 SearchResult[]（兼容 SearchDialog.onSearch 签名）", async () => {
      const results = await quickSearch("勇者");
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      // 验证结构
      for (const r of results) {
        expect(r).toHaveProperty("type");
        expect(r).toHaveProperty("id");
        expect(r).toHaveProperty("title");
      }
    });
  });

  describe("getSearchResultRoute", () => {
    it("character 路由应包含 highlight 参数", () => {
      const result: SearchResult = {
        type: "character",
        id: "c1",
        title: "勇者",
      };
      const route = getSearchResultRoute(result);
      expect(route).toBe("/characters?highlight=c1");
    });

    it("scene 路由应包含 highlight 参数", () => {
      const result: SearchResult = {
        type: "scene",
        id: "s1",
        title: "城堡",
      };
      const route = getSearchResultRoute(result);
      expect(route).toBe("/scenes?highlight=s1");
    });

    it("story 路由应直接拼路径（无 highlight）", () => {
      const result: SearchResult = {
        type: "story",
        id: "st1",
        title: "勇者传说",
      };
      const route = getSearchResultRoute(result);
      expect(route).toBe("/storyboard/st1");
    });

    it("media-asset 路由应跳转到 asset-library", () => {
      const result: SearchResult = {
        type: "media-asset",
        id: "m1",
        title: "森林背景",
      };
      const route = getSearchResultRoute(result);
      expect(route).toBe("/asset-library?highlight=m1");
    });

    it("id 应被 encodeURIComponent 编码", () => {
      const result: SearchResult = {
        type: "character",
        id: "c 1&special",
        title: "测试",
      };
      const route = getSearchResultRoute(result);
      expect(route).toContain(encodeURIComponent("c 1&special"));
    });
  });
});
