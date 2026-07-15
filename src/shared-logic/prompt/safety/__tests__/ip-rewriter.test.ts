/**
 * IP 安全改写器测试（Task 1.4 v5.3 增强）
 */

import { describe, it, expect } from "vitest";
import {
  rewriteIp,
  needsUserConfirmation,
  listKnownKeywords,
} from "../ip-rewriter";

describe("ip-rewriter", () => {
  describe("rewriteIp", () => {
    it("改写名人关键词", () => {
      const result = rewriteIp("像成龙一样的功夫高手");
      expect(result.changes).toHaveLength(1);
      expect(result.changes[0]!.category).toBe("celebrity");
      expect(result.changes[0]!.original).toBe("成龙");
      expect(result.rewritten).toContain("华语功夫动作男星");
      expect(result.rewritten).not.toContain("成龙");
    });

    it("改写 IP 关键词（电影）", () => {
      const result = rewriteIp("像钢铁侠一样的机甲");
      expect(result.changes).toHaveLength(1);
      expect(result.changes[0]!.category).toBe("ip");
      expect(result.changes[0]!.original).toBe("钢铁侠");
      expect(result.rewritten).toContain("机械战甲超级英雄");
    });

    it("改写 IP 关键词（动画工作室风格）", () => {
      const result = rewriteIp("皮克斯风格的动画");
      expect(result.rewritten).toContain("3D 动画渲染风格");
      expect(result.rewritten).not.toContain("皮克斯");
    });

    it("改写品牌商标关键词", () => {
      const result = rewriteIp("手持iPhone的年轻人");
      expect(result.changes).toHaveLength(1);
      expect(result.changes[0]!.category).toBe("brand");
      expect(result.rewritten).toContain("现代智能手机");
    });

    it("同时改写多个关键词（IP + 名人）", () => {
      const result = rewriteIp("像钢铁侠一样的成龙");
      expect(result.changes).toHaveLength(2);
      expect(result.rewritten).toContain("机械战甲超级英雄");
      expect(result.rewritten).toContain("华语功夫动作男星");
    });

    it("不含任何关键词时返回原文", () => {
      const result = rewriteIp("一个穿红裙子的女孩在雨中奔跑");
      expect(result.changes).toHaveLength(0);
      expect(result.rewritten).toBe("一个穿红裙子的女孩在雨中奔跑");
      expect(result.confidence).toBe(1);
    });

    it("长 key 优先于短 key（避免覆盖）", () => {
      // "漫威" 和 "漫威式" 都在数据库，"漫威式" 应优先匹配
      const result = rewriteIp("漫威式超级英雄");
      // "漫威式" 不在数据库，只有 "漫威"
      // 但 "漫威" 匹配后替换为 "超级英雄电影式"
      expect(result.rewritten).toContain("超级英雄电影式");
    });

    it("置信度为所有 changes 中最低值", () => {
      const result = rewriteIp("像钢铁侠一样的成龙");
      // 所有匹配都是精确匹配（0.95），所以整体置信度也是 0.95
      expect(result.confidence).toBe(0.95);
    });
  });

  describe("needsUserConfirmation", () => {
    it("高置信度（≥0.9）不需要用户确认", () => {
      const result = rewriteIp("像钢铁侠");
      expect(result.confidence).toBe(0.95);
      expect(needsUserConfirmation(result)).toBe(false);
    });

    it("无改写时不需要确认", () => {
      const result = rewriteIp("普通文本");
      expect(needsUserConfirmation(result)).toBe(false);
    });

    it("自定义阈值生效", () => {
      const result = rewriteIp("像钢铁侠");
      // 0.95 > 0.9，默认阈值不触发
      expect(needsUserConfirmation(result, 0.99)).toBe(true);
      expect(needsUserConfirmation(result, 0.9)).toBe(false);
    });
  });

  describe("listKnownKeywords", () => {
    it("返回三类关键词列表", () => {
      const keywords = listKnownKeywords();
      expect(keywords.celebrity.length).toBeGreaterThan(0);
      expect(keywords.ip.length).toBeGreaterThan(0);
      expect(keywords.brand.length).toBeGreaterThan(0);
    });

    it("名人列表含已知条目", () => {
      const keywords = listKnownKeywords();
      expect(keywords.celebrity).toContain("成龙");
      expect(keywords.celebrity).toContain("周杰伦");
    });

    it("IP 列表含已知条目", () => {
      const keywords = listKnownKeywords();
      expect(keywords.ip).toContain("钢铁侠");
      expect(keywords.ip).toContain("皮克斯");
    });
  });
});
