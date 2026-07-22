import { describe, it, expect, vi } from "vitest";
import {
  generateBeatKeyframe,
  generateBeatFramePair,
  generateBeatVideo,
  generateBeatFullWorkflow,
  generateKeyframeChain,
  type Beat,
  type ApiGateway,
} from "../storyboard-generation";

describe("storyboard-generation", () => {
  // 创建 mock apiGateway 的辅助函数
  function createMockApiGateway(overrides: Partial<ApiGateway> = {}): ApiGateway {
    return {
      generateKeyframe: vi.fn().mockResolvedValue({
        success: true,
        data: { imageUrl: "https://example.com/keyframe.png", prompt: "kp", generatedAt: "2024-01-01" },
      }),
      generateImage: vi.fn().mockResolvedValue({
        success: true,
        data: { imageUrl: "https://example.com/image.png" },
      }),
      generateFramePair: vi.fn().mockResolvedValue({
        success: true,
        data: {
          firstFrame: { imageUrl: "https://example.com/first.png", prompt: "fp1" },
          lastFrame: { imageUrl: "https://example.com/last.png", prompt: "fp2" },
          generatedAt: 1000,
        },
      }),
      generateVideo: vi.fn().mockResolvedValue({
        success: true,
        data: { taskId: "task-123", videoUrl: "https://example.com/video.mp4", status: "completed" },
      }),
      analyzeImage: vi.fn(),
      videoStatus: vi.fn(),
      ...overrides,
    };
  }

  const baseBeat: Beat = {
    id: "beat-1",
    content: "主角走进房间",
    description: "描述主角走入房间的场景",
    duration: 5,
    shotInstruction: {
      shotSize: "medium",
      cameraAngle: "eye_level",
      cameraMovement: "push",
    },
    enhancedGeneration: true,
    imageGenerationPrompt: "增强生成的 prompt",
    firstFramePrompt: "首帧 prompt",
    lastFramePrompt: "尾帧 prompt",
  };

  describe("generateBeatKeyframe", () => {
    it("成功时应返回 KeyframeResult", async () => {
      const api = createMockApiGateway();
      const result = await generateBeatKeyframe(api, undefined, baseBeat);

      expect(result.imageUrl).toBe("https://example.com/keyframe.png");
      expect(result.prompt).toBe("kp");
      expect(result.generatedAt).toBe("2024-01-01");
    });

    it("存在 prevBeat 时应将 prevKeyframe 传入 API", async () => {
      const api = createMockApiGateway();
      const prevBeat: Beat = {
        id: "beat-prev",
        keyframe: { imageUrl: "https://prev.com/kf.png", prompt: "prev-kp" },
      };

      await generateBeatKeyframe(api, undefined, baseBeat, prevBeat);

      expect(api.generateKeyframe).toHaveBeenCalledWith(
        expect.objectContaining({ prevKeyframe: "https://prev.com/kf.png" }),
      );
    });

    it("referencedPrevKeyframe 应为 prevBeat.id", async () => {
      const api = createMockApiGateway();
      const prevBeat: Beat = {
        id: "beat-prev-id",
        keyframe: { imageUrl: "https://prev.com/kf.png" },
      };

      const result = await generateBeatKeyframe(api, undefined, baseBeat, prevBeat);

      expect(result.referencedPrevKeyframe).toBe("beat-prev-id");
    });

    it("enhancedGeneration=true 时应使用 imageGenerationPrompt", async () => {
      const api = createMockApiGateway();
      await generateBeatKeyframe(api, undefined, baseBeat);

      expect(api.generateKeyframe).toHaveBeenCalledWith(
        expect.objectContaining({ content: "增强生成的 prompt" }),
      );
    });

    it("enhancedGeneration=false 时应使用 beat.content", async () => {
      const api = createMockApiGateway();
      const beat: Beat = { ...baseBeat, enhancedGeneration: false };

      await generateBeatKeyframe(api, undefined, beat);

      expect(api.generateKeyframe).toHaveBeenCalledWith(
        expect.objectContaining({ content: "主角走进房间" }),
      );
    });

    it("content 全部为空白时应抛出 EMPTY_KEYFRAME_CONTENT", async () => {
      const api = createMockApiGateway();
      const beat: Beat = { id: "b", content: "   ", description: "   ", enhancedGeneration: false };

      await expect(generateBeatKeyframe(api, undefined, beat)).rejects.toThrow(
        "EMPTY_KEYFRAME_CONTENT",
      );
      expect(api.generateKeyframe).not.toHaveBeenCalled();
    });

    it("API 返回失败时应抛出格式化的错误", async () => {
      const api = createMockApiGateway({
        generateKeyframe: vi.fn().mockResolvedValue({
          success: false,
          error: "服务器错误",
        }),
      });

      await expect(generateBeatKeyframe(api, undefined, baseBeat)).rejects.toThrow(
        "服务器错误",
      );
    });

    it("API 失败但无 error 字段时应使用 fallback 错误信息", async () => {
      const api = createMockApiGateway({
        generateKeyframe: vi.fn().mockResolvedValue({ success: false }),
      });

      await expect(generateBeatKeyframe(api, undefined, baseBeat)).rejects.toThrow(
        "预览图生成失败",
      );
    });

    it("error 为对象时应使用其 message 字段", async () => {
      const api = createMockApiGateway({
        generateKeyframe: vi.fn().mockResolvedValue({
          success: false,
          error: { code: "ERR", message: "对象错误信息" },
        }),
      });

      await expect(generateBeatKeyframe(api, undefined, baseBeat)).rejects.toThrow(
        "对象错误信息",
      );
    });

    it("应将 characterRef/sceneRef 透传给 API", async () => {
      const api = createMockApiGateway();
      await generateBeatKeyframe(api, undefined, baseBeat, undefined, {
        characterRef: "char-1",
        sceneRef: "scene-1",
      });

      expect(api.generateKeyframe).toHaveBeenCalledWith(
        expect.objectContaining({
          characterRef: "char-1",
          sceneRef: "scene-1",
        }),
      );
    });
  });

  describe("generateBeatFramePair", () => {
    it("beat.keyframe 缺失时应抛出 PREVIEW_REQUIRED_BEFORE_KEYFRAME", async () => {
      const api = createMockApiGateway();
      const beat: Beat = { id: "b", content: "C" };

      await expect(generateBeatFramePair(api, undefined, beat)).rejects.toThrow(
        "PREVIEW_REQUIRED_BEFORE_KEYFRAME",
      );
    });

    it("enhancedGeneration + firstFramePrompt + lastFramePrompt 应使用 generateImage", async () => {
      const api = createMockApiGateway();
      const beat: Beat = {
        ...baseBeat,
        keyframe: { imageUrl: "https://kf.png" },
      };

      const result = await generateBeatFramePair(api, undefined, beat);

      expect(api.generateImage).toHaveBeenCalledTimes(2);
      expect(api.generateFramePair).not.toHaveBeenCalled();
      expect(result.firstFrame.imageUrl).toBe("https://example.com/image.png");
      expect(result.lastFrame.imageUrl).toBe("https://example.com/image.png");
      expect(result.firstFrame.derivedFrom).toBe("https://kf.png");
    });

    it("无 firstFramePrompt/lastFramePrompt 时应使用 generateFramePair API", async () => {
      const api = createMockApiGateway();
      const beat: Beat = {
        ...baseBeat,
        enhancedGeneration: false,
        keyframe: { imageUrl: "https://kf.png", prompt: "kp" },
      };

      const result = await generateBeatFramePair(api, undefined, beat);

      expect(api.generateFramePair).toHaveBeenCalledTimes(1);
      expect(api.generateImage).not.toHaveBeenCalled();
      expect(result.firstFrame.imageUrl).toBe("https://example.com/first.png");
      expect(result.lastFrame.imageUrl).toBe("https://example.com/last.png");
    });

    it("generateImage 失败且无 error 时应使用 fallback 信息", async () => {
      // formatApiError 会优先返回 error 字段；这里不传 error，强制走 fallback
      const api = createMockApiGateway({
        generateImage: vi.fn().mockResolvedValue({
          success: false,
          // 不传 error，触发 fallback 路径
        }),
      });
      const beat: Beat = {
        ...baseBeat,
        keyframe: { imageUrl: "https://kf.png" },
      };

      await expect(generateBeatFramePair(api, undefined, beat)).rejects.toThrow(
        /首帧生成失败|尾帧生成失败/,
      );
    });

    it("generateImage 失败带 error 字符串时应使用该字符串", async () => {
      const api = createMockApiGateway({
        generateImage: vi.fn().mockResolvedValue({
          success: false,
          error: "图片生成失败",
        }),
      });
      const beat: Beat = {
        ...baseBeat,
        keyframe: { imageUrl: "https://kf.png" },
      };

      // formatApiError 会返回 error 字符串而非 fallback，故首尾帧错误都应是 "图片生成失败"
      await expect(generateBeatFramePair(api, undefined, beat)).rejects.toThrow(
        /图片生成失败/,
      );
    });

    it("generateFramePair 失败时应抛出格式化错误", async () => {
      const api = createMockApiGateway({
        generateFramePair: vi.fn().mockResolvedValue({
          success: false,
          error: "帧对生成失败",
        }),
      });
      const beat: Beat = {
        ...baseBeat,
        enhancedGeneration: false,
        keyframe: { imageUrl: "https://kf.png" },
      };

      await expect(generateBeatFramePair(api, undefined, beat)).rejects.toThrow(
        "帧对生成失败",
      );
    });

    it("应支持注入 now 函数生成时间戳", async () => {
      const api = createMockApiGateway();
      const beat: Beat = {
        ...baseBeat,
        keyframe: { imageUrl: "https://kf.png" },
      };
      const fixedNow = 1700000000000;

      const result = await generateBeatFramePair(api, undefined, beat, {
        now: () => fixedNow,
      });

      expect(result.generatedAt).toBe(fixedNow);
    });
  });

  describe("generateBeatVideo", () => {
    it("framePair.firstFrame 缺失时应抛出 FRAME_PAIR_REQUIRED_BEFORE_VIDEO", async () => {
      const api = createMockApiGateway();
      const beat: Beat = { id: "b", content: "C" };

      await expect(generateBeatVideo(api, beat)).rejects.toThrow(
        "FRAME_PAIR_REQUIRED_BEFORE_VIDEO",
      );
    });

    it("成功时应返回 VideoResult", async () => {
      const api = createMockApiGateway();
      const beat: Beat = {
        id: "b",
        content: "视频内容描述",
        duration: 5,
        framePair: {
          firstFrame: { imageUrl: "https://first.png" },
          lastFrame: { imageUrl: "https://last.png" },
        },
      };

      const result = await generateBeatVideo(api, beat);

      expect(result.taskId).toBe("task-123");
      expect(result.videoUrl).toBe("https://example.com/video.mp4");
      expect(result.status).toBe("completed");
    });

    it("API 返回失败时应抛出格式化错误", async () => {
      const api = createMockApiGateway({
        generateVideo: vi.fn().mockResolvedValue({
          success: false,
          error: "视频服务错误",
        }),
      });
      const beat: Beat = {
        id: "b",
        content: "C",
        framePair: { firstFrame: { imageUrl: "https://first.png" } },
      };

      await expect(generateBeatVideo(api, beat)).rejects.toThrow("视频服务错误");
    });

    it("API 返回失败但无 error 时应使用 fallback 错误信息", async () => {
      const api = createMockApiGateway({
        generateVideo: vi.fn().mockResolvedValue({ success: false }),
      });
      const beat: Beat = {
        id: "b",
        content: "C",
        framePair: { firstFrame: { imageUrl: "https://first.png" } },
      };

      await expect(generateBeatVideo(api, beat)).rejects.toThrow("视频生成失败");
    });

    it("prompt 为空时应抛出 EMPTY_VIDEO_PROMPT", async () => {
      const api = createMockApiGateway();
      const beat: Beat = {
        id: "b",
        content: "   ",
        description: "   ",
        framePair: { firstFrame: { imageUrl: "https://first.png" } },
      };

      await expect(generateBeatVideo(api, beat)).rejects.toThrow("EMPTY_VIDEO_PROMPT");
    });

    it("应将 firstFrameUrl 和 lastFrameUrl 透传给 API", async () => {
      const api = createMockApiGateway();
      const beat: Beat = {
        id: "b",
        content: "C",
        duration: 8,
        framePair: {
          firstFrame: { imageUrl: "https://first.png" },
          lastFrame: { imageUrl: "https://last.png" },
        },
      };

      await generateBeatVideo(api, beat);

      expect(api.generateVideo).toHaveBeenCalledWith(
        expect.objectContaining({
          firstFrameUrl: "https://first.png",
          lastFrameUrl: "https://last.png",
          duration: 8,
        }),
      );
    });

    it("status 缺失时应默认为 pending", async () => {
      const api = createMockApiGateway({
        generateVideo: vi.fn().mockResolvedValue({
          success: true,
          data: { taskId: "t1", videoUrl: undefined, status: undefined },
        }),
      });
      const beat: Beat = {
        id: "b",
        content: "C",
        framePair: { firstFrame: { imageUrl: "https://first.png" } },
      };

      const result = await generateBeatVideo(api, beat);

      expect(result.status).toBe("pending");
    });
  });

  describe("generateBeatFullWorkflow", () => {
    it("应按序执行 keyframe → framePair → video", async () => {
      const api = createMockApiGateway();
      const onProgress = vi.fn();
      const beat: Beat = {
        ...baseBeat,
        keyframe: undefined,
        framePair: undefined,
      };

      const result = await generateBeatFullWorkflow(api, undefined, beat, undefined, {
        characterRef: "char-1",
        prompt: "视频 prompt",
      }, onProgress);

      expect(api.generateKeyframe).toHaveBeenCalledTimes(1);
      expect(api.generateImage).toHaveBeenCalledTimes(2); // framePair 路径
      expect(api.generateVideo).toHaveBeenCalledTimes(1);
      expect(result.keyframe.imageUrl).toBeDefined();
      expect(result.framePair.firstFrame.imageUrl).toBeDefined();
      expect(result.videoTaskId).toBe("task-123");
    });

    it("应通过 onProgress 回调报告进度阶段", async () => {
      const api = createMockApiGateway();
      const onProgress = vi.fn();
      const beat: Beat = { ...baseBeat };

      await generateBeatFullWorkflow(api, undefined, beat, undefined, {
        prompt: "p",
      }, onProgress);

      expect(onProgress).toHaveBeenCalledWith("生成预览图", 0.3);
      expect(onProgress).toHaveBeenCalledWith("生成首尾帧", 0.6);
      expect(onProgress).toHaveBeenCalledWith("生成视频", 0.9);
    });

    it("任一步骤失败应中断流程并抛出错误", async () => {
      const api = createMockApiGateway({
        generateKeyframe: vi.fn().mockResolvedValue({
          success: false,
          error: "首步失败",
        }),
      });
      const beat: Beat = { ...baseBeat };

      await expect(
        generateBeatFullWorkflow(api, undefined, beat, undefined, { prompt: "p" }),
      ).rejects.toThrow("首步失败");

      expect(api.generateImage).not.toHaveBeenCalled();
      expect(api.generateVideo).not.toHaveBeenCalled();
    });
  });

  describe("generateKeyframeChain", () => {
    it("应按序处理多个 beat 并返回结果映射", async () => {
      const api = createMockApiGateway();
      const beats: Beat[] = [
        { id: "b1", content: "内容1", enhancedGeneration: false },
        { id: "b2", content: "内容2", enhancedGeneration: false },
        { id: "b3", content: "内容3", enhancedGeneration: false },
      ];

      const result = await generateKeyframeChain(api, undefined, beats, {});

      expect(Object.keys(result)).toEqual(["b1", "b2", "b3"]);
      expect(result.b1.imageUrl).toBe("https://example.com/keyframe.png");
      expect(result.b3.imageUrl).toBe("https://example.com/keyframe.png");
    });

    it("应通过 onProgress 回调报告每个 beat 的进度", async () => {
      const api = createMockApiGateway();
      const beats: Beat[] = [
        { id: "b1", content: "C", enhancedGeneration: false },
        { id: "b2", content: "C", enhancedGeneration: false },
      ];
      const onProgress = vi.fn();

      await generateKeyframeChain(api, undefined, beats, {}, onProgress);

      expect(onProgress).toHaveBeenCalledWith(0, 2, "b1");
      expect(onProgress).toHaveBeenCalledWith(1, 2, "b2");
    });

    it("单个 beat 失败不应中断链式生成", async () => {
      let callCount = 0;
      const api = createMockApiGateway({
        generateKeyframe: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 2) {
            return Promise.resolve({ success: false, error: "中间失败" });
          }
          return Promise.resolve({
            success: true,
            data: { imageUrl: "https://example.com/kf.png" },
          });
        }),
      });
      const beats: Beat[] = [
        { id: "b1", content: "C", enhancedGeneration: false },
        { id: "b2", content: "C", enhancedGeneration: false },
        { id: "b3", content: "C", enhancedGeneration: false },
      ];

      const result = await generateKeyframeChain(api, undefined, beats, {});

      expect(result.b1).toBeDefined();
      expect(result.b2).toBeUndefined();
      expect(result.b3).toBeDefined();
    });

    it("失败时应通过 onFailure 回调报告失败列表", async () => {
      const api = createMockApiGateway({
        generateKeyframe: vi.fn().mockResolvedValue({
          success: false,
          error: "失败",
        }),
      });
      const beats: Beat[] = [
        { id: "b1", content: "C", enhancedGeneration: false },
        { id: "b2", content: "C", enhancedGeneration: false },
      ];
      const onFailure = vi.fn();

      await generateKeyframeChain(api, undefined, beats, { onFailure });

      expect(onFailure).toHaveBeenCalledTimes(1);
      const failures = onFailure.mock.calls[0]?.[0];
      expect(failures).toHaveLength(2);
      expect(failures[0]).toEqual({ beatId: "b1", error: "失败" });
      expect(failures[1]).toEqual({ beatId: "b2", error: "失败" });
    });

    it("全部成功时不应调用 onFailure", async () => {
      const api = createMockApiGateway();
      const onFailure = vi.fn();
      const beats: Beat[] = [
        { id: "b1", content: "C", enhancedGeneration: false },
      ];

      await generateKeyframeChain(api, undefined, beats, { onFailure });

      expect(onFailure).not.toHaveBeenCalled();
    });

    it("应通过 getCharacterRef/getSceneRef 回调解析每个 beat 的引用", async () => {
      const api = createMockApiGateway();
      const beats: Beat[] = [
        { id: "b1", content: "C", enhancedGeneration: false },
        { id: "b2", content: "C", enhancedGeneration: false },
      ];
      const getCharacterRef = vi.fn().mockImplementation((b: Beat) => `char-${b.id}`);
      const getSceneRef = vi.fn().mockImplementation((b: Beat) => `scene-${b.id}`);

      await generateKeyframeChain(api, undefined, beats, {
        getCharacterRef,
        getSceneRef,
        providerId: "prov-1",
        modelId: "model-1",
      });

      expect(getCharacterRef).toHaveBeenCalledWith(beats[0]);
      expect(getCharacterRef).toHaveBeenCalledWith(beats[1]);
      expect(api.generateKeyframe).toHaveBeenCalledWith(
        expect.objectContaining({
          characterRef: "char-b1",
          sceneRef: "scene-b1",
          providerId: "prov-1",
          modelId: "model-1",
        }),
      );
    });

    it("每个 beat 应使用前一个 beat 的 keyframe 作为 prevKeyframe", async () => {
      const api = createMockApiGateway();
      const beats: Beat[] = [
        { id: "b1", content: "C1", enhancedGeneration: false },
        { id: "b2", content: "C2", enhancedGeneration: false },
      ];

      await generateKeyframeChain(api, undefined, beats, {});

      // 第一次调用 prevKeyframe 应为 undefined
      const firstCall = (api.generateKeyframe as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(firstCall.prevKeyframe).toBeUndefined();
      // 第二次调用应使用第一次的结果作为 prevKeyframe
      const secondCall = (api.generateKeyframe as ReturnType<typeof vi.fn>).mock.calls[1]?.[0];
      expect(secondCall.prevKeyframe).toBe("https://example.com/keyframe.png");
    });

    it("空 beats 数组应返回空对象", async () => {
      const api = createMockApiGateway();
      const result = await generateKeyframeChain(api, undefined, [], {});
      expect(result).toEqual({});
      expect(api.generateKeyframe).not.toHaveBeenCalled();
    });
  });
});
