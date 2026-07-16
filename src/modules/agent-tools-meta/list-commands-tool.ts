/**
 * list_available_commands 工具实现
 *
 * 列出当前可用的所有工具/命令。支持按业务域过滤。
 *
 * 设计要点：
 * - 从 toolRegistry 动态获取，不硬编码工具列表
 * - 可控制是否包含工具描述
 * - 所有操作 try/catch，失败时返回友好错误信息
 *
 * 特权访问声明：通过 DI container 异步获取 agentToolRegistry。
 */

import type { ToolImpl } from "@/domain/types/agent-tools";
import { TOOL_TIMEOUTS } from "@/shared/constants/tool-timeouts";
import { container } from "@/infrastructure/di";

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
      const toolRegistry = await container.agentToolRegistry;
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
