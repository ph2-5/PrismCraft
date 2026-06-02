import { describe, it, expect } from "vitest";
import {
  characterSchema,
  characterOutfitSchema,
  characterAppearanceSchema,
  createCharacterInputSchema,
  updateCharacterInputSchema,
} from "@/domain/schemas/character";
import { factories } from "@/__tests__/mocks/factories";

describe("characterSchema", () => {
  it("应解析有效的角色数据", () => {
    const valid = factories.character();
    const result = characterSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("应拒绝缺少必填字段 name 的数据", () => {
    const { name: _, ...noName } = factories.character();
    const result = characterSchema.safeParse(noName);
    expect(result.success).toBe(false);
    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      expect(fieldErrors.name).toBeDefined();
    }
  });

  it("应拒绝空字符串 name", () => {
    const data = factories.character({ name: "" });
    const result = characterSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("应拒绝负数 age", () => {
    const data = factories.character({ age: -1 });
    const result = characterSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("应接受 age 为 undefined", () => {
    const data = factories.character();
    delete (data as Record<string, unknown>).age;
    const result = characterSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("应拒绝非法 videoGenerationStatus 枚举值", () => {
    const data = factories.character({ videoGenerationStatus: "invalid" as unknown as "pending" });
    const result = characterSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("应接受合法 videoGenerationStatus 枚举值", () => {
    for (const status of ["pending", "generating", "completed", "failed"] as const) {
      const data = factories.character({ videoGenerationStatus: status });
      const result = characterSchema.safeParse(data);
      expect(result.success).toBe(true);
    }
  });

  it("应拒绝负数 useCount", () => {
    const data = factories.character({ useCount: -1 });
    const result = characterSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("应正确应用默认值", () => {
    const minimal = {
      id: "char_1",
      name: "角色A",
      description: "描述",
      gender: "男",
      style: "写实",
      personality: [],
      appearance: { hairColor: "", hairStyle: "", eyeColor: "", height: "", build: "", clothing: "" },
      prompt: "提示词",
    };
    const result = characterSchema.safeParse(minimal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.outfits).toBeUndefined();
      expect(result.data.traits).toBeUndefined();
    }
  });
});

describe("characterOutfitSchema", () => {
  it("应解析有效的服装数据", () => {
    const outfit = {
      id: "outfit_1",
      name: "休闲装",
      description: "日常休闲服装",
      clothing: "T恤+牛仔裤",
    };
    const result = characterOutfitSchema.safeParse(outfit);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.accessories).toEqual([]);
      expect(result.data.isDefault).toBe(false);
    }
  });

  it("应拒绝空 name", () => {
    const outfit = {
      id: "outfit_1",
      name: "",
      description: "描述",
      clothing: "T恤",
    };
    const result = characterOutfitSchema.safeParse(outfit);
    expect(result.success).toBe(false);
  });

  it("应拒绝无效的 imageUrl", () => {
    const outfit = {
      id: "outfit_1",
      name: "服装",
      description: "描述",
      clothing: "T恤",
      imageUrl: "not-a-url",
    };
    const result = characterOutfitSchema.safeParse(outfit);
    expect(result.success).toBe(false);
  });
});

describe("characterAppearanceSchema", () => {
  it("应解析有效的外观数据", () => {
    const appearance = {
      hairColor: "黑色",
      hairStyle: "短发",
      eyeColor: "棕色",
      height: "175cm",
      build: "中等",
      clothing: "西装",
    };
    const result = characterAppearanceSchema.safeParse(appearance);
    expect(result.success).toBe(true);
  });

  it("应正确应用默认值", () => {
    const result = characterAppearanceSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.hairColor).toBe("");
      expect(result.data.eyeColor).toBe("");
    }
  });
});

describe("createCharacterInputSchema", () => {
  it("应接受包含必填字段的输入", () => {
    const input = {
      name: "角色A",
      description: "描述",
      gender: "男",
      style: "写实",
      personality: [],
      appearance: { hairColor: "", hairStyle: "", eyeColor: "", height: "", build: "", clothing: "" },
      prompt: "提示词",
    };
    const result = createCharacterInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("应拒绝缺少 name 的输入", () => {
    const { name: _, ...noName } = {
      name: "角色A",
      description: "描述",
      gender: "男",
      style: "写实",
      personality: [],
      appearance: { hairColor: "", hairStyle: "", eyeColor: "", height: "", build: "", clothing: "" },
      prompt: "提示词",
    };
    const result = createCharacterInputSchema.safeParse(noName);
    expect(result.success).toBe(false);
  });
});

describe("updateCharacterInputSchema", () => {
  it("应接受包含 id 的部分更新", () => {
    const result = updateCharacterInputSchema.safeParse({ id: "char_1", name: "新名称" });
    expect(result.success).toBe(true);
  });

  it("应拒绝缺少 id 的更新", () => {
    const result = updateCharacterInputSchema.safeParse({ name: "新名称" });
    expect(result.success).toBe(false);
  });
});
