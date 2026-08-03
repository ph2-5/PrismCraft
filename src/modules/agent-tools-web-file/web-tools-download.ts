/**
 * 浏览器/网络工具 - 下载工具
 *
 * 包含工具：
 * - download_web_asset：下载网络素材到本地素材库
 * - import_from_url：从 URL 导入素材
 *
 * 设计要点：
 * - 下载使用 httpDownloadToFile（主进程流式下载，绕过渲染进程内存）
 * - 错误处理完善，所有下载操作均 try/catch
 * - SSRF 基本校验：下载 URL 必须是 http/https
 *
 * 特权访问声明：本文件通过 DI container 直接访问 elementStorage（prop 元素入库），
 * 详见 MODULE.md "Agent 特权访问声明" 章节。
 */

import type { ToolImpl } from "@/domain/types/agent-tools";
import { TOOL_TIMEOUTS } from "@/shared/constants/tool-timeouts";
import { errorLogger } from "@/shared/error-logger";
import { isHttpUrl } from "./web-tools-shared";

// ============= 辅助函数 =============

/** 从 URL 提取文件扩展名，无法识别时默认 jpg */
function getExtensionFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const match = u.pathname.match(/\.([a-zA-Z0-9]{1,8})$/);
    if (match && match[1]) {
      const ext = match[1].toLowerCase();
      const known = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "mp4", "webm", "mov", "mp3", "wav", "webm"];
      if (known.includes(ext)) return ext;
      return ext;
    }
  } catch {
    // 无效 URL，使用默认扩展名
  }
  return "jpg";
}

// ============= 工具实现 =============

/** 下载网络素材到本地素材库 */
export const downloadWebAssetTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "download_web_asset",
      description:
        "下载网络素材到本地素材库。支持角色/场景/道具三种类型，下载成功后会尝试入库（character/scene 调用对应 service，prop 调用 elementStorage）。下载是安全操作，无需用户确认。",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "素材 URL（http/https）", maxLength: 2048 },
          assetType: {
            type: "string",
            enum: ["character", "scene", "prop"],
            description: "素材类型",
          },
          name: { type: "string", description: "素材名称（用于文件名和入库）" },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "标签列表（可选）",
          },
        },
        required: ["url", "assetType", "name"],
      },
    },
  },
  domain: "web",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.download,
  requiresConfirmation: false,
  async execute(args) {
    const url = String(args.url);
    const assetType = String(args.assetType) as "character" | "scene" | "prop";
    const name = String(args.name);
    const tags = Array.isArray(args.tags) ? (args.tags as string[]) : [];

    if (!isHttpUrl(url)) {
      return { success: false, error: `URL 必须是 http/https 协议：${url}` };
    }

    const { httpDownloadToFile, getCacheDirectory } = await import("@/shared/file-http");

    const dirResult = await getCacheDirectory();
    if (!dirResult?.success || !dirResult.path) {
      return { success: false, error: `无法获取缓存目录：${dirResult?.error || "unknown"}` };
    }

    const ext = getExtensionFromUrl(url);
    const safeName = name.replace(/[\\/:*?"<>|]/g, "_");
    const localPath = `${dirResult.path}/assets/${assetType}/${Date.now()}_${safeName}.${ext}`;

    try {
      const result = await httpDownloadToFile(url, localPath);
      if (!result?.success) {
        return {
          success: false,
          error: `下载失败：${result?.error || "httpDownloadToFile 返回 null（HTTP 不可用且无 IPC 回退）"}`,
        };
      }
    } catch (e) {
      return {
        success: false,
        error: `下载失败：${e instanceof Error ? e.message : String(e)}`,
      };
    }

    // 可选入库（best-effort，失败不影响下载结果）
    let assetId: string | undefined;
    try {
      if (assetType === "character") {
        const { characterService } = await import("@/modules/character");
        const r = await characterService.create({
          name,
          description: `从网络下载的角色素材：${name}`,
          gender: "unknown",
          style: "",
          personality: [],
          appearance: { hairColor: "", hairStyle: "", eyeColor: "", height: "", build: "", clothing: "" },
          prompt: "",
          thumbnailPath: localPath,
          tags,
        });
        if (r.ok) assetId = r.value.id;
      } else if (assetType === "scene") {
        const { sceneService } = await import("@/modules/scene");
        const r = await sceneService.create({
          name,
          description: `从网络下载的场景素材：${name}`,
          type: "",
          timeOfDay: "",
          weather: "",
          mood: "",
          lighting: "",
          elements: [],
          colors: [],
          prompt: "",
          thumbnailPath: localPath,
          tags,
        });
        if (r.ok) assetId = r.value.id;
      } else if (assetType === "prop") {
        const { container } = await import("@/infrastructure/di");
        const element = await container.elementStorage.createElement("prop", name);
        assetId = element.id;
      }
    } catch (err) {
      errorLogger.warn("[WebTools] 素材入库失败", err);
    }

    return {
      success: true,
      data: {
        localPath,
        assetType,
        name,
        assetId,
      },
    };
  },
};

/** 从 URL 导入素材（直接 URL，非搜索） */
export const importFromUrlTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "import_from_url",
      description:
        "从 URL 导入素材（直接 URL，非搜索）。比 download_web_asset 更通用：支持 image 类型，不强制入库。适用于用户已知道素材直链的场景。",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "素材 URL（http/https）", maxLength: 2048 },
          assetType: {
            type: "string",
            enum: ["character", "scene", "prop", "image"],
            description: "素材类型",
          },
          name: { type: "string", description: "素材名称" },
          description: { type: "string", description: "素材描述（可选）", maxLength: 1000 },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "标签列表（可选）",
          },
        },
        required: ["url", "assetType", "name"],
      },
    },
  },
  domain: "web",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.download,
  requiresConfirmation: false,
  async execute(args) {
    const url = String(args.url);
    const assetType = String(args.assetType) as "character" | "scene" | "prop" | "image";
    const name = String(args.name);
    const description = args.description ? String(args.description) : "";
    const tags = Array.isArray(args.tags) ? (args.tags as string[]) : [];

    if (!isHttpUrl(url)) {
      return { success: false, error: `URL 必须是 http/https 协议：${url}` };
    }

    const { httpDownloadToFile, getCacheDirectory } = await import("@/shared/file-http");

    const dirResult = await getCacheDirectory();
    if (!dirResult?.success || !dirResult.path) {
      return { success: false, error: `无法获取缓存目录：${dirResult?.error || "unknown"}` };
    }

    const ext = getExtensionFromUrl(url);
    const safeName = name.replace(/[\\/:*?"<>|]/g, "_");
    const localPath = `${dirResult.path}/assets/${assetType}/${Date.now()}_${safeName}.${ext}`;

    try {
      const result = await httpDownloadToFile(url, localPath);
      if (!result?.success) {
        return {
          success: false,
          error: `导入失败：${result?.error || "httpDownloadToFile 返回 null（HTTP 不可用且无 IPC 回退）"}`,
        };
      }
    } catch (e) {
      return {
        success: false,
        error: `导入失败：${e instanceof Error ? e.message : String(e)}`,
      };
    }

    return {
      success: true,
      data: {
        localPath,
        assetType,
        name,
        description,
        tags,
        imported: true,
      },
    };
  },
};
