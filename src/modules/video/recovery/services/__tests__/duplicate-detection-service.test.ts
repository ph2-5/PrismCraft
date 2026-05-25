import { describe, it, expect } from "vitest";
import {
  checkForDuplicateVideos,
  findSimilarTasks,
} from "@/modules/video/recovery/services/duplicate-detection-service";
import type { VideoTask } from "@/domain/schemas";

function createMockTask(overrides: Partial<VideoTask> = {}): VideoTask {
  return {
    taskId: "task-1",
    status: "completed",
    progress: 100,
    message: "",
    createdAt: new Date().toISOString(),
    videoUrl: "https://example.com/video.mp4",
    prompt: "a cat walking in the park",
    providerId: "volcengine",
    providerModelId: "model-1",
    ...overrides,
  } as VideoTask;
}

describe("duplicate-detection-service", () => {
  describe("checkForDuplicateVideos", () => {
    it("should return no duplicate when no completed tasks exist", async () => {
      const newTask = { prompt: "a cat" };
      const existingTasks = [
        createMockTask({ status: "failed", videoUrl: undefined }),
      ];

      const result = await checkForDuplicateVideos(newTask, existingTasks);
      expect(result.hasDuplicate).toBe(false);
      expect(result.reason).toContain("没有已完成的任务");
    });

    it("should return no duplicate when prompts are different", async () => {
      const newTask = { prompt: "a dog running on the beach" };
      const existingTasks = [
        createMockTask({ prompt: "a cat walking in the forest", taskId: "existing-1" }),
      ];

      const result = await checkForDuplicateVideos(newTask, existingTasks);
      expect(result.hasDuplicate).toBe(false);
      expect(result.reason).toContain("未发现重复任务");
    });

    it("should detect duplicate when prompts are identical", async () => {
      const newTask = { prompt: "a cat walking in the park" };
      const existingTasks = [
        createMockTask({
          prompt: "a cat walking in the park",
          taskId: "existing-1",
          videoUrl: "https://example.com/existing.mp4",
        }),
      ];

      const result = await checkForDuplicateVideos(newTask, existingTasks);
      expect(result.hasDuplicate).toBe(true);
      expect(result.existingTaskId).toBe("existing-1");
      expect(result.existingVideoUrl).toBe("https://example.com/existing.mp4");
      expect(result.similarity).toBeGreaterThanOrEqual(0.85);
    });

    it("should detect duplicate with same provider and model", async () => {
      const newTask = {
        prompt: "a cat walking in the park slowly",
        providerId: "volcengine",
        providerModelId: "model-1",
      };
      const existingTasks = [
        createMockTask({
          prompt: "a cat walking in the park slowly",
          providerId: "volcengine",
          providerModelId: "model-1",
          taskId: "existing-1",
          videoUrl: "https://example.com/existing.mp4",
        }),
      ];

      const result = await checkForDuplicateVideos(newTask, existingTasks);
      expect(result.hasDuplicate).toBe(true);
    });

    it("should detect duplicate with same fixedImageUrl", async () => {
      const newTask = {
        prompt: "a cat walking",
        fixedImageUrl: "https://example.com/ref.png",
        providerId: "volcengine",
        providerModelId: "model-1",
      };
      const existingTasks = [
        createMockTask({
          prompt: "a cat walking",
          fixedImageUrl: "https://example.com/ref.png",
          providerId: "volcengine",
          providerModelId: "model-1",
          taskId: "existing-1",
          videoUrl: "https://example.com/existing.mp4",
        }),
      ];

      const result = await checkForDuplicateVideos(newTask, existingTasks);
      expect(result.hasDuplicate).toBe(true);
    });

    it("should detect duplicate with same referenceVideoUrl", async () => {
      const newTask = {
        prompt: "a cat walking",
        referenceVideoUrl: "https://example.com/ref.mp4",
        providerId: "volcengine",
        providerModelId: "model-1",
      };
      const existingTasks = [
        createMockTask({
          prompt: "a cat walking",
          referenceVideoUrl: "https://example.com/ref.mp4",
          providerId: "volcengine",
          providerModelId: "model-1",
          taskId: "existing-1",
          videoUrl: "https://example.com/existing.mp4",
        }),
      ];

      const result = await checkForDuplicateVideos(newTask, existingTasks);
      expect(result.hasDuplicate).toBe(true);
    });

    it("should not detect duplicate with different providers", async () => {
      const newTask = {
        prompt: "a cat walking in the park",
        providerId: "kuaishou",
        providerModelId: "model-2",
      };
      const existingTasks = [
        createMockTask({
          prompt: "a cat walking in the park",
          providerId: "volcengine",
          providerModelId: "model-1",
          taskId: "existing-1",
          videoUrl: "https://example.com/existing.mp4",
        }),
      ];

      const result = await checkForDuplicateVideos(newTask, existingTasks);
      expect(result.hasDuplicate).toBe(false);
    });

    it("should include similarity in duplicate reason", async () => {
      const newTask = {
        prompt: "a cat walking in the park",
        providerId: "volcengine",
        providerModelId: "model-1",
      };
      const existingTasks = [
        createMockTask({
          prompt: "a cat walking in the park",
          providerId: "volcengine",
          providerModelId: "model-1",
          taskId: "existing-1",
          videoUrl: "https://example.com/existing.mp4",
        }),
      ];

      const result = await checkForDuplicateVideos(newTask, existingTasks);
      expect(result.reason).toContain("相似度");
      expect(result.reason).toContain("%");
    });

    it("should handle tasks without prompts", async () => {
      const newTask = { providerId: "different-provider" };
      const existingTasks = [
        createMockTask({ prompt: undefined, taskId: "existing-1" }),
      ];

      const result = await checkForDuplicateVideos(newTask, existingTasks);
      expect(result.hasDuplicate).toBe(false);
    });

    it("should handle same parameters", async () => {
      const newTask = {
        prompt: "a cat walking",
        providerId: "volcengine",
        providerModelId: "model-1",
        parameters: { fps: 30, resolution: "1080p" },
      };
      const existingTasks = [
        createMockTask({
          prompt: "a cat walking",
          providerId: "volcengine",
          providerModelId: "model-1",
          parameters: { fps: 30, resolution: "1080p" },
          taskId: "existing-1",
          videoUrl: "https://example.com/existing.mp4",
        }),
      ];

      const result = await checkForDuplicateVideos(newTask, existingTasks);
      expect(result.hasDuplicate).toBe(true);
    });

    it("should handle different parameters", async () => {
      const newTask = {
        prompt: "a cat walking",
        parameters: { fps: 60, resolution: "4k" },
      };
      const existingTasks = [
        createMockTask({
          prompt: "a cat walking",
          parameters: { fps: 30, resolution: "1080p" },
          taskId: "existing-1",
          videoUrl: "https://example.com/existing.mp4",
        }),
      ];

      const result = await checkForDuplicateVideos(newTask, existingTasks);
      expect(result.hasDuplicate).toBe(false);
    });

    it("should handle both parameters undefined", async () => {
      const newTask = { prompt: "a cat walking" };
      const existingTasks = [
        createMockTask({
          prompt: "a cat walking",
          taskId: "existing-1",
          videoUrl: "https://example.com/existing.mp4",
        }),
      ];

      const result = await checkForDuplicateVideos(newTask, existingTasks);
      expect(result.hasDuplicate).toBe(true);
    });

    it("should handle one parameter undefined and other defined", async () => {
      const newTask = { prompt: "a cat walking", parameters: { fps: 30 } };
      const existingTasks = [
        createMockTask({
          prompt: "a cat walking",
          taskId: "existing-1",
          videoUrl: "https://example.com/existing.mp4",
        }),
      ];

      const result = await checkForDuplicateVideos(newTask, existingTasks);
      expect(result.hasDuplicate).toBe(false);
    });

    it("should handle empty parameters", async () => {
      const newTask = { prompt: "a cat walking", parameters: {} };
      const existingTasks = [
        createMockTask({
          prompt: "a cat walking",
          parameters: {},
          taskId: "existing-1",
          videoUrl: "https://example.com/existing.mp4",
        }),
      ];

      const result = await checkForDuplicateVideos(newTask, existingTasks);
      expect(result.hasDuplicate).toBe(true);
    });
  });

  describe("findSimilarTasks", () => {
    it("should return similar tasks sorted by similarity", async () => {
      const task = { prompt: "a cat walking in the park" };
      const allTasks = [
        createMockTask({ prompt: "a cat walking in the park", taskId: "t1" }),
        createMockTask({ prompt: "a dog running on the beach", taskId: "t2" }),
        createMockTask({ prompt: "a cat walking in the garden", taskId: "t3" }),
      ];

      const results = findSimilarTasks(task, allTasks);
      expect(results.length).toBeGreaterThan(0);
      if (results.length >= 2) {
        expect(results[0].similarity).toBeGreaterThanOrEqual(results[1].similarity);
      }
    });

    it("should filter out tasks with low similarity", async () => {
      const task = { prompt: "a cat walking in the park" };
      const allTasks = [
        createMockTask({ prompt: "completely different topic about space", taskId: "t1" }),
      ];

      const results = findSimilarTasks(task, allTasks);
      expect(results.every((r) => r.similarity > 0.3)).toBe(true);
    });

    it("should respect the limit parameter", async () => {
      const task = { prompt: "a cat walking in the park" };
      const allTasks = Array.from({ length: 10 }, (_, i) =>
        createMockTask({ prompt: "a cat walking in the park", taskId: `t${i}` })
      );

      const results = findSimilarTasks(task, allTasks, 3);
      expect(results.length).toBeLessThanOrEqual(3);
    });

    it("should return empty array when no similar tasks", async () => {
      const task = { prompt: "xyz unique content abc" };
      const allTasks = [
        createMockTask({ prompt: "123 completely different 456", taskId: "t1" }),
      ];

      const results = findSimilarTasks(task, allTasks);
      expect(results.every((r) => r.similarity > 0.3)).toBe(true);
    });
  });
});
