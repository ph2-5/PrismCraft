/**
 * 工具插件配置校验（P3 工具插件化）
 *
 * 从 tool-plugin-loader.ts 拆分而来，目的：
 * - 降低主文件行数（原 849 行 > max-lines 500）
 * - 通过提取子函数降低 validateConfig 的 complexity（原 24 > 20）
 *
 * 包含：
 * - validateConfig: 校验插件配置（运行时类型检查）
 *   - validatePluginMeta: 校验插件元信息（id/version/displayName）
 *   - validateToolEntry: 校验单个工具条目
 *   - validateActionField: 校验 action.type 字段
 */

// ============= 允许的 action 类型 =============

const ALLOWED_ACTION_TYPES = ["http-call", "builtin-mirror", "text-template"];

// ============= 子校验函数 =============

/**
 * 校验插件元信息（id/version/displayName）
 *
 * - id 必须为小写字母+数字+连字符
 * - version 必须为非空字符串
 * - displayName 必须为非空字符串
 */
function validatePluginMeta(c: Record<string, unknown>, errors: string[]): void {
  if (typeof c.id !== "string" || !/^[a-z0-9-]+$/.test(c.id)) {
    errors.push("id 必须为小写字母+数字+连字符");
  }
  if (typeof c.version !== "string" || !c.version) {
    errors.push("version 必须为非空字符串");
  }
  if (typeof c.displayName !== "string" || !c.displayName) {
    errors.push("displayName 必须为非空字符串");
  }
}

/**
 * 校验 action 字段（必须为对象且 type 合法）
 */
function validateActionField(
  action: unknown,
  prefix: string,
  errors: string[],
): void {
  const a = action as Record<string, unknown>;
  if (!ALLOWED_ACTION_TYPES.includes(a.type as string)) {
    errors.push(`${prefix}.action.type 必须为 http-call / builtin-mirror / text-template`);
  }
}

/**
 * 校验单个工具条目（name/description/domain/parameters/action）
 *
 * @param t 工具对象
 * @param index 工具在 tools 数组中的下标
 * @param errors 错误信息收集列表
 */
function validateToolEntry(
  t: Record<string, unknown>,
  index: number,
  errors: string[],
): void {
  const prefix = `tools[${index}]`;
  if (!t || typeof t !== "object") {
    errors.push(`${prefix} 必须为对象`);
    return;
  }
  if (typeof t.name !== "string" || !/^[a-z_][a-z0-9_]*$/.test(t.name)) {
    errors.push(`${prefix}.name 必须为合法标识符（小写字母/数字/下划线，不能以数字开头）`);
  }
  if (typeof t.description !== "string" || !t.description) {
    errors.push(`${prefix}.description 必须为非空字符串`);
  }
  if (typeof t.domain !== "string") {
    errors.push(`${prefix}.domain 必须为字符串`);
  }
  if (!t.parameters || typeof t.parameters !== "object") {
    errors.push(`${prefix}.parameters 必须为对象（JSON Schema）`);
  }
  if (!t.action || typeof t.action !== "object") {
    errors.push(`${prefix}.action 必须为对象`);
  } else {
    validateActionField(t.action, prefix, errors);
  }
}

// ============= 主校验函数 =============

/**
 * 校验插件配置（运行时类型检查）
 *
 * 不使用 Zod（避免引入依赖），手工校验关键字段。
 * 校验失败时返回错误信息列表。
 */
export function validateConfig(config: unknown): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!config || typeof config !== "object") {
    return { ok: false, errors: ["配置必须为对象"] };
  }
  const c = config as Record<string, unknown>;

  // 校验元信息
  validatePluginMeta(c, errors);

  // 校验 tools 数组
  if (!Array.isArray(c.tools) || c.tools.length === 0) {
    errors.push("tools 必须为非空数组");
    return { ok: false, errors };
  }

  // 逐个校验工具
  for (let i = 0; i < c.tools.length; i++) {
    validateToolEntry(c.tools[i] as Record<string, unknown>, i, errors);
  }

  return { ok: errors.length === 0, errors };
}
