import { describe, it, expect } from "vitest";
import {
  sceneSchema,
  sceneCameraSchema,
  sceneElementSchema,
  sceneElementTypeSchema,
  createSceneInputSchema,
  updateSceneInputSchema,
} from "@/domain/schemas/scene";
import { factories } from "@/__tests__/mocks/factories";

describe("sceneSchema", () => {
  it("应解析有效的场景数据", () => {
    const valid = factories.scene();
    const result = sceneSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("应拒绝缺少必填字段 name 的数据", () => {
    const { name: _, ...noName } = factories.scene();
    const result = sceneSchema.safeParse(noName);
    expect(result.success).toBe(false);
    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      expect(fieldErrors.name).toBeDefined();
    }
  });

  it("应拒绝空字符串 name", () => {
    const data = factories.scene({ name: "" });
    const result = sceneSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("应拒绝非法 videoGenerationStatus 枚举值", () => {
    const data = factories.scene({ videoGenerationStatus: "invalid" as unknown as "pending" });
    const result = sceneSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("应接受合法 videoGenerationStatus 枚举值", () => {
    for (const status of ["pending", "generating", "completed", "failed"] as const) {
      const data = factories.scene({ videoGenerationStatus: status });
      const result = sceneSchema.safeParse(data);
      expect(result.success).toBe(true);
    }
  });

  it("应接受可选 camera 字段", () => {
    const data = factories.scene({
      camera: { angle: "low", movement: "pan", zoom: 1.5 },
    });
    const result = sceneSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("应拒绝负数 useCount", () => {
    const data = factories.scene({ useCount: -1 });
    const result = sceneSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

describe("sceneCameraSchema", () => {
  it("应解析有效的摄像机数据", () => {
    const result = sceneCameraSchema.safeParse({
      position: "center",
      angle: "low",
      zoom: 1.5,
      distance: "3m",
      movement: "pan",
    });
    expect(result.success).toBe(true);
  });

  it("应接受空对象（全部可选）", () => {
    const result = sceneCameraSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe("sceneElementSchema", () => {
  it("应解析有效的场景元素", () => {
    const result = sceneElementSchema.safeParse({
      id: "elem_1",
      name: "角色A",
      type: "existing_character",
    });
    expect(result.success).toBe(true);
  });

  it("应拒绝非法 type 枚举值", () => {
    const result = sceneElementSchema.safeParse({
      id: "elem_1",
      name: "角色A",
      type: "invalid_type",
    });
    expect(result.success).toBe(false);
  });

  it("应接受所有合法 type 枚举值", () => {
    const types = ["existing_character", "new_character", "prop", "environment"];
    for (const type of types) {
      const result = sceneElementSchema.safeParse({
        id: "elem_1",
        name: "元素",
        type,
      });
      expect(result.success).toBe(true);
    }
  });
});

describe("sceneElementTypeSchema", () => {
  it("应接受所有合法枚举值", () => {
    const validValues = ["existing_character", "new_character", "prop", "environment"];
    for (const val of validValues) {
      const result = sceneElementTypeSchema.safeParse(val);
      expect(result.success).toBe(true);
    }
  });

  it("应拒绝非法枚举值", () => {
    const result = sceneElementTypeSchema.safeParse("invalid");
    expect(result.success).toBe(false);
  });
});

describe("createSceneInputSchema", () => {
  it("应接受包含必填字段的输入", () => {
    const input = {
      name: "场景A",
      description: "描述",
      type: "室内",
      timeOfDay: "白天",
      weather: "晴朗",
      mood: "平静",
      lighting: "自然光",
      elements: [],
      colors: [],
      prompt: "提示词",
    };
    const result = createSceneInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("应拒绝缺少 name 的输入", () => {
    const { name: _, ...noName } = {
      name: "场景A",
      description: "描述",
      type: "室内",
      timeOfDay: "白天",
      weather: "晴朗",
      mood: "平静",
      lighting: "自然光",
      elements: [],
      colors: [],
      prompt: "提示词",
    };
    const result = createSceneInputSchema.safeParse(noName);
    expect(result.success).toBe(false);
  });
});

describe("updateSceneInputSchema", () => {
  it("应接受包含 id 的部分更新", () => {
    const result = updateSceneInputSchema.safeParse({ id: "scene_1", name: "新名称" });
    expect(result.success).toBe(true);
  });

  it("应拒绝缺少 id 的更新", () => {
    const result = updateSceneInputSchema.safeParse({ name: "新名称" });
    expect(result.success).toBe(false);
  });
});
