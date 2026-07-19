/**
 * Task 1.12：intent-router + intent-routes 单元测试
 *
 * 覆盖：
 * - 6 种意图各 2 个测试用例（共 12 个）
 * - default 意图（无关键词命中）
 * - 优先级冲突（troubleshoot 优先于其他）
 * - 大小写不敏感
 * - mapIntentToSkillId 映射
 * - buildRouteContext 各意图的输出结构
 * - listIntentTypes 返回值
 */

import { describe, it, expect } from "vitest";
import {
  routeIntent,
  mapIntentToSkillId,
  listIntentTypes,
  type IntentType,
} from "../intent-router";
import { buildRouteContext } from "../intent-routes";
import type { AgentContext } from "@/shared-logic/prompt";

const baseCtx: AgentContext = {
  userMessage: "",
  projectType: "unknown",
  recentFailures: [],
};

describe("intent-router", () => {
  // === interview 意图（2 用例） ===
  describe("interview 意图", () => {
    it("应识别 '不知道拍什么' 为 interview", () => {
      const intent = routeIntent("我想做视频但不知道拍什么");
      expect(intent.type).toBe("interview");
      expect(intent.confidence).toBe(1.0);
      expect(intent.matchedKeywords).toContain("不知道拍什么");
      expect(intent.routeId).toBe("interview-route");
    });

    it("应识别 '给点灵感' 为 interview", () => {
      const intent = routeIntent("给点灵感");
      expect(intent.type).toBe("interview");
      expect(intent.matchedKeywords).toContain("给点灵感");
    });
  });

  // === novel 意图（2 用例） ===
  describe("novel 意图", () => {
    it("应识别 '把小说变成视频' 为 novel", () => {
      const intent = routeIntent("把这段小说变成视频");
      expect(intent.type).toBe("novel");
      expect(intent.matchedKeywords).toContain("小说");
      expect(intent.matchedKeywords).toContain("变成视频");
    });

    it("应识别 '导入故事' 为 novel", () => {
      const intent = routeIntent("我想导入故事文本");
      expect(intent.type).toBe("novel");
      expect(intent.matchedKeywords).toContain("导入故事");
    });
  });

  // === troubleshoot 意图（2 用例） ===
  describe("troubleshoot 意图", () => {
    it("应识别 '生成失败' 为 troubleshoot", () => {
      const intent = routeIntent("这个视频生成失败了");
      expect(intent.type).toBe("troubleshoot");
      expect(intent.matchedKeywords).toContain("失败");
    });

    it("应识别 '为什么报错' 为 troubleshoot", () => {
      const intent = routeIntent("为什么总是报错");
      expect(intent.type).toBe("troubleshoot");
      expect(intent.matchedKeywords).toContain("报错");
      expect(intent.matchedKeywords).toContain("为什么");
    });
  });

  // === character-scene 意图（2 用例） ===
  describe("character-scene 意图", () => {
    it("应识别 '用这个角色+场景' 为 character-scene", () => {
      const intent = routeIntent("用这个角色配这个场景");
      expect(intent.type).toBe("character-scene");
      expect(intent.matchedKeywords).toContain("用这个角色");
    });

    it("应识别 '角色和场景绑定' 为 character-scene", () => {
      const intent = routeIntent("我想做角色和场景的绑定");
      expect(intent.type).toBe("character-scene");
      expect(intent.matchedKeywords).toContain("角色和场景");
    });
  });

  // === cinematographer 意图（2 用例） ===
  describe("cinematographer 意图", () => {
    it("应识别 '镜头调整' 为 cinematographer", () => {
      const intent = routeIntent("帮我调整镜头景别");
      expect(intent.type).toBe("cinematographer");
      expect(intent.matchedKeywords).toContain("镜头");
      expect(intent.matchedKeywords).toContain("景别");
    });

    it("应识别 '运镜调整' 为 cinematographer", () => {
      const intent = routeIntent("帮我调整运镜方式");
      expect(intent.type).toBe("cinematographer");
      expect(intent.matchedKeywords).toContain("运镜");
    });
  });

  // === api-helper 意图（2 用例） ===
  describe("api-helper 意图", () => {
    it("应识别 'API 怎么配置' 为 api-helper", () => {
      const intent = routeIntent("API 怎么配置");
      expect(intent.type).toBe("api-helper");
      expect(intent.matchedKeywords).toContain("api");
      expect(intent.matchedKeywords).toContain("配置");
    });

    it("应识别 '密钥设置' 为 api-helper", () => {
      const intent = routeIntent("密钥怎么设置");
      expect(intent.type).toBe("api-helper");
      expect(intent.matchedKeywords).toContain("密钥");
    });
  });

  // === video-completed 意图（2 用例） ===
  describe("video-completed 意图", () => {
    it("应识别 '视频好了吗' 为 video-completed", () => {
      const intent = routeIntent("视频好了吗？检查一下一致性");
      expect(intent.type).toBe("video-completed");
      expect(intent.matchedKeywords).toContain("视频好了");
      expect(intent.matchedKeywords).toContain("一致性");
      expect(intent.routeId).toBe("video-completed-route");
    });

    it("应识别 'QC 结果如何' 为 video-completed", () => {
      const intent = routeIntent("这个视频的 QC 结果如何");
      expect(intent.type).toBe("video-completed");
      expect(intent.matchedKeywords).toContain("qc");
    });
  });

  // === default 意图 ===
  describe("default 意图", () => {
    it("无关键词命中时返回 default", () => {
      const intent = routeIntent("你好，今天天气怎么样");
      expect(intent.type).toBe("default");
      expect(intent.confidence).toBe(0.0);
      expect(intent.matchedKeywords).toEqual([]);
      expect(intent.routeId).toBe("default-route");
    });

    it("空字符串返回 default", () => {
      const intent = routeIntent("");
      expect(intent.type).toBe("default");
    });
  });

  // === 优先级冲突 ===
  describe("优先级", () => {
    it("troubleshoot 优先于 cinematographer", () => {
      // "镜头" 命中 cinematographer，"不对" 命中 troubleshoot
      // troubleshoot 优先级更高
      const intent = routeIntent("镜头不对，生成失败了");
      expect(intent.type).toBe("troubleshoot");
    });

    it("troubleshoot 优先于 api-helper", () => {
      // "配置" 命中 api-helper，"问题" 命中 troubleshoot
      const intent = routeIntent("配置有问题");
      expect(intent.type).toBe("troubleshoot");
    });
  });

  // === 大小写不敏感 ===
  describe("大小写不敏感", () => {
    it("API 大写也能匹配 api-helper", () => {
      const intent = routeIntent("API KEY 怎么设置");
      expect(intent.type).toBe("api-helper");
    });

    it("Provider 大写也能匹配 api-helper", () => {
      const intent = routeIntent("Provider 配置");
      expect(intent.type).toBe("api-helper");
    });
  });

  // === mapIntentToSkillId ===
  describe("mapIntentToSkillId", () => {
    it.each([
      ["interview", "interview"],
      ["novel", "prompt"],
      ["troubleshoot", "troubleshoot"],
      ["character-scene", "characters"],
      ["cinematographer", "camera"],
      ["api-helper", "prompt"],
      ["video-completed", "qc"],
      ["default", "prompt"],
    ] as Array<[IntentType, string]>)(
      "意图 %s 映射到 Skill id %s",
      (intentType, expectedSkillId) => {
        expect(mapIntentToSkillId(intentType)).toBe(expectedSkillId);
      },
    );
  });

  // === listIntentTypes ===
  describe("listIntentTypes", () => {
    it("返回 7 种意图（不含 default）", () => {
      const types = listIntentTypes();
      expect(types).toHaveLength(7);
      expect(types).not.toContain("default");
      expect(types).toContain("interview");
      expect(types).toContain("novel");
      expect(types).toContain("troubleshoot");
      expect(types).toContain("character-scene");
      expect(types).toContain("cinematographer");
      expect(types).toContain("api-helper");
      expect(types).toContain("video-completed");
    });
  });
});

describe("intent-routes (buildRouteContext)", () => {
  it("interview 意图返回非空 systemPromptAddon 和 suggestedTools", () => {
    const intent = routeIntent("不知道拍什么");
    const ctx = buildRouteContext(intent, baseCtx);
    expect(ctx.systemPromptAddon).toContain("创意引导");
    expect(ctx.suggestedTools.length).toBeGreaterThan(0);
  });

  it("novel 意图返回小说导入指引", () => {
    const intent = routeIntent("把小说变成视频");
    const ctx = buildRouteContext(intent, baseCtx);
    expect(ctx.systemPromptAddon).toContain("小说导入");
    expect(ctx.suggestedTools).toContain("auto_create_from_novel");
  });

  it("troubleshoot 意图包含近期失败记录", () => {
    const intent = routeIntent("生成失败");
    const ctx: AgentContext = {
      ...baseCtx,
      recentFailures: [
        { dimension: "camera", issue: "镜头抖动" },
        { dimension: "lighting", issue: "光线太暗" },
      ],
    };
    const routeCtx = buildRouteContext(intent, ctx);
    expect(routeCtx.systemPromptAddon).toContain("镜头抖动");
    expect(routeCtx.systemPromptAddon).toContain("光线太暗");
    expect(routeCtx.suggestedTools).toContain("check_api_health");
  });

  it("troubleshoot 意图无失败记录时显示提示", () => {
    const intent = routeIntent("生成失败");
    const routeCtx = buildRouteContext(intent, baseCtx);
    expect(routeCtx.systemPromptAddon).toContain("未提供具体失败信息");
  });

  it("character-scene 意图返回绑定指引", () => {
    const intent = routeIntent("用这个角色配场景");
    const ctx = buildRouteContext(intent, baseCtx);
    expect(ctx.systemPromptAddon).toContain("角色场景绑定");
    expect(ctx.suggestedTools).toContain("bind_element_to_beat");
  });

  it("cinematographer 意图返回镜头调整指引", () => {
    const intent = routeIntent("镜头调整");
    const ctx = buildRouteContext(intent, baseCtx);
    expect(ctx.systemPromptAddon).toContain("镜头语言调整");
    expect(ctx.suggestedTools).toContain("update_shot_instruction");
  });

  it("api-helper 意图返回 API 配置指引", () => {
    const intent = routeIntent("API 配置");
    const ctx = buildRouteContext(intent, baseCtx);
    expect(ctx.systemPromptAddon).toContain("API 配置指引");
    expect(ctx.suggestedTools).toContain("set_api_config");
  });

  it("video-completed 意图返回 QC 检查指引", () => {
    const intent = routeIntent("视频好了吗？检查一致性");
    const ctx = buildRouteContext(intent, baseCtx);
    expect(ctx.systemPromptAddon).toContain("一致性 QC 检查");
    expect(ctx.suggestedTools).toContain("check_video_consistency");
    expect(ctx.suggestedTools).toContain("dispatch_video_fallback");
  });

  it("default 意图返回空 addon 和空 tools", () => {
    const intent = routeIntent("你好");
    const ctx = buildRouteContext(intent, baseCtx);
    expect(ctx.systemPromptAddon).toBe("");
    expect(ctx.suggestedTools).toEqual([]);
  });
});
