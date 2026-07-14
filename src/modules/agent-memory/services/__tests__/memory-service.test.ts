/**
 * Memory Service 单元测试
 *
 * 测试分层记忆系统：
 * - 核心记忆（preferences + facts）
 * - 归档记忆（文件存储 + 关键词检索）
 * - 自动抽取（LLM 分析对话）
 *
 * Mock @/shared/file-http 和 @/infrastructure/di，不真实读写文件。
 */

import { vi, describe, it, expect, beforeEach } from "vitest";
import {
  getCoreMemory,
  updatePreference,
  saveFact,
  removeFact,
  removePreference,
  clearCoreMemory,
  getAllArchivalMemory,
  addArchivalMemory,
  searchArchivalMemory,
  deleteArchivalMemory,
  extractFromConversation,
  applyExtractedMemory,
  buildCoreMemoryPrompt,
  shouldExtract,
  getCoreMemorySize,
  getArchivalMemoryCount,
  _resetSearchEngine,
} from "../memory-service";
import type { AgentMessage } from "@/modules/agent";

// ── vi.hoisted 声明 mock 变量（vi.mock 工厂会在文件顶部执行） ──
const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  setConfig: vi.fn(),
  writeFile: vi.fn(),
  readFile: vi.fn(),
  getCacheDirectory: vi.fn(),
  fileExists: vi.fn(),
  textProvider: { generateText: vi.fn() },
  // 三模式向量检索 mock：默认全部不可用 → 退回关键词匹配
  embeddingProvider: {
    generateEmbedding: vi.fn(),
    generateEmbeddings: vi.fn(),
  },
}));

vi.mock("@/shared/file-http", () => ({
  getConfig: mocks.getConfig,
  setConfig: mocks.setConfig,
  writeFile: mocks.writeFile,
  readFile: mocks.readFile,
  getCacheDirectory: mocks.getCacheDirectory,
  fileExists: mocks.fileExists,
}));

vi.mock("@/infrastructure/di", () => ({
  container: {
    textProvider: mocks.textProvider,
    embeddingProvider: mocks.embeddingProvider,
  },
}));

// ============= Helpers =============

function encodeJson(data: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(data));
}

function makeMessage(
  role: "user" | "assistant" | "tool",
  content: string,
): AgentMessage {
  return {
    id: `msg_${Math.random().toString(36).slice(2)}`,
    role,
    content,
    timestamp: Date.now(),
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

// ============= Tests =============

describe("memory-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 重置 VectorSearchEngine 单例（避免 store 缓存跨测试污染）
    _resetSearchEngine();
    // 显式重置默认 mock 值
    mocks.getConfig.mockResolvedValue(undefined);
    mocks.setConfig.mockResolvedValue(undefined);
    mocks.writeFile.mockResolvedValue({ success: true });
    mocks.readFile.mockResolvedValue({ success: false, data: undefined });
    mocks.getCacheDirectory.mockResolvedValue({
      success: true,
      path: "/test/cache",
    });
    mocks.textProvider.generateText.mockResolvedValue({ success: false });
    // 三模式向量检索默认不可用：API 返回失败，本地模型文件不存在 → 退回关键词匹配
    mocks.embeddingProvider.generateEmbedding.mockResolvedValue({ success: false });
    mocks.embeddingProvider.generateEmbeddings.mockResolvedValue({ success: false });
    mocks.fileExists.mockResolvedValue(false);
  });

  // ============= getCoreMemory =============
  describe("getCoreMemory", () => {
    it("1. 空配置返回空核心记忆", async () => {
      mocks.getConfig.mockResolvedValue(undefined);
      const result = await getCoreMemory();
      expect(result).toEqual({ preferences: {}, facts: [] });
    });

    it("2. 有偏好时正确读取", async () => {
      mocks.getConfig.mockResolvedValue({
        preferences: { language: "zh-CN", theme: "dark" },
        facts: [],
      });
      const result = await getCoreMemory();
      expect(result.preferences).toEqual({ language: "zh-CN", theme: "dark" });
      expect(result.facts).toEqual([]);
    });

    it("3. 有事实时正确读取", async () => {
      mocks.getConfig.mockResolvedValue({
        preferences: {},
        facts: [
          { key: "source_novel", value: "三体", updatedAt: 1000 },
        ],
      });
      const result = await getCoreMemory();
      expect(result.facts).toHaveLength(1);
      expect(result.facts[0].key).toBe("source_novel");
      expect(result.facts[0].value).toBe("三体");
    });

    it("4. 配置损坏（非对象）返回空记忆", async () => {
      mocks.getConfig.mockResolvedValue("corrupted_string");
      const result = await getCoreMemory();
      expect(result).toEqual({ preferences: {}, facts: [] });
    });

    it("5. getConfig 异常时返回空记忆", async () => {
      mocks.getConfig.mockRejectedValue(new Error("DB error"));
      const result = await getCoreMemory();
      expect(result).toEqual({ preferences: {}, facts: [] });
    });
  });

  // ============= updatePreference =============
  describe("updatePreference", () => {
    it("6. 新增偏好", async () => {
      mocks.getConfig.mockResolvedValue({ preferences: {}, facts: [] });
      const ok = await updatePreference("language", "zh-CN");
      expect(ok).toBe(true);
      const saved = mocks.setConfig.mock.calls[0][1];
      expect(saved.preferences.language).toBe("zh-CN");
    });

    it("7. 覆盖同 key 偏好", async () => {
      mocks.getConfig.mockResolvedValue({
        preferences: { language: "zh-CN" },
        facts: [],
      });
      await updatePreference("language", "en-US");
      const saved = mocks.setConfig.mock.calls[0][1];
      expect(saved.preferences.language).toBe("en-US");
    });

    it("8. 空 key 返回 false", async () => {
      const ok = await updatePreference("", "value");
      expect(ok).toBe(false);
      expect(mocks.setConfig).not.toHaveBeenCalled();
    });
  });

  // ============= saveFact =============
  describe("saveFact", () => {
    it("9. 新增事实", async () => {
      mocks.getConfig.mockResolvedValue({ preferences: {}, facts: [] });
      const ok = await saveFact("source_novel", "三体");
      expect(ok).toBe(true);
      const saved = mocks.setConfig.mock.calls[0][1];
      expect(saved.facts).toHaveLength(1);
      expect(saved.facts[0].key).toBe("source_novel");
      expect(saved.facts[0].value).toBe("三体");
    });

    it("10. 覆盖同 key 事实", async () => {
      mocks.getConfig.mockResolvedValue({
        preferences: {},
        facts: [{ key: "source_novel", value: "三体", updatedAt: 1000 }],
      });
      await saveFact("source_novel", "流浪地球");
      const saved = mocks.setConfig.mock.calls[0][1];
      expect(saved.facts).toHaveLength(1);
      expect(saved.facts[0].value).toBe("流浪地球");
    });

    it("11. 超限时淘汰最旧的 fact", async () => {
      // MAX_FACTS_COUNT = 20
      const oldFacts = Array.from({ length: 20 }, (_, i) => ({
        key: `fact_${i}`,
        value: `value_${i}`,
        updatedAt: 1000 + i,
      }));
      mocks.getConfig.mockResolvedValue({ preferences: {}, facts: oldFacts });

      await saveFact("new_fact", "new_value");

      const saved = mocks.setConfig.mock.calls[0][1];
      expect(saved.facts).toHaveLength(20);
      // 最旧的 fact_0 应被淘汰
      expect(
        saved.facts.find((f: { key: string }) => f.key === "fact_0"),
      ).toBeUndefined();
      // 新 fact 应存在
      expect(
        saved.facts.find((f: { key: string }) => f.key === "new_fact"),
      ).toBeDefined();
    });
  });

  // ============= removeFact =============
  describe("removeFact", () => {
    it("12. 删除存在的事实", async () => {
      mocks.getConfig.mockResolvedValue({
        preferences: {},
        facts: [{ key: "a", value: "1", updatedAt: 1000 }],
      });
      const ok = await removeFact("a");
      expect(ok).toBe(true);
      const saved = mocks.setConfig.mock.calls[0][1];
      expect(saved.facts).toHaveLength(0);
    });

    it("13. 删除不存在的事实也算成功", async () => {
      mocks.getConfig.mockResolvedValue({
        preferences: {},
        facts: [{ key: "a", value: "1", updatedAt: 1000 }],
      });
      const ok = await removeFact("not_exist");
      expect(ok).toBe(true);
      // 不存在时不调用 setConfig
      expect(mocks.setConfig).not.toHaveBeenCalled();
    });
  });

  // ============= removePreference =============
  describe("removePreference", () => {
    it("14. 删除存在的偏好", async () => {
      mocks.getConfig.mockResolvedValue({
        preferences: { lang: "zh" },
        facts: [],
      });
      const ok = await removePreference("lang");
      expect(ok).toBe(true);
      const saved = mocks.setConfig.mock.calls[0][1];
      expect(saved.preferences).toEqual({});
    });

    it("15. 删除不存在的偏好也算成功", async () => {
      mocks.getConfig.mockResolvedValue({
        preferences: { lang: "zh" },
        facts: [],
      });
      const ok = await removePreference("not_exist");
      expect(ok).toBe(true);
      expect(mocks.setConfig).not.toHaveBeenCalled();
    });
  });

  // ============= clearCoreMemory =============
  describe("clearCoreMemory", () => {
    it("16. 清空核心记忆", async () => {
      mocks.getConfig.mockResolvedValue({
        preferences: { lang: "zh" },
        facts: [{ key: "a", value: "1", updatedAt: 1000 }],
      });
      const ok = await clearCoreMemory();
      expect(ok).toBe(true);
      const saved = mocks.setConfig.mock.calls[0][1];
      expect(saved.preferences).toEqual({});
      expect(saved.facts).toEqual([]);
    });
  });

  // ============= getAllArchivalMemory =============
  describe("getAllArchivalMemory", () => {
    it("17. 空文件返回空数组", async () => {
      mocks.readFile.mockResolvedValue({
        success: true,
        data: encodeJson([]),
      });
      const result = await getAllArchivalMemory();
      expect(result).toEqual([]);
    });

    it("18. 有数据时正确读取", async () => {
      const entries = [
        {
          id: "mem_1",
          type: "summary",
          content: "test content",
          createdAt: 1000,
        },
      ];
      mocks.readFile.mockResolvedValue({
        success: true,
        data: encodeJson(entries),
      });
      const result = await getAllArchivalMemory();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("mem_1");
      expect(result[0].content).toBe("test content");
    });

    it("19. 文件不存在（readFile 失败）返回空数组", async () => {
      mocks.readFile.mockResolvedValue({ success: false, data: undefined });
      const result = await getAllArchivalMemory();
      expect(result).toEqual([]);
    });

    it("20. JSON 损坏返回空数组", async () => {
      mocks.readFile.mockResolvedValue({
        success: true,
        data: encodeJsonToText("not valid json"),
      });
      const result = await getAllArchivalMemory();
      expect(result).toEqual([]);
    });
  });

  // ============= addArchivalMemory =============
  describe("addArchivalMemory", () => {
    it("21. 追加新条目", async () => {
      mocks.readFile.mockResolvedValue({
        success: true,
        data: encodeJson([]),
      });
      const ok = await addArchivalMemory({
        type: "summary",
        content: "new summary",
      });
      expect(ok).toBe(true);
      const savedJson = mocks.writeFile.mock.calls[0][1] as string;
      const saved = JSON.parse(savedJson);
      expect(saved).toHaveLength(1);
      expect(saved[0].content).toBe("new summary");
      expect(saved[0].type).toBe("summary");
      expect(saved[0].id).toBeDefined();
      expect(saved[0].createdAt).toBeDefined();
    });

    it("22. 超限时淘汰最旧的归档条目", async () => {
      // MAX_ARCHIVAL_ENTRIES = 200
      const oldEntries = Array.from({ length: 200 }, (_, i) => ({
        id: `mem_${i}`,
        type: "summary" as const,
        content: `content_${i}`,
        createdAt: 1000 + i,
      }));
      mocks.readFile.mockResolvedValue({
        success: true,
        data: encodeJson(oldEntries),
      });

      await addArchivalMemory({ type: "summary", content: "new entry" });

      const savedJson = mocks.writeFile.mock.calls[0][1] as string;
      const saved = JSON.parse(savedJson);
      expect(saved).toHaveLength(200);
      // 最旧的 mem_0 应被淘汰
      expect(
        saved.find((e: { id: string }) => e.id === "mem_0"),
      ).toBeUndefined();
      // 新条目应存在
      expect(
        saved.find((e: { content: string }) => e.content === "new entry"),
      ).toBeDefined();
    });
  });

  // ============= searchArchivalMemory =============
  describe("searchArchivalMemory", () => {
    it("23. 关键词匹配返回相关条目", async () => {
      const entries = [
        {
          id: "1",
          type: "summary",
          content: "讨论了赛博朋克风格",
          createdAt: Date.now(),
        },
        {
          id: "2",
          type: "summary",
          content: "讨论了奇幻风格",
          createdAt: Date.now(),
        },
      ];
      mocks.readFile.mockResolvedValue({
        success: true,
        data: encodeJson(entries),
      });

      const result = await searchArchivalMemory("赛博朋克", 5);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("1");
    });

    it("24. 空 query 返回最近条目", async () => {
      const entries = [
        {
          id: "old",
          type: "summary",
          content: "old entry",
          createdAt: 1000,
        },
        {
          id: "new",
          type: "summary",
          content: "new entry",
          createdAt: 2000,
        },
      ];
      mocks.readFile.mockResolvedValue({
        success: true,
        data: encodeJson(entries),
      });

      const result = await searchArchivalMemory("", 5);
      expect(result).toHaveLength(2);
      // 按时间倒序，新的在前
      expect(result[0].id).toBe("new");
      expect(result[1].id).toBe("old");
    });

    it("25. 时间衰减：7 天内得分更高", async () => {
      const now = Date.now();
      const entries = [
        {
          id: "recent",
          type: "summary",
          content: "test keyword",
          createdAt: now - 1 * DAY_MS, // 1 天前，×1.5
        },
        {
          id: "old",
          type: "summary",
          content: "test keyword",
          createdAt: now - 60 * DAY_MS, // 60 天前，×0.7
        },
      ];
      mocks.readFile.mockResolvedValue({
        success: true,
        data: encodeJson(entries),
      });

      const result = await searchArchivalMemory("test", 5);
      expect(result).toHaveLength(2);
      // recent (×1.5) should come before old (×0.7)
      expect(result[0].id).toBe("recent");
      expect(result[1].id).toBe("old");
    });

    it("26. 无匹配结果返回空数组", async () => {
      const entries = [
        {
          id: "1",
          type: "summary",
          content: "hello world",
          createdAt: Date.now(),
        },
      ];
      mocks.readFile.mockResolvedValue({
        success: true,
        data: encodeJson(entries),
      });

      const result = await searchArchivalMemory("nonexistent_keyword", 5);
      expect(result).toEqual([]);
    });

    it("API 向量检索优先（embeddingProvider 可用时使用语义检索）", async () => {
      const entries = [
        {
          id: "cat",
          type: "summary",
          content: "cats",
          createdAt: Date.now(),
        },
        {
          id: "dog",
          type: "summary",
          content: "dogs",
          createdAt: Date.now(),
        },
      ];
      // Embedding 独立存储（S5）：archival.json 不含 embedding，由 embeddings.json 提供
      const embeddingStore = {
        meta: { modelId: "api", dimensions: 2, updatedAt: 1 },
        entries: {
          cat: { embedding: [1, 0], updatedAt: 1 },
          dog: { embedding: [0, 1], updatedAt: 1 },
        },
      };
      mocks.readFile.mockImplementation(async (path: string) => {
        if (String(path).endsWith("archival.json")) {
          return { success: true, data: encodeJson(entries) };
        }
        if (String(path).endsWith("embeddings.json")) {
          return { success: true, data: encodeJson(embeddingStore) };
        }
        return { success: false, data: undefined };
      });
      // embeddings.json 存在 → store 会读取它
      mocks.fileExists.mockResolvedValue(true);
      // query embedding 更接近 cat
      mocks.embeddingProvider.generateEmbedding.mockResolvedValue({
        success: true,
        data: { embedding: [0.9, 0.1] },
      });

      const result = await searchArchivalMemory("feline", 2);
      expect(result).toHaveLength(2);
      // cat 与 query 余弦相似度更高，应排在前面
      expect(result[0].id).toBe("cat");
      expect(result[1].id).toBe("dog");
    });

    it("28. API 向量检索懒生成缺失 embedding 并持久化", async () => {
      const entries = [
        {
          id: "1",
          type: "summary",
          content: "cats",
          createdAt: Date.now(),
          // archival.json 不含 embedding，由 EmbeddingStore 独立管理
        },
      ];
      // archival.json 返回 entries；embeddings.json 不存在（fileExists=false）
      mocks.readFile.mockImplementation(async (path: string) => {
        if (String(path).endsWith("archival.json")) {
          return { success: true, data: encodeJson(entries) };
        }
        return { success: false, data: undefined };
      });
      // embeddings.json 不存在 → store 初始为空 → 触发懒生成
      mocks.fileExists.mockResolvedValue(false);
      // query embedding
      mocks.embeddingProvider.generateEmbedding.mockResolvedValue({
        success: true,
        data: { embedding: [1, 0] },
      });
      // backfill 批量生成 embedding
      mocks.embeddingProvider.generateEmbeddings.mockResolvedValue({
        success: true,
        data: { embeddings: [[1, 0]] },
      });

      const result = await searchArchivalMemory("cats", 5);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("1");
      // 验证 embedding 持久化到独立文件（embeddings.json）
      expect(mocks.writeFile).toHaveBeenCalled();
      const writeCalls = mocks.writeFile.mock.calls;
      // 至少有一次写入 embeddings.json
      const embeddingWriteCall = writeCalls.find(
        (call: unknown[]) => typeof call[0] === "string" && String(call[0]).endsWith("embeddings.json"),
      );
      expect(embeddingWriteCall).toBeDefined();
    });
  });

  // ============= deleteArchivalMemory =============
  describe("deleteArchivalMemory", () => {
    it("27. 删除存在的归档条目", async () => {
      const entries = [
        {
          id: "mem_1",
          type: "summary",
          content: "test",
          createdAt: 1000,
        },
      ];
      mocks.readFile.mockResolvedValue({
        success: true,
        data: encodeJson(entries),
      });

      const ok = await deleteArchivalMemory("mem_1");
      expect(ok).toBe(true);
      const savedJson = mocks.writeFile.mock.calls[0][1] as string;
      const saved = JSON.parse(savedJson);
      expect(saved).toHaveLength(0);
    });

    it("28. 删除不存在的归档条目也算成功", async () => {
      const entries = [
        {
          id: "mem_1",
          type: "summary",
          content: "test",
          createdAt: 1000,
        },
      ];
      mocks.readFile.mockResolvedValue({
        success: true,
        data: encodeJson(entries),
      });

      const ok = await deleteArchivalMemory("not_exist");
      expect(ok).toBe(true);
      // 不存在时不调用 writeFile
      expect(mocks.writeFile).not.toHaveBeenCalled();
    });
  });

  // ============= extractFromConversation =============
  describe("extractFromConversation", () => {
    it("29. 消息不足 3 条返回 null", async () => {
      const messages = [
        makeMessage("user", "你好"),
        makeMessage("assistant", "你好！"),
      ];
      const result = await extractFromConversation(messages);
      expect(result).toBeNull();
      expect(mocks.textProvider.generateText).not.toHaveBeenCalled();
    });

    it("30. 正常抽取返回 ExtractedMemory", async () => {
      const messages = [
        makeMessage("user", "我喜欢赛博朋克风格"),
        makeMessage("assistant", "好的，已记录"),
        makeMessage("user", "项目改编自三体"),
      ];
      mocks.textProvider.generateText.mockResolvedValue({
        success: true,
        data: {
          text: '{"preferences":{"preferred_style":"赛博朋克"},"facts":[{"key":"source_novel","value":"三体"}],"summary":"用户讨论了赛博朋克风格和三体改编"}',
        },
      });

      const result = await extractFromConversation(messages);
      expect(result).not.toBeNull();
      expect(result!.preferences.preferred_style).toBe("赛博朋克");
      expect(result!.facts).toHaveLength(1);
      expect(result!.facts[0].key).toBe("source_novel");
      expect(result!.facts[0].value).toBe("三体");
      expect(result!.summary).toContain("赛博朋克");
    });

    it("31. LLM 返回失败时返回 null", async () => {
      const messages = [
        makeMessage("user", "test1"),
        makeMessage("assistant", "test2"),
        makeMessage("user", "test3"),
      ];
      mocks.textProvider.generateText.mockResolvedValue({ success: false });

      const result = await extractFromConversation(messages);
      expect(result).toBeNull();
    });

    it("32. LLM 返回非 JSON 时返回 null", async () => {
      const messages = [
        makeMessage("user", "test1"),
        makeMessage("assistant", "test2"),
        makeMessage("user", "test3"),
      ];
      mocks.textProvider.generateText.mockResolvedValue({
        success: true,
        data: { text: "这不是JSON格式的内容" },
      });

      const result = await extractFromConversation(messages);
      expect(result).toBeNull();
    });
  });

  // ============= applyExtractedMemory =============
  describe("applyExtractedMemory", () => {
    it("33. 合并偏好（覆盖同 key）", async () => {
      mocks.getConfig.mockResolvedValue({
        preferences: { language: "zh-CN", theme: "light" },
        facts: [],
      });

      await applyExtractedMemory({
        preferences: { language: "en-US", new_pref: "value" },
        facts: [],
        summary: "",
      });

      const saved = mocks.setConfig.mock.calls[0][1];
      expect(saved.preferences).toEqual({
        language: "en-US",
        theme: "light",
        new_pref: "value",
      });
      // 无 summary → 不写归档
      expect(mocks.writeFile).not.toHaveBeenCalled();
    });

    it("34. 合并事实（同 key 覆盖）", async () => {
      mocks.getConfig.mockResolvedValue({
        preferences: {},
        facts: [
          { key: "a", value: "old_a", updatedAt: 1000 },
          { key: "b", value: "keep_b", updatedAt: 1000 },
        ],
      });

      await applyExtractedMemory({
        preferences: {},
        facts: [
          { key: "a", value: "new_a" },
          { key: "c", value: "new_c" },
        ],
        summary: "",
      });

      const saved = mocks.setConfig.mock.calls[0][1];
      expect(saved.facts).toHaveLength(3);
      const factA = saved.facts.find(
        (f: { key: string }) => f.key === "a",
      );
      expect(factA.value).toBe("new_a");
      const factB = saved.facts.find(
        (f: { key: string }) => f.key === "b",
      );
      expect(factB.value).toBe("keep_b");
      const factC = saved.facts.find(
        (f: { key: string }) => f.key === "c",
      );
      expect(factC.value).toBe("new_c");
    });

    it("35. 有摘要时追加到归档记忆", async () => {
      mocks.getConfig.mockResolvedValue({ preferences: {}, facts: [] });
      mocks.readFile.mockResolvedValue({
        success: true,
        data: encodeJson([]),
      });

      await applyExtractedMemory({
        preferences: {},
        facts: [],
        summary: "会话摘要",
      });

      // setConfig called for core memory
      expect(mocks.setConfig).toHaveBeenCalledTimes(1);
      // writeFile called for archival memory
      expect(mocks.writeFile).toHaveBeenCalledTimes(1);
      const savedJson = mocks.writeFile.mock.calls[0][1] as string;
      const saved = JSON.parse(savedJson);
      expect(saved).toHaveLength(1);
      expect(saved[0].content).toBe("会话摘要");
      expect(saved[0].type).toBe("summary");
      expect(saved[0].tags).toContain("auto-extracted");
    });
  });

  // ============= buildCoreMemoryPrompt =============
  describe("buildCoreMemoryPrompt", () => {
    it("36. 空记忆返回空字符串", async () => {
      mocks.getConfig.mockResolvedValue({ preferences: {}, facts: [] });
      const result = await buildCoreMemoryPrompt();
      expect(result).toBe("");
    });

    it("37. 有偏好和事实时构建 prompt", async () => {
      mocks.getConfig.mockResolvedValue({
        preferences: { language: "zh-CN" },
        facts: [{ key: "source_novel", value: "三体", updatedAt: 1000 }],
      });
      const result = await buildCoreMemoryPrompt();
      expect(result).toContain("## 记忆");
      expect(result).toContain("### 用户偏好");
      expect(result).toContain("language: zh-CN");
      expect(result).toContain("### 项目事实");
      expect(result).toContain("source_novel: 三体");
    });
  });

  // ============= shouldExtract =============
  describe("shouldExtract", () => {
    it("38. 用户消息数 < 5 返回 false", () => {
      const messages = [
        makeMessage("user", "1"),
        makeMessage("assistant", "a1"),
        makeMessage("user", "2"),
        makeMessage("assistant", "a2"),
      ];
      expect(shouldExtract(messages)).toBe(false);
    });

    it("39. 用户消息数 >= 5 返回 true", () => {
      const messages = [
        makeMessage("user", "1"),
        makeMessage("user", "2"),
        makeMessage("user", "3"),
        makeMessage("user", "4"),
        makeMessage("user", "5"),
      ];
      expect(shouldExtract(messages)).toBe(true);
    });
  });

  // ============= getCoreMemorySize =============
  describe("getCoreMemorySize", () => {
    it("40. 返回核心记忆序列化后的字符数", async () => {
      mocks.getConfig.mockResolvedValue({
        preferences: { lang: "zh" },
        facts: [],
      });
      const size = await getCoreMemorySize();
      const expected = JSON.stringify({
        preferences: { lang: "zh" },
        facts: [],
      }).length;
      expect(size).toBe(expected);
    });
  });

  // ============= getArchivalMemoryCount =============
  describe("getArchivalMemoryCount", () => {
    it("41. 返回归档记忆条目数", async () => {
      const entries = [
        {
          id: "1",
          type: "summary",
          content: "a",
          createdAt: 1000,
        },
        {
          id: "2",
          type: "summary",
          content: "b",
          createdAt: 2000,
        },
      ];
      mocks.readFile.mockResolvedValue({
        success: true,
        data: encodeJson(entries),
      });
      const count = await getArchivalMemoryCount();
      expect(count).toBe(2);
    });
  });
});

// ============= Helper (for JSON corruption test) =============
function encodeJsonToText(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}
