/**
 * 工具注册入口
 *
 * 在应用启动时调用 registerAllTools() 注册所有工具
 * 各 Phase 工具通过追加 import + register 即可扩展
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

let registered = false;

/** 注册所有工具（幂等，重复调用无副作用） */
export function registerAllTools(): void {
  if (registered) return;
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
  ]);
  registered = true;
}

/** 重置注册状态（仅测试用） */
export function _resetRegistration(): void {
  toolRegistry.clear();
  registered = false;
}

export { toolRegistry } from "../services/tool-registry";
export { toolExecutor } from "../services/tool-executor";
