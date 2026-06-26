/**
 * API Key 自动检测
 *
 * 检测优先级：插件 > 内置 > 默认值
 *
 * 当多个来源匹配同一 API Key 时，返回所有匹配结果供用户选择。
 * 插件通过 apiKeyDetection 字段声明自己的 API Key 格式。
 * 前端通过 API 从后端获取插件规则缓存到本地。
 */

import { errorLogger } from "@/shared/error-logger";
import { isElectron } from "@/shared/utils/platform";
import { API_SERVER_PORT, ELECTRON_APP_HEADERS } from "@/config/constants";
import { BUILTIN_DETECTION_RULES, TEMPLATE_NAMES } from "../model-registry";

export interface DetectResult {
  templateId: string;
  confidence: "high" | "medium" | "low";
  suggestedName: string;
  baseUrl?: string;
  source: "builtin" | "plugin";
  pluginId?: string;
  isUserPlugin?: boolean;
  isCodePlugin?: boolean;
}

export interface DetectAllResult {
  builtinMatches: DetectResult[];
  pluginMatches: DetectResult[];
  recommended: DetectResult | null;
}

interface PluginDetectionRule {
  pattern: string;
  confidence: "high" | "medium" | "low";
}

interface PluginDetectionConfig {
  pluginId: string;
  rules: PluginDetectionRule[];
  suggestedName: string;
  baseUrl?: string;
  isUserPlugin?: boolean;
  isCodePlugin?: boolean;
}

const BUILTIN_RULES = BUILTIN_DETECTION_RULES;

// ── 插件规则缓存 ──

let pluginDetectionRules: PluginDetectionConfig[] = [];

export async function loadPluginDetectionRules(): Promise<void> {
  if (!isElectron()) {
    return;
  }

  try {
    const baseUrl = `http://localhost:${API_SERVER_PORT}`;
    const res = await fetch(`${baseUrl}/api/plugins/detection-rules`, {
      headers: { ...ELECTRON_APP_HEADERS },
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data.success && Array.isArray(data.data)) {
      pluginDetectionRules = data.data;
    }
  } catch (e) {
    errorLogger.warn("[detect] 加载插件检测规则失败，使用内置规则", e);
  }
}

// ── 检测逻辑 ──

const CONFIDENCE_ORDER: Record<string, number> = { high: 3, medium: 2, low: 1 };

function matchPluginRulesAll(apiKey: string): DetectResult[] {
  const matches: DetectResult[] = [];
  for (const config of pluginDetectionRules) {
    for (const rule of config.rules) {
      try {
        const regex = new RegExp(rule.pattern);
        if (regex.test(apiKey)) {
          matches.push({
            templateId: config.pluginId,
            confidence: rule.confidence,
            suggestedName: config.suggestedName,
            baseUrl: config.baseUrl,
            source: "plugin",
            pluginId: config.pluginId,
            isUserPlugin: config.isUserPlugin,
            isCodePlugin: config.isCodePlugin,
          });
        }
      } catch {
        // 无效正则，跳过
      }
    }
  }
  matches.sort((a, b) => (CONFIDENCE_ORDER[b.confidence] || 0) - (CONFIDENCE_ORDER[a.confidence] || 0));
  return matches;
}

function matchBuiltinRulesAll(apiKey: string): DetectResult[] {
  const matches: DetectResult[] = [];
  for (const rule of BUILTIN_RULES) {
    if (rule.pattern.test(apiKey)) {
      if (rule.check && !rule.check(apiKey)) {
        continue;
      }
      matches.push({
        templateId: rule.templateId,
        confidence: rule.confidence,
        suggestedName: TEMPLATE_NAMES[rule.templateId] || rule.templateId,
        source: "builtin",
      });
    }
  }
  matches.sort((a, b) => (CONFIDENCE_ORDER[b.confidence] || 0) - (CONFIDENCE_ORDER[a.confidence] || 0));
  return matches;
}

/**
 * 检测 API Key 对应的提供商，返回所有匹配结果
 *
 * 返回结构：
 * - builtinMatches: 内置提供商匹配结果（按置信度降序）
 * - pluginMatches: 插件匹配结果（按置信度降序）
 * - recommended: 推荐结果（插件优先 > 内置 > null）
 */
export function detectAllProviders(apiKey: string): DetectAllResult | null {
  if (!apiKey || apiKey.length < 10) return null;
  if (apiKey.includes("your_") || apiKey.includes("placeholder")) return null;

  const pluginMatches = matchPluginRulesAll(apiKey);
  const builtinMatches = matchBuiltinRulesAll(apiKey);

  let recommended: DetectResult | null = null;
  if (pluginMatches.length > 0) {
    recommended = pluginMatches[0]!;
  } else if (builtinMatches.length > 0) {
    recommended = builtinMatches[0]!;
  }

  return { builtinMatches, pluginMatches, recommended };
}

/**
 * 检测 API Key 对应的提供商（兼容旧接口）
 *
 * 优先级：插件 > 内置
 * 返回置信度最高的匹配结果
 */
export function detectProvider(apiKey: string): DetectResult | null {
  const all = detectAllProviders(apiKey);
  return all?.recommended ?? null;
}

/**
 * 验证 API Key 格式是否有效
 *
 * 返回 errorKey（i18n key）而非中文字符串，调用方通过 t(errorKey) 翻译显示。
 * 这样可保持本函数为纯函数，不依赖渲染进程的 i18n 模块。
 */
export function validateApiKey(apiKey: string): {
  valid: boolean;
  errorKey?: string;
} {
  if (!apiKey) {
    return { valid: false, errorKey: "provider.apiKey.empty" };
  }

  if (apiKey.length < 10) {
    return { valid: false, errorKey: "provider.apiKey.tooShort" };
  }

  if (apiKey.length > 512) {
    return { valid: false, errorKey: "provider.apiKey.tooLong" };
  }

  if (apiKey.includes("your_") || apiKey.includes("placeholder")) {
    return { valid: false, errorKey: "provider.apiKey.placeholderDetected" };
  }

  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(apiKey)) {
    return { valid: false, errorKey: "provider.apiKey.invalidChars" };
  }

  return { valid: true };
}
