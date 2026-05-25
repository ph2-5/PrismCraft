export type Result<T, E = AppError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }

  toString(): string {
    return `[${this.code}] ${this.message}`;
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, cause?: unknown) {
    super("DATABASE_ERROR", message, cause);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, cause?: unknown) {
    super("VALIDATION_ERROR", message, cause);
  }
}

export class ApiError extends AppError {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly apiCode?: string,
    cause?: unknown,
  ) {
    super("API_ERROR", message, cause);
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string, id: string) {
    super("NOT_FOUND", `${entity} with id "${id}" not found`);
  }
}

export class NetworkError extends AppError {
  constructor(message: string, cause?: unknown) {
    super("NETWORK_ERROR", message, cause);
  }
}

export class StorageError extends AppError {
  constructor(message: string, cause?: unknown) {
    super("STORAGE_ERROR", message, cause);
  }
}

export class ConfigurationError extends AppError {
  constructor(message: string, cause?: unknown) {
    super("CONFIGURATION_ERROR", message, cause);
  }
}

export type GenerationType = "keyframe" | "framePair" | "video" | "image" | "text";

export class GenerationError extends AppError {
  constructor(
    message: string,
    public readonly generationType: GenerationType,
    cause?: unknown,
  ) {
    super("GENERATION_ERROR", message, cause);
  }
}

export class TimeoutError extends AppError {
  constructor(message: string, cause?: unknown) {
    super("TIMEOUT_ERROR", message, cause);
  }
}

export class RateLimitError extends AppError {
  constructor(
    message: string,
    public readonly retryAfter?: number,
    cause?: unknown,
  ) {
    super("RATE_LIMIT_ERROR", message, cause);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string, cause?: unknown) {
    super("AUTHENTICATION_ERROR", message, cause);
  }
}

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E extends AppError>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function fromThrowable<T>(fn: () => T): Result<T, AppError> {
  try {
    return ok(fn());
  } catch (e) {
    if (e instanceof AppError) return err(e);
    return err(new AppError("UNKNOWN_ERROR", e instanceof Error ? e.message : String(e), e));
  }
}

export async function fromAsyncThrowable<T>(fn: () => Promise<T>): Promise<Result<T, AppError>> {
  try {
    return ok(await fn());
  } catch (e) {
    if (e instanceof AppError) return err(e);
    return err(new AppError("UNKNOWN_ERROR", e instanceof Error ? e.message : String(e), e));
  }
}
