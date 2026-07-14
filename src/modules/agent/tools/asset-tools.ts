/**
 * 素材管理工具（Asset Tools）
 *
 * 包含工具：
 * - list_characters：查询角色列表（支持过滤/分页）
 * - list_scenes：查询场景列表（支持过滤/分页）
 * - get_character：获取角色详情
 * - get_scene：获取场景详情
 * - search_assets：跨资产搜索
 *
 * 设计要点：
 * - 调用 characterService / sceneService 的 public API（Result<T> 模式）
 * - 支持丰富的过滤参数（name/style/tag/limit）
 * - 返回精简字段（避免 token 浪费），get_* 返回完整字段
 * - 错误处理完善，service 失败时返回友好错误信息
 */

import type { ToolImpl } from "@/domain/types/agent-tools";
import { TOOL_TIMEOUTS } from "@/shared/constants/tool-timeouts";

// ============= 工具实现 =============

/** 列出角色（支持过滤/分页） */
export const listCharactersTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "list_characters",
      description: "列出所有角色。支持按名称、风格、标签过滤，可限制返回数量。返回精简字段（id/name/style/gender/thumbnailPath）。",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "按名称模糊匹配（包含该字符串）", maxLength: 200 },
          style: { type: "string", description: "按风格精确匹配（如：日式动漫、写实、赛博朋克）", maxLength: 200 },
          tag: { type: "string", description: "按标签过滤（tags 数组中包含该值）", maxLength: 200 },
          gender: { type: "string", description: "按性别过滤（男性/女性/中性/无性别）", maxLength: 200 },
          limit: { type: "number", description: "返回数量上限，默认 20，最大 100", default: 20, minimum: 1, maximum: 100 },
          offset: { type: "number", description: "偏移量（分页），默认 0", default: 0, minimum: 0 },
        },
      },
    },
  },
  domain: "asset",
  dangerLevel: "safe",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute(args) {
    const { characterService } = await import("@/modules/character");
    const result = await characterService.getAll();
    if (!result.ok) {
      return { success: false, error: `查询角色失败：${result.error.message}` };
    }

    let filtered = result.value;
    if (args.name) {
      const kw = String(args.name).toLowerCase();
      filtered = filtered.filter((c) => c.name.toLowerCase().includes(kw));
    }
    if (args.style) {
      filtered = filtered.filter((c) => c.style === args.style);
    }
    if (args.tag) {
      const tag = String(args.tag);
      filtered = filtered.filter((c) => c.tags?.includes(tag) ?? false);
    }
    if (args.gender) {
      filtered = filtered.filter((c) => c.gender === args.gender);
    }

    const offset = Number(args.offset) || 0;
    const limit = Math.min(Number(args.limit) || 20, 100);
    const paged = filtered.slice(offset, offset + limit);

    return {
      success: true,
      data: {
        total: filtered.length,
        offset,
        limit,
        items: paged.map((c) => ({
          id: c.id,
          name: c.name,
          style: c.style,
          gender: c.gender,
          age: c.age,
          thumbnailPath: c.thumbnailPath,
          tags: c.tags,
          useCount: c.useCount,
        })),
      },
    };
  },
};

/** 列出场景（支持过滤/分页） */
export const listScenesTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "list_scenes",
      description: "列出所有场景。支持按名称、类型、天气、情绪过滤，可限制返回数量。返回精简字段。",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "按名称模糊匹配", maxLength: 200 },
          type: { type: "string", description: "按类型过滤（如：室内、室外、城市、自然）", maxLength: 200 },
          mood: { type: "string", description: "按情绪过滤（如：温馨、紧张、神秘）", maxLength: 200 },
          weather: { type: "string", description: "按天气过滤（如：晴天、雨天、夜晚）", maxLength: 200 },
          tag: { type: "string", description: "按标签过滤", maxLength: 200 },
          limit: { type: "number", description: "返回数量上限，默认 20，最大 100", default: 20, minimum: 1, maximum: 100 },
          offset: { type: "number", description: "偏移量（分页），默认 0", default: 0, minimum: 0 },
        },
      },
    },
  },
  domain: "asset",
  dangerLevel: "safe",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute(args) {
    const { sceneService } = await import("@/modules/scene");
    const result = await sceneService.getAll();
    if (!result.ok) {
      return { success: false, error: `查询场景失败：${result.error.message}` };
    }

    let filtered = result.value;
    if (args.name) {
      const kw = String(args.name).toLowerCase();
      filtered = filtered.filter((s) => s.name.toLowerCase().includes(kw));
    }
    if (args.type) {
      filtered = filtered.filter((s) => s.type === args.type);
    }
    if (args.mood) {
      filtered = filtered.filter((s) => s.mood === args.mood);
    }
    if (args.weather) {
      filtered = filtered.filter((s) => s.weather === args.weather);
    }
    if (args.tag) {
      const tag = String(args.tag);
      filtered = filtered.filter((s) => s.tags?.includes(tag) ?? false);
    }

    const offset = Number(args.offset) || 0;
    const limit = Math.min(Number(args.limit) || 20, 100);
    const paged = filtered.slice(offset, offset + limit);

    return {
      success: true,
      data: {
        total: filtered.length,
        offset,
        limit,
        items: paged.map((s) => ({
          id: s.id,
          name: s.name,
          type: s.type,
          timeOfDay: s.timeOfDay,
          weather: s.weather,
          mood: s.mood,
          thumbnailPath: s.thumbnailPath,
          tags: s.tags,
          useCount: s.useCount,
        })),
      },
    };
  },
};

/** 获取角色详情 */
export const getCharacterTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "get_character",
      description: "获取角色完整详情（含外观、服装、生成提示词等所有字段）。",
      parameters: {
        type: "object",
        properties: {
          characterId: { type: "string", description: "角色 ID", maxLength: 100 },
        },
        required: ["characterId"],
      },
    },
  },
  domain: "asset",
  dangerLevel: "safe",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute(args) {
    const { characterService } = await import("@/modules/character");
    const id = String(args.characterId);
    const result = await characterService.getById(id);
    if (!result.ok) {
      return { success: false, error: `获取角色失败：${result.error.message}` };
    }
    return { success: true, data: result.value };
  },
};

/** 获取场景详情 */
export const getSceneTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "get_scene",
      description: "获取场景完整详情（含灯光、元素、相机、生成提示词等所有字段）。",
      parameters: {
        type: "object",
        properties: {
          sceneId: { type: "string", description: "场景 ID", maxLength: 100 },
        },
        required: ["sceneId"],
      },
    },
  },
  domain: "asset",
  dangerLevel: "safe",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute(args) {
    const { sceneService } = await import("@/modules/scene");
    const id = String(args.sceneId);
    const result = await sceneService.getById(id);
    if (!result.ok) {
      return { success: false, error: `获取场景失败：${result.error.message}` };
    }
    return { success: true, data: result.value };
  },
};

/** 跨资产搜索（角色 + 场景） */
export const searchAssetsTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "search_assets",
      description: "跨资产搜索（同时搜索角色和场景）。按关键词匹配名称、描述、标签。返回合并结果，标注类型。",
      parameters: {
        type: "object",
        properties: {
          keyword: { type: "string", description: "搜索关键词（匹配名称、描述、标签）", maxLength: 500 },
          assetType: { type: "string", enum: ["all", "character", "scene"], description: "资产类型过滤，默认 all", default: "all" },
          limit: { type: "number", description: "每类资产返回上限，默认 10", default: 10, minimum: 1, maximum: 50 },
        },
        required: ["keyword"],
      },
    },
  },
  domain: "asset",
  dangerLevel: "safe",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute(args) {
    const kw = String(args.keyword).toLowerCase();
    const limit = Math.min(Number(args.limit) || 10, 50);
    const assetType = String(args.assetType || "all");

    const result: { characters: unknown[]; scenes: unknown[] } = { characters: [], scenes: [] };

    if (assetType === "all" || assetType === "character") {
      const { characterService } = await import("@/modules/character");
      const r = await characterService.getAll();
      if (r.ok) {
        result.characters = r.value
          .filter((c) =>
            c.name.toLowerCase().includes(kw) ||
            c.description.toLowerCase().includes(kw) ||
            (c.tags?.some((t) => t.toLowerCase().includes(kw)) ?? false),
          )
          .slice(0, limit)
          .map((c) => ({ id: c.id, name: c.name, style: c.style, type: "character" }));
      }
    }

    if (assetType === "all" || assetType === "scene") {
      const { sceneService } = await import("@/modules/scene");
      const r = await sceneService.getAll();
      if (r.ok) {
        result.scenes = r.value
          .filter((s) =>
            s.name.toLowerCase().includes(kw) ||
            s.description.toLowerCase().includes(kw) ||
            (s.tags?.some((t) => t.toLowerCase().includes(kw)) ?? false),
          )
          .slice(0, limit)
          .map((s) => ({ id: s.id, name: s.name, type: s.type, assetType: "scene" }));
      }
    }

    return {
      success: true,
      data: {
        keyword: args.keyword,
        characters: result.characters,
        scenes: result.scenes,
        total: result.characters.length + result.scenes.length,
      },
    };
  },
};

/** 导出所有素材工具 */
export const assetTools: ToolImpl[] = [
  listCharactersTool,
  listScenesTool,
  getCharacterTool,
  getSceneTool,
  searchAssetsTool,
];
