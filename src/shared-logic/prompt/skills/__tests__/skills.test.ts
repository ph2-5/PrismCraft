/**
 * 核心 Skill 体系测试（Task 1.4 v5.3 增强）
 *
 * 覆盖：
 * - routeSkill 路由逻辑（troubleshoot/interview/compress/prompt 优先级）
 * - 每个 Skill 的 buildInstructions（匹配/不匹配/边界）
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  routeSkill,
  listSkills,
  getSkill,
  registerSkill,
  clearSkills,
  type AgentContext,
} from "../index";
import { interviewSkill } from "../interview-skill";
import { promptSkill } from "../prompt-skill";
import { compressSkill } from "../compress-skill";
import { troubleshootSkill } from "../troubleshoot-skill";

// skills/index.ts 在模块加载时自动注册 4 个核心 Skill。
// 测试中可能需要重置注册表，因此用 beforeEach 重置并重新注册。

describe("Skill 路由表", () => {
  beforeEach(() => {
    clearSkills();
    // 注册顺序决定 routeSkill 匹配优先级
    registerSkill(troubleshootSkill);
    registerSkill(interviewSkill);
    registerSkill(compressSkill);
    registerSkill(promptSkill);
  });

  describe("routeSkill", () => {
    it("含诊断关键词应路由到 troubleshoot", () => {
      expect(routeSkill("生成失败了，报错了").id).toBe("troubleshoot");
    });

    it("含英文诊断关键词应路由到 troubleshoot（大小写不敏感）", () => {
      expect(routeSkill("the generation failed").id).toBe("troubleshoot");
    });

    it("含模糊意图应路由到 interview", () => {
      expect(routeSkill("我想做个视频，不知道拍什么").id).toBe("interview");
    });

    it("含压缩关键词应路由到 compress", () => {
      expect(routeSkill("帮我压缩这个 prompt").id).toBe("compress");
    });

    it("清晰概念应路由到 prompt（默认 fallback）", () => {
      expect(routeSkill("一个穿红裙子的女孩在雨中奔跑").id).toBe("prompt");
    });

    it("注册表为空时应抛错", () => {
      clearSkills();
      expect(() => routeSkill("anything")).toThrow();
    });

    it("仅注册 prompt Skill 时，所有输入都路由到 prompt", () => {
      clearSkills();
      registerSkill(promptSkill);
      expect(routeSkill("失败了").id).toBe("prompt");
    });
  });

  describe("注册器 API", () => {
    it("listSkills 返回所有已注册 Skill", () => {
      const skills = listSkills();
      expect(skills).toHaveLength(4);
      expect(skills.map((s) => s.id).sort()).toEqual([
        "compress",
        "interview",
        "prompt",
        "troubleshoot",
      ]);
    });

    it("getSkill 按 id 获取 Skill", () => {
      expect(getSkill("interview")?.id).toBe("interview");
      expect(getSkill("nonexistent")).toBeUndefined();
    });

    it("重复注册同一 id 会覆盖旧值", () => {
      const custom: AgentContext = { userMessage: "" };
      const overridden = {
        id: "interview",
        matchers: ["custom"],
        buildInstructions: () => "custom instructions",
      };
      registerSkill(overridden);
      expect(getSkill("interview")).toBe(overridden);
      // 恢复
      registerSkill(interviewSkill);
      void custom;
    });
  });

  describe("interviewSkill", () => {
    it("matchers 包含模糊意图关键词", () => {
      expect(interviewSkill.matchers).toContain("我想做");
      expect(interviewSkill.matchers).toContain("不知道");
      expect(interviewSkill.matchers).toContain("帮我想");
    });

    it("buildInstructions 返回访谈模式指令", () => {
      const ctx: AgentContext = { userMessage: "我想做视频" };
      const instructions = interviewSkill.buildInstructions(ctx);
      expect(instructions).toContain("Interview");
      expect(instructions).toContain("访谈");
      expect(instructions).toContain("不要直接输出 prompt");
    });

    it("buildInstructions 含项目类型提示（非 unknown）", () => {
      const ctx: AgentContext = { userMessage: "我想做视频", projectType: "ancient" };
      const instructions = interviewSkill.buildInstructions(ctx);
      expect(instructions).toContain("古装");
      expect(instructions).toContain("朝代");
    });

    it("projectType 为 unknown 时不输出项目类型提示", () => {
      const ctx: AgentContext = { userMessage: "我想做视频", projectType: "unknown" };
      const instructions = interviewSkill.buildInstructions(ctx);
      expect(instructions).not.toContain("项目类型为");
    });

    it("无 projectType 时不输出项目类型提示", () => {
      const ctx: AgentContext = { userMessage: "我想做视频" };
      const instructions = interviewSkill.buildInstructions(ctx);
      expect(instructions).not.toContain("项目类型为");
    });
  });

  describe("promptSkill", () => {
    it("matchers 为空数组（默认 fallback）", () => {
      expect(promptSkill.matchers).toEqual([]);
    });

    it("buildInstructions 返回 6 段式结构化模板", () => {
      const ctx: AgentContext = { userMessage: "红裙女孩雨中奔跑" };
      const instructions = promptSkill.buildInstructions(ctx);
      expect(instructions).toContain("Prompt");
      expect(instructions).toContain("主体");
      expect(instructions).toContain("动作");
      expect(instructions).toContain("环境");
      expect(instructions).toContain("风格");
      expect(instructions).toContain("镜头");
      expect(instructions).toContain("时长");
    });

    it("buildInstructions 含项目类型提示", () => {
      const ctx: AgentContext = { userMessage: "test", projectType: "scifi" };
      const instructions = promptSkill.buildInstructions(ctx);
      expect(instructions).toContain("科幻");
      expect(instructions).toContain("技术术语");
    });

    it("无 projectType 时不输出项目类型提示", () => {
      const ctx: AgentContext = { userMessage: "test" };
      const instructions = promptSkill.buildInstructions(ctx);
      expect(instructions).not.toContain("项目类型");
    });
  });

  describe("compressSkill", () => {
    it("matchers 包含压缩关键词", () => {
      expect(compressSkill.matchers).toContain("压缩");
      expect(compressSkill.matchers).toContain("精简");
      expect(compressSkill.matchers).toContain("太长");
    });

    it("buildInstructions 返回压缩指令", () => {
      const ctx: AgentContext = { userMessage: "压缩" };
      const instructions = compressSkill.buildInstructions(ctx);
      expect(instructions).toContain("Compress");
      expect(instructions).toContain("30-100");
    });

    it("buildInstructions 列出可丢弃的空泛词汇", () => {
      const ctx: AgentContext = { userMessage: "压缩" };
      const instructions = compressSkill.buildInstructions(ctx);
      expect(instructions).toContain("masterpiece");
      expect(instructions).toContain("best quality");
      expect(instructions).toContain("4k");
    });

    it("buildInstructions 列出压缩优先级", () => {
      const ctx: AgentContext = { userMessage: "压缩" };
      const instructions = compressSkill.buildInstructions(ctx);
      expect(instructions).toContain("主体身份");
      expect(instructions).toContain("核心动作");
      expect(instructions).toContain("镜头语言");
    });
  });

  describe("troubleshootSkill", () => {
    it("matchers 包含诊断关键词", () => {
      expect(troubleshootSkill.matchers).toContain("失败");
      expect(troubleshootSkill.matchers).toContain("报错");
      expect(troubleshootSkill.matchers).toContain("修复");
    });

    it("buildInstructions 返回 8 维度诊断清单", () => {
      const ctx: AgentContext = { userMessage: "失败了" };
      const instructions = troubleshootSkill.buildInstructions(ctx);
      expect(instructions).toContain("Troubleshoot");
      expect(instructions).toContain("相机");
      expect(instructions).toContain("灯光");
      expect(instructions).toContain("运动");
      expect(instructions).toContain("参考角色");
      expect(instructions).toContain("时长");
      expect(instructions).toContain("构图");
      expect(instructions).toContain("音频");
      expect(instructions).toContain("安全措辞");
    });

    it("buildInstructions 含已知失败上下文", () => {
      const ctx: AgentContext = {
        userMessage: "修复",
        recentFailures: [
          { dimension: "camera", issue: "景别过近", prompt: "特写" },
          { dimension: "lighting", issue: "过曝" },
        ],
      };
      const instructions = troubleshootSkill.buildInstructions(ctx);
      expect(instructions).toContain("已知失败上下文");
      expect(instructions).toContain("景别过近");
      expect(instructions).toContain("特写");
      expect(instructions).toContain("过曝");
    });

    it("无已知失败时不输出失败上下文", () => {
      const ctx: AgentContext = { userMessage: "修复" };
      const instructions = troubleshootSkill.buildInstructions(ctx);
      expect(instructions).not.toContain("已知失败上下文");
    });

    it("空 recentFailures 数组不输出失败上下文", () => {
      const ctx: AgentContext = { userMessage: "修复", recentFailures: [] };
      const instructions = troubleshootSkill.buildInstructions(ctx);
      expect(instructions).not.toContain("已知失败上下文");
    });
  });
});
