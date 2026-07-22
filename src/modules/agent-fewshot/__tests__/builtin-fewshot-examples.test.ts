/**
 * builtin-fewshot-examples 单元测试
 *
 * 覆盖范围：
 * 1. BUILTIN_FEWSHOT_EXAMPLES 结构与完整性
 * 2. getBuiltinFewShotExamples() 返回全部示例（副本）
 * 3. getBuiltinFewShotsByTool() 按工具名过滤
 * 4. getBuiltinFewShotStats() 统计信息
 * 5. getRelevantBuiltinFewShots() 关键词匹配与排序
 */

import { describe, it, expect } from "vitest";
import {
  BUILTIN_FEWSHOT_EXAMPLES,
  getBuiltinFewShotExamples,
  getBuiltinFewShotsByTool,
  getRelevantBuiltinFewShots,
  getBuiltinFewShotStats,
} from "../services/builtin-fewshot-examples";

describe("builtin-fewshot-examples", () => {
  // ── 1. BUILTIN_FEWSHOT_EXAMPLES 结构 ──
  describe("BUILTIN_FEWSHOT_EXAMPLES", () => {
    it("非空且结构正确", () => {
      expect(BUILTIN_FEWSHOT_EXAMPLES.length).toBeGreaterThan(0);

      for (const entry of BUILTIN_FEWSHOT_EXAMPLES) {
        expect(typeof entry.toolName).toBe("string");
        expect(entry.toolName.length).toBeGreaterThan(0);
        expect(typeof entry.userQuery).toBe("string");
        expect(typeof entry.argsSummary).toBe("string");
        expect(typeof entry.resultSummary).toBe("string");
        expect(typeof entry.timestamp).toBe("number");
      }
    });

    it("所有内置示例 timestamp 为 0（确保低于运行时缓存优先级）", () => {
      for (const entry of BUILTIN_FEWSHOT_EXAMPLES) {
        expect(entry.timestamp).toBe(0);
      }
    });

    it("覆盖角色 / 场景 / 视频 / 故事 / 提示词模板 domain", () => {
      const tools = new Set(BUILTIN_FEWSHOT_EXAMPLES.map((e) => e.toolName));
      // 角色 domain
      expect(tools.has("list_characters")).toBe(true);
      expect(tools.has("create_character")).toBe(true);
      expect(tools.has("generate_character_image")).toBe(true);
      // 场景 domain
      expect(tools.has("list_scenes")).toBe(true);
      expect(tools.has("create_scene")).toBe(true);
      // 视频 domain
      expect(tools.has("create_video_task")).toBe(true);
      expect(tools.has("list_video_tasks")).toBe(true);
      // 故事 domain
      expect(tools.has("create_story")).toBe(true);
      expect(tools.has("generate_story_ideas")).toBe(true);
      // 提示词模板 domain
      expect(tools.has("list_prompt_templates")).toBe(true);
      expect(tools.has("apply_prompt_template")).toBe(true);
    });
  });

  // ── 2. getBuiltinFewShotExamples ──
  describe("getBuiltinFewShotExamples", () => {
    it("返回全部示例", () => {
      const all = getBuiltinFewShotExamples();
      expect(all).toHaveLength(BUILTIN_FEWSHOT_EXAMPLES.length);
    });

    it("返回副本（修改返回值不影响内置数据）", () => {
      const all = getBuiltinFewShotExamples();
      const originalTool = all[0]!.toolName;
      all[0]!.toolName = "modified_tool";

      // 内置数据不受影响
      expect(BUILTIN_FEWSHOT_EXAMPLES[0]!.toolName).toBe(originalTool);
    });
  });

  // ── 3. getBuiltinFewShotsByTool ──
  describe("getBuiltinFewShotsByTool", () => {
    it("按 toolName 过滤", () => {
      const list = getBuiltinFewShotsByTool("list_characters");
      expect(list.length).toBeGreaterThan(0);
      for (const entry of list) {
        expect(entry.toolName).toBe("list_characters");
      }
    });

    it("不存在的 toolName 返回空数组", () => {
      const list = getBuiltinFewShotsByTool("non_existent_tool_xyz");
      expect(list).toEqual([]);
    });

    it("默认 limit=3 限制返回条数", () => {
      // create_video_task 有 4 个内置示例
      const list = getBuiltinFewShotsByTool("create_video_task");
      expect(list).toHaveLength(3);
    });

    it("自定义 limit 大于实际数量时返回全部", () => {
      // list_characters 有 2 个内置示例
      const list = getBuiltinFewShotsByTool("list_characters", 10);
      expect(list).toHaveLength(2);
    });

    it("自定义 limit 覆盖默认值", () => {
      const list = getBuiltinFewShotsByTool("create_video_task", 4);
      expect(list).toHaveLength(4);
    });

    it("返回副本", () => {
      const list = getBuiltinFewShotsByTool("list_characters");
      const original = list[0]!.userQuery;
      list[0]!.userQuery = "modified";

      // 内置数据不受影响
      expect(BUILTIN_FEWSHOT_EXAMPLES[0]!.userQuery).toBe(original);
    });
  });

  // ── 4. getBuiltinFewShotStats ──
  describe("getBuiltinFewShotStats", () => {
    it("返回正确统计", () => {
      const stats = getBuiltinFewShotStats();
      expect(stats.totalEntries).toBe(BUILTIN_FEWSHOT_EXAMPLES.length);
      expect(stats.toolCount).toBeGreaterThan(0);
      expect(stats.tools).toHaveLength(stats.toolCount);
    });

    it("tools 包含所有唯一工具名", () => {
      const stats = getBuiltinFewShotStats();
      const uniqueTools = new Set(
        BUILTIN_FEWSHOT_EXAMPLES.map((e) => e.toolName),
      );
      expect(stats.tools.length).toBe(uniqueTools.size);
      for (const tool of uniqueTools) {
        expect(stats.tools).toContain(tool);
      }
    });

    it("tools 数组已排序", () => {
      const stats = getBuiltinFewShotStats();
      const sorted = [...stats.tools].sort();
      expect(stats.tools).toEqual(sorted);
    });
  });

  // ── 5. getRelevantBuiltinFewShots ──
  describe("getRelevantBuiltinFewShots", () => {
    it("无关键词时按工具分组采样（前 N 个唯一工具）", () => {
      // 空字符串 → 无关键词
      const result = getRelevantBuiltinFewShots("");
      // 默认 limit=3，返回前 3 个唯一工具的第一个示例
      expect(result).toHaveLength(3);

      const tools = result.map((e) => e.toolName);
      // BUILTIN_FEWSHOT_EXAMPLES 前三个唯一工具依次为：
      // list_characters, get_character, create_character
      expect(tools).toEqual([
        "list_characters",
        "get_character",
        "create_character",
      ]);
    });

    it("单个中文字符不构成关键词（需 ≥ 2 字符）", () => {
      // "我" 是单字，extractKeywords 不会匹配（中文需 ≥ 2 字符）
      const result = getRelevantBuiltinFewShots("我");
      // 无关键词 → 按工具采样
      expect(result.length).toBeGreaterThan(0);
      expect(result.length).toBeLessThanOrEqual(3);
    });

    it("单个英文字符不构成关键词（需 ≥ 2 字符）", () => {
      // "a" 是单字符，extractKeywords 不会匹配
      const result = getRelevantBuiltinFewShots("a");
      expect(result.length).toBeGreaterThan(0);
    });

    it("中文关键词匹配", () => {
      // "角色" 出现在多个示例的 userQuery 中
      const result = getRelevantBuiltinFewShots("角色", 10);
      expect(result.length).toBeGreaterThan(0);

      // 返回的条目应在 userQuery 或 argsSummary 中包含 "角色"
      for (const entry of result) {
        const text = `${entry.userQuery} ${entry.argsSummary}`;
        expect(text).toContain("角色");
      }
    });

    it("英文关键词匹配（不区分大小写）", () => {
      // "cyberpunk" 出现在多个 argsSummary 中
      const result = getRelevantBuiltinFewShots("CYBERPUNK", 10);
      expect(result.length).toBeGreaterThan(0);

      for (const entry of result) {
        const text = `${entry.userQuery} ${entry.argsSummary}`.toLowerCase();
        expect(text).toContain("cyberpunk");
      }
    });

    it("按匹配度排序（高分在前）", () => {
      // "cyberpunk scene" 匹配多个示例：
      // - generate_scene_image: argsSummary 含 "cyberpunk" 和 "scene"（sceneId）→ score 2
      // - generate_story_ideas: argsSummary 含 "cyberpunk" → score 1
      const result = getRelevantBuiltinFewShots("cyberpunk scene", 10);
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

    it("无匹配的关键词返回空数组", () => {
      const result = getRelevantBuiltinFewShots("zzzznotexist");
      expect(result).toEqual([]);
    });

    it("limit 限制返回条数", () => {
      const result = getRelevantBuiltinFewShots("角色", 1);
      expect(result).toHaveLength(1);
    });

    it("无关键词时 limit 限制采样数量", () => {
      const result = getRelevantBuiltinFewShots("", 2);
      expect(result).toHaveLength(2);
    });

    it("返回副本（修改返回值不影响内置数据）", () => {
      const result = getRelevantBuiltinFewShots("角色", 1);
      expect(result.length).toBeGreaterThan(0);

      const original = result[0]!.toolName;
      result[0]!.toolName = "modified";

      // 内置数据不受影响
      expect(
        BUILTIN_FEWSHOT_EXAMPLES.some((e) => e.toolName === original),
      ).toBe(true);
    });
  });
});
