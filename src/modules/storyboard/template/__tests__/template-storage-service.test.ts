/**
 * Template Storage Service 测试
 *
 * 覆盖 template-storage-service.ts 的核心逻辑：
 *   - getAllSavedTemplates：查询所有模板，StoryTemplateRecord → StoryboardTemplate 转换
 *   - getSavedTemplateById：查询单个模板，未找到返回 null
 *   - saveSavedTemplate：创建/替换模板
 *   - deleteSavedTemplate：软删除
 *   - deleteAllSavedTemplates：物理删除全部
 *   - 错误处理：storage 抛异常时返回 err Result
 *
 * 参考 services/__tests__/version-control.test.ts 的 mock 模式。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { StoryboardTemplate, StoryboardTemplateBeat } from "../services/storyboard-template";

vi.mock("@/infrastructure/di", () => ({
  container: {
    storyTemplateStorage: {
      getAllTemplates: vi.fn(),
      getTemplateById: vi.fn(),
      createTemplate: vi.fn(),
      updateTemplate: vi.fn(),
      deleteTemplate: vi.fn(),
      deleteAllTemplates: vi.fn(),
    },
  },
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: { warn: vi.fn(), error: vi.fn() },
}));

import {
  getAllSavedTemplates,
  getSavedTemplateById,
  saveSavedTemplate,
  deleteSavedTemplate,
  deleteAllSavedTemplates,
} from "../services/template-storage-service";
import { container } from "@/infrastructure/di";

const storage = vi.mocked(container.storyTemplateStorage);

const mockBeat: StoryboardTemplateBeat = {
  type: "scene",
  title: "分镜标题",
  content: "分镜内容",
  duration: 5,
  shotType: "wide",
  cameraAngle: "low",
  cameraMovement: "pan",
};

function makeTemplate(overrides: Partial<StoryboardTemplate> = {}): StoryboardTemplate {
  const now = Date.now();
  return {
    id: "tpl-1",
    name: "测试模板",
    description: "测试描述",
    category: "custom",
    genre: "drama",
    tone: "neutral",
    tags: ["tag1", "tag2"],
    author: "作者",
    beats: [mockBeat],
    totalDuration: 5,
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/** Storage 返回的 record 形状（与 StoryTemplateRecord 一致） */
function makeRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const tpl = makeTemplate();
  return {
    id: tpl.id,
    name: tpl.name,
    description: tpl.description,
    beats: tpl.beats,
    category: tpl.category,
    genre: tpl.genre,
    tone: tpl.tone,
    tags: tpl.tags,
    author: tpl.author,
    totalDuration: tpl.totalDuration,
    version: tpl.version,
    createdAt: tpl.createdAt,
    updatedAt: tpl.updatedAt,
    ...overrides,
  };
}

describe("getAllSavedTemplates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应返回所有模板并转换为 StoryboardTemplate", async () => {
    const records = [makeRecord(), makeRecord({ id: "tpl-2", name: "模板2" })];
    storage.getAllTemplates.mockResolvedValue(records as never);

    const result = await getAllSavedTemplates();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(2);
      expect(result.value[0]!.id).toBe("tpl-1");
      expect(result.value[1]!.id).toBe("tpl-2");
      expect(result.value[0]!.beats).toEqual([mockBeat]);
      expect(result.value[0]!.tags).toEqual(["tag1", "tag2"]);
    }
  });

  it("无模板时返回空数组", async () => {
    storage.getAllTemplates.mockResolvedValue([] as never);

    const result = await getAllSavedTemplates();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });

  it("storage 抛异常时返回 err", async () => {
    storage.getAllTemplates.mockRejectedValue(new Error("DB error") as never);

    const result = await getAllSavedTemplates();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("DB error");
    }
  });
});

describe("getSavedTemplateById", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("找到模板时返回 StoryboardTemplate", async () => {
    storage.getTemplateById.mockResolvedValue(makeRecord() as never);

    const result = await getSavedTemplateById("tpl-1");

    expect(storage.getTemplateById).toHaveBeenCalledWith("tpl-1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).not.toBeNull();
      expect(result.value!.id).toBe("tpl-1");
      expect(result.value!.name).toBe("测试模板");
    }
  });

  it("未找到时返回 null", async () => {
    storage.getTemplateById.mockResolvedValue(null as never);

    const result = await getSavedTemplateById("not-exist");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
  });
});

describe("saveSavedTemplate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应调用 createTemplate 并返回 ok", async () => {
    storage.createTemplate.mockResolvedValue(undefined as never);
    const template = makeTemplate();

    const result = await saveSavedTemplate(template);

    expect(storage.createTemplate).toHaveBeenCalledTimes(1);
    const callArg = vi.mocked(storage.createTemplate).mock.calls[0]![0];
    expect(callArg.id).toBe("tpl-1");
    expect(callArg.name).toBe("测试模板");
    expect(callArg.beats).toEqual([mockBeat]);
    expect(callArg.tags).toEqual(["tag1", "tag2"]);
    expect(result.ok).toBe(true);
  });

  it("storage 抛异常时返回 err", async () => {
    storage.createTemplate.mockRejectedValue(new Error("write failed") as never);

    const result = await saveSavedTemplate(makeTemplate());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("write failed");
    }
  });
});

describe("deleteSavedTemplate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应调用 deleteTemplate 并返回 ok", async () => {
    storage.deleteTemplate.mockResolvedValue(undefined as never);

    const result = await deleteSavedTemplate("tpl-1");

    expect(storage.deleteTemplate).toHaveBeenCalledWith("tpl-1");
    expect(result.ok).toBe(true);
  });

  it("storage 抛异常时返回 err", async () => {
    storage.deleteTemplate.mockRejectedValue(new Error("delete failed") as never);

    const result = await deleteSavedTemplate("tpl-1");

    expect(result.ok).toBe(false);
  });
});

describe("deleteAllSavedTemplates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应调用 deleteAllTemplates 并返回 ok", async () => {
    storage.deleteAllTemplates.mockResolvedValue(undefined as never);

    const result = await deleteAllSavedTemplates();

    expect(storage.deleteAllTemplates).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
  });
});
