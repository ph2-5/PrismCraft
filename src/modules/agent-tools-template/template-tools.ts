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
 * - 辅助函数与类型定义拆分到 template-utils.ts
 * - 错误处理完善，存储/服务失败时返回友好错误信息
 *
 * 特权访问声明：本文件通过 DI container 直接访问 templateStorage，
 * 详见 MODULE.md "Agent 特权访问声明" 章节。
 */

import type { ToolImpl } from "@/domain/types/agent-tools";
import { TOOL_TIMEOUTS } from "@/shared/constants/tool-timeouts";
import { container } from "@/infrastructure/di";
import {
  type TemplateContent,
  generateTemplateId,
  toTemplateListItem,
  writeTemplateContent,
  readTemplateContent,
  validateTemplateContent,
  getTemplateMeta,
  loadTemplateContent,
  createCharactersFromTemplate,
  createScenesFromTemplate,
  createOrUpdateStory,
  collectProjectForTemplate,
  parseTemplateInput,
  buildMetaExportJson,
  resolveExportPath,
} from "./template-utils";

/** 错误信息格式化 */
function formatError(prefix: string, e: unknown): string {
  return `${prefix}：${e instanceof Error ? e.message : String(e)}`;
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
    const offset = Math.max(0, Number(args.offset) || 0);

    try {
      const all = await storage.getASTTemplates({
        category,
        search,
        sortBy: "created",
        limit: undefined, // 先取全部再分页（getASTTemplates 的 limit 不支持 offset）
      });

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
      return { success: false, error: formatError("查询模板列表失败", e) };
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
        error: formatError("应用模板失败", e),
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
      // 1. 收集角色/场景/故事
      const collected = await collectProjectForTemplate({
        name, description, category,
        includeCharacters, includeScenes, includeBeats,
        sourceStoryId,
      });

      // 2. 构建模板内容并写入文件
      const content: TemplateContent = {
        name, description, category,
        genre: collected.genre,
        tone: collected.tone,
        characters: collected.characters,
        scenes: collected.scenes,
        beats: collected.beats,
        story: collected.story,
      };
      const { path, size } = await writeTemplateContent(templateId, content);

      // 3. 保存模板元数据到 DB
      await storage.saveASTTemplate({
        id: templateId,
        name, description, category,
        genre: content.genre,
        tone: content.tone,
        tags: category,
        author: "agent",
        totalDuration: collected.totalDuration,
        beatsCount: collected.beats.length,
        charactersCount: collected.characters.length,
        scenesCount: collected.scenes.length,
        astFilePath: path,
        astFileSize: size,
        isPublic: false,
      });

      return {
        success: true,
        data: {
          templateId, name,
          includedItems: {
            characters: collected.characters.length,
            scenes: collected.scenes.length,
            beats: collected.beats.length,
          },
        },
      };
    } catch (e) {
      return { success: false, error: formatError("创建模板失败", e) };
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

    // 1. 读取/解析模板内容
    const parseResult = await parseTemplateInput(templatePath, templateJson);
    if (!parseResult.ok) {
      return { success: false, error: parseResult.error };
    }

    // 2. 校验格式
    if (!validateTemplateContent(parseResult.content)) {
      return {
        success: false,
        error: "模板格式非法：需包含 name（非空字符串）、description（字符串）、category（字符串）字段",
      };
    }
    const content = parseResult.content;

    const storage = container.templateStorage;
    const templateId = generateTemplateId();

    try {
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
        data: { templateId, name: content.name, imported: true },
      };
    } catch (e) {
      return { success: false, error: formatError("导入模板失败", e) };
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
    const outputPath = args.outputPath ? String(args.outputPath) : undefined;
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
      const pathResult = await resolveExportPath(templateId, templateName, outputPath);
      if (!pathResult.ok) {
        return { success: false, error: pathResult.error };
      }
      const outPath = pathResult.path;

      // 3. 准备导出内容
      const jsonStr = await buildExportJson(astFilePath, meta);

      // 4. 写入输出文件
      const { writeFile } = await import("@/shared/file-http");
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
        data: { outputPath: outPath, templateName },
      };
    } catch (e) {
      return { success: false, error: formatError("导出模板失败", e) };
    }
  },
};

/**
 * 构建导出 JSON 字符串：优先从内容文件读取，否则从元数据构建。
 */
async function buildExportJson(
  astFilePath: unknown,
  meta: Record<string, unknown>,
): Promise<string> {
  if (typeof astFilePath === "string" && astFilePath) {
    const content = await readTemplateContent(astFilePath);
    if (content) {
      return JSON.stringify(content, null, 2);
    }
  }
  return buildMetaExportJson(meta);
}

/** 导出所有模板管理工具 */
export const templateTools: ToolImpl[] = [
  listTemplatesTool,
  applyTemplateTool,
  createTemplateTool,
  importTemplateTool,
  exportTemplateTool,
];
