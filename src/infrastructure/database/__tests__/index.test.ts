import { describe, it, expect } from "vitest";
import { mediaAssetRepository as reExportedRepo } from "../index";
import { mediaAssetRepository as directRepo } from "../media-asset-repository";

describe("infrastructure/database/index", () => {
  it("导出 mediaAssetRepository 实例", () => {
    expect(reExportedRepo).toBeDefined();
  });

  it("从 index 导出的 repository 与直接导入的是同一引用", () => {
    expect(reExportedRepo).toBe(directRepo);
  });

  it("repository 暴露所有 CRUD 方法", () => {
    expect(typeof reExportedRepo.findAll).toBe("function");
    expect(typeof reExportedRepo.findById).toBe("function");
    expect(typeof reExportedRepo.create).toBe("function");
    expect(typeof reExportedRepo.update).toBe("function");
    expect(typeof reExportedRepo.delete).toBe("function");
  });
});
