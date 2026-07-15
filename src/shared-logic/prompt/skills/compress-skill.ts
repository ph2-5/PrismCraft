/**
 * Compress Skill — 长 prompt → 30-100 词压缩版（Task 1.4 v5.3 增强）
 *
 * 借鉴 seedance-2.0（MIT 许可）的 seedance-prompt-short SKILL 模式。
 *
 * 触发场景：用户要求压缩/精简/缩短 prompt，或当前 prompt 过长。
 * 行为：将长 prompt 压缩到 30-100 词，保留关键视觉元素，丢弃冗余修饰。
 *
 * 本文件属于 shared-logic 层，零外部依赖。
 */

import type { AgentContext, Skill } from "./index";

export const compressSkill: Skill = {
  id: "compress",
  matchers: [
    "压缩",
    "精简",
    "缩短",
    "太长",
    "简洁",
    "简短",
    "condense",
    "compress",
    "shorten",
    "brief",
  ],

  buildInstructions(_ctx: AgentContext): string {
    return [
      "## 当前模式：Prompt 压缩（Compress）",
      "",
      "用户要求压缩 prompt。请将原 prompt 压缩到 **30-100 词**，遵循以下规则：",
      "",
      "压缩优先级（从高到低，必须保留）：",
      "1. **主体身份**：角色性别/年龄/服饰/发型（跨镜头一致性依赖）",
      "2. **核心动作**：主体正在做什么（具体动词）",
      "3. **场景类型**：室内/室外 + 时间（白天/夜晚）",
      "4. **镜头语言**：景别 + 运镜（如「中景推近」）",
      "5. **视觉风格**：1-2 个风格关键词（如「写实电影感」）",
      "",
      "可丢弃的冗余元素：",
      "- 空泛质量词（masterpiece/best quality/4k/8k/highly detailed）",
      "- 重复修饰（如「美丽的漂亮的」二选一）",
      "- 过度详细的环境描写（保留 1-2 个关键氛围词即可）",
      "- 情绪解释（让画面自己说话，如「温馨的氛围」可删）",
      "",
      "压缩规则：",
      "- 压缩后保持中文语义完整，不要硬翻为英文再压",
      "- 不要丢失主体身份特征（否则跨镜头不一致）",
      "- 镜头语言至少保留景别 + 1 个运镜",
      "- 风格关键词不超过 2 个",
      "- 输出格式：直接给出压缩后的 prompt，无需解释压缩了什么",
    ].join("\n");
  },
};
