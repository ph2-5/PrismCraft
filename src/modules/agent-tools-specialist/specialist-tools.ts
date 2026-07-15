/**
 * Specialist 工具（P4 多 Agent 编排）
 *
 * 提供 delegate_to_specialist 工具，让主 Agent 能将任务委派给 Specialist。
 *
 * 工具列表：
 * - delegate_to_specialist：委派任务给指定的 Specialist Agent
 * - list_specialists：列出所有可用的 Specialist
 *
 * 设计要点：
 * - 主 Agent 通过此工具实现任务分解和专业化
 * - 子 Agent 独立运行，结果返回给主 Agent
 * - 防递归：子 Agent 的 enabledTools 不包含 delegate_to_specialist
 */

import type { ToolImpl, ToolContext, ToolResult } from "@/domain/types/agent-tools";
import { TOOL_TIMEOUTS } from "@/shared/constants/tool-timeouts";
import { specialistRegistry } from "@/modules/agent-specialist";

/**
 * 委派任务给 Specialist
 *
 * 主 Agent 调用此工具将专业任务委派给对应的专家。
 * 子 Agent 独立运行（可调用其白名单内的工具），结果返回给主 Agent。
 */
export const delegateToSpecialistTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "delegate_to_specialist",
      description:
        "委派任务给专门的 Agent 处理。当任务属于特定领域（角色创建/视频制作/故事编剧/API配置/素材搜索）时，委派给对应专家可获得更专业的处理。专家会独立运行并返回结果。",
      parameters: {
        type: "object",
        properties: {
          specialist_id: {
            type: "string",
            description:
              "专家 ID。可用专家：character-creator（角色创建）/ video-producer（视频制作）/ story-writer（故事编剧）/ api-configurator（API配置）/ asset-finder（素材搜索）",
            maxLength: 100,
          },
          task: {
            type: "string",
            description: "委派给专家的任务描述（应清晰明确，包含所有必要信息）",
            maxLength: 5000,
          },
          context: {
            type: "string",
            description: "任务上下文（可选）。主 Agent 已知的背景信息，如用户偏好、项目状态等，帮助专家更好地完成任务。",
            maxLength: 5000,
          },
        },
        required: ["specialist_id", "task"],
      },
    },
  },
  domain: "workflow",
  dangerLevel: "limited",
  timeoutMs: 120_000, // 子 Agent 可能需要多轮工具调用，给 2 分钟
  async execute(
    args: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    const specialistId = args.specialist_id as string;
    const task = args.task as string;
    const context = (args.context as string) ?? "";

    if (!specialistId || typeof specialistId !== "string") {
      return { success: false, error: "specialist_id 参数缺失或无效", duration: 0 };
    }
    if (!task || typeof task !== "string") {
      return { success: false, error: "task 参数缺失或无效", duration: 0 };
    }

    // 校验 specialist 存在
    if (!specialistRegistry.has(specialistId)) {
      const available = specialistRegistry.list().map((s) => s.id).join(", ");
      return {
        success: false,
        error: `专家 ${specialistId} 不存在。可用专家: ${available}`,
        duration: 0,
      };
    }

    ctx.onProgress?.(`委派任务给 ${specialistRegistry.get(specialistId)?.name}...`);

    // 动态 import 避免对 agent/services 的静态依赖，通过 barrel 导入
    const { runSpecialist } = await import("@/modules/agent");
    // 传递父 Agent 的危险操作确认回调，使子 Agent 的危险操作也能弹出用户确认
    const result = await runSpecialist(specialistId, task, context, ctx, ctx._confirmDangerous);

    if (result.success) {
      const resultText = (result.data as { result?: string } | null)?.result ?? "";
      ctx.onProgress?.(`专家完成，返回 ${resultText.length} 字符结果`);
    }

    return result;
  },
};

/**
 * 列出所有可用的 Specialist
 *
 * 返回所有专家的 id / name / description，帮助主 Agent 决策何时委派。
 */
export const listSpecialistsTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "list_specialists",
      description: "列出所有可用的专家 Agent（Specialist），用于决定是否委派任务。",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  domain: "workflow",
  dangerLevel: "safe",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute(): Promise<ToolResult> {
    const list = specialistRegistry.listSummaries();
    const { listAvailableSpecialists } = await import("@/modules/agent");
    return {
      success: true,
      data: {
        count: list.length,
        specialists: list,
        summary: listAvailableSpecialists(),
      },
      duration: 0,
    };
  },
};

/** 所有 Specialist 相关工具 */
export const specialistTools: ToolImpl[] = [delegateToSpecialistTool, listSpecialistsTool];
