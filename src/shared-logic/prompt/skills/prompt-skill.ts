/**
 * Prompt Skill — 清晰概念 → 完整结构化 prompt（Task 1.4 v5.3 增强）
 *
 * 借鉴 seedance-2.0（MIT 许可）的 seedance-prompt SKILL 模式。
 *
 * 触发场景：用户概念清晰（默认 fallback，无 matchers）。
 * 行为：构建完整结构化 prompt（主体 + 动作 + 环境 + 风格 + 镜头 + 时长），
 *       作为默认 Skill 在 routeSkill 无其他命中时返回。
 *
 * 本文件属于 shared-logic 层，零外部依赖。
 */

import type { AgentContext, Skill } from "./index";

export const promptSkill: Skill = {
  id: "prompt",
  matchers: [], // 空 matchers，作为默认 fallback

  buildInstructions(ctx: AgentContext): string {
    const projectTypeHint = ctx.projectType && ctx.projectType !== "unknown"
      ? `\n- 项目类型：${ctx.projectType}（古装→文言点缀；现代→口语化；科幻→技术术语；奇幻→史诗感）`
      : "";

    return [
      "## 当前模式：结构化 Prompt 构建（Prompt）",
      "",
      "用户概念较为清晰，请按以下 6 段式结构化模板构建完整 prompt：",
      "",
      "1. **主体（Subject）**：核心角色/物体的外观描述（性别/年龄/服饰/发型/表情）",
      "2. **动作（Action）**：主体正在做什么（具体动词 + 动作幅度 + 速度）",
      "3. **环境（Environment）**：场景设定（地点/时间/天气/氛围元素）",
      "4. **风格（Style）**：视觉风格关键词（写实/动画/水墨/赛博朋克/电影质感）",
      "5. **镜头（Camera）**：景别 + 运镜 + 角度（如「中景，缓慢推进，平视」）",
      "6. **时长（Duration）**：视频时长（如 5s/10s/15s）",
      "",
      "构建规则：",
      "- 每段以逗号分隔，整体不超过 150 词",
      "- 优先使用具体视觉描述，避免空泛词汇（如「masterpiece」「best quality」）",
      "- 镜头语言需与情绪匹配（紧张→手持/快推；宁静→固定/慢推）",
      "- 涉及角色时，明确身份特征（发型/服饰/体型），确保跨镜头一致性",
      "- 涉及多人镜头时，说明站位关系与视线方向",
      projectTypeHint,
    ].filter(Boolean).join("\n");
  },
};
