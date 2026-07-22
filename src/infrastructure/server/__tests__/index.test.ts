import { describe, it, expect, vi } from "vitest";

vi.mock("@/shared/constants", () => ({
  t: vi.fn((key: string) => key),
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: {
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    fatal: vi.fn(),
  },
  extractErrorMessage: vi.fn((e: unknown) => (e instanceof Error ? e.message : String(e))),
}));

import {
  safeParseJson,
  sanitizeErrorMessage,
  maskApiKey,
  validateRequiredFields,
  isUrlAllowed,
  ApiError,
} from "../index";
import {
  safeParseJson as directSafeParseJson,
  sanitizeErrorMessage as directSanitizeErrorMessage,
  maskApiKey as directMaskApiKey,
  validateRequiredFields as directValidateRequiredFields,
  isUrlAllowed as directIsUrlAllowed,
  ApiError as directApiError,
} from "../api-utils";

describe("infrastructure/server/index", () => {
  it("导出所有 api-utils 公开 API", () => {
    expect(safeParseJson).toBeDefined();
    expect(sanitizeErrorMessage).toBeDefined();
    expect(maskApiKey).toBeDefined();
    expect(validateRequiredFields).toBeDefined();
    expect(isUrlAllowed).toBeDefined();
    expect(ApiError).toBeDefined();
  });

  it("导出的函数与直接导入的是同一引用", () => {
    expect(safeParseJson).toBe(directSafeParseJson);
    expect(sanitizeErrorMessage).toBe(directSanitizeErrorMessage);
    expect(maskApiKey).toBe(directMaskApiKey);
    expect(validateRequiredFields).toBe(directValidateRequiredFields);
    expect(isUrlAllowed).toBe(directIsUrlAllowed);
    expect(ApiError).toBe(directApiError);
  });
});
