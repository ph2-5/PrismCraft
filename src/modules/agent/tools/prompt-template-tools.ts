/**
 * 提示词模板工具（Prompt Template Tools）
 *
 * 包含工具（4 个）：
 * - list_prompt_templates：列出提示词模板（支持 category/style/keyword 过滤）
 * - apply_prompt_template：应用模板（替换变量插槽，返回最终提示词）
 * - create_prompt_template：创建用户自定义提示词模板
 * - search_prompt_templates：按关键词搜索模板
 *
 * 与 template-tools.ts 的区别：
 * - template-tools.ts 管理「项目数据模板」（角色/场景/分镜预设组合）
 * - 本工具管理「提示词模板」（生成图片/视频时的 prompt 文本模板）
 *
 * 权限：
 * - list/search：safe（只读）
 * - apply：safe（仅返回文本，不执行生成）
 * - create：limited（有副作用但可恢复）
 */

import type { ToolImpl } from "../domain/types";
import {
  searchPromptTemplates,
  applyPromptTemplate,
  createPromptTemplate,
} from "@/modules/prompt";

// ============= 工具 1：list_prompt_templates =============

const listPromptTemplatesTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "list_prompt_templates",
      description:
        "列出所有提示词模板（含内置高质量模板和用户自定义模板）。可按类别（character/scene/video/story/negative/style）、目标类型（image/video/both）、风格标签筛选。返回模板 id/名称/描述/类别/变量列表等元信息。",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: ["character", "scene", "video", "story", "negative", "style", "custom"],
            description: "按类别筛选（可选）",
          },
          target: {
            type: "string",
            enum: ["image", "video", "both"],
            description: "按目标类型筛选（可选）",
          },
          styleTags: {
            type: "array",
            items: { type: "string" },
            description: "按风格标签筛选（如 anime/cyberpunk/wuxia），任一匹配即返回",
          },
          limit: {
            type: "number",
            description: "返回数量上限（默认 50）",
            minimum: 1,
            maximum: 100,
          },
        },
      },
    },
  },
  domain: "template" as never,
  dangerLevel: "safe",
  async execute(args) {
    const limit = (args.limit as number) ?? 50;
    const templates = await searchPromptTemplates({
      category: args.category as never,
      target: args.target as never,
      styleTags: args.styleTags as string[] | undefined,
    });

    const items = templates.slice(0, limit).map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      target: t.target,
      styleTags: t.styleTags ?? [],
      builtin: t.builtin,
      rating: t.rating,
      hasVariables: (t.variables?.length ?? 0) > 0,
      variableNames: t.variables?.map((v) => v.name) ?? [],
    }));

    return {
      success: true,
      data: {
        total: templates.length,
        returned: items.length,
        templates: items,
      },
    };
  },
};

// ============= 工具 2：apply_prompt_template =============

const applyPromptTemplateTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "apply_prompt_template",
      description:
        "应用提示词模板，将变量插槽（{{character.name}} 等）替换为实际值，返回最终的提示词文本。如果有必填变量未提供值，会在 missingVariables 中列出。返回的 prompt 可直接用于图片/视频生成。",
      parameters: {
        type: "object",
        properties: {
          templateId: {
            type: "string",
            description: "模板 ID（通过 list_prompt_templates 获取）",
            maxLength: 100,
          },
          variables: {
            type: "object",
            description: "变量值映射，key 为变量名（如 'character.name'），value 为替换值",
            additionalProperties: { type: "string" },
          },
        },
        required: ["templateId"],
      },
    },
  },
  domain: "template" as never,
  dangerLevel: "safe",
  async execute(args) {
    const templateId = args.templateId as string;
    const variables = (args.variables as Record<string, string>) ?? {};

    const result = await applyPromptTemplate(templateId, variables);
    if (!result) {
      return {
        success: false,
        error: `模板不存在: ${templateId}`,
      };
    }

    return {
      success: true,
      data: {
        prompt: result.prompt,
        negativePrompt: result.negativePrompt,
        missingVariables: result.missingVariables,
        hasMissing: result.missingVariables.length > 0,
      },
    };
  },
};

// ============= 工具 3：create_prompt_template =============

const createPromptTemplateTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "create_prompt_template",
      description:
        "创建用户自定义提示词模板。模板内容支持变量插槽语法 {{variable.name}}，在 apply_prompt_template 时替换。创建后可通过 list_prompt_templates 查看和使用。",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "模板名称",
            maxLength: 200,
          },
          description: {
            type: "string",
            description: "模板描述",
            maxLength: 1000,
          },
          category: {
            type: "string",
            enum: ["character", "scene", "video", "story", "negative", "style", "custom"],
            description: "模板类别",
          },
          target: {
            type: "string",
            enum: ["image", "video", "both"],
            description: "目标类型",
          },
          content: {
            type: "string",
            description: "模板内容（含 {{变量名}} 插槽）",
            maxLength: 5000,
          },
          negativePrompt: {
            type: "string",
            description: "负面提示词（可选）",
            maxLength: 2000,
          },
          styleTags: {
            type: "array",
            items: { type: "string" },
            description: "风格标签（可选）",
          },
          variables: {
            type: "array",
            description: "变量定义列表（可选）",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "变量名（如 character.name）" },
                description: { type: "string", description: "变量描述" },
                required: { type: "boolean", description: "是否必填" },
                defaultValue: { type: "string", description: "默认值" },
              },
              required: ["name", "description"],
            },
          },
        },
        required: ["name", "description", "category", "target", "content"],
      },
    },
  },
  domain: "template" as never,
  dangerLevel: "limited",
  async execute(args) {
    const template = await createPromptTemplate({
      name: args.name as string,
      description: args.description as string,
      category: args.category as never,
      target: args.target as never,
      content: args.content as string,
      negativePrompt: args.negativePrompt as string | undefined,
      styleTags: args.styleTags as string[] | undefined,
      variables: args.variables as never,
      source: "Agent 创建",
    });

    return {
      success: true,
      data: {
        id: template.id,
        name: template.name,
        message: `提示词模板「${template.name}」创建成功`,
      },
    };
  },
};

// ============= 工具 4：search_prompt_templates =============

const searchPromptTemplatesTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "search_prompt_templates",
      description:
        "按关键词搜索提示词模板（在名称、描述、内容中搜索）。适用于用户描述需求后查找匹配的模板。",
      parameters: {
        type: "object",
        properties: {
          keyword: {
            type: "string",
            description: "搜索关键词（中英文均可）",
            maxLength: 500,
          },
          category: {
            type: "string",
            enum: ["character", "scene", "video", "story", "negative", "style", "custom"],
            description: "限定类别（可选）",
          },
          limit: {
            type: "number",
            description: "返回数量上限（默认 20）",
            minimum: 1,
            maximum: 100,
          },
        },
        required: ["keyword"],
      },
    },
  },
  domain: "template" as never,
  dangerLevel: "safe",
  async execute(args) {
    const keyword = args.keyword as string;
    const limit = (args.limit as number) ?? 20;

    const results = await searchPromptTemplates({
      keyword,
      category: args.category as never,
    });

    const items = results.slice(0, limit).map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      target: t.target,
      styleTags: t.styleTags ?? [],
      rating: t.rating,
      contentPreview: t.content.slice(0, 150) + (t.content.length > 150 ? "..." : ""),
    }));

    return {
      success: true,
      data: {
        keyword,
        total: results.length,
        returned: items.length,
        templates: items,
      },
    };
  },
};

// ============= 导出 =============

/** 提示词模板工具列表 */
export const promptTemplateTools: ToolImpl[] = [
  listPromptTemplatesTool,
  applyPromptTemplateTool,
  createPromptTemplateTool,
  searchPromptTemplatesTool,
];
