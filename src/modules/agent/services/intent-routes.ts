/**
 * Task 1.12：意图路由上下文构建器
 *
 * 每个意图对应一个 RouteContext，提供：
 * - systemPromptAddon：追加到 system prompt 的意图专属指引
 * - suggestedTools：推荐调用的工具名列表（供 UI 提示或日志记录）
 *
 * 注意：本文件仅提供路由上下文，不执行实际工具调用。
 * agent-loop.ts 调用流程：
 *   routeIntent(msg) → buildRouteContext(intent) → 拼接 systemPromptAddon → routeSkill/getSkill
 */

import type { Intent, IntentType } from "./intent-router";
import type { AgentContext } from "@/shared-logic/prompt";

export interface RouteContext {
  /** 追加到 system prompt 的意图专属指引 */
  systemPromptAddon: string;
  /** 推荐调用的工具名列表 */
  suggestedTools: string[];
}

// === 6 个 Route 的上下文构建器 ===

const interviewRouteContext = (): RouteContext => ({
  systemPromptAddon: [
    "【意图：创意引导】",
    "用户处于'有模糊想法但不知如何落地'的状态。",
    "请采用引导式提问，帮助用户明确：",
    "1. 视频类型（叙事/广告/教学/Vlog）",
    "2. 核心主题或情感基调",
    "3. 目标时长与受众",
    "4. 可用素材（角色/场景/道具）",
    "每次只问 1-2 个问题，避免信息过载。",
  ].join("\n"),
  suggestedTools: ["brainstorm_ideas", "suggest_story_templates"],
});

const novelRouteContext = (): RouteContext => ({
  systemPromptAddon: [
    "【意图：小说导入】",
    "用户希望将文本/小说内容转换为视频分镜。",
    "请引导用户提供：",
    "1. 小说文本（直接粘贴或上传文件）",
    "2. 期望的视频风格与时长",
    "3. 是否需要角色一致性绑定",
    "收到文本后，调用 auto_create_from_novel 工具启动解析流程。",
  ].join("\n"),
  suggestedTools: ["auto_create_from_novel", "parse_novel_chapters", "extract_characters"],
});

const troubleshootRouteContext = (ctx: AgentContext): RouteContext => {
  const failureList = ctx.recentFailures?.slice(0, 3) ?? [];
  const failureDesc = failureList.length > 0
    ? failureList.map((f, i) => `${i + 1}. [${f.dimension}] ${f.issue}`).join("\n")
    : "（用户未提供具体失败信息，请主动询问）";
  return {
    systemPromptAddon: [
      "【意图：故障诊断】",
      "用户遇到了生成失败或其他技术问题。",
      "近期失败记录：",
      failureDesc,
      "",
      "诊断步骤：",
      "1. 确认失败现象（什么操作 → 什么结果）",
      "2. 检查 API 配置与额度",
      "3. 分析 prompt 是否含违规内容",
      "4. 检查模型能力是否匹配（如首尾帧支持）",
    ].join("\n"),
    suggestedTools: ["check_api_health", "get_api_config", "diagnose_system"],
  };
};

const characterSceneRouteContext = (): RouteContext => ({
  systemPromptAddon: [
    "【意图：角色场景绑定】",
    "用户希望将特定角色与场景组合到分镜中。",
    "请确认：",
    "1. 角色列表（可多选）",
    "2. 场景列表（可多选）",
    "3. 期望的镜头数量与叙事顺序",
    "绑定后调用 generate_keyframe 生成关键帧，确保角色一致性。",
  ].join("\n"),
  suggestedTools: ["list_characters", "list_scenes", "bind_element_to_beat", "generate_keyframe"],
});

const cinematographerRouteContext = (): RouteContext => ({
  systemPromptAddon: [
    "【意图：镜头语言调整】",
    "用户希望调整镜头参数（景别/运镜/构图/视角）。",
    "可用调整维度：",
    "1. 景别：远景/全景/中景/近景/特写",
    "2. 运镜：固定/推拉/摇移/跟随/手持",
    "3. 构图：中心/三分法/对称/引导线",
    "4. 视角：平视/俯视/仰视/倾斜",
    "请根据用户描述推荐具体参数，并解释选择理由。",
  ].join("\n"),
  suggestedTools: ["update_shot_instruction", "recommend_shot_by_scene"],
});

const apiHelperRouteContext = (): RouteContext => ({
  systemPromptAddon: [
    "【意图：API 配置指引】",
    "用户需要配置 AI 服务提供商的 API。",
    "引导步骤：",
    "1. 确认要使用的 Provider（Kling/Pika/Runway/OpenAI 等）",
    "2. 指导用户在 Provider 官网获取 API Key",
    "3. 调用 set_api_config 工具保存配置",
    "4. 调用 check_api_health 验证连通性",
    "注意：API Key 通过系统级加密存储，不会明文显示。",
  ].join("\n"),
  suggestedTools: ["get_api_config", "set_api_config", "check_api_health", "list_providers"],
});

const defaultRouteContext = (): RouteContext => ({
  systemPromptAddon: "",
  suggestedTools: [],
});

// === 路由表 ===

const ROUTE_BUILDERS: Record<IntentType, (ctx: AgentContext) => RouteContext> = {
  interview: () => interviewRouteContext(),
  novel: () => novelRouteContext(),
  troubleshoot: (ctx) => troubleshootRouteContext(ctx),
  "character-scene": () => characterSceneRouteContext(),
  cinematographer: () => cinematographerRouteContext(),
  "api-helper": () => apiHelperRouteContext(),
  default: () => defaultRouteContext(),
};

// === 公共 API ===

/**
 * 根据意图构建路由上下文。
 *
 * @param intent routeIntent 返回的意图对象
 * @param ctx Agent 上下文（含 userMessage、recentFailures 等）
 * @returns 路由上下文（systemPromptAddon + suggestedTools）
 */
export function buildRouteContext(intent: Intent, ctx: AgentContext): RouteContext {
  const builder = ROUTE_BUILDERS[intent.type];
  return builder(ctx);
}
