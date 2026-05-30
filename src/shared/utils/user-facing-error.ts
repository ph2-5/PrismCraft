import { classifyError } from "@/domain/types";
import { extractErrorMessage } from "@/shared/error-logger";
import { t } from "@/shared/constants";

const IPC_RATE_LIMIT_PATTERN = /Rate limit exceeded for channel: (db:\w+)/;
const IPC_CHANNEL_MESSAGE_KEYS: Record<string, string> = {
  "db:query": "error.dbQueryRateLimit",
  "db:run": "error.dbRunRateLimit",
  "db:transaction": "error.dbTransactionRateLimit",
};

const CATEGORY_MESSAGE_KEYS: Record<string, string> = {
  timeout: "error.timeout",
  rate_limit: "error.rateLimit",
  quota: "error.quotaExceeded",
  invalid_params: "error.invalidParams",
  network: "error.networkError",
  server_error: "error.serverError",
  database_busy: "error.databaseBusy",
  auth: "error.authFailed",
  unknown: "error.operationFailed",
};

const EXTRA_PATTERNS: Array<{ pattern: RegExp; messageKey: string }> = [
  { pattern: /IPC|进程通信/, messageKey: "error.ipcError" },
  { pattern: /disk I\/O error/i, messageKey: "error.diskError" },
  { pattern: /malformed|corrupt/i, messageKey: "error.diskError" },
  { pattern: /ENOSPC|no space left/i, messageKey: "error.diskFull" },
  { pattern: /PERMISSION|EACCES/i, messageKey: "error.permissionDenied" },
];

export function mapUserFacingError(error: unknown): string {
  const raw = extractErrorMessage(error);

  const ipcMatch = raw.match(IPC_RATE_LIMIT_PATTERN);
  if (ipcMatch) {
    const key = IPC_CHANNEL_MESSAGE_KEYS[ipcMatch[1]] ?? "error.rateLimit";
    return t(key);
  }

  for (const { pattern, messageKey } of EXTRA_PATTERNS) {
    if (pattern.test(raw)) return t(messageKey);
  }

  const category = classifyError(undefined, raw);
  const key = CATEGORY_MESSAGE_KEYS[category] ?? "error.operationFailed";
  return t(key);
}
