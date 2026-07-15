/**
 * 误报修复器测试（Task 4.12 新增）
 *
 * 测试覆盖：
 * - 医疗场景：手术 / 急救 / 受伤 / 骨折 / 康复
 * - 教育场景：战争 / 战役 / 革命 / 殖民 / 古战场
 * - 新闻场景：灾难 / 地震 / 洪水 / 救援
 * - 艺术场景：人体写生 / 雕塑 / 油画 / 素描
 * - 科幻场景：末日 / 末世 / 废土 / 变异
 *
 * Task 4.12 要求：至少 10 个测试用例（5 类 benign context × 2 用例）
 */

import { describe, it, expect } from "vitest";
import {
  repairFalsePositives,
  listBenignContextEntries,
  getBenignContextStats,
} from "../filter-repair";

describe("filter-repair (Task 4.12 误报修复)", () => {
  describe("repairFalsePositives - 医疗场景", () => {
    it("修复 '手术' 添加医疗注释", () => {
      const result = repairFalsePositives("医生在手术室进行手术");
      expect(result.hasRepairs).toBe(true);
      expect(result.repairs).toHaveLength(1);
      expect(result.repairs[0]!.trigger).toBe("手术");
      expect(result.repairs[0]!.context).toBe("medical");
      // 第一次出现被修复（添加注释），第二次是"手术室"中的"手术"已包含在注释中
      expect(result.repaired).toContain("手术（医疗教育场景，非暴力内容）");
    });

    it("修复 '急救' 添加医疗注释", () => {
      const result = repairFalsePositives("急救人员赶赴现场");
      expect(result.hasRepairs).toBe(true);
      expect(result.repairs[0]!.trigger).toBe("急救");
      expect(result.repairs[0]!.context).toBe("medical");
      expect(result.repaired).toContain("急救（医疗场景，非暴力）");
    });

    it("修复 '骨折' 添加医疗注释", () => {
      const result = repairFalsePositives("他因骨折住院");
      expect(result.hasRepairs).toBe(true);
      expect(result.repairs[0]!.context).toBe("medical");
      expect(result.repaired).toContain("（医疗诊断术语）");
    });
  });

  describe("repairFalsePositives - 教育场景", () => {
    it("修复 '战争' 添加历史教育注释", () => {
      const result = repairFalsePositives("古代战争的场景描述");
      expect(result.hasRepairs).toBe(true);
      expect(result.repairs[0]!.trigger).toBe("战争");
      expect(result.repairs[0]!.context).toBe("education");
      expect(result.repaired).toContain("战争（历史教育描述，非宣扬）");
    });

    it("修复 '革命' 添加历史事件注释", () => {
      const result = repairFalsePositives("工业革命改变世界");
      expect(result.hasRepairs).toBe(true);
      expect(result.repairs[0]!.context).toBe("education");
      expect(result.repaired).toContain("（历史事件描述，非煽动）");
    });
  });

  describe("repairFalsePositives - 新闻场景", () => {
    it("修复 '地震' 添加自然灾害注释", () => {
      const result = repairFalsePositives("地震后的救援场景");
      expect(result.hasRepairs).toBe(true);
      expect(result.repairs[0]!.trigger).toBe("地震");
      expect(result.repairs[0]!.context).toBe("news");
      expect(result.repaired).toContain("（自然灾害纪实，非渲染）");
    });

    it("修复 '洪水' 添加自然灾害注释", () => {
      const result = repairFalsePositives("洪水淹没了村庄");
      expect(result.hasRepairs).toBe(true);
      expect(result.repairs[0]!.context).toBe("news");
      expect(result.repaired).toContain("（自然灾害纪实，非渲染）");
    });
  });

  describe("repairFalsePositives - 艺术场景", () => {
    it("修复 '人体写生' 添加艺术教学注释", () => {
      const result = repairFalsePositives("美术课上的人体写生");
      expect(result.hasRepairs).toBe(true);
      expect(result.repairs[0]!.trigger).toBe("人体写生");
      expect(result.repairs[0]!.context).toBe("art");
      expect(result.repaired).toContain("（艺术教学场景，非色情）");
    });

    it("修复 '雕塑' 添加艺术创作注释", () => {
      const result = repairFalsePositives("博物馆里的雕塑展览");
      expect(result.hasRepairs).toBe(true);
      expect(result.repairs[0]!.context).toBe("art");
      expect(result.repaired).toContain("（艺术创作场景）");
    });
  });

  describe("repairFalsePositives - 科幻场景", () => {
    it("修复 '末日' 添加科幻设定注释", () => {
      const result = repairFalsePositives("末日后的废墟城市");
      expect(result.hasRepairs).toBe(true);
      expect(result.repairs[0]!.trigger).toBe("末日");
      expect(result.repairs[0]!.context).toBe("scifi");
      expect(result.repaired).toContain("（科幻设定，非邪教）");
    });

    it("修复 '变异' 添加科幻设定注释", () => {
      const result = repairFalsePositives("变异生物的巢穴");
      expect(result.hasRepairs).toBe(true);
      expect(result.repairs[0]!.context).toBe("scifi");
      expect(result.repaired).toContain("（科幻设定，非现实）");
    });
  });

  describe("repairFalsePositives - 边界场景", () => {
    it("不含敏感词时不修复", () => {
      const result = repairFalsePositives("一个快乐的周末早晨");
      expect(result.hasRepairs).toBe(false);
      expect(result.repairs).toHaveLength(0);
      expect(result.repaired).toBe("一个快乐的周末早晨");
    });

    it("已注释的敏感词不重复修复", () => {
      // 手动构造已注释的 prompt
      const annotated = "手术（医疗教育场景，非暴力内容）后的康复";
      const result = repairFalsePositives(annotated);
      // "手术" 已被注释，但 "康复" 还需要修复
      const recoveryRepair = result.repairs.find((r) => r.trigger === "康复");
      expect(recoveryRepair).toBeDefined();
      // "手术" 不应该被重复修复
      const surgeryRepair = result.repairs.find((r) => r.trigger === "手术");
      expect(surgeryRepair).toBeUndefined();
    });

    it("同时修复多个不同类别的敏感词", () => {
      const result = repairFalsePositives("战争中的手术场景");
      expect(result.repairs.length).toBeGreaterThanOrEqual(2);
      const contexts = result.repairs.map((r) => r.context);
      expect(contexts).toContain("education"); // 战争
      expect(contexts).toContain("medical"); // 手术
    });

    it("同一敏感词仅修复首次出现", () => {
      const result = repairFalsePositives("手术和手术都一样");
      const surgeryRepairs = result.repairs.filter((r) => r.trigger === "手术");
      expect(surgeryRepairs).toHaveLength(1);
    });

    it("长 trigger 优先于短 trigger", () => {
      // "人体写生" 和 "人体" 不应在数据库中冲突，但按长度降序处理
      // 这里用 "古战场" 测试（"古战场" 和 "战场" 如果都注册了，长的优先）
      const result = repairFalsePositives("古战场的风景");
      expect(result.hasRepairs).toBe(true);
      expect(result.repairs[0]!.trigger).toBe("古战场");
    });
  });

  describe("listBenignContextEntries", () => {
    it("返回所有良性上下文条目", () => {
      const entries = listBenignContextEntries();
      expect(entries.length).toBeGreaterThanOrEqual(20); // Task 4.12 要求覆盖 5 类 × 4+ 条目
    });

    it("条目包含必要字段", () => {
      const entries = listBenignContextEntries();
      const first = entries[0]!;
      expect(first).toHaveProperty("trigger");
      expect(first).toHaveProperty("context");
      expect(first).toHaveProperty("annotation");
      expect(first).toHaveProperty("reason");
    });
  });

  describe("getBenignContextStats", () => {
    it("返回 5 类良性上下文的统计", () => {
      const stats = getBenignContextStats();
      expect(stats).toHaveProperty("medical");
      expect(stats).toHaveProperty("education");
      expect(stats).toHaveProperty("news");
      expect(stats).toHaveProperty("art");
      expect(stats).toHaveProperty("scifi");
    });

    it("每类至少 4 个条目", () => {
      const stats = getBenignContextStats();
      expect(stats.medical).toBeGreaterThanOrEqual(4);
      expect(stats.education).toBeGreaterThanOrEqual(4);
      expect(stats.news).toBeGreaterThanOrEqual(4);
      expect(stats.art).toBeGreaterThanOrEqual(4);
      expect(stats.scifi).toBeGreaterThanOrEqual(4);
    });
  });
});
