/**
 * Phase 7 — 内置 executor 单元测试
 *
 * 验证 registerBuiltinExecutors 注册的业务 executor 真实行为：
 * character/scene-extract（LLM 提取）、shot-breakdown（分镜拆解）、
 * consistency-check（VLM 一致性）、style-transfer、video/image-generate、export/render。
 *
 * 依赖（container / shot / video store / story 管线）全部 mock，避免真实网络与存储。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NodeExecutionContext } from "../workflow-executor";

const { mockGenerateText, mockGenerateImage, mockAnalyze, mockCreateTask, mockCheckVisualConsistency, mockGenerateStoryPlan } = vi.hoisted(() => ({
  mockGenerateText: vi.fn(),
  mockGenerateImage: vi.fn(),
  mockAnalyze: vi.fn(),
  mockCreateTask: vi.fn(),
  mockCheckVisualConsistency: vi.fn(),
  mockGenerateStoryPlan: vi.fn(),
}));

vi.mock("@/infrastructure/di", () => ({
  container: {
    textProvider: { generateText: (...args: unknown[]) => mockGenerateText(...args) },
    imageProvider: { generateImage: (...args: unknown[]) => mockGenerateImage(...args) },
    imageApi: { analyze: (...args: unknown[]) => mockAnalyze(...args) },
  },
}));

vi.mock("@/modules/shot", () => ({
  checkVisualConsistency: (...args: unknown[]) => mockCheckVisualConsistency(...args),
}));

vi.mock("@/modules/video/task-management", () => ({
  useVideoTaskStore: { getState: () => ({ createTask: (...args: unknown[]) => mockCreateTask(...args) }) },
}));

vi.mock("@/shared-logic/story", () => ({
  generateStoryPlanWithValidation: (...args: unknown[]) => mockGenerateStoryPlan(...args),
}));

import { registerBuiltinExecutors, getNodeExecutor } from "../workflow-executor";

function makeCtx(
  subtype: string,
  inputs: Record<string, unknown>,
  config: Record<string, unknown> = {},
  signal: AbortSignal = new AbortController().signal,
): NodeExecutionContext {
  return {
    node: { id: "n1", kind: "process", subtype, label: subtype, config, position: { x: 0, y: 0 } },
    inputs,
    signal,
    log: vi.fn(),
  };
}

describe("workflow builtin executors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registerBuiltinExecutors();
  });

  describe("character-extract", () => {
    it("提取角色并返回结构化数组", async () => {
      mockGenerateText.mockResolvedValue({
        success: true,
        data: { text: `[{"name":"主角","description":"勇敢的战士","appearance":"黑发蓝衣"}]` },
      });
      const executor = getNodeExecutor("character-extract")!;
      const output = await executor(makeCtx("character-extract", { text: "小说内容" }));
      expect(output).toEqual({
        characters: [{ name: "主角", description: "勇敢的战士", appearance: "黑发蓝衣" }],
      });
      expect(mockGenerateText).toHaveBeenCalledWith(
        expect.stringContaining("提取主要角色"),
        expect.objectContaining({ taskType: "character_extraction" }),
      );
    });

    it("空文本输入时报错", async () => {
      const executor = getNodeExecutor("character-extract")!;
      await expect(executor(makeCtx("character-extract", {}))).rejects.toThrow("requires text input");
    });

    it("LLM 输出无法解析时报错", async () => {
      mockGenerateText.mockResolvedValue({ success: true, data: { text: "这不是 JSON" } });
      const executor = getNodeExecutor("character-extract")!;
      await expect(executor(makeCtx("character-extract", { text: "x" }))).rejects.toThrow("failed to parse characters");
    });

    it("LLM 调用失败时报错", async () => {
      mockGenerateText.mockResolvedValue({ success: false, error: "network down" });
      const executor = getNodeExecutor("character-extract")!;
      await expect(executor(makeCtx("character-extract", { text: "x" }))).rejects.toThrow("LLM call failed: network down");
    });
  });

  describe("scene-extract", () => {
    it("提取场景并返回结构化数组", async () => {
      mockGenerateText.mockResolvedValue({
        success: true,
        data: { text: `[{"name":"森林","description":"幽暗的森林","type":"outdoor"}]` },
      });
      const executor = getNodeExecutor("scene-extract")!;
      const output = await executor(makeCtx("scene-extract", { text: "小说内容" }));
      expect(output).toEqual({
        scenes: [{ name: "森林", description: "幽暗的森林", type: "outdoor" }],
      });
    });
  });

  describe("shot-breakdown", () => {
    it("调用分镜生成管线并返回 beats", async () => {
      mockGenerateStoryPlan.mockResolvedValue({
        beats: [{ id: "b1", title: "开场", content: "主角出场", duration: 5, type: "action", characterIds: [], description: "" }],
        autoFixedCount: 2,
      });
      const executor = getNodeExecutor("shot-breakdown")!;
      const output = await executor(
        makeCtx("shot-breakdown", { text: "故事文本", characters: [{ name: "主角" }], scenes: [{ name: "森林" }] }),
      );
      expect(output).toEqual({
        beats: [expect.objectContaining({ id: "b1", title: "开场" })],
      });
      expect(mockGenerateStoryPlan).toHaveBeenCalledWith(
        expect.objectContaining({ description: "故事文本" }),
        expect.arrayContaining([expect.objectContaining({ name: "主角" })]),
        expect.arrayContaining([expect.objectContaining({ name: "森林" })]),
        expect.any(Object),
        expect.any(Function),
      );
    });
  });

  describe("consistency-check", () => {
    it("无上游图片时占位放行且不调用 VLM", async () => {
      const executor = getNodeExecutor("consistency-check")!;
      const output = await executor(makeCtx("consistency-check", { text: "prompt" }));
      expect(output).toEqual({ consistency: { passed: true, recommendation: "accept", note: "no image input" } });
      expect(mockCheckVisualConsistency).not.toHaveBeenCalled();
    });

    it("有上游图片时调用 VLM 一致性检查", async () => {
      mockCheckVisualConsistency.mockResolvedValue({
        ok: true,
        value: { passed: true, overallScore: 0.9, characterScores: [], recommendation: "accept" },
      });
      const executor = getNodeExecutor("consistency-check")!;
      const output = await executor(
        makeCtx("consistency-check", {
          images: [{ imageUrl: "https://cdn.com/gen.jpg" }],
          characters: [{ name: "主角", description: "战士" }],
        }),
      );
      expect(output).toEqual({ consistency: { passed: true, overallScore: 0.9, characterScores: [], recommendation: "accept" } });
      expect(mockCheckVisualConsistency).toHaveBeenCalledWith(
        expect.objectContaining({ generatedImageUrl: "https://cdn.com/gen.jpg" }),
      );
    });

    it("VLM 检查失败时抛错", async () => {
      mockCheckVisualConsistency.mockResolvedValue({ ok: false, error: new Error("vision api down") });
      const executor = getNodeExecutor("consistency-check")!;
      await expect(
        executor(makeCtx("consistency-check", { images: [{ imageUrl: "https://cdn.com/gen.jpg" }] })),
      ).rejects.toThrow("Consistency check failed");
    });
  });

  describe("style-transfer", () => {
    it("按配置风格调用 LLM 改写", async () => {
      mockGenerateText.mockResolvedValue({ success: true, data: { text: "改写后的内容" } });
      const executor = getNodeExecutor("style-transfer")!;
      const output = await executor(makeCtx("style-transfer", { text: "原始内容" }, { style: "水墨" }));
      expect(output).toEqual({ text: "改写后的内容" });
      expect(mockGenerateText).toHaveBeenCalledWith(
        expect.stringContaining("「水墨」风格"),
        expect.objectContaining({ taskType: "frame_prompt" }),
      );
    });
  });

  describe("video-generate", () => {
    it("单条文本输入时创建单个任务", async () => {
      mockCreateTask.mockResolvedValue({ taskId: "task-1", status: "pending" });
      const executor = getNodeExecutor("video-generate")!;
      const output = await executor(
        makeCtx("video-generate", { text: "森林里的冒险" }, { modelId: "m1", providerId: "p1" }),
      );
      expect(output).toEqual({ tasks: [{ taskId: "task-1", status: "pending" }] });
      expect(mockCreateTask).toHaveBeenCalledWith(
        "森林里的冒险",
        expect.objectContaining({ modelId: "m1", providerId: "p1" }),
      );
    });

    it("beats 批量输入时为每个 beat 创建任务", async () => {
      mockCreateTask.mockResolvedValue({ taskId: "task-1", status: "pending" });
      const executor = getNodeExecutor("video-generate")!;
      const output = await executor(
        makeCtx("video-generate", {
          beats: [
            { id: "b1", title: "分镜1", content: "主角出场" },
            { id: "b2", title: "分镜2", content: "进入森林" },
          ],
        }),
      );
      expect(mockCreateTask).toHaveBeenCalledTimes(2);
      expect(output).toEqual({
        tasks: [
          { beatId: "b1", taskId: "task-1", status: "pending" },
          { beatId: "b2", taskId: "task-1", status: "pending" },
        ],
      });
    });

    it("无输入时报错", async () => {
      const executor = getNodeExecutor("video-generate")!;
      await expect(executor(makeCtx("video-generate", {}))).rejects.toThrow("requires text or beats input");
    });
  });

  describe("image-generate", () => {
    it("调用 imageProvider 并返回图片", async () => {
      mockGenerateImage.mockResolvedValue({ success: true, data: { imageUrl: "https://cdn.com/img.jpg", prompt: "p" } });
      const executor = getNodeExecutor("image-generate")!;
      const output = await executor(makeCtx("image-generate", { text: "生成一张森林图" }, { modelId: "m1" }));
      expect(output).toEqual({ images: [{ imageUrl: "https://cdn.com/img.jpg", prompt: "p" }] });
      expect(mockGenerateImage).toHaveBeenCalledWith(
        "生成一张森林图",
        "scene",
        expect.objectContaining({ modelId: "m1" }),
      );
    });

    it("生成失败时报错", async () => {
      mockGenerateImage.mockResolvedValue({ success: false, error: "image api down" });
      const executor = getNodeExecutor("image-generate")!;
      await expect(executor(makeCtx("image-generate", { text: "x" }))).rejects.toThrow("Image generation failed");
    });
  });

  describe("export / render", () => {
    it("export 汇总上游输出为 JSON", async () => {
      const executor = getNodeExecutor("export")!;
      const output = await executor(makeCtx("export", { text: "hello" }));
      const exportResult = output as { export: { json: string; size: number; nodeCount: number } };
      expect(exportResult.export.nodeCount).toBe(1);
      expect(exportResult.export.size).toBeGreaterThan(0);
      expect(JSON.parse(exportResult.export.json).outputs.text).toBe("hello");
    });

    it("render 输出上游摘要", async () => {
      const executor = getNodeExecutor("render")!;
      const output = await executor(
        makeCtx("render", { text: "hello", characters: [{ name: "主角" }] }),
      ) as { render: Record<string, unknown> };
      expect(output.render.upstreamCount).toBe(2);
      expect(output.render.text).toBe("hello");
    });
  });
});
