/**
 * AI 生成工具 — 文本类（Text Tool）
 *
 * 包含工具：
 * - generate_text：生成文本（非流式，用于子任务）
 *
 * 设计要点：
 * - 通过 DI container 获取 textProvider
 * - ApiResponse 模式：{ success, data?, error? }
 */

import type { ToolImpl } from "@/domain/types/agent-tools";
import { TOOL_TIMEOUTS } from "@/shared/constants/tool-timeouts";
import { container } from "@/infrastructure/di";

/** 生成文本 */
export const generateTextTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "generate_text",
      description:
        "生成文本（非流式）。适用于子任务场景，如生成角色背景故事、场景描述建议、剧情梗概、提示词优化等。" +
        "注意：这是非流式接口，一次性返回完整文本。如需流式输出请使用 Agent Loop 自身的推理能力。",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string", maxLength: 5000, description: "文本生成提示词（必填）" },
          maxTokens: { type: "number", minimum: 1, maximum: 8192, description: "最大 token 数，默认 2048", default: 2048 },
          temperature: {
            type: "number",
            minimum: 0,
            maximum: 2,
            description: "温度（0-2），默认 0.7。越高越有创造性，越低越确定。",
            default: 0.7,
          },
          providerId: { type: "string", maxLength: 100, description: "指定文本生成 provider ID" },
          modelId: { type: "string", maxLength: 100, description: "指定文本生成 model ID" },
        },
        required: ["prompt"],
      },
    },
  },
  domain: "generation",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.generation,
  async execute(args) {
    const prompt = String(args.prompt);
    const maxTokens = args.maxTokens != null ? Number(args.maxTokens) : 2048;
    const temperature = args.temperature != null ? Number(args.temperature) : 0.7;
    const providerId = args.providerId ? String(args.providerId) : undefined;
    const modelId = args.modelId ? String(args.modelId) : undefined;

    const result = await container.textProvider.generateText(prompt, {
      maxTokens,
      temperature,
      providerId,
      modelId,
    });
    if (!result.success) {
      return { success: false, error: result.error || "文本生成失败" };
    }

    return {
      success: true,
      data: {
        text: result.data.text,
      },
    };
  },
};
