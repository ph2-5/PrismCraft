export interface ApiRequest {
  [key: string]: unknown;
}

export interface StructuredError {
  code: string;
  message: string;
}

export interface ApiResponse {
  success: boolean;
  ok?: boolean;
  data?: unknown;
  error?: string | StructuredError;
  httpStatus?: number;
}

export type RouteHandler = (
  method: string,
  body: ApiRequest,
  req: import("http").IncomingMessage,
) => Promise<ApiResponse | Record<string, unknown> | unknown>;
