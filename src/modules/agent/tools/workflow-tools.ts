/**
 * 工作流编排工具（Workflow Tools）
 *
 * 包含工具：
 * - create_workflow：创建工作流（定义一系列步骤）
 * - execute_workflow：执行已定义的工作流
 * - batch_process：批量执行同一操作
 * - chain_operations：链式执行（A → B → C）
 * - schedule_task：定时任务（优雅降级，当前不支持持久化定时）
 *
 * 设计要点：
 * - 通过 toolRegistry 验证工具名，通过 toolExecutor 执行工具
 * - 工作流定义持久化到配置（agent.workflows / agent.scheduledTasks）
 * - 支持条件执行（$stepName.field == value）和链式输入映射（$prev.data.xxx）
 * - 定时任务当前仅保存定义，实际定时执行需要主进程支持
 */

import type { ToolImpl, ToolContext } from "@/domain/types/agent-tools";
import type { ToolCall } from "@/domain/ports/ai-provider-port";
import { toolExecutor } from "../services/tool-executor";
import { TOOL_TIMEOUTS } from "@/shared/constants/tool-timeouts";
import { toolRegistry } from "../services/tool-registry";

// ============= 类型定义 =============

/** 工作流步骤定义 */
interface WorkflowStep {
  toolName: string;
  args: Record<string, unknown>;
  name?: string;
  condition?: string;
}

/** 工作流定义 */
interface WorkflowDefinition {
  name: string;
  description: string;
  steps: WorkflowStep[];
  createdAt: number;
}

/** 链式操作定义 */
interface ChainOperation {
  toolName: string;
  args: Record<string, unknown>;
  inputMapping?: Record<string, string>;
}

/** 单步执行结果 */
interface StepResult {
  stepName: string;
  toolName: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

// ============= 辅助函数 =============

/** 解析条件表达式（简单实现，支持 "$stepN.field == value" 格式） */
function evaluateCondition(condition: string, context: Record<string, unknown>): boolean {
  try {
    const match = condition.match(/\$(\w+)\.(\w+)\s*==\s*(.+)/);
    if (match) {
      const stepName = match[1];
      const field = match[2];
      const expected = match[3];
      if (stepName === undefined || field === undefined || expected === undefined) {
        return true;
      }
      const expectedTrimmed = expected.trim().replace(/^["']|["']$/g, "");
      const stepResult = context[stepName] as Record<string, unknown> | undefined;
      if (!stepResult) return false;
      const actual = String(stepResult[field]);
      return actual === expectedTrimmed;
    }
  } catch {
    // 条件解析失败，默认执行
  }
  return true;
}

/** 解析 inputMapping（$prev.data.xxx 格式） */
function resolveMapping(
  mapping: Record<string, string>,
  prevResult: unknown,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [key, path] of Object.entries(mapping)) {
    if (path.startsWith("$prev.")) {
      const fieldPath = path.slice(6); // 去掉 "$prev."
      resolved[key] = getFieldByPath(prevResult, fieldPath);
    }
  }
  return resolved;
}

/** 按路径获取字段（如 "data.id"） */
function getFieldByPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

/** 解析 args 中的 $input.xxx 引用（用于 execute_workflow 的 inputArgs 传递） */
function resolveInputRefs(
  args: Record<string, unknown>,
  inputArgs: Record<string, unknown>,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === "string" && value.startsWith("$input.")) {
      const fieldPath = value.slice(7); // 去掉 "$input."
      resolved[key] = getFieldByPath(inputArgs, fieldPath);
    } else {
      resolved[key] = value;
    }
  }
  return resolved;
}

/** 执行单个工具并返回步骤结果 */
async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  stepIdentifier: string,
): Promise<StepResult> {
  try {
    const toolCall: ToolCall = {
      id: `wf_${Date.now()}_${stepIdentifier}`,
      function: {
        name: toolName,
        arguments: JSON.stringify(args),
      },
    };
    const ctx: ToolContext = {
      sessionId: "workflow",
      onProgress: () => {},
    };
    const result = await toolExecutor.execute(toolCall, ctx);
    return {
      stepName: stepIdentifier,
      toolName,
      success: result.success,
      data: result.data,
      error: result.error,
    };
  } catch (e) {
    return {
      stepName: stepIdentifier,
      toolName,
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// ============= 工具实现 =============

/** 创建工作流 */
export const createWorkflowTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "create_workflow",
      description:
        "创建工作流（定义一系列步骤）。每个步骤包含工具名、参数、可选名称和执行条件。条件格式：$stepName.field == value。",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "工作流名称（唯一标识）", maxLength: 200 },
          description: { type: "string", description: "工作流描述", maxLength: 1000 },
          steps: {
            type: "array",
            description: "工作流步骤数组",
            items: {
              type: "object",
              properties: {
                toolName: { type: "string", description: "要调用的工具名" },
                args: { type: "object", description: "工具参数对象" },
                name: { type: "string", description: "步骤名称（可选，用于条件引用）" },
                condition: {
                  type: "string",
                  description: "执行条件（可选，如 $step1.success == true）",
                },
              },
              required: ["toolName", "args"],
            },
          },
        },
        required: ["name", "description", "steps"],
      },
    },
  },
  domain: "workflow",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.mutation,
  async execute(args) {
    const name = String(args.name);
    const description = String(args.description);
    const steps = args.steps as WorkflowStep[] | undefined;

    if (!steps || !Array.isArray(steps) || steps.length === 0) {
      return { success: false, error: "steps 必须是非空数组" };
    }

    // 验证所有 toolName 在 toolRegistry 中存在
    for (const step of steps) {
      if (!step.toolName || typeof step.toolName !== "string") {
        return { success: false, error: "每个步骤必须包含 toolName 字符串" };
      }
      if (!toolRegistry.has(step.toolName)) {
        return { success: false, error: `工具 "${step.toolName}" 不存在` };
      }
      if (!step.args || typeof step.args !== "object") {
        return { success: false, error: `步骤 "${step.toolName}" 的 args 必须是对象` };
      }
    }

    // 保存工作流定义到配置
    try {
      const { getConfig, setConfig } = await import("@/shared/file-http");
      const existing = (await getConfig("agent.workflows")) as Record<string, unknown> | null;
      const workflows = existing ?? {};
      const workflow: WorkflowDefinition = {
        name,
        description,
        steps,
        createdAt: Date.now(),
      };
      await setConfig("agent.workflows", { ...workflows, [name]: workflow });
      return {
        success: true,
        data: { workflowName: name, stepCount: steps.length, created: true },
      };
    } catch (e) {
      return {
        success: false,
        error: `保存工作流失败：${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};

/** 执行工作流 */
export const executeWorkflowTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "execute_workflow",
      description:
        "执行已定义的工作流。可传入 inputArgs 作为初始参数，步骤参数中可用 $input.field 引用。条件不满足的步骤会被跳过。",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "工作流名称", maxLength: 200 },
          inputArgs: { type: "object", description: "传入工作流的初始参数（可选）" },
          stopOnError: {
            type: "boolean",
            description: "某步失败时是否停止（默认 true）",
            default: true,
          },
        },
        required: ["name"],
      },
    },
  },
  domain: "workflow",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.videoTask,
  async execute(args) {
    const name = String(args.name);
    const inputArgs = (args.inputArgs as Record<string, unknown> | undefined) ?? {};
    const stopOnError = args.stopOnError !== false;

    // 从配置加载工作流定义
    let workflow: WorkflowDefinition | undefined;
    try {
      const { getConfig } = await import("@/shared/file-http");
      const workflows = (await getConfig("agent.workflows")) as
        | Record<string, WorkflowDefinition>
        | null;
      workflow = workflows?.[name];
    } catch (e) {
      return {
        success: false,
        error: `加载工作流失败：${e instanceof Error ? e.message : String(e)}`,
      };
    }

    if (!workflow) {
      return { success: false, error: `工作流 "${name}" 不存在` };
    }

    const results: StepResult[] = [];
    const context: Record<string, unknown> = { input: inputArgs };
    let executedSteps = 0;
    let workflowSuccess = true;

    for (const [i, step] of workflow.steps.entries()) {
      const stepIdentifier = step.name ?? `step${i + 1}`;

      // 检查 condition
      if (step.condition && !evaluateCondition(step.condition, context)) {
        results.push({
          stepName: stepIdentifier,
          toolName: step.toolName,
          success: true,
          data: { skipped: true, reason: "条件不满足" },
        });
        continue;
      }

      // 解析 $input 引用
      const resolvedArgs = resolveInputRefs(step.args, inputArgs);

      // 执行工具
      const result = await executeTool(step.toolName, resolvedArgs, stepIdentifier);
      results.push(result);
      executedSteps++;

      // 将结果存入 context 供后续条件引用
      context[stepIdentifier] = {
        success: result.success,
        data: result.data,
        error: result.error,
      };

      // 失败处理
      if (!result.success) {
        workflowSuccess = false;
        if (stopOnError) {
          break;
        }
      }
    }

    return {
      success: workflowSuccess,
      data: {
        workflowName: name,
        totalSteps: workflow.steps.length,
        executedSteps,
        results,
        success: workflowSuccess,
      },
    };
  },
};

/** 批量处理 */
export const batchProcessTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "batch_process",
      description:
        "批量处理（同一操作应用到多个对象）。对每个参数对象执行一次指定工具，默认某次失败不影响其他。",
      parameters: {
        type: "object",
        properties: {
          toolName: { type: "string", description: "要执行的工具名", maxLength: 200 },
          batchArgs: {
            type: "array",
            description: "批量参数数组（最多 20 个），每个元素是该工具的一次参数对象",
            maxItems: 20,
            items: { type: "object" },
          },
          stopOnError: {
            type: "boolean",
            description: "某次失败时是否停止（默认 false）",
            default: false,
          },
        },
        required: ["toolName", "batchArgs"],
      },
    },
  },
  domain: "workflow",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.videoTask,
  async execute(args) {
    const toolName = String(args.toolName);
    const batchArgs = args.batchArgs as unknown[] | undefined;
    const stopOnError = args.stopOnError === true;

    if (!batchArgs || !Array.isArray(batchArgs) || batchArgs.length === 0) {
      return { success: false, error: "batchArgs 必须是非空数组" };
    }
    if (batchArgs.length > 20) {
      return { success: false, error: `batchArgs 数量超限（最多 20 个，实际 ${batchArgs.length} 个）` };
    }

    // 验证 toolName 在 toolRegistry 中存在
    if (!toolRegistry.has(toolName)) {
      return { success: false, error: `工具 "${toolName}" 不存在` };
    }

    const results: Array<{ index: number; success: boolean; data?: unknown; error?: string }> = [];
    let successCount = 0;
    let failedCount = 0;

    for (const [i, itemArgs] of batchArgs.entries()) {
      if (!itemArgs || typeof itemArgs !== "object") {
        results.push({ index: i, success: false, error: "参数必须是对象" });
        failedCount++;
        if (stopOnError) break;
        continue;
      }

      const result = await executeTool(toolName, itemArgs as Record<string, unknown>, `batch_${i}`);
      results.push({
        index: i,
        success: result.success,
        data: result.data,
        error: result.error,
      });

      if (result.success) {
        successCount++;
      } else {
        failedCount++;
        if (stopOnError) break;
      }
    }

    return {
      success: failedCount === 0,
      data: {
        toolName,
        total: batchArgs.length,
        successCount,
        failedCount,
        results,
      },
    };
  },
};

/** 链式操作 */
export const chainOperationsTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "chain_operations",
      description:
        "链式操作（A → B → C）。每步的输出可通过 inputMapping 映射到下步参数。映射格式：{ '字段': '$prev.data.xxx' }。",
      parameters: {
        type: "object",
        properties: {
          operations: {
            type: "array",
            description: "操作数组，每个元素包含 toolName、args、可选 inputMapping",
            items: {
              type: "object",
              properties: {
                toolName: { type: "string", description: "要调用的工具名" },
                args: { type: "object", description: "工具参数对象" },
                inputMapping: {
                  type: "object",
                  description: "将上一步结果映射到当前参数，如 { 'characterId': '$prev.data.id' }",
                },
              },
              required: ["toolName", "args"],
            },
          },
        },
        required: ["operations"],
      },
    },
  },
  domain: "workflow",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.videoTask,
  async execute(args) {
    const operations = args.operations as ChainOperation[] | undefined;

    if (!operations || !Array.isArray(operations) || operations.length === 0) {
      return { success: false, error: "operations 必须是非空数组" };
    }

    // 验证所有 toolName 存在
    for (const op of operations) {
      if (!op.toolName || typeof op.toolName !== "string") {
        return { success: false, error: "每个操作必须包含 toolName 字符串" };
      }
      if (!toolRegistry.has(op.toolName)) {
        return { success: false, error: `工具 "${op.toolName}" 不存在` };
      }
      if (!op.args || typeof op.args !== "object") {
        return { success: false, error: `操作 "${op.toolName}" 的 args 必须是对象` };
      }
    }

    const results: StepResult[] = [];
    let prevResult: unknown = undefined;
    let executedSteps = 0;
    let chainSuccess = true;

    for (const [i, op] of operations.entries()) {
      const stepIdentifier = `${op.toolName}_${i}`;

      // 解析 inputMapping（从第二步开始）
      let finalArgs = op.args;
      if (op.inputMapping && i > 0) {
        const mapped = resolveMapping(op.inputMapping, prevResult);
        finalArgs = { ...op.args, ...mapped };
      }

      const result = await executeTool(op.toolName, finalArgs, stepIdentifier);
      results.push(result);
      executedSteps++;

      if (!result.success) {
        chainSuccess = false;
        break;
      }

      prevResult = { data: result.data, success: result.success };
    }

    const finalResult = results.length > 0 ? results[results.length - 1] : undefined;

    return {
      success: chainSuccess,
      data: {
        totalSteps: operations.length,
        executedSteps,
        finalResult,
        results,
      },
    };
  },
};

/** 定时任务（优雅降级） */
export const scheduleTaskTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "schedule_task",
      description:
        "定时任务（优雅降级）。保存定时任务定义，当前不支持实际定时执行，将在主进程定时器支持后生效。",
      parameters: {
        type: "object",
        properties: {
          taskName: { type: "string", description: "任务名称（唯一标识）", maxLength: 200 },
          cronExpression: { type: "string", description: "cron 表达式（如 0 8 * * * 每天 8 点）", maxLength: 200 },
          action: {
            type: "object",
            description: "要执行的操作",
            properties: {
              toolName: { type: "string", description: "要调用的工具名", maxLength: 200 },
              args: { type: "object", description: "工具参数对象" },
            },
            required: ["toolName"],
          },
          enabled: { type: "boolean", description: "是否启用（默认 true）", default: true },
        },
        required: ["taskName", "cronExpression", "action"],
      },
    },
  },
  domain: "workflow",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.mutation,
  async execute(args) {
    const taskName = String(args.taskName);
    const cronExpression = String(args.cronExpression);
    const action = args.action as { toolName: string; args?: Record<string, unknown> } | undefined;
    const enabled = args.enabled !== false;

    if (!action || typeof action !== "object") {
      return { success: false, error: "action 必须是对象" };
    }
    if (!action.toolName || typeof action.toolName !== "string") {
      return { success: false, error: "action.toolName 必须是字符串" };
    }
    if (!toolRegistry.has(action.toolName)) {
      return { success: false, error: `工具 "${action.toolName}" 不存在` };
    }

    try {
      const { getConfig, setConfig } = await import("@/shared/file-http");
      const existing = (await getConfig("agent.scheduledTasks")) as Record<string, unknown> | null;
      const tasks = existing ?? {};
      const task = {
        taskName,
        cronExpression,
        action,
        enabled,
        createdAt: Date.now(),
      };
      await setConfig("agent.scheduledTasks", { ...tasks, [taskName]: task });
      return {
        success: true,
        data: {
          scheduled: true,
          taskName,
          cronExpression,
          note: "定时任务已保存，将在下次启动主进程定时器时生效（开发中）",
        },
      };
    } catch (e) {
      return {
        success: false,
        error: `保存定时任务失败：${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};

/** 导出所有工作流工具 */
export const workflowTools: ToolImpl[] = [
  createWorkflowTool,
  executeWorkflowTool,
  batchProcessTool,
  chainOperationsTool,
  scheduleTaskTool,
];
