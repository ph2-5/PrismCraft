/**
 * 工具插件注册表（P3 工具插件化）
 *
 * 从 tool-plugin-loader.ts 拆分而来，目的：
 * - 降低主文件行数（原 849 行 > max-lines 500）
 * - 隔离 loadedPlugins 状态和工具注册/卸载逻辑
 *
 * 包含：
 * - loadedPlugins: 已加载插件映射（模块内私有）
 * - adaptTool: 将插件工具配置转为 ToolImpl
 * - loadToolPlugin: 加载单个插件配置
 * - unloadPlugin: 卸载插件
 * - listLoadedPlugins: 列出已加载插件元信息
 * - unloadAllLoadedPlugins: 卸载所有已加载插件（_resetToolPlugins 调用）
 * - _getLoadedPluginConfig: 测试辅助
 */

import type { ToolImpl, ToolContext, ToolResult, DangerLevel } from "../domain/types";
import type {
  ToolPluginConfig,
  ToolPluginTool,
  ToolPluginLoadResult,
} from "../domain/tool-plugin-types";
import { toolRegistry } from "./tool-registry";
import { validateConfig } from "./tool-plugin-validator";
import { executeHttpCall, executeBuiltinMirror, executeTextTemplate } from "./tool-plugin-actions";

// ============= 常量 =============

/** 默认 HTTP 调用超时 */
const DEFAULT_HTTP_TIMEOUT_MS = 30000;

// ============= 已加载插件记录 =============

interface LoadedPlugin {
  pluginId: string;
  toolNames: string[];
  config: ToolPluginConfig;
}

/** 已加载的插件映射（pluginId → LoadedPlugin） */
const loadedPlugins = new Map<string, LoadedPlugin>();

// ============= 工具适配 =============

/**
 * 根据 action 类型派发执行
 *
 * 内部辅助函数，被 adaptTool 的 execute 闭包调用。
 */
async function dispatchAction(
  action: ToolPluginTool["action"],
  args: Record<string, unknown>,
  ctx: ToolContext,
  timeoutMs: number,
): Promise<ToolResult> {
  switch (action.type) {
    case "http-call":
      return executeHttpCall(action, args, ctx, timeoutMs);
    case "builtin-mirror":
      return executeBuiltinMirror(action, args, ctx);
    case "text-template":
      return executeTextTemplate(action, args);
    default:
      return {
        success: false,
        error: `未知 action 类型: ${(action as { type: string }).type}`,
        duration: 0,
      };
  }
}

/**
 * 将插件工具配置转为 ToolImpl
 *
 * execute 函数根据 action.type 分派到对应的执行器。
 * 失败统一捕获并返回 ToolResult.error。
 *
 * 安全规则：
 * - builtin-mirror 类型**必须继承**目标工具的 dangerLevel/requiresConfirmation，
 *   插件配置中的 requiresConfirmation 字段对 mirror 类型被忽略
 * - 这防止插件通过 mirror 包装危险工具（如 delete_file）并设置 requiresConfirmation:false
 *   来绕过用户确认机制
 */
function adaptTool(pluginTool: ToolPluginTool, prefix?: string): ToolImpl {
  const finalName = prefix ? `${prefix}${pluginTool.name}` : pluginTool.name;
  const action = pluginTool.action;
  const timeoutMs = pluginTool.timeoutMs ?? DEFAULT_HTTP_TIMEOUT_MS;

  // builtin-mirror 安全规则：继承目标工具的权限标记，忽略插件声明的 requiresConfirmation
  let effectiveDangerLevel: DangerLevel | undefined;
  let effectiveRequiresConfirmation: boolean | undefined;

  if (action.type === "builtin-mirror") {
    const targetTool = toolRegistry.get(action.targetTool);
    if (targetTool) {
      // 继承目标工具的危险等级
      effectiveDangerLevel = targetTool.dangerLevel;
      effectiveRequiresConfirmation = targetTool.requiresConfirmation;
    } else {
      // 目标工具不存在时默认为 destructive（安全默认）
      effectiveDangerLevel = "destructive";
      effectiveRequiresConfirmation = true;
    }
  } else {
    // 非 mirror 类型：使用插件声明的权限标记
    effectiveRequiresConfirmation = pluginTool.requiresConfirmation;
  }

  return {
    def: {
      type: "function",
      function: {
        name: finalName,
        description: pluginTool.description,
        parameters: pluginTool.parameters,
      },
    },
    domain: pluginTool.domain,
    dangerLevel: effectiveDangerLevel,
    requiresConfirmation: effectiveRequiresConfirmation,
    timeoutMs,
    async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
      try {
        return await dispatchAction(action, args, ctx, timeoutMs);
      } catch (e) {
        return {
          success: false,
          error: e instanceof Error ? e.message : String(e),
          duration: 0,
        };
      }
    },
  };
}

// ============= 加载/卸载 =============

/**
 * 加载单个插件配置
 *
 * 流程：
 * 1. 校验配置
 * 2. 卸载已加载的同名插件（幂等）
 * 3. 适配每个工具为 ToolImpl
 * 4. 冲突检测（与已注册工具重名时跳过）
 * 5. 注册到 toolRegistry
 *
 * @param config 插件配置对象
 * @returns 加载结果（成功数/跳过/错误）
 */
export async function loadToolPlugin(config: ToolPluginConfig): Promise<ToolPluginLoadResult> {
  const result: ToolPluginLoadResult = {
    pluginId: config.id,
    registeredCount: 0,
    skipped: [],
    errors: [],
  };

  // 校验配置
  const validation = validateConfig(config);
  if (!validation.ok) {
    for (const err of validation.errors) {
      result.errors.push({ tool: "(config)", error: err });
    }
    return result;
  }

  // 卸载已加载的同名插件
  unloadPlugin(config.id);

  // 适配 + 冲突检测
  const toolsToRegister: ToolImpl[] = [];
  for (const pluginTool of config.tools) {
    const finalName = config.prefix ? `${config.prefix}${pluginTool.name}` : pluginTool.name;
    if (toolRegistry.has(finalName)) {
      result.skipped.push({ name: finalName, reason: "与已注册工具重名" });
      continue;
    }
    try {
      toolsToRegister.push(adaptTool(pluginTool, config.prefix));
    } catch (e) {
      result.errors.push({
        tool: finalName,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // 注册（逐个注册，单个失败不影响其他）
  const registeredNames: string[] = [];
  for (const tool of toolsToRegister) {
    try {
      toolRegistry.register(tool);
      registeredNames.push(tool.def.function.name);
      result.registeredCount++;
    } catch (e) {
      result.errors.push({
        tool: tool.def.function.name,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  loadedPlugins.set(config.id, {
    pluginId: config.id,
    toolNames: registeredNames,
    config,
  });

  return result;
}

/**
 * 卸载插件
 *
 * 从 toolRegistry 中移除该插件的所有工具。
 * 不存在时返回 false（幂等）。
 */
export function unloadPlugin(pluginId: string): boolean {
  const loaded = loadedPlugins.get(pluginId);
  if (!loaded) return false;
  for (const name of loaded.toolNames) {
    toolRegistry.unregister(name);
  }
  loadedPlugins.delete(pluginId);
  return true;
}

/**
 * 卸载所有已加载的插件
 *
 * 用于 _resetToolPlugins（测试重置）。
 */
export function unloadAllLoadedPlugins(): void {
  for (const pluginId of Array.from(loadedPlugins.keys())) {
    unloadPlugin(pluginId);
  }
}

/**
 * 列出已加载的插件
 *
 * 返回已加载插件的元信息（不包含完整配置，避免泄露内部细节）。
 */
export function listLoadedPlugins(): Array<{
  pluginId: string;
  displayName: string;
  version: string;
  toolNames: string[];
}> {
  return Array.from(loadedPlugins.values()).map((p) => ({
    pluginId: p.pluginId,
    displayName: p.config.displayName,
    version: p.config.version,
    toolNames: [...p.toolNames],
  }));
}

// ============= 测试辅助 =============

/**
 * 获取已加载插件的完整配置（仅测试用）
 *
 * 用于测试断言插件是否正确加载。
 */
export function _getLoadedPluginConfig(pluginId: string): ToolPluginConfig | undefined {
  return loadedPlugins.get(pluginId)?.config;
}
