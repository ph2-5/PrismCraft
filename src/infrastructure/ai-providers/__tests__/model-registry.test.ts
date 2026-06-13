import { describe, it, expect, vi } from "vitest";

const { mockError } = vi.hoisted(() => ({ mockError: vi.fn() }));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: { warn: vi.fn(), error: mockError },
}));

import {
  MODEL_REGISTRY,
  BUILTIN_MODEL_CAPABILITIES,
  PROVIDER_TEMPLATES,
  BUILTIN_DETECTION_RULES,
  getProviderDefinition,
  getAllModels,
  getModelEntry,
  sanitizeModelCapabilities,
} from "../model-registry";

describe("model-registry", () => {
  describe("getProviderDefinition", () => {
    it("应返回已知 provider 的定义", () => {
      const volcengine = getProviderDefinition("volcengine");
      expect(volcengine).toBeDefined();
      expect(volcengine!.name).toBeTruthy();
      expect(volcengine!.format).toBeTruthy();
      expect(volcengine!.baseUrl).toBeTruthy();
      expect(volcengine!.models.length).toBeGreaterThan(0);
    });

    it("应返回所有已知 provider", () => {
      const knownIds = ["volcengine", "kuaishou", "zhipu", "google", "minimax", "openai", "anthropic", "deepseek", "qwen", "ollama"];
      for (const id of knownIds) {
        const def = getProviderDefinition(id);
        expect(def).toBeDefined();
        expect(def!.name).toBeTruthy();
      }
    });

    it("应对未知 ID 返回 undefined", () => {
      expect(getProviderDefinition("nonexistent-provider")).toBeUndefined();
      expect(getProviderDefinition("")).toBeUndefined();
    });
  });

  describe("getAllModels", () => {
    it("应返回所有 provider 的所有模型", () => {
      const allModels = getAllModels();
      expect(allModels.length).toBeGreaterThan(0);

      for (const entry of allModels) {
        expect(entry.providerId).toBeTruthy();
        expect(entry.model.id).toBeTruthy();
        expect(entry.model.name).toBeTruthy();
        expect(entry.model.capabilities).toBeInstanceOf(Array);
      }
    });

    it("模型 ID 在同一 provider 内应唯一", () => {
      const allModels = getAllModels();
      const byProvider = new Map<string, Set<string>>();
      for (const entry of allModels) {
        if (!byProvider.has(entry.providerId)) {
          byProvider.set(entry.providerId, new Set());
        }
        const ids = byProvider.get(entry.providerId)!;
        expect(ids.has(entry.model.id)).toBe(false);
        ids.add(entry.model.id);
      }
    });
  });

  describe("getModelEntry", () => {
    it("应通过模型 ID 跨 provider 查找模型", () => {
      const allModels = getAllModels();
      if (allModels.length > 0) {
        const firstModel = allModels[0]!;
        const found = getModelEntry(firstModel.model.id);
        expect(found).toBeDefined();
        expect(found!.model.id).toBe(firstModel.model.id);
        expect(found!.providerId).toBe(firstModel.providerId);
      }
    });

    it("应对不存在的模型 ID 返回 undefined", () => {
      expect(getModelEntry("nonexistent-model-xyz")).toBeUndefined();
    });
  });

  describe("BUILTIN_MODEL_CAPABILITIES", () => {
    it("应从 registry 正确构建", () => {
      expect(Object.keys(BUILTIN_MODEL_CAPABILITIES).length).toBeGreaterThan(0);
    });

    it("每个能力条目应有必需字段", () => {
      for (const caps of Object.values(BUILTIN_MODEL_CAPABILITIES)) {
        expect(caps.maxReferences).toBeTypeOf("number");
        expect(caps.maxResolution).toBeTypeOf("number");
        expect(caps.maxSizeMB).toBeTypeOf("number");
        expect(typeof caps.supportsLastFrame).toBe("boolean");
        expect(["separate", "merged"]).toContain(caps.referenceMode);
      }
    });

    it("数值字段应为正数", () => {
      for (const caps of Object.values(BUILTIN_MODEL_CAPABILITIES)) {
        expect(caps.maxReferences).toBeGreaterThan(0);
        expect(caps.maxResolution).toBeGreaterThan(0);
        expect(caps.maxSizeMB).toBeGreaterThan(0);
      }
    });
  });

  describe("PROVIDER_TEMPLATES", () => {
    it("应从 registry 正确构建", () => {
      expect(Object.keys(PROVIDER_TEMPLATES).length).toBeGreaterThan(0);
    });

    it("不应包含已废弃的 provider", () => {
      for (const [id, provider] of Object.entries(MODEL_REGISTRY)) {
        if (provider.deprecated) {
          expect(PROVIDER_TEMPLATES[id]).toBeUndefined();
        }
      }
    });

    it("每个模板应有 name、format、baseUrl、models", () => {
      for (const template of Object.values(PROVIDER_TEMPLATES)) {
        expect(template.name).toBeTruthy();
        expect(template.format).toBeTruthy();
        expect(template.baseUrl).toBeTruthy();
        expect(template.models.length).toBeGreaterThan(0);
      }
    });
  });

  describe("BUILTIN_DETECTION_RULES", () => {
    it("应从 registry 正确构建", () => {
      expect(BUILTIN_DETECTION_RULES.length).toBeGreaterThan(0);
    });

    it("每条规则应有 pattern、templateId、confidence", () => {
      for (const rule of BUILTIN_DETECTION_RULES) {
        expect(rule.pattern).toBeInstanceOf(RegExp);
        expect(rule.templateId).toBeTruthy();
        expect(["high", "medium", "low"]).toContain(rule.confidence);
      }
    });
  });

  describe("国际化模型", () => {
    it("pika 应存在于 registry", () => {
      const pika = getProviderDefinition("pika");
      expect(pika).toBeDefined();
      expect(pika!.models.length).toBeGreaterThan(0);
    });

    it("luma 应存在于 registry", () => {
      const luma = getProviderDefinition("luma");
      expect(luma).toBeDefined();
      expect(luma!.models.length).toBeGreaterThan(0);
    });

    it("runway 应存在于 registry", () => {
      const runway = getProviderDefinition("runway");
      expect(runway).toBeDefined();
      expect(runway!.models.length).toBeGreaterThan(0);
    });

    it("pika 模型应在 getAllModels 中", () => {
      const allModels = getAllModels();
      const pikaModels = allModels.filter((m) => m.providerId === "pika");
      expect(pikaModels.length).toBeGreaterThan(0);
    });

    it("luma 模型应在 getAllModels 中", () => {
      const allModels = getAllModels();
      const lumaModels = allModels.filter((m) => m.providerId === "luma");
      expect(lumaModels.length).toBeGreaterThan(0);
    });

    it("runway 模型应在 getAllModels 中", () => {
      const allModels = getAllModels();
      const runwayModels = allModels.filter((m) => m.providerId === "runway");
      expect(runwayModels.length).toBeGreaterThan(0);
    });
  });

  describe("sanitizeModelCapabilities", () => {
    it("应为缺失字段填充默认值", () => {
      const result = sanitizeModelCapabilities({});
      expect(result.maxReferences).toBe(4);
      expect(result.maxResolution).toBe(2048);
      expect(result.maxSizeMB).toBe(10);
      expect(result.supportsLastFrame).toBe(false);
      expect(result.referenceMode).toBe("separate");
    });

    it("应保留有效字段", () => {
      const result = sanitizeModelCapabilities({
        maxReferences: 8,
        maxResolution: 4096,
        maxSizeMB: 20,
        supportsLastFrame: true,
        referenceMode: "merged",
        supportsCharacterRef: true,
        supportsSceneRef: false,
        nativeCharacterRef: true,
        nativeSceneRef: false,
        characterRefMode: "native_field",
        sceneRefMode: "none",
        imageUploadMode: "url",
        maxCharacterRefs: 2,
        promptLanguage: "en",
        providerId: "test",
        urlTtl: 7200,
      });

      expect(result.maxReferences).toBe(8);
      expect(result.maxResolution).toBe(4096);
      expect(result.maxSizeMB).toBe(20);
      expect(result.supportsLastFrame).toBe(true);
      expect(result.referenceMode).toBe("merged");
      expect(result.supportsCharacterRef).toBe(true);
      expect(result.supportsSceneRef).toBe(false);
      expect(result.nativeCharacterRef).toBe(true);
      expect(result.nativeSceneRef).toBe(false);
      expect(result.characterRefMode).toBe("native_field");
      expect(result.sceneRefMode).toBe("none");
      expect(result.imageUploadMode).toBe("url");
      expect(result.maxCharacterRefs).toBe(2);
      expect(result.promptLanguage).toBe("en");
      expect(result.providerId).toBe("test");
      expect(result.urlTtl).toBe(7200);
    });

    it("应将无效 referenceMode 回退为 separate", () => {
      const result = sanitizeModelCapabilities({
        referenceMode: "invalid",
      });
      expect(result.referenceMode).toBe("separate");
    });

    it("应处理部分字段缺失", () => {
      const result = sanitizeModelCapabilities({
        maxReferences: 2,
        supportsCharacterRef: true,
      });
      expect(result.maxReferences).toBe(2);
      expect(result.maxResolution).toBe(2048);
      expect(result.supportsCharacterRef).toBe(true);
      expect(result.supportsSceneRef).toBeUndefined();
    });
  });
});
