/**
 * explain_feature 工具实现
 *
 * 解释项目功能（「这个按钮是干什么的」）。根据功能名返回功能说明、使用提示和相关功能。
 *
 * 设计要点：
 * - 优先从静态字典 FEATURE_DOCS 返回
 * - 字典中没有的条目，用 container.textProvider 生成
 * - 所有操作 try/catch，失败时返回友好 fallback
 *
 * 特权访问声明：通过 DI container 直接访问 textProvider。
 */

import type { ToolImpl } from "@/domain/types/agent-tools";
import { TOOL_TIMEOUTS } from "@/shared/constants/tool-timeouts";
import { container } from "@/infrastructure/di";
import { FEATURE_DOCS } from "./feature-docs-data";
import { safeParseJson } from "./help-tools-shared";

/** 解释项目功能 */
export const explainFeatureTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "explain_feature",
      description:
        "解释项目功能（「这个按钮是干什么的」）。根据功能名返回功能说明、使用提示和相关功能。" +
        "支持的功能名如：shot-page（分镜页面）、character-editor（角色编辑器）、scene-editor（场景编辑器）、" +
        "video-generation（视频生成）、api-config（API配置）、story-page（故事页面）等。" +
        "如果功能名不在已知列表中，将基于功能名推测说明。",
      parameters: {
        type: "object",
        properties: {
          featureName: {
            type: "string",
            description: "要解释的功能名（如 shot-page、character-editor、video-generation）",
            maxLength: 100,
          },
        },
        required: ["featureName"],
      },
    },
  },
  domain: "help",
  dangerLevel: "safe",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute(args) {
    const featureName = String(args.featureName || "").trim();
    if (!featureName) {
      return { success: false, error: "featureName 不能为空" };
    }

    // 1. 优先从静态字典查找
    const doc = FEATURE_DOCS[featureName];
    if (doc) {
      return {
        success: true,
        data: {
          feature: featureName,
          description: doc.description,
          usageTips: doc.usageTips,
          relatedFeatures: doc.relatedFeatures,
        },
      };
    }

    // 2. 字典中没有，用 textProvider 生成说明
    try {
      const result = await container.textProvider.generateText(
        `你是 AI 动画工作室的助手。请简要解释 "${featureName}" 功能的用途。返回 JSON 格式：` +
          `{"description":"功能描述（1-2句话）","usageTips":["使用提示1","使用提示2"],"relatedFeatures":["相关功能1","相关功能2"]}` +
          `。只返回 JSON，不要其他内容。`,
        { maxTokens: 500, temperature: 0.3 },
      );

      if (result.success && result.data?.text) {
        const parsed = safeParseJson<{
          description?: string;
          usageTips?: string[];
          relatedFeatures?: string[];
        }>(result.data.text);
        if (parsed) {
          return {
            success: true,
            data: {
              feature: featureName,
              description: parsed.description || "暂无详细说明",
              usageTips: Array.isArray(parsed.usageTips) ? parsed.usageTips : [],
              relatedFeatures: Array.isArray(parsed.relatedFeatures)
                ? parsed.relatedFeatures
                : [],
            },
          };
        }
      }
    } catch {
      // fall through to fallback
    }

    // 3. fallback
    return {
      success: true,
      data: {
        feature: featureName,
        description: `未能找到 "${featureName}" 功能的详细说明。请尝试使用 get_help 工具搜索相关文档，或使用 list_available_commands 查看可用工具。`,
        usageTips: [],
        relatedFeatures: [],
      },
    };
  },
};
