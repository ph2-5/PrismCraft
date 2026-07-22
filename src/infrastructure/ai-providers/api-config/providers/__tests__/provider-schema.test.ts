import { describe, it, expect } from "vitest";
import {
  ProviderJsonSchema,
  validateProviderJson,
} from "../provider-schema";
import runwayJson from "../runway.json";

// 批量加载所有 provider JSON（eager: true 同步加载）
// 排除 standalone-model-capabilities.json (数组结构) 和 custom.json (用户自定义模板)
const providerModules = import.meta.glob("../*.json", {
  eager: true,
  import: "default",
}) as Record<string, unknown>;

const SKIP_FILES = new Set([
  "standalone-model-capabilities.json",
  "custom.json",
]);

type ProviderJson = {
  id: string;
  name: string;
  models: Array<{ id: string; verifiedAt?: string; deprecated?: boolean }>;
};

const allProviders = Object.entries(providerModules)
  .filter(([path]) => {
    const filename = path.split("/").pop()!;
    return !SKIP_FILES.has(filename);
  })
  .map(([path, data]) => ({ path, data: data as ProviderJson }));

describe("ProviderJsonSchema - 模型保鲜元数据", () => {
  it("应接受 verifiedAt 字段（ISO 日期字符串）", () => {
    const provider = {
      id: "test-provider",
      name: "Test",
      format: "openai",
      baseUrl: "https://example.com/v1",
      models: [
        {
          id: "model-1",
          name: "Model 1",
          capabilities: ["video"],
          verifiedAt: "2026-07-22",
        },
      ],
    };

    const result = ProviderJsonSchema.safeParse(provider);
    expect(result.success).toBe(true);
  });

  it("应接受 deprecated 和 deprecatedReason 字段", () => {
    const provider = {
      id: "test-provider",
      name: "Test",
      format: "openai",
      baseUrl: "https://example.com/v1",
      models: [
        {
          id: "old-model",
          name: "Old Model",
          capabilities: ["video"],
          deprecated: true,
          deprecatedReason: "已被 gen4 替代，2026-07-30 sunset",
          verifiedAt: "2025-03-15",
        },
      ],
    };

    const result = ProviderJsonSchema.safeParse(provider);
    expect(result.success).toBe(true);
  });

  it("应允许 verifiedAt 缺省（向后兼容）", () => {
    const provider = {
      id: "test-provider",
      name: "Test",
      format: "openai",
      baseUrl: "https://example.com/v1",
      models: [
        {
          id: "model-1",
          name: "Model 1",
          capabilities: ["video"],
        },
      ],
    };

    const result = ProviderJsonSchema.safeParse(provider);
    expect(result.success).toBe(true);
  });
});

describe("runway.json - 模型清单完整性", () => {
  it("应包含 gen4_turbo 模型（当前主力）", () => {
    const modelIds = runwayJson.models.map((m) => m.id);
    expect(modelIds).toContain("gen4_turbo");
  });

  it("gen3a_turbo 应标记为 deprecated", () => {
    const gen3aTurbo = runwayJson.models.find((m) => m.id === "gen3a_turbo");
    expect(gen3aTurbo).toBeDefined();
    expect((gen3aTurbo as { deprecated?: boolean }).deprecated).toBe(true);
  });

  it("所有模型应有 verifiedAt 字段", () => {
    for (const model of runwayJson.models) {
      expect(
        (model as { verifiedAt?: string }).verifiedAt,
        `模型 ${model.id} 缺少 verifiedAt`,
      ).toBeDefined();
    }
  });

  it("应通过 schema 校验", () => {
    const result = validateProviderJson(runwayJson);
    expect(result.success).toBe(true);
  });
});

describe("所有 provider JSON - 批量保鲜元数据契约", () => {
  it("应加载到至少 20 个 provider JSON", () => {
    expect(allProviders.length).toBeGreaterThanOrEqual(20);
  });

  for (const { path, data } of allProviders) {
    describe(`${path}`, () => {
      it("所有模型应有 verifiedAt 字段", () => {
        for (const model of data.models) {
          expect(
            model.verifiedAt,
            `${path} 的模型 ${model.id} 缺少 verifiedAt`,
          ).toBeDefined();
        }
      });

      it("应通过 schema 校验", () => {
        const result = validateProviderJson(data);
        expect(result.success, `${path} schema 校验失败`).toBe(true);
      });
    });
  }
});
