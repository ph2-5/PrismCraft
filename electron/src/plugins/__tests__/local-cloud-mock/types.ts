/**
 * Local Cloud Mock Server - Type Definitions
 *
 * 本地 Mock 云端服务器类型定义，用于真实验证 provider 序列化/反序列化 + HTTP 通信链路。
 * 不依赖真实大模型，只验证"发送/接收"完整性。
 */

/**
 * Mock 服务器收到的请求记录，供测试断言使用。
 */
export interface ReceivedRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
  timestamp: number;
}

/**
 * 测试场景上下文 —— 期望 provider 发送给云端的内容。
 */
export interface ExpectedSendContext {
  prompt: string;
  duration: number;
  firstFrame?: string;
  lastFrame?: string;
  characterRefs?: string[];
  sceneRef?: string;
  referenceVideoUrl?: string;
}

/**
 * Provider Profile —— 定义单个 provider 的云端响应格式和请求校验规则。
 *
 * 每个 profile 模拟一个真实云端的 API 行为：
 * - 如何匹配 generate / status 请求路径
 * - 如何校验收到的请求 body 字段完整性
 * - 如何构造 generate / status 响应（按官方文档格式）
 */
export interface ProviderProfile {
  /** Provider id，与 plugin.id 对应 */
  id: string;
  /** 显示名称 */
  name: string;
  /** 测试用的 model id */
  testModel: string;
  /** 测试用的 apiKey */
  testApiKey: string;

  /**
   * 判断请求 path 是否匹配此 provider 的 generate endpoint。
   * Mock 服务器用此方法路由请求。
   */
  matchGeneratePath: (path: string, method: string) => boolean;

  /**
   * 判断请求 path 是否匹配此 provider 的 status endpoint。
   */
  matchStatusPath: (path: string, method: string) => boolean;

  /**
   * 从 status 请求 path 中提取 taskId。
   */
  extractTaskIdFromStatusPath: (path: string) => string | undefined;

  /**
   * 校验 generate 请求 body 的字段完整性。
   * @returns 错误消息数组，空数组表示校验通过。
   */
  validateGenerateBody: (
    body: Record<string, unknown>,
    expected: ExpectedSendContext,
  ) => string[];

  /**
   * 构造 generate 响应（包含 taskId）。
   * 按各 provider 官方文档的真实响应格式构造。
   */
  buildGenerateResponse: (taskId: string) => Record<string, unknown>;

  /**
   * 构造 status 响应。
   * @param state 任务状态
   * @param videoUrl 视频下载 URL（仅 completed 状态使用）
   * @param progress 进度百分比（0-100）
   */
  buildStatusResponse: (
    taskId: string,
    state: "pending" | "running" | "completed" | "failed",
    videoUrl?: string,
    progress?: number,
  ) => Record<string, unknown>;
}

/**
 * Mock 服务器的错误注入配置。
 */
export interface MockErrorConfig {
  status: number;
  body: unknown;
}
