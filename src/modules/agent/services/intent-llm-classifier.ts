/**
 * LLM 意图分类器实现
 *
 * 封装 textProvider.generateText 调用，将用户消息分类到 IntentType。
 * 仅在 routeIntent 关键词匹配无命中（返回 default）且 config.enableLlmIntentFallback=true 时被调用。
 *
 * 独立模块原因：
 * - 避免向 agent-loop.ts（已超 max-lines 警告）添加代码
 * - 保持 intent-router.ts 纯函数无 infrastructure 依赖
 */

import type { ITextProvider } from "@/domain/ports/ai-provider-port";
import { buildIntentClassificationPrompt, parseIntentJson, type IntentClassifier } from "./intent-router";
import { errorLogger } from "@/shared/error-logger";

/**
 * 构建 LLM 意图分类器。
 *
 * @param textProvider 文本生成 provider（来自 DI container 或 deps 注入）
 * @param options 模型配置（providerId/modelId，用于指定具体模型）
 */
export function createLlmIntentClassifier(
  textProvider: ITextProvider,
  options: { providerId?: string; modelId?: string },
): IntentClassifier {
  return async (userMessage: string) => {
    try {
      const prompt = buildIntentClassificationPrompt(userMessage);
      const result = await textProvider.generateText(prompt, {
        maxTokens: 100,
        temperature: 0,
        providerId: options.providerId,
        modelId: options.modelId,
      });
      if (!result.success || !result.data?.text) return null;
      return parseIntentJson(result.data.text);
    } catch (e) {
      errorLogger.debug("[IntentLlmClassifier] LLM 意图分类失败", e);
      return null;
    }
  };
}
