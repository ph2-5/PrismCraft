/**
 * Story Templates Storage (CRUD)
 *
 * 故事模板的持久化存储。支持：
 *   - 基础 CRUD：getAllTemplates / getTemplateById / createTemplate / updateTemplate / deleteTemplate / deleteAllTemplates
 *
 * 表结构：story_templates（见 electron/src/database/db-schema.ts）
 *   - id (TEXT PRIMARY KEY)
 *   - name / description / beats_json / category / genre / tone / tags_json / author / total_duration
 *   - BASE_COLUMNS（owner_id/created_at/updated_at/is_deleted/deleted_at/version/sync_id）
 *
 * 访问模式：通过 DI container（container.storyTemplateStorage）访问，
 * 模块不能直接导入 infrastructure/storage/*。
 *
 * 依赖方向：infrastructure 不依赖 @/modules/*，因此 StoryTemplateRecord
 * 在此文件中独立定义（与 StoryboardTemplate 形状一致），由调用方
 *（src/modules/storyboard/template/services/template-storage-service.ts）负责类型断言。
 *
 * 参考实现：novel-projects/index.ts（同样的 plain object + safeQuery/safeRun 模式）
 */

import { safeQuery, safeRun } from "../sqlite-core";
import { parseRecordWithTable } from "../core";
import { safeJsonParseArray } from "@/shared/utils/safe-json";

/**
 * Storage 层返回的模板对象（与 modules/storyboard/template/services/storyboard-template.ts
 * 的 StoryboardTemplate 形状一致，但 beats/tags 为 unknown[]，由调用方做类型断言）。
 *
 * 这样设计是为了避免 infrastructure → modules 的架构违规。
 */
export interface StoryTemplateRecord {
  id: string;
  name: string;
  description: string;
  /** beats 的 JSON 解析结果（unknown[]，调用方负责断言为 StoryboardTemplateBeat[]） */
  beats: unknown[];
  category: string;
  genre: string;
  tone: string;
  /** tags 的 JSON 解析结果（unknown[]，调用方负责断言为 string[]） */
  tags: unknown[];
  author: string;
  totalDuration: number;
  version: number;
  createdAt: number;
  updatedAt: number;
}

/** DB 行类型（snake_case，对应 story_templates 表） */
interface StoryTemplateRow {
  id: string;
  name: string;
  description: string | null;
  beats_json: string | null;
  category: string | null;
  genre: string | null;
  tone: string | null;
  tags_json: string | null;
  author: string | null;
  total_duration: number | null;
  owner_id: number;
  created_at: number;
  updated_at: number;
  is_deleted: number;
  deleted_at: number | null;
  version: number;
  sync_id: string | null;
}

/** DB 行 → StoryTemplateRecord */
function rowToTemplate(row: StoryTemplateRow): StoryTemplateRecord {
  const parsed = parseRecordWithTable(
    row as unknown as Record<string, unknown>,
    "story_templates",
  );
  const tagsRaw = parsed.tags_json;
  const tags: unknown[] = Array.isArray(tagsRaw)
    ? tagsRaw
    : safeJsonParseArray<unknown>(typeof tagsRaw === "string" ? tagsRaw : "[]");
  let beats: unknown[] = [];
  if (Array.isArray(parsed.beats_json)) {
    beats = parsed.beats_json;
  } else if (typeof parsed.beats_json === "string") {
    try {
      const parsedBeats = JSON.parse(parsed.beats_json);
      beats = Array.isArray(parsedBeats) ? parsedBeats : [];
    } catch {
      beats = [];
    }
  }
  return {
    id: String(parsed.id ?? ""),
    name: String(parsed.name ?? ""),
    description: parsed.description ? String(parsed.description) : "",
    beats,
    category: parsed.category ? String(parsed.category) : "",
    genre: parsed.genre ? String(parsed.genre) : "",
    tone: parsed.tone ? String(parsed.tone) : "",
    tags,
    author: parsed.author ? String(parsed.author) : "",
    totalDuration:
      parsed.total_duration != null
        ? Number(parsed.total_duration)
        : 0,
    version: Number(parsed.version ?? 1),
    createdAt: Number(parsed.created_at) * 1000,
    updatedAt: Number(parsed.updated_at) * 1000,
  };
}

/** 创建/更新模板时传入的类型（beats/tags 为 unknown，storage 不关心具体字段） */
export interface StoryTemplateInput {
  id: string;
  name: string;
  description?: string;
  beats: unknown[];
  category?: string;
  genre?: string;
  tone?: string;
  tags?: unknown[];
  author?: string;
  totalDuration?: number;
  version?: number;
  createdAt?: number;
}

export interface StoryTemplatePatch {
  name?: string;
  description?: string;
  beats?: unknown[];
  category?: string;
  genre?: string;
  tone?: string;
  tags?: unknown[];
  author?: string;
  totalDuration?: number;
}

export const storyTemplateStorage = {
  /** 获取所有模板（按 updated_at 降序，排除软删除） */
  async getAllTemplates(): Promise<StoryTemplateRecord[]> {
    const rows = await safeQuery<StoryTemplateRow>(
      "SELECT * FROM story_templates WHERE is_deleted = 0 ORDER BY updated_at DESC",
    );
    return rows.map(rowToTemplate);
  },

  /** 获取单个模板 */
  async getTemplateById(id: string): Promise<StoryTemplateRecord | null> {
    const rows = await safeQuery<StoryTemplateRow>(
      "SELECT * FROM story_templates WHERE id = ? AND is_deleted = 0",
      [id],
    );
    if (rows.length === 0) return null;
    return rowToTemplate(rows[0]!);
  },

  /** 创建新模板（若 id 已存在则替换） */
  async createTemplate(template: StoryTemplateInput): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await safeRun(
      `INSERT OR REPLACE INTO story_templates
        (id, name, description, beats_json, category, genre, tone, tags_json, author, total_duration,
         owner_id, created_at, updated_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      [
        template.id,
        template.name,
        template.description || null,
        JSON.stringify(template.beats),
        template.category || null,
        template.genre || null,
        template.tone || null,
        JSON.stringify(template.tags ?? []),
        template.author || null,
        template.totalDuration ?? null,
        Math.floor((template.createdAt ?? Date.now()) / 1000),
        now,
        template.version || 1,
      ],
    );
  },

  /** 更新模板（部分更新） */
  async updateTemplate(id: string, patch: StoryTemplatePatch): Promise<void> {
    const sets: string[] = [];
    const params: (string | number | null)[] = [];

    if (patch.name !== undefined) {
      sets.push("name = ?");
      params.push(patch.name);
    }
    if (patch.description !== undefined) {
      sets.push("description = ?");
      params.push(patch.description || null);
    }
    if (patch.beats !== undefined) {
      sets.push("beats_json = ?");
      params.push(JSON.stringify(patch.beats));
    }
    if (patch.category !== undefined) {
      sets.push("category = ?");
      params.push(patch.category || null);
    }
    if (patch.genre !== undefined) {
      sets.push("genre = ?");
      params.push(patch.genre || null);
    }
    if (patch.tone !== undefined) {
      sets.push("tone = ?");
      params.push(patch.tone || null);
    }
    if (patch.tags !== undefined) {
      sets.push("tags_json = ?");
      params.push(JSON.stringify(patch.tags));
    }
    if (patch.author !== undefined) {
      sets.push("author = ?");
      params.push(patch.author || null);
    }
    if (patch.totalDuration !== undefined) {
      sets.push("total_duration = ?");
      params.push(patch.totalDuration);
    }

    if (sets.length === 0) return;

    sets.push("updated_at = ?");
    params.push(Math.floor(Date.now() / 1000));
    params.push(id);

    await safeRun(
      `UPDATE story_templates SET ${sets.join(", ")} WHERE id = ?`,
      params,
    );
  },

  /** 软删除模板 */
  async deleteTemplate(id: string): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await safeRun(
      `UPDATE story_templates SET is_deleted = 1, deleted_at = ?, updated_at = ? WHERE id = ?`,
      [now, now, id],
    );
  },

  /** 物理删除所有模板（用于测试/重置） */
  async deleteAllTemplates(): Promise<void> {
    await safeRun("DELETE FROM story_templates");
  },
};
