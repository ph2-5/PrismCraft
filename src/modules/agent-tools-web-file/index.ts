/**
 * Agent Tools - Web & File Management 模块
 *
 * 设计要点：
 * - 通过 barrel 导出工具数组和工具实现
 * - 内部实现细节不导出
 * - 其他模块通过 @/modules/agent-tools-web-file 导入
 *
 * 本模块从 agent/tools/ 拆分而来（阶段3-2），包含浏览器/网络工具与文件管理工具。
 * 这些工具均为叶子工具集，无 agent/services 依赖，可直接独立。
 */

// 浏览器/网络工具（8 个）
export {
  searchWebImagesTool,
  searchWebTool,
  downloadWebAssetTool,
  importFromUrlTool,
  fetchWebContentTool,
  openInBrowserTool,
  bookmarkResourceTool,
  listBookmarksTool,
  webTools,
} from "./web-tools";

// 文件管理工具（6 个）
export {
  listFilesTool,
  getFileInfoTool,
  deleteFileTool,
  copyFileTool,
  moveFileTool,
  getDiskSpaceTool,
  fileManagementTools,
} from "./file-management-tools";
