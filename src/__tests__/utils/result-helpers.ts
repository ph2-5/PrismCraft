import { expect } from "vitest";
import type { AppError } from "@/domain/types/result";

type Result<T, E = AppError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function expectOk<T>(result: Result<T>): asserts result is { ok: true; value: T } {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(`Expected ok=true, got error: ${JSON.stringify(result.error)}`);
  }
}

export function expectErr<E>(result: Result<unknown, E>): asserts result is { ok: false; error: E } {
  expect(result.ok).toBe(false);
  if (result.ok) {
    throw new Error(`Expected ok=false, got value: ${JSON.stringify(result.value)}`);
  }
}

export function expectOkValue<T>(result: Result<T>, expected: T): void {
  expectOk(result);
  expect(result.value).toEqual(expected);
}

export function expectErrContains(result: Result<unknown, AppError>, substring: string): void {
  expectErr(result);
  expect(result.error.message).toContain(substring);
}
