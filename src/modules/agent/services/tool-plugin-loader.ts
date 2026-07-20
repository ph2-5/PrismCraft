/**
 * 工具插件加载器（P3 工具插件化）
 *
 * 设计要点：
 * - 从用户目录加载声明式 JSON 工具插件，注册到 toolRegistry
 * - 支持 3 种 action：http-call / builtin-mirror / text-template
 * - 模板替换：{{argName}} 从工具参数取值（递归渲染对象中的所有字符串）
 * - 安全约束：
 *   - http-call URL 必须 http(s) 协议
 *   - 禁止内网 IP（防 SSRF）：127.0.0.0/8 / 10.0.0.0/8 / 172.16.0.0/12 / 192.168.0.0/16 / ::1 / fc00::/7 / fe80::/10
 *   - localhost 禁止
 * - 冲突检测：与内置工具/其他插件重名时跳过并记录
 * - 幂等加载：重复加载同插件先卸载旧工具再注册新的
 * - 索引持久化：通过 agent.toolPlugins.index 配置键记录插件文件列表
 *
 * 与 AI Provider 插件系统的关系：
 * - 完全独立，不共享加载机制（分层约束）
 * - 本加载器在渲染进程运行，仅处理 JSON 配置，不执行用户代码
 * - Provider 插件在主进程，支持代码插件（worker 进程隔离）
 *
 * 集成点：
 * - registerAllTools() 注册内置工具后，调用 ensureToolPluginsLoaded() 加载用户插件
 * - AgentLoop 通过 toolRegistry 统一调用所有工具（内置 + 插件）
 * - 插件工具自动出现在 list_available_commands 工具的输出中
 *
 * 模块拆分（本文件为入口，业务逻辑分布在不同子模块）：
 * - tool-plugin-template.ts: 模板替换与路径提取（renderTemplate/renderObject/extractPath）
 * - tool-plugin-security.ts: URL 安全校验（validateUrl/PRIVATE_IP_PATTERNS）
 * - tool-plugin-actions.ts: Action 执行器（executeHttpCall/executeBuiltinMirror/executeTextTemplate）
 * - tool-plugin-validator.ts: 配置校验（validateConfig + 子校验函数）
 * - tool-plugin-registry.ts: 工具注册/卸载（loadedPlugins/adaptTool/loadToolPlugin/unloadPlugin/...）
 * - tool-plugin-persistence.ts: 文件持久化（saveToolPluginFile/listToolPluginFiles/索引管理）
 * - tool-plugin-loader.ts: 本文件，批量加载入口 + 公共 API re-export
 */

import type { ToolPluginLoadResult } from "../domain/tool-plugin-types";
import { validateConfig } from "./tool-plugin-validator";
import {
  loadToolPlugin,
  unloadPlugin,
  listLoadedPlugins,
  unloadAllLoadedPlugins,
  _getLoadedPluginConfig,
} from "./tool-plugin-registry";
import {
  saveToolPluginFile,
  deleteToolPluginFile,
  listToolPluginFiles,
  getPluginsConfig,
} from "./tool-plugin-persistence";
import { renderTemplate, renderObject, extractPath } from "./tool-plugin-template";
import { validateUrl } from "./tool-plugin-security";

// ============= 公共 API re-export =============
// 保持向后兼容：外部模块从 tool-plugin-loader 导入的 API 不变

export { validateConfig };
export { loadToolPlugin, unloadPlugin, listLoadedPlugins, _getLoadedPluginConfig };
export { saveToolPluginFile, deleteToolPluginFile, listToolPluginFiles };

// ============= 批量加载 =============

/**
 * 加载所有已保存的插件
 *
 * 流程：
 * 1. 读取索引
 * 2. 读取启用/禁用配置
 * 3. 过滤掉禁用的插件
 * 4. 逐个读取文件 + 校验 + 加载
 *
 * @returns 每个插件的加载结果
 */
export async function loadAllToolPlugins(): Promise<ToolPluginLoadResult[]> {
  const configs = await listToolPluginFiles();
  if (configs.length === 0) return [];

  const pluginsConfig = await getPluginsConfig();
  const disabledSet = new Set(pluginsConfig.disabled);
  // enabled 为空表示全部启用；非空表示只启用列表中的
  const enabledSet = new Set(pluginsConfig.enabled);

  const results: ToolPluginLoadResult[] = [];
  for (const config of configs) {
    // 禁用优先级高于启用
    if (disabledSet.has(config.id)) continue;
    // enabled 非空时，只加载列表中的
    if (enabledSet.size > 0 && !enabledSet.has(config.id)) continue;

    try {
      const result = await loadToolPlugin(config);
      results.push(result);
    } catch (e) {
      results.push({
        pluginId: config.id,
        registeredCount: 0,
        skipped: [],
        errors: [
          {
            tool: "(load)",
            error: e instanceof Error ? e.message : String(e),
          },
        ],
      });
    }
  }
  return results;
}

// ============= 幂等加载入口 =============

/** 是否已加载过用户插件（幂等标志） */
let pluginsLoaded = false;

/**
 * 确保用户插件已加载（幂等）
 *
 * 首次调用时加载所有插件，后续调用无副作用。
 * 在 registerAllTools() 之后调用。
 */
export async function ensureToolPluginsLoaded(): Promise<void> {
  if (pluginsLoaded) return;
  pluginsLoaded = true;
  try {
    const results = await loadAllToolPlugins();
    const totalRegistered = results.reduce((sum, r) => sum + r.registeredCount, 0);
    const totalSkipped = results.reduce((sum, r) => sum + r.skipped.length, 0);
    const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
    if (totalRegistered > 0 || totalSkipped > 0 || totalErrors > 0) {
      console.info(
        `[ToolPlugin] 加载完成: ${results.length} 个插件, ${totalRegistered} 个工具注册成功, ${totalSkipped} 跳过, ${totalErrors} 错误`,
      );
    }
  } catch (e) {
    console.warn(`[ToolPlugin] 加载用户插件失败:`, e);
  }
}

/**
 * 重置加载状态（仅测试用）
 *
 * 卸载所有已加载的插件工具，重置幂等标志。
 */
export function _resetToolPlugins(): void {
  unloadAllLoadedPlugins();
  pluginsLoaded = false;
}

// ============= 测试辅助 =============

/**
 * 测试工具集（供测试断言使用）
 *
 * 包含模板替换、URL 校验、配置校验、路径提取的纯函数。
 * 这些函数也通过本文件 re-export 暴露给外部消费者。
 */
export const _testUtils = {
  renderTemplate,
  renderObject,
  validateUrl,
  validateConfig,
  extractPath,
};
