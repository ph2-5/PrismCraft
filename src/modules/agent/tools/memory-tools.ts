/**
 * 记忆管理工具（Memory Tools）
 *
 * 让 Agent 自己管理记忆系统，借鉴 Letta 的"模型主动调用记忆工具"思想。
 *
 * 包含工具（5 个）：
 * - save_memory：保存事实或偏好到核心记忆
 * - recall_memory：检索归档记忆（关键词匹配）
 * - get_user_preferences：读取所有用户偏好
 * - update_preference：更新单个用户偏好
 * - clear_memory：清空核心记忆或归档记忆
 *
 * 设计要点：
 * - save_memory 是核心工具，Agent 判断什么值得记住并主动保存
 * - recall_memory 用于跨会话恢复上下文（如"上次我们做了什么"）
 * - 所有操作通过 memory-service 的 public API，不直接操作存储
 * - 失败时返回友好错误信息，不阻断 Agent Loop
 */

import type { ToolImpl } from "../domain/types";
import { TOOL_TIMEOUTS } from "../services/tool-executor";
import {
  saveFact,
  updatePreference,
  removeFact,
  removePreference,
  getCoreMemory,
  searchArchivalMemory,
  getAllArchivalMemory,
  deleteArchivalMemory,
  clearCoreMemory,
  getArchivalMemoryCount,
} from "../services/memory-service";

// ============= 工具实现 =============

/** 1. 保存记忆（事实或偏好） */
export const saveMemoryTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "save_memory",
      description:
        "保存信息到长期记忆。可保存两类：1) fact（项目事实，如 source_novel=三体、target_duration=30s）；2) preference（用户偏好，如 preferred_style=赛博朋克）。" +
        "保存后会在后续所有会话的 system prompt 中自动注入，让 Agent 跨会话记住这些信息。" +
        "同 key 会覆盖旧值。适用于：用户明确表达偏好、项目背景信息、重要决策。",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["fact", "preference"],
            description: "记忆类型：fact=项目事实，preference=用户偏好",
          },
          key: {
            type: "string",
            description: "记忆键。fact 常用：source_novel/target_duration/art_style/project_name；preference 常用：preferred_style/preferred_provider/language/theme",
            maxLength: 200,
          },
          value: {
            type: "string",
            description: "记忆值（fact 必须是字符串，preference 会自动转换类型）",
            maxLength: 10000,
          },
        },
        required: ["type", "key", "value"],
      },
    },
  },
  domain: "memory",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute(args) {
    const type = String(args.type) as "fact" | "preference";
    const key = String(args.key);
    const value = String(args.value);

    if (!type || !key || !value) {
      return { success: false, error: "参数缺失：type、key、value 均为必填" };
    }

    if (type !== "fact" && type !== "preference") {
      return { success: false, error: `type 必须是 fact 或 preference，收到：${type}` };
    }

    try {
      if (type === "fact") {
        const ok = await saveFact(key, value);
        if (!ok) {
          return { success: false, error: "保存事实失败：写入存储失败" };
        }
      } else {
        // preference：尝试转换类型
        let prefValue: string | number | boolean = value;
        if (value === "true") prefValue = true;
        else if (value === "false") prefValue = false;
        else if (/^-?\d+$/.test(value)) prefValue = Number(value);

        const ok = await updatePreference(key, prefValue);
        if (!ok) {
          return { success: false, error: "保存偏好失败：写入存储失败" };
        }
      }

      return {
        success: true,
        data: {
          type,
          key,
          value,
          message: `已保存${type === "fact" ? "事实" : "偏好"}：${key} = ${value}`,
        },
      };
    } catch (e) {
      return {
        success: false,
        error: `保存记忆异常：${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};

/** 2. 检索归档记忆 */
export const recallMemoryTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "recall_memory",
      description:
        "检索长期记忆（归档记忆）。按关键词匹配历史会话摘要和重要决策。" +
        "适用于：用户问『上次我们做了什么』、『之前那个项目叫什么』、『你还记得我的偏好吗』等跨会话回忆场景。" +
        "返回按相关性和时间排序的记忆条目。",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "搜索关键词（如『赛博朋克项目』、『角色创建』、『API 配置』）",
            maxLength: 500,
          },
          limit: {
            type: "number",
            description: "返回数量上限，默认 5，最大 20",
            default: 5,
            minimum: 1,
            maximum: 20,
          },
        },
        required: ["query"],
      },
    },
  },
  domain: "memory",
  dangerLevel: "safe",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute(args) {
    const query = String(args.query);
    const limit = Math.min(Number(args.limit) || 5, 20);

    if (!query) {
      return { success: false, error: "query 不能为空" };
    }

    try {
      const results = await searchArchivalMemory(query, limit);

      return {
        success: true,
        data: {
          query,
          count: results.length,
          entries: results.map((e) => ({
            id: e.id,
            type: e.type,
            content: e.content,
            createdAt: e.createdAt,
            tags: e.tags,
          })),
        },
      };
    } catch (e) {
      return {
        success: false,
        error: `检索记忆失败：${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};

/** 3. 获取用户偏好 */
export const getUserPreferencesTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "get_user_preferences",
      description:
        "读取所有已保存的用户偏好和项目事实。返回核心记忆的完整内容。" +
        "适用于：会话开始时了解用户偏好、确认之前保存的信息、诊断记忆问题。",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  domain: "memory",
  dangerLevel: "safe",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute() {
    try {
      const memory = await getCoreMemory();
      const archivalCount = await getArchivalMemoryCount();

      return {
        success: true,
        data: {
          preferences: memory.preferences,
          facts: memory.facts,
          archivalMemoryCount: archivalCount,
          preferenceCount: Object.keys(memory.preferences).length,
          factCount: memory.facts.length,
        },
      };
    } catch (e) {
      return {
        success: false,
        error: `读取偏好失败：${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};

/** 4. 更新偏好（带类型转换） */
export const updatePreferenceTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "update_preference",
      description:
        "更新单个用户偏好。与 save_memory 的 preference 类型类似，但支持显式指定值类型。" +
        "适用于：用户明确说『我偏好XX风格』、『把我的默认 provider 改成 YY』等场景。",
      parameters: {
        type: "object",
        properties: {
          key: {
            type: "string",
            description: "偏好键（如 preferred_style、preferred_provider、language、theme）",
            maxLength: 200,
          },
          value: {
            type: "string",
            description: "偏好值（字符串形式，会自动转换 true/false/数字）",
            maxLength: 10000,
          },
          valueType: {
            type: "string",
            enum: ["string", "number", "boolean"],
            description: "值类型（默认 string）",
          },
        },
        required: ["key", "value"],
      },
    },
  },
  domain: "memory",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute(args) {
    const key = String(args.key);
    const rawValue = String(args.value);
    const valueType = String(args.valueType || "string");

    if (!key || !rawValue) {
      return { success: false, error: "key 和 value 均为必填" };
    }

    let value: string | number | boolean = rawValue;
    try {
      if (valueType === "boolean") {
        value = rawValue === "true";
      } else if (valueType === "number") {
        value = Number(rawValue);
        if (Number.isNaN(value)) {
          return { success: false, error: `value 无法转为 number：${rawValue}` };
        }
      }
    } catch {
      return { success: false, error: `value 类型转换失败` };
    }

    try {
      const ok = await updatePreference(key, value);
      if (!ok) {
        return { success: false, error: "更新偏好失败：写入存储失败" };
      }

      return {
        success: true,
        data: {
          key,
          value,
          valueType,
          message: `已更新偏好：${key} = ${value}（${valueType}）`,
        },
      };
    } catch (e) {
      return {
        success: false,
        error: `更新偏好异常：${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};

/** 5. 删除记忆 */
export const deleteMemoryTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "delete_memory",
      description:
        "删除记忆条目。可删除：1) 单个 fact（按 key）；2) 单个 preference（按 key）；3) 单条归档记忆（按 id）；4) 清空所有核心记忆。" +
        "适用于：用户说『忘记我之前的偏好』、『删除那个错误的事实』、『清空所有记忆』。" +
        "注意：target=all_core 会清空所有核心记忆（不可逆），需要用户确认。",
      parameters: {
        type: "object",
        properties: {
          target: {
            type: "string",
            enum: ["fact", "preference", "archival", "all_core"],
            description: "删除目标：fact=项目事实，preference=用户偏好，archival=归档记忆条目，all_core=清空所有核心记忆",
          },
          key: {
            type: "string",
            description: "目标键（target=fact/preference 时必填）或归档记忆 ID（target=archival 时必填）",
            maxLength: 200,
          },
        },
        required: ["target"],
      },
    },
  },
  domain: "memory",
  dangerLevel: "destructive",
  requiresConfirmation: true,
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute(args) {
    const target = String(args.target);
    const key = args.key ? String(args.key) : "";

    if (target === "fact" || target === "preference") {
      if (!key) {
        return { success: false, error: `target=${target} 时 key 必填` };
      }
      try {
        const ok =
          target === "fact" ? await removeFact(key) : await removePreference(key);
        if (!ok) {
          return { success: false, error: `删除${target}失败` };
        }
        return {
          success: true,
          data: { target, key, message: `已删除${target}：${key}` },
        };
      } catch (e) {
        return {
          success: false,
          error: `删除失败：${e instanceof Error ? e.message : String(e)}`,
        };
      }
    }

    if (target === "archival") {
      if (!key) {
        return { success: false, error: "target=archival 时 key（记忆 ID）必填" };
      }
      try {
        const ok = await deleteArchivalMemory(key);
        if (!ok) {
          return { success: false, error: "删除归档记忆失败" };
        }
        return {
          success: true,
          data: { target, id: key, message: `已删除归档记忆：${key}` },
        };
      } catch (e) {
        return {
          success: false,
          error: `删除归档记忆失败：${e instanceof Error ? e.message : String(e)}`,
        };
      }
    }

    if (target === "all_core") {
      try {
        const ok = await clearCoreMemory();
        if (!ok) {
          return { success: false, error: "清空核心记忆失败" };
        }
        return {
          success: true,
          data: { target, message: "已清空所有核心记忆（偏好 + 事实）" },
        };
      } catch (e) {
        return {
          success: false,
          error: `清空核心记忆失败：${e instanceof Error ? e.message : String(e)}`,
        };
      }
    }

    return { success: false, error: `未知的 target：${target}` };
  },
};

/** 6. 列出归档记忆（不带关键词，按时间倒序） */
export const listArchivalMemoryTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "list_archival_memory",
      description:
        "列出最近的归档记忆条目（按时间倒序）。不进行关键词检索，仅用于浏览历史记忆。" +
        "适用于：用户问『最近保存了什么记忆』、『记忆库里有什么』。",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "返回数量上限，默认 10，最大 50",
            default: 10,
            minimum: 1,
            maximum: 50,
          },
        },
      },
    },
  },
  domain: "memory",
  dangerLevel: "safe",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute(args) {
    const limit = Math.min(Number(args.limit) || 10, 50);

    try {
      const all = await getAllArchivalMemory();
      const sorted = all.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);

      return {
        success: true,
        data: {
          total: all.length,
          count: sorted.length,
          entries: sorted.map((e) => ({
            id: e.id,
            type: e.type,
            content: e.content,
            createdAt: e.createdAt,
            tags: e.tags,
          })),
        },
      };
    } catch (e) {
      return {
        success: false,
        error: `列出归档记忆失败：${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};

/** 导出所有记忆工具 */
export const memoryTools: ToolImpl[] = [
  saveMemoryTool,
  recallMemoryTool,
  getUserPreferencesTool,
  updatePreferenceTool,
  deleteMemoryTool,
  listArchivalMemoryTool,
];
