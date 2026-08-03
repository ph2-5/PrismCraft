/**
 * Agent 意图 → 工具集过滤器（从 AgentLoop.buildSystemPrompt 提取，P2.1）。
 *
 * 独立逻辑：
 * - 启用 LLM fallback 时使用 routeIntentWithLlmFallback（异步、可降级）
 * - 否则使用 routeIntent 同步调用
 * - 意图有明确工具集 → 返回该工具集（覆盖 config.enabledTools）
 * - 意图无明确工具集 → 返回 undefined（使用 config.enabledTools）
 *
 * 提取原因：降低 agent-loop.ts 行数，且该逻辑自包含、可独立测试。
 */

import { routeIntent, routeIntentWithLlmFallback, mapIntentToToolSet } from "./intent-router";
import { createLlmIntentClassifier } from "./intent-llm-classifier";
import type { ITextProvider } from "@/domain/ports";

export interface IntentFilterConfig {
  /** 缺省视为 false（走同步 routeIntent） */
  enableLlmIntentFallback?: boolean;
  providerId?: string;
  modelId?: string;
}

/**
 * 根据用户消息识别意图，解析出工具集过滤器。
 *
 * @returns 意图对象 + 明确的工具集（string[]）或 undefined（使用静态 config.enabledTools）
 */
export async function resolveIntentFilter(
  userMessage: string,
  config: IntentFilterConfig,
  textProvider: ITextProvider,
): Promise<{
  intent: Awaited<ReturnType<typeof routeIntentWithLlmFallback>>;
  toolSet: string[] | undefined;
}> {
  const intent = config.enableLlmIntentFallback
    ? await routeIntentWithLlmFallback(
        userMessage,
        createLlmIntentClassifier(textProvider, {
          providerId: config.providerId,
          modelId: config.modelId,
        }),
      )
    : routeIntent(userMessage);

  return { intent, toolSet: mapIntentToToolSet(intent.type) };
}
