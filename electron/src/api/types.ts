import type { ZodType } from "zod";

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

export type RouteHandler<T extends ApiRequest = ApiRequest> = (
  method: string,
  body: T,
  req: import("http").IncomingMessage,
) => Promise<ApiResponse | Record<string, unknown> | unknown>;

export interface Route {
  handler: RouteHandler;
  schema?: ZodType;
  methods: string[];
}

export function defineRoute<T extends ApiRequest>(
  route: { handler: RouteHandler<T>; schema: ZodType<T>; methods: string[] },
): Route;
export function defineRoute(
  route: { handler: RouteHandler; methods: string[] },
): Route;
export function defineRoute(route: { handler: RouteHandler; schema?: ZodType; methods: string[] }): Route {
  return route;
}
