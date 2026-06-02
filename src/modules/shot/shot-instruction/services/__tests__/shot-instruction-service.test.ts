import { describe, it, expect } from "vitest";
import { buildPromptLayers } from "@/modules/shot";

describe("buildPromptLayers", () => {
  it("只有 characterAnchors 时应只生成 coreElements", () => {
    const result = buildPromptLayers({
      characterAnchors: [
        { elementName: "角色A", featureTags: ["发色:黑色", "服装:铠甲"] },
      ],
    });

    expect(result.coreElements).toContain("角色A");
    expect(result.coreElements).toContain("发色:黑色");
    expect(result.coreElements).toContain("服装:铠甲");
    expect(result.cameraAction).toBe("");
    expect(result.styleAtmosphere).toBe("");
  });

  it("有 shotInstruction 时应生成 cameraAction", () => {
    const result = buildPromptLayers({
      characterAnchors: [],
      shotInstruction: {
        shotSize: "close",
        cameraMovement: "push",
        cameraAngle: "low",
      },
    });

    expect(result.cameraAction).toContain("close-up shot");
    expect(result.cameraAction).toContain("push in");
    expect(result.cameraAction).toContain("low angle shot");
  });

  it("有 customDescription 时应追加到 cameraAction", () => {
    const result = buildPromptLayers({
      characterAnchors: [],
      customDescription: "缓慢推进到角色面部",
    });

    expect(result.cameraAction).toContain("缓慢推进到角色面部");
  });

  it("shotInstruction 和 customDescription 应同时出现在 cameraAction", () => {
    const result = buildPromptLayers({
      characterAnchors: [],
      shotInstruction: {
        shotSize: "wide",
        cameraMovement: "static",
        cameraAngle: "eye_level",
      },
      customDescription: "全景展示场景",
    });

    expect(result.cameraAction).toContain("wide shot");
    expect(result.cameraAction).toContain("全景展示场景");
  });

  it("有 styleAtmosphere 时应生成 styleAtmosphere", () => {
    const result = buildPromptLayers({
      characterAnchors: [],
      styleAtmosphere: "暗色调，紧张氛围",
    });

    expect(result.styleAtmosphere).toBe("暗色调，紧张氛围");
  });

  it("所有参数都提供时应正确生成所有层", () => {
    const result = buildPromptLayers({
      characterAnchors: [
        { elementName: "角色A", featureTags: ["发色:金色"] },
        { elementName: "角色B", featureTags: ["服装:红色"] },
      ],
      shotInstruction: {
        shotSize: "medium",
        cameraMovement: "tracking",
        cameraAngle: "high",
      },
      customDescription: "跟随角色移动",
      styleAtmosphere: "温暖色调",
    });

    expect(result.coreElements).toContain("角色A");
    expect(result.coreElements).toContain("角色B");
    expect(result.coreElements).toContain("发色:金色");
    expect(result.coreElements).toContain("服装:红色");
    expect(result.cameraAction).toContain("medium shot");
    expect(result.cameraAction).toContain("跟随角色移动");
    expect(result.styleAtmosphere).toBe("温暖色调");
  });

  it("空参数时应返回空字符串", () => {
    const result = buildPromptLayers({
      characterAnchors: [],
    });

    expect(result.coreElements).toBe("");
    expect(result.cameraAction).toBe("");
    expect(result.styleAtmosphere).toBe("");
  });

  it("多个 characterAnchors 应用分号连接", () => {
    const result = buildPromptLayers({
      characterAnchors: [
        { elementName: "角色A", featureTags: ["发色:黑色"] },
        { elementName: "角色B", featureTags: ["服装:白色"] },
      ],
    });

    expect(result.coreElements).toContain("；");
    expect(result.coreElements).toContain("角色A");
    expect(result.coreElements).toContain("角色B");
  });
});
