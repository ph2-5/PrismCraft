// AI: Use t() from this module for server-side user-facing error messages.
// This is the server-side counterpart of @/shared/constants/messages.ts.
// Keys here are server-specific (mainly API route errors) to avoid coupling
// the electron process to renderer-side message files.

const messages: Record<string, string> = {
  "error.pluginConfigMissing": "缺少插件配置",
  "error.pluginConfigInvalid": "插件配置无效: {errors}",
  "error.pluginIdConflict": '插件 ID "{id}" 与内置插件冲突',
  "error.pluginIdMissing": "缺少 pluginId",
  "error.cannotDeleteBuiltinPlugin": "不能删除内置插件",
};

export function t(key: string, params?: Record<string, string | number>): string {
  let text = messages[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(`{${k}}`, String(v));
    }
  }
  return text;
}
