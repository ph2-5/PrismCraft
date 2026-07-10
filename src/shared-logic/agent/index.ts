/**
 * Agent 共享逻辑（零外部依赖，可供渲染进程和主进程共用）
 */
export {
  estimateTokens,
  estimateContentTokens,
  estimateMessagesTokens,
  estimateSystemPromptTokens,
  TOKEN_OVERHEAD_PER_MESSAGE,
  TOKEN_OVERHEAD_PER_TOOL_CALL,
  TOKEN_OVERHEAD_PER_TOOL_RESULT,
  TOKEN_OVERHEAD_SYSTEM,
} from "./token-estimator";
