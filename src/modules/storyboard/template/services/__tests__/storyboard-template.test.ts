import { describe, it, expect } from "vitest";
import type { StoryBeat } from "@/domain/schemas";
import {
  createTemplateFromBeats,
  applyTemplateToBeats,
  importTemplateFromFile,
} from "../storyboard-template";
import type { StoryboardTemplate } from "../storyboard-template";

const mockBeat: StoryBeat = {
  id: "beat-1",
  sequence: 0,
  title: "分镜标题",
  description: "分镜描述",
  content: "分镜内容",
  duration: 5,
  type: "scene",
  // PR 3：shotInstruction 替代旧 shotType/camera.angle/camera.movement
  shotInstruction: { shotSize: "wide", cameraAngle: "low", cameraMovement: "pan" },
  camera: { distance: "medium", speed: "normal" },
  characterIds: [],
  enhancedGeneration: false,
  elementIds: [],
  imageGenerationPrompt: "图像提示词",
  firstFramePrompt: "首帧提示词",
  lastFramePrompt: "尾帧提示词",
};

describe("createTemplateFromBeats", () => {
  it("应从 beats 创建模板", () => {
    const template = createTemplateFromBeats("测试模板", "模板描述", [mockBeat]);

    expect(template.name).toBe("测试模板");
    expect(template.description).toBe("模板描述");
    expect(template.beats).toHaveLength(1);
    expect(template.totalDuration).toBe(5);
    expect(template.version).toBe(1);
    expect(template.category).toBe("custom");
    expect(template.id).toMatch(/^tpl_/);
  });

  it("应使用自定义选项", () => {
    const template = createTemplateFromBeats("模板", "描述", [mockBeat], {
      category: "action",
      genre: "comedy",
      tone: "humorous",
      tags: ["tag1", "tag2"],
      author: "作者",
    });

    expect(template.category).toBe("action");
    expect(template.genre).toBe("comedy");
    expect(template.tone).toBe("humorous");
    expect(template.tags).toEqual(["tag1", "tag2"]);
    expect(template.author).toBe("作者");
  });

  it("应正确映射 beat 字段到模板 beat", () => {
    const template = createTemplateFromBeats("模板", "描述", [mockBeat]);
    const tplBeat = template.beats[0]!;

    expect(tplBeat.type).toBe("scene");
    expect(tplBeat.title).toBe("分镜标题");
    expect(tplBeat.content).toBe("分镜内容");
    expect(tplBeat.duration).toBe(5);
    expect(tplBeat.shotType).toBe("wide");
    expect(tplBeat.cameraAngle).toBe("low");
    expect(tplBeat.cameraMovement).toBe("pan");
    expect(tplBeat.cameraDistance).toBe("medium");
    expect(tplBeat.cameraSpeed).toBe("normal");
    expect(tplBeat.imageGenerationPrompt).toBe("图像提示词");
    expect(tplBeat.firstFramePrompt).toBe("首帧提示词");
    expect(tplBeat.lastFramePrompt).toBe("尾帧提示词");
  });

  it("应计算总时长", () => {
    const beats = [
      { ...mockBeat, duration: 3 },
      { ...mockBeat, duration: 7 },
      { ...mockBeat, duration: 5 },
    ];

    const template = createTemplateFromBeats("模板", "描述", beats);

    expect(template.totalDuration).toBe(15);
  });

  it("beat 缺少可选字段时应使用默认值", () => {
    const minimalBeat: StoryBeat = {
      id: "beat-min",
      sequence: 0,
      description: "最小分镜",
      duration: 5,
      characterIds: [],
      enhancedGeneration: false,
      elementIds: [],
    };

    const template = createTemplateFromBeats("模板", "描述", [minimalBeat]);
    const tplBeat = template.beats[0]!;

    expect(tplBeat.type).toBe("scene");
    expect(tplBeat.title).toBe("");
    expect(tplBeat.content).toBe("最小分镜");
    expect(tplBeat.duration).toBe(5);
  });

  it("createdAt 和 updatedAt 应接近当前时间", () => {
    const before = Date.now();
    const template = createTemplateFromBeats("模板", "描述", []);
    const after = Date.now();

    expect(template.createdAt).toBeGreaterThanOrEqual(before);
    expect(template.createdAt).toBeLessThanOrEqual(after);
    expect(template.updatedAt).toBe(template.createdAt);
  });
});

describe("applyTemplateToBeats", () => {
  const mockTemplate: StoryboardTemplate = {
    id: "tpl-1",
    name: "测试模板",
    description: "描述",
    category: "action",
    genre: "comedy",
    tone: "humorous",
    tags: [],
    author: "作者",
    beats: [
      {
        type: "scene",
        title: "开场",
        content: "开场内容",
        duration: 5,
        shotType: "wide",
        cameraAngle: "low",
        cameraMovement: "pan",
        cameraDistance: "medium",
        cameraSpeed: "normal",
        imageGenerationPrompt: "图像提示词",
        firstFramePrompt: "首帧提示词",
        lastFramePrompt: "尾帧提示词",
      },
      {
        type: "dialogue",
        title: "对话",
        content: "对话内容",
        duration: 3,
      },
    ],
    totalDuration: 8,
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  it("应将模板 beats 转换为 StoryBeat 数组", () => {
    const beats = applyTemplateToBeats(mockTemplate);

    expect(beats).toHaveLength(2);
    expect(beats[0]!.type).toBe("scene");
    expect(beats[0]!.title).toBe("开场");
    expect(beats[0]!.content).toBe("开场内容");
    expect(beats[0]!.description).toBe("开场内容");
    expect(beats[0]!.duration).toBe(5);
    expect(beats[0]!.order).toBe(0);
    expect(beats[1]!.order).toBe(1);
  });

  it("应正确映射 camera 字段", () => {
    const beats = applyTemplateToBeats(mockTemplate);

    expect(beats[0]!.camera).toEqual({
      angle: "low",
      movement: "pan",
      distance: "medium",
      speed: "normal",
    });
  });

  it("应映射提示词字段", () => {
    const beats = applyTemplateToBeats(mockTemplate);

    expect(beats[0]!.imageGenerationPrompt).toBe("图像提示词");
    expect(beats[0]!.firstFramePrompt).toBe("首帧提示词");
    expect(beats[0]!.lastFramePrompt).toBe("尾帧提示词");
  });

  it("缺少可选 camera 字段时应正确处理", () => {
    const beats = applyTemplateToBeats(mockTemplate);

    expect(beats[1]!.camera).toEqual({
      angle: undefined,
      movement: undefined,
      distance: undefined,
      speed: undefined,
    });
  });
});

describe("importTemplateFromFile", () => {
  function createMockFile(content: string, name = "template.astpl"): File {
    return new File([content], name, { type: "application/json" });
  }

  it("应成功解析有效的模板文件", async () => {
    const templateData = {
      id: "tpl-1",
      name: "导入模板",
      description: "导入描述",
      beats: [{ type: "scene", title: "分镜", content: "内容", duration: 5 }],
    };

    const file = createMockFile(JSON.stringify(templateData));
    const result = await importTemplateFromFile(file);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe("导入模板");
      expect(result.value.beats).toHaveLength(1);
      expect(result.value.category).toBe("imported");
    }
  });

  it("缺少 name 字段时应返回 err Result", async () => {
    const templateData = {
      id: "tpl-1",
      beats: [],
    };

    const file = createMockFile(JSON.stringify(templateData));
    const result = await importTemplateFromFile(file);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("模板文件解析失败");
    }
  });

  it("beats 不是数组时应返回 err Result", async () => {
    const templateData = {
      name: "模板",
      beats: "not an array",
    };

    const file = createMockFile(JSON.stringify(templateData));
    const result = await importTemplateFromFile(file);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("模板文件解析失败");
    }
  });

  it("缺少可选字段时应使用默认值", async () => {
    const templateData = {
      name: "最小模板",
      beats: [{ type: "scene", title: "分镜", content: "内容", duration: 5 }],
    };

    const file = createMockFile(JSON.stringify(templateData));
    const result = await importTemplateFromFile(file);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.description).toBe("");
      expect(result.value.category).toBe("imported");
      expect(result.value.genre).toBe("");
      expect(result.value.tone).toBe("");
      expect(result.value.tags).toEqual([]);
      expect(result.value.author).toBe("");
      expect(result.value.version).toBe(1);
    }
  });

  it("无效 JSON 应返回 err Result", async () => {
    const file = createMockFile("not valid json");
    const result = await importTemplateFromFile(file);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("模板文件解析失败");
    }
  });
});

describe("importTemplatesFromFile (batch)", () => {
  function createMockFile(content: string, name = "templates.astpl"): File {
    return new File([content], name, { type: "application/json" });
  }

  it("应解析批量模板文件", async () => {
    const { importTemplatesFromFile } = await import("../storyboard-template");
    const batchData = {
      format: "astpl-batch",
      version: 1,
      templates: [
        { id: "tpl-1", name: "模板1", beats: [] },
        { id: "tpl-2", name: "模板2", beats: [] },
      ],
    };

    const file = createMockFile(JSON.stringify(batchData));
    const result = await importTemplatesFromFile(file);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(2);
    }
  });

  it("单个模板文件应包装为数组返回", async () => {
    const { importTemplatesFromFile } = await import("../storyboard-template");
    const singleData = {
      name: "单个模板",
      beats: [{ type: "scene", title: "分镜", content: "内容", duration: 5 }],
    };

    const file = createMockFile(JSON.stringify(singleData));
    const result = await importTemplatesFromFile(file);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
    }
  });

  it("无效格式应返回 err Result", async () => {
    const { importTemplatesFromFile } = await import("../storyboard-template");
    const invalidData = { something: "else" };

    const file = createMockFile(JSON.stringify(invalidData));
    const result = await importTemplatesFromFile(file);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("模板文件解析失败");
    }
  });
});
