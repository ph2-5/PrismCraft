import { classifyError } from "@/domain/types";
import { extractErrorMessage } from "@/shared/error-logger";
import { t } from "@/shared/constants";
import { getApiErrorI18nKey } from "@/shared/constants/error-codes";
import { VersionConflictError } from "@/shared/errors/version-conflict";

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
  version_conflict: "error.versionConflict",
  unknown: "error.operationFailed",
};

const EXTRA_PATTERNS: Array<{ pattern: RegExp; messageKey: string }> = [
  { pattern: /IPC|进程通信/, messageKey: "error.ipcError" },
  { pattern: /disk I\/O error/i, messageKey: "error.diskError" },
  { pattern: /malformed|corrupt/i, messageKey: "error.diskError" },
  { pattern: /ENOSPC|no space left/i, messageKey: "error.diskFull" },
  { pattern: /PERMISSION|EACCES/i, messageKey: "error.permissionDenied" },
  { pattern: /并发冲突|版本不匹配|VersionConflict/i, messageKey: "error.versionConflict" },
  { pattern: /BEAT_NOT_FOUND/, messageKey: "error.beatNotFound" },
  { pattern: /KEYFRAME_REQUIRED_FOR_FRAME_PAIR/, messageKey: "error.framePairRequiresKeyframe" },
  { pattern: /FRAME_PAIR_REQUIRED_FOR_VIDEO/, messageKey: "error.videoRequiresFramePair" },
  { pattern: /BEAT_REQUIRES_CHARACTER_OR_SCENE/, messageKey: "error.beatRequiresBinding" },
  { pattern: /KEYFRAME_REQUIRED/, messageKey: "error.framePairRequiresKeyframe" },
  { pattern: /FRAME_PAIR_REQUIRED/, messageKey: "error.videoRequiresFramePair" },
];

export function mapUserFacingError(error: unknown): string {
  if (error instanceof VersionConflictError) {
    return t("error.versionConflict");
  }

  if (typeof error === "object" && error !== null) {
    const code = (error as Record<string, unknown>).code;
    if (typeof code === "string") {
      const i18nKey = getApiErrorI18nKey(code);
      if (i18nKey) {
        const params: Record<string, string | number> = {};
        const message = (error as Record<string, unknown>).message;
        if (typeof message === "string" && code === "api_not_configured") {
          const typeMap: Record<string, string> = {
            text: "文本",
            video: "视频",
            image: "图片",
            vision: "视觉",
          };
          params.type = typeMap[message] || message;
        }
        return t(i18nKey, params);
      }
    }
  }

  const raw = extractErrorMessage(error);

  const ipcMatch = raw.match(IPC_RATE_LIMIT_PATTERN);
  if (ipcMatch) {
    const key = IPC_CHANNEL_MESSAGE_KEYS[ipcMatch[1]!] ?? "error.rateLimit";
    return t(key);
  }

  for (const { pattern, messageKey } of EXTRA_PATTERNS) {
    if (pattern.test(raw)) return t(messageKey);
  }

  const category = classifyError(undefined, raw);
  const key = CATEGORY_MESSAGE_KEYS[category] ?? "error.operationFailed";
  return t(key);
}
