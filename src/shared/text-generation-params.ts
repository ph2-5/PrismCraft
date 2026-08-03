/**
 * 文本生成参数推荐模块。
 *
 * 根据任务类型和模型特性推荐 temperature / maxTokens / topP 等参数。
 * 纯函数，零外部依赖，可被 infrastructure/ai-providers 和 modules 共同使用。
 */

export type TextTaskType =
  | "story_planning"
  | "shot_contract"
  | "frame_prompt"
  | "character_extraction"
  | "scene_extraction"
  | "treatment_extraction"
  | "structure_analysis"
  | "chat"
  | "code";

export interface TextGenerationParams {
  temperature: number;
  maxTokens: number;
  topP?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
}

/**
 * 获取推荐文本生成参数。
 *
 * @param modelId 模型 ID（用于模型级微调）
 * @param taskType 任务类型（决定基础参数）
 * @returns 推荐参数；调用方可覆盖其中任意字段
 */
export function getRecommendedTextParams(
  modelId: string,
  taskType: TextTaskType,
): TextGenerationParams {
  const base = getBaseParams(taskType);
  return applyModelTweaks(base, modelId);
}

function getBaseParams(taskType: TextTaskType): TextGenerationParams {
  switch (taskType) {
    // 创意规划类：需要一定随机性，但需要结构化输出
    case "story_planning":
      return { temperature: 0.6, maxTokens: 8192 };
    case "shot_contract":
      return { temperature: 0.55, maxTokens: 4096 };
    case "frame_prompt":
      return { temperature: 0.65, maxTokens: 2048 };

    // 提取分析类：需要确定性
    case "character_extraction":
    case "scene_extraction":
    case "treatment_extraction":
    case "structure_analysis":
      return { temperature: 0.3, maxTokens: 4096 };

    // 通用对话
    case "chat":
      return { temperature: 0.7, maxTokens: 2048 };

    // 代码类：低温度，高确定性
    case "code":
      return { temperature: 0.2, maxTokens: 4096 };

    default:
      return { temperature: 0.7, maxTokens: 2048 };
  }
}

/**
 * 根据模型特性微调参数。
 *
 * 注意：这里只覆盖常见模型 ID 子串，未知模型保持基础参数。
 */
function applyModelTweaks(params: TextGenerationParams, modelId: string): TextGenerationParams {
  const lower = modelId.toLowerCase();

  // 推理型模型：温度更低，突出推理能力
  if (lower.includes("deepseek") || lower.includes("reasoner") || lower.includes("o1") || lower.includes("o3")) {
    return { ...params, temperature: Math.max(0.2, params.temperature - 0.15) };
  }

  // Claude：对 system prompt / 结构化指令响应好，可略降温度
  if (lower.includes("claude")) {
    return { ...params, temperature: Math.max(0.2, params.temperature - 0.05) };
  }

  // GPT-4o 系列：部分版本 maxTokens 有限，做上限保护
  if (lower.includes("gpt-4o") || lower.includes("gpt-4.1")) {
    return { ...params, maxTokens: Math.min(params.maxTokens, 4096) };
  }

  // 国产模型：中文理解好，温度可略高以增强表达
  if (
    lower.includes("qwen") ||
    lower.includes("tongyi") ||
    lower.includes("doubao") ||
    lower.includes("volcengine") ||
    lower.includes("glm") ||
    lower.includes("abab")
  ) {
    return { ...params, temperature: Math.min(1.0, params.temperature + 0.05) };
  }

  return params;
}
