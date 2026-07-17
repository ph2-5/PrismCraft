/**
 * Task 1.12：意图路由表 — 意图识别器
 *
 * 作用：在 routeSkill 之上增加一层"用户意图分类"，用于：
 * 1. UI 层提示用户当前识别到的意图类别（如显示快捷按钮高亮）
 * 2. 日志记录意图分布，便于后续优化 routeSkill 的 matcher
 * 3. 为 route 文件提供统一的 Intent 类型入口
 *
 * 与 routeSkill 的关系：
 * - routeIntent 识别"用户意图类别"（interview/novel/troubleshoot/...）
 * - routeSkill 是底层执行，根据意图加载对应 Skill 指令
 * - mapIntentToSkillId 将意图映射到 Skill id，供 agent-loop 调用 getSkill
 *
 * 匹配策略（两层）：
 * 1. 关键词匹配（快速，当前实现）
 * 2. LLM fallback（TODO：当关键词都不匹配时，调用小型 LLM 做意图分类）
 */

// === 意图类型定义 ===

export type IntentType =
  | "interview" // "我想做视频但不知道拍什么" → interview-skill
  | "novel" // "把这段小说变成视频" → novel 工作流
  | "troubleshoot" // "这个生成失败了" → troubleshoot-skill
  | "character-scene" // "用这个角色+这个场景" → 角色场景绑定
  | "cinematographer" // "这个镜头感觉不对" → 镜头参数调整
  | "api-helper" // "API 怎么配置" → 配置指引
  | "default"; // 无关键词命中，走 default route

export interface Intent {
  /** 识别到的意图类别 */
  type: IntentType;
  /** 置信度 0-1，关键词匹配为 1.0，LLM fallback 按返回值 */
  confidence: number;
  /** 命中的关键词列表（小写） */
  matchedKeywords: string[];
  /** 对应的 route 文件 id */
  routeId: string;
}

// === 关键词匹配表 ===

const KEYWORD_MATCHERS: Record<Exclude<IntentType, "default">, string[]> = {
  interview: [
    "不知道拍什么",
    "想做视频",
    "给点灵感",
    "帮我想",
    "创意",
    "建议",
    " brainstorm",
  ],
  novel: [
    "小说",
    "导入故事",
    "把这段",
    "变成视频",
    "故事文本",
    "章节",
    "叙事",
  ],
  troubleshoot: [
    "失败",
    "报错",
    "不对",
    "奇怪",
    "为什么",
    "修复",
    "诊断",
    "错误",
    "问题",
    "异常",
  ],
  "character-scene": [
    "用这个角色",
    "这个场景",
    "角色+场景",
    "角色和场景",
    "绑定角色",
    "绑定场景",
    "搭配",
  ],
  cinematographer: [
    "镜头",
    "运镜",
    "构图",
    "景别",
    "视角",
    "拍摄角度",
    "摄像机",
    "推拉摇移",
  ],
  "api-helper": [
    "api",
    "密钥",
    "配置",
    "怎么设置",
    "怎么连接",
    "provider",
    "模型配置",
    "api key",
  ],
};

// === 意图 → Skill id 映射 ===

const INTENT_TO_SKILL_ID: Record<IntentType, string> = {
  interview: "interview",
  novel: "prompt", // novel 意图复用 prompt skill 作为基础指令
  troubleshoot: "troubleshoot",
  "character-scene": "characters", // 对应扩展 Skill: charactersSkill
  cinematographer: "camera", // 对应扩展 Skill: cameraSkill
  "api-helper": "prompt", // api-helper 复用 prompt skill，route 文件提供额外指引
  default: "prompt",
};

// === 核心函数 ===

/**
 * 识别用户消息的意图类别。
 *
 * 匹配顺序：
 * 1. 遍历 KEYWORD_MATCHERS（顺序决定优先级：troubleshoot > novel > interview > ...）
 * 2. 无命中时返回 default 意图
 *
 * TODO（未来增强）：当关键词都不匹配时，可调用小型 LLM 做意图分类，
 * 当前版本仅用关键词匹配，足以覆盖 80%+ 常见场景。
 *
 * @param userMessage 用户输入的消息
 * @returns 识别到的意图
 */
export function routeIntent(userMessage: string): Intent {
  const msg = userMessage.toLowerCase();

  // 按优先级遍历各意图的关键词表
  const intentOrder: Array<Exclude<IntentType, "default">> = [
    "troubleshoot", // 诊断/报错优先级最高
    "novel", // 小说导入次之（含明确"小说"关键词）
    "interview", // 引导式
    "character-scene", // 角色场景绑定
    "cinematographer", // 镜头调整
    "api-helper", // API 配置
  ];

  for (const intentType of intentOrder) {
    const keywords = KEYWORD_MATCHERS[intentType];
    const matched = keywords.filter((k) => msg.includes(k.toLowerCase()));
    if (matched.length > 0) {
      return {
        type: intentType,
        confidence: 1.0,
        matchedKeywords: matched,
        routeId: `${intentType}-route`,
      };
    }
  }

  // 无关键词命中，返回 default 意图
  return {
    type: "default",
    confidence: 0.0,
    matchedKeywords: [],
    routeId: "default-route",
  };
}

/**
 * 将意图映射到对应的 Skill id。
 *
 * agent-loop.ts 可用此函数替代直接调用 routeSkill：
 * ```ts
 * const intent = routeIntent(userMessage);
 * const skillId = mapIntentToSkillId(intent.type);
 * const skill = getSkill(skillId);
 * ```
 *
 * @param intentType 意图类别
 * @returns Skill id（如 "interview"、"troubleshoot"、"camera" 等）
 */
export function mapIntentToSkillId(intentType: IntentType): string {
  return INTENT_TO_SKILL_ID[intentType];
}

/**
 * 获取所有支持的意图类型列表（不含 default）。
 * 用于 UI 层渲染快捷按钮等场景。
 */
export function listIntentTypes(): Array<Exclude<IntentType, "default">> {
  return [
    "interview",
    "novel",
    "troubleshoot",
    "character-scene",
    "cinematographer",
    "api-helper",
  ];
}
