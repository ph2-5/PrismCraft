/**
 * P5 断点恢复 - 检查点服务
 *
 * 设计要点：
 * - 检查点信息附加在 AgentSession.checkpoint 字段，随会话一同持久化（复用 session-storage）
 * - 单独维护 agent.checkpoints.index 配置项，记录所有 running/interrupted 的检查点
 * - 应用启动时调用 markRunningAsInterrupted() 将所有 running 标记为 interrupted
 * - AgentLoop 正常完成后调用 clearCheckpoint() 清除检查点（保留会话）
 *
 * 恢复流程：
 * 1. 应用启动 → markRunningAsInterrupted() 更新索引状态
 * 2. UI 调用 listInterruptedSessions() 展示中断会话列表
 * 3. 用户选择恢复 → loadSession() 加载会话历史
 * 4. 用户重新发送消息 → AgentLoop 创建新 checkpoint 覆盖旧的
 *
 * 注意：检查点保存是"尽力而为"策略，失败静默不阻断主流程。
 *
 * 从 @/modules/agent/services/ 迁移至 @/modules/agent-session（阶段2-b）
 */

import type { AgentSession } from "@/modules/agent";
import type { SessionCheckpoint, CheckpointIndexEntry, CheckpointStatus } from "../domain/checkpoint-types";
import { createCheckpoint } from "../domain/checkpoint-types";

// Re-export types for convenience（use-agent 等消费者从此处导入）
export type { SessionCheckpoint, CheckpointIndexEntry, CheckpointStatus };
import { saveSession, loadSession } from "./session-storage";
import { getConfig, setConfig } from "@/shared/file-http";

/** 检查点索引配置键 */
const CHECKPOINT_INDEX_KEY = "agent.checkpoints.index";

/**
 * 索引写入串行化链
 *
 * updateCheckpointIndex / updateCheckpointIndexEntry / removeFromCheckpointIndex
 * 都是 read-modify-write 模式，并发调用会相互覆盖。
 * 用 promise 链串行化所有索引写操作（参考 memory-service.ts 的 archivalWriteChain）。
 */
let checkpointIndexWriteChain: Promise<void> = Promise.resolve();

async function serializeCheckpointIndexWrite<T>(fn: () => Promise<T>): Promise<T> {
  const result = checkpointIndexWriteChain.then(fn);
  checkpointIndexWriteChain = result.then(() => undefined, () => undefined);
  return result;
}

/**
 * 保存检查点（会话 + 索引）
 *
 * 由 AgentLoop 在关键节点调用：
 * - run() 开始时：创建初始 checkpoint
 * - 每轮 LLM 完成后：更新 iteration
 * - 工具执行完成后：更新 toolCallsCompleted
 *
 * @param session 当前会话（checkpoint 字段会被更新）
 * @param updates 增量更新的字段
 * @returns 是否保存成功
 */
export async function saveCheckpoint(
  session: AgentSession,
  updates?: Partial<SessionCheckpoint>,
): Promise<boolean> {
  // 确保 checkpoint 存在
  if (!session.checkpoint) {
    return false;
  }

  // 应用增量更新
  if (updates) {
    Object.assign(session.checkpoint, updates, { updatedAt: Date.now() });
  } else {
    session.checkpoint.updatedAt = Date.now();
  }

  // 保存会话（含 checkpoint 字段）
  const saved = await saveSession(session);
  if (!saved) return false;

  // 更新索引
  await updateCheckpointIndex(session.checkpoint);
  return true;
}

/**
 * 初始化检查点（AgentLoop run() 开始时调用）
 *
 * 创建新的 checkpoint 并立即保存。
 */
export async function initCheckpoint(
  session: AgentSession,
  userInput: string,
): Promise<boolean> {
  session.checkpoint = createCheckpoint(session.id, userInput);
  return saveCheckpoint(session);
}

/**
 * 清除检查点（AgentLoop 正常完成后调用）
 *
 * P1-5 修复：除了从索引中移除外，还需加载会话并清除 session.checkpoint 字段，
 * 否则正常完成的会话仍带有 status=running 的 checkpoint，
 * 重启后会被 markRunningAsInterrupted 误判为中断。
 *
 * 会话本身保留（包含所有消息历史）。
 */
export async function clearCheckpoint(sessionId: string): Promise<boolean> {
  // 从索引中移除
  await removeFromCheckpointIndex(sessionId);
  // P1-5 修复：同步清除 session.checkpoint 字段
  try {
    const session = await loadSession(sessionId);
    if (session && session.checkpoint) {
      // 使用 delete 移除可选属性，避免 TypeScript exactOptionalPropertyTypes 限制
      delete session.checkpoint;
      await saveSession(session);
    }
  } catch {
    // 会话文件不存在或加载失败时静默（索引已清理，不影响主流程）
  }
  return true;
}

/**
 * 标记检查点为中断状态（AgentLoop abort/异常时调用）
 */
export async function markInterrupted(sessionId: string): Promise<boolean> {
  return updateCheckpointIndexEntry(sessionId, { status: "interrupted" });
}

/**
 * 应用启动时调用：将所有 status=running 的检查点标记为 interrupted
 *
 * 因为应用崩溃时无法执行清理逻辑，所以重启后所有 running 状态都是过期的。
 * 此函数只更新索引（快速），不重新加载会话文件。
 *
 * @returns 被标记为 interrupted 的会话数量
 */
export async function markRunningAsInterrupted(): Promise<number> {
  const index = await getCheckpointIndex();
  let count = 0;
  let changed = false;

  for (const entry of index) {
    if (entry.status === "running") {
      entry.status = "interrupted";
      count++;
      changed = true;
    }
  }

  if (changed) {
    await setCheckpointIndex(index);
  }
  return count;
}

/**
 * 列出所有中断的会话（status=interrupted）
 *
 * 返回按 updatedAt 倒序的列表，用于 UI 展示"恢复未完成的会话"。
 */
export async function listInterruptedSessions(): Promise<CheckpointIndexEntry[]> {
  const index = await getCheckpointIndex();
  return index
    .filter((e) => e.status === "interrupted")
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * 列出所有运行中的会话（status=running）
 *
 * 正常情况下应用启动后此函数应返回空数组（因为 markRunningAsInterrupted 已处理）。
 * 如果返回非空，说明有并发运行的会话。
 */
export async function listRunningSessions(): Promise<CheckpointIndexEntry[]> {
  const index = await getCheckpointIndex();
  return index.filter((e) => e.status === "running");
}

/**
 * 获取检查点详情（加载会话并返回 checkpoint 字段）
 */
export async function getCheckpoint(sessionId: string): Promise<SessionCheckpoint | null> {
  const session = await loadSession(sessionId);
  return session?.checkpoint ?? null;
}

/**
 * 加载中断的会话（如果 checkpoint.status=running，则更新为 interrupted）
 *
 * 与普通 loadSession 的区别：会修正过期的 running 状态。
 */
export async function loadInterruptedSession(sessionId: string): Promise<AgentSession | null> {
  const session = await loadSession(sessionId);
  if (!session) return null;

  // 修正过期的 running 状态
  if (session.checkpoint && session.checkpoint.status === "running") {
    session.checkpoint.status = "interrupted";
    session.checkpoint.updatedAt = Date.now();
    await saveSession(session);
    await updateCheckpointIndexEntry(sessionId, { status: "interrupted" });
  }

  return session;
}

// ============= 内部辅助函数 =============

/** 读取检查点索引 */
async function getCheckpointIndex(): Promise<CheckpointIndexEntry[]> {
  const raw = await getConfig(CHECKPOINT_INDEX_KEY);
  if (!Array.isArray(raw)) return [];

  const entries: CheckpointIndexEntry[] = [];
  for (const item of raw as Array<Record<string, unknown>>) {
    if (
      item &&
      typeof item.sessionId === "string" &&
      typeof item.status === "string" &&
      (item.status === "running" || item.status === "interrupted" || item.status === "completed") &&
      typeof item.startedAt === "number" &&
      typeof item.updatedAt === "number"
    ) {
      entries.push({
        sessionId: item.sessionId,
        status: item.status as CheckpointStatus,
        startedAt: item.startedAt,
        updatedAt: item.updatedAt,
      });
    }
  }
  return entries;
}

/** 写入检查点索引 */
async function setCheckpointIndex(entries: CheckpointIndexEntry[]): Promise<void> {
  // 保留最近 100 条，清理 completed 超过 7 天的
  const now = Date.now();
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
  const filtered = entries.filter((e) => {
    if (e.status === "completed") {
      return now - e.updatedAt < SEVEN_DAYS;
    }
    return true;
  });
  // 保留最近 100 条
  const trimmed = filtered
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 100);
  await setConfig(CHECKPOINT_INDEX_KEY, trimmed);
}

/** 更新或追加索引条目 */
async function updateCheckpointIndex(checkpoint: SessionCheckpoint): Promise<void> {
  await serializeCheckpointIndexWrite(async () => {
    const index = await getCheckpointIndex();
    const filtered = index.filter((e) => e.sessionId !== checkpoint.sessionId);
    filtered.push({
      sessionId: checkpoint.sessionId,
      status: checkpoint.status,
      startedAt: checkpoint.startedAt,
      updatedAt: checkpoint.updatedAt,
    });
    await setCheckpointIndex(filtered);
  });
}

/** 更新索引中指定会话的状态 */
async function updateCheckpointIndexEntry(
  sessionId: string,
  patch: Partial<CheckpointIndexEntry>,
): Promise<boolean> {
  return serializeCheckpointIndexWrite(async () => {
    const index = await getCheckpointIndex();
    let found = false;
    for (const entry of index) {
      if (entry.sessionId === sessionId) {
        Object.assign(entry, patch, { updatedAt: Date.now() });
        found = true;
        break;
      }
    }
    if (found) {
      await setCheckpointIndex(index);
    }
    return found;
  });
}

/** 从索引中移除指定会话 */
async function removeFromCheckpointIndex(sessionId: string): Promise<void> {
  await serializeCheckpointIndexWrite(async () => {
    const index = await getCheckpointIndex();
    const filtered = index.filter((e) => e.sessionId !== sessionId);
    await setCheckpointIndex(filtered);
  });
}

// ============= 测试辅助函数 =============

/** 重置检查点索引（仅测试用） */
export async function _resetCheckpointIndex(): Promise<void> {
  await setConfig(CHECKPOINT_INDEX_KEY, []);
}
