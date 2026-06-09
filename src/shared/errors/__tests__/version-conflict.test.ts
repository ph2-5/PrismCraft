import { describe, it, expect } from "vitest";
import { VersionConflictError } from "../version-conflict";

describe("VersionConflictError", () => {
  const table = "stories";
  const id = "abc-123";
  const expectedVersion = 5;

  it("构造函数正确设置 table、id、expectedVersion", () => {
    const error = new VersionConflictError(table, id, expectedVersion);

    expect(error.table).toBe(table);
    expect(error.id).toBe(id);
    expect(error.expectedVersion).toBe(expectedVersion);
  });

  it("error.name 为 VersionConflictError", () => {
    const error = new VersionConflictError(table, id, expectedVersion);

    expect(error.name).toBe("VersionConflictError");
  });

  it("error.message 包含表名、id 和期望版本号", () => {
    const error = new VersionConflictError(table, id, expectedVersion);

    expect(error.message).toContain(table);
    expect(error.message).toContain(id);
    expect(error.message).toContain(`v${expectedVersion}`);
  });

  it("是 Error 的实例", () => {
    const error = new VersionConflictError(table, id, expectedVersion);

    expect(error).toBeInstanceOf(Error);
  });

  it("是 VersionConflictError 的实例", () => {
    const error = new VersionConflictError(table, id, expectedVersion);

    expect(error).toBeInstanceOf(VersionConflictError);
  });

  it("属性存在且可读", () => {
    const error = new VersionConflictError(table, id, expectedVersion);

    expect(error).toHaveProperty("table", table);
    expect(error).toHaveProperty("id", id);
    expect(error).toHaveProperty("expectedVersion", expectedVersion);
  });
});
