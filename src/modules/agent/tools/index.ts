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
import { errorLogger } from "@/shared/error-logger";
// 阶段3-4：meta 工具（config/diagnostic/monitor/help）已拆分至独立模块
import { configTools, monitorTools, diagnosticTools, helpTools } from "@/modules/agent-tools-meta";
// 阶段3-4：shot 工具已拆分至独立模块
import { shotTools } from "@/modules/agent-tools-shot";
// 阶段3-4：template 工具已拆分至独立模块
import { templateTools, promptTemplateTools } from "@/modules/agent-tools-template";
// 阶段3-4：memory 工具已拆分至独立模块
import { memoryTools } from "@/modules/agent-tools-memory";
// 阶段3-4：project-io 工具已拆分至独立模块
import { projectIoTools } from "@/modules/agent-tools-project-io";
// 阶段3-4：specialist 工具已拆分至独立模块
import { specialistTools } from "@/modules/agent-tools-specialist";
// 阶段3-5：workflow/subworkflow 工具已拆分至独立模块
import { workflowTools, subworkflowTools } from "@/modules/agent-tools-workflow";
// 阶段3-3：system 工具已拆分至独立模块
import { systemTools } from "@/modules/agent-tools-system";
// 阶段3-2：web-tools/file-management-tools 已拆分至独立模块
import { webTools, fileManagementTools } from "@/modules/agent-tools-web-file";
// 阶段3-2：audio/video/video-post 工具已拆分至独立模块
import { audioTools, videoTools, videoPostTools } from "@/modules/agent-tools-media";
// 阶段3-2：generation/image-edit 工具已拆分至独立模块
import { generationTools, imageEditTools } from "@/modules/agent-tools-generation";
// 阶段3-2：asset/asset-crud 工具已拆分至独立模块
import { assetTools, assetCrudTools } from "@/modules/agent-tools-asset";
// 阶段3-2：story 工具集已拆分至独立模块（含 story-tools + planning + generation + suggestions）
import { storyTools } from "@/modules/agent-tools-story";
// Phase 2A：Novel Agent 工具集（5 个）
import { novelTools } from "@/modules/novel";
import { specialistRegistry } from "@/modules/agent-specialist";

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
    ...promptTemplateTools,
    ...workflowTools,
    ...monitorTools,
    ...diagnosticTools,
    ...helpTools,
    ...subworkflowTools,
    ...memoryTools,
    ...projectIoTools,
    ...fileManagementTools,
    ...specialistTools,
    ...novelTools,
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
  void import("../services/tool-plugin-loader")
    .then(({ _resetToolPlugins }) => {
      _resetToolPlugins();
    })
    .catch((err) => {
      errorLogger.warn("[tools] _resetToolPlugins 导入失败", err instanceof Error ? err : undefined);
    });
}

export { toolRegistry } from "../services/tool-registry";
export { toolExecutor } from "../services/tool-executor";
