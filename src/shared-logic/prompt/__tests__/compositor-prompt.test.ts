/**
 * compositor-prompt 测试
 *
 * 覆盖 generateCompositorPrompt 函数：
 * - 角色全描述注入
 * - 场景氛围注入
 * - 道具列表注入
 * - 用户自定义补充（extraPrompt）
 * - 质量标签
 * - 角色/场景/道具缺失时的边界情况
 * - 角色参考图 / 场景参考图备注
 * - 角色风格注入
 */

import { describe, it, expect } from "vitest";
import { generateCompositorPrompt } from "../compositor-prompt";
import type { CompositorPromptParams } from "../compositor-prompt";
import { QUALITY_TAGS_IMAGE } from "../prompt-engine";

describe("generateCompositorPrompt — 角色描述", () => {
  it("角色存在时 prompt 包含角色全描述", () => {
    const result = generateCompositorPrompt({
      character: {
        name: "艾莉亚",
        gender: "female",
        age: 20,
        appearance: { hairColor: "silver", hairStyle: "long", eyeColor: "blue" },
        description: "a brave warrior",
      },
    });

    expect(result).toContain("[Subject Character]");
    expect(result).toContain("艾莉亚");
    // buildCharacterFullDesc 输出：female，20岁，silver发，long，blue眼，a brave warrior
    expect(result).toContain("female");
    expect(result).toContain("20岁");
    expect(result).toContain("silver发");
    expect(result).toContain("long");
    expect(result).toContain("blue眼");
    expect(result).toContain("a brave warrior");
  });

  it("角色无名时使用 'A character' 占位", () => {
    const result = generateCompositorPrompt({
      character: { gender: "male" },
    });

    expect(result).toContain("A character");
  });

  it("角色 generatedImage 存在时加入参考图一致性约束", () => {
    const result = generateCompositorPrompt({
      character: { name: "张三", generatedImage: "/char.png" },
    });

    expect(result).toContain(
      "Keep character appearance fully consistent with reference image: 张三",
    );
  });

  it("角色无 generatedImage 时不加入参考图约束", () => {
    const result = generateCompositorPrompt({
      character: { name: "张三" },
    });

    expect(result).not.toContain("reference image: 张三");
  });

  it("始终包含 [Character Requirements] 段", () => {
    const result = generateCompositorPrompt({
      character: { name: "张三" },
    });

    expect(result).toContain("[Character Requirements]");
    expect(result).toContain("fully consistent with the reference");
  });
});

describe("generateCompositorPrompt — 场景描述", () => {
  it("场景存在时 prompt 包含场景氛围和视觉描述", () => {
    const result = generateCompositorPrompt({
      character: { name: "张三" },
      scene: {
        name: "魔法森林",
        timeOfDay: "dusk",
        weather: "foggy",
        mood: "mysterious",
        lighting: "soft",
        type: "forest",
        elements: ["trees", "ruins"],
        colors: ["green", "purple"],
      },
    });

    expect(result).toContain("[Background Scene]");
    expect(result).toContain("魔法森林");
    // buildSceneAtmosphereDesc: dusk，foggy，mysterious，soft光线
    expect(result).toContain("dusk");
    expect(result).toContain("foggy");
    expect(result).toContain("mysterious");
    expect(result).toContain("soft光线");
    // buildSceneVisualDesc: forest，trees、ruins，green/purple色调
    expect(result).toContain("forest");
    expect(result).toContain("trees、ruins");
    expect(result).toContain("green/purple色调");
  });

  it("场景无 name 时使用 'Scene' 占位", () => {
    const result = generateCompositorPrompt({
      character: { name: "张三" },
      scene: { mood: "calm" },
    });

    expect(result).toContain("Scene");
  });

  it("场景 generatedImage 存在时加入参考图约束", () => {
    const result = generateCompositorPrompt({
      character: { name: "张三" },
      scene: { name: "森林", generatedImage: "/scene.png" },
    });

    expect(result).toContain(
      "Keep scene background fully consistent with reference image",
    );
  });

  it("场景无 generatedImage 时不加入参考图约束", () => {
    const result = generateCompositorPrompt({
      character: { name: "张三" },
      scene: { name: "森林" },
    });

    expect(result).not.toContain(
      "Keep scene background fully consistent with reference image",
    );
  });

  it("场景缺失时不包含 [Background Scene] 段", () => {
    const result = generateCompositorPrompt({
      character: { name: "张三" },
    });

    expect(result).not.toContain("[Background Scene]");
  });
});

describe("generateCompositorPrompt — 道具列表", () => {
  it("道具列表存在时 prompt 包含道具描述", () => {
    const result = generateCompositorPrompt({
      character: { name: "张三" },
      props: [
        { name: "圣剑", type: "weapon", description: "发光的神器", tags: ["holy", "sharp"] },
        { name: "披风", type: "clothing" },
      ],
    });

    expect(result).toContain("[Composited Items]");
    expect(result).toContain("圣剑");
    expect(result).toContain("Weapon");
    expect(result).toContain("发光的神器");
    expect(result).toContain("tags: holy, sharp");
    expect(result).toContain("披风");
    expect(result).toContain("Clothing/Outfit");
    // 道具整合指令
    expect(result).toContain("[Integration]");
    expect(result).toContain("Naturally integrate");
  });

  it("道具无 name 时使用 'unnamed item' 占位", () => {
    const result = generateCompositorPrompt({
      character: { name: "张三" },
      props: [{ type: "weapon" }],
    });

    expect(result).toContain("unnamed item");
  });

  it("道具无 type 时使用 'Item' 标签", () => {
    const result = generateCompositorPrompt({
      character: { name: "张三" },
      props: [{ name: "神秘物品" }],
    });

    expect(result).toContain("神秘物品 (Item)");
  });

  it("道具 type 为 unknown 时使用 'Item' 标签", () => {
    const result = generateCompositorPrompt({
      character: { name: "张三" },
      props: [{ name: "神秘物品", type: "unknown-type" }],
    });

    expect(result).toContain("神秘物品 (Item)");
  });

  it("道具无 description 和 tags 时仅包含名称和类型", () => {
    const result = generateCompositorPrompt({
      character: { name: "张三" },
      props: [{ name: "戒指", type: "accessory" }],
    });

    expect(result).toContain("戒指 (Accessory)");
  });

  it("道具列表为空时不包含 [Composited Items] 段", () => {
    const result = generateCompositorPrompt({
      character: { name: "张三" },
      props: [],
    });

    expect(result).not.toContain("[Composited Items]");
  });

  it("道具列表缺失时（undefined）不包含 [Composited Items] 段", () => {
    const result = generateCompositorPrompt({
      character: { name: "张三" },
    });

    expect(result).not.toContain("[Composited Items]");
  });
});

describe("generateCompositorPrompt — extraPrompt", () => {
  it("extraPrompt 存在时 prompt 包含用户自定义补充", () => {
    const result = generateCompositorPrompt({
      character: { name: "张三" },
      extraPrompt: "make it look epic",
    });

    expect(result).toContain("[Extra Instructions]");
    expect(result).toContain("make it look epic");
  });

  it("extraPrompt 为空白时不包含 [Extra Instructions] 段", () => {
    const result = generateCompositorPrompt({
      character: { name: "张三" },
      extraPrompt: "   ",
    });

    expect(result).not.toContain("[Extra Instructions]");
  });

  it("extraPrompt 为空字符串时不包含 [Extra Instructions] 段", () => {
    const result = generateCompositorPrompt({
      character: { name: "张三" },
      extraPrompt: "",
    });

    expect(result).not.toContain("[Extra Instructions]");
  });

  it("extraPrompt 缺失时不包含 [Extra Instructions] 段", () => {
    const result = generateCompositorPrompt({
      character: { name: "张三" },
    });

    expect(result).not.toContain("[Extra Instructions]");
  });

  it("extraPrompt 前后空格被 trim", () => {
    const result = generateCompositorPrompt({
      character: { name: "张三" },
      extraPrompt: "  epic lighting  ",
    });

    expect(result).toContain("[Extra Instructions]\nepic lighting");
  });
});

describe("generateCompositorPrompt — 质量标签与合成指令", () => {
  it("始终包含 [Quality] 段和质量标签", () => {
    const result = generateCompositorPrompt({
      character: { name: "张三" },
    });

    expect(result).toContain("[Quality]");
    for (const tag of QUALITY_TAGS_IMAGE) {
      expect(result).toContain(tag);
    }
  });

  it("始终包含 [Composition] 段和合成指令", () => {
    const result = generateCompositorPrompt({
      character: { name: "张三" },
    });

    expect(result).toContain("[Composition]");
    expect(result).toContain("single coherent image");
    expect(result).toContain("cinematic lighting");
  });
});

describe("generateCompositorPrompt — 风格注入", () => {
  it("角色 style 匹配 STYLE_KEYWORDS 时注入 [Style] 段", () => {
    const result = generateCompositorPrompt({
      character: { name: "张三", style: "anime" },
    });

    expect(result).toContain("[Style]");
    expect(result).toContain("anime style");
  });

  it("角色 style 为 realistic 时注入对应风格关键词", () => {
    const result = generateCompositorPrompt({
      character: { name: "张三", style: "realistic" },
    });

    expect(result).toContain("[Style]");
    expect(result).toContain("photorealistic");
  });

  it("角色 style 不在 STYLE_KEYWORDS 中时不注入 [Style] 段", () => {
    const result = generateCompositorPrompt({
      character: { name: "张三", style: "unknown-style" },
    });

    expect(result).not.toContain("[Style]");
  });

  it("角色无 style 时不注入 [Style] 段", () => {
    const result = generateCompositorPrompt({
      character: { name: "张三" },
    });

    expect(result).not.toContain("[Style]");
  });
});

describe("generateCompositorPrompt — 边界情况", () => {
  it("仅角色（最小入参）时 prompt 包含必要段落", () => {
    const result = generateCompositorPrompt({
      character: { name: "张三" },
    });

    expect(result).toContain("[Subject Character]");
    expect(result).toContain("[Character Requirements]");
    expect(result).toContain("[Composition]");
    expect(result).toContain("[Quality]");
    // 不包含可选段落
    expect(result).not.toContain("[Background Scene]");
    expect(result).not.toContain("[Composited Items]");
    expect(result).not.toContain("[Extra Instructions]");
    expect(result).not.toContain("[Style]");
  });

  it("全量入参时 prompt 包含所有段落", () => {
    const result = generateCompositorPrompt({
      character: { name: "张三", style: "anime", generatedImage: "/char.png" },
      scene: { name: "森林", generatedImage: "/scene.png" },
      props: [{ name: "剑", type: "weapon" }],
      extraPrompt: "epic pose",
    });

    expect(result).toContain("[Subject Character]");
    expect(result).toContain("[Character Requirements]");
    expect(result).toContain("[Background Scene]");
    expect(result).toContain("[Composited Items]");
    expect(result).toContain("[Integration]");
    expect(result).toContain("[Extra Instructions]");
    expect(result).toContain("[Composition]");
    expect(result).toContain("[Style]");
    expect(result).toContain("[Quality]");
  });

  it("返回值为非空字符串", () => {
    const result = generateCompositorPrompt({
      character: { name: "张三" },
    });

    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("段落之间用中文逗号连接", () => {
    const result = generateCompositorPrompt({
      character: { name: "张三" },
    });

    // joinParts 使用中文逗号连接顶层 parts
    expect(result).toContain("，");
  });
});
