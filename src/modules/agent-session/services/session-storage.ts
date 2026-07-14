/**
 * 会话持久化服务（SessionStorage）
 *
 * 设计要点：
 * - 会话保存到缓存目录的 agent/sessions/ 子目录
 * - 每个会话一个 JSON 文件，文件名 = sessionId.json
 * - 支持列出/加载/删除历史会话
 * - 保存时剔除 streaming 状态等临时字段
 * - 加载时重置 streaming=false（断点续接时上次的流式状态无意义）
 * - 通过 @/shared/file-http 统一层读写，不直接调 IPC
 *
 * 从 @/modules/agent/services/ 迁移至 @/modules/agent-session（阶段2-b）
 */

import type { AgentSession } from "@/modules/agent";
import { writeFile, readFile, getCacheDirectory, deleteFile } from "@/shared/file-http";

/** 会话存储目录名（相对缓存目录） */
const SESSIONS_DIR = "agent/sessions";

/** 会话列表项（精简字段，用于侧边栏展示） */
export interface SessionListItem {
  id: string;
  title: string;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
}

/** 获取会话目录绝对路径 */
async function getSessionsDir(): Promise<string | null> {
  const result = await getCacheDirectory();
  if (!result.success || !result.path) return null;
  return `${result.path}/${SESSIONS_DIR}`;
}

/** 获取单个会话文件绝对路径 */
async function getSessionFilePath(sessionId: string): Promise<string | null> {
  const dir = await getSessionsDir();
  if (!dir) return null;
  return `${dir}/${sessionId}.json`;
}

/** 保存会话到本地（覆盖同名文件） */
export async function saveSession(session: AgentSession): Promise<boolean> {
  const filePath = await getSessionFilePath(session.id);
  if (!filePath) return false;

  // 剔除临时字段，重置 streaming 状态
  const serializable: AgentSession = {
    ...session,
    messages: session.messages.map((m) => ({
      ...m,
      streaming: false, // 持久化时重置流式状态
    })),
  };

  try {
    const jsonStr = JSON.stringify(serializable, null, 2);
    const result = await writeFile(filePath, jsonStr);
    return result.success;
  } catch {
    return false;
  }
}

/** 加载单个会话 */
export async function loadSession(sessionId: string): Promise<AgentSession | null> {
  const filePath = await getSessionFilePath(sessionId);
  if (!filePath) return null;

  try {
    const result = await readFile(filePath);
    if (!result?.success || !result.data) return null;
    const text = new TextDecoder().decode(result.data);
    const session = JSON.parse(text) as AgentSession;
    // 加载时重置 streaming 状态（上次中断的流式状态无意义）
    session.messages = session.messages.map((m) => ({ ...m, streaming: false }));
    return session;
  } catch {
    return null;
  }
}

/** 列出所有历史会话（按 updatedAt 倒序） */
export async function listSessions(): Promise<SessionListItem[]> {
  // file-http 没有列出目录的能力，通过配置项记录会话列表索引
  // 简化方案：用 getConfig 读取会话索引数组
  const { getConfig } = await import("@/shared/file-http");
  const raw = await getConfig("agent.sessionIndex");
  if (!Array.isArray(raw)) return [];

  const items: SessionListItem[] = [];
  for (const item of raw as Array<Record<string, unknown>>) {
    if (
      item &&
      typeof item.id === "string" &&
      typeof item.title === "string" &&
      typeof item.updatedAt === "number"
    ) {
      items.push({
        id: item.id,
        title: item.title,
        messageCount: typeof item.messageCount === "number" ? item.messageCount : 0,
        createdAt: typeof item.createdAt === "number" ? item.createdAt : 0,
        updatedAt: item.updatedAt,
      });
    }
  }

  // 按 updatedAt 倒序
  items.sort((a, b) => b.updatedAt - a.updatedAt);
  return items;
}

/** 更新会话索引（保存会话后调用） */
export async function updateSessionIndex(session: AgentSession): Promise<void> {
  const { getConfig, setConfig } = await import("@/shared/file-http");
  const raw = await getConfig("agent.sessionIndex");
  const items: Array<Record<string, unknown>> = Array.isArray(raw) ? [...raw] : [];

  // 移除同 id 的旧记录
  const filtered = items.filter((item) => item.id !== session.id);

  // 追加新记录
  filtered.push({
    id: session.id,
    title: session.title,
    messageCount: session.messages.length,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  });

  // 保留最近 50 条
  filtered.sort((a, b) => (b.updatedAt as number) - (a.updatedAt as number));
  const trimmed = filtered.slice(0, 50);

  await setConfig("agent.sessionIndex", trimmed);
}

/** 删除会话 */
export async function deleteSession(sessionId: string): Promise<boolean> {
  const filePath = await getSessionFilePath(sessionId);
  if (!filePath) return false;

  // 删除会话文件
  try {
    await deleteFile(filePath);
  } catch {
    // 文件不存在不算失败
  }

  // 从索引中移除
  const { getConfig, setConfig } = await import("@/shared/file-http");
  const raw = await getConfig("agent.sessionIndex");
  if (Array.isArray(raw)) {
    const filtered = (raw as Array<Record<string, unknown>>).filter(
      (item) => item.id !== sessionId,
    );
    await setConfig("agent.sessionIndex", filtered);
  }

  return true;
}

/** 保存会话并更新索引（组合操作） */
export async function persistSession(session: AgentSession): Promise<boolean> {
  const saved = await saveSession(session);
  if (saved) {
    await updateSessionIndex(session);
  }
  return saved;
}
