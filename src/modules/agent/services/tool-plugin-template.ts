/**
 * 工具插件模板替换与路径提取（P3 工具插件化）
 *
 * 从 tool-plugin-loader.ts 拆分而来，目的：
 * - 降低主文件行数（原 849 行 > max-lines 500）
 * - 提取纯函数，便于单独测试
 *
 * 包含：
 * - renderTemplate: 将 {{arg}} 替换为 args 中对应的值
 * - renderObject: 递归渲染对象中的所有字符串模板
 * - extractPath: 从对象中按点分路径提取值
 */

// ============= 模板替换 =============

/**
 * 将 {{arg}} 替换为 args 中对应的值
 *
 * 未找到的 arg 替换为空字符串。值会被 String() 转换。
 */
export function renderTemplate(tpl: string, args: Record<string, unknown>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const val = args[key];
    if (val === undefined || val === null) return "";
    return String(val);
  });
}

/**
 * 递归渲染对象中的所有字符串模板
 *
 * 遍历对象/数组的所有字符串字段，应用 renderTemplate。
 * 非字符串值原样返回。
 */
export function renderObject(obj: unknown, args: Record<string, unknown>): unknown {
  if (typeof obj === "string") return renderTemplate(obj, args);
  if (Array.isArray(obj)) return obj.map((v) => renderObject(v, args));
  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = renderObject(v, args);
    }
    return result;
  }
  return obj;
}

// ============= 路径提取 =============

/**
 * 从对象中按点分路径提取值
 *
 * 例如 extractPath({ data: { results: [1,2] } }, "data.results") → [1, 2]
 * 路径不存在时返回 undefined。
 */
export function extractPath(data: unknown, path: string): unknown {
  if (!path) return data;
  const parts = path.split(".");
  let current: unknown = data;
  for (const part of parts) {
    if (current && typeof current === "object" && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}
