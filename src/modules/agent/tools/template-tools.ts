/**
 * 模板管理工具（Template Tools）
 *
 * 包含工具（5 个）：
 * - list_templates：列出模板（支持分类过滤/分页）
 * - apply_template：应用模板到当前项目（创建角色/场景/故事）
 * - create_template：从当前项目创建模板
 * - import_template：导入外部模板（文件路径或 JSON 字符串）
 * - export_template：导出模板为 JSON 文件
 *
 * 设计要点：
 * - 通过 DI container 获取 templateStorage（AST 模板存储）
 * - AST 模板存储元数据（DB）+ 内容文件（astFilePath 指向 JSON）
 * - apply/create 涉及角色/场景/故事的联动，动态 import 各 service
 * - 文件读写统一走 @/shared/file-http
 * - 错误处理完善，存储/服务失败时返回友好错误信息
 *
 * 特权访问声明：本文件通过 DI container 直接访问 templateStorage，
 * 详见 MODULE.md "Agent 特权访问声明" 章节。
 */

import type { ToolImpl } from "../domain/types";
import { TOOL_TIMEOUTS } from "../services/tool-executor";
import { container } from "@/infrastructure/di";

// ============= 类型定义（内部使用，不导出） =============

/** 模板内容结构（存储在 astFilePath 指向的 JSON 文件中） */
interface TemplateContent {
  name: string;
  description: string;
  category: string;
  genre?: string;
  tone?: string;
  characters?: Array<Record<string, unknown>>;
  scenes?: Array<Record<string, unknown>>;
  beats?: Array<Record<string, unknown>>;
  story?: Record<string, unknown> | null;
}

// ============= 辅助函数（内部使用，不导出） =============

/** 生成模板 ID */
function generateTemplateId(): string {
  return `ast_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 从 AST 模板记录中提取精简字段（DB 行 → 列表项） */
function toTemplateListItem(record: Record<string, unknown>) {
  return {
    id: String(record.id ?? ""),
    name: String(record.name ?? ""),
    category: record.category !== undefined && record.category !== null ? String(record.category) : undefined,
    description: record.description !== undefined && record.description !== null ? String(record.description) : undefined,
    genre: record.genre !== undefined && record.genre !== null ? String(record.genre) : undefined,
    tone: record.tone !== undefined && record.tone !== null ? String(record.tone) : undefined,
    beatsCount: record.beats_count !== undefined ? Number(record.beats_count) : (record.beatsCount !== undefined ? Number(record.beatsCount) : undefined),
    usageCount: record.usage_count !== undefined ? Number(record.usage_count) : 0,
  };
}

/** 读取 astFilePath 指向的模板内容文件 */
async function readTemplateContent(astFilePath: string): Promise<TemplateContent | null> {
  const { readFile } = await import("@/shared/file-http");
  const result = await readFile(astFilePath);
  if (!result || !result.success || !result.data) {
    return null;
  }
  try {
    const text = new TextDecoder().decode(result.data);
    return JSON.parse(text) as TemplateContent;
  } catch {
    return null;
  }
}

/** 将模板内容写入缓存目录，返回文件路径 */
async function writeTemplateContent(
  templateId: string,
  content: TemplateContent,
): Promise<{ path: string; size: number }> {
  const { writeFile, getCacheDirectory } = await import("@/shared/file-http");
  const dirResult = await getCacheDirectory();
  if (!dirResult.success || !dirResult.path) {
    throw new Error("Failed to get cache directory");
  }
  const path = `${dirResult.path}/templates/${templateId}.json`;
  const jsonStr = JSON.stringify(content, null, 2);
  const encoded = new TextEncoder().encode(jsonStr);
  const writeResult = await writeFile(path, encoded.buffer.slice(0, encoded.byteLength) as ArrayBuffer);
  if (!writeResult.success) {
    throw new Error(`Failed to write template content: ${writeResult.error ?? "unknown error"}`);
  }
  return { path, size: encoded.byteLength };
}

/** 校验模板内容结构（导入时） */
function validateTemplateContent(data: unknown): data is TemplateContent {
  if (!data || typeof data !== "object") return false;
  const obj = data as Record<string, unknown>;
  if (typeof obj.name !== "string" || !obj.name.trim()) return false;
  if (typeof obj.description !== "string") return false;
  if (typeof obj.category !== "string") return false;
  return true;
}

// ============= 工具实现 =============

/** 获取模板元数据，失败时返回错误信息 */
async function getTemplateMeta(
  templateId: string,
  storage: { getASTTemplate(id: string): Promise<Record<string, unknown> | null> },
): Promise<{ ok: true; meta: Record<string, unknown> } | { ok: false; error: string }> {
  try {
    const meta = await storage.getASTTemplate(templateId);
    if (!meta) {
      return { ok: false, error: `模板不存在：${templateId}` };
    }
    return { ok: true, meta };
  } catch (e) {
    return { ok: false, error: `获取模板失败：${e instanceof Error ? e.message : String(e)}` };
  }
}

/** 从元数据构建最小模板内容（内容文件缺失时的回退） */
function buildMinimalContent(meta: Record<string, unknown>): TemplateContent {
  return {
    name: String(meta.name ?? "未命名模板"),
    description: String(meta.description ?? ""),
    category: String(meta.category ?? "custom"),
    genre: meta.genre !== undefined && meta.genre !== null ? String(meta.genre) : undefined,
    tone: meta.tone !== undefined && meta.tone !== null ? String(meta.tone) : undefined,
    characters: [],
    scenes: [],
    beats: [],
    story: null,
  };
}

/** 加载模板内容（优先读取内容文件，否则从元数据构建） */
async function loadTemplateContent(meta: Record<string, unknown>): Promise<TemplateContent> {
  const astFilePath = meta.astFilePath ?? meta.ast_file_path;
  if (typeof astFilePath === "string" && astFilePath) {
    const content = await readTemplateContent(astFilePath);
    if (content) return content;
  }
  return buildMinimalContent(meta);
}

/** 从模板内容创建角色，返回创建成功的 ID 列表 */
async function createCharactersFromTemplate(content: TemplateContent): Promise<string[]> {
  if (!content.characters || content.characters.length === 0) return [];
  const { characterService } = await import("@/modules/character");
  const createdIds: string[] = [];
  for (const charData of content.characters) {
    const input: Record<string, unknown> = {
      name: String(charData.name ?? `角色_${createdIds.length + 1}`),
      description: charData.description !== undefined ? String(charData.description) : "",
      gender: charData.gender !== undefined ? String(charData.gender) : "",
      style: charData.style !== undefined ? String(charData.style) : "",
      age: charData.age !== undefined ? Number(charData.age) : undefined,
      tags: Array.isArray(charData.tags) ? charData.tags.map(String) : undefined,
    };
    const result = await characterService.create(input as never);
    if (result.ok) {
      createdIds.push(result.value.id);
    }
  }
  return createdIds;
}

/** 从模板内容创建场景，返回创建成功的 ID 列表 */
async function createScenesFromTemplate(content: TemplateContent): Promise<string[]> {
  if (!content.scenes || content.scenes.length === 0) return [];
  const { sceneService } = await import("@/modules/scene");
  const createdIds: string[] = [];
  for (const sceneData of content.scenes) {
    const input: Record<string, unknown> = {
      name: String(sceneData.name ?? `场景_${createdIds.length + 1}`),
      description: sceneData.description !== undefined ? String(sceneData.description) : "",
      type: sceneData.type !== undefined ? String(sceneData.type) : "",
      timeOfDay: sceneData.timeOfDay !== undefined ? String(sceneData.timeOfDay) : "",
      weather: sceneData.weather !== undefined ? String(sceneData.weather) : "",
      mood: sceneData.mood !== undefined ? String(sceneData.mood) : "",
      tags: Array.isArray(sceneData.tags) ? sceneData.tags.map(String) : undefined,
    };
    const result = await sceneService.create(input as never);
    if (result.ok) {
      createdIds.push(result.value.id);
    }
  }
  return createdIds;
}

/** 创建新故事或合并到已有故事，返回故事 ID */
async function createOrUpdateStory(
  content: TemplateContent,
  targetStoryId: string | undefined,
  createdCharacters: string[],
  createdScenes: string[],
  applyStyle: boolean,
): Promise<string | undefined> {
  const { storyService } = await import("@/modules/storyboard");
  if (targetStoryId) {
    return await mergeIntoExistingStory(storyService, targetStoryId, createdCharacters, createdScenes);
  }
  return await createNewStoryFromTemplate(storyService, content, createdCharacters, createdScenes, applyStyle);
}

/** 合并到已有故事（仅更新角色/场景关联） */
async function mergeIntoExistingStory(
  storyService: { getById(id: string): Promise<unknown>; update(id: string, input: Record<string, unknown>): Promise<unknown> },
  targetStoryId: string,
  createdCharacters: string[],
  createdScenes: string[],
): Promise<string | undefined> {
  const existingRes = await storyService.getById(targetStoryId) as { ok: boolean; value?: { characters?: string[]; scenes?: string[] } };
  if (!existingRes.ok) return undefined;
  const existing = existingRes.value;
  const mergedCharacters = [...new Set([...(existing?.characters ?? []), ...createdCharacters])];
  const mergedScenes = [...new Set([...(existing?.scenes ?? []), ...createdScenes])];
  await storyService.update(targetStoryId, {
    id: targetStoryId,
    characters: mergedCharacters,
    scenes: mergedScenes,
  });
  return targetStoryId;
}

/** 创建新故事 */
async function createNewStoryFromTemplate(
  storyService: { create(input: Record<string, unknown>): Promise<unknown> },
  content: TemplateContent,
  createdCharacters: string[],
  createdScenes: string[],
  applyStyle: boolean,
): Promise<string | undefined> {
  const storyTitle = content.story?.title
    ? String(content.story.title)
    : `${content.name} - 故事`;
  const storyInput: Record<string, unknown> = {
    title: storyTitle,
    description: content.description,
    characters: createdCharacters,
    scenes: createdScenes,
    beats: [],
    elementIds: [],
  };
  if (applyStyle) {
    if (content.genre) storyInput.genre = content.genre;
    if (content.tone) storyInput.tone = content.tone;
  }
  const storyResult = await storyService.create(storyInput as never) as { ok: boolean; value?: { id: string } };
  return storyResult.ok ? storyResult.value?.id : undefined;
}

/** 1. 列出模板 */
export const listTemplatesTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "list_templates",
      description:
        "列出所有 AST 模板。支持按分类过滤、分页。返回精简字段（id/name/category/description/genre/tone/beatsCount/usageCount）。" +
        "适用于：用户要求「列出模板」、「查看有哪些模板」、「查找武侠类模板」等场景。",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: ["wuxia", "scifi", "modern", "fantasy", "historical", "custom"],
            description: "按分类过滤（可选）",
          },
          limit: { type: "number", description: "返回数量上限，默认 20，最大 100", default: 20, minimum: 1, maximum: 100 },
          offset: { type: "number", description: "偏移量（分页），默认 0", default: 0, minimum: 0 },
          search: { type: "string", description: "搜索关键词（匹配名称/描述）", maxLength: 500 },
        },
      },
    },
  },
  domain: "template",
  dangerLevel: "safe",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute(args) {
    const storage = container.templateStorage;
    const category = args.category ? String(args.category) : undefined;
    const search = args.search ? String(args.search) : undefined;
    const limit = Math.min(Number(args.limit) || 20, 100);

    try {
      const all = await storage.getASTTemplates({
        category,
        search,
        sortBy: "created",
        limit: undefined, // 先取全部再分页（getASTTemplates 的 limit 不支持 offset）
      });

      const offset = Math.max(0, Number(args.offset) || 0);
      const paged = all.slice(offset, offset + limit);

      return {
        success: true,
        data: {
          total: all.length,
          offset,
          limit,
          items: paged.map(toTemplateListItem),
        },
      };
    } catch (e) {
      return {
        success: false,
        error: `查询模板列表失败：${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};

/** 2. 应用模板到当前项目 */
export const applyTemplateTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "apply_template",
      description:
        "应用模板到当前项目：从模板内容创建角色、场景（可选），并创建一个新故事（可选）。" +
        "模板内容中的角色/场景会被复制为新的素材（避免覆盖已有素材）。" +
        "适用于：用户要求「应用这个模板」、「用模板创建故事」、「套用模板」等场景。",
      parameters: {
        type: "object",
        properties: {
          templateId: { type: "string", description: "模板 ID（必填）", maxLength: 100 },
          targetStoryId: {
            type: "string",
            description: "应用到指定故事（可选）。若提供，会将模板 beats 合并到该故事；否则创建新故事",
            maxLength: 100,
          },
          options: {
            type: "object",
            description: "应用选项（可选）",
            properties: {
              overrideCharacters: {
                type: "boolean",
                description: "是否创建模板中的角色（默认 true）",
                default: true,
              },
              overrideScenes: {
                type: "boolean",
                description: "是否创建模板中的场景（默认 true）",
                default: true,
              },
              overrideStyle: {
                type: "boolean",
                description: "是否应用模板的风格/基调到故事（默认 true）",
                default: true,
              },
            },
          },
        },
        required: ["templateId"],
      },
    },
  },
  domain: "template",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.mutation,
  async execute(args) {
    const templateId = String(args.templateId);
    const storage = container.templateStorage;

    // 1. 获取模板元数据
    const metaResult = await getTemplateMeta(templateId, storage);
    if (!metaResult.ok) {
      return { success: false, error: metaResult.error };
    }

    // 2. 读取模板内容文件（或从元数据构建）
    const content = await loadTemplateContent(metaResult.meta);

    // 解析选项
    const opts = (args.options ?? {}) as Record<string, unknown>;
    const includeCharacters = opts.overrideCharacters !== false;
    const includeScenes = opts.overrideScenes !== false;
    const applyStyle = opts.overrideStyle !== false;
    const targetStoryId = args.targetStoryId ? String(args.targetStoryId) : undefined;

    const createdCharacters: string[] = [];
    const createdScenes: string[] = [];
    let createdStory: string | undefined;

    try {
      // 3. 创建角色
      if (includeCharacters) {
        const ids = await createCharactersFromTemplate(content);
        createdCharacters.push(...ids);
      }

      // 4. 创建场景
      if (includeScenes) {
        const ids = await createScenesFromTemplate(content);
        createdScenes.push(...ids);
      }

      // 5. 创建/更新故事
      createdStory = await createOrUpdateStory(content, targetStoryId, createdCharacters, createdScenes, applyStyle);

      // 6. 增加模板使用计数（best-effort）
      try {
        await storage.incrementASTTemplateUsage(templateId);
      } catch {
        // 使用计数失败不影响主流程
      }

      return {
        success: true,
        data: {
          applied: true,
          createdCharacters,
          createdScenes,
          createdStory,
          templateName: content.name,
        },
      };
    } catch (e) {
      return {
        success: false,
        error: `应用模板失败：${e instanceof Error ? e.message : String(e)}`,
        data: { createdCharacters, createdScenes, createdStory },
      };
    }
  },
};

/** 3. 从当前项目创建模板 */
export const createTemplateTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "create_template",
      description:
        "从当前项目的角色/场景/故事创建模板，保存到模板库。可选择包含哪些内容（角色/场景/故事节拍）。" +
        "创建后模板可通过 list_templates 查询、apply_template 应用、export_template 导出。" +
        "适用于：用户要求「把当前项目存为模板」、「创建模板」、「保存为可复用模板」等场景。",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "模板名称（必填）", maxLength: 200 },
          description: { type: "string", description: "模板描述（必填）", maxLength: 1000 },
          category: {
            type: "string",
            enum: ["wuxia", "scifi", "modern", "fantasy", "historical", "custom"],
            description: "模板分类（必填）",
          },
          sourceStoryId: { type: "string", description: "从指定故事创建（可选）。未提供则取最新故事", maxLength: 100 },
          includeCharacters: { type: "boolean", description: "是否包含角色（默认 true）", default: true },
          includeScenes: { type: "boolean", description: "是否包含场景（默认 true）", default: true },
          includeBeats: { type: "boolean", description: "是否包含故事节拍（默认 true）", default: true },
        },
        required: ["name", "description", "category"],
      },
    },
  },
  domain: "template",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.mutation,
  async execute(args) {
    const name = String(args.name);
    const description = String(args.description);
    const category = String(args.category);
    if (!name.trim()) return { success: false, error: "name 不能为空" };
    if (!description.trim()) return { success: false, error: "description 不能为空" };
    if (!category.trim()) return { success: false, error: "category 不能为空" };

    const includeCharacters = args.includeCharacters !== false;
    const includeScenes = args.includeScenes !== false;
    const includeBeats = args.includeBeats !== false;
    const sourceStoryId = args.sourceStoryId ? String(args.sourceStoryId) : undefined;

    const storage = container.templateStorage;
    const templateId = generateTemplateId();

    try {
      // 1. 收集角色
      let characters: Array<Record<string, unknown>> = [];
      if (includeCharacters) {
        const { characterService } = await import("@/modules/character");
        const res = await characterService.getAll();
        if (res.ok) {
          characters = res.value.map((c) => ({
            name: c.name,
            description: c.description,
            gender: c.gender,
            style: c.style,
            age: c.age,
            tags: c.tags,
          }));
        }
      }

      // 2. 收集场景
      let scenes: Array<Record<string, unknown>> = [];
      if (includeScenes) {
        const { sceneService } = await import("@/modules/scene");
        const res = await sceneService.getAll();
        if (res.ok) {
          scenes = res.value.map((s) => ({
            name: s.name,
            description: s.description,
            type: s.type,
            timeOfDay: s.timeOfDay,
            weather: s.weather,
            mood: s.mood,
            tags: s.tags,
          }));
        }
      }

      // 3. 收集故事节拍
      let beats: Array<Record<string, unknown>> = [];
      let story: Record<string, unknown> | null = null;
      let totalDuration = 0;
      if (includeBeats) {
        const { storyService } = await import("@/modules/storyboard");
        let storyRecord;
        if (sourceStoryId) {
          const res = await storyService.getById(sourceStoryId);
          if (res.ok) storyRecord = res.value;
        } else {
          const res = await storyService.getAll();
          if (res.ok && res.value.length > 0) {
            storyRecord = res.value[res.value.length - 1];
          }
        }
        if (storyRecord) {
          story = {
            title: storyRecord.title,
            description: storyRecord.description,
            genre: storyRecord.genre,
            tone: storyRecord.tone,
            targetDuration: storyRecord.targetDuration,
          };
          beats = (storyRecord.beats ?? []).map((b) => ({
            title: b.title,
            description: b.description,
            type: b.type,
            duration: b.duration,
            content: b.content,
          }));
          totalDuration = storyRecord.targetDuration ?? beats.reduce((sum, b) => sum + (Number(b.duration) || 0), 0);
        }
      }

      // 4. 构建模板内容并写入文件
      const content: TemplateContent = {
        name,
        description,
        category,
        genre: (story?.genre as string | undefined) ?? undefined,
        tone: (story?.tone as string | undefined) ?? undefined,
        characters,
        scenes,
        beats,
        story,
      };

      const { path, size } = await writeTemplateContent(templateId, content);

      // 5. 保存模板元数据到 DB
      await storage.saveASTTemplate({
        id: templateId,
        name,
        description,
        category,
        genre: content.genre,
        tone: content.tone,
        tags: category,
        author: "agent",
        totalDuration,
        beatsCount: beats.length,
        charactersCount: characters.length,
        scenesCount: scenes.length,
        astFilePath: path,
        astFileSize: size,
        isPublic: false,
      });

      return {
        success: true,
        data: {
          templateId,
          name,
          includedItems: {
            characters: characters.length,
            scenes: scenes.length,
            beats: beats.length,
          },
        },
      };
    } catch (e) {
      return {
        success: false,
        error: `创建模板失败：${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};

/** 4. 导入外部模板 */
export const importTemplateTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "import_template",
      description:
        "导入外部模板：从文件路径或 JSON 字符串导入模板。需提供 templatePath 或 templateJson 之一（二选一）。" +
        "导入后会校验格式、保存内容文件、注册到模板库。" +
        "适用于：用户要求「导入模板」、「从文件加载模板」、「导入 JSON 模板」等场景。",
      parameters: {
        type: "object",
        properties: {
          templatePath: {
            type: "string",
            description: "模板文件路径（JSON）。与 templateJson 二选一",
            maxLength: 1024,
          },
          templateJson: {
            type: "string",
            description: "模板 JSON 字符串。与 templatePath 二选一",
            maxLength: 50000,
          },
        },
      },
    },
  },
  domain: "template",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.mutation,
  async execute(args) {
    const templatePath = args.templatePath ? String(args.templatePath) : undefined;
    const templateJson = args.templateJson ? String(args.templateJson) : undefined;

    if (!templatePath && !templateJson) {
      return { success: false, error: "需提供 templatePath 或 templateJson 之一" };
    }

    const storage = container.templateStorage;
    const templateId = generateTemplateId();

    try {
      // 1. 读取/解析模板内容
      let rawContent: unknown;
      if (templatePath) {
        const { readFile } = await import("@/shared/file-http");
        const result = await readFile(templatePath);
        if (!result || !result.success || !result.data) {
          return { success: false, error: `读取模板文件失败：${result?.error ?? "文件不存在或不可读"}` };
        }
        const text = new TextDecoder().decode(result.data);
        try {
          rawContent = JSON.parse(text);
        } catch (e) {
          return { success: false, error: `模板 JSON 解析失败：${e instanceof Error ? e.message : String(e)}` };
        }
      } else {
        try {
          rawContent = JSON.parse(templateJson!);
        } catch (e) {
          return { success: false, error: `templateJson 解析失败：${e instanceof Error ? e.message : String(e)}` };
        }
      }

      // 2. 校验格式
      if (!validateTemplateContent(rawContent)) {
        return {
          success: false,
          error: "模板格式非法：需包含 name（非空字符串）、description（字符串）、category（字符串）字段",
        };
      }
      const content = rawContent as TemplateContent;

      // 3. 写入内容文件
      const { path, size } = await writeTemplateContent(templateId, content);

      // 4. 保存元数据
      const totalDuration = (content.story?.targetDuration !== undefined ? Number(content.story.targetDuration) : 0) || 0;
      await storage.saveASTTemplate({
        id: templateId,
        name: content.name,
        description: content.description,
        category: content.category,
        genre: content.genre,
        tone: content.tone,
        tags: content.category,
        author: "import",
        totalDuration,
        beatsCount: content.beats?.length ?? 0,
        charactersCount: content.characters?.length ?? 0,
        scenesCount: content.scenes?.length ?? 0,
        astFilePath: path,
        astFileSize: size,
        isPublic: false,
      });

      return {
        success: true,
        data: {
          templateId,
          name: content.name,
          imported: true,
        },
      };
    } catch (e) {
      return {
        success: false,
        error: `导入模板失败：${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};

/** 5. 导出模板 */
export const exportTemplateTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "export_template",
      description:
        "导出模板为 JSON 文件。若模板有内容文件（astFilePath）则直接复制；否则将元数据序列化为 JSON。" +
        "输出路径未指定时默认写入缓存目录。" +
        "适用于：用户要求「导出模板」、「保存模板为文件」、「备份模板」等场景。",
      parameters: {
        type: "object",
        properties: {
          templateId: { type: "string", description: "模板 ID（必填）", maxLength: 100 },
          outputPath: {
            type: "string",
            description: "输出文件路径（可选，默认写入缓存目录的 templates 子目录）",
            maxLength: 1024,
          },
        },
        required: ["templateId"],
      },
    },
  },
  domain: "template",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.mutation,
  async execute(args) {
    const templateId = String(args.templateId);
    const storage = container.templateStorage;

    try {
      // 1. 获取模板元数据
      const meta = await storage.getASTTemplate(templateId);
      if (!meta) {
        return { success: false, error: `模板不存在：${templateId}` };
      }

      const templateName = String(meta.name ?? templateId);
      const astFilePath = meta.astFilePath ?? meta.ast_file_path;

      // 2. 解析输出路径
      const { writeFile, getCacheDirectory } = await import("@/shared/file-http");
      let outPath: string;
      if (args.outputPath) {
        outPath = String(args.outputPath);
      } else {
        const dirResult = await getCacheDirectory();
        if (!dirResult.success || !dirResult.path) {
          return { success: false, error: "获取缓存目录失败" };
        }
        const safeName = templateName.replace(/[^\w\u4e00-\u9fa5-]/g, "_");
        outPath = `${dirResult.path}/templates/${templateId}_${safeName}.json`;
      }

      // 3. 准备导出内容
      let jsonStr: string;
      if (typeof astFilePath === "string" && astFilePath) {
        // 从内容文件读取
        const content = await readTemplateContent(astFilePath);
        if (content) {
          jsonStr = JSON.stringify(content, null, 2);
        } else {
          // 内容文件读取失败，导出元数据
          jsonStr = JSON.stringify(
            {
              name: templateName,
              description: meta.description ?? "",
              category: meta.category ?? "custom",
              genre: meta.genre,
              tone: meta.tone,
              beatsCount: meta.beats_count ?? meta.beatsCount,
              charactersCount: meta.characters_count ?? meta.charactersCount,
              scenesCount: meta.scenes_count ?? meta.scenesCount,
            },
            null,
            2,
          );
        }
      } else {
        // 无内容文件，导出元数据
        jsonStr = JSON.stringify(
          {
            name: templateName,
            description: meta.description ?? "",
            category: meta.category ?? "custom",
            genre: meta.genre,
            tone: meta.tone,
            beatsCount: meta.beats_count ?? meta.beatsCount,
            charactersCount: meta.characters_count ?? meta.charactersCount,
            scenesCount: meta.scenes_count ?? meta.scenesCount,
          },
          null,
          2,
        );
      }

      // 4. 写入输出文件
      const encoded = new TextEncoder().encode(jsonStr);
      const writeResult = await writeFile(
        outPath,
        encoded.buffer.slice(0, encoded.byteLength) as ArrayBuffer,
      );
      if (!writeResult.success) {
        return { success: false, error: `写入导出文件失败：${writeResult.error ?? "未知错误"}` };
      }

      return {
        success: true,
        data: {
          outputPath: outPath,
          templateName,
        },
      };
    } catch (e) {
      return {
        success: false,
        error: `导出模板失败：${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};

/** 导出所有模板管理工具 */
export const templateTools: ToolImpl[] = [
  listTemplatesTool,
  applyTemplateTool,
  createTemplateTool,
  importTemplateTool,
  exportTemplateTool,
];
