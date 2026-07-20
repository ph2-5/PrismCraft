/**
 * AgentContext 构建器
 *
 * 为 AgentLoop 的 Skill 路由提供 enriched AgentContext：
 *   - projectType: 从当前 Story 的 genre 字段推断（古代/现代/科幻/奇幻）
 *   - recentFailures: 从 audit-log 查询最近的失败工具调用并推断失败维度
 *
 * 设计独立模块：避免向 agent-loop.ts（已 635 行）添加代码触发 max-lines 警告。
 *
 * 失败维度推断规则（FailureDimension 映射）：
 *   - 工具名包含 generate_video/video → "motion" | "camera" | "composition"
 *   - 工具名包含 generate_image/image → "composition" | "lighting"
 *   - 工具名包含 character → "character"
 *   - 工具名包含 audio/music/voice → "audio"
 *   - 安全相关错误（含 "safety"/"ip"/"policy"） → "safety"
 *   - 默认 → "composition"
 */

import type { AgentContext, ProjectType, FailureContext, FailureDimension } from "@/shared-logic/prompt";
import { errorLogger } from "@/shared/error-logger";

/** Story.genre → ProjectType 映射关键词 */
const GENRE_KEYWORDS: Array<{ keywords: string[]; type: ProjectType }> = [
  { keywords: ["古", "武侠", "仙侠", "历史", "宫廷", "古装", "ancient", "wuxia"], type: "ancient" },
  { keywords: ["科幻", "未来", "赛博", "太空", "机甲", "scifi", "sci-fi", "cyberpunk", "future"], type: "scifi" },
  { keywords: ["奇幻", "魔法", "玄幻", "神话", "fantasy", "magic"], type: "fantasy" },
  { keywords: ["现代", "都市", "日常", "青春", "modern", "urban", "contemporary"], type: "modern" },
];

/** 从 Story.genre 字符串推断 ProjectType */
export function inferProjectType(genre: string | undefined | null): ProjectType {
  if (!genre) return "unknown";
  const lower = genre.toLowerCase();
  for (const { keywords, type } of GENRE_KEYWORDS) {
    if (keywords.some((k) => lower.includes(k.toLowerCase()))) {
      return type;
    }
  }
  return "unknown";
}

/** 失败维度推断规则表（按优先级排序，安全类最高） */
const FAILURE_DIMENSION_RULES: Array<{ dimension: FailureDimension; keywords: string[] }> = [
  { dimension: "safety", keywords: ["safety", "ip ", "policy", "违规", "敏感"] },
  { dimension: "audio", keywords: ["audio", "music", "voice", "音频", "音乐"] },
  { dimension: "character", keywords: ["character", "角色", "face", "面部"] },
  { dimension: "lighting", keywords: ["lighting", "光照", "光线"] },
  { dimension: "camera", keywords: ["camera", "镜头", "摄像机"] },
  { dimension: "duration", keywords: ["duration", "时长", "长度"] },
  { dimension: "motion", keywords: ["motion", "运动", "动作", "video", "视频"] },
];

/** 从工具名 + 错误信息推断失败维度（按规则表顺序匹配，默认 composition） */
function inferFailureDimension(toolName: string, errorMessage: string): FailureDimension {
  const text = `${toolName} ${errorMessage}`.toLowerCase();
  for (const rule of FAILURE_DIMENSION_RULES) {
    if (rule.keywords.some((k) => text.includes(k.toLowerCase()))) {
      return rule.dimension;
    }
  }
  return "composition";
}

/** 从 audit-log 条目提取失败上下文（最多 N 条） */
async function loadRecentFailures(sessionId: string, limit = 3): Promise<FailureContext[]> {
  try {
    const { queryAuditLogs } = await import("@/modules/audit-log");
    const failedEntries = await queryAuditLogs({
      sessionId,
      success: false,
      limit: limit * 2, // 多取一些以过滤后仍有足够数量
    });
    return failedEntries.slice(0, limit).map((entry) => ({
      dimension: inferFailureDimension(entry.toolName, entry.error ?? ""),
      issue: entry.error ?? `工具 ${entry.toolName} 执行失败`,
      // argsJson 已是 JSON 字符串，直接截断使用
      prompt: entry.argsJson ? entry.argsJson.slice(0, 200) : undefined,
    }));
  } catch (e) {
    errorLogger.debug("[AgentContextBuilder] 加载 recentFailures 失败", e);
    return [];
  }
}

/**
 * 为 Skill 路由构建 enriched AgentContext。
 *
 * @param userMessage 用户当前消息
 * @param sessionId 当前 Agent 会话 ID（用于查询 audit-log）
 * @returns 包含 projectType 和 recentFailures 的 AgentContext
 */
export async function buildSkillContext(
  userMessage: string,
  sessionId: string,
): Promise<AgentContext> {
  const [projectType, recentFailures] = await Promise.all([
    inferProjectTypeFromStories(),
    loadRecentFailures(sessionId),
  ]);
  return {
    userMessage,
    projectType,
    recentFailures,
  };
}

/** 查询当前 Story 列表，取最近更新的 genre 推断 projectType */
async function inferProjectTypeFromStories(): Promise<ProjectType> {
  try {
    const { storyService } = await import("@/modules/storyboard");
    const result = await storyService.getAll();
    if (!result.ok || result.value.length === 0) return "unknown";
    // 取最近更新的 Story（按 updatedAt 降序）
    const sorted = [...result.value].sort((a, b) => b.updatedAt - a.updatedAt);
    const latest = sorted[0];
    if (!latest) return "unknown";
    return inferProjectType(latest.genre);
  } catch (e) {
    errorLogger.debug("[AgentContextBuilder] 查询 Story 推断 projectType 失败", e);
    return "unknown";
  }
}
