export interface ApiRequest {
  [key: string]: unknown;
}

export interface ApiResponse {
  success: boolean;
  data?: unknown;
  error?: string;
  httpStatus?: number;
}

export type RouteHandler = (
  method: string,
  body: ApiRequest,
  req: import("http").IncomingMessage,
) => Promise<ApiResponse | Record<string, unknown> | unknown>;
