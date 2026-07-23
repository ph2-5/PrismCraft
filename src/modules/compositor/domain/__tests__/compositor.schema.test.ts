/**
 * compositor.schema 测试
 *
 * 覆盖导出的 6 个 schema：
 * - composerLayerTypeSchema / composerLayerSchema
 * - compositorInputSchema / compositorResultSchema
 * - compositorPresetSchema / compositorStatusSchema
 */

import { describe, it, expect } from "vitest";
import {
  composerLayerTypeSchema,
  composerLayerSchema,
  compositorInputSchema,
  compositorResultSchema,
  compositorPresetSchema,
  compositorStatusSchema,
} from "../compositor.schema";

describe("composerLayerTypeSchema", () => {
  it("接受 character / scene / prop", () => {
    expect(composerLayerTypeSchema.parse("character")).toBe("character");
    expect(composerLayerTypeSchema.parse("scene")).toBe("scene");
    expect(composerLayerTypeSchema.parse("prop")).toBe("prop");
  });

  it("拒绝非法枚举值", () => {
    expect(() => composerLayerTypeSchema.parse("text")).toThrow();
    expect(() => composerLayerTypeSchema.parse("effect")).toThrow();
    expect(() => composerLayerTypeSchema.parse("")).toThrow();
  });

  it("拒绝非字符串类型", () => {
    expect(() => composerLayerTypeSchema.parse(123)).toThrow();
    expect(() => composerLayerTypeSchema.parse(null)).toThrow();
    expect(() => composerLayerTypeSchema.parse(undefined)).toThrow();
  });
});

describe("composerLayerSchema", () => {
  const validLayer = {
    layerId: "layer-1",
    id: "char-1",
    type: "character",
    name: "主角",
  };

  it("必填字段齐全时通过", () => {
    const result = composerLayerSchema.parse(validLayer);
    expect(result.layerId).toBe("layer-1");
    expect(result.id).toBe("char-1");
    expect(result.type).toBe("character");
    expect(result.name).toBe("主角");
  });

  it("emoji/x/y/scale/zIndex 使用默认值", () => {
    const result = composerLayerSchema.parse(validLayer);
    expect(result.emoji).toBe("🖼");
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
    expect(result.scale).toBe(1);
    expect(result.zIndex).toBe(1);
  });

  it("显式传入 emoji/x/y/scale/zIndex 时覆盖默认值", () => {
    const result = composerLayerSchema.parse({
      ...validLayer,
      emoji: "⚔️",
      x: 100,
      y: 200,
      scale: 1.5,
      zIndex: 5,
    });
    expect(result.emoji).toBe("⚔️");
    expect(result.x).toBe(100);
    expect(result.y).toBe(200);
    expect(result.scale).toBe(1.5);
    expect(result.zIndex).toBe(5);
  });

  it("layerId 缺失时拒绝", () => {
    expect(() =>
      composerLayerSchema.parse({ id: "char-1", type: "character", name: "主角" }),
    ).toThrow();
  });

  it("id 缺失时拒绝", () => {
    expect(() =>
      composerLayerSchema.parse({ layerId: "layer-1", type: "character", name: "主角" }),
    ).toThrow();
  });

  it("type 缺失时拒绝", () => {
    expect(() =>
      composerLayerSchema.parse({ layerId: "layer-1", id: "char-1", name: "主角" }),
    ).toThrow();
  });

  it("name 缺失时拒绝", () => {
    expect(() =>
      composerLayerSchema.parse({ layerId: "layer-1", id: "char-1", type: "character" }),
    ).toThrow();
  });

  it("type 为非法枚举值时拒绝", () => {
    expect(() =>
      composerLayerSchema.parse({ ...validLayer, type: "invalid" }),
    ).toThrow();
  });

  it("x/y/scale/zIndex 必须是数字", () => {
    expect(() =>
      composerLayerSchema.parse({ ...validLayer, x: "100" }),
    ).toThrow();
    expect(() =>
      composerLayerSchema.parse({ ...validLayer, scale: "large" }),
    ).toThrow();
  });
});

describe("compositorInputSchema", () => {
  it("characterId 必填时通过", () => {
    const result = compositorInputSchema.parse({ characterId: "c1" });
    expect(result.characterId).toBe("c1");
  });

  it("characterId 缺失时拒绝", () => {
    expect(() => compositorInputSchema.parse({})).toThrow();
    expect(() => compositorInputSchema.parse({ sceneId: "s1" })).toThrow();
  });

  it("characterId 为空字符串时拒绝（z.string() 不接受非字符串）", () => {
    expect(() => compositorInputSchema.parse({ characterId: 123 })).toThrow();
  });

  it("propIds/sceneId/extraPrompt/provider/modelId/resolution 全部可选", () => {
    const result = compositorInputSchema.parse({
      characterId: "c1",
      propIds: ["p1", "p2"],
      sceneId: "s1",
      extraPrompt: "额外的描述",
      provider: "openai",
      modelId: "dall-e-3",
      resolution: "1024x1024",
    });
    expect(result.propIds).toEqual(["p1", "p2"]);
    expect(result.sceneId).toBe("s1");
    expect(result.extraPrompt).toBe("额外的描述");
    expect(result.provider).toBe("openai");
    expect(result.modelId).toBe("dall-e-3");
    expect(result.resolution).toBe("1024x1024");
  });

  it("仅传 characterId 时其他字段为 undefined", () => {
    const result = compositorInputSchema.parse({ characterId: "c1" });
    expect(result.propIds).toBeUndefined();
    expect(result.sceneId).toBeUndefined();
    expect(result.extraPrompt).toBeUndefined();
    expect(result.provider).toBeUndefined();
    expect(result.modelId).toBeUndefined();
    expect(result.resolution).toBeUndefined();
  });

  it("characterVariantId 可选", () => {
    const result = compositorInputSchema.parse({
      characterId: "c1",
      characterVariantId: "v1",
    });
    expect(result.characterVariantId).toBe("v1");
  });

  it("propIds 必须是字符串数组", () => {
    expect(() =>
      compositorInputSchema.parse({ characterId: "c1", propIds: "p1" }),
    ).toThrow();
    expect(() =>
      compositorInputSchema.parse({ characterId: "c1", propIds: [1, 2] }),
    ).toThrow();
  });
});

describe("compositorResultSchema", () => {
  const validResult = {
    id: "result-1",
    characterId: "c1",
    imageUrl: "/img.png",
    prompt: "a character portrait",
    createdAt: "2026-01-01T00:00:00Z",
  };

  it("正向：必填字段齐全时通过", () => {
    const result = compositorResultSchema.parse(validResult);
    expect(result.id).toBe("result-1");
    expect(result.characterId).toBe("c1");
    expect(result.imageUrl).toBe("/img.png");
    expect(result.prompt).toBe("a character portrait");
    expect(result.createdAt).toBe("2026-01-01T00:00:00Z");
  });

  it("正向：propIds 缺失时使用默认空数组", () => {
    const result = compositorResultSchema.parse(validResult);
    expect(result.propIds).toEqual([]);
  });

  it("正向：sceneId/characterVariantId 可选", () => {
    const result = compositorResultSchema.parse({
      ...validResult,
      sceneId: "s1",
      characterVariantId: "v1",
      propIds: ["p1"],
    });
    expect(result.sceneId).toBe("s1");
    expect(result.characterVariantId).toBe("v1");
    expect(result.propIds).toEqual(["p1"]);
  });

  it("反向：id 缺失时拒绝", () => {
    expect(() => {
      const { id, ...rest } = validResult;
      compositorResultSchema.parse(rest);
    }).toThrow();
  });

  it("反向：characterId 缺失时拒绝", () => {
    expect(() => {
      const { characterId, ...rest } = validResult;
      compositorResultSchema.parse(rest);
    }).toThrow();
  });

  it("反向：imageUrl 缺失时拒绝", () => {
    expect(() => {
      const { imageUrl, ...rest } = validResult;
      compositorResultSchema.parse(rest);
    }).toThrow();
  });

  it("反向：prompt 缺失时拒绝", () => {
    expect(() => {
      const { prompt, ...rest } = validResult;
      compositorResultSchema.parse(rest);
    }).toThrow();
  });

  it("反向：createdAt 缺失时拒绝", () => {
    expect(() => {
      const { createdAt, ...rest } = validResult;
      compositorResultSchema.parse(rest);
    }).toThrow();
  });
});

describe("compositorPresetSchema", () => {
  const validPreset = {
    id: "preset-1",
    name: "常用组合",
    characterId: "c1",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
  };

  it("正向：必填字段齐全时通过", () => {
    const result = compositorPresetSchema.parse(validPreset);
    expect(result.id).toBe("preset-1");
    expect(result.name).toBe("常用组合");
    expect(result.characterId).toBe("c1");
    expect(result.createdAt).toBe("2026-01-01T00:00:00Z");
    expect(result.updatedAt).toBe("2026-01-02T00:00:00Z");
  });

  it("正向：propIds 缺失时使用默认空数组", () => {
    const result = compositorPresetSchema.parse(validPreset);
    expect(result.propIds).toEqual([]);
  });

  it("正向：sceneId/extraPrompt 可选", () => {
    const result = compositorPresetSchema.parse({
      ...validPreset,
      sceneId: "s1",
      extraPrompt: "补充",
      propIds: ["p1"],
    });
    expect(result.sceneId).toBe("s1");
    expect(result.extraPrompt).toBe("补充");
    expect(result.propIds).toEqual(["p1"]);
  });

  it("反向：id 缺失时拒绝", () => {
    expect(() => {
      const { id, ...rest } = validPreset;
      compositorPresetSchema.parse(rest);
    }).toThrow();
  });

  it("反向：name 缺失时拒绝", () => {
    expect(() => {
      const { name, ...rest } = validPreset;
      compositorPresetSchema.parse(rest);
    }).toThrow();
  });

  it("反向：characterId 缺失时拒绝", () => {
    expect(() => {
      const { characterId, ...rest } = validPreset;
      compositorPresetSchema.parse(rest);
    }).toThrow();
  });

  it("反向：createdAt 缺失时拒绝", () => {
    expect(() => {
      const { createdAt, ...rest } = validPreset;
      compositorPresetSchema.parse(rest);
    }).toThrow();
  });

  it("反向：updatedAt 缺失时拒绝", () => {
    expect(() => {
      const { updatedAt, ...rest } = validPreset;
      compositorPresetSchema.parse(rest);
    }).toThrow();
  });
});

describe("compositorStatusSchema", () => {
  const validStatuses = [
    "idle",
    "building-prompt",
    "generating",
    "saving",
    "success",
    "error",
  ];

  it("接受所有合法状态", () => {
    for (const status of validStatuses) {
      expect(compositorStatusSchema.parse(status)).toBe(status);
    }
  });

  it("拒绝非法状态值", () => {
    expect(() => compositorStatusSchema.parse("pending")).toThrow();
    expect(() => compositorStatusSchema.parse("completed")).toThrow();
    expect(() => compositorStatusSchema.parse("")).toThrow();
    expect(() => compositorStatusSchema.parse("IDLE")).toThrow();
  });

  it("拒绝非字符串类型", () => {
    expect(() => compositorStatusSchema.parse(123)).toThrow();
    expect(() => compositorStatusSchema.parse(null)).toThrow();
    expect(() => compositorStatusSchema.parse(undefined)).toThrow();
  });
});
