import type { ZodType } from "zod";

export interface ApiRequest {
  [key: string]: unknown;
}

export interface StructuredError {
  code: string;
  message: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string | StructuredError;
  httpStatus?: number;
}

export type RouteHandler<T extends ApiRequest = ApiRequest> = (
  method: string,
  body: T,
  req: import("http").IncomingMessage,
  stream?: StreamSink,
) => Promise<ApiResponse | Record<string, unknown> | unknown>;

/**
 * 流式路由的 sink（Task 1.0）。
 * handler 通过 sendChunk 发送业务 chunk，server.ts 负责序列化为 SSE 格式并写入响应。
 * 仅在 Route.stream === true 时由 server.ts 传入。
 */
export interface StreamSink {
  /**
   * 发送一个业务 chunk 到客户端。
   * server.ts 会包装为 `data: {"_t":"chunk","chunk":...}\n\n` 格式写入响应流。
   */
  sendChunk(data: unknown): void;
}

export interface Route<T extends ApiRequest = ApiRequest> {
  handler(method: string, body: T, req: import("http").IncomingMessage, stream?: StreamSink): Promise<ApiResponse | Record<string, unknown> | unknown>;
  schema?: ZodType<T>;
  methods: string[];
  /**
   * 流式路由标记（Task 1.0）。
   * true 时 server.ts 会设置 SSE 响应头（Content-Type: text/event-stream），
   * 创建 StreamSink 传入 handler，并在 handler 返回后发送 done/error 事件。
   */
  stream?: boolean;
}

export function defineRoute<T extends ApiRequest>(
  route: { handler: RouteHandler<T>; schema: ZodType<T>; methods: string[]; stream?: boolean },
): Route<T>;
export function defineRoute(
  route: { handler: RouteHandler; methods: string[]; stream?: boolean },
): Route;
export function defineRoute(route: { handler: RouteHandler; schema?: ZodType; methods: string[]; stream?: boolean }): Route {
  // Cause E: defineRoute uses TypeScript overload pattern; the implementation signature accepts
  // a permissive shape and the `as Route` assertion bridges to the public Route<T> return type.
  // Removing it would require duplicating the overload's type logic in the implementation,
  // which is the standard TypeScript overload pattern and not a true type-safety hole.
  return route as Route;
}
