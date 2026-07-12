/**
 * 提示词模板存储服务
 *
 * 职责：
 * - 内置模板 + 用户模板的统一管理（CRUD）
 * - 持久化到缓存目录 agent/prompt-templates.json
 * - 变量插槽替换（{{variable.name}} 语法）
 * - 按 category/style/target/model 检索
 * - 导入/导出（JSON 格式）
 *
 * 设计要点：
 * - 内置模板每次启动时自动合并（新版本可添加模板，用户对内置模板的修改保留）
 * - 用户模板可自由编辑/删除
 * - 变量替换安全：未提供值的必填变量记录到 missingVariables
 * - 通过 @/shared/file-http 统一层访问文件（遵守架构规则）
 */

import { writeFile, readFile, getCacheDirectory } from "@/shared/file-http";
import { errorLogger } from "@/shared/error-logger";
import type {
  PromptTemplate,
  CreatePromptTemplateInput,
  PromptTemplateCategory,
  PromptTemplateTarget,
  ApplyTemplateResult,
} from "./prompt-template-types";
import { BUILTIN_TEMPLATES } from "./builtin-templates";

/** 存储文件相对路径（相对缓存目录） */
const TEMPLATES_REL_PATH = "agent/prompt-templates.json";

/** 变量插槽正则（匹配 {{variable.name}} 或 {{name}}） */
const VARIABLE_PATTERN = /\{\{\s*([\w.]+)\s*\}\}/g;

// ============= 内存缓存 =============

/** 模板内存缓存（避免频繁磁盘 IO） */
let _cache: PromptTemplate[] | null = null;

/** 是否已初始化 */
let _initialized = false;

// ============= 内部工具 =============

/** 获取存储文件绝对路径 */
async function getFilePath(): Promise<string | null> {
  const result = await getCacheDirectory();
  if (!result.success || !result.path) return null;
  return `${result.path}/${TEMPLATES_REL_PATH}`;
}

/** 从磁盘读取用户模板 */
async function loadUserTemplates(): Promise<PromptTemplate[]> {
  const filePath = await getFilePath();
  if (!filePath) return [];

  try {
    const result = await readFile(filePath);
    if (!result?.success || !result.data) return [];
    const text = new TextDecoder().decode(result.data);
    const parsed = JSON.parse(text) as { templates?: PromptTemplate[] };
    if (!Array.isArray(parsed.templates)) return [];
    return parsed.templates.filter(
      (t) => t && typeof t.id === "string" && typeof t.content === "string",
    );
  } catch {
    return [];
  }
}

/** 保存用户模板到磁盘 */
async function saveUserTemplates(templates: PromptTemplate[]): Promise<boolean> {
  const filePath = await getFilePath();
  if (!filePath) return false;

  try {
    const data = JSON.stringify({ version: 1 as const, templates }, null, 2);
    const result = await writeFile(filePath, data);
    return result.success;
  } catch (e) {
    errorLogger.warn("[prompt-templates] 保存失败", e);
    return false;
  }
}

/**
 * 合并内置模板和用户模板
 *
 * 合并规则：
 * - 内置模板（builtin=true）始终包含
 * - 用户对内置模板的修改：以用户版本覆盖内置版本（通过 id 匹配）
 * - 用户自定义模板（builtin=false）：直接添加
 */
function mergeTemplates(
  builtin: PromptTemplate[],
  user: PromptTemplate[],
): PromptTemplate[] {
  const userMap = new Map(user.map((t) => [t.id, t]));
  const result: PromptTemplate[] = [];
  const seenIds = new Set<string>();

  // 1. 内置模板（用户修改覆盖）
  for (const bt of builtin) {
    const userVersion = userMap.get(bt.id);
    if (userVersion) {
      // 用户修改了内置模板 → 使用用户版本（但保持 builtin=true）
      result.push({ ...userVersion, builtin: true });
    } else {
      result.push(bt);
    }
    seenIds.add(bt.id);
  }

  // 2. 用户自定义模板（非内置 id）
  for (const ut of user) {
    if (!seenIds.has(ut.id)) {
      result.push(ut);
    }
  }

  return result;
}

// ============= 公开 API =============

/**
 * 初始化模板库（合并内置 + 用户模板）
 *
 * 首次调用时从磁盘加载用户模板，与内置模板合并后缓存。
 * 后续调用直接返回缓存。
 */
export async function initTemplates(): Promise<PromptTemplate[]> {
  if (_initialized && _cache) {
    return _cache;
  }

  const userTemplates = await loadUserTemplates();
  _cache = mergeTemplates(BUILTIN_TEMPLATES, userTemplates);
  _initialized = true;
  return _cache;
}

/** 获取所有模板（含内置 + 用户） */
export async function listPromptTemplates(): Promise<PromptTemplate[]> {
  return initTemplates();
}

/**
 * 按条件检索模板
 *
 * @param filter 筛选条件
 * @returns 匹配的模板列表
 */
export async function searchPromptTemplates(filter: {
  category?: PromptTemplateCategory;
  target?: PromptTemplateTarget;
  styleTags?: string[];
  modelTags?: string[];
  keyword?: string;
}): Promise<PromptTemplate[]> {
  const all = await initTemplates();

  return all.filter((t) => {
    // 类别筛选
    if (filter.category && t.category !== filter.category) return false;

    // 目标类型筛选（both 类型始终匹配）
    if (filter.target && t.target !== filter.target && t.target !== "both") return false;

    // 风格标签筛选（任一匹配即可）
    if (filter.styleTags && filter.styleTags.length > 0) {
      if (!t.styleTags || !filter.styleTags.some((s) => t.styleTags!.includes(s))) {
        return false;
      }
    }

    // 模型标签筛选（空 modelTags 表示通用，始终匹配）
    if (filter.modelTags && filter.modelTags.length > 0) {
      if (t.modelTags && t.modelTags.length > 0) {
        if (!filter.modelTags.some((m) => t.modelTags!.includes(m))) {
          return false;
        }
      }
    }

    // 关键词搜索（name + description + content）
    if (filter.keyword && filter.keyword.trim()) {
      const kw = filter.keyword.toLowerCase();
      const haystack = `${t.name} ${t.description} ${t.content}`.toLowerCase();
      if (!haystack.includes(kw)) return false;
    }

    return true;
  });
}

/** 按 ID 获取单个模板 */
export async function getPromptTemplate(id: string): Promise<PromptTemplate | null> {
  const all = await initTemplates();
  return all.find((t) => t.id === id) ?? null;
}

/** 创建用户模板 */
export async function createPromptTemplate(
  input: CreatePromptTemplateInput,
): Promise<PromptTemplate> {
  const now = Date.now();
  const template: PromptTemplate = {
    ...input,
    id: input.id ?? `user_${now}_${Math.random().toString(36).slice(2, 8)}`,
    builtin: false,
    createdAt: now,
    updatedAt: now,
  };

  const all = await initTemplates();
  all.push(template);

  // 仅保存用户模板 + 被修改的内置模板
  const toSave = all.filter((t) => {
    if (!t.builtin) return true; // 用户自定义模板
    // 内置模板：仅当被用户修改过时保存（检查是否与原始内置版本不同）
    const original = BUILTIN_TEMPLATES.find((bt) => bt.id === t.id);
    if (!original) return false;
    return JSON.stringify(original) !== JSON.stringify(t);
  });

  await saveUserTemplates(toSave);
  return template;
}

/** 更新模板（内置模板也可更新，但 builtin 标记保持 true） */
export async function updatePromptTemplate(
  id: string,
  updates: Partial<CreatePromptTemplateInput>,
): Promise<PromptTemplate | null> {
  const all = await initTemplates();
  const idx = all.findIndex((t) => t.id === id);
  if (idx < 0) return null;

  const updated: PromptTemplate = {
    ...all[idx]!,
    ...updates,
    id, // id 不可变
    builtin: all[idx]!.builtin, // builtin 标记不可变
    updatedAt: Date.now(),
  };

  all[idx] = updated;

  // 保存用户模板 + 被修改的内置模板
  const toSave = all.filter((t) => {
    if (!t.builtin) return true;
    const original = BUILTIN_TEMPLATES.find((bt) => bt.id === t.id);
    if (!original) return false;
    return JSON.stringify(original) !== JSON.stringify(t);
  });
  await saveUserTemplates(toSave);

  return updated;
}

/** 删除模板（内置模板不可删除） */
export async function deletePromptTemplate(id: string): Promise<boolean> {
  const all = await initTemplates();
  const template = all.find((t) => t.id === id);
  if (!template) return true; // 不存在也算成功
  if (template.builtin) {
    // 内置模板不可删除，但可以重置为原始版本
    const original = BUILTIN_TEMPLATES.find((bt) => bt.id === id);
    if (original) {
      const idx = all.findIndex((t) => t.id === id);
      all[idx] = original;
    }
    // 从用户存储中移除该 id 的修改记录
    const toSave = all.filter((t) => {
      if (!t.builtin) return true;
      const orig = BUILTIN_TEMPLATES.find((bt) => bt.id === t.id);
      if (!orig) return false;
      return JSON.stringify(orig) !== JSON.stringify(t);
    });
    // 移除被重置的内置模板的修改记录
    const filtered = toSave.filter((t) => t.id !== id);
    await saveUserTemplates(filtered);
    return true;
  }

  // 用户自定义模板：直接删除
  const filtered = all.filter((t) => t.id !== id);
  const userTemplates = filtered.filter((t) => !t.builtin);
  // 同时保留被修改的内置模板
  const modifiedBuiltin = filtered.filter((t) => {
    if (!t.builtin) return false;
    const orig = BUILTIN_TEMPLATES.find((bt) => bt.id === t.id);
    if (!orig) return false;
    return JSON.stringify(orig) !== JSON.stringify(t);
  });
  await saveUserTemplates([...userTemplates, ...modifiedBuiltin]);
  return true;
}

// ============= 变量替换 =============

/**
 * 应用模板（替换变量插槽）
 *
 * @param templateId 模板 ID
 * @param variables 变量值映射（如 { "character.name": "Alice" }）
 * @returns 应用结果（含最终提示词和未替换的变量列表）
 */
export async function applyPromptTemplate(
  templateId: string,
  variables: Record<string, string> = {},
): Promise<ApplyTemplateResult | null> {
  const template = await getPromptTemplate(templateId);
  if (!template) return null;

  const missingVariables: string[] = [];
  let prompt = template.content;
  let negativePrompt = template.negativePrompt;

  // 收集模板中所有使用的变量
  const usedVariables = new Set<string>();
  const collectVars = (text: string) => {
    let match;
    const re = new RegExp(VARIABLE_PATTERN.source, "g");
    while ((match = re.exec(text)) !== null) {
      usedVariables.add(match[1]!);
    }
  };
  collectVars(prompt);
  if (negativePrompt) collectVars(negativePrompt);

  // 替换变量
  for (const varName of usedVariables) {
    const value = variables[varName];
    const varDef = template.variables?.find((v) => v.name === varName);
    const placeholder = `{{${varName}}}`;

    if (value != null && value.trim() !== "") {
      // 用户提供了值
      prompt = prompt.split(placeholder).join(value);
      if (negativePrompt) {
        negativePrompt = negativePrompt.split(placeholder).join(value);
      }
    } else if (varDef?.defaultValue) {
      // 使用默认值
      prompt = prompt.split(placeholder).join(varDef.defaultValue);
      if (negativePrompt) {
        negativePrompt = negativePrompt.split(placeholder).join(varDef.defaultValue);
      }
    } else if (varDef?.required) {
      // 必填变量未提供值
      missingVariables.push(varName);
    } else {
      // 可选变量未提供值 → 移除占位符
      prompt = prompt.split(placeholder).join("");
      if (negativePrompt) {
        negativePrompt = negativePrompt.split(placeholder).join("");
      }
    }
  }

  // 清理多余空格
  prompt = prompt.replace(/\s+/g, " ").trim();
  if (negativePrompt) {
    negativePrompt = negativePrompt.replace(/\s+/g, " ").trim();
  }

  return {
    prompt,
    negativePrompt: negativePrompt || undefined,
    missingVariables,
  };
}

// ============= 导入/导出 =============

/** 导出模板为 JSON 字符串 */
export async function exportPromptTemplates(
  ids?: string[],
): Promise<string> {
  const all = await initTemplates();
  const toExport = ids ? all.filter((t) => ids.includes(t.id)) : all;
  return JSON.stringify(
    { version: 1 as const, templates: toExport },
    null,
    2,
  );
}

/** 从 JSON 字符串导入模板 */
export async function importPromptTemplates(
  jsonString: string,
  options?: { overwrite?: boolean },
): Promise<{ imported: number; skipped: number }> {
  try {
    const parsed = JSON.parse(jsonString) as { templates?: PromptTemplate[] };
    if (!Array.isArray(parsed.templates)) {
      return { imported: 0, skipped: 0 };
    }

    const all = await initTemplates();
    let imported = 0;
    let skipped = 0;

    for (const template of parsed.templates) {
      if (!template.id || !template.content) {
        skipped++;
        continue;
      }

      const existingIdx = all.findIndex((t) => t.id === template.id);
      if (existingIdx >= 0) {
        if (options?.overwrite) {
          all[existingIdx] = { ...template, builtin: all[existingIdx]!.builtin };
          imported++;
        } else {
          skipped++;
        }
      } else {
        // 新模板：标记为用户自定义
        all.push({ ...template, builtin: false, id: `user_${template.id}` });
        imported++;
      }
    }

    // 保存
    const toSave = all.filter((t) => {
      if (!t.builtin) return true;
      const orig = BUILTIN_TEMPLATES.find((bt) => bt.id === t.id);
      if (!orig) return false;
      return JSON.stringify(orig) !== JSON.stringify(t);
    });
    await saveUserTemplates(toSave);

    return { imported, skipped };
  } catch (e) {
    errorLogger.warn("[prompt-templates] 导入失败", e);
    return { imported: 0, skipped: 0 };
  }
}

// ============= 统计 =============

/** 获取模板统计信息 */
export async function getPromptTemplateStats(): Promise<{
  total: number;
  builtin: number;
  user: number;
  byCategory: Record<PromptTemplateCategory, number>;
}> {
  const all = await initTemplates();
  const byCategory = {
    character: 0,
    scene: 0,
    video: 0,
    story: 0,
    negative: 0,
    style: 0,
    custom: 0,
  } as Record<PromptTemplateCategory, number>;

  for (const t of all) {
    byCategory[t.category]++;
  }

  return {
    total: all.length,
    builtin: all.filter((t) => t.builtin).length,
    user: all.filter((t) => !t.builtin).length,
    byCategory,
  };
}

/** 重置缓存（测试用） */
export function _resetTemplateCache(): void {
  _cache = null;
  _initialized = false;
}
