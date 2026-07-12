/**
 * 项目导入导出工具（Project I/O Tools）
 *
 * 包含工具：
 * - export_project：导出整个项目数据为 JSON 文件
 * - import_project：从 JSON 文件导入项目数据
 * - export_characters：导出指定角色为 ASA 文件
 * - export_scenes：导出指定场景为 ASA 文件
 *
 * 设计要点：
 * - 复用 @/modules/asset/import-export 的 exportData/importData service（不重新实现业务逻辑）
 * - 复用 @/modules/asset 的 assetExportService 做 ASA 分类导出
 * - 文件读写通过 @/shared/file-http（HTTP 优先，IPC 回退）
 * - 避免使用 DOM 依赖的 downloadExport/importFromFile（不调用 saveFileDialog/Blob）
 * - 输出路径未指定时写入缓存目录
 */

import type { ToolImpl } from "../domain/types";
import { TOOL_TIMEOUTS } from "../services/tool-executor";
import { writeFile, readFile, getCacheDirectory } from "@/shared/file-http";

// ============= 辅助函数 =============

/**
 * 检查路径是否属于 Agent 内部受保护目录。
 * 防止 Agent 通过 export_project 覆盖审计日志/会话检查点。
 */
function isProtectedAgentPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();
  const protectedSegments = [
    "/agent/audit/",
    "/agent/sessions/",
    "/agent/tool-plugins/",
  ];
  return protectedSegments.some((seg) => normalized.includes(seg));
}

// ============= 工具实现 =============

/** 导出整个项目数据为 JSON 文件 */
export const exportProjectTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "export_project",
      description:
        "导出整个项目数据（角色/场景/故事/视频任务/媒体资产/模板等）为 JSON 文件。" +
        "包含所有数据库内容，可用于项目备份或迁移。返回导出文件路径和统计信息。",
      parameters: {
        type: "object",
        properties: {
          outputPath: {
            type: "string",
            description: "输出文件路径（.json）。不指定则保存到缓存目录，文件名自动生成。",
            maxLength: 1024,
          },
        },
      },
    },
  },
  domain: "project-io",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.mutation,
  async execute(args) {
    const { exportData } = await import("@/modules/asset/import-export");
    const result = await exportData();
    if (!result.ok) {
      return { success: false, error: String(result.error ?? "导出失败") };
    }

    const json = JSON.stringify(result.value, null, 2);
    const outputPath = args.outputPath
      ? String(args.outputPath)
      : await resolveOutputPath("project-exports", `project_${Date.now()}.json`);

    // 保护 Agent 内部目录（防止覆盖审计日志/会话检查点）
    if (isProtectedAgentPath(outputPath)) {
      return { success: false, error: "输出路径受保护，不允许写入 Agent 内部目录" };
    }

    const writeResult = await writeFile(outputPath, json);
    if (!writeResult.success) {
      return { success: false, error: writeResult.error || "写入文件失败" };
    }

    // 统计各类数据条数
    const stats: Record<string, number> = {};
    const data = result.value as Record<string, unknown>;
    for (const [key, value] of Object.entries(data)) {
      if (Array.isArray(value)) {
        stats[key] = value.length;
      }
    }

    return {
      success: true,
      data: {
        outputPath,
        fileSize: json.length,
        stats,
        exportedAt: (result.value as { exportedAt?: string }).exportedAt,
      },
    };
  },
};

/** 从 JSON 文件导入项目数据 */
export const importProjectTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "import_project",
      description:
        "从 JSON 文件导入项目数据。支持三种合并策略：replace（替换所有）/" +
        "merge（合并，遇到同 ID 更新）/skip（跳过已存在的）。返回各类导入条数。",
      parameters: {
        type: "object",
        properties: {
          filePath: { type: "string", description: "JSON 文件路径（必填）", maxLength: 1024 },
          mergeStrategy: {
            type: "string",
            enum: ["replace", "merge", "skip"],
            description: "合并策略，默认 merge",
            default: "merge",
          },
        },
        required: ["filePath"],
      },
    },
  },
  domain: "project-io",
  timeoutMs: TOOL_TIMEOUTS.mutation,
  dangerLevel: "destructive", // replace 策略会覆盖全量数据，标记为危险操作
  requiresConfirmation: true,
  async execute(args) {
    const filePath = String(args.filePath);
    const mergeStrategy = String(args.mergeStrategy || "merge") as
      | "replace"
      | "merge"
      | "skip";

    const readResult = await readFile(filePath);
    if (!readResult || !readResult.success || !readResult.data) {
      return { success: false, error: readResult?.error || "读取文件失败" };
    }

    let json: unknown;
    try {
      const text = new TextDecoder().decode(readResult.data);
      json = JSON.parse(text);
    } catch (e) {
      return {
        success: false,
        error: `JSON 解析失败：${e instanceof Error ? e.message : String(e)}`,
      };
    }

    const { importData } = await import("@/modules/asset/import-export");
    const result = await importData(json, { mergeStrategy });
    if (!result.ok) {
      return { success: false, error: String(result.error ?? "导入失败") };
    }

    return {
      success: true,
      data: {
        imported: result.value.imported,
        errors: result.value.errors,
        mergeStrategy,
      },
    };
  },
};

/** 导出指定角色为 ASA 文件 */
export const exportCharactersTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "export_characters",
      description:
        "导出指定角色（含服装）为 ASA 格式文件。适用于角色素材分享或迁移。" +
        "不指定 characterIds 则导出所有角色。",
      parameters: {
        type: "object",
        properties: {
          characterIds: {
            type: "array",
            items: { type: "string" },
            description: "要导出的角色 ID 数组。不指定则导出所有角色。",
          },
          outputPath: {
            type: "string",
            description: "输出文件路径（.asa）。不指定则保存到缓存目录。",
            maxLength: 1024,
          },
        },
      },
    },
  },
  domain: "project-io",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.mutation,
  async execute(args) {
    const { assetExportService, characterService } = await import("@/modules/asset");

    // 未指定 ID 则导出所有角色
    let characterIds: string[] = Array.isArray(args.characterIds)
      ? (args.characterIds as unknown[]).map((id) => String(id))
      : [];

    if (characterIds.length === 0) {
      const characters = await characterService.getAll();
      characterIds = characters.map((c) => c.id);
    }

    if (characterIds.length === 0) {
      return { success: false, error: "没有可导出的角色" };
    }

    const exportResult = await assetExportService.exportCharacters(characterIds);
    if (!exportResult.ok) {
      return { success: false, error: String(exportResult.error ?? "角色导出失败") };
    }

    const outputPath = args.outputPath
      ? String(args.outputPath)
      : await resolveOutputPath("character-exports", `characters_${Date.now()}.asa`);

    const writeResult = await writeFile(outputPath, exportResult.value);
    if (!writeResult.success) {
      return { success: false, error: writeResult.error || "写入文件失败" };
    }

    return {
      success: true,
      data: {
        outputPath,
        characterCount: characterIds.length,
      },
    };
  },
};

/** 导出指定场景为 ASA 文件 */
export const exportScenesTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "export_scenes",
      description:
        "导出指定场景为 ASA 格式文件。适用于场景素材分享或迁移。" +
        "不指定 sceneIds 则导出所有场景。",
      parameters: {
        type: "object",
        properties: {
          sceneIds: {
            type: "array",
            items: { type: "string" },
            description: "要导出的场景 ID 数组。不指定则导出所有场景。",
          },
          outputPath: {
            type: "string",
            description: "输出文件路径（.asa）。不指定则保存到缓存目录。",
            maxLength: 1024,
          },
        },
      },
    },
  },
  domain: "project-io",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.mutation,
  async execute(args) {
    const { assetExportService, sceneService } = await import("@/modules/asset");

    let sceneIds: string[] = Array.isArray(args.sceneIds)
      ? (args.sceneIds as unknown[]).map((id) => String(id))
      : [];

    if (sceneIds.length === 0) {
      const scenes = await sceneService.getAll();
      sceneIds = scenes.map((s) => s.id);
    }

    if (sceneIds.length === 0) {
      return { success: false, error: "没有可导出的场景" };
    }

    const exportResult = await assetExportService.exportScenes(sceneIds);
    if (!exportResult.ok) {
      return { success: false, error: String(exportResult.error ?? "场景导出失败") };
    }

    const outputPath = args.outputPath
      ? String(args.outputPath)
      : await resolveOutputPath("scene-exports", `scenes_${Date.now()}.asa`);

    const writeResult = await writeFile(outputPath, exportResult.value);
    if (!writeResult.success) {
      return { success: false, error: writeResult.error || "写入文件失败" };
    }

    return {
      success: true,
      data: {
        outputPath,
        sceneCount: sceneIds.length,
      },
    };
  },
};

// ============= 辅助函数 =============

/** 解析输出路径（未指定时写入缓存目录） */
async function resolveOutputPath(
  subdir: string,
  filename: string,
): Promise<string> {
  const dirResult = await getCacheDirectory();
  if (!dirResult.success || !dirResult.path) {
    throw new Error("Failed to get cache directory");
  }
  return `${dirResult.path}/agent/${subdir}/${filename}`;
}

/** 导出所有项目导入导出工具 */
export const projectIoTools: ToolImpl[] = [
  exportProjectTool,
  importProjectTool,
  exportCharactersTool,
  exportScenesTool,
];
