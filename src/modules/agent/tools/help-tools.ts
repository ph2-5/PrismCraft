/**
 * 教学帮助工具（Help Tools）
 *
 * 包含工具：
 * - explain_feature：解释项目功能（"这个按钮是干什么的"）
 * - show_tutorial：显示教程（按主题/级别）
 * - get_help：获取帮助文档（支持搜索/分类）
 * - list_available_commands：列出可用工具/命令（从 toolRegistry 动态获取）
 * - suggest_next_action：建议下一步操作（基于当前项目状态 + LLM 推理）
 * - get_keyboard_shortcuts：获取快捷键列表
 *
 * 设计要点：
 * - 优先从静态字典（FEATURE_DOCS / TUTORIALS / HELP_DOCS / KEYBOARD_SHORTCUTS）返回
 * - 字典内容已拆分到 help-tools-data.ts，本文件只含工具实现
 * - 字典中没有的条目，用 container.textProvider 生成（explain_feature / show_tutorial）
 * - list_available_commands 从 toolRegistry 动态获取，不硬编码工具列表
 * - suggest_next_action 查询项目状态（角色/场景/故事/视频任务）后用 textProvider 推理
 * - 所有操作 try/catch，失败时返回友好错误信息
 * - 静态字典内容基于项目实际功能，真实可用
 *
 * 特权访问声明：本文件通过 DI container 直接访问 videoTaskStorage，
 * 详见 MODULE.md "Agent 特权访问声明" 章节。
 */

import type { ToolImpl } from "../domain/types";
import { TOOL_TIMEOUTS } from "../services/tool-executor";
import { toolRegistry } from "../services/tool-registry";
import { container } from "@/infrastructure/di";
import {
  FEATURE_DOCS,
  TUTORIALS,
  HELP_DOCS,
  KEYBOARD_SHORTCUTS,
  safeParseJson,
} from "./help-tools-data";

// ============= 工具实现 =============

/** 解释项目功能 */
export const explainFeatureTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "explain_feature",
      description:
        "解释项目功能（「这个按钮是干什么的」）。根据功能名返回功能说明、使用提示和相关功能。" +
        "支持的功能名如：shot-page（分镜页面）、character-editor（角色编辑器）、scene-editor（场景编辑器）、" +
        "video-generation（视频生成）、api-config（API配置）、story-page（故事页面）等。" +
        "如果功能名不在已知列表中，将基于功能名推测说明。",
      parameters: {
        type: "object",
        properties: {
          featureName: {
            type: "string",
            description: "要解释的功能名（如 shot-page、character-editor、video-generation）",
            maxLength: 100,
          },
        },
        required: ["featureName"],
      },
    },
  },
  domain: "help",
  dangerLevel: "safe",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute(args) {
    const featureName = String(args.featureName || "").trim();
    if (!featureName) {
      return { success: false, error: "featureName 不能为空" };
    }

    // 1. 优先从静态字典查找
    const doc = FEATURE_DOCS[featureName];
    if (doc) {
      return {
        success: true,
        data: {
          feature: featureName,
          description: doc.description,
          usageTips: doc.usageTips,
          relatedFeatures: doc.relatedFeatures,
        },
      };
    }

    // 2. 字典中没有，用 textProvider 生成说明
    try {
      const result = await container.textProvider.generateText(
        `你是 AI 动画工作室的助手。请简要解释 "${featureName}" 功能的用途。返回 JSON 格式：` +
          `{"description":"功能描述（1-2句话）","usageTips":["使用提示1","使用提示2"],"relatedFeatures":["相关功能1","相关功能2"]}` +
          `。只返回 JSON，不要其他内容。`,
        { maxTokens: 500, temperature: 0.3 },
      );

      if (result.success && result.data?.text) {
        const parsed = safeParseJson<{
          description?: string;
          usageTips?: string[];
          relatedFeatures?: string[];
        }>(result.data.text);
        if (parsed) {
          return {
            success: true,
            data: {
              feature: featureName,
              description: parsed.description || "暂无详细说明",
              usageTips: Array.isArray(parsed.usageTips) ? parsed.usageTips : [],
              relatedFeatures: Array.isArray(parsed.relatedFeatures)
                ? parsed.relatedFeatures
                : [],
            },
          };
        }
      }
    } catch {
      // fall through to fallback
    }

    // 3. fallback
    return {
      success: true,
      data: {
        feature: featureName,
        description: `未能找到 "${featureName}" 功能的详细说明。请尝试使用 get_help 工具搜索相关文档，或使用 list_available_commands 查看可用工具。`,
        usageTips: [],
        relatedFeatures: [],
      },
    };
  },
};

/** 显示教程（按主题/级别） */
export const showTutorialTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "show_tutorial",
      description:
        "显示教程（按主题和级别）。返回分步教程步骤列表。" +
        "支持的主题：getting_started（入门）、create_character（创建角色）、create_scene（创建场景）、" +
        "create_story（创建故事）、generate_video（生成视频）、api_config（API配置）、troubleshooting（故障排除）。" +
        "支持的级别：beginner（初级）、intermediate（中级）、advanced（高级）。",
      parameters: {
        type: "object",
        properties: {
          topic: {
            type: "string",
            enum: [
              "getting_started",
              "create_character",
              "create_scene",
              "create_story",
              "generate_video",
              "api_config",
              "troubleshooting",
            ],
            description: "教程主题",
          },
          level: {
            type: "string",
            enum: ["beginner", "intermediate", "advanced"],
            description: "教程级别，默认 beginner",
            default: "beginner",
          },
        },
        required: ["topic"],
      },
    },
  },
  domain: "help",
  dangerLevel: "safe",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute(args) {
    const topic = String(args.topic || "").trim();
    const level = String(args.level || "beginner").trim();

    if (!topic) {
      return { success: false, error: "topic 不能为空" };
    }

    // 1. 优先从静态字典查找
    const topicTutorials = TUTORIALS[topic];
    if (topicTutorials) {
      const tutorial = topicTutorials[level] || topicTutorials["beginner"];
      if (tutorial) {
        return {
          success: true,
          data: {
            topic,
            level,
            steps: tutorial.steps.map((s, i) => ({
              step: i + 1,
              title: s.title,
              description: s.description,
              ...(s.tips ? { tips: s.tips } : {}),
            })),
            duration: tutorial.duration,
          },
        };
      }
    }

    // 2. 字典中没有，用 textProvider 生成教程
    try {
      const result = await container.textProvider.generateText(
        `你是 AI 动画工作室的助手。请为主题 "${topic}"（${level} 级别）生成一个简短教程，包含 3-5 个步骤。` +
          `返回 JSON 格式：{"steps":[{"title":"步骤标题","description":"步骤描述","tips":["提示1"]}],"duration":"预计学习时间"}。` +
          `只返回 JSON，不要其他内容。`,
        { maxTokens: 800, temperature: 0.4 },
      );

      if (result.success && result.data?.text) {
        const parsed = safeParseJson<{
          steps?: Array<{ title: string; description: string; tips?: string[] }>;
          duration?: string;
        }>(result.data.text);
        if (parsed && Array.isArray(parsed.steps)) {
          return {
            success: true,
            data: {
              topic,
              level,
              steps: parsed.steps.map((s, i) => ({
                step: i + 1,
                title: s.title,
                description: s.description,
                ...(s.tips ? { tips: s.tips } : {}),
              })),
              duration: parsed.duration || "约 5 分钟",
            },
          };
        }
      }
    } catch {
      // fall through to fallback
    }

    // 3. fallback
    return {
      success: true,
      data: {
        topic,
        level,
        steps: [
          {
            step: 1,
            title: "暂无教程",
            description: `未找到主题 "${topic}"（${level} 级别）的教程。请使用 get_help 工具查看帮助文档目录。`,
          },
        ],
        duration: "—",
      },
    };
  },
};

/** 获取帮助文档 */
export const getHelpTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "get_help",
      description:
        "获取帮助文档。支持按关键词搜索或按分类筛选。" +
        "如果不提供 query 和 category，返回帮助文档目录。" +
        "分类包括：general（通用）、features（功能）、faq（常见问题）、shortcuts（快捷键）。",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "搜索关键词（匹配标题、摘要、内容）。不填则不按关键词搜索。",
            maxLength: 500,
          },
          category: {
            type: "string",
            enum: ["general", "features", "faq", "shortcuts"],
            description: "按分类筛选。不填则返回所有分类。",
          },
        },
      },
    },
  },
  domain: "help",
  dangerLevel: "safe",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute(args) {
    const query = args.query ? String(args.query).toLowerCase().trim() : "";
    const category = args.category ? String(args.category).trim() : "";

    let filtered = HELP_DOCS;

    // 按分类筛选
    if (category) {
      filtered = filtered.filter((d) => d.category === category);
    }

    // 按关键词搜索
    if (query) {
      filtered = filtered.filter(
        (d) =>
          d.title.toLowerCase().includes(query) ||
          d.summary.toLowerCase().includes(query) ||
          d.content.toLowerCase().includes(query),
      );
    }

    // 如果既没有 query 也没有 category，返回目录（只含 title/category/summary，不含完整 content）
    if (!query && !category) {
      return {
        success: true,
        data: {
          articles: filtered.map((d) => ({
            title: d.title,
            category: d.category,
            summary: d.summary,
            content: "",
          })),
          total: filtered.length,
        },
      };
    }

    // 有筛选条件时返回完整内容
    return {
      success: true,
      data: {
        articles: filtered.map((d) => ({
          title: d.title,
          category: d.category,
          summary: d.summary,
          content: d.content,
        })),
        total: filtered.length,
      },
    };
  },
};

/** 列出可用工具/命令 */
export const listAvailableCommandsTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "list_available_commands",
      description:
        "列出当前可用的所有工具/命令。支持按业务域过滤（如 asset/video/story/help 等）。" +
        "数据从工具注册表动态获取，反映当前实际可用的工具。" +
        "可控制是否包含工具描述。",
      parameters: {
        type: "object",
        properties: {
          domain: {
            type: "string",
            description: "按业务域过滤（如 asset、video、story、help、generation、config、system 等）",
            maxLength: 200,
          },
          includeDescriptions: {
            type: "boolean",
            description: "是否包含工具描述，默认 true",
            default: true,
          },
        },
      },
    },
  },
  domain: "help",
  dangerLevel: "safe",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute(args) {
    const domainFilter = args.domain ? String(args.domain).trim() : "";
    const includeDescriptions = args.includeDescriptions !== false;

    try {
      // 从 toolRegistry 动态获取所有工具描述
      const allTools = toolRegistry.getToolDescriptions();

      // 按业务域过滤
      const filtered = domainFilter
        ? allTools.filter((t) => t.domain === domainFilter)
        : allTools;

      // 构建命令列表
      const commands = filtered.map((t) => {
        const cmd: { name: string; domain: string; description?: string } = {
          name: t.name,
          domain: t.domain,
        };
        if (includeDescriptions) {
          cmd.description = t.description;
        }
        return cmd;
      });

      return {
        success: true,
        data: {
          total: commands.length,
          commands,
        },
      };
    } catch (e) {
      return {
        success: false,
        error: `获取工具列表失败：${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};

/** 建议下一步操作（基于当前项目状态） */
export const suggestNextActionTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "suggest_next_action",
      description:
        "建议下一步操作。基于当前项目状态（角色数、场景数、故事数、视频任务状态）和用户上下文，" +
        "使用 AI 推理生成个性化建议。返回建议列表，每条包含操作、原因、优先级和相关工具名。",
      parameters: {
        type: "object",
        properties: {
          context: {
            type: "object",
            description: "用户上下文（可选）",
            properties: {
              current_page: { type: "string", description: "当前所在页面", maxLength: 200 },
              last_action: { type: "string", description: "上一步操作", maxLength: 500 },
              user_goal: { type: "string", description: "用户目标", maxLength: 1000 },
            },
          },
        },
      },
    },
  },
  domain: "help",
  dangerLevel: "safe",
  timeoutMs: TOOL_TIMEOUTS.generation,
  async execute(args) {
    // 1. 查询当前项目状态
    let characterCount = 0;
    let sceneCount = 0;
    let storyCount = 0;
    let videoTaskSummary = "无视频任务";
    let failedTaskCount = 0;

    try {
      const { characterService } = await import("@/modules/character");
      const r = await characterService.getAll();
      if (r.ok) characterCount = r.value.length;
    } catch {
      // ignore
    }

    try {
      const { sceneService } = await import("@/modules/scene");
      const r = await sceneService.getAll();
      if (r.ok) sceneCount = r.value.length;
    } catch {
      // ignore
    }

    try {
      const { storyService } = await import("@/modules/story");
      const r = await storyService.getAll();
      if (r.ok) storyCount = r.value.length;
    } catch {
      // ignore
    }

    try {
      const tasks = await container.videoTaskStorage.getVideoTasks();
      const pending = tasks.filter(
        (t) => t.status === "pending" || t.status === "generating",
      ).length;
      const completed = tasks.filter((t) => t.status === "completed").length;
      failedTaskCount = tasks.filter((t) => t.status === "failed").length;
      videoTaskSummary = `共 ${tasks.length} 个任务（进行中 ${pending}，已完成 ${completed}，失败 ${failedTaskCount}）`;
    } catch {
      // ignore
    }

    // 2. 解析用户上下文
    const ctx =
      (args.context as { current_page?: string; last_action?: string; user_goal?: string } | undefined) ?? {};
    const currentPage = ctx.current_page || "未知";
    const lastAction = ctx.last_action || "未知";
    const userGoal = ctx.user_goal || "未指定";

    // 3. 构建提示词，用 textProvider 生成建议
    const prompt =
      `你是 AI 动画工作室的助手。根据当前项目状态，建议用户下一步操作。\n\n` +
      `当前项目状态：\n` +
      `- 角色数量：${characterCount}\n` +
      `- 场景数量：${sceneCount}\n` +
      `- 故事数量：${storyCount}\n` +
      `- 视频任务：${videoTaskSummary}\n\n` +
      `用户上下文：\n` +
      `- 当前页面：${currentPage}\n` +
      `- 上一步操作：${lastAction}\n` +
      `- 用户目标：${userGoal}\n\n` +
      `请返回 JSON 数组，每个元素包含：\n` +
      `- action: 建议的操作（中文，简短）\n` +
      `- reason: 建议原因（中文，1句话）\n` +
      `- priority: 优先级（"high" 或 "medium" 或 "low"）\n` +
      `- toolName: 相关工具名（可选，如 create_character、generate_video 等）\n\n` +
      `返回 2-4 条建议，按优先级从高到低排列。只返回 JSON 数组，不要其他内容。`;

    try {
      const result = await container.textProvider.generateText(prompt, {
        maxTokens: 800,
        temperature: 0.5,
      });

      if (result.success && result.data?.text) {
        const parsed = safeParseJson<
          Array<{
            action?: string;
            reason?: string;
            priority?: string;
            toolName?: string;
          }>
        >(result.data.text);
        if (parsed && Array.isArray(parsed)) {
          const validPriorities = new Set(["high", "medium", "low"]);
          const suggestions = parsed
            .filter((s) => s && typeof s.action === "string")
            .map((s) => ({
              action: String(s.action),
              reason: String(s.reason || ""),
              priority: validPriorities.has(String(s.priority))
                ? (String(s.priority) as "high" | "medium" | "low")
                : "medium",
              ...(s.toolName ? { toolName: String(s.toolName) } : {}),
            }));
          if (suggestions.length > 0) {
            return { success: true, data: { suggestions } };
          }
        }
      }
    } catch {
      // fall through to fallback
    }

    // 4. fallback - 基于项目状态生成简单建议
    const suggestions: Array<{
      action: string;
      reason: string;
      priority: "high" | "medium" | "low";
      toolName?: string;
    }> = [];

    if (characterCount === 0) {
      suggestions.push({
        action: "创建第一个角色",
        reason: "项目中还没有角色，创建角色是开始创作的基础",
        priority: "high",
        toolName: "create_character",
      });
    }
    if (sceneCount === 0) {
      suggestions.push({
        action: "创建第一个场景",
        reason: "项目中还没有场景，创建场景为画面提供环境",
        priority: "high",
        toolName: "create_scene",
      });
    }
    if (storyCount === 0 && characterCount > 0) {
      suggestions.push({
        action: "创建故事",
        reason: "已有角色，可以开始创作故事并拆分分镜",
        priority: "medium",
        toolName: "create_story",
      });
    }
    if (storyCount > 0) {
      suggestions.push({
        action: "生成分镜画面",
        reason: "已有故事，可以为分镜生成关键帧或视频",
        priority: "medium",
        toolName: "generate_video",
      });
    }
    if (failedTaskCount > 0) {
      suggestions.push({
        action: "恢复失败的视频任务",
        reason: `有 ${failedTaskCount} 个失败的视频任务，可以尝试恢复或重试`,
        priority: "high",
        toolName: "recover_video_task",
      });
    }

    // 如果没有特定建议，给出通用建议
    if (suggestions.length === 0) {
      suggestions.push({
        action: "浏览分镜页面",
        reason: "项目已有基础资产，可以在分镜页面开始创作",
        priority: "medium",
      });
    }

    return { success: true, data: { suggestions } };
  },
};

/** 获取快捷键列表 */
export const getKeyboardShortcutsTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "get_keyboard_shortcuts",
      description:
        "获取键盘快捷键列表。支持按上下文过滤（global/editor/shot_page/all）。" +
        "global：全局快捷键；editor：编辑器快捷键；shot_page：分镜页面快捷键；all：全部。",
      parameters: {
        type: "object",
        properties: {
          context: {
            type: "string",
            enum: ["global", "editor", "shot_page", "all"],
            description: "按上下文过滤，默认 all",
            default: "all",
          },
        },
      },
    },
  },
  domain: "help",
  dangerLevel: "safe",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute(args) {
    const context = String(args.context || "all").trim();

    let filtered = KEYBOARD_SHORTCUTS;
    if (context && context !== "all") {
      filtered = filtered.filter((s) => s.context === context);
    }

    return {
      success: true,
      data: {
        shortcuts: filtered.map((s) => ({
          key: s.key,
          description: s.description,
          context: s.context,
        })),
      },
    };
  },
};

/** 导出所有帮助工具 */
export const helpTools: ToolImpl[] = [
  explainFeatureTool,
  showTutorialTool,
  getHelpTool,
  listAvailableCommandsTool,
  suggestNextActionTool,
  getKeyboardShortcutsTool,
];
