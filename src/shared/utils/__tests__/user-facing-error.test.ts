import { describe, it, expect } from "vitest";
import { mapUserFacingError } from "../user-facing-error";

describe("mapUserFacingError", () => {
  it("maps IPC rate limit for db:query", () => {
    expect(mapUserFacingError(new Error("Rate limit exceeded for channel: db:query (3000/3000 in 60s)")))
      .toBe("数据库查询过于频繁，请稍后重试");
  });

  it("maps IPC rate limit for db:run", () => {
    expect(mapUserFacingError(new Error("Rate limit exceeded for channel: db:run (600/600 in 60s)")))
      .toBe("数据库写入过于频繁，请稍后重试");
  });

  it("maps IPC rate limit for db:transaction", () => {
    expect(mapUserFacingError(new Error("Rate limit exceeded for channel: db:transaction (600/600 in 60s)")))
      .toBe("数据库事务过于频繁，请稍后重试");
  });

  it("maps general rate limit errors", () => {
    expect(mapUserFacingError(new Error("429 Too Many Requests")))
      .toBe("操作过于频繁，请稍后重试");
  });

  it("maps timeout errors", () => {
    expect(mapUserFacingError(new Error("ETIMEDOUT connection timed out")))
      .toBe("操作超时，请稍后重试");
  });

  it("maps network errors", () => {
    expect(mapUserFacingError(new Error("Failed to fetch")))
      .toBe("网络连接异常，请检查网络后重试");
  });

  it("maps auth errors", () => {
    expect(mapUserFacingError(new Error("401 Unauthorized")))
      .toBe("认证失败，请检查 API 密钥设置");
  });

  it("maps database busy errors", () => {
    expect(mapUserFacingError(new Error("SQLITE_BUSY: database is locked")))
      .toBe("数据库繁忙，请稍后重试");
  });

  it("maps disk I/O errors", () => {
    expect(mapUserFacingError(new Error("disk I/O error")))
      .toBe("磁盘读写错误，请检查磁盘空间");
  });

  it("maps IPC errors", () => {
    expect(mapUserFacingError(new Error("IPC通信失败")))
      .toBe("进程通信异常，请重启应用");
  });

  it("maps quota errors", () => {
    expect(mapUserFacingError(new Error("Insufficient quota")))
      .toBe("API 额度不足，请检查账户余额");
  });

  it("maps unknown errors to generic message", () => {
    expect(mapUserFacingError(new Error("Something unexpected")))
      .toBe("操作失败，请稍后重试");
  });

  it("handles string errors", () => {
    expect(mapUserFacingError("Rate limit exceeded"))
      .toBe("操作过于频繁，请稍后重试");
  });

  it("handles null/undefined errors", () => {
    expect(mapUserFacingError(null))
      .toBe("操作失败，请稍后重试");
    expect(mapUserFacingError(undefined))
      .toBe("操作失败，请稍后重试");
  });

  it("maps IPC rate limit for unknown channel to generic rate limit", () => {
    expect(mapUserFacingError(new Error("Rate limit exceeded for channel: db:unknown (100/100 in 60s)")))
      .toBe("操作过于频繁，请稍后重试");
  });

  it("maps malformed/corrupt errors to disk error", () => {
    expect(mapUserFacingError(new Error("database is malformed")))
      .toBe("磁盘读写错误，请检查磁盘空间");
  });

  it("maps corrupt errors to disk error", () => {
    expect(mapUserFacingError(new Error("corrupt database file")))
      .toBe("磁盘读写错误，请检查磁盘空间");
  });

  it("maps ENOSPC errors to disk full", () => {
    expect(mapUserFacingError(new Error("ENOSPC: no space left on device")))
      .toBe("磁盘空间不足，请清理后重试");
  });

  it("maps no space left errors to disk full", () => {
    expect(mapUserFacingError(new Error("no space left on device")))
      .toBe("磁盘空间不足，请清理后重试");
  });

  it("maps PERMISSION errors to permission denied", () => {
    expect(mapUserFacingError(new Error("PERMISSION denied")))
      .toBe("权限不足，请检查文件访问权限");
  });

  it("maps EACCES errors to permission denied", () => {
    expect(mapUserFacingError(new Error("EACCES: permission denied")))
      .toBe("权限不足，请检查文件访问权限");
  });

  it("maps server_error category", () => {
    expect(mapUserFacingError(new Error("internal error occurred")))
      .toBe("服务器暂时不可用，请稍后重试");
  });

  it("maps invalid_params category", () => {
    expect(mapUserFacingError(new Error("invalid parameter value")))
      .toBe("请求参数有误，请检查输入");
  });
});
