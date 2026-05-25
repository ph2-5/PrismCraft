// API 客户端配置解析
// 处理功能配置解析和提供商/模型选择

import { errorLogger } from "@/shared/error-logger";
import { loadConfig, getCapabilityConfig } from "@/infrastructure/ai-providers/api-config/storage";
import { ApiClientError } from "./errors";
import type {
  ApiCapability,
  ProviderConfig,
  ModelConfig,
  ApiConfig,
} from "@/infrastructure/ai-providers/api-config/types";

export async function resolveCapability(
  capability: ApiCapability,
  config?: ApiConfig,
  providerId?: string,
  modelId?: string,
): Promise<{ provider: ProviderConfig; model: ModelConfig }> {
  const effectiveConfig = config || (await loadConfig());

  if (providerId && modelId) {
    const provider = effectiveConfig.providers.find((p) => p.id === providerId);
    const model = provider?.models.find((m) => m.id === modelId);
    if (provider && model) return { provider, model };
  }

  const { provider, modelId: mappedModelId } = getCapabilityConfig(
    effectiveConfig,
    capability,
  );
  if (provider && mappedModelId) {
    const model = provider.models.find((m) => m.id === mappedModelId);
    if (model) return { provider, model };
  }

  for (const p of effectiveConfig.providers) {
    const m = p.models.find((m) => m.capabilities.includes(capability));
    if (m) return { provider: p, model: m };
  }

  throw new ApiClientError(
    `没有配置支持 ${capability} 的 API，请先在设置中配置`,
    400,
    "CONFIG_MISSING",
  );
}

export const MAX_PROMPT_LENGTH = 50000;

export function safeTruncatePrompt(prompt: string): {
  truncated: string;
  wasTruncated: boolean;
} {
  if (prompt.length <= MAX_PROMPT_LENGTH) {
    return { truncated: prompt, wasTruncated: false };
  }
  const keepStart = Math.floor(MAX_PROMPT_LENGTH * 0.7);
  const keepEnd = MAX_PROMPT_LENGTH - keepStart - 100;
  const truncated = `${prompt.substring(0, keepStart)}\n... [内容已截断，请精简故事板] ...\n${prompt.substring(prompt.length - keepEnd)}`;
  errorLogger.warn(
    `[API Client] 提示词被截断 (原始长度: ${prompt.length} -> ${truncated.length})`,
  );
  return { truncated, wasTruncated: true };
}
