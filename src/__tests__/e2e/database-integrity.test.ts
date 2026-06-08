import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { type InMemoryDatabase, getTestDatabase, closeTestDatabase } from "../mocks/in-memory-db";
import { setupElectronApiMock } from "../mocks/electron-api";

let db: InMemoryDatabase;

beforeEach(() => {
  db = getTestDatabase();
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
});

afterEach(() => {
  closeTestDatabase();
});

describe("E2E 数据库完整性", () => {
  describe("Schema 初始化", () => {
    it("所有核心表应已创建", () => {
      const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
      const tableNames = tables.map((t) => t.name as string);

      const requiredTables = [
        "characters", "scenes", "stories", "story_beats",
        "video_tasks", "video_cache", "elements",
        "sync_changelog", "sync_meta",
      ];

      for (const table of requiredTables) {
        expect(tableNames, `Missing table: ${table}`).toContain(table);
      }
    });

    it("所有索引应已创建", () => {
      const indexes = db.query("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'");
      const indexNames = indexes.map((i) => i.name as string);
      expect(indexNames.length).toBeGreaterThanOrEqual(5);
    });

    it("video_tasks 表应包含所有必要列", () => {
      const columns = db.query("PRAGMA table_info(video_tasks)");
      const colNames = columns.map((c) => c.name as string);

      const required = [
        "id", "status", "progress", "video_url", "message",
        "story_id", "beat_id", "config", "provider", "media_refs", "tracking",
        "owner_id", "created_at", "updated_at",
      ];
      for (const col of required) {
        expect(colNames, `video_tasks missing column: ${col}`).toContain(col);
      }
    });
  });

  describe("CRUD 完整性", () => {
    it("video_tasks 完整 CRUD 周期", async () => {
      const { videoTaskStorage } = await import("@/infrastructure/storage/video-tasks");

      await videoTaskStorage.createVideoTask({
        taskId: "e2e-task-001",
        status: "pending",
        progress: 0,
        message: "E2E test task",
        providerId: "volcengine",
        providerModelId: "seedance-1.5",
        providerFormat: "mp4",
        prompt: "一只猫在跳舞",
      });

      const task = await videoTaskStorage.getVideoTaskById("e2e-task-001");
      expect(task).not.toBeNull();
      expect(task!.taskId).toBe("e2e-task-001");
      expect(task!.status).toBe("pending");
      expect(task!.providerId).toBe("volcengine");
      expect(task!.providerModelId).toBe("seedance-1.5");

      await videoTaskStorage.updateVideoTask("e2e-task-001", {
        status: "generating",
        progress: 50,
      });

      const updated = await videoTaskStorage.getVideoTaskById("e2e-task-001");
      expect(updated!.status).toBe("generating");
      expect(updated!.progress).toBe(50);

      const allTasks = await videoTaskStorage.getVideoTasks();
      expect(allTasks.length).toBe(1);

      await videoTaskStorage.deleteVideoTask("e2e-task-001");
      const deleted = await videoTaskStorage.getVideoTaskById("e2e-task-001");
      expect(deleted).toBeNull();
    });

    it("characters 完整 CRUD 周期", async () => {
      const { characterStorage } = await import("@/infrastructure/storage/characters");

      await characterStorage.createCharacter({
        id: "e2e-char-001",
        name: "测试角色",
        description: "E2E测试角色",
        gender: "female",
        style: "写实",
        prompt: "一个穿红裙的女孩",
      });

      const char = await characterStorage.getCharacterById("e2e-char-001");
      expect(char).not.toBeNull();
      expect(char!.name).toBe("测试角色");
      expect(char!.gender).toBe("female");

      await characterStorage.updateCharacter("e2e-char-001", {
        name: "更新角色",
        description: "更新后的描述",
      });

      const updated = await characterStorage.getCharacterById("e2e-char-001");
      expect(updated!.name).toBe("更新角色");
    });

    it("scenes 完整 CRUD 周期", async () => {
      const { sceneStorage } = await import("@/infrastructure/storage/scenes");

      await sceneStorage.createScene({
        id: "e2e-scene-001",
        name: "测试场景",
        description: "E2E测试场景",
        type: "室内",
        mood: "温馨",
        prompt: "一个温暖的客厅",
      });

      const scene = await sceneStorage.getSceneById("e2e-scene-001");
      expect(scene).not.toBeNull();
      expect(scene!.name).toBe("测试场景");
      expect(scene!.type).toBe("室内");

      await sceneStorage.updateScene("e2e-scene-001", {
        name: "更新场景",
        mood: "紧张",
      });

      const updated = await sceneStorage.getSceneById("e2e-scene-001");
      expect(updated!.name).toBe("更新场景");
      expect(updated!.mood).toBe("紧张");
    });

    it("stories 完整 CRUD 周期", async () => {
      const { storyStorage } = await import("@/infrastructure/storage/stories");

      await storyStorage.createStory({
        id: "e2e-story-001",
        title: "测试故事",
        description: "E2E测试故事",
        genre: "action",
        tone: "serious",
        targetDuration: 60,
      });

      const story = await storyStorage.getStoryById("e2e-story-001");
      expect(story).not.toBeNull();
      expect(story!.title).toBe("测试故事");
      expect(story!.genre).toBe("action");

      await storyStorage.updateStory("e2e-story-001", {
        title: "更新故事",
      });

      const updated = await storyStorage.getStoryById("e2e-story-001");
      expect(updated!.title).toBe("更新故事");
    });
  });

  describe("事务完整性", () => {
    it("事务中所有语句应原子执行", () => {
      const results = db.transaction([
        { sql: "INSERT INTO stories (id, title) VALUES (?, ?)", params: ["txn-s1", "事务故事1"] },
        { sql: "INSERT INTO stories (id, title) VALUES (?, ?)", params: ["txn-s2", "事务故事2"] },
      ]);

      expect(results).toHaveLength(2);

      const stories = db.query("SELECT id FROM stories ORDER BY id");
      expect(stories.length).toBe(2);
    });

    it("事务失败应完全回滚", () => {
      expect(() => {
        db.transaction([
          { sql: "INSERT INTO stories (id, title) VALUES (?, ?)", params: ["txn-s3", "会回滚的故事"] },
          { sql: "INSERT INTO nonexistent_table (id) VALUES (?)", params: ["fail"] },
        ]);
      }).toThrow();

      const stories = db.query("SELECT id FROM stories WHERE id = 'txn-s3'");
      expect(stories.length).toBe(0);
    });

    it("并发事务不应互相干扰", async () => {
      const { storyStorage } = await import("@/infrastructure/storage/stories");

      await Promise.all([
        storyStorage.createStory({ id: "concurrent-1", title: "并发1" }),
        storyStorage.createStory({ id: "concurrent-2", title: "并发2" }),
        storyStorage.createStory({ id: "concurrent-3", title: "并发3" }),
      ]);

      const stories = await storyStorage.getStories();
      expect(stories.length).toBe(3);
    });
  });

  describe("数据完整性约束", () => {
    it("更新不存在的 story 应抛出错误", async () => {
      const { storyStorage } = await import("@/infrastructure/storage/stories");

      await expect(
        storyStorage.updateStory("nonexistent-id", { title: "不存在" }),
      ).rejects.toThrow();
    });

    it("更新不存在的 character 应抛出错误", async () => {
      const { characterStorage } = await import("@/infrastructure/storage/characters");

      await expect(
        characterStorage.updateCharacter("nonexistent-id", { name: "不存在" }),
      ).rejects.toThrow();
    });

    it("更新不存在的 video task 应抛出错误", async () => {
      const { videoTaskStorage } = await import("@/infrastructure/storage/video-tasks");

      await expect(
        videoTaskStorage.updateVideoTask("nonexistent-task", { status: "completed" }),
      ).rejects.toThrow();
    });

    it("软删除的记录不应出现在查询结果中", async () => {
      const { videoTaskStorage } = await import("@/infrastructure/storage/video-tasks");

      await videoTaskStorage.createVideoTask({
        taskId: "soft-del-1",
        status: "completed",
        progress: 100,
      });

      await videoTaskStorage.deleteVideoTask("soft-del-1");

      const tasks = await videoTaskStorage.getVideoTasks();
      expect(tasks.find((t) => t.taskId === "soft-del-1")).toBeUndefined();
    });
  });

  describe("状态枚举约束", () => {
    it("video_tasks 只接受合法 status 值", () => {
      const validStatuses = ["pending", "generating", "completed", "failed", "cancelled", "retrying"];
      for (const status of validStatuses) {
        expect(() => {
          db.run(
            "INSERT INTO video_tasks (id, status, created_at) VALUES (?, ?, strftime('%s','now'))",
            [`status-test-${status}`, status],
          );
        }).not.toThrow();
      }
    });

    it("非法 status 在应用层应被 Zod schema 拒绝", async () => {
      const { videoTaskStatusSchema } = await import("@/domain/schemas/api");
      const result = videoTaskStatusSchema.safeParse("invalid_status");
      expect(result.success).toBe(false);
    });
  });

  describe("解析层完整性", () => {
    it("parseVideoTask 应正确映射所有字段", async () => {
      const { videoTaskStorage } = await import("@/infrastructure/storage/video-tasks");

      new Date().toISOString();
      await videoTaskStorage.createVideoTask({
        taskId: "parse-test-1",
        status: "generating",
        progress: 75,
        message: "正在生成",
        providerId: "volcengine",
        providerModelId: "seedance-1.5",
        providerFormat: "mp4",
        prompt: "测试提示词",
        storyId: "story-1",
        storyTitle: "测试故事",
        beatId: "beat-1",
        beatTitle: "第一幕",
      });

      const task = await videoTaskStorage.getVideoTaskById("parse-test-1");
      expect(task).not.toBeNull();
      expect(task!.taskId).toBe("parse-test-1");
      expect(task!.status).toBe("generating");
      expect(task!.progress).toBe(75);
      expect(task!.providerId).toBe("volcengine");
      expect(task!.providerModelId).toBe("seedance-1.5");
      expect(task!.prompt).toBe("测试提示词");
      expect(task!.storyId).toBe("story-1");
      expect(task!.storyTitle).toBe("测试故事");
    });

  });
});
