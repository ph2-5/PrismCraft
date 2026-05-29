import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/domain/types", () => ({
  classifyError: vi.fn(),
}));

import { classifyError } from "@/domain/types";
const mockClassifyError = vi.mocked(classifyError);

import { mapUserFacingError } from "../user-facing-error";

describe("R44: User-Facing Error Messages Must Use mapUserFacingError", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("must map IPC rate limit errors to user-friendly Chinese", () => {
    const result = mapUserFacingError(
      new Error("Rate limit exceeded for channel: db:query (3000/3000 in 60s)"),
    );
    expect(result).toBe("数据库查询过于频繁，请稍后重试");
    expect(result).not.toContain("Rate limit");
    expect(result).not.toContain("db:query");
  });

  it("must map IPC db:run rate limit to user-friendly Chinese", () => {
    const result = mapUserFacingError(
      new Error("Rate limit exceeded for channel: db:run (600/600 in 60s)"),
    );
    expect(result).toBe("数据库写入过于频繁，请稍后重试");
  });

  it("must map IPC db:transaction rate limit to user-friendly Chinese", () => {
    const result = mapUserFacingError(
      new Error("Rate limit exceeded for channel: db:transaction (600/600 in 60s)"),
    );
    expect(result).toBe("数据库事务过于频繁，请稍后重试");
  });

  it("must never expose raw error codes to users", () => {
    mockClassifyError.mockReturnValue("timeout");
    const result = mapUserFacingError(new Error("ETIMEDOUT ECONNREFUSED"));
    expect(result).not.toContain("ETIMEDOUT");
    expect(result).not.toContain("ECONNREFUSED");
    expect(result).not.toContain("Error");
  });

  it("must map timeout errors via classifyError", () => {
    mockClassifyError.mockReturnValue("timeout");
    const result = mapUserFacingError(new Error("request timeout"));
    expect(result).toBe("操作超时，请稍后重试");
  });

  it("must map rate_limit errors via classifyError", () => {
    mockClassifyError.mockReturnValue("rate_limit");
    const result = mapUserFacingError(new Error("429 Too Many Requests"));
    expect(result).toBe("操作过于频繁，请稍后重试");
  });

  it("must map auth errors via classifyError", () => {
    mockClassifyError.mockReturnValue("auth");
    const result = mapUserFacingError(new Error("401 Unauthorized"));
    expect(result).toBe("认证失败，请检查 API 密钥设置");
  });

  it("must map database_busy errors via classifyError", () => {
    mockClassifyError.mockReturnValue("database_busy");
    const result = mapUserFacingError(new Error("database is locked"));
    expect(result).toBe("数据库繁忙，请稍后重试");
  });

  it("must map unknown errors to generic message without technical details", () => {
    mockClassifyError.mockReturnValue("unknown");
    const result = mapUserFacingError(new Error("SomeInternalError(code=0xDEAD)"));
    expect(result).toBe("操作失败，请稍后重试");
    expect(result).not.toContain("0xDEAD");
    expect(result).not.toContain("Internal");
  });

  it("must map disk I/O errors to actionable Chinese message", () => {
    const result = mapUserFacingError(new Error("disk I/O error"));
    expect(result).toBe("磁盘读写错误，请检查磁盘空间");
  });

  it("must return Chinese message for all error categories", () => {
    const categories = ["timeout", "rate_limit", "quota", "invalid_params", "network", "server_error", "database_busy", "auth", "unknown"];
    for (const cat of categories) {
      mockClassifyError.mockReturnValue(cat as never);
      const result = mapUserFacingError(new Error("test"));
      expect(result).toMatch(/[\u4e00-\u9fff]/);
    }
  });
});
