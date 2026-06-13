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
