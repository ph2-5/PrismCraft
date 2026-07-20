/**
 * 工具插件安全校验（P3 工具插件化）
 *
 * 从 tool-plugin-loader.ts 拆分而来，目的：
 * - 降低主文件行数（原 849 行 > max-lines 500）
 * - 隔离 SSRF 防护逻辑，便于后续扩展（如新增 IP 黑名单）
 *
 * 包含：
 * - PRIVATE_IP_PATTERNS: 内网 IP 模式列表
 * - validateUrl: 校验 URL 安全性（协议、localhost、内网 IP）
 */

// ============= 常量 =============

/** 内网 IP 模式（防 SSRF） */
const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^0\.0\.0\.0/,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
];

// ============= 安全校验 =============

/**
 * 校验 URL 安全性（防 SSRF）
 *
 * 规则：
 * - 必须 http/https 协议
 * - 禁止 localhost
 * - 禁止内网 IP（私有地址段）
 *
 * @returns ok=true 通过，ok=false 时 error 为错误信息
 */
export function validateUrl(url: string): { ok: boolean; error?: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: `无效 URL: ${url}` };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: `仅支持 http/https 协议，当前: ${parsed.protocol}` };
  }
  const host = parsed.hostname;
  if (host === "localhost") {
    return { ok: false, error: `禁止访问 localhost` };
  }
  if (PRIVATE_IP_PATTERNS.some((p) => p.test(host))) {
    return { ok: false, error: `禁止访问内网地址: ${host}` };
  }
  return { ok: true };
}
