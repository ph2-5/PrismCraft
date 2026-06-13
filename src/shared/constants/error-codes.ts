export const API_ERROR_CODES = {
  API_NOT_CONFIGURED: "api_not_configured",
  EMPTY_PROMPT: "empty_prompt",
  UNKNOWN_PROVIDER: "unknown_provider",
  MISSING_TASK_ID: "missing_task_id",
  INVALID_TASK_ID: "invalid_task_id",
  NETWORK_ERROR: "network_error",
  PROVIDER_ERROR: "provider_error",
  TIMEOUT_ERROR: "timeout_error",
  PLUGIN_ERROR: "plugin_error",
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

const API_ERROR_I18N_KEYS: Record<ApiErrorCode, string> = {
  [API_ERROR_CODES.API_NOT_CONFIGURED]: "error.apiNotConfigured",
  [API_ERROR_CODES.EMPTY_PROMPT]: "error.emptyPrompt",
  [API_ERROR_CODES.UNKNOWN_PROVIDER]: "error.unknownProvider",
  [API_ERROR_CODES.MISSING_TASK_ID]: "error.missingTaskId",
  [API_ERROR_CODES.INVALID_TASK_ID]: "error.invalidTaskId",
  [API_ERROR_CODES.NETWORK_ERROR]: "error.networkError",
  [API_ERROR_CODES.PROVIDER_ERROR]: "error.providerError",
  [API_ERROR_CODES.TIMEOUT_ERROR]: "error.timeoutError",
  [API_ERROR_CODES.PLUGIN_ERROR]: "error.pluginError",
};

export function getApiErrorI18nKey(code: string): string | undefined {
  return API_ERROR_I18N_KEYS[code as ApiErrorCode];
}
