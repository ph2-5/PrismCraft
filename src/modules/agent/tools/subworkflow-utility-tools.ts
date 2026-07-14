/**
 * 子流程工具 — 实用工具（Subworkflow Utility Tools）
 *
 * 包含工具：
 * - auto_find_and_import_asset：AI 浏览器找素材并自动入库
 * - auto_fix_common_errors：常见错误自动修复
 */

import type { ToolImpl } from "@/domain/types/agent-tools";
import { TOOL_TIMEOUTS } from "@/shared/constants/tool-timeouts";
import { container } from "@/infrastructure/di";
import { executeTool, generateJsonWithAI } from "./subworkflow-helpers";

/** 6. AI 浏览器找素材并自动入库 */
export const autoFindAndImportAssetTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "auto_find_and_import_asset",
      description:
        "一站式工具：AI 浏览器找素材并自动入库。内部流程：1) 调用 search_web_images 工具搜索图片；2) 如 autoImport=true，自动选择第一个结果并调用 download_web_asset 下载入库；3) 否则返回搜索结果列表，让用户选择后再调用 download_web_asset。" +
        "适用于：用户要求「帮我找一个赛博朋克风格的角色参考图并导入」、「从网上找个素材」等场景。" +
        "注意：需要先在设置中配置搜索 API key。",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", maxLength: 500, description: "搜索关键词（必填）" },
          assetType: {
            type: "string",
            enum: ["character", "scene", "prop"],
            description: "素材类型（必填）",
          },
          count: { type: "number", minimum: 1, maximum: 20, description: "搜索结果数量，默认 5", default: 5 },
          autoImport: {
            type: "boolean",
            description: "是否自动选择第一个结果导入，默认 false",
            default: false,
          },
        },
        required: ["query", "assetType"],
      },
    },
  },
  domain: "workflow",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.download,
  async execute(args, ctx) {
    const query = String(args.query);
    const assetType = String(args.assetType) as "character" | "scene" | "prop";
    const count = Math.min(Math.max(Number(args.count) || 5, 1), 20);
    const autoImport = args.autoImport === true;

    // Step 1: 搜索图片
    ctx.onProgress?.(`正在搜索图片：${query}…`);
    const searchResult = await executeTool(
      "search_web_images",
      { query, count, source: "bing" },
      ctx.onProgress,
    );
    if (!searchResult.success || !searchResult.data) {
      return {
        success: false,
        error: `搜索图片失败：${searchResult.error ?? "未知错误"}`,
      };
    }
    const searchData = searchResult.data as { total: number; items: Array<Record<string, unknown>> };
    const items = searchData.items ?? [];
    if (items.length === 0) {
      return {
        success: true,
        data: { searchResults: [], importedAsset: undefined, message: "未找到搜索结果" },
      };
    }

    // Step 2: 自动导入或返回列表
    if (!autoImport) {
      return {
        success: true,
        data: {
          searchResults: items.map((it, i) => ({
            index: i,
            title: String(it.title ?? ""),
            imageUrl: String(it.imageUrl ?? ""),
            thumbnailUrl: String(it.thumbnailUrl ?? ""),
            sourceUrl: String(it.sourceUrl ?? ""),
          })),
          importedAsset: undefined,
          message: "请选择一个结果后调用 download_web_asset 导入（autoImport=false）",
        },
      };
    }

    // 自动导入第一个
    const first = items[0]!;
    const imageUrl = String(first.imageUrl ?? "");
    const name = String(first.title ?? `素材_${Date.now()}`);
    ctx.onProgress?.(`正在下载并导入：${name}…`);
    const importResult = await executeTool(
      "download_web_asset",
      { url: imageUrl, assetType, name },
      ctx.onProgress,
    );

    return {
      success: importResult.success,
      data: {
        searchResults: items.map((it, i) => ({
          index: i,
          title: String(it.title ?? ""),
          imageUrl: String(it.imageUrl ?? ""),
        })),
        importedAsset: importResult.success
          ? (importResult.data as Record<string, unknown>)
          : undefined,
        importError: importResult.success ? undefined : importResult.error,
      },
      error: importResult.success ? undefined : `导入失败：${importResult.error}`,
    };
  },
};

/** 7. 常见错误自动修复 */
export const autoFixCommonErrorsTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "auto_fix_common_errors",
      description:
        "一站式工具：常见错误自动修复。内部流程：1) 用 AI 分析错误描述，判断错误类型；2) 根据错误类型执行修复策略（API 连接错误检查配置、模型不存在列出可用模型、配额超限提示用户、视频生成失败尝试恢复任务）；3) 返回修复结果。" +
        "适用于：用户要求「帮我修复这个错误」、「这个报错怎么解决」等场景。",
      parameters: {
        type: "object",
        properties: {
          errorDescription: {
            type: "string",
            maxLength: 2000,
            description: "错误描述（必填，完整的错误信息）",
          },
          errorContext: {
            type: "object",
            description: "错误上下文（可选，如 { toolName, storyId, taskId }）",
          },
        },
        required: ["errorDescription"],
      },
    },
  },
  domain: "workflow",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.mutation,
  async execute(args, ctx) {
    const errorDescription = String(args.errorDescription);
    const errorContext = (args.errorContext as Record<string, unknown> | undefined) ?? {};

    // Step 1: 用 AI 分析错误类型
    ctx.onProgress?.("正在分析错误类型…");
    const prompt = `你是一位 AI 助手运维专家。请分析以下错误描述，判断错误类型并给出修复建议。

错误描述：
${errorDescription}

上下文：
${JSON.stringify(errorContext, null, 2)}

请严格按照以下 JSON 格式输出，不要输出任何其他内容：
{
  "errorType": "api_connection | model_not_found | quota_exceeded | video_generation_failed | config_missing | unknown",
  "confidence": 0.9,
  "suggestedAction": "建议的修复动作描述"
}`;
    const analysis = await generateJsonWithAI(prompt);
    const errorType = String(analysis?.errorType ?? "unknown");
    const suggestedAction = String(analysis?.suggestedAction ?? "");

    // Step 2: 根据错误类型执行修复策略
    ctx.onProgress?.(`正在执行修复策略（${errorType}）…`);
    let fixed = false;
    let fixAction = suggestedAction;
    let message = "";

    try {
      if (errorType === "api_connection" || errorType === "config_missing") {
        // 检查配置
        const { getConfig } = await import("@/shared/file-http");
        const apiBaseUrl = await getConfig("apiBaseUrl");
        const apiKey = await getConfig("apiKey");
        if (!apiBaseUrl || !apiKey) {
          fixAction = "请在设置中配置 apiBaseUrl 和 apiKey";
          message = "API 配置缺失，请在设置中完善 API 配置";
        } else {
          // 尝试测试连接
          const testResult = await executeTool("test_connection", {}, ctx.onProgress);
          fixed = testResult.success;
          message = fixed ? "API 连接已恢复" : `API 连接测试失败：${testResult.error ?? "未知"}`;
        }
      } else if (errorType === "model_not_found") {
        // 列出可用模型
        const { loadConfig } = await import("@/shared/api-config");
        const config = await loadConfig();
        const models = config?.providers?.flatMap((p) =>
          (p.models ?? []).map((m) => `${p.id}/${m.id}`),
        ) ?? [];
        fixAction = `可用模型列表：${models.join(", ") || "无可用模型"}`;
        message = "请使用可用模型列表中的模型 ID";
      } else if (errorType === "quota_exceeded") {
        fixAction = "API 配额已超限，请升级套餐或等待配额重置";
        message = "配额超限，需用户手动处理";
      } else if (errorType === "video_generation_failed") {
        // 尝试恢复视频任务
        const taskId = errorContext.taskId ? String(errorContext.taskId) : undefined;
        if (taskId) {
          const statusResult = await container.videoProvider.queryVideoStatus(taskId);
          if (statusResult.success && statusResult.data) {
            if (statusResult.data.status === "completed" && statusResult.data.videoUrl) {
              fixed = true;
              message = `任务 ${taskId} 实际已完成，视频 URL：${statusResult.data.videoUrl}`;
            } else {
              message = `任务 ${taskId} 当前状态：${statusResult.data.status}`;
            }
          } else {
            message = `查询任务 ${taskId} 状态失败：${statusResult.error ?? "未知"}`;
          }
        } else {
          message = "未提供 taskId，无法恢复视频任务";
        }
      } else {
        message = `未知错误类型，建议操作：${suggestedAction || "请检查错误信息后重试"}`;
      }
    } catch (e) {
      message = `修复策略执行异常：${e instanceof Error ? e.message : String(e)}`;
    }

    return {
      success: true,
      data: {
        errorType,
        fixed,
        fixAction,
        message,
      },
    };
  },
};
