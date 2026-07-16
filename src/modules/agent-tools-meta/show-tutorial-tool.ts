/**
 * show_tutorial 工具实现
 *
 * 显示教程（按主题和级别）。返回分步教程步骤列表。
 *
 * 设计要点：
 * - 优先从静态字典 TUTORIALS 返回
 * - 字典中没有的条目，用 container.textProvider 生成
 * - 所有操作 try/catch，失败时返回友好 fallback
 *
 * 特权访问声明：通过 DI container 直接访问 textProvider。
 */

import type { ToolImpl } from "@/domain/types/agent-tools";
import { TOOL_TIMEOUTS } from "@/shared/constants/tool-timeouts";
import { container } from "@/infrastructure/di";
import { TUTORIALS } from "./tutorials-data";
import { safeParseJson } from "./help-tools-shared";

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
