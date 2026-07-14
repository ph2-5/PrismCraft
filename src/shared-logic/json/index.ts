/**
 * JSON 提取与安全解析工具
 *
 * 从 LLM 输出文本中提取 JSON 片段（支持 markdown 代码块包裹）并安全解析。
 * 统一替代各模块中重复的 `text.match(/\{[\s\S]*\}/)` + `JSON.parse` + try/catch 模式。
 */

/**
 * 从文本中提取第一个 JSON 对象片段（`{...}`）。
 * 不要求是合法 JSON，仅做正则匹配；调用方需自行 JSON.parse。
 * 返回 null 表示未匹配。
 */
export function extractJsonObject(text: string): string | null {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : null;
}

/**
 * 从文本中提取第一个 JSON 数组片段（`[...]`）。
 * 返回 null 表示未匹配。
 */
export function extractJsonArray(text: string): string | null {
  const match = text.match(/\[[\s\S]*\]/);
  return match ? match[0] : null;
}

/**
 * 安全解析 JSON 字符串，失败时返回 null（不抛异常）。
 */
export function safeParseJson<T = unknown>(jsonStr: string): T | null {
  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    return null;
  }
}

/**
 * 从文本中提取并解析 JSON 对象。
 * 依次尝试：直接匹配 → 去除 markdown 代码块后匹配 → 首尾大括号截取。
 * 返回 null 表示无法提取或解析失败。
 */
export function extractAndParseJsonObject<T = unknown>(text: string): T | null {
  const direct = extractJsonObject(text);
  if (direct) {
    const parsed = safeParseJson<T>(direct);
    if (parsed !== null) return parsed;
  }
  // 尝试去除 markdown 代码块
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch && codeBlockMatch[1]) {
    const inner = extractJsonObject(codeBlockMatch[1]);
    if (inner) {
      const parsed = safeParseJson<T>(inner);
      if (parsed !== null) return parsed;
    }
  }
  // 尝试首尾大括号截取
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) {
    return safeParseJson<T>(text.slice(start, end + 1));
  }
  return null;
}

/**
 * 从文本中提取并解析 JSON 数组。
 * 依次尝试：直接匹配 → 去除 markdown 代码块后匹配 → 首尾中括号截取。
 * 返回 null 表示无法提取或解析失败。
 */
export function extractAndParseJsonArray<T = unknown>(text: string): T[] | null {
  const direct = extractJsonArray(text);
  if (direct) {
    const parsed = safeParseJson<T[]>(direct);
    if (parsed !== null && Array.isArray(parsed)) return parsed;
  }
  // 尝试去除 markdown 代码块
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch && codeBlockMatch[1]) {
    const inner = extractJsonArray(codeBlockMatch[1]);
    if (inner) {
      const parsed = safeParseJson<T[]>(inner);
      if (parsed !== null && Array.isArray(parsed)) return parsed;
    }
  }
  // 尝试首尾中括号截取
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start !== -1 && end > start) {
    const parsed = safeParseJson<T[]>(text.slice(start, end + 1));
    if (parsed !== null && Array.isArray(parsed)) return parsed;
  }
  return null;
}
