import { classifyError } from "@/domain/types";
import { extractErrorMessage } from "@/shared/error-logger";

const CATEGORY_USER_MESSAGES: Record<string, string> = {
  timeout: "操作超时，请稍后重试",
  rate_limit: "操作过于频繁，请稍后重试",
  quota: "API 额度不足，请检查账户余额",
  invalid_params: "请求参数有误，请检查输入",
  network: "网络连接异常，请检查网络后重试",
  server_error: "服务器暂时不可用，请稍后重试",
  database_busy: "数据库繁忙，请稍后重试",
  auth: "认证失败，请检查 API 密钥设置",
  unknown: "操作失败，请稍后重试",
};

const IPC_RATE_LIMIT_PATTERN = /Rate limit exceeded for channel: (db:\w+)/;
const IPC_CHANNEL_MESSAGES: Record<string, string> = {
  "db:query": "数据库查询过于频繁，请稍后重试",
  "db:run": "数据库写入过于频繁，请稍后重试",
  "db:transaction": "数据库事务过于频繁，请稍后重试",
};

const EXTRA_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /IPC|进程通信/, message: "进程通信异常，请重启应用" },
  { pattern: /disk I\/O error/i, message: "磁盘读写错误，请检查磁盘空间" },
  { pattern: /malformed|corrupt/i, message: "数据库文件异常，请联系技术支持" },
  { pattern: /ENOSPC|no space left/i, message: "磁盘空间不足，请清理后重试" },
  { pattern: /PERMISSION|EACCES/i, message: "权限不足，请检查文件访问权限" },
];

export function mapUserFacingError(error: unknown): string {
  const raw = extractErrorMessage(error);

  const ipcMatch = raw.match(IPC_RATE_LIMIT_PATTERN);
  if (ipcMatch) {
    return IPC_CHANNEL_MESSAGES[ipcMatch[1]] ?? CATEGORY_USER_MESSAGES.rate_limit;
  }

  for (const { pattern, message } of EXTRA_PATTERNS) {
    if (pattern.test(raw)) return message;
  }

  const category = classifyError(undefined, raw);
  return CATEGORY_USER_MESSAGES[category] ?? CATEGORY_USER_MESSAGES.unknown;
}
