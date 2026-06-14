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
  ok?: boolean;
  data?: T;
  error?: string | StructuredError;
  httpStatus?: number;
}

export type RouteHandler<T extends ApiRequest = ApiRequest> = (
  method: string,
  body: T,
  req: import("http").IncomingMessage,
) => Promise<ApiResponse | Record<string, unknown> | unknown>;

export interface Route<T extends ApiRequest = ApiRequest> {
  handler(method: string, body: T, req: import("http").IncomingMessage): Promise<ApiResponse | Record<string, unknown> | unknown>;
  schema?: ZodType<T>;
  methods: string[];
}

export function defineRoute<T extends ApiRequest>(
  route: { handler: RouteHandler<T>; schema: ZodType<T>; methods: string[] },
): Route<T>;
export function defineRoute(
  route: { handler: RouteHandler; methods: string[] },
): Route;
export function defineRoute(route: { handler: RouteHandler; schema?: ZodType; methods: string[] }): Route {
  return route as Route;
}
