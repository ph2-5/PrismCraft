/**
 * 文件管理工具（File Management Tools）
 *
 * 包含工具：
 * - list_files：列出指定类别目录下的文件
 * - get_file_info：获取文件信息（大小等）
 * - delete_file：删除文件
 * - copy_file：复制文件到目标类别目录
 * - move_file：移动文件（复制 + 删除源文件）
 * - get_disk_space：查询磁盘空间
 *
 * 设计要点：
 * - 复用 @/shared/file-http 的所有函数（不直接调用 HTTP API 或 IPC）
 * - 文件类别与主进程 fileCategorySchema 对齐（character/scene/storyboard/video-cache 等）
 * - move_file 通过 copy + delete 实现（主进程无 move 路由，避免新增）
 * - 所有操作返回 Result 模式：{ success, data?, error? }
 */

import type { ToolImpl } from "../domain/types";
import { TOOL_TIMEOUTS } from "../services/tool-executor";
import {
  listFiles,
  copyFile,
  getFileInfo,
  deleteFile,
  getDiskSpace,
  getCacheDirectory,
  type FileCategory,
} from "@/shared/file-http";

// ============= 工具实现 =============

/** 列出指定类别目录下的文件 */
export const listFilesTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "list_files",
      description:
        "列出指定类别目录下的文件。类别：character/scene/storyboard/video-cache/image-cache/upload/plugin。" +
        "返回文件名、大小、修改时间。支持分页。",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: ["character", "scene", "storyboard", "video-cache", "image-cache", "upload", "plugin"],
            description: "文件类别",
          },
          limit: { type: "number", description: "返回上限，默认 100，最大 500", default: 100 },
          offset: { type: "number", description: "偏移量，默认 0", default: 0 },
        },
        required: ["category"],
      },
    },
  },
  domain: "file-management",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute(args) {
    const category = String(args.category) as FileCategory;
    const limit = Math.min(Number(args.limit) || 100, 500);
    const offset = Math.max(Number(args.offset) || 0, 0);

    const result = await listFiles(category, { limit, offset });
    if (result === null) {
      return { success: false, error: "文件服务不可用" };
    }
    if (!result.success) {
      return { success: false, error: result.error || "列出文件失败" };
    }
    return {
      success: true,
      data: {
        files: result.data?.files ?? [],
        total: result.data?.total ?? 0,
        offset: result.data?.offset ?? offset,
        limit: result.data?.limit ?? limit,
      },
    };
  },
};

/** 获取文件信息 */
export const getFileInfoTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "get_file_info",
      description: "获取文件信息（大小等）。传入文件绝对路径或类别内的相对 key。",
      parameters: {
        type: "object",
        properties: {
          filePath: { type: "string", description: "文件路径" },
        },
        required: ["filePath"],
      },
    },
  },
  domain: "file-management",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute(args) {
    const filePath = String(args.filePath);
    const result = await getFileInfo(filePath);
    if (result === null) {
      return { success: false, error: "文件服务不可用" };
    }
    if (!result.success) {
      return { success: false, error: result.error || "获取文件信息失败" };
    }
    return {
      success: true,
      data: { size: result.size },
    };
  },
};

/** 删除文件 */
export const deleteFileTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "delete_file",
      description: "删除文件。传入文件绝对路径。操作不可撤销，需谨慎使用。",
      parameters: {
        type: "object",
        properties: {
          filePath: { type: "string", description: "要删除的文件路径" },
        },
        required: ["filePath"],
      },
    },
  },
  domain: "file-management",
  timeoutMs: TOOL_TIMEOUTS.mutation,
  requiresConfirmation: true,
  async execute(args) {
    const filePath = String(args.filePath);
    const success = await deleteFile(filePath);
    return {
      success,
      data: { filePath, deleted: success },
    };
  },
};

/** 复制文件到目标类别目录 */
export const copyFileTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "copy_file",
      description:
        "复制文件到目标类别目录。源文件用绝对路径或 key，目标用类别 + key。",
      parameters: {
        type: "object",
        properties: {
          sourceKey: { type: "string", description: "源文件路径或 key" },
          targetCategory: {
            type: "string",
            enum: ["character", "scene", "storyboard", "video-cache", "image-cache", "upload", "plugin"],
            description: "目标类别",
          },
          targetKey: { type: "string", description: "目标文件名/key" },
        },
        required: ["sourceKey", "targetCategory", "targetKey"],
      },
    },
  },
  domain: "file-management",
  timeoutMs: TOOL_TIMEOUTS.mutation,
  async execute(args) {
    const sourceKey = String(args.sourceKey);
    const targetCategory = String(args.targetCategory) as FileCategory;
    const targetKey = String(args.targetKey);

    const result = await copyFile(sourceKey, targetCategory, targetKey);
    if (result === null) {
      return { success: false, error: "文件服务不可用" };
    }
    if (!result.success) {
      return { success: false, error: result.error || "复制文件失败" };
    }
    return {
      success: true,
      data: { sourceKey, targetCategory, targetKey },
    };
  },
};

/** 移动文件（复制 + 删除源文件） */
export const moveFileTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "move_file",
      description:
        "移动文件到目标类别目录（复制到目标后删除源文件）。适用于整理素材文件。",
      parameters: {
        type: "object",
        properties: {
          sourceKey: { type: "string", description: "源文件路径或 key" },
          targetCategory: {
            type: "string",
            enum: ["character", "scene", "storyboard", "video-cache", "image-cache", "upload", "plugin"],
            description: "目标类别",
          },
          targetKey: { type: "string", description: "目标文件名/key" },
          deleteSource: {
            type: "boolean",
            description: "是否删除源文件，默认 true",
            default: true,
          },
        },
        required: ["sourceKey", "targetCategory", "targetKey"],
      },
    },
  },
  domain: "file-management",
  timeoutMs: TOOL_TIMEOUTS.mutation,
  requiresConfirmation: true,
  async execute(args) {
    const sourceKey = String(args.sourceKey);
    const targetCategory = String(args.targetCategory) as FileCategory;
    const targetKey = String(args.targetKey);
    const deleteSource = args.deleteSource !== false;

    // 先复制
    const copyResult = await copyFile(sourceKey, targetCategory, targetKey);
    if (copyResult === null) {
      return { success: false, error: "文件服务不可用" };
    }
    if (!copyResult.success) {
      return { success: false, error: copyResult.error || "复制文件失败，移动中止" };
    }

    // 复制成功后删除源文件
    if (deleteSource) {
      const deleted = await deleteFile(sourceKey);
      if (!deleted) {
        return {
          success: true,
          data: {
            sourceKey,
            targetCategory,
            targetKey,
            warning: "目标文件已复制，但源文件删除失败，请手动清理",
          },
        };
      }
    }

    return {
      success: true,
      data: { sourceKey, targetCategory, targetKey, sourceDeleted: deleteSource },
    };
  },
};

/** 查询磁盘空间 */
export const getDiskSpaceTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "get_disk_space",
      description:
        "查询磁盘空间。不指定路径则查询缓存目录所在磁盘。返回可用空间和总空间（字节）。",
      parameters: {
        type: "object",
        properties: {
          dirPath: { type: "string", description: "查询路径（可选，默认缓存目录）" },
        },
      },
    },
  },
  domain: "file-management",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute(args) {
    let dirPath = args.dirPath ? String(args.dirPath) : undefined;
    if (!dirPath) {
      const cacheDir = await getCacheDirectory();
      if (!cacheDir.success || !cacheDir.path) {
        return { success: false, error: "无法获取缓存目录" };
      }
      dirPath = cacheDir.path;
    }

    const result = await getDiskSpace(dirPath);
    if (result === null) {
      return { success: false, error: "文件服务不可用" };
    }
    if (!result.success) {
      return { success: false, error: result.error || "查询磁盘空间失败" };
    }
    return {
      success: true,
      data: {
        availableBytes: result.availableBytes,
        totalBytes: result.totalBytes,
        availableGB: result.availableBytes
          ? Number((result.availableBytes / 1024 / 1024 / 1024).toFixed(2))
          : undefined,
        totalGB: result.totalBytes
          ? Number((result.totalBytes / 1024 / 1024 / 1024).toFixed(2))
          : undefined,
      },
    };
  },
};

/** 导出所有文件管理工具 */
export const fileManagementTools: ToolImpl[] = [
  listFilesTool,
  getFileInfoTool,
  deleteFileTool,
  copyFileTool,
  moveFileTool,
  getDiskSpaceTool,
];
