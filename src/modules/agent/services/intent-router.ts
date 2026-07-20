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
  | "video-completed" // "视频好了吗" / "检查一致性" → QC 流程
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
  "video-completed": [
    "视频好了",
    "视频完成",
    "生成完成",
    "生成完了",
    "一致性",
    "漂移",
    "qc",
    "检查视频",
    "视频质量",
    "重新检查",
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
  "video-completed": "qc", // video-completed 映射到 qc skill（P2 集成）
  default: "prompt",
};

// === 意图 → 工具集映射（P3 动态工具过滤） ===

/**
 * 每个意图对应的「允许工具名列表」。
 *
 * - `undefined`：使用全部已注册工具（保持现有行为，适用于工具需求不明确的意图）
 * - `string[]`：仅向 LLM 暴露这些工具（缩小选择空间，提高调用准确性）
 *
 * 设计原则（保守策略）：
 * 1. 只对「工具需求明确且封闭」的意图限制工具集
 * 2. 对「可能需要任意工具」的意图保持 undefined
 * 3. 列表中的工具必须在 toolRegistry 中已注册（未注册的会被静默忽略）
 *
 * 当前限制的意图：
 * - video-completed：QC 流程，只需 QC + 视频任务查询工具
 *   理由：QC Skill 明确指导调用 check_video_consistency / dispatch_video_fallback，
 *         无需暴露生成、编辑、音频等无关工具，避免 LLM 误调
 */
const INTENT_TO_TOOL_SET: Record<IntentType, string[] | undefined> = {
  interview: undefined, // 引导式访谈，工具需求不确定
  novel: undefined, // 小说导入，可能涉及多种工具
  troubleshoot: undefined, // 诊断，可能需要查看任意状态
  "character-scene": undefined, // 角色场景绑定，工具需求广泛
  cinematographer: undefined, // 镜头调整，可能需要 shot 工具
  "api-helper": undefined, // API 配置，可能需要 config 工具
  "video-completed": [
    "check_video_consistency", // QC 核心工具：检查视频一致性
    "dispatch_video_fallback", // QC 核心工具：触发 fallback（regenerate/face_swap/manual_review）
    "list_video_tasks", // 查询最近完成的视频任务
    "get_video_task", // 获取单个视频任务详情
    "query_video_status", // 查询视频任务状态
  ],
  default: undefined, // 默认意图，使用全部工具
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
    "video-completed", // 视频完成/QC 检查（含"QC"/"一致性"等明确关键词）
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
 * 将意图映射到「允许的工具名列表」（P3 动态工具过滤）。
 *
 * 返回值含义：
 * - `undefined`：使用全部已注册工具（保持现有行为）
 * - `string[]`：仅向 LLM 暴露这些工具
 *
 * agent-loop.ts 在 buildSystemPrompt 中根据意图调用此函数，
 * 设置当前轮次的工具过滤器，streamLLM 和 buildSystemPrompt 优先使用它。
 *
 * @param intentType 意图类别
 * @returns 允许的工具名列表，或 undefined 表示不限制
 */
export function mapIntentToToolSet(intentType: IntentType): string[] | undefined {
  return INTENT_TO_TOOL_SET[intentType];
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
    "video-completed",
    "api-helper",
  ];
}

// === LLM Fallback ===

/**
 * LLM 意图分类器接口。
 *
 * 调用方负责实现具体的 LLM 调用（封装 textProvider.generateText），
 * intent-router 本身不依赖 infrastructure，保持纯函数 + 可测试。
 *
 * 返回 null 表示 LLM 分类失败或无置信结果，调用方应回退到 default。
 */
export type IntentClassifier = (
  userMessage: string,
) => Promise<{ type: Exclude<IntentType, "default">; confidence: number } | null>;

/**
 * 带关键词匹配 + LLM fallback 的意图识别。
 *
 * 流程：
 * 1. 优先调用 routeIntent 做关键词匹配（confidence=1.0，零成本）
 * 2. 关键词无命中（返回 default）且提供 classifier 时，调用 LLM 做分类
 * 3. LLM 分类失败或未提供 classifier → 保持 default
 *
 * @param userMessage 用户输入
 * @param classifier 可选的 LLM 分类器（仅在关键词无命中时调用，控制成本）
 */
export async function routeIntentWithLlmFallback(
  userMessage: string,
  classifier?: IntentClassifier,
): Promise<Intent> {
  const keywordIntent = routeIntent(userMessage);
  if (keywordIntent.type !== "default" || !classifier) {
    return keywordIntent;
  }

  try {
    const llmResult = await classifier(userMessage);
    if (!llmResult || llmResult.confidence < 0.5) {
      return keywordIntent;
    }
    return {
      type: llmResult.type,
      confidence: llmResult.confidence,
      matchedKeywords: [],
      routeId: `${llmResult.type}-route`,
    };
  } catch {
    return keywordIntent;
  }
}

/** LLM 意图分类提示词模板（供调用方复用，避免重复构造） */
export function buildIntentClassificationPrompt(userMessage: string): string {
  return [
    "你是一个意图分类器。请将用户消息分类到以下意图之一：",
    "- interview: 用户想做视频但不知道拍什么，需要引导式访谈",
    "- novel: 用户想将小说/故事文本变成视频",
    "- troubleshoot: 用户报告生成失败、报错或异常，需要诊断",
    '- character-scene: 用户想用特定角色+场景组合（含"用这个角色"等）',
    "- cinematographer: 用户想调整镜头/运镜/构图/景别",
    "- api-helper: 用户询问 API 配置/密钥设置/provider 连接",
    "- video-completed: 用户询问视频是否完成、检查一致性/QC",
    "",
    `用户消息：${userMessage}`,
    "",
    '请只返回 JSON 格式：{"type": "<intent>", "confidence": <0-1>}',
    "不要包含任何其他文字、解释或 markdown 标记。",
  ].join("\n");
}

/** 解析 LLM 意图分类返回的 JSON（容错处理） */
export function parseIntentJson(
  raw: string,
): { type: Exclude<IntentType, "default">; confidence: number } | null {
  try {
    // 容错：LLM 可能包裹 ```json ... ``` 或多余文字
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as { type?: string; confidence?: number };
    if (typeof parsed.type !== "string" || typeof parsed.confidence !== "number") {
      return null;
    }
    // 校验 type 是合法意图
    const validTypes: ReadonlyArray<Exclude<IntentType, "default">> = [
      "interview",
      "novel",
      "troubleshoot",
      "character-scene",
      "cinematographer",
      "api-helper",
      "video-completed",
    ];
    if (!validTypes.includes(parsed.type as Exclude<IntentType, "default">)) {
      return null;
    }
    const confidence = Math.max(0, Math.min(1, parsed.confidence));
    return {
      type: parsed.type as Exclude<IntentType, "default">,
      confidence,
    };
  } catch {
    return null;
  }
}
