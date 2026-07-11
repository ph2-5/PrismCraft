/**
 * 工具注册入口
 *
 * 在应用启动时调用 registerAllTools() 注册所有工具
 * 各 Phase 工具通过追加 import + register 即可扩展
 *
 * P3 工具插件化：
 * - registerAllTools() 同步注册内置工具
 * - loadToolPlugins() 异步加载用户插件（在 registerAllTools 之后调用）
 */

import { toolRegistry } from "../services/tool-registry";
import { assetTools } from "./asset-tools";
import { assetCrudTools } from "./asset-crud-tools";
import { configTools } from "./config-tools";
import { systemTools } from "./system-tools";
import { generationTools } from "./generation-tools";
import { webTools } from "./web-tools";
import { imageEditTools } from "./image-edit-tools";
import { storyTools } from "./story-tools";
import { videoTools } from "./video-tools";
import { shotTools } from "./shot-tools";
import { videoPostTools } from "./video-post-tools";
import { audioTools } from "./audio-tools";
import { templateTools } from "./template-tools";
import { workflowTools } from "./workflow-tools";
import { monitorTools } from "./monitor-tools";
import { diagnosticTools } from "./diagnostic-tools";
import { helpTools } from "./help-tools";
import { subworkflowTools } from "./subworkflow-tools";
import { memoryTools } from "./memory-tools";
import { projectIoTools } from "./project-io-tools";
import { fileManagementTools } from "./file-management-tools";
import { specialistTools } from "./specialist-tools";
import { specialistRegistry } from "../services/specialist-registry";

let registered = false;

/** 注册所有工具（幂等，重复调用无副作用） */
export function registerAllTools(): void {
  if (registered) return;
  // P4 多 Agent 编排：先注册内置 Specialist
  specialistRegistry.registerBuiltins();

  toolRegistry.registerAll([
    ...assetTools,
    ...assetCrudTools,
    ...configTools,
    ...systemTools,
    ...generationTools,
    ...webTools,
    ...imageEditTools,
    ...storyTools,
    ...videoTools,
    ...shotTools,
    ...videoPostTools,
    ...audioTools,
    ...templateTools,
    ...workflowTools,
    ...monitorTools,
    ...diagnosticTools,
    ...helpTools,
    ...subworkflowTools,
    ...memoryTools,
    ...projectIoTools,
    ...fileManagementTools,
    ...specialistTools,
  ]);
  registered = true;
}

/**
 * 加载用户工具插件（P3 工具插件化）
 *
 * 异步加载 {cacheDir}/agent/tool-plugins/ 下的所有插件。
 * 幂等：首次调用加载，后续调用无副作用。
 *
 * 应在 registerAllTools() 之后调用，确保内置工具已注册（冲突检测需要）。
 */
export async function loadToolPlugins(): Promise<void> {
  // 确保 registerAllTools 已执行（插件可能与内置工具冲突检测）
  registerAllTools();
  const { ensureToolPluginsLoaded } = await import("../services/tool-plugin-loader");
  await ensureToolPluginsLoaded();
}

/** 重置注册状态（仅测试用） */
export function _resetRegistration(): void {
  toolRegistry.clear();
  registered = false;
  // 同步重置插件加载状态
  // 动态导入避免循环依赖
  void import("../services/tool-plugin-loader").then(({ _resetToolPlugins }) => {
    _resetToolPlugins();
  });
}

export { toolRegistry } from "../services/tool-registry";
export { toolExecutor } from "../services/tool-executor";
