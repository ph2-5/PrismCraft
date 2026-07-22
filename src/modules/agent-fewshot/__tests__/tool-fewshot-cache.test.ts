/**
 * tool-fewshot-cache 单元测试
 *
 * 覆盖范围：
 * 1. recordFewShot — 记录成功调用、忽略失败调用、摘要化
 * 2. getFewShots — 按工具查询、limit 限制
 * 3. LRU 淘汰 — MAX_ENTRIES_PER_TOOL=3
 * 4. 去重 — 相同 argsSummary 不重复
 * 5. clearFewShotCache — 清空缓存
 * 6. getFewShotStats — 统计信息
 * 7. getRelevantFewShots — 合并内置 + 运行时、关键词匹配与排序
 * 8. buildFewShotPrompt — 构建提示文本
 * 9. 文件 I/O 与并发 — 加载失败回退、并发锁、持久化路径
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── 用 vi.hoisted 声明 mock 变量（vi.mock 工厂会在文件顶部执行） ──
const { mockGetCacheDirectory, mockReadFile, mockWriteFile } = vi.hoisted(
  () => ({
    mockGetCacheDirectory: vi.fn(),
    mockReadFile: vi.fn(),
    mockWriteFile: vi.fn(),
  }),
);

// ── Mock @/shared/file-http（用于文件 I/O） ──
vi.mock("@/shared/file-http", () => ({
  getCacheDirectory: mockGetCacheDirectory,
  readFile: mockReadFile,
  writeFile: mockWriteFile,
}));

// ── Mock @/shared/error-logger（避免日志污染测试输出） ──
vi.mock("@/shared/error-logger", () => ({
  errorLogger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
  },
}));

// 注意：@/shared/utils/format 的 truncate 使用真实实现（纯函数，无副作用）
// 注意：builtin-fewshot-examples 使用真实实现（纯内存模块，无外部依赖）

/** 将字符串编码为 ArrayBuffer（模拟 readFile 返回的数据格式） */
function encodeText(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

/** 等待 microtask 队列清空（多次循环确保 promise 链全部执行） */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }
}

describe("tool-fewshot-cache", () => {
  let recordFewShot: typeof import("../services/tool-fewshot-cache")["recordFewShot"];
  let getFewShots: typeof import("../services/tool-fewshot-cache")["getFewShots"];
  let getRelevantFewShots: typeof import("../services/tool-fewshot-cache")["getRelevantFewShots"];
  let buildFewShotPrompt: typeof import("../services/tool-fewshot-cache")["buildFewShotPrompt"];
  let clearFewShotCache: typeof import("../services/tool-fewshot-cache")["clearFewShotCache"];
  let getFewShotStats: typeof import("../services/tool-fewshot-cache")["getFewShotStats"];

  beforeEach(async () => {
    vi.clearAllMocks();
    // 重置模块缓存，确保 tool-fewshot-cache 的模块级状态
    // （cacheData / loadingPromise / cachedFilePath）被重置
    vi.resetModules();

    // 默认 mock 行为
    mockGetCacheDirectory.mockResolvedValue({
      success: true,
      path: "/tmp/cache",
    });
    mockReadFile.mockResolvedValue(null); // 默认文件不存在
    mockWriteFile.mockResolvedValue({ success: true });

    // 重新导入被测模块（每次都拿到全新的模块级状态）
    const mod = await import("../services/tool-fewshot-cache");
    recordFewShot = mod.recordFewShot;
    getFewShots = mod.getFewShots;
    getRelevantFewShots = mod.getRelevantFewShots;
    buildFewShotPrompt = mod.buildFewShotPrompt;
    clearFewShotCache = mod.clearFewShotCache;
    getFewShotStats = mod.getFewShotStats;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── 1. recordFewShot ──
  describe("recordFewShot", () => {
    it("记录 success=true 的条目", async () => {
      await recordFewShot(
        "test_tool",
        { a: 1 },
        { success: true, data: "ok" },
        "查询",
      );

      const shots = await getFewShots("test_tool");
      expect(shots).toHaveLength(1);
      expect(shots[0]!.toolName).toBe("test_tool");
      expect(shots[0]!.userQuery).toBe("查询");
      expect(shots[0]!.timestamp).toBeGreaterThan(0);
    });

    it("忽略 success=false 的条目（关键业务规则）", async () => {
      await recordFewShot(
        "test_tool",
        { a: 1 },
        { success: false, error: "failed" },
        "查询",
      );

      const shots = await getFewShots("test_tool");
      expect(shots).toHaveLength(0);
    });

    it("argsSummary 被摘要化（JSON 截断到 200 字符）", async () => {
      const longVal = "x".repeat(300);
      await recordFewShot(
        "test_tool",
        { key: longVal },
        { success: true, data: "ok" },
        "查询",
      );

      const shots = await getFewShots("test_tool");
      expect(shots).toHaveLength(1);
      // truncate 在 200 字符后加 "…"
      expect(shots[0]!.argsSummary.length).toBe(201);
      expect(shots[0]!.argsSummary.endsWith("…")).toBe(true);
    });

    it("resultSummary 被摘要化（成功结果截断到 300 字符）", async () => {
      const longData = "y".repeat(400);
      await recordFewShot(
        "test_tool",
        { a: 1 },
        { success: true, data: longData },
        "查询",
      );

      const shots = await getFewShots("test_tool");
      expect(shots).toHaveLength(1);
      // JSON.stringify 会加引号，截断后 300 + "…"
      expect(shots[0]!.resultSummary.length).toBe(301);
      expect(shots[0]!.resultSummary.endsWith("…")).toBe(true);
    });

    it("userQuery 被截断到 100 字符", async () => {
      const longQuery = "查".repeat(150);
      await recordFewShot(
        "test_tool",
        { a: 1 },
        { success: true, data: "ok" },
        longQuery,
      );

      const shots = await getFewShots("test_tool");
      expect(shots[0]!.userQuery.length).toBe(101);
      expect(shots[0]!.userQuery.endsWith("…")).toBe(true);
    });

    it("不同工具的缓存互不影响", async () => {
      await recordFewShot(
        "tool_a",
        { a: 1 },
        { success: true, data: "ok" },
        "查询a",
      );
      await recordFewShot(
        "tool_b",
        { b: 2 },
        { success: true, data: "ok" },
        "查询b",
      );

      const aShots = await getFewShots("tool_a");
      const bShots = await getFewShots("tool_b");
      expect(aShots).toHaveLength(1);
      expect(aShots[0]!.toolName).toBe("tool_a");
      expect(bShots).toHaveLength(1);
      expect(bShots[0]!.toolName).toBe("tool_b");
    });
  });

  // ── 2. getFewShots ──
  describe("getFewShots", () => {
    it("返回指定工具的缓存", async () => {
      await recordFewShot(
        "tool_a",
        { a: 1 },
        { success: true, data: "ok" },
        "查询a",
      );

      const shots = await getFewShots("tool_a");
      expect(shots).toHaveLength(1);
      expect(shots[0]!.toolName).toBe("tool_a");
    });

    it("不存在的 toolName 返回空数组", async () => {
      const shots = await getFewShots("non_existent_tool");
      expect(shots).toEqual([]);
    });

    it("limit 限制返回条数（返回最新的 limit 条）", async () => {
      await recordFewShot(
        "tool_a",
        { a: 1 },
        { success: true, data: "ok" },
        "查询1",
      );
      await recordFewShot(
        "tool_a",
        { a: 2 },
        { success: true, data: "ok" },
        "查询2",
      );
      await recordFewShot(
        "tool_a",
        { a: 3 },
        { success: true, data: "ok" },
        "查询3",
      );

      // limit=1：返回最新的 1 条（最后追加的）
      const shots = await getFewShots("tool_a", 1);
      expect(shots).toHaveLength(1);
      expect(shots[0]!.userQuery).toBe("查询3");
    });
  });

  // ── 3. LRU 淘汰 ──
  describe("LRU 淘汰（MAX_ENTRIES_PER_TOOL=3）", () => {
    it("单工具超过 3 条时淘汰最旧", async () => {
      await recordFewShot(
        "tool_a",
        { a: 1 },
        { success: true, data: "ok" },
        "查询1",
      );
      await recordFewShot(
        "tool_a",
        { a: 2 },
        { success: true, data: "ok" },
        "查询2",
      );
      await recordFewShot(
        "tool_a",
        { a: 3 },
        { success: true, data: "ok" },
        "查询3",
      );
      await recordFewShot(
        "tool_a",
        { a: 4 },
        { success: true, data: "ok" },
        "查询4",
      );

      // limit 提高到 10 以拿到全部
      const shots = await getFewShots("tool_a", 10);
      expect(shots).toHaveLength(3);

      // 最旧的 "查询1" 被淘汰
      const queries = shots.map((s) => s.userQuery);
      expect(queries).not.toContain("查询1");
      expect(queries).toEqual(["查询2", "查询3", "查询4"]);
    });

    it("恰好 3 条时不淘汰", async () => {
      await recordFewShot(
        "tool_a",
        { a: 1 },
        { success: true, data: "ok" },
        "查询1",
      );
      await recordFewShot(
        "tool_a",
        { a: 2 },
        { success: true, data: "ok" },
        "查询2",
      );
      await recordFewShot(
        "tool_a",
        { a: 3 },
        { success: true, data: "ok" },
        "查询3",
      );

      const shots = await getFewShots("tool_a", 10);
      expect(shots).toHaveLength(3);
      expect(shots[0]!.userQuery).toBe("查询1");
      expect(shots[2]!.userQuery).toBe("查询3");
    });

    it("LRU 按工具独立淘汰（不同工具互不影响）", async () => {
      // tool_a 记录 4 条（淘汰 1 条）
      for (let i = 0; i < 4; i++) {
        await recordFewShot(
          "tool_a",
          { a: i },
          { success: true, data: "ok" },
          `查询a${i}`,
        );
      }
      // tool_b 记录 2 条（不淘汰）
      for (let i = 0; i < 2; i++) {
        await recordFewShot(
          "tool_b",
          { b: i },
          { success: true, data: "ok" },
          `查询b${i}`,
        );
      }

      const aShots = await getFewShots("tool_a", 10);
      const bShots = await getFewShots("tool_b", 10);
      expect(aShots).toHaveLength(3); // LRU 淘汰后剩 3
      expect(bShots).toHaveLength(2); // 未超过上限
    });
  });

  // ── 4. 去重 ──
  describe("去重", () => {
    it("相同 argsSummary 的条目不重复记录（更新而非追加）", async () => {
      await recordFewShot(
        "tool_a",
        { a: 1 },
        { success: true, data: "ok" },
        "旧查询",
      );
      await recordFewShot(
        "tool_a",
        { a: 1 },
        { success: true, data: "ok" },
        "新查询",
      );

      const shots = await getFewShots("tool_a", 10);
      expect(shots).toHaveLength(1);
      // 旧的被移除，新的在末尾
      expect(shots[0]!.userQuery).toBe("新查询");
    });

    it("不同 argsSummary 的条目共存", async () => {
      await recordFewShot(
        "tool_a",
        { a: 1 },
        { success: true, data: "ok" },
        "查询1",
      );
      await recordFewShot(
        "tool_a",
        { a: 2 },
        { success: true, data: "ok" },
        "查询2",
      );

      const shots = await getFewShots("tool_a", 10);
      expect(shots).toHaveLength(2);
    });

    it("去重后 LRU 计数正确（去重不触发额外淘汰）", async () => {
      // 记录 3 条不同 args
      await recordFewShot(
        "tool_a",
        { a: 1 },
        { success: true, data: "ok" },
        "查询1",
      );
      await recordFewShot(
        "tool_a",
        { a: 2 },
        { success: true, data: "ok" },
        "查询2",
      );
      await recordFewShot(
        "tool_a",
        { a: 3 },
        { success: true, data: "ok" },
        "查询3",
      );
      // 重复第 1 条 args（去重：移除旧的，追加新的，总条数仍为 3）
      await recordFewShot(
        "tool_a",
        { a: 1 },
        { success: true, data: "ok" },
        "查询1新",
      );

      const shots = await getFewShots("tool_a", 10);
      expect(shots).toHaveLength(3);
      const queries = shots.map((s) => s.userQuery);
      expect(queries).toEqual(["查询2", "查询3", "查询1新"]);
    });
  });

  // ── 5. clearFewShotCache ──
  describe("clearFewShotCache", () => {
    it("清空缓存", async () => {
      await recordFewShot(
        "tool_a",
        { a: 1 },
        { success: true, data: "ok" },
        "查询",
      );
      expect(await getFewShots("tool_a")).toHaveLength(1);

      await clearFewShotCache();

      expect(await getFewShots("tool_a")).toHaveLength(0);
    });

    it("清空后可重新记录", async () => {
      await recordFewShot(
        "tool_a",
        { a: 1 },
        { success: true, data: "ok" },
        "旧查询",
      );
      await clearFewShotCache();
      await recordFewShot(
        "tool_a",
        { a: 1 },
        { success: true, data: "ok" },
        "新查询",
      );

      const shots = await getFewShots("tool_a");
      expect(shots).toHaveLength(1);
      expect(shots[0]!.userQuery).toBe("新查询");
    });

    it("清空时触发持久化（写入空缓存）", async () => {
      await clearFewShotCache();
      expect(mockWriteFile).toHaveBeenCalled();
    });
  });

  // ── 6. getFewShotStats ──
  describe("getFewShotStats", () => {
    it("返回正确统计（含运行时 + 内置示例数）", async () => {
      await recordFewShot(
        "tool_a",
        { a: 1 },
        { success: true, data: "ok" },
        "查询1",
      );
      await recordFewShot(
        "tool_a",
        { a: 2 },
        { success: true, data: "ok" },
        "查询2",
      );
      await recordFewShot(
        "tool_b",
        { b: 1 },
        { success: true, data: "ok" },
        "查询3",
      );

      const stats = await getFewShotStats();
      expect(stats.totalEntries).toBe(3);
      expect(stats.toolCount).toBe(2);
      expect(stats.tools).toHaveLength(2);

      const toolA = stats.tools.find((t) => t.toolName === "tool_a");
      const toolB = stats.tools.find((t) => t.toolName === "tool_b");
      expect(toolA).toBeDefined();
      expect(toolA?.count).toBe(2);
      expect(toolB).toBeDefined();
      expect(toolB?.count).toBe(1);

      // builtinEntries 应为内置示例总数
      expect(stats.builtinEntries).toBeGreaterThan(0);
    });

    it("空缓存时运行时条目为 0，但 builtinEntries 仍有值", async () => {
      const stats = await getFewShotStats();
      expect(stats.totalEntries).toBe(0);
      expect(stats.toolCount).toBe(0);
      expect(stats.tools).toEqual([]);
      expect(stats.builtinEntries).toBeGreaterThan(0);
    });

    it("tools 按 lastUsed 倒序排列", async () => {
      const realDateNow = Date.now;
      let t = 1000;
      Date.now = () => t;

      try {
        // tool_a 的 lastUsed = 2000
        t = 1000;
        await recordFewShot(
          "tool_a",
          { a: 1 },
          { success: true, data: "ok" },
          "查询a",
        );
        t = 2000;
        await recordFewShot(
          "tool_a",
          { a: 2 },
          { success: true, data: "ok" },
          "查询a2",
        );
        // tool_b 的 lastUsed = 3000
        t = 3000;
        await recordFewShot(
          "tool_b",
          { b: 1 },
          { success: true, data: "ok" },
          "查询b",
        );

        const stats = await getFewShotStats();
        expect(stats.tools).toHaveLength(2);
        // tool_b (lastUsed=3000) 应排在 tool_a (lastUsed=2000) 前面
        expect(stats.tools[0]!.toolName).toBe("tool_b");
        expect(stats.tools[1]!.toolName).toBe("tool_a");
      } finally {
        Date.now = realDateNow;
      }
    });
  });

  // ── 7. getRelevantFewShots ──
  describe("getRelevantFewShots", () => {
    it("合并内置 + 运行时缓存", async () => {
      // 记录一条运行时缓存
      await recordFewShot(
        "list_characters",
        { limit: 20 },
        { success: true, data: "ok" },
        "列出角色",
      );

      // 查询 "角色" 匹配运行时 + 内置
      const result = await getRelevantFewShots("角色", 10);
      expect(result.length).toBeGreaterThan(0);

      // 应包含运行时条目（timestamp > 0）
      const hasRuntime = result.some(
        (s) => s.toolName === "list_characters" && s.timestamp > 0,
      );
      expect(hasRuntime).toBe(true);
    });

    it("运行时缓存优先于内置示例（同分时 timestamp 倒序）", async () => {
      // 记录一条运行时，匹配 "角色"
      await recordFewShot(
        "list_characters",
        { limit: 20 },
        { success: true, data: "ok" },
        "列出角色",
      );

      const result = await getRelevantFewShots("角色", 10);
      expect(result.length).toBeGreaterThan(1); // 运行时 + 内置

      // 第一条应为运行时（timestamp > 0），因为同分数时 timestamp 高的在前
      // 运行时 timestamp > 0，内置 timestamp = 0
      expect(result[0]!.timestamp).toBeGreaterThan(0);
    });

    it("无关键词时返回全部（受 limit 限制），运行时优先", async () => {
      // 记录一条运行时
      await recordFewShot(
        "test_tool",
        { a: 1 },
        { success: true, data: "ok" },
        "测试查询",
      );

      // 无关键词查询（空字符串）
      const result = await getRelevantFewShots("", 5);
      expect(result.length).toBeGreaterThan(0);

      // 运行时（timestamp > 0）应在内置（timestamp = 0）之前
      const firstRuntimeIdx = result.findIndex((s) => s.timestamp > 0);
      const firstBuiltinIdx = result.findIndex((s) => s.timestamp === 0);
      if (firstRuntimeIdx >= 0 && firstBuiltinIdx >= 0) {
        expect(firstRuntimeIdx).toBeLessThan(firstBuiltinIdx);
      }
    });

    it("关键词匹配度评分与排序（高分在前）", async () => {
      // "cyberpunk scene" 匹配多个内置示例：
      // - generate_scene_image: argsSummary 含 "cyberpunk" 和 "scene"（sceneId）→ score 2
      // - generate_story_ideas: argsSummary 含 "cyberpunk" → score 1
      const result = await getRelevantFewShots("cyberpunk scene", 10);
      expect(result.length).toBeGreaterThan(0);

      const sceneIdx = result.findIndex(
        (s) => s.toolName === "generate_scene_image",
      );
      const storyIdx = result.findIndex(
        (s) => s.toolName === "generate_story_ideas",
      );

      // generate_scene_image (score 2) 应在 generate_story_ideas (score 1) 之前
      if (sceneIdx >= 0 && storyIdx >= 0) {
        expect(sceneIdx).toBeLessThan(storyIdx);
      }
    });

    it("无匹配关键词时返回空数组", async () => {
      const result = await getRelevantFewShots("zzzznotexist", 5);
      expect(result).toEqual([]);
    });

    it("limit 限制返回条数", async () => {
      // "角色" 匹配多个内置示例
      const result = await getRelevantFewShots("角色", 2);
      expect(result.length).toBeLessThanOrEqual(2);
    });
  });

  // ── 8. buildFewShotPrompt ──
  describe("buildFewShotPrompt", () => {
    it("构建正确的 prompt 字符串", async () => {
      const prompt = await buildFewShotPrompt("角色", 3);
      expect(prompt).toContain("## 工具调用示例");
      expect(prompt).toContain("### 示例 1：");
      expect(prompt).toContain("用户意图：");
      expect(prompt).toContain("参数：");
      expect(prompt).toContain("结果：");
    });

    it("无示例时返回空字符串", async () => {
      const prompt = await buildFewShotPrompt("zzzznotexist", 5);
      expect(prompt).toBe("");
    });

    it("包含运行时缓存的示例", async () => {
      await recordFewShot(
        "custom_tool",
        { a: 1 },
        { success: true, data: "ok" },
        "custom test query",
      );

      // 用 "custom" 关键词匹配运行时条目
      const prompt = await buildFewShotPrompt("custom", 5);
      expect(prompt).toContain("custom_tool");
      expect(prompt).toContain("custom test query");
    });

    it("prompt 格式包含多个示例段", async () => {
      // "角色" 匹配多个内置示例
      const prompt = await buildFewShotPrompt("角色", 3);
      // 应包含示例 1 和（如果有）示例 2
      expect(prompt).toContain("### 示例 1：");
    });
  });

  // ── 9. 文件 I/O 与并发 ──
  describe("文件 I/O 与并发", () => {
    it("文件加载失败（success=false）时回退空缓存", async () => {
      mockReadFile.mockResolvedValue({
        success: false,
        error: "permission denied",
      });

      const shots = await getFewShots("any_tool");
      expect(shots).toEqual([]);
    });

    it("文件内容损坏时回退空缓存", async () => {
      mockReadFile.mockResolvedValue({
        success: true,
        data: encodeText("not valid json {{{"),
      });

      const shots = await getFewShots("any_tool");
      expect(shots).toEqual([]);
    });

    it("文件 version 不为 1 时回退空缓存", async () => {
      mockReadFile.mockResolvedValue({
        success: true,
        data: encodeText(
          JSON.stringify({
            version: 99,
            entries: {
              tool: [
                {
                  toolName: "t",
                  userQuery: "q",
                  argsSummary: "{}",
                  resultSummary: "{}",
                  timestamp: 0,
                },
              ],
            },
          }),
        ),
      });

      const shots = await getFewShots("tool");
      // version 不匹配，回退空缓存
      expect(shots).toEqual([]);
    });

    it("从磁盘加载已有缓存", async () => {
      const diskData = {
        version: 1,
        entries: {
          disk_tool: [
            {
              toolName: "disk_tool",
              userQuery: "disk query",
              argsSummary: '{"a":1}',
              resultSummary: '{"b":2}',
              timestamp: 1000,
            },
          ],
        },
      };
      mockReadFile.mockResolvedValue({
        success: true,
        data: encodeText(JSON.stringify(diskData)),
      });

      const shots = await getFewShots("disk_tool");
      expect(shots).toHaveLength(1);
      expect(shots[0]!.toolName).toBe("disk_tool");
      expect(shots[0]!.userQuery).toBe("disk query");
      expect(shots[0]!.timestamp).toBe(1000);
    });

    it("已加载的缓存不重复读磁盘", async () => {
      await getFewShots("tool1");
      expect(mockReadFile).toHaveBeenCalledTimes(1);

      // 第二次应使用内存缓存，不再读磁盘
      await getFewShots("tool2");
      expect(mockReadFile).toHaveBeenCalledTimes(1);
    });

    it("loadingPromise 并发锁：并发调用只读一次文件", async () => {
      let resolveRead!: (val: unknown) => void;
      mockReadFile.mockImplementation(
        () =>
          new Promise((r) => {
            resolveRead = r;
          }),
      );

      // 并发调用两个 getFewShots
      const p1 = getFewShots("tool1");
      const p2 = getFewShots("tool2");

      await flushMicrotasks();
      // readFile 只被调用一次（loadingPromise 并发锁）
      expect(mockReadFile).toHaveBeenCalledTimes(1);

      // 解除阻塞
      resolveRead({
        success: true,
        data: encodeText(JSON.stringify({ version: 1, entries: {} })),
      });
      await flushMicrotasks();

      await p1;
      await p2;
    });

    it("持久化到正确路径", async () => {
      await recordFewShot(
        "tool_a",
        { a: 1 },
        { success: true, data: "ok" },
        "查询",
      );

      expect(mockWriteFile).toHaveBeenCalled();
      const writePath = mockWriteFile.mock.calls[0]![0] as string;
      expect(writePath).toContain("agent/fewshot-cache.json");
    });

    it("getCacheDirectory 失败时静默处理（不抛出）", async () => {
      mockGetCacheDirectory.mockResolvedValue({
        success: false,
        error: "no cache dir",
      });

      // 不应抛出
      const shots = await getFewShots("any_tool");
      expect(shots).toEqual([]);
    });

    it("writeFile 失败时静默处理（不影响内存数据）", async () => {
      mockWriteFile.mockResolvedValue({
        success: false,
        error: "disk full",
      });

      // 不应抛出
      await recordFewShot(
        "tool_a",
        { a: 1 },
        { success: true, data: "ok" },
        "查询",
      );

      // 内存中仍有数据
      const shots = await getFewShots("tool_a");
      expect(shots).toHaveLength(1);
    });

    it("writeFile 抛异常时静默处理（不影响内存数据）", async () => {
      mockWriteFile.mockRejectedValue(new Error("write error"));

      await recordFewShot(
        "tool_a",
        { a: 1 },
        { success: true, data: "ok" },
        "查询",
      );

      const shots = await getFewShots("tool_a");
      expect(shots).toHaveLength(1);
    });
  });
});
