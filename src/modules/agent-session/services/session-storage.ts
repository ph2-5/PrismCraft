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
import { errorLogger } from "@/shared/error-logger";

/** 会话存储目录名（相对缓存目录） */
const SESSIONS_DIR = "agent/sessions";

/**
 * 索引写入串行化链
 *
 * updateSessionIndex 与 deleteSession 中的索引移除都是 read-modify-write 模式，
 * 并发调用会相互覆盖。用 promise 链串行化所有索引写操作
 * （参考 memory-service.ts 的 archivalWriteChain）。
 */
let sessionIndexWriteChain: Promise<void> = Promise.resolve();

async function serializeSessionIndexWrite<T>(fn: () => Promise<T>): Promise<T> {
  const result = sessionIndexWriteChain.then(fn);
  sessionIndexWriteChain = result.then(() => undefined, () => undefined);
  return result;
}

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
  // P0-1 修复：safetyLog 是运行时字段（仅 AgentLoop 运行期间暂存用于 UI 展示），
  // 不参与持久化序列化。原 ...session 展开会把它写入磁盘，导致调试数据泄漏。
  // 详见 agent/domain/types.ts 中 safetyLog 字段注释。
  delete serializable.safetyLog;

  try {
    const jsonStr = JSON.stringify(serializable, null, 2);
    const result = await writeFile(filePath, jsonStr);
    if (!result.success) {
      // P1-5 修复：原 silent catch 吞掉错误，调用方无法感知失败。
      errorLogger.warn("[SessionStorage] saveSession writeFile 失败", { sessionId: session.id, error: result.error });
    }
    return result.success;
  } catch (e) {
    errorLogger.warn("[SessionStorage] saveSession 异常", { sessionId: session.id, cause: e });
    return false;
  }
}

/**
 * 校验解析后的会话对象是否具备 AgentSession 必需字段。
 *
 * P1-10 修复：原 loadSession 直接 `JSON.parse(text) as AgentSession`，
 * 文件损坏（截断/部分写入）时会返回结构不完整的对象，调用方访问 `messages.map` 抛 TypeError。
 * 此函数做最小必需字段校验，损坏时返回 false，由 loadSession 优雅降级。
 */
function isValidSessionShape(value: unknown): value is AgentSession {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== "string" || typeof v.title !== "string") return false;
  if (typeof v.createdAt !== "number" || typeof v.updatedAt !== "number") return false;
  if (!Array.isArray(v.messages)) return false;
  // 每条消息至少要有 role 和 content 字段
  for (const m of v.messages) {
    if (!m || typeof m !== "object") return false;
    const msg = m as Record<string, unknown>;
    if (typeof msg.role !== "string" || typeof msg.content !== "string") return false;
  }
  return true;
}

/** 加载单个会话 */
export async function loadSession(sessionId: string): Promise<AgentSession | null> {
  const filePath = await getSessionFilePath(sessionId);
  if (!filePath) return null;

  try {
    const result = await readFile(filePath);
    if (!result?.success || !result.data) return null;
    const text = new TextDecoder().decode(result.data);
    const parsed: unknown = JSON.parse(text);
    // P1-10 修复：schema 校验，防止文件损坏时返回结构不完整的对象
    if (!isValidSessionShape(parsed)) {
      errorLogger.warn("[SessionStorage] loadSession 文件结构损坏", { sessionId, filePath });
      return null;
    }
    const session = parsed as AgentSession;
    // 加载时重置 streaming 状态（上次中断的流式状态无意义）
    session.messages = session.messages.map((m) => ({ ...m, streaming: false }));
    return session;
  } catch (e) {
    // P1-5 修复：原 silent catch 吞掉错误，调用方无法区分"文件不存在"和"文件损坏"
    errorLogger.warn("[SessionStorage] loadSession 异常", { sessionId, cause: e });
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
  await serializeSessionIndexWrite(async () => {
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
  });
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

  // 从索引中移除（串行化以防并发覆盖）
  await serializeSessionIndexWrite(async () => {
    const { getConfig, setConfig } = await import("@/shared/file-http");
    const raw = await getConfig("agent.sessionIndex");
    if (Array.isArray(raw)) {
      const filtered = (raw as Array<Record<string, unknown>>).filter(
        (item) => item.id !== sessionId,
      );
      await setConfig("agent.sessionIndex", filtered);
    }
  });

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
