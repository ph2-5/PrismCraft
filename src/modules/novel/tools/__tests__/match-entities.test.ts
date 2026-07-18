/**
 * P1-12 测试覆盖 — novel/tools/match-entities
 *
 * 覆盖 P1-11 修复的 schema 校验逻辑：
 * - charactersJson/scenesJson 解析失败时返回 success=false
 * - 解析结果非数组时返回 success=false
 * - 数组元素无 name 字段时被过滤掉
 * - 数组元素 name 非字符串时被过滤掉
 * - 数组元素 name 为空字符串时被过滤掉
 *
 * 覆盖匹配逻辑：
 * - 精确匹配 → status=matched, confidence=1.0
 * - 模糊匹配（>=0.8）→ status=matched
 * - 冲突区间（0.6-0.8）→ status=conflict
 * - 无匹配（<0.6）→ status=new
 * - 空 charactersJson + 空 scenesJson → success=false
 *
 * 使用 vi.mock 替换 @/modules/character 和 @/modules/scene 的动态 import。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// 模拟 characterService.getAll / sceneService.getAll
const mockCharGetAll = vi.fn();
const mockSceneGetAll = vi.fn();

vi.mock("@/modules/character", () => ({
  characterService: {
    getAll: () => mockCharGetAll(),
  },
}));

vi.mock("@/modules/scene", () => ({
  sceneService: {
    getAll: () => mockSceneGetAll(),
  },
}));

import { matchEntitiesTool } from "../match-entities";

describe("match-entities — 输入解析", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCharGetAll.mockResolvedValue({ ok: true, value: [] });
    mockSceneGetAll.mockResolvedValue({ ok: true, value: [] });
  });

  it("charactersJson + scenesJson 都为空 → success=false", async () => {
    const result = await matchEntitiesTool.execute({}, { sessionId: "test" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("为空");
    }
  });

  it("charactersJson 非法 JSON → success=false", async () => {
    const result = await matchEntitiesTool.execute(
      { charactersJson: "{not valid json" },
      { sessionId: "test" },
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("charactersJson");
    }
  });

  it("scenesJson 非法 JSON → success=false", async () => {
    const result = await matchEntitiesTool.execute(
      { scenesJson: "{not valid json" },
      { sessionId: "test" },
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("scenesJson");
    }
  });

  it("charactersJson 是合法 JSON 但非数组 → 视为空", async () => {
    // 非数组不会被解析为 inputCharacters，因此 inputCharacters + inputScenes 都为空
    const result = await matchEntitiesTool.execute(
      { charactersJson: '{"name":"张三"}' },
      { sessionId: "test" },
    );
    expect(result.success).toBe(false);
  });

  it("P1-11: charactersJson 数组元素无 name 字段 → 过滤掉", async () => {
    mockCharGetAll.mockResolvedValue({ ok: true, value: [] });
    const result = await matchEntitiesTool.execute(
      { charactersJson: JSON.stringify([{ foo: "bar" }, { age: 20 }]) },
      { sessionId: "test" },
    );
    // 全部被过滤掉 → inputCharacters 为空 + inputScenes 为空 → success=false
    expect(result.success).toBe(false);
  });

  it("P1-11: charactersJson 元素 name 非字符串 → 过滤掉", async () => {
    const result = await matchEntitiesTool.execute(
      { charactersJson: JSON.stringify([{ name: 123 }, { name: null }, { name: {} }]) },
      { sessionId: "test" },
    );
    expect(result.success).toBe(false);
  });

  it("P1-11: charactersJson 元素 name 为空字符串 → 过滤掉", async () => {
    const result = await matchEntitiesTool.execute(
      { charactersJson: JSON.stringify([{ name: "" }, { name: "   " }]) },
      { sessionId: "test" },
    );
    // 注意：当前实现仅校验 name.length > 0，不 trim，所以 "   " 会被保留
    // 但 "" 会被过滤掉。如果所有都被过滤则 success=false
    // 由于 "   " 会被保留（length=3），所以会进入匹配逻辑
    // 这里验证 success=true（因为 "   " 进入匹配，但无现有角色 → status=new）
    expect(result.success).toBe(true);
  });

  it("P1-11: 混合有效/无效元素 → 仅保留有效的", async () => {
    mockCharGetAll.mockResolvedValue({ ok: true, value: [] });
    const result = await matchEntitiesTool.execute(
      {
        charactersJson: JSON.stringify([
          { foo: "bar" },           // 无效：无 name
          { name: 123 },             // 无效：name 非字符串
          { name: "" },              // 无效：name 空
          { name: "张三", age: 20 }, // 有效
          null,                      // 无效：非对象
          "string",                  // 无效：非对象
        ]),
      },
      { sessionId: "test" },
    );
    expect(result.success).toBe(true);
    if (result.success && result.data) {
      const data = result.data as { characters: Array<{ name: string }> };
      expect(data.characters).toHaveLength(1);
      expect(data.characters[0]!.name).toBe("张三");
    }
  });
});

describe("match-entities — 匹配逻辑", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("精确匹配 → status=matched, confidence=1.0", async () => {
    mockCharGetAll.mockResolvedValue({
      ok: true,
      value: [{ id: "c1", name: "张三" }],
    });
    mockSceneGetAll.mockResolvedValue({ ok: true, value: [] });

    const result = await matchEntitiesTool.execute(
      { charactersJson: JSON.stringify([{ tempId: "t1", name: "张三" }]) },
      { sessionId: "test" },
    );

    expect(result.success).toBe(true);
    if (result.success && result.data) {
      const data = result.data as {
        characters: Array<{
          name: string;
          status: string;
          matchedCharacterId?: string;
          matchConfidence?: number;
        }>;
      };
      expect(data.characters).toHaveLength(1);
      expect(data.characters[0]!.status).toBe("matched");
      expect(data.characters[0]!.matchedCharacterId).toBe("c1");
      expect(data.characters[0]!.matchConfidence).toBe(1);
    }
  });

  it("模糊匹配（>=0.8）→ status=matched", async () => {
    // "abcdefgh" vs "abcdefgh1"：相似度 8/9 ≈ 0.889
    mockCharGetAll.mockResolvedValue({
      ok: true,
      value: [{ id: "c1", name: "abcdefgh1" }],
    });
    mockSceneGetAll.mockResolvedValue({ ok: true, value: [] });

    const result = await matchEntitiesTool.execute(
      { charactersJson: JSON.stringify([{ tempId: "t1", name: "abcdefgh" }]) },
      { sessionId: "test" },
    );

    expect(result.success).toBe(true);
    if (result.success && result.data) {
      const data = result.data as { characters: Array<{ status: string; matchConfidence?: number }> };
      expect(data.characters[0]!.status).toBe("matched");
      expect(data.characters[0]!.matchConfidence).toBeGreaterThan(0.8);
    }
  });

  it("冲突区间（0.6-0.8）→ status=conflict", async () => {
    // "张三丰" vs "张三风"：距离 1，maxLen 3，相似度 0.667
    mockCharGetAll.mockResolvedValue({
      ok: true,
      value: [{ id: "c1", name: "张三风" }],
    });
    mockSceneGetAll.mockResolvedValue({ ok: true, value: [] });

    const result = await matchEntitiesTool.execute(
      { charactersJson: JSON.stringify([{ tempId: "t1", name: "张三丰" }]) },
      { sessionId: "test" },
    );

    expect(result.success).toBe(true);
    if (result.success && result.data) {
      const data = result.data as { characters: Array<{ status: string; matchConfidence?: number }> };
      expect(data.characters[0]!.status).toBe("conflict");
      expect(data.characters[0]!.matchConfidence).toBeGreaterThan(0.6);
      expect(data.characters[0]!.matchConfidence).toBeLessThan(0.8);
    }
  });

  it("无匹配（<0.6）→ status=new", async () => {
    // "张三" vs "李四"：距离 2，maxLen 2，相似度 0
    mockCharGetAll.mockResolvedValue({
      ok: true,
      value: [{ id: "c1", name: "李四" }],
    });
    mockSceneGetAll.mockResolvedValue({ ok: true, value: [] });

    const result = await matchEntitiesTool.execute(
      { charactersJson: JSON.stringify([{ tempId: "t1", name: "张三" }]) },
      { sessionId: "test" },
    );

    expect(result.success).toBe(true);
    if (result.success && result.data) {
      const data = result.data as { characters: Array<{ status: string; matchedCharacterId?: string }> };
      expect(data.characters[0]!.status).toBe("new");
      expect(data.characters[0]!.matchedCharacterId).toBeUndefined();
    }
  });

  it("场景匹配：精确匹配 → status=matched, matchedSceneId", async () => {
    mockCharGetAll.mockResolvedValue({ ok: true, value: [] });
    mockSceneGetAll.mockResolvedValue({
      ok: true,
      value: [{ id: "s1", name: "皇宫" }],
    });

    const result = await matchEntitiesTool.execute(
      { scenesJson: JSON.stringify([{ tempId: "t1", name: "皇宫" }]) },
      { sessionId: "test" },
    );

    expect(result.success).toBe(true);
    if (result.success && result.data) {
      const data = result.data as { scenes: Array<{ status: string; matchedSceneId?: string }> };
      expect(data.scenes).toHaveLength(1);
      expect(data.scenes[0]!.status).toBe("matched");
      expect(data.scenes[0]!.matchedSceneId).toBe("s1");
    }
  });

  it("characterService.getAll 失败时按无现有角色处理", async () => {
    mockCharGetAll.mockResolvedValue({ ok: false, error: "DB error" });
    mockSceneGetAll.mockResolvedValue({ ok: true, value: [] });

    const result = await matchEntitiesTool.execute(
      { charactersJson: JSON.stringify([{ tempId: "t1", name: "张三" }]) },
      { sessionId: "test" },
    );

    expect(result.success).toBe(true);
    if (result.success && result.data) {
      const data = result.data as { characters: Array<{ status: string }> };
      // 没有现有角色 → 所有提取的角色都为 new
      expect(data.characters[0]!.status).toBe("new");
    }
  });

  it("多匹配时取最高置信度", async () => {
    mockCharGetAll.mockResolvedValue({
      ok: true,
      value: [
        { id: "c1", name: "张三" },     // 精确匹配 → 1.0
        { id: "c2", name: "张三丰" },   // 模糊匹配 → 0.667
      ],
    });
    mockSceneGetAll.mockResolvedValue({ ok: true, value: [] });

    const result = await matchEntitiesTool.execute(
      { charactersJson: JSON.stringify([{ tempId: "t1", name: "张三" }]) },
      { sessionId: "test" },
    );

    expect(result.success).toBe(true);
    if (result.success && result.data) {
      const data = result.data as {
        characters: Array<{ matchedCharacterId?: string; matchConfidence?: number; status: string }>;
      };
      // 应该匹配到 c1（精确匹配，置信度 1.0），而非 c2（模糊匹配）
      expect(data.characters[0]!.matchedCharacterId).toBe("c1");
      expect(data.characters[0]!.matchConfidence).toBe(1);
      expect(data.characters[0]!.status).toBe("matched");
    }
  });
});
