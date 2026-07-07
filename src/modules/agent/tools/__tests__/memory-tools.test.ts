/**
 * Memory Tools 单元测试
 *
 * 测试 6 个记忆管理工具：
 * - save_memory：保存事实或偏好到核心记忆
 * - recall_memory：检索归档记忆（关键词匹配）
 * - get_user_preferences：读取所有用户偏好
 * - update_preference：更新单个用户偏好
 * - delete_memory：删除记忆条目
 * - list_archival_memory：列出最近归档记忆
 *
 * Mock ../../services/memory-service，不真实操作存储。
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

// ── Mock memory-service（路径相对于 tools/__tests__/） ──
vi.mock("../../services/memory-service", () => ({
  saveFact: vi.fn(),
  updatePreference: vi.fn(),
  removeFact: vi.fn(),
  removePreference: vi.fn(),
  getCoreMemory: vi.fn(),
  searchArchivalMemory: vi.fn(),
  getAllArchivalMemory: vi.fn(),
  deleteArchivalMemory: vi.fn(),
  clearCoreMemory: vi.fn(),
  getArchivalMemoryCount: vi.fn(),
}));

import {
  saveFact,
  updatePreference,
  removeFact,
  removePreference,
  getCoreMemory,
  searchArchivalMemory,
  getAllArchivalMemory,
  deleteArchivalMemory,
  clearCoreMemory,
  getArchivalMemoryCount,
} from "../../services/memory-service";
import {
  saveMemoryTool,
  recallMemoryTool,
  getUserPreferencesTool,
  updatePreferenceTool,
  deleteMemoryTool,
  listArchivalMemoryTool,
  memoryTools,
} from "../memory-tools";
import type { ToolContext } from "../../domain/types";

// ============= Helpers =============

function makeCtx(): ToolContext {
  return {
    sessionId: "test-session",
    onProgress: vi.fn(),
  };
}

// ============= Tests =============

describe("memory-tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 默认 mock 返回值
    vi.mocked(saveFact).mockResolvedValue(true);
    vi.mocked(updatePreference).mockResolvedValue(true);
    vi.mocked(removeFact).mockResolvedValue(true);
    vi.mocked(removePreference).mockResolvedValue(true);
    vi.mocked(getCoreMemory).mockResolvedValue({
      preferences: {},
      facts: [],
    });
    vi.mocked(searchArchivalMemory).mockResolvedValue([]);
    vi.mocked(getAllArchivalMemory).mockResolvedValue([]);
    vi.mocked(deleteArchivalMemory).mockResolvedValue(true);
    vi.mocked(clearCoreMemory).mockResolvedValue(true);
    vi.mocked(getArchivalMemoryCount).mockResolvedValue(0);
  });

  // ============= save_memory =============
  describe("save_memory", () => {
    it("1. 保存 fact 类型", async () => {
      const result = await saveMemoryTool.execute(
        { type: "fact", key: "source_novel", value: "三体" },
        makeCtx(),
      );

      expect(result.success).toBe(true);
      expect(saveFact).toHaveBeenCalledWith("source_novel", "三体");
      const data = result.data as { type: string; key: string; value: string };
      expect(data.type).toBe("fact");
      expect(data.key).toBe("source_novel");
    });

    it("2. 保存 preference 类型（字符串）", async () => {
      const result = await saveMemoryTool.execute(
        { type: "preference", key: "style", value: "cyberpunk" },
        makeCtx(),
      );

      expect(result.success).toBe(true);
      expect(updatePreference).toHaveBeenCalledWith("style", "cyberpunk");
    });

    it("3. preference 自动转换 true", async () => {
      await saveMemoryTool.execute(
        { type: "preference", key: "dark_mode", value: "true" },
        makeCtx(),
      );

      expect(updatePreference).toHaveBeenCalledWith("dark_mode", true);
    });

    it("4. preference 自动转换 false", async () => {
      await saveMemoryTool.execute(
        { type: "preference", key: "notifications", value: "false" },
        makeCtx(),
      );

      expect(updatePreference).toHaveBeenCalledWith("notifications", false);
    });

    it("5. preference 自动转换数字", async () => {
      await saveMemoryTool.execute(
        { type: "preference", key: "max_retries", value: "3" },
        makeCtx(),
      );

      expect(updatePreference).toHaveBeenCalledWith("max_retries", 3);
    });

    it("6. 参数缺失返回错误", async () => {
      const result = await saveMemoryTool.execute(
        { type: "fact", key: "", value: "test" },
        makeCtx(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("参数缺失");
      expect(saveFact).not.toHaveBeenCalled();
    });

    it("7. 未知 type 返回错误", async () => {
      const result = await saveMemoryTool.execute(
        { type: "unknown", key: "k", value: "v" },
        makeCtx(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("type");
      expect(saveFact).not.toHaveBeenCalled();
    });

    it("8. saveFact 失败返回错误", async () => {
      vi.mocked(saveFact).mockResolvedValue(false);

      const result = await saveMemoryTool.execute(
        { type: "fact", key: "k", value: "v" },
        makeCtx(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("保存事实失败");
    });
  });

  // ============= recall_memory =============
  describe("recall_memory", () => {
    it("9. 正常检索返回结果", async () => {
      const entries = [
        {
          id: "1",
          type: "summary" as const,
          content: "test content",
          createdAt: Date.now(),
          tags: ["auto-extracted"],
        },
      ];
      vi.mocked(searchArchivalMemory).mockResolvedValue(entries);

      const result = await recallMemoryTool.execute(
        { query: "test" },
        makeCtx(),
      );

      expect(result.success).toBe(true);
      expect(searchArchivalMemory).toHaveBeenCalledWith("test", 5);
      const data = result.data as {
        count: number;
        entries: Array<{ id: string }>;
      };
      expect(data.count).toBe(1);
      expect(data.entries[0].id).toBe("1");
    });

    it("10. 空 query 返回错误", async () => {
      const result = await recallMemoryTool.execute(
        { query: "" },
        makeCtx(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("query");
      expect(searchArchivalMemory).not.toHaveBeenCalled();
    });

    it("11. limit 上限为 20", async () => {
      vi.mocked(searchArchivalMemory).mockResolvedValue([]);

      await recallMemoryTool.execute(
        { query: "test", limit: 100 },
        makeCtx(),
      );

      // 100 会被 clamp 到 20
      expect(searchArchivalMemory).toHaveBeenCalledWith("test", 20);
    });

    it("12. searchArchivalMemory 异常返回错误", async () => {
      vi.mocked(searchArchivalMemory).mockRejectedValue(
        new Error("search failed"),
      );

      const result = await recallMemoryTool.execute(
        { query: "test" },
        makeCtx(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("检索记忆失败");
    });
  });

  // ============= get_user_preferences =============
  describe("get_user_preferences", () => {
    it("13. 正常返回偏好和事实", async () => {
      vi.mocked(getCoreMemory).mockResolvedValue({
        preferences: { lang: "zh" },
        facts: [{ key: "source", value: "三体", updatedAt: 1000 }],
      });
      vi.mocked(getArchivalMemoryCount).mockResolvedValue(5);

      const result = await getUserPreferencesTool.execute({}, makeCtx());

      expect(result.success).toBe(true);
      const data = result.data as {
        preferences: Record<string, unknown>;
        facts: unknown[];
        archivalMemoryCount: number;
        preferenceCount: number;
        factCount: number;
      };
      expect(data.preferences).toEqual({ lang: "zh" });
      expect(data.facts).toHaveLength(1);
      expect(data.archivalMemoryCount).toBe(5);
      expect(data.preferenceCount).toBe(1);
      expect(data.factCount).toBe(1);
    });

    it("14. getCoreMemory 异常返回错误", async () => {
      vi.mocked(getCoreMemory).mockRejectedValue(new Error("read failed"));

      const result = await getUserPreferencesTool.execute({}, makeCtx());

      expect(result.success).toBe(false);
      expect(result.error).toContain("读取偏好失败");
    });
  });

  // ============= update_preference =============
  describe("update_preference", () => {
    it("15. string 类型", async () => {
      const result = await updatePreferenceTool.execute(
        { key: "style", value: "dark", valueType: "string" },
        makeCtx(),
      );

      expect(result.success).toBe(true);
      expect(updatePreference).toHaveBeenCalledWith("style", "dark");
    });

    it("16. number 类型", async () => {
      const result = await updatePreferenceTool.execute(
        { key: "count", value: "42", valueType: "number" },
        makeCtx(),
      );

      expect(result.success).toBe(true);
      expect(updatePreference).toHaveBeenCalledWith("count", 42);
    });

    it("17. boolean 类型", async () => {
      const result = await updatePreferenceTool.execute(
        { key: "enabled", value: "true", valueType: "boolean" },
        makeCtx(),
      );

      expect(result.success).toBe(true);
      expect(updatePreference).toHaveBeenCalledWith("enabled", true);
    });

    it("18. number 转换失败返回错误", async () => {
      const result = await updatePreferenceTool.execute(
        { key: "count", value: "abc", valueType: "number" },
        makeCtx(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("number");
      expect(updatePreference).not.toHaveBeenCalled();
    });

    it("19. 参数缺失返回错误", async () => {
      const result = await updatePreferenceTool.execute(
        { key: "", value: "test" },
        makeCtx(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("必填");
      expect(updatePreference).not.toHaveBeenCalled();
    });

    it("20. updatePreference 失败返回错误", async () => {
      vi.mocked(updatePreference).mockResolvedValue(false);

      const result = await updatePreferenceTool.execute(
        { key: "k", value: "v" },
        makeCtx(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("更新偏好失败");
    });
  });

  // ============= delete_memory =============
  describe("delete_memory", () => {
    it("21. target=fact 删除事实", async () => {
      const result = await deleteMemoryTool.execute(
        { target: "fact", key: "source_novel" },
        makeCtx(),
      );

      expect(result.success).toBe(true);
      expect(removeFact).toHaveBeenCalledWith("source_novel");
    });

    it("22. target=preference 删除偏好", async () => {
      const result = await deleteMemoryTool.execute(
        { target: "preference", key: "style" },
        makeCtx(),
      );

      expect(result.success).toBe(true);
      expect(removePreference).toHaveBeenCalledWith("style");
    });

    it("23. target=archival 删除归档记忆", async () => {
      const result = await deleteMemoryTool.execute(
        { target: "archival", key: "mem_123" },
        makeCtx(),
      );

      expect(result.success).toBe(true);
      expect(deleteArchivalMemory).toHaveBeenCalledWith("mem_123");
    });

    it("24. target=all_core 清空核心记忆", async () => {
      const result = await deleteMemoryTool.execute(
        { target: "all_core" },
        makeCtx(),
      );

      expect(result.success).toBe(true);
      expect(clearCoreMemory).toHaveBeenCalledTimes(1);
    });

    it("25. target=fact 缺少 key 返回错误", async () => {
      const result = await deleteMemoryTool.execute(
        { target: "fact" },
        makeCtx(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("key 必填");
      expect(removeFact).not.toHaveBeenCalled();
    });

    it("26. 未知 target 返回错误", async () => {
      const result = await deleteMemoryTool.execute(
        { target: "unknown" },
        makeCtx(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("未知");
    });

    it("27. 删除失败返回错误", async () => {
      vi.mocked(removeFact).mockResolvedValue(false);

      const result = await deleteMemoryTool.execute(
        { target: "fact", key: "k" },
        makeCtx(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("删除");
    });

    it("28. target=archival 缺少 key 返回错误", async () => {
      const result = await deleteMemoryTool.execute(
        { target: "archival" },
        makeCtx(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("必填");
      expect(deleteArchivalMemory).not.toHaveBeenCalled();
    });
  });

  // ============= list_archival_memory =============
  describe("list_archival_memory", () => {
    it("29. 正常列出归档记忆（按时间倒序）", async () => {
      const entries = [
        {
          id: "1",
          type: "summary" as const,
          content: "newer",
          createdAt: 2000,
        },
        {
          id: "2",
          type: "summary" as const,
          content: "older",
          createdAt: 1000,
        },
      ];
      vi.mocked(getAllArchivalMemory).mockResolvedValue(entries);

      const result = await listArchivalMemoryTool.execute({}, makeCtx());

      expect(result.success).toBe(true);
      const data = result.data as {
        total: number;
        count: number;
        entries: Array<{ id: string }>;
      };
      expect(data.total).toBe(2);
      expect(data.count).toBe(2);
      // 按时间倒序，新的在前
      expect(data.entries[0].id).toBe("1");
      expect(data.entries[1].id).toBe("2");
    });

    it("30. limit 上限为 50", async () => {
      const entries = Array.from({ length: 60 }, (_, i) => ({
        id: `mem_${i}`,
        type: "summary" as const,
        content: `content_${i}`,
        createdAt: i,
      }));
      vi.mocked(getAllArchivalMemory).mockResolvedValue(entries);

      const result = await listArchivalMemoryTool.execute(
        { limit: 100 },
        makeCtx(),
      );

      expect(result.success).toBe(true);
      const data = result.data as { count: number };
      expect(data.count).toBe(50);
    });

    it("31. getAllArchivalMemory 异常返回错误", async () => {
      vi.mocked(getAllArchivalMemory).mockRejectedValue(
        new Error("read failed"),
      );

      const result = await listArchivalMemoryTool.execute({}, makeCtx());

      expect(result.success).toBe(false);
      expect(result.error).toContain("列出归档记忆失败");
    });
  });

  // ============= 导出完整性 =============
  describe("导出完整性", () => {
    it("32. memoryTools 包含 6 个工具", () => {
      expect(memoryTools).toHaveLength(6);
    });

    it("33. 所有工具 domain=memory", () => {
      for (const tool of memoryTools) {
        expect(tool.domain).toBe("memory");
      }
    });

    it("34. 工具名称正确", () => {
      const names = memoryTools.map(
        (t) => t.def.function.name,
      );
      expect(names).toContain("save_memory");
      expect(names).toContain("recall_memory");
      expect(names).toContain("get_user_preferences");
      expect(names).toContain("update_preference");
      expect(names).toContain("delete_memory");
      expect(names).toContain("list_archival_memory");
    });
  });
});
