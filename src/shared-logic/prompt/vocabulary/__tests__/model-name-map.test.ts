/**
 * 模型 ID 防混淆表测试（Task 4.7 v5.3 增强）
 */

import { describe, it, expect } from "vitest";
import {
  lookupModelId,
  normalizeModelId,
  getModelStandardName,
  listModelEntries,
  listModelsByFamily,
  areSameModel,
} from "../model-name-map";

describe("model-name-map", () => {
  describe("lookupModelId", () => {
    it("精确 ID 匹配", () => {
      const entry = lookupModelId("doubao-seedance-2-0-260128");
      expect(entry).not.toBeNull();
      expect(entry!.family).toBe("seedance");
      expect(entry!.version).toBe("2.0");
    });

    it("alias 匹配", () => {
      const entry = lookupModelId("seedance-2.0");
      expect(entry).not.toBeNull();
      expect(entry!.id).toBe("doubao-seedance-2-0-260128");
    });

    it("alias 匹配（大小写不敏感）", () => {
      const entry = lookupModelId("SEEDANCE PRO");
      expect(entry).not.toBeNull();
      expect(entry!.id).toBe("doubao-seedance-2-0-260128");
    });

    it("前缀模糊匹配（自定义后缀）", () => {
      const entry = lookupModelId("seedance-2.0-custom-suffix");
      expect(entry).not.toBeNull();
      expect(entry!.id).toBe("doubao-seedance-2-0-260128");
    });

    it("Kling 族模型匹配", () => {
      const entry = lookupModelId("kling-v2-master");
      expect(entry).not.toBeNull();
      expect(entry!.family).toBe("kling");
    });

    it("Kling alias 匹配", () => {
      const entry = lookupModelId("kling master");
      expect(entry).not.toBeNull();
      expect(entry!.id).toBe("kling-v2-master");
    });

    it("未识别的模型 ID 返回 null", () => {
      expect(lookupModelId("totally-unknown-model-xyz")).toBeNull();
    });

    it("能力差异标注正确", () => {
      const fast = lookupModelId("doubao-seedance-2-0-fast-260128");
      const standard = lookupModelId("doubao-seedance-2-0-260128");
      expect(fast!.capabilities.supportsCharacterRef).toBe(false);
      expect(standard!.capabilities.supportsCharacterRef).toBe(true);
    });
  });

  describe("normalizeModelId", () => {
    it("将 alias 转换为正式 ID", () => {
      expect(normalizeModelId("seedance-2.0")).toBe("doubao-seedance-2-0-260128");
      expect(normalizeModelId("kling-2")).toBe("kling-v2-master");
    });

    it("未识别的 ID 原样返回", () => {
      expect(normalizeModelId("unknown-model")).toBe("unknown-model");
    });
  });

  describe("getModelStandardName", () => {
    it("返回人类可读名称", () => {
      expect(getModelStandardName("doubao-seedance-2-0-260128")).toBe("Seedance 2.0 标准");
      expect(getModelStandardName("seedance-2.0-fast")).toBe("Seedance 2.0 快速");
    });

    it("未识别的 ID 返回原 ID", () => {
      expect(getModelStandardName("unknown-model")).toBe("unknown-model");
    });
  });

  describe("listModelEntries", () => {
    it("返回所有已注册条目", () => {
      const entries = listModelEntries();
      expect(entries.length).toBeGreaterThanOrEqual(5);
    });

    it("每个条目含完整字段", () => {
      const entries = listModelEntries();
      const first = entries[0]!;
      expect(first).toHaveProperty("id");
      expect(first).toHaveProperty("standardName");
      expect(first).toHaveProperty("family");
      expect(first).toHaveProperty("version");
      expect(first).toHaveProperty("capabilities");
    });
  });

  describe("listModelsByFamily", () => {
    it("按族筛选返回正确条目", () => {
      const seedanceModels = listModelsByFamily("seedance");
      expect(seedanceModels.length).toBe(2);
      expect(seedanceModels.every((m) => m.family === "seedance")).toBe(true);
    });

    it("Kling 族有 2 个条目", () => {
      const klingModels = listModelsByFamily("kling");
      expect(klingModels.length).toBe(2);
    });

    it("未注册的族返回空数组", () => {
      expect(listModelsByFamily("unknown-family")).toHaveLength(0);
    });
  });

  describe("areSameModel", () => {
    it("同一模型的 alias 和正式 ID 视为相同", () => {
      expect(areSameModel("seedance-2.0", "doubao-seedance-2-0-260128")).toBe(true);
      expect(areSameModel("kling-2", "kling-v2-master")).toBe(true);
    });

    it("不同模型视为不同", () => {
      expect(areSameModel("seedance-2.0", "kling-v2-master")).toBe(false);
    });

    it("同一模型族的快速版和标准版视为不同", () => {
      expect(
        areSameModel(
          "doubao-seedance-2-0-260128",
          "doubao-seedance-2-0-fast-260128",
        ),
      ).toBe(false);
    });

    it("未识别的模型返回 false", () => {
      expect(areSameModel("unknown-a", "unknown-b")).toBe(false);
    });
  });
});
