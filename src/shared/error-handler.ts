import { AppError, GenerationError, RateLimitError, ApiError, type GenerationType } from "@/domain/types/result";
import { classifyNetworkError } from "@/shared/utils/error-classifier";

export type ErrorCode =
  | "DATABASE_ERROR"
  | "VALIDATION_ERROR"
  | "API_ERROR"
  | "NOT_FOUND"
  | "NETWORK_ERROR"
  | "STORAGE_ERROR"
  | "CONFIGURATION_ERROR"
  | "GENERATION_ERROR"
  | "TIMEOUT_ERROR"
  | "RATE_LIMIT_ERROR"
  | "AUTHENTICATION_ERROR"
  | "UNKNOWN_ERROR";

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export interface ApiClientLikeError {
  statusCode?: number;
  code?: string;
  message: string;
}

export function createAppError(code: ErrorCode, message: string, cause?: unknown): AppError {
  return new AppError(code, message, cause);
}

export function createGenerationError(message: string, generationType: GenerationType, cause?: unknown): GenerationError {
  return new GenerationError(message, generationType, cause);
}

export function createRateLimitError(message: string, retryAfter?: number, cause?: unknown): RateLimitError {
  return new RateLimitError(message, retryAfter, cause);
}

export function createApiError(message: string, statusCode?: number, code?: string, cause?: unknown): ApiError {
  return new ApiError(message, statusCode, code, cause);
}

export function handleError(error: unknown): AppError {
  if (isAppError(error)) {
    return error;
  }

  if (error instanceof Error) {
    const code = (error as unknown as { code?: string }).code;
    const category = classifyNetworkError(code, error.message);
    if (category === "timeout") return createAppError("TIMEOUT_ERROR", error.message, error);
    if (category === "network") return createAppError("NETWORK_ERROR", error.message, error);
    const msg = error.message.toLowerCase();
    if (msg.includes("storage") || msg.includes("indexeddb") || msg.includes("quota")) {
      return createAppError("STORAGE_ERROR", error.message, error);
    }
    if (msg.includes("auth") || msg.includes("unauthorized") || msg.includes("forbidden") || msg.includes("token")) {
      return createAppError("AUTHENTICATION_ERROR", error.message, error);
    }
    return createAppError("UNKNOWN_ERROR", error.message, error);
  }

  if (typeof error === "string") {
    return createAppError("UNKNOWN_ERROR", error);
  }

  return createAppError("UNKNOWN_ERROR", String(error));
}

export function handleApiClientError(error: unknown): AppError {
  const apiError = error as ApiClientLikeError;
  if (apiError?.statusCode === 401) {
    return createAppError("AUTHENTICATION_ERROR", apiError.message, error);
  }
  if (apiError?.statusCode === 429) {
    return createAppError("RATE_LIMIT_ERROR", apiError.message, error);
  }
  if (apiError?.statusCode !== undefined && apiError.statusCode >= 500) {
    return createAppError("NETWORK_ERROR", apiError.message, error);
  }
  return createApiError(apiError.message, apiError.statusCode, apiError.code, error);
}

export function getErrorMessage(error: unknown): string {
  if (isAppError(error)) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
