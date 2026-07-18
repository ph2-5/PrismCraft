/**
 * Task 2A.7 — NovelProject Storage (CRUD)
 *
 * 小说导入项目的持久化存储。每个项目保存完整的 PipelineState（JSON），
 * 支持跨会话恢复：用户关闭页面/应用后重启，可恢复未完成的导入项目。
 *
 * 表结构：novel_projects（见 electron/src/database/db-schema.ts）
 * - id (TEXT PRIMARY KEY)
 * - title (TEXT)
 * - raw_text (TEXT)
 * - pipeline_state_json (TEXT, JSON 序列化的 PipelineState)
 * - story_id (TEXT, 关联 stories(id)，可空)
 * - BASE_COLUMNS（owner_id/created_at/updated_at/is_deleted/deleted_at/version/sync_id）
 *
 * 访问模式：通过 DI container（container.novelProjectStorage）访问，
 * 模块不能直接导入 infrastructure/storage/*。
 *
 * 依赖方向：infrastructure 不依赖 @/modules/*，因此 NovelProject 和
 * PipelineState 类型在此文件中以 unknown 形式存储，由调用方
 *（src/modules/novel/hooks/use-novel-pipeline.ts）负责类型断言。
 *
 * 参考实现：auto-save.ts（同样的 plain object + safeQuery/safeRun 模式）
 */

import { safeQuery, safeRun } from "../sqlite-core";

/**
 * Storage 层返回的项目对象（与 modules/novel/domain/types.ts 的 NovelProject 形状一致，
 * 但 state 字段为 unknown，由调用方做类型断言为 PipelineState）。
 *
 * 这样设计是为了避免 infrastructure → modules 的架构违规。
 */
export interface NovelProjectRecord {
  id: string;
  title: string;
  rawText: string;
  /** PipelineState 的 JSON 解析结果（unknown，调用方负责断言） */
  state: unknown;
  createdAt: number;
  updatedAt: number;
}

/** DB 行类型（snake_case，对应 novel_projects 表） */
interface NovelProjectRow {
  id: string;
  title: string | null;
  raw_text: string | null;
  pipeline_state_json: string | null;
  story_id: string | null;
  owner_id: number;
  created_at: number;
  updated_at: number;
  is_deleted: number;
  deleted_at: number | null;
  version: number;
  sync_id: string | null;
}

/** DB 行 → NovelProjectRecord（state 保持 unknown，由调用方断言） */
function rowToProject(row: NovelProjectRow): NovelProjectRecord {
  let state: unknown;
  try {
    state = JSON.parse(row.pipeline_state_json ?? "{}");
  } catch {
    // 损坏的 JSON 回退到空对象（调用方应处理空对象情况）
    state = {};
  }

  return {
    id: row.id,
    title: row.title ?? "",
    rawText: row.raw_text ?? "",
    state,
    createdAt: row.created_at * 1000,
    updatedAt: row.updated_at * 1000,
  };
}

/** 创建/更新项目时传入的 state 类型（调用方序列化为 JSON） */
export interface NovelProjectInput {
  id: string;
  title: string;
  rawText?: string;
  /** PipelineState 域对象（任意结构，storage 不关心具体字段） */
  state: unknown;
  storyId?: string | null;
}

export interface NovelProjectPatch {
  title?: string;
  rawText?: string;
  state?: unknown;
  storyId?: string | null;
}

export const novelProjectStorage = {
  /** 获取所有未完成的项目（按 updated_at 降序） */
  async getAllProjects(): Promise<NovelProjectRecord[]> {
    const rows = await safeQuery<NovelProjectRow>(
      "SELECT * FROM novel_projects WHERE is_deleted = 0 ORDER BY updated_at DESC",
    );
    return rows.map(rowToProject);
  },

  /** 获取单个项目 */
  async getProjectById(id: string): Promise<NovelProjectRecord | null> {
    const rows = await safeQuery<NovelProjectRow>(
      "SELECT * FROM novel_projects WHERE id = ? AND is_deleted = 0",
      [id],
    );
    if (rows.length === 0) return null;
    return rowToProject(rows[0]!);
  },

  /** 创建新项目 */
  async createProject(project: NovelProjectInput): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await safeRun(
      `INSERT INTO novel_projects
        (id, title, raw_text, pipeline_state_json, story_id, owner_id, created_at, updated_at, version)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, 1)`,
      [
        project.id,
        project.title,
        project.rawText ?? "",
        JSON.stringify(project.state),
        project.storyId ?? null,
        now,
        now,
      ],
    );
  },

  /** 更新项目（标题/原文/状态/story_id） */
  async updateProject(id: string, patch: NovelProjectPatch): Promise<void> {
    const sets: string[] = [];
    const params: (string | null)[] = [];

    if (patch.title !== undefined) {
      sets.push("title = ?");
      params.push(patch.title);
    }
    if (patch.rawText !== undefined) {
      sets.push("raw_text = ?");
      params.push(patch.rawText);
    }
    if (patch.state !== undefined) {
      sets.push("pipeline_state_json = ?");
      params.push(JSON.stringify(patch.state));
    }
    if (patch.storyId !== undefined) {
      sets.push("story_id = ?");
      params.push(patch.storyId);
    }

    if (sets.length === 0) return;

    sets.push("updated_at = ?");
    params.push(String(Math.floor(Date.now() / 1000)));
    // P2-7 修复：version 列每次更新递增 1，便于乐观锁/同步冲突检测
    sets.push("version = version + 1");
    params.push(id);

    await safeRun(
      `UPDATE novel_projects SET ${sets.join(", ")} WHERE id = ?`,
      params,
    );
  },

  /** 软删除项目（标记 is_deleted = 1） */
  async deleteProject(id: string): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await safeRun(
      `UPDATE novel_projects SET is_deleted = 1, deleted_at = ?, updated_at = ? WHERE id = ?`,
      [String(now), String(now), id],
    );
  },

  /** 物理删除项目（导入完成后清理） */
  async hardDeleteProject(id: string): Promise<void> {
    await safeRun("DELETE FROM novel_projects WHERE id = ?", [id]);
  },

  /**
   * 清理超过 maxAgeMs 的已完成/已删除项目。
   *
   * P1-10 修复：原实现先 SELECT 再 DELETE，两步之间存在竞态——
   * 其他事务可能在 SELECT 之后将某 id 的 updated_at 更新为当前时间（不再过期），
   * 但本操作仍会按旧 id 列表删除它。改为单条 DELETE 带完整 WHERE 条件，
   * 让 SQLite 在同一条语句内原子地完成"过期判断 + 删除"。
   *
   * 返回值：受影响行数（通过 changes() 获取），与原返回语义一致。
   */
  async cleanExpiredProjects(maxAgeMs: number = 30 * 24 * 60 * 60 * 1000): Promise<number> {
    const cutoff = Math.floor((Date.now() - maxAgeMs) / 1000);
    // 单条原子 DELETE：WHERE 条件同时检查过期状态和时间戳，避免 SELECT-DELETE 竞态
    const result = await safeRun(
      `DELETE FROM novel_projects 
       WHERE (is_deleted = 1 OR story_id IS NOT NULL) 
         AND updated_at < ?`,
      [String(cutoff)],
    );
    // safeRun 返回 { changes: number }（受影响行数），即实际删除的项目数
    return result.changes ?? 0;
  },
};
