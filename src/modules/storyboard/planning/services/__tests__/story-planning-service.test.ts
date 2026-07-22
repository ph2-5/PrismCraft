import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Story, Character, Scene } from "@/domain/schemas";

vi.mock("@/infrastructure/di", () => ({
  container: {
    elementStorage: { getAllElements: vi.fn() },
  },
}));

vi.mock("@/shared/api-config", () => ({
  loadConfig: vi.fn(),
}));

vi.mock(
  "@/modules/shot/shot-generation/story-generation-pipeline",
  () => ({
    generateStoryPlanWithValidation: vi.fn(),
  }),
);

import { planStory, checkTextApiConfig } from "../story-planning-service";
import { container } from "@/infrastructure/di";
import { loadConfig } from "@/shared/api-config";
import { generateStoryPlanWithValidation } from "@/modules/shot";

const mockStory: Story = {
  id: "story-1",
  title: "测试故事",
  description: "测试描述",
  characters: [],
  scenes: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
  beats: [],
  elementIds: [],
  status: "in_progress",
};

const mockCharacters: Character[] = [
  {
    id: "char-1",
    name: "角色A",
    description: "描述",
    gender: "未知",
    style: "写实",
    personality: [],
    appearance: {
      hairColor: "",
      hairStyle: "",
      eyeColor: "",
      height: "",
      build: "",
      clothing: "",
    },
    prompt: "提示词",
  },
];

const mockScenes: Scene[] = [
  {
    id: "scene-1",
    name: "场景A",
    description: "场景描述",
    type: "室内",
    timeOfDay: "白天",
    weather: "晴朗",
    mood: "平静",
    lighting: "自然光",
    elements: [],
    colors: [],
    prompt: "场景提示词",
  },
];

describe("planStory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应使用默认选项调用 generateStoryPlanWithValidation", async () => {
    const mockResult = {
      beats: [{ id: "beat-1", title: "分镜1", content: "内容1" }],
      autoFixedCount: 0,
      retryCount: 0,
      fixDetails: [],
    };
    (container.elementStorage.getAllElements as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (generateStoryPlanWithValidation as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);

    const result = await planStory(mockStory, mockCharacters, mockScenes);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.beats).toHaveLength(1);
      expect(result.value.autoFixedCount).toBe(0);
      expect(result.value.retryCount).toBe(0);
      expect(result.value.fixDetails).toEqual([]);
    }
    expect(generateStoryPlanWithValidation).toHaveBeenCalledWith(
      mockStory,
      mockCharacters,
      mockScenes,
      [],
      {
        maxRetries: 1,
        autoFix: false,
        fewShotCount: 1,
        strictMode: false,
        showFixDetails: false,
        enhancedGeneration: false,
      },
      false,
    );
  });

  it("应传递自定义选项", async () => {
    const mockResult = {
      beats: [],
      autoFixedCount: 2,
      retryCount: 3,
      fixDetails: ["修复1"],
    };
    (container.elementStorage.getAllElements as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (generateStoryPlanWithValidation as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);

    const result = await planStory(mockStory, mockCharacters, mockScenes, {
      maxRetries: 5,
      autoFix: true,
      fewShotCount: 3,
      strictMode: true,
      showFixDetails: true,
      enhancedGeneration: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.autoFixedCount).toBe(2);
      expect(result.value.retryCount).toBe(3);
      expect(result.value.fixDetails).toEqual(["修复1"]);
    }
    expect(generateStoryPlanWithValidation).toHaveBeenCalledWith(
      mockStory,
      mockCharacters,
      mockScenes,
      [],
      {
        maxRetries: 5,
        autoFix: true,
        fewShotCount: 3,
        strictMode: true,
        showFixDetails: true,
        enhancedGeneration: true,
      },
      true,
    );
  });

  it("应从 elementStorage 获取元素并传递", async () => {
    const elements = [{ id: "elem-1", name: "元素1" }];
    (container.elementStorage.getAllElements as ReturnType<typeof vi.fn>).mockResolvedValue(elements);
    (generateStoryPlanWithValidation as ReturnType<typeof vi.fn>).mockResolvedValue({
      beats: [],
      autoFixedCount: 0,
      retryCount: 0,
      fixDetails: [],
    });

    await planStory(mockStory, mockCharacters, mockScenes);

    expect(container.elementStorage.getAllElements).toHaveBeenCalled();
    expect(generateStoryPlanWithValidation).toHaveBeenCalledWith(
      mockStory,
      mockCharacters,
      mockScenes,
      elements,
      expect.any(Object),
      expect.any(Boolean),
    );
  });
});

describe("checkTextApiConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("有 text 能力的 provider 时应返回 true", async () => {
    (loadConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      providers: [
        {
          models: [{ capabilities: ["text", "image"] }],
        },
      ],
    });

    const result = await checkTextApiConfig();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(true);
    }
  });

  it("没有 text 能力的 provider 时应返回 false", async () => {
    (loadConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      providers: [
        {
          models: [{ capabilities: ["image"] }],
        },
      ],
    });

    const result = await checkTextApiConfig();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(false);
    }
  });

  it("config 为 null 时应返回 false", async () => {
    (loadConfig as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await checkTextApiConfig();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(false);
    }
  });

  it("config 没有 providers 时应返回 false", async () => {
    (loadConfig as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const result = await checkTextApiConfig();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(false);
    }
  });

  it("加载配置异常时应返回 false", async () => {
    (loadConfig as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("配置加载失败"));

    const result = await checkTextApiConfig();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(false);
    }
  });
});
