/**
 * Agent 会话搜索与导出服务（Task 4.9 子项 2）
 *
 * 设计原则：
 * - 纯函数实现，无 I/O 依赖，便于测试
 * - 搜索支持按标题和消息内容过滤
 * - 导出支持 JSON 和 Markdown 两种格式
 *
 * 不依赖 @/shared/file-http 或任何外部服务，输入输出明确。
 */

import type { AgentSession, AgentMessage } from "@/modules/agent";
import type { SessionListItem } from "./session-storage";

/**
 * 搜索会话列表项（仅按标题过滤，不加载会话内容）。
 *
 * 用于 SessionHistory 侧边栏的快速过滤，避免加载每个会话文件。
 * 大小写不敏感，空查询返回原列表。
 *
 * @param sessions 会话列表项
 * @param query 搜索关键词（trim 后为空则返回原列表）
 * @returns 过滤后的列表（保持原顺序）
 */
export function searchSessionList(
  sessions: readonly SessionListItem[],
  query: string,
): SessionListItem[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [...sessions];
  return sessions.filter((s) => s.title.toLowerCase().includes(trimmed));
}

/** 单条消息的搜索匹配结果 */
export interface MessageSearchMatch {
  messageId: string;
  /** 匹配的消息片段（上下文窗口，便于 UI 高亮显示） */
  snippet: string;
  /** snippet 中匹配关键词的起始偏移 */
  matchOffset: number;
}

/** 会话搜索结果（含匹配的消息列表） */
export interface SessionSearchResult {
  sessionId: string;
  sessionTitle: string;
  /** 标题是否匹配（用于 UI 区分"标题命中"和"内容命中"） */
  titleMatched: boolean;
  /** 内容匹配的消息（按时间顺序） */
  messageMatches: MessageSearchMatch[];
}

/**
 * 在单个会话中搜索消息内容。
 *
 * - 大小写不敏感
 * - 空查询返回 null（调用方应跳过）
 * - snippet 长度固定为 SNIPPET_CONTEXT_CHARS * 2 + query.length，超过则截取上下文
 * - tool 角色的消息也会被搜索（包含工具执行结果）
 *
 * @param session 完整会话对象
 * @param query 搜索关键词
 * @returns 匹配结果；无匹配返回 null
 */
export function searchInSession(
  session: AgentSession,
  query: string,
): SessionSearchResult | null {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return null;

  const titleMatched = session.title.toLowerCase().includes(trimmed);
  const messageMatches: MessageSearchMatch[] = [];

  for (const msg of session.messages) {
    const match = searchInMessage(msg, trimmed);
    if (match) messageMatches.push(match);
  }

  if (!titleMatched && messageMatches.length === 0) return null;

  return {
    sessionId: session.id,
    sessionTitle: session.title,
    titleMatched,
    messageMatches,
  };
}

/** 单条消息上下文窗口字符数（前后各取这么多字符） */
const SNIPPET_CONTEXT_CHARS = 40;

/** 在单条消息中搜索关键词 */
function searchInMessage(
  msg: AgentMessage,
  lowerQuery: string,
): MessageSearchMatch | null {
  const content = msg.content ?? "";
  if (!content) return null;
  const lower = content.toLowerCase();
  const idx = lower.indexOf(lowerQuery);
  if (idx < 0) return null;

  const start = Math.max(0, idx - SNIPPET_CONTEXT_CHARS);
  const end = Math.min(content.length, idx + lowerQuery.length + SNIPPET_CONTEXT_CHARS);
  const snippet = (start > 0 ? "…" : "") + content.slice(start, end) + (end < content.length ? "…" : "");
  const matchOffset = (start > 0 ? 1 : 0) + (idx - start);

  return {
    messageId: msg.id,
    snippet,
    matchOffset,
  };
}

/**
 * 批量搜索多个会话。
 *
 * 用于"全局搜索历史消息"功能：加载所有会话后逐一搜索。
 * 调用方负责加载会话列表（loadSession），本函数仅做纯过滤。
 *
 * @param sessions 完整会话对象数组
 * @param query 搜索关键词
 * @returns 匹配的会话列表（无匹配返回空数组）
 */
export function searchAcrossSessions(
  sessions: readonly AgentSession[],
  query: string,
): SessionSearchResult[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const results: SessionSearchResult[] = [];
  for (const s of sessions) {
    const r = searchInSession(s, trimmed);
    if (r) results.push(r);
  }
  return results;
}

// ============= 导出功能 =============

/** 导出格式 */
export type ExportFormat = "json" | "markdown";

/** 生成导出文件名（不含扩展名） */
export function buildExportFilename(session: AgentSession, format: ExportFormat): string {
  // 清理标题中的非法文件名字符
  const safeTitle = (session.title || "agent-session")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .slice(0, 60)
    .trim() || "agent-session";
  const date = new Date(session.updatedAt || session.createdAt);
  const pad = (n: number) => String(n).padStart(2, "0");
  const dateStr = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
  const ext = format === "json" ? "json" : "md";
  return `${safeTitle}-${dateStr}.${ext}`;
}

/**
 * 将会话序列化为 JSON 字符串。
 *
 * 剔除 streaming 等运行时临时字段（与 saveSession 行为一致），
 * 保留所有持久化字段（含 conversationSummary/checkpoint）。
 */
export function serializeSessionAsJSON(session: AgentSession): string {
  const serializable: AgentSession = {
    ...session,
    messages: session.messages.map((m) => ({ ...m, streaming: false })),
  };
  return JSON.stringify(serializable, null, 2);
}

/**
 * 将会话序列化为 Markdown 字符串。
 *
 * 格式：
 * ```
 * # {会话标题}
 *
 * > 创建：YYYY-MM-DD HH:mm:ss · 更新：YYYY-MM-DD HH:mm:ss · 消息数：N
 *
 * ---
 *
 * ## 👤 用户
 *
 * {消息内容}
 *
 * ## 🤖 助手
 *
 * {消息内容}
 *
 * ## 🔧 工具调用：{toolName}
 *
 * {消息内容或错误信息}
 *
 * ---
 * ```
 *
 * tool 消息若含 error 字段，会额外输出"⚠️ 错误：{error}"。
 */
export function serializeSessionAsMarkdown(session: AgentSession): string {
  const lines: string[] = [];
  const title = session.title || "Agent 会话";
  lines.push(`# ${title}`, "");

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  lines.push(
    `> 创建：${formatDate(session.createdAt)} · 更新：${formatDate(session.updatedAt)} · 消息数：${session.messages.length}`,
    "",
    "---",
    "",
  );

  for (const msg of session.messages) {
    const header = getMessageMarkdownHeader(msg);
    lines.push(`## ${header}`, "");
    if (msg.content) {
      lines.push(msg.content, "");
    }
    if (msg.toolCalls && msg.toolCalls.length > 0) {
      for (const tc of msg.toolCalls) {
        // ToolCall 类型为 { id, function: { name, arguments } }，arguments 是 JSON 字符串
        let parsedArgs: unknown = tc.function.arguments;
        try {
          parsedArgs = JSON.parse(tc.function.arguments);
        } catch {
          // 非 JSON 时保留原始字符串
        }
        lines.push(
          `> 🔧 调用工具 \`${tc.function.name}\`：\n> \`\`\`json\n> ${JSON.stringify(parsedArgs, null, 2).split("\n").join("\n> ")}\n> \`\`\``,
          "",
        );
      }
    }
    if (msg.error) {
      lines.push(`> ⚠️ 错误：${msg.error}`, "");
    }
    lines.push("---", "");
  }

  return lines.join("\n");
}

/** 获取消息在 Markdown 中的角色图标和标题 */
function getMessageMarkdownHeader(msg: AgentMessage): string {
  switch (msg.role) {
    case "user":
      return "👤 用户";
    case "assistant":
      return "🤖 助手";
    case "tool":
      return `🔧 工具调用${msg.toolName ? `：${msg.toolName}` : ""}`;
    default:
      return `💬 ${msg.role}`;
  }
}
