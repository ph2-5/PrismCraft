import { describe, it, expect } from "vitest";
import { flattenBeat, buildBeatInsert } from "../beat-transformer";

const NOW = 1700000000;

describe("flattenBeat", () => {
  it("应将 camera 子字段展平到 cameraContainer", () => {
    const beat: Record<string, unknown> = {
      // PR 2d Step 2：angle/movement 不再写入 cameraContainer，只保留 distance/speed/shotInstruction
      camera: { angle: "low", movement: "pan", distance: "medium", speed: "slow" },
    };
    const result = flattenBeat(beat, NOW);
    expect(result.cameraContainer).toEqual({
      distance: "medium",
      speed: "slow",
    });
  });

  it("应将 keyframe 展平到 generationContainer", () => {
    const beat: Record<string, unknown> = {
      keyframe: { imageUrl: "url", prompt: "p", generatedAt: 1234 },
    };
    const result = flattenBeat(beat, NOW);
    expect(result.generationContainer.keyframeImageUrl).toBe("url");
    expect(result.generationContainer.keyframePrompt).toBe("p");
    expect(result.generationContainer.keyframeGeneratedAt).toBe(1234);
  });

  it("应将 framePair 展平到 generationContainer", () => {
    const beat: Record<string, unknown> = {
      framePair: {
        firstFrame: { imageUrl: "f1", prompt: "p1" },
        lastFrame: { imageUrl: "l1", prompt: "pl1" },
        generatedAt: 5678,
      },
    };
    const result = flattenBeat(beat, NOW);
    expect(result.generationContainer.firstFrameUrl).toBe("f1");
    expect(result.generationContainer.lastFrameUrl).toBe("l1");
    expect(result.generationContainer.firstFramePrompt).toBe("p1");
    expect(result.generationContainer.lastFramePrompt).toBe("pl1");
    expect(result.generationContainer.framePairGeneratedAt).toBe(5678);
  });

  it("应将 videoGen 展平到 generationContainer", () => {
    const beat: Record<string, unknown> = {
      videoGen: { videoUrl: "vurl", taskId: "tid", status: "completed" },
    };
    const result = flattenBeat(beat, NOW);
    expect(result.generationContainer.videoUrl).toBe("vurl");
    expect(result.generationContainer.videoTaskId).toBe("tid");
    expect(result.generationContainer.videoStatus).toBe("completed");
  });

  it("应将 shotType 放入 cameraContainer", () => {
    // PR 2d Step 2：shotType 不再写入 cameraContainer（已被 shotInstruction 替代）
    // 该测试保留以验证旧 shotType 字段不会被误写入 cameraContainer
    const beat: Record<string, unknown> = { shotType: "close_up" };
    const result = flattenBeat(beat, NOW);
    expect(result.cameraContainer.shotType).toBeUndefined();
  });

  it("应将未知字段放入 metaContainer", () => {
    const beat: Record<string, unknown> = {
      uploadedKeyframe: "data:image/png;base64,xxx",
      uploadedVideo: "/local/video.mp4",
      imageUrl: "https://img.jpg",
      videoReferenceUrl: "https://ref.mp4",
    };
    const result = flattenBeat(beat, NOW);
    expect(result.metaContainer).not.toBeNull();
    expect(result.metaContainer!.uploadedKeyframe).toBe("data:image/png;base64,xxx");
    expect(result.metaContainer!.uploadedVideo).toBe("/local/video.mp4");
    expect(result.metaContainer!.imageUrl).toBe("https://img.jpg");
    expect(result.metaContainer!.videoReferenceUrl).toBe("https://ref.mp4");
  });

  it("应将 keyframe 的非标准子字段放入 metaContainer", () => {
    const beat: Record<string, unknown> = {
      keyframe: { imageUrl: "url", prompt: "p", customField: "value" },
    };
    const result = flattenBeat(beat, NOW);
    expect(result.metaContainer).not.toBeNull();
    expect(result.metaContainer!["keyframe.customField"]).toBe("value");
  });

  it("应将 framePair 的非标准子字段放入 metaContainer", () => {
    const beat: Record<string, unknown> = {
      framePair: { firstFrame: { imageUrl: "f1" }, lastFrame: { imageUrl: "l1" }, customData: "val" },
    };
    const result = flattenBeat(beat, NOW);
    expect(result.metaContainer).not.toBeNull();
    expect(result.metaContainer!["framePair.customData"]).toBe("val");
  });

  it("应将 videoGen 的非标准子字段放入 metaContainer", () => {
    const beat: Record<string, unknown> = {
      videoGen: { videoUrl: "url", customProp: "cv" },
    };
    const result = flattenBeat(beat, NOW);
    expect(result.metaContainer).not.toBeNull();
    expect(result.metaContainer!["videoGen.customProp"]).toBe("cv");
  });

  it("应处理空 beat（只有必填字段）", () => {
    const beat: Record<string, unknown> = { description: "test", duration: 5 };
    const result = flattenBeat(beat, NOW);
    expect(result.cameraContainer).toEqual({});
    expect(result.generationContainer.keyframeImageUrl).toBeUndefined();
    expect(result.generationContainer.videoUrl).toBeUndefined();
    expect(result.metaContainer).toBeNull();
  });

  it("应处理全字段 beat", () => {
    const beat: Record<string, unknown> = {
      id: "b1",
      sequence: 0,
      order: 1,
      description: "desc",
      duration: 5,
      type: "action",
      title: "Title",
      content: "Content",
      characterIds: ["c1", "c2"],
      sceneId: "s1",
      shotType: "close_up",
      imageGenerationPrompt: "img prompt",
      firstFramePrompt: "ff prompt",
      lastFramePrompt: "lf prompt",
      firstFramePromptGen: "ffpg",
      lastFramePromptGen: "lfpg",
      enhancedGeneration: true,
      camera: { angle: "low", movement: "pan", distance: "medium", speed: "slow" },
      keyframe: { imageUrl: "kurl", prompt: "kp", generatedAt: 111 },
      framePair: {
        firstFrame: { imageUrl: "ff1", prompt: "ffp1" },
        lastFrame: { imageUrl: "lf1", prompt: "lfp1" },
        generatedAt: 222,
        firstFrameUrl: "ffu",
        lastFrameUrl: "lfu",
      },
      videoGen: { videoUrl: "vurl", taskId: "tid", status: "done" },
      characterOutfits: { "char-1": "outfit-1" },
    };
    const result = flattenBeat(beat, NOW);

    expect(result.cameraContainer).toEqual({
      // PR 2d Step 2：angle/movement/shotType 不再写入，只保留 distance/speed
      distance: "medium",
      speed: "slow",
    });

    expect(result.generationContainer.keyframeImageUrl).toBe("kurl");
    expect(result.generationContainer.keyframePrompt).toBe("kp");
    expect(result.generationContainer.keyframeGeneratedAt).toBe(111);
    expect(result.generationContainer.firstFrameUrl).toBe("ff1");
    expect(result.generationContainer.firstFramePrompt).toBe("ffp1");
    expect(result.generationContainer.lastFrameUrl).toBe("lf1");
    expect(result.generationContainer.lastFramePrompt).toBe("lfp1");
    expect(result.generationContainer.framePairGeneratedAt).toBe(222);
    expect(result.generationContainer.videoUrl).toBe("vurl");
    expect(result.generationContainer.videoTaskId).toBe("tid");
    expect(result.generationContainer.videoStatus).toBe("done");
    expect(result.generationContainer.imageGenerationPrompt).toBe("img prompt");
    expect(result.generationContainer.firstFramePromptGen).toBe("ffpg");
    expect(result.generationContainer.lastFramePromptGen).toBe("lfpg");
    expect(result.generationContainer.enhancedGeneration).toBe(true);
    expect(result.generationContainer.characterOutfits).toEqual({ "char-1": "outfit-1" });

    expect(result.metaContainer).toBeNull();
  });

  it("应处理 uploadedFramePair 对象", () => {
    const beat: Record<string, unknown> = {
      uploadedFramePair: {
        firstFrame: "url1",
        lastFrame: "url2",
        firstFramePrompt: "p1",
        lastFramePrompt: "p2",
      },
    };
    const result = flattenBeat(beat, NOW);
    expect(result.metaContainer).not.toBeNull();
    expect(result.metaContainer!.uploadedFramePair).toEqual({
      firstFrame: "url1",
      lastFrame: "url2",
      firstFramePrompt: "p1",
      lastFramePrompt: "p2",
    });
  });

  it("应处理 characterOutfits", () => {
    const beat: Record<string, unknown> = {
      characterOutfits: { "char-1": "outfit-1" },
    };
    const result = flattenBeat(beat, NOW);
    expect(result.generationContainer.characterOutfits).toEqual({ "char-1": "outfit-1" });
  });

  it("应处理 enhancedGeneration 标志", () => {
    const beat: Record<string, unknown> = { enhancedGeneration: true };
    const result = flattenBeat(beat, NOW);
    expect(result.generationContainer.enhancedGeneration).toBe(true);
  });

  it("应将 local paths 放入 metaContainer（不在 knownKeys 中）", () => {
    const beat: Record<string, unknown> = {
      localVideoPath: "/v.mp4",
      localKeyframePath: "/k.jpg",
      localFirstFramePath: "/f1.jpg",
      localLastFramePath: "/f2.jpg",
    };
    const result = flattenBeat(beat, NOW);
    expect(result.metaContainer).not.toBeNull();
    expect(result.metaContainer!.localVideoPath).toBe("/v.mp4");
    expect(result.metaContainer!.localKeyframePath).toBe("/k.jpg");
    expect(result.metaContainer!.localFirstFramePath).toBe("/f1.jpg");
    expect(result.metaContainer!.localLastFramePath).toBe("/f2.jpg");
  });
});

describe("buildBeatInsert", () => {
  it("应生成正确的 INSERT SQL", () => {
    const beat: Record<string, unknown> = { description: "test" };
    const result = buildBeatInsert("b1", "s1", 0, beat, NOW);
    expect(result.sql).toContain("INSERT INTO story_beats");
    expect(result.sql).toContain("ON CONFLICT(id) DO UPDATE SET");
    expect(result.params).toHaveLength(21);
  });

  it("应正确映射 beat 字段到 SQL 参数", () => {
    const beat: Record<string, unknown> = {
      order: 3,
      title: "My Title",
      content: "My Content",
      description: "My Desc",
      duration: 10,
      type: "action",
      characterIds: ["c1", "c2"],
      sceneId: "scene-1",
    };
    const result = buildBeatInsert("b1", "s1", 0, beat, NOW);

    expect(result.params[0]).toBe("b1");
    expect(result.params[1]).toBe("s1");
    expect(result.params[2]).toBe(0);
    expect(result.params[3]).toBe(3);
    expect(result.params[4]).toBe("My Title");
    expect(result.params[5]).toBe("My Content");
    expect(result.params[6]).toBe("My Desc");
    expect(result.params[7]).toBe(10);
    expect(result.params[8]).toBe("action");
    expect(result.params[10]).toBe("scene-1");
  });

  it("应将 camera/generation/meta 序列化为 JSON", () => {
    // PR 2d Step 2：cameraContainer 不再包含 angle/movement（只有 distance/speed/shotInstruction）
    const beat: Record<string, unknown> = {
      camera: { distance: "medium", speed: "slow" },
      keyframe: { imageUrl: "url", prompt: "p" },
      customField: "value",
    };
    const result = buildBeatInsert("b1", "s1", 0, beat, NOW);

    const cameraParam = result.params[11];
    const generationParam = result.params[12];
    const metaParam = result.params[13];

    expect(typeof cameraParam).toBe("string");
    expect(JSON.parse(cameraParam as string)).toEqual({ distance: "medium", speed: "slow" });

    expect(typeof generationParam).toBe("string");
    const parsedGen = JSON.parse(generationParam as string);
    expect(parsedGen.keyframeImageUrl).toBe("url");
    expect(parsedGen.keyframePrompt).toBe("p");

    expect(typeof metaParam).toBe("string");
    expect(JSON.parse(metaParam as string).customField).toBe("value");
  });

  it("应正确处理 local paths", () => {
    const beat: Record<string, unknown> = {
      localVideoPath: "/v.mp4",
      localKeyframePath: "/k.jpg",
      localFirstFramePath: "/f1.jpg",
      localLastFramePath: "/f2.jpg",
    };
    const result = buildBeatInsert("b1", "s1", 0, beat, NOW);

    expect(result.params[14]).toBe("/v.mp4");
    expect(result.params[15]).toBe("/k.jpg");
    expect(result.params[16]).toBe("/f1.jpg");
    expect(result.params[17]).toBe("/f2.jpg");
  });

  it("应处理 meta 为 null 的情况", () => {
    const beat: Record<string, unknown> = {
      description: "test",
      duration: 5,
    };
    const result = buildBeatInsert("b1", "s1", 0, beat, NOW);
    expect(result.params[13]).toBeNull();
  });
});
