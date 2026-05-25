/**
 * API Key 自动检测
 * 
 * 根据 API Key 格式自动识别提供商类型。
 * 目前仍在设置页面中使用（添加提供商时的自动检测功能）。
 * 
 * 后端也提供了 `/api/validate` (type: "detect-provider") 接口，
 * 但前端仍需此模块进行即时检测以提供更好的用户体验。
 */

interface DetectResult {
  templateId: string;
  confidence: "high" | "medium" | "low";
  suggestedName: string;
  baseUrl?: string;
}

// API Key 检测规则
const DETECTION_RULES: {
  pattern: RegExp;
  templateId: string;
  confidence: "high" | "medium" | "low";
  check?: (key: string) => boolean;
}[] = [
  // OpenAI: sk- 开头，48 位字符
  {
    pattern: /^sk-[a-zA-Z0-9]{48}$/,
    templateId: "openai",
    confidence: "high",
  },
  // OpenAI 项目 Key: sk-proj- 开头
  {
    pattern: /^sk-proj-[a-zA-Z0-9_-]+$/,
    templateId: "openai",
    confidence: "high",
  },
  // Moonshot: 包含 moonshot 字样
  {
    pattern: /moonshot/i,
    templateId: "moonshot",
    confidence: "high",
  },
  // Moonshot: sk- 开头，10 位字符（旧版）
  {
    pattern: /^sk-[a-zA-Z0-9]{10}$/,
    templateId: "moonshot",
    confidence: "medium",
  },
  // 火山引擎: UUID 格式
  {
    pattern: /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i,
    templateId: "volcengine",
    confidence: "high",
  },
  // 智谱: 旧版格式 00 + 32位十六进制 + . + 16位
  {
    pattern: /^00[a-f0-9]{32}\.[a-z0-9]{16}$/i,
    templateId: "zhipu",
    confidence: "high",
  },
  // 智谱: 新版格式 32位十六进制 + . + 20位
  {
    pattern: /^[a-f0-9]{32}\.[a-zA-Z0-9]{20}$/,
    templateId: "zhipu",
    confidence: "high",
  },
  // OpenRouter: sk-or- 开头
  {
    pattern: /^sk-or-/,
    templateId: "openrouter",
    confidence: "high",
  },
  // Seedance: 包含 seedance 或 atlas 字样
  {
    pattern: /seedance|atlas/i,
    templateId: "seedance",
    confidence: "high",
  },
  // 通义千问: sk- 开头，非 OpenAI/OpenRouter/Moonshot 格式，且不在其他规则中
  {
    pattern: /^sk-[a-zA-Z0-9]{32}$/,
    templateId: "qwen",
    confidence: "medium",
    check: (key) =>
      !key.startsWith("sk-or-") && !/^sk-[a-zA-Z0-9]{48}$/.test(key),
  },
];

// 模板名称映射
const TEMPLATE_NAMES: Record<string, string> = {
  openai: "OpenAI",
  moonshot: "Moonshot (Kimi)",
  volcengine: "火山引擎",
  zhipu: "智谱 AI",
  openrouter: "OpenRouter",
  seedance: "Seedance (Atlas)",
  pollinations: "Pollinations (免费)",
  ollama: "Ollama (本地)",
  qwen: "通义千问",
};

/**
 * 检测 API Key 对应的提供商
 */
export function detectProvider(apiKey: string): DetectResult | null {
  if (!apiKey || apiKey.length < 10) return null;

  // 检查占位符
  if (apiKey.includes("your_") || apiKey.includes("placeholder")) {
    return null;
  }

  for (const rule of DETECTION_RULES) {
    if (rule.pattern.test(apiKey)) {
      // 如果有额外检查，执行检查
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

  // 检查控制字符
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
