/**
 * 错误诊断工具 — diagnose_error
 *
 * 用 AI（textProvider）分析错误信息，推断原因与修复建议。
 *
 * 设计要点：
 * - 通过 container.textProvider.generateText 让 AI 分析（不硬编码错误模式）
 * - 兼容模型可能包裹 markdown 代码块的 JSON 输出
 * - 解析失败时降级为把原始文本作为单一原因返回
 *
 * 特权访问声明：本文件通过 DI container 直接访问 textProvider，
 * 详见 MODULE.md "Agent 特权访问声明" 章节。
 */

import type { ToolImpl } from "@/domain/types/agent-tools";
import { TOOL_TIMEOUTS } from "@/shared/constants/tool-timeouts";
import { container } from "@/infrastructure/di";
import { errorLogger } from "@/shared/error-logger";

/** 诊断错误（用 AI 分析错误信息，推断原因与修复建议） */
export const diagnoseErrorTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "diagnose_error",
      description:
        "诊断错误：根据错误信息和上下文，用 AI 推断可能原因和修复建议。" +
        "适用于：用户遇到错误但不知道原因、需要分析 stack trace、需要修复建议等场景。" +
        "返回 possibleCauses（可能原因数组）、suggestedFixes（修复建议数组）、severity（low/medium/high）。",
      parameters: {
        type: "object",
        properties: {
          errorMessage: { type: "string", description: "错误信息（必填，尽量完整）", maxLength: 2000 },
          errorContext: {
            type: "object",
            description: "错误上下文（可选）",
            properties: {
              toolName: { type: "string", description: "出错时调用的工具名" },
              args: { type: "object", description: "出错时传给工具的参数" },
              timestamp: { type: "number", description: "出错时间戳（Unix 毫秒）" },
            },
          },
        },
        required: ["errorMessage"],
      },
    },
  },
  domain: "diagnostic",
  dangerLevel: "safe",
  timeoutMs: TOOL_TIMEOUTS.generation,
  async execute(args) {
    const errorMessage = String(args.errorMessage);
    const errorContext = (args.errorContext ?? {}) as {
      toolName?: string;
      args?: Record<string, unknown>;
      timestamp?: number;
    };

    // 构建提示词：明确要求 JSON 输出
    const contextLines: string[] = [];
    if (errorContext.toolName) contextLines.push(`- 工具名: ${errorContext.toolName}`);
    if (errorContext.timestamp) {
      contextLines.push(`- 时间: ${new Date(errorContext.timestamp).toISOString()}`);
    }
    if (errorContext.args) {
      try {
        contextLines.push(`- 参数: ${JSON.stringify(errorContext.args)}`);
      } catch (err) {
        errorLogger.warn("[DiagnoseErrorTool] 序列化错误参数失败", err);
      }
    }
    const contextStr = contextLines.length > 0 ? contextLines.join("\n") : "（无）";

    const prompt = `你是一名经验丰富的 AI 助手开发者，正在分析一个运行时错误。请根据错误信息和上下文，推断可能原因和修复建议。

错误信息：
${errorMessage}

上下文：
${contextStr}

请严格按以下 JSON 格式输出（不要输出其他内容，不要使用 markdown 代码块）：
{
  "possibleCauses": ["原因1", "原因2", "原因3"],
  "suggestedFixes": ["修复建议1", "修复建议2", "修复建议3"],
  "severity": "low" | "medium" | "high"
}

判定 severity 的标准：
- high: 影响核心功能（API 不可用、数据丢失、安全漏洞）
- medium: 影响部分功能但可绕过
- low: 轻微问题或仅提示

只输出 JSON，不要其他文字。`;

    try {
      const result = await container.textProvider.generateText(prompt, {
        temperature: 0.3,
        maxTokens: 1024,
      });

      if (!result.success || !result.data) {
        return {
          success: false,
          error: result.error || "AI 分析失败：textProvider 未返回结果",
        };
      }

      const text = result.data.text?.trim() ?? "";

      // 尝试解析 JSON（兼容模型可能包裹 markdown 代码块的情况）
      let parsed: {
        possibleCauses?: string[];
        suggestedFixes?: string[];
        severity?: string;
      } | null = null;

      try {
        // 直接解析
        parsed = JSON.parse(text);
      } catch {
        // 尝试提取 ```json ... ``` 块
        const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (match) {
          try {
            parsed = JSON.parse(match[1]!.trim());
          } catch (err) {
            errorLogger.warn("[DiagnoseErrorTool] 解析 JSON 代码块失败", err);
          }
        }
      }

      if (!parsed) {
        // 解析失败，把原始文本作为单一原因返回
        return {
          success: true,
          data: {
            possibleCauses: [text.slice(0, 500) || "无法解析 AI 输出"],
            suggestedFixes: [],
            severity: "medium" as const,
            rawOutput: text,
          },
        };
      }

      const possibleCauses = Array.isArray(parsed.possibleCauses)
        ? parsed.possibleCauses.map(String)
        : [];
      const suggestedFixes = Array.isArray(parsed.suggestedFixes)
        ? parsed.suggestedFixes.map(String)
        : [];
      const severityRaw = String(parsed.severity ?? "medium").toLowerCase();
      const severity: "low" | "medium" | "high" =
        severityRaw === "low" || severityRaw === "high" ? severityRaw : "medium";

      return {
        success: true,
        data: {
          possibleCauses,
          suggestedFixes,
          severity,
        },
      };
    } catch (e) {
      return {
        success: false,
        error: `诊断错误失败：${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};
