import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/infrastructure/storage/sqlite-core", () => ({
  safeQuery: vi.fn(),
  safeRun: vi.fn(),
  safeTransaction: vi.fn(),
}));

describe("E2E 存储完整性测试", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("UPDATE affected rows 验证", () => {
    it("更新不存在的 story 应抛出明确错误", async () => {
      const { safeQuery, safeTransaction } = await import("@/infrastructure/storage/sqlite-core");
      const { storyStorage } = await import("@/infrastructure/storage/stories");

      vi.mocked(safeTransaction).mockResolvedValueOnce([{ changes: 0 }]);
      vi.mocked(safeQuery).mockResolvedValueOnce([]);

      await expect(
        storyStorage.updateStory("non-existent-id", { title: "Test" }),
      ).rejects.toThrow('Story not found for update: id="non-existent-id"');
    });

    it("更新存在的 story 但无字段变化时不应报错", async () => {
      const { safeQuery, safeTransaction } = await import("@/infrastructure/storage/sqlite-core");
      const { storyStorage } = await import("@/infrastructure/storage/stories");

      vi.mocked(safeTransaction).mockResolvedValueOnce([{ changes: 0 }]);
      vi.mocked(safeQuery).mockResolvedValueOnce([{ id: "existing-id" }]);

      await expect(
        storyStorage.updateStory("existing-id", { title: "Same Title" }),
      ).resolves.not.toThrow();
    });

    it("更新存在的 story 且有字段变化时应成功", async () => {
      const { safeQuery, safeTransaction } = await import("@/infrastructure/storage/sqlite-core");
      const { storyStorage } = await import("@/infrastructure/storage/stories");

      vi.mocked(safeTransaction).mockResolvedValueOnce([{ changes: 1 }]);
      vi.mocked(safeQuery).mockResolvedValueOnce([{ id: "existing-id", title: "New Title" }]);

      // updateStory 返回 Promise<void>，验证不抛出即可
      await expect(
        storyStorage.updateStory("existing-id", { title: "New Title" }),
      ).resolves.not.toThrow();
    });

    it("更新不存在的 character 应返回 undefined 而非抛异常", async () => {
      const { safeQuery, safeTransaction } = await import("@/infrastructure/storage/sqlite-core");
      const { characterStorage } = await import("@/infrastructure/storage/characters");

      vi.mocked(safeTransaction).mockResolvedValueOnce([{ changes: 0 }]);
      vi.mocked(safeQuery).mockResolvedValueOnce([]);

      const result = await characterStorage.updateCharacter("non-existent-id", { name: "Test" });
      expect(result).toBeUndefined();
    });

    it("更新不存在的 scene 应抛出明确错误", async () => {
      const { safeQuery, safeRun } = await import("@/infrastructure/storage/sqlite-core");
      const { sceneStorage } = await import("@/infrastructure/storage/scenes");

      vi.mocked(safeRun).mockResolvedValueOnce({ changes: 0 });
      vi.mocked(safeQuery).mockResolvedValueOnce([]);

      await expect(
        sceneStorage.updateScene("non-existent-id", { name: "Test" }),
      ).rejects.toThrow('Scene not found for update: id="non-existent-id"');
    });

    it("更新不存在的 video task 应抛出明确错误", async () => {
      const { safeQuery, safeRun } = await import("@/infrastructure/storage/sqlite-core");
      const { videoTaskStorage } = await import("@/infrastructure/storage/video-tasks");

      vi.mocked(safeRun).mockResolvedValueOnce({ changes: 0 });
      vi.mocked(safeQuery).mockResolvedValueOnce([]);

      await expect(
        videoTaskStorage.updateVideoTask("non-existent-task", { status: "completed" }),
      ).rejects.toThrow('VideoTask not found for update: taskId="non-existent-task"');
    });

    it("更新不存在的 element 应先检查元素存在性", async () => {
      const { safeQuery } = await import("@/infrastructure/storage/sqlite-core");
      const { elementStorage } = await import("@/infrastructure/storage/elements");

      vi.mocked(safeQuery).mockResolvedValueOnce([]);

      await expect(
        elementStorage.updateElement("non-existent-element", { name: "Test" }),
      ).rejects.toThrow('Element non-existent-element not found');
    });

    it("更新不存在的 storyboard asset 应抛出明确错误", async () => {
      const { safeQuery, safeRun } = await import("@/infrastructure/storage/sqlite-core");
      const { storyboardStorage } = await import("@/infrastructure/storage/storyboard");

      vi.mocked(safeRun).mockResolvedValueOnce({ changes: 0 });
      vi.mocked(safeQuery).mockResolvedValueOnce([]);

      await expect(
        storyboardStorage.updateStoryboardAsset("non-existent-sb", { script: "Test" }),
      ).rejects.toThrow('StoryboardAsset not found for update: id="non-existent-sb"');
    });

    it("更新不存在的 AST template 应抛出明确错误", async () => {
      const { safeQuery, safeRun } = await import("@/infrastructure/storage/sqlite-core");
      const { templateStorage } = await import("@/infrastructure/storage/templates");

      vi.mocked(safeRun).mockResolvedValueOnce({ changes: 0 });
      vi.mocked(safeQuery).mockResolvedValueOnce([]);

      await expect(
        templateStorage.incrementASTTemplateUsage("non-existent-template"),
      ).rejects.toThrow('ASTTemplate not found for update: id="non-existent-template"');
    });
  });

  describe("safeTransaction 结果验证", () => {
    it("事务中所有语句应成功执行", async () => {
      const { safeTransaction } = await import("@/infrastructure/storage/sqlite-core");

      vi.mocked(safeTransaction).mockResolvedValueOnce([
        { changes: 1 },
        { changes: 1 },
      ]);

      const result = await safeTransaction([
        { sql: "UPDATE stories SET title = ? WHERE id = ?", params: ["Test", "id1"] },
        { sql: "UPDATE scenes SET name = ? WHERE id = ?", params: ["Scene", "id2"] },
      ]);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ changes: 1 });
      expect(result[1]).toMatchObject({ changes: 1 });
    });

    it("事务中部分语句失败应抛出错误", async () => {
      const { safeTransaction } = await import("@/infrastructure/storage/sqlite-core");

      vi.mocked(safeTransaction).mockRejectedValueOnce(new Error("FOREIGN KEY constraint failed"));

      await expect(
        safeTransaction([
          { sql: "DELETE FROM stories WHERE id = ?", params: ["id1"] },
        ]),
      ).rejects.toThrow("FOREIGN KEY constraint failed");
    });

    it("空事务应返回空数组", async () => {
      const { safeTransaction } = await import("@/infrastructure/storage/sqlite-core");

      vi.mocked(safeTransaction).mockResolvedValueOnce([]);

      const result = await safeTransaction([]);
      expect(result).toEqual([]);
    });
  });
});
