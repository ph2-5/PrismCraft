import { describe, it, expect, vi } from "vitest";
import {
  generateStoryPlanWithValidation,
  type TextGenerationResult,
} from "../story-plan-generator";

describe("story-plan-generator", () => {
  // 构造一个合法的 JSON 数组字符串作为 AI 返回
  function buildValidPlanResponse(): string {
    return JSON.stringify([
      {
        title: "镜1",
        content: "这是一段足够长的内容描述，超过十个字符",
        duration: 5,
        type: "scene",
        shotType: "medium",
        cameraAngle: "eye_level",
        cameraMovement: "static",
      },
      {
        title: "镜2",
        content: "另一段足够长的内容描述，超过十个字符",
        duration: 4,
        type: "action",
        shotType: "close",
        cameraAngle: "low",
        cameraMovement: "push",
      },
    ]);
  }

  function buildInvalidPlanResponse(): string {
    // 缺少 title、内容过短、duration 无效
    return JSON.stringify([
      { content: "短", duration: 0 },
    ]);
  }

  describe("generateStoryPlanWithValidation", () => {
    it("首次成功应不触发重试，retryCount=0", async () => {
      const generateTextFn = vi.fn().mockResolvedValue({
        success: true,
        data: { text: buildValidPlanResponse() },
      });

      const result = await generateStoryPlanWithValidation(
        { title: "测试故事", description: "故事描述", genre: "drama", tone: "neutral", targetDuration: 60 },
        [],
        [],
        { maxRetries: 3 },
        generateTextFn,
      );

      expect(result.retryCount).toBe(0);
      expect(result.beats).toHaveLength(2);
      expect(generateTextFn).toHaveBeenCalledTimes(1);
    });

    it("校验失败时应重试直到成功", async () => {
      let callCount = 0;
      const generateTextFn = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve<TextGenerationResult>({
            success: true,
            data: { text: buildInvalidPlanResponse() },
          });
        }
        return Promise.resolve<TextGenerationResult>({
          success: true,
          data: { text: buildValidPlanResponse() },
        });
      });

      const result = await generateStoryPlanWithValidation(
        { title: "T", description: "D", genre: "drama", tone: "neutral" },
        [],
        [],
        { maxRetries: 5 },
        generateTextFn,
      );

      expect(result.retryCount).toBeGreaterThan(0);
      expect(result.beats).toHaveLength(2);
      expect(generateTextFn).toHaveBeenCalledTimes(2);
    });

    it("AI 返回失败时应被记为错误并触发重试", async () => {
      let callCount = 0;
      const generateTextFn = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve<TextGenerationResult>({
            success: false,
            error: { code: "ERR", message: "AI 服务错误" },
          });
        }
        return Promise.resolve<TextGenerationResult>({
          success: true,
          data: { text: buildValidPlanResponse() },
        });
      });

      const result = await generateStoryPlanWithValidation(
        { title: "T", description: "D" },
        [],
        [],
        { maxRetries: 5 },
        generateTextFn,
      );

      expect(result.beats).toHaveLength(2);
      expect(generateTextFn).toHaveBeenCalledTimes(2);
    });

    it("AI 返回 success 但无 text 应触发重试", async () => {
      let callCount = 0;
      const generateTextFn = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve<TextGenerationResult>({
            success: true,
            data: { text: "" },
          });
        }
        return Promise.resolve<TextGenerationResult>({
          success: true,
          data: { text: buildValidPlanResponse() },
        });
      });

      const result = await generateStoryPlanWithValidation(
        { title: "T" },
        [],
        [],
        { maxRetries: 5 },
        generateTextFn,
      );

      expect(result.beats).toHaveLength(2);
      expect(generateTextFn).toHaveBeenCalledTimes(2);
    });

    it("AI 返回无效 JSON 文本应触发重试", async () => {
      let callCount = 0;
      const generateTextFn = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve<TextGenerationResult>({
            success: true,
            data: { text: "not json at all" },
          });
        }
        return Promise.resolve<TextGenerationResult>({
          success: true,
          data: { text: buildValidPlanResponse() },
        });
      });

      const result = await generateStoryPlanWithValidation(
        { title: "T" },
        [],
        [],
        { maxRetries: 5 },
        generateTextFn,
      );

      expect(result.beats).toHaveLength(2);
      expect(generateTextFn).toHaveBeenCalledTimes(2);
    });

    it("达到 maxRetries 仍未成功应抛出 STORY_PLAN_GENERATION_FAILED", async () => {
      const generateTextFn = vi.fn().mockResolvedValue({
        success: false,
        error: "始终失败",
      });

      await expect(
        generateStoryPlanWithValidation(
          { title: "T" },
          [],
          [],
          { maxRetries: 2 },
          generateTextFn,
        ),
      ).rejects.toThrow(/STORY_PLAN_GENERATION_FAILED/);

      // 总尝试次数 = maxRetries + 1 = 3
      expect(generateTextFn).toHaveBeenCalledTimes(3);
    });

    it("校验失败到 maxRetries 仍未通过时应返回最后一次结果（不抛错）", async () => {
      // 源码逻辑：只有 result.error（AI 失败/解析失败）才会触发 STORY_PLAN_GENERATION_FAILED。
      // 校验错误只触发重试，达到 maxRetries 后会返回最后一次的 beats。
      const generateTextFn = vi.fn().mockResolvedValue({
        success: true,
        data: { text: buildInvalidPlanResponse() },
      });

      const result = await generateStoryPlanWithValidation(
        { title: "T" },
        [],
        [],
        { maxRetries: 1 },
        generateTextFn,
      );

      // 即使校验失败，仍会返回 beats（基于最后一次 raw）
      expect(result.beats).toHaveLength(1);
      expect(result.retryCount).toBeGreaterThan(0);
      expect(result.validationResults.length).toBeGreaterThan(0);
      // 应有校验错误记录
      const lastValidation = result.validationResults[result.validationResults.length - 1];
      expect(lastValidation?.errors.length).toBeGreaterThan(0);
    });

    it("应使用 planPrompt 覆盖默认 prompt 生成", async () => {
      const generateTextFn = vi.fn().mockResolvedValue({
        success: true,
        data: { text: buildValidPlanResponse() },
      });
      const customPrompt = "自定义 prompt 内容";

      await generateStoryPlanWithValidation(
        { title: "T" },
        [],
        [],
        { planPrompt: customPrompt },
        generateTextFn,
      );

      const sentPrompt = generateTextFn.mock.calls[0]?.[0] as string;
      expect(sentPrompt).toContain(customPrompt);
    });

    it("autoFix=true 时应应用 shot params 修复", async () => {
      // 返回一个 duration 异常的 plan，触发 autoFix
      const planWithInvalidDuration = JSON.stringify([
        {
          title: "镜1",
          content: "足够长的内容描述超过十个字符",
          duration: 100, // > 30，会被钳制
          type: "scene",
          shotType: "medium",
        },
      ]);
      const generateTextFn = vi.fn().mockResolvedValue({
        success: true,
        data: { text: planWithInvalidDuration },
      });

      const result = await generateStoryPlanWithValidation(
        { title: "T" },
        [],
        [],
        { autoFix: true, maxRetries: 0 },
        generateTextFn,
      );

      // autoFixedCount 应大于 0
      expect(result.autoFixedCount).toBeGreaterThan(0);
      // 修复后 duration 应为 30
      expect(result.beats[0]?.duration).toBe(30);
    });

    it("autoFix=false 时不应修复 duration", async () => {
      const planWithInvalidDuration = JSON.stringify([
        {
          title: "镜1",
          content: "足够长的内容描述超过十个字符",
          duration: 100,
          type: "scene",
          shotType: "medium",
        },
      ]);
      const generateTextFn = vi.fn().mockResolvedValue({
        success: true,
        data: { text: planWithInvalidDuration },
      });

      const result = await generateStoryPlanWithValidation(
        { title: "T" },
        [],
        [],
        { autoFix: false, maxRetries: 0 },
        generateTextFn,
      );

      // autoFix=false 不应执行 applyShotParamsFixes，duration 保持原值
      expect(result.beats[0]?.duration).toBe(100);
    });

    it("每次重试的 prompt 应包含上一轮校验错误的修正要求", async () => {
      let callCount = 0;
      const generateTextFn = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve<TextGenerationResult>({
            success: true,
            data: { text: buildInvalidPlanResponse() },
          });
        }
        return Promise.resolve<TextGenerationResult>({
          success: true,
          data: { text: buildValidPlanResponse() },
        });
      });

      await generateStoryPlanWithValidation(
        { title: "T" },
        [],
        [],
        { maxRetries: 5 },
        generateTextFn,
      );

      const firstPrompt = generateTextFn.mock.calls[0]?.[0] as string;
      const secondPrompt = generateTextFn.mock.calls[1]?.[0] as string;
      // 第一次调用不应包含修正要求
      expect(firstPrompt).not.toContain("【重要修正要求】");
      // 第二次调用应包含上一轮的校验错误
      expect(secondPrompt).toContain("【重要修正要求】");
    });

    it("应正确传递 maxTokens 和 temperature 参数到 generateTextFn", async () => {
      const generateTextFn = vi.fn().mockResolvedValue({
        success: true,
        data: { text: buildValidPlanResponse() },
      });

      await generateStoryPlanWithValidation(
        { title: "T" },
        [],
        [],
        { maxRetries: 0 },
        generateTextFn,
      );

      const opts = generateTextFn.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(opts.maxTokens).toBe(4000);
      expect(opts.temperature).toBe(0.7);
    });

    it("应支持 characters 和 scenes 参数", async () => {
      const generateTextFn = vi.fn().mockResolvedValue({
        success: true,
        data: { text: buildValidPlanResponse() },
      });

      const characters = [
        { name: "Alice", description: "主角" },
      ];
      const scenes = [
        { name: "森林", type: "outdoor" },
      ];

      await generateStoryPlanWithValidation(
        { title: "T" },
        characters,
        scenes,
        { maxRetries: 0 },
        generateTextFn,
      );

      const prompt = generateTextFn.mock.calls[0]?.[0] as string;
      // 默认 prompt 应包含角色和场景信息
      expect(prompt).toContain("Alice");
      expect(prompt).toContain("森林");
    });

    it("enhancedGeneration 默认为 true 并应传递到 StoryBeat", async () => {
      const generateTextFn = vi.fn().mockResolvedValue({
        success: true,
        data: { text: buildValidPlanResponse() },
      });

      const result = await generateStoryPlanWithValidation(
        { title: "T" },
        [],
        [],
        {}, // 不传 enhancedGeneration
        generateTextFn,
      );

      expect(result.beats[0]?.enhancedGeneration).toBe(true);
    });

    it("fixDetails 应包含分镜标题前缀", async () => {
      // 使用合法 shotType（让 shotInstruction 被填充）+ 非法 duration（触发 autoFix）
      const planWithInvalidDuration = JSON.stringify([
        {
          title: "镜1",
          content: "足够长的内容描述超过十个字符",
          duration: 100, // > 30，触发 fixShotParams 的 autoFix
          type: "scene",
          shotType: "medium",
        },
      ]);
      const generateTextFn = vi.fn().mockResolvedValue({
        success: true,
        data: { text: planWithInvalidDuration },
      });

      const result = await generateStoryPlanWithValidation(
        { title: "T" },
        [],
        [],
        { autoFix: true, maxRetries: 0 },
        generateTextFn,
      );

      // fixDetails 中应包含 [镜1] 前缀（来自 applyShotParamsFixes 的 beat.title）
      expect(result.fixDetails.some((d) => d.startsWith("[镜1]"))).toBe(true);
      expect(result.fixDetails.some((d) => d.includes("duration: 100 → 30"))).toBe(true);
    });

    it("error 为字符串时应使用该字符串作为错误信息", async () => {
      let callCount = 0;
      const generateTextFn = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve<TextGenerationResult>({
            success: false,
            error: "字符串错误信息",
          });
        }
        return Promise.resolve<TextGenerationResult>({
          success: true,
          data: { text: buildValidPlanResponse() },
        });
      });

      const result = await generateStoryPlanWithValidation(
        { title: "T" },
        [],
        [],
        { maxRetries: 5 },
        generateTextFn,
      );

      // 第一次失败应被吞掉并重试，最终成功
      expect(result.beats).toHaveLength(2);
    });

    it("generateTextFn 抛出异常时应被捕获并触发重试", async () => {
      let callCount = 0;
      const generateTextFn = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error("网络异常"));
        }
        return Promise.resolve<TextGenerationResult>({
          success: true,
          data: { text: buildValidPlanResponse() },
        });
      });

      const result = await generateStoryPlanWithValidation(
        { title: "T" },
        [],
        [],
        { maxRetries: 5 },
        generateTextFn,
      );

      // 第一次抛异常被捕获，重试第二次成功
      expect(result.beats).toHaveLength(2);
      expect(generateTextFn).toHaveBeenCalledTimes(2);
    });

    it("默认 maxRetries 应为 5", async () => {
      const generateTextFn = vi.fn().mockResolvedValue({
        success: false,
        error: "always fail",
      });

      await expect(
        generateStoryPlanWithValidation(
          { title: "T" },
          [],
          [],
          {}, // 不传 maxRetries
          generateTextFn,
        ),
      ).rejects.toThrow(/STORY_PLAN_GENERATION_FAILED/);

      // 总尝试次数 = 5 + 1 = 6
      expect(generateTextFn).toHaveBeenCalledTimes(6);
    });
  });
});
