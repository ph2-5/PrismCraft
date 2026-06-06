/**
 * API Key 自动检测
 *
 * 优先使用插件系统提供的检测规则，fallback 到内置规则。
 * 插件通过 apiKeyDetection 字段声明自己的 API Key 格式。
 * 前端通过 API 从后端获取插件规则缓存到本地。
 */

import { errorLogger } from "@/shared/error-logger";
import { isElectron } from "@/shared/utils/platform";
import { API_SERVER_PORT, ELECTRON_APP_HEADERS } from "@/config/constants";

interface DetectResult {
  templateId: string;
  confidence: "high" | "medium" | "low";
  suggestedName: string;
  baseUrl?: string;
  isPlugin?: boolean;
  pluginId?: string;
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

// ── 内置规则（兜底，当插件系统不可用时使用） ──

const BUILTIN_RULES: {
  pattern: RegExp;
  templateId: string;
  confidence: "high" | "medium" | "low";
  check?: (key: string) => boolean;
}[] = [
  { pattern: /^sk-ant-api03-[a-zA-Z0-9_-]+$/, templateId: "anthropic", confidence: "high" },
  { pattern: /^sk-proj-[a-zA-Z0-9_-]+$/, templateId: "openai", confidence: "high" },
  { pattern: /^sk-or-[a-zA-Z0-9_-]+$/, templateId: "openrouter", confidence: "high" },
  { pattern: /^AIza[a-zA-Z0-9_-]{30,}$/, templateId: "google", confidence: "high" },
  { pattern: /^00[a-f0-9]{32}\.[a-z0-9]{16}$/i, templateId: "zhipu", confidence: "high" },
  { pattern: /^[a-f0-9]{32}\.[a-zA-Z0-9]{20}$/, templateId: "zhipu", confidence: "high" },
  { pattern: /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i, templateId: "volcengine", confidence: "high" },
  { pattern: /seedance|atlas/i, templateId: "seedance", confidence: "high" },
  { pattern: /moonshot/i, templateId: "moonshot", confidence: "high" },
  {
    pattern: /^sk-[a-zA-Z0-9]{48}$/,
    templateId: "openai",
    confidence: "high",
    check: (key) => !key.startsWith("sk-or-") && !key.startsWith("sk-proj-") && !key.startsWith("sk-ant-"),
  },
  {
    pattern: /^sk-[a-zA-Z0-9]{32}$/,
    templateId: "deepseek",
    confidence: "high",
    check: (key) => !key.startsWith("sk-or-") && !key.startsWith("sk-proj-") && !key.startsWith("sk-ant-"),
  },
  {
    pattern: /^sk-[a-zA-Z0-9]{24,}$/,
    templateId: "qwen",
    confidence: "medium",
    check: (key) =>
      !key.startsWith("sk-or-") &&
      !key.startsWith("sk-proj-") &&
      !key.startsWith("sk-ant-") &&
      !/^sk-[a-zA-Z0-9]{48}$/.test(key) &&
      !/^sk-[a-zA-Z0-9]{32}$/.test(key),
  },
  { pattern: /^sk-[a-zA-Z0-9]{10}$/, templateId: "moonshot", confidence: "low" },
];

const TEMPLATE_NAMES: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic Claude",
  google: "Google Gemini",
  deepseek: "DeepSeek",
  moonshot: "Moonshot (Kimi)",
  volcengine: "火山引擎",
  byteplus: "BytePlus",
  zhipu: "智谱 AI",
  openrouter: "OpenRouter",
  seedance: "Seedance (Atlas)",
  pollinations: "Pollinations (免费)",
  ollama: "Ollama (本地)",
  qwen: "通义千问",
  kuaishou: "快手可灵 Kling",
  pixverse: "PixVerse",
  sora: "OpenAI Sora",
  bedrock: "Amazon Bedrock",
  fireworks: "Fireworks AI",
  custom: "自定义 API",
};

// ── 插件规则缓存 ──

let pluginDetectionRules: PluginDetectionConfig[] = [];

export function setPluginDetectionRules(rules: PluginDetectionConfig[]): void {
  pluginDetectionRules = rules;
}

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

function matchPluginRules(apiKey: string): DetectResult | null {
  for (const config of pluginDetectionRules) {
    for (const rule of config.rules) {
      try {
        const regex = new RegExp(rule.pattern);
        if (regex.test(apiKey)) {
          return {
            templateId: config.pluginId,
            confidence: rule.confidence,
            suggestedName: config.suggestedName,
            baseUrl: config.baseUrl,
            isPlugin: true,
            pluginId: config.pluginId,
          };
        }
      } catch {
        // 无效正则，跳过
      }
    }
  }
  return null;
}

function matchBuiltinRules(apiKey: string): DetectResult | null {
  for (const rule of BUILTIN_RULES) {
    if (rule.pattern.test(apiKey)) {
      if (rule.check && !rule.check(apiKey)) {
        continue;
      }
      return {
        templateId: rule.templateId,
        confidence: rule.confidence,
        suggestedName: TEMPLATE_NAMES[rule.templateId] || rule.templateId,
      };
    }
  }
  return null;
}

/**
 * 检测 API Key 对应的提供商
 * 优先匹配插件规则，再匹配内置规则
 */
export function detectProvider(apiKey: string): DetectResult | null {
  if (!apiKey || apiKey.length < 10) return null;

  if (apiKey.includes("your_") || apiKey.includes("placeholder")) {
    return null;
  }

  // 优先使用插件规则
  if (pluginDetectionRules.length > 0) {
    const pluginResult = matchPluginRules(apiKey);
    if (pluginResult) return pluginResult;
  }

  // 兜底使用内置规则
  return matchBuiltinRules(apiKey);
}

/**
 * 验证 API Key 格式是否有效
 */
export function validateApiKey(apiKey: string): {
  valid: boolean;
  error?: string;
} {
  if (!apiKey) {
    return { valid: false, error: "API Key 不能为空" };
  }

  if (apiKey.length < 10) {
    return { valid: false, error: "API Key 长度过短" };
  }

  if (apiKey.length > 512) {
    return { valid: false, error: "API Key 长度过长" };
  }

  if (apiKey.includes("your_") || apiKey.includes("placeholder")) {
    return { valid: false, error: "请替换为真实的 API Key" };
  }

  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(apiKey)) {
    return { valid: false, error: "API Key 包含非法字符" };
  }

  return { valid: true };
}

/**
 * 获取 API Key 强度
 */
export function getKeyStrength(
  apiKey: string,
): "invalid" | "weak" | "medium" | "strong" {
  const validation = validateApiKey(apiKey);
  if (!validation.valid) return "invalid";

  if (apiKey.length < 30) return "weak";
  if (apiKey.length < 50) return "medium";
  return "strong";
}

/**
 * 获取强度显示信息
 */
export function getKeyStrengthInfo(
  strength: ReturnType<typeof getKeyStrength>,
): {
  label: string;
  color: string;
  icon: string;
} {
  switch (strength) {
    case "invalid":
      return { label: "无效", color: "text-red-500", icon: "❌" };
    case "weak":
      return { label: "弱", color: "text-orange-500", icon: "⚠️" };
    case "medium":
      return { label: "中等", color: "text-yellow-500", icon: "🔶" };
    case "strong":
      return { label: "强", color: "text-green-500", icon: "✅" };
  }
}

/**
 * 获取所有模板名称映射（内置 + 插件）
 */
export function getTemplateNames(): Record<string, string> {
  const names: Record<string, string> = { ...TEMPLATE_NAMES };
  for (const config of pluginDetectionRules) {
    if (!names[config.pluginId]) {
      names[config.pluginId] = config.suggestedName;
    }
  }
  return names;
}
