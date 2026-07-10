/**
 * LLM 消息与对话补全类型（domain 层）
 *
 * 设计目标：
 * - 定义与 OpenAI Chat Completions 兼容的消息结构，供 renderer 和 electron main 共享
 * - 为 Provider 接口升级（generateChat 接收 messages 数组）提供类型基础
 * - 支持原生 function calling（tool_calls / tool_call_id 结构化字段）
 * - 为未来多模态消息（ContentBlock[]）预留扩展点
 *
 * 依赖约束：domain 层零外部依赖，仅依赖 zod（类型构建）和本目录其他 schema。
 */

/**
 * OpenAI 消息格式（发送给 LLM / 从 LLM 返回）
 *
 * - system: 系统指令（仅 content）
 * - user: 用户消息（仅 content）
 * - assistant: 助手回复（content + 可选 tool_calls）
 * - tool: 工具执行结果（content + tool_call_id + name）
 */
export interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** assistant 消息携带的工具调用请求（模型生成） */
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  /** tool 消息关联的 tool_call_id（回灌工具执行结果时必填） */
  tool_call_id?: string;
  /** tool 消息的工具名称（用于日志展示） */
  name?: string;
}

/**
 * 工具定义（OpenAI function-calling 格式）
 *
 * 供 Agent Loop 在推理时声明可调用的工具。
 * 与 electron/src/plugins/types.ts 的 TextStreamToolDef 结构一致，
 * 独立定义以保持 domain 层零外部依赖。
 */
export interface ToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * 工具调用请求（模型生成）
 *
 * arguments 是 JSON 字符串，需在执行前 parse。
 */
export interface ToolCall {
  id: string;
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * 流式生成的单个 chunk
 *
 * - delta: 本次新增的文本片段
 * - toolCalls: 模型请求调用的工具（仅在 finishReason === "tool_calls" 时有值）
 * - finishReason: 结束原因（stop=正常结束 / tool_calls=请求工具 / length=达到 maxTokens）
 */
export interface StreamChunk {
  delta: string;
  toolCalls?: ToolCall[];
  finishReason?: "stop" | "tool_calls" | "length";
}

/**
 * 对话补全请求（Chat Completion Request）
 *
 * 统一的 LLM 请求结构，支持原生 function calling。
 * 当 provider 支持 function calling 时，messages 和 tools 以结构化形式传递；
 * 不支持时，由调用方降级为 prompt 工程模式。
 */
export interface ChatCompletionRequest {
  messages: LLMMessage[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  tools?: ToolDef[];
  /** true 时启用 SSE 流式返回 */
  stream?: boolean;
}

/**
 * 对话补全响应（Chat Completion Response）
 *
 * 非流式调用返回完整的 assistant 消息；
 * 流式调用通过 onChunk 回调增量返回，最终返回累积的 assistant 消息。
 */
export interface ChatCompletionResponse {
  messages: LLMMessage[];
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

/**
 * Provider 能力维度
 *
 * 用于在运行时探测 provider 支持的功能，驱动能力自适应：
 * - functionCalling: 是否支持原生 OpenAI function calling（messages + tools 结构化传递）
 * - streaming: 是否支持 SSE 流式返回
 *
 * 未来可扩展：vision、audio、structuredOutput、jsonMode 等
 */
export interface ProviderCapability {
  /** 是否支持原生 function calling（messages 数组 + tools 结构化传递） */
  functionCalling: boolean;
  /** 是否支持流式返回（SSE） */
  streaming: boolean;
}
