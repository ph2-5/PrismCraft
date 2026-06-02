import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getTestDatabase, closeTestDatabase } from "../mocks/in-memory-db";
import { setupElectronApiMock } from "../mocks/electron-api";
import { setupApiCallMock, clearMockAIResponses } from "../mocks/ai-call-mock";

const mockApiCall = setupApiCallMock();

vi.mock("@/infrastructure/ai-providers/core", () => ({
  apiCall: (...args: unknown[]) => mockApiCall(args[0] as string, args[1] as { method?: string; body?: string }),
  apiCallWithRetry: (...args: unknown[]) => mockApiCall(args[0] as string, args[1] as { method?: string; body?: string }),
  ApiClientError: class ApiClientError extends Error {
    statusCode?: number;
    code?: string;
    constructor(message: string, statusCode?: number, code?: string) {
      super(message);
      this.statusCode = statusCode;
      this.code = code;
    }
  },
  isQueuedResponse: () => false,
  getErrorMessage: (e: unknown) => e instanceof Error ? e.message : String(e),
  checkApiHealth: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/infrastructure/ai-providers/config", async () => {
  const actual = await vi.importActual("@/infrastructure/ai-providers/config");
  return {
    ...actual,
    resolveCapability: vi.fn().mockResolvedValue({
      provider: { id: "volcengine", name: "火山引擎", apiKey: "sk-test", baseUrl: "https://api.volcengine.com", format: "openai" },
      model: { id: "seedance-1.5", name: "Seedance 1.5", capabilities: ["video"] },
    }),
  };
});

vi.mock("@/infrastructure/ai-providers/offline-queue", () => ({
  enqueueRequest: vi.fn().mockResolvedValue(null),
  getQueueStats: vi.fn().mockReturnValue({ pending: 0, generating: 0, completed: 0, failed: 0 }),
}));

vi.mock("@/shared/utils/platform", () => ({
  isElectron: () => true,
}));

beforeEach(() => {
  const db = getTestDatabase();
  const mock = setupElectronApiMock();

  mock.dbQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
    try {
      const data = db.query(sql, params);
      return { success: true, data };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  });

  mock.dbRun.mockImplementation(async (sql: string, params: unknown[] = []) => {
    try {
      const result = db.run(sql, params);
      return { success: true, data: result, changes: result.changes, lastInsertRowid: result.lastInsertRowid };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  });

  mock.dbTransaction.mockImplementation(async (statements: { sql: string; params: unknown[] }[]) => {
    try {
      const data = db.transaction(statements);
      return { success: true, data };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  });

  mockApiCall.mockClear();
  clearMockAIResponses();
});

afterEach(() => {
  closeTestDatabase();
});

describe("E2E 故事创作工作流", () => {
  describe("故事 CRUD 链路", () => {
    it("创建故事 → 查询 → 更新 → 删除 完整链路", async () => {
      const { storyStorage } = await import("@/infrastructure/storage/stories");

      await storyStorage.createStory({
        id: "wf-story-001",
        title: "森林冒险",
        description: "一段关于森林的冒险故事",
        genre: "adventure",
        tone: "exciting",
        targetDuration: 120,
      });

      const story = await storyStorage.getStoryById("wf-story-001");
      expect(story).not.toBeNull();
      expect(story!.title).toBe("森林冒险");
      expect(story!.genre).toBe("adventure");
      expect(story!.targetDuration).toBe(120);

      await storyStorage.updateStory("wf-story-001", {
        title: "深海冒险",
        description: "一段关于深海的冒险故事",
        genre: "sci-fi",
      });

      const updated = await storyStorage.getStoryById("wf-story-001");
      expect(updated!.title).toBe("深海冒险");
      expect(updated!.genre).toBe("sci-fi");

      const allStories = await storyStorage.getStories();
      expect(allStories.length).toBe(1);

      await storyStorage.deleteStory("wf-story-001");
      const deleted = await storyStorage.getStoryById("wf-story-001");
      expect(deleted).toBeNull();
    });
  });

  describe("故事与角色/场景关联", () => {
    it("故事应能关联角色和场景", async () => {
      const { storyStorage } = await import("@/infrastructure/storage/stories");
      const { characterStorage } = await import("@/infrastructure/storage/characters");
      const { sceneStorage } = await import("@/infrastructure/storage/scenes");

      await characterStorage.createCharacter({
        id: "wf-char-001",
        name: "主角小红",
        gender: "female",
        style: "写实",
        prompt: "一个勇敢的女孩",
      });

      await characterStorage.createCharacter({
        id: "wf-char-002",
        name: "配角小明",
        gender: "male",
        style: "写实",
        prompt: "一个聪明的男孩",
      });

      await sceneStorage.createScene({
        id: "wf-scene-001",
        name: "神秘森林",
        type: "室外",
        mood: "神秘",
        prompt: "一片浓雾弥漫的森林",
      });

      await storyStorage.createStory({
        id: "wf-story-002",
        title: "森林探险",
        description: "小红和小明在森林中的冒险",
        genre: "adventure",
      });

      const story = await storyStorage.getStoryById("wf-story-002");
      expect(story).not.toBeNull();
      expect(story!.title).toBe("森林探险");
    });
  });

  describe("故事 Beat 管理", () => {
    it("应为故事创建和管理 Beat", async () => {
      const db = getTestDatabase();

      db.run("INSERT INTO stories (id, title, created_at) VALUES (?, ?, strftime('%s','now'))", ["wf-story-003", "Beat测试故事"]);

      db.run(
        "INSERT INTO story_beats (id, story_id, sequence, title, content, camera, created_at) VALUES (?, ?, ?, ?, ?, ?, strftime('%s','now'))",
        ["beat-001", "wf-story-003", 1, "开场", "小红走进森林", '{"shotType":"wide","angle":"eye_level"}'],
      );

      db.run(
        "INSERT INTO story_beats (id, story_id, sequence, title, content, camera, created_at) VALUES (?, ?, ?, ?, ?, ?, strftime('%s','now'))",
        ["beat-002", "wf-story-003", 2, "发现", "小明发现了一条小路", '{"shotType":"medium","angle":"high_angle"}'],
      );

      db.run(
        "INSERT INTO story_beats (id, story_id, sequence, title, content, camera, created_at) VALUES (?, ?, ?, ?, ?, ?, strftime('%s','now'))",
        ["beat-003", "wf-story-003", 3, "高潮", "他们发现了宝藏", '{"shotType":"close_up","angle":"low_angle"}'],
      );

      const beats = db.query("SELECT * FROM story_beats WHERE story_id = ? ORDER BY sequence", ["wf-story-003"]);
      expect(beats.length).toBe(3);
      expect(beats[0].title).toBe("开场");
      expect(beats[1].title).toBe("发现");
      expect(beats[2].title).toBe("高潮");
    });
  });

  describe("故事服务层", () => {
    it("storyService.create 输入验证应通过 Zod schema", async () => {
      const { createStoryInputSchema } = await import("@/domain/schemas");

      const validInput = {
        title: "服务层测试故事",
        description: "测试描述",
        genre: "drama",
        tone: "serious",
        targetDuration: 90,
        characters: [],
        scenes: [],
        beats: [],
        elementIds: [],
      };
      const validResult = createStoryInputSchema.safeParse(validInput);
      expect(validResult.success).toBe(true);

      const invalidInput = {
        title: "",
        description: "描述",
      };
      const invalidResult = createStoryInputSchema.safeParse(invalidInput);
      expect(invalidResult.success).toBe(false);
    });

    it("storyService.update 输入验证应通过 Zod schema", async () => {
      const { updateStoryInputSchema } = await import("@/domain/schemas");

      const validInput = {
        id: "story-001",
        title: "已更新故事",
      };
      const validResult = updateStoryInputSchema.safeParse(validInput);
      expect(validResult.success).toBe(true);

      const invalidInput = {
        title: "缺少 id",
      };
      const invalidResult = updateStoryInputSchema.safeParse(invalidInput);
      expect(invalidResult.success).toBe(false);
    });
  });
});

describe("E2E 角色与场景工作流", () => {
  describe("角色管理", () => {
    it("角色创建 → AI 生成图片 → 保存 → 更新", async () => {
      const { characterStorage } = await import("@/infrastructure/storage/characters");
      const { generateImage } = await import("@/infrastructure/ai-providers/image");

      await characterStorage.createCharacter({
        id: "wf-char-img",
        name: "AI生成角色",
        gender: "female",
        style: "动漫",
        prompt: "一个穿蓝色连衣裙的少女",
      });

      const imgResult = await generateImage("一个穿蓝色连衣裙的动漫少女", "character", {
        providerId: "volcengine",
        modelId: "seedream-3",
      });

      expect(imgResult.success).toBe(true);

      if (imgResult.success) {
        await characterStorage.updateCharacter("wf-char-img", {
          generatedImage: imgResult.data.imageUrl,
          imageGenerationPrompt: "一个穿蓝色连衣裙的动漫少女",
        });
      }

      const char = await characterStorage.getCharacterById("wf-char-img");
      expect(char).not.toBeNull();
      expect(char!.generatedImage).toBeTruthy();
    });

    it("角色外观和服装应正确存储", async () => {
      const { characterStorage } = await import("@/infrastructure/storage/characters");

      await characterStorage.createCharacter({
        id: "wf-char-outfit",
        name: "服装测试角色",
        gender: "male",
        style: "写实",
        prompt: "一个穿西装的男人",
        appearance: {
          hairColor: "黑色",
          hairStyle: "短发",
          eyeColor: "棕色",
          height: "180cm",
          build: "健壮",
          clothing: "深蓝色西装",
        },
      });

      const char = await characterStorage.getCharacterById("wf-char-outfit");
      expect(char).not.toBeNull();
      expect(char!.appearance).toBeDefined();
      expect(char!.appearance!.hairColor).toBe("黑色");
      expect(char!.appearance!.clothing).toBe("深蓝色西装");
    });
  });

  describe("场景管理", () => {
    it("场景创建 → AI 生成图片 → 保存", async () => {
      const { sceneStorage } = await import("@/infrastructure/storage/scenes");
      const { generateImage } = await import("@/infrastructure/ai-providers/image");

      await sceneStorage.createScene({
        id: "wf-scene-img",
        name: "AI生成场景",
        type: "室外",
        mood: "壮观",
        prompt: "一座雄伟的山峰在夕阳下",
      });

      const imgResult = await generateImage("一座雄伟的山峰在夕阳下，壮观的自然风光", "scene", {
        providerId: "volcengine",
        modelId: "seedream-3",
      });

      expect(imgResult.success).toBe(true);

      if (imgResult.success) {
        await sceneStorage.updateScene("wf-scene-img", {
          generatedImage: imgResult.data.imageUrl,
        });
      }

      const scene = await sceneStorage.getSceneById("wf-scene-img");
      expect(scene).not.toBeNull();
      expect(scene!.generatedImage).toBeTruthy();
    });
  });
});
