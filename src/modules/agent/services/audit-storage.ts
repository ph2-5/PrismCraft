/**
 * Agent 工具调用审计日志存储（P1-A）
 *
 * 目标：持久化记录每次工具调用，用于故障排查、行为审计、使用统计。
 *
 * 设计：
 * - 文件格式：JSONL（每行一条 JSON 记录，便于追加和流式读取）
 * - 文件路径：{cacheDir}/agent/audit/{sessionId}.jsonl
 * - 内存缓存：按 sessionId 分组，避免频繁磁盘 IO
 * - 写入策略：每次记录后异步 flush 到磁盘（不阻断 Agent Loop）
 * - 读取策略：优先从内存读，内存无则从磁盘加载
 *
 * 记录字段：
 * - timestamp：记录时间（ms）
 * - sessionId：Agent 会话 ID
 * - toolCallId：工具调用 ID（对应 ToolCall.id）
 * - toolName：工具名
 * - iteration：AgentLoop 迭代序号（0-based）
 * - argsJson：工具参数 JSON 字符串（截断到 2000 字符）
 * - status：执行状态（done/error/cancelled/rejected）
 * - success：是否成功
 * - error：错误信息（失败时）
 * - resultPreview：结果摘要（成功时，截断到 500 字符）
 * - durationMs：执行耗时（ms）
 * - dangerLevel：危险等级（safe/limited/destructive）
 * - confirmedByUser：是否经用户确认
 * - specialist：来源 specialist（空=主 Agent）
 *
 * 持久化：通过 @/shared/file-http（遵守架构规则）
 */

import { getCacheDirectory, readFile, writeFile, deleteFile } from "@/shared/file-http";
import { errorLogger } from "@/shared/error-logger";
import { truncate } from "@/shared/utils/format";

/** 审计日志条目 */
export interface AuditEntry {
  /** 记录时间（ms） */
  timestamp: number;
  /** Agent 会话 ID */
  sessionId: string;
  /** 工具调用 ID */
  toolCallId: string;
  /** 工具名 */
  toolName: string;
  /** AgentLoop 迭代序号（0-based，-1 表示主循环外） */
  iteration: number;
  /** 工具参数 JSON 字符串（截断到 2000 字符） */
  argsJson: string;
  /** 执行状态 */
  status: "done" | "error" | "cancelled" | "rejected";
  /** 是否成功 */
  success: boolean;
  /** 错误信息（失败时） */
  error?: string;
  /** 结果摘要（成功时，截断到 500 字符） */
  resultPreview?: string;
  /** 执行耗时（ms） */
  durationMs?: number;
  /** 危险等级 */
  dangerLevel?: "safe" | "limited" | "destructive";
  /** 是否经用户确认 */
  confirmedByUser?: boolean;
  /** 来源 specialist（空=主 Agent） */
  specialist?: string;
}

/** 审计日志查询过滤条件 */
export interface AuditQueryFilter {
  sessionId?: string;
  toolName?: string;
  success?: boolean;
  /** 起始时间（ms） */
  fromTimestamp?: number;
  /** 结束时间（ms） */
  toTimestamp?: number;
  /** 返回条数上限 */
  limit?: number;
}

/** 审计日志文件相对路径前缀（相对于 cacheDir） */
const AUDIT_DIR_REL = "agent/audit";

/** 参数摘要截断长度 */
const ARGS_MAX_LEN = 2000;
/** 结果摘要截断长度 */
const RESULT_MAX_LEN = 500;
/** 单会话最大日志条数（超出时淘汰最旧的） */
const MAX_ENTRIES_PER_SESSION = 500;
/** 全局查询时扫描的最大会话数 */
const MAX_SESSIONS_FOR_GLOBAL_QUERY = 20;

// ── 内存缓存 ──

/** 按 sessionId 分组的内存缓存 */
const memoryCache = new Map<string, AuditEntry[]>();
/** 已从磁盘加载过的 sessionId 集合 */
const loadedSessions = new Set<string>();
/** 缓存目录路径（带缓存） */
let cachedBaseDir: string | null = null;
/**
 * P1-2 修复：按 sessionId 串行化 flushToDisk 的 promise 链
 *
 * 原问题：recordAudit 多次连续调用时，flushToDisk 是 fire-and-forget 全量重写，
 * 并发执行时旧快照可能后写入覆盖新数据。
 * 修复：每个 sessionId 维护一个 promise 链，新 flush 排队等待上一次完成后再执行。
 */
const flushChains = new Map<string, Promise<void>>();

// ── 辅助函数 ──

/** 获取审计日志目录绝对路径 */
async function getBaseDir(): Promise<string> {
  if (cachedBaseDir) return cachedBaseDir;
  const result = await getCacheDirectory();
  if (!result.success || !result.path) {
    throw new Error("无法获取缓存目录");
  }
  cachedBaseDir = result.path.replace(/[\\\/]+$/, "") + "/" + AUDIT_DIR_REL;
  return cachedBaseDir;
}

/** 获取指定 session 的审计日志文件路径 */
async function getAuditFilePath(sessionId: string): Promise<string> {
  const base = await getBaseDir();
  return `${base}/${sessionId}.jsonl`;
}

/** 从磁盘加载指定 session 的审计日志到内存 */
async function loadFromDisk(sessionId: string): Promise<AuditEntry[]> {
  if (loadedSessions.has(sessionId)) {
    return memoryCache.get(sessionId) ?? [];
  }
  try {
    const filePath = await getAuditFilePath(sessionId);
    const result = await readFile(filePath);
    if (!result || !result.success || !result.data) {
      // 文件不存在，返回空数组
      loadedSessions.add(sessionId);
      memoryCache.set(sessionId, []);
      return [];
    }
    const text = new TextDecoder().decode(result.data);
    const entries: AuditEntry[] = [];
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        entries.push(JSON.parse(trimmed) as AuditEntry);
      } catch {
        // 跳过损坏的行
      }
    }
    loadedSessions.add(sessionId);
    memoryCache.set(sessionId, entries);
    return entries;
  } catch (e) {
    errorLogger.debug("[AuditStorage] 加载审计日志失败", e);
    loadedSessions.add(sessionId);
    memoryCache.set(sessionId, []);
    return [];
  }
}

/**
 * 将内存缓存 flush 到磁盘（全量重写 JSONL）
 *
 * P1-2 修复：通过 scheduleFlush 串行化，确保不会并发执行。
 * 内部 flush 实现只读取当前内存快照并写入磁盘。
 */
async function flushToDisk(sessionId: string): Promise<void> {
  const entries = memoryCache.get(sessionId);
  if (!entries) return;
  // 拷贝一份快照，避免在写入过程中内存被并发修改
  const snapshot = entries.slice();
  try {
    const filePath = await getAuditFilePath(sessionId);
    const text = snapshot.map((e) => JSON.stringify(e)).join("\n") + "\n";
    const encoded = new TextEncoder().encode(text);
    const result = await writeFile(filePath, encoded);
    if (!result.success) {
      errorLogger.debug("[AuditStorage] flush 失败", result.error);
    }
  } catch (e) {
    errorLogger.debug("[AuditStorage] flush 异常", e);
  }
}

/**
 * P1-2 修复：串行化调度 flushToDisk
 *
 * 每个 sessionId 一个 promise 链，新的 flush 请求排队等待上一次完成。
 * 这样即使 recordAudit 高频调用，磁盘写入也不会并发执行，
 * 避免旧快照后写入覆盖新数据。
 */
function scheduleFlush(sessionId: string): void {
  const prev = flushChains.get(sessionId) ?? Promise.resolve();
  const next = prev.then(() => flushToDisk(sessionId)).catch(() => {
    // 单次 flush 失败不阻断后续 flush
  });
  flushChains.set(sessionId, next);
  // 完成后清理引用，防止 Map 无限增长
  void next.finally(() => {
    if (flushChains.get(sessionId) === next) {
      flushChains.delete(sessionId);
    }
  });
}

// ── 公开 API ──

/**
 * 记录一条审计日志
 *
 * @param entry 审计条目（不含 timestamp，会自动填充）
 */
export async function recordAudit(entry: Omit<AuditEntry, "timestamp">): Promise<void> {
  try {
    const fullEntry: AuditEntry = {
      ...entry,
      timestamp: Date.now(),
      argsJson: truncate(entry.argsJson, ARGS_MAX_LEN),
      resultPreview: entry.resultPreview ? truncate(entry.resultPreview, RESULT_MAX_LEN) : undefined,
    };

    // 加载到内存（如尚未加载）
    await loadFromDisk(entry.sessionId);
    const list = memoryCache.get(entry.sessionId) ?? [];
    list.push(fullEntry);

    // 淘汰最旧的（超过上限时）
    if (list.length > MAX_ENTRIES_PER_SESSION) {
      list.splice(0, list.length - MAX_ENTRIES_PER_SESSION);
    }
    memoryCache.set(entry.sessionId, list);

    // P1-2 修复：通过 scheduleFlush 串行化异步 flush（不阻断调用方，避免并发覆盖）
    scheduleFlush(entry.sessionId);
  } catch (e) {
    errorLogger.debug("[AuditStorage] 记录审计日志失败", e);
  }
}

/**
 * 查询审计日志
 *
 * 支持按 sessionId 查询单会话日志，或不指定 sessionId 查询全局日志（跨会话）。
 *
 * @param filter 过滤条件
 * @returns 匹配的审计条目（按时间倒序）
 */
export async function queryAuditLogs(filter: AuditQueryFilter = {}): Promise<AuditEntry[]> {
  const { sessionId, toolName, success, fromTimestamp, toTimestamp, limit = 200 } = filter;

  let candidates: AuditEntry[];

  if (sessionId) {
    // 单会话查询
    candidates = await loadFromDisk(sessionId);
  } else {
    // 全局查询：合并所有已加载的会话
    // 注意：未加载的会话不会出现在结果中（避免扫描所有文件）
    candidates = [];
    for (const [, entries] of memoryCache) {
      candidates.push(...entries);
    }
    // 如果内存为空，尝试加载最近活跃的会话（通过 sessionIndex）
    if (candidates.length === 0) {
      try {
        const { listSessions } = await import("./session-storage");
        const sessions = await listSessions();
        // 只加载最近的 N 个会话
        const recent = sessions.slice(0, MAX_SESSIONS_FOR_GLOBAL_QUERY);
        for (const s of recent) {
          await loadFromDisk(s.id);
          const entries = memoryCache.get(s.id) ?? [];
          candidates.push(...entries);
        }
      } catch {
        // session-storage 加载失败时静默
      }
    }
  }

  // 过滤
  let filtered = candidates;
  if (toolName) {
    filtered = filtered.filter((e) => e.toolName === toolName);
  }
  if (success !== undefined) {
    filtered = filtered.filter((e) => e.success === success);
  }
  if (fromTimestamp !== undefined) {
    filtered = filtered.filter((e) => e.timestamp >= fromTimestamp);
  }
  if (toTimestamp !== undefined) {
    filtered = filtered.filter((e) => e.timestamp <= toTimestamp);
  }

  // 按时间倒序排序
  filtered.sort((a, b) => b.timestamp - a.timestamp);

  // 限制返回条数
  return filtered.slice(0, limit);
}

/**
 * 清空指定 session 的审计日志
 */
export async function clearAuditLogs(sessionId: string): Promise<void> {
  memoryCache.set(sessionId, []);
  loadedSessions.add(sessionId);
  try {
    const filePath = await getAuditFilePath(sessionId);
    await deleteFile(filePath);
  } catch (e) {
    errorLogger.debug("[AuditStorage] 清空审计日志失败", e);
  }
}

/**
 * 清空所有审计日志
 */
export async function clearAllAuditLogs(): Promise<void> {
  // 清空内存
  memoryCache.clear();
  loadedSessions.clear();
  // 清空磁盘文件需要遍历所有 session
  // 由于 file-http 不支持列目录，这里依赖 sessionIndex 来定位文件
  try {
    const { listSessions } = await import("./session-storage");
    const sessions = await listSessions();
    for (const s of sessions) {
      try {
        const filePath = await getAuditFilePath(s.id);
        await deleteFile(filePath);
      } catch {
        // 单个文件删除失败不影响其他
      }
    }
  } catch {
    // session-storage 加载失败时静默
  }
}

/**
 * 获取审计日志统计信息
 */
export async function getAuditStats(): Promise<{
  totalEntries: number;
  sessionCount: number;
  toolStats: Array<{ toolName: string; count: number; successCount: number; failCount: number }>;
}> {
  // 合并所有已加载的会话
  const all: AuditEntry[] = [];
  for (const [, entries] of memoryCache) {
    all.push(...entries);
  }

  // 如果内存为空，尝试加载
  if (all.length === 0) {
    try {
      const { listSessions } = await import("./session-storage");
      const sessions = await listSessions();
      const recent = sessions.slice(0, MAX_SESSIONS_FOR_GLOBAL_QUERY);
      for (const s of recent) {
        await loadFromDisk(s.id);
        const entries = memoryCache.get(s.id) ?? [];
        all.push(...entries);
      }
    } catch {
      // 静默
    }
  }

  // 按工具统计
  const toolMap = new Map<string, { count: number; successCount: number; failCount: number }>();
  for (const e of all) {
    let stat = toolMap.get(e.toolName);
    if (!stat) {
      stat = { count: 0, successCount: 0, failCount: 0 };
      toolMap.set(e.toolName, stat);
    }
    stat.count++;
    if (e.success) {
      stat.successCount++;
    } else {
      stat.failCount++;
    }
  }
  const toolStats = Array.from(toolMap.entries())
    .map(([toolName, s]) => ({ toolName, ...s }))
    .sort((a, b) => b.count - a.count);

  return {
    totalEntries: all.length,
    sessionCount: memoryCache.size,
    toolStats,
  };
}
