import { describe, it, expect } from "vitest";
import { flattenBeat, buildBeatInsert } from "../beat-transformer";

describe("flattenBeat", () => {
  const now = 1700000000000;

  it("空 beat 返回空容器", () => {
    const result = flattenBeat({}, now);

    expect(result.cameraContainer).toEqual({});
    expect(result.generationContainer).toEqual({});
    expect(result.metaContainer).toBeNull();
  });

  it("keyframe 子对象映射到 generationContainer", () => {
    const beat = {
      keyframe: {
        imageUrl: "https://img.example.com/key.png",
        prompt: "一个角色站在门口",
        generatedAt: 1699999999000,
      },
    };
    const result = flattenBeat(beat, now);

    expect(result.generationContainer.keyframeImageUrl).toBe("https://img.example.com/key.png");
    expect(result.generationContainer.keyframePrompt).toBe("一个角色站在门口");
    expect(result.generationContainer.keyframeGeneratedAt).toBe(1699999999000);
  });

  it("framePair 子对象映射到 generationContainer", () => {
    const beat = {
      framePair: {
        firstFrame: { imageUrl: "https://img.example.com/first.png" },
        lastFrame: { imageUrl: "https://img.example.com/last.png" },
      },
    };
    const result = flattenBeat(beat, now);

    expect(result.generationContainer.firstFrameUrl).toBe("https://img.example.com/first.png");
    expect(result.generationContainer.lastFrameUrl).toBe("https://img.example.com/last.png");
  });

  it("videoGen 子对象映射到 generationContainer", () => {
    const beat = {
      videoGen: {
        videoUrl: "https://video.example.com/clip.mp4",
        taskId: "task-abc-123",
        status: "completed",
      },
    };
    const result = flattenBeat(beat, now);

    expect(result.generationContainer.videoUrl).toBe("https://video.example.com/clip.mp4");
    expect(result.generationContainer.videoTaskId).toBe("task-abc-123");
    expect(result.generationContainer.videoStatus).toBe("completed");
  });

  it("camera 子对象映射到 cameraContainer", () => {
    const beat = {
      camera: {
        angle: "low",
        movement: "pan_left",
      },
    };
    const result = flattenBeat(beat, now);

    expect(result.cameraContainer.angle).toBe("low");
    expect(result.cameraContainer.movement).toBe("pan_left");
  });

  it("snake_case 别名支持", () => {
    const beat = {
      keyframe_image_url: "https://img.example.com/snake.png",
      keyframe_prompt: "蛇形命名提示词",
      keyframe_generated_at: 1699999998000,
      first_frame_url: "https://img.example.com/first-snake.png",
      last_frame_url: "https://img.example.com/last-snake.png",
      video_url: "https://video.example.com/snake.mp4",
      video_task_id: "snake-task-123",
      video_status: "generating",
      camera_angle: "high",
      camera_movement: "tilt",
    };
    const result = flattenBeat(beat, now);

    expect(result.generationContainer.keyframeImageUrl).toBe("https://img.example.com/snake.png");
    expect(result.generationContainer.keyframePrompt).toBe("蛇形命名提示词");
    expect(result.generationContainer.keyframeGeneratedAt).toBe(1699999998000);
    expect(result.generationContainer.firstFrameUrl).toBe("https://img.example.com/first-snake.png");
    expect(result.generationContainer.lastFrameUrl).toBe("https://img.example.com/last-snake.png");
    expect(result.generationContainer.videoUrl).toBe("https://video.example.com/snake.mp4");
    expect(result.generationContainer.videoTaskId).toBe("snake-task-123");
    expect(result.generationContainer.videoStatus).toBe("generating");
    expect(result.cameraContainer.angle).toBe("high");
    expect(result.cameraContainer.movement).toBe("tilt");
  });

  it("enhancedGeneration 布尔值映射到 generationContainer", () => {
    const beatTrue = { enhancedGeneration: true };
    const beatFalse = { enhancedGeneration: false };
    const beatOne = { enhancedGeneration: 1 };
    const beatZero = { enhancedGeneration: 0 };

    expect(flattenBeat(beatTrue, now).generationContainer.enhancedGeneration).toBe(true);
    expect(flattenBeat(beatFalse, now).generationContainer.enhancedGeneration).toBeUndefined();
    expect(flattenBeat(beatOne, now).generationContainer.enhancedGeneration).toBe(true);
    expect(flattenBeat(beatZero, now).generationContainer.enhancedGeneration).toBeUndefined();
  });

  it("characterOutfits 保留在 generationContainer", () => {
    const outfits = { char1: "suit", char2: "dress" };
    const beat = { characterOutfits: outfits };
    const result = flattenBeat(beat, now);

    expect(result.generationContainer.characterOutfits).toEqual(outfits);
  });

  it("createdAt/updatedAt 使用 now 作为默认值", () => {
    const beat = {};
    const result = flattenBeat(beat, now);

    expect(result.createdAt).toBe(now);
    expect(result.updatedAt).toBe(now);
  });

  it("createdAt/updatedAt 优先使用 beat 中的值", () => {
    const beat = { createdAt: 1699999999000, updatedAt: 1699999999001 };
    const result = flattenBeat(beat, now);

    expect(result.createdAt).toBe(1699999999000);
    expect(result.updatedAt).toBe(1699999999001);
  });

  it("createdAt/updatedAt 支持 created_at/updated_at 下划线别名", () => {
    const beat = { created_at: 1699999999000, updated_at: 1699999999001 };
    const result = flattenBeat(beat, now);

    expect(result.createdAt).toBe(1699999999000);
    expect(result.updatedAt).toBe(1699999999001);
  });

  it("额外字段收集到 metaContainer", () => {
    const beat = {
      keyframe: {
        imageUrl: "https://img.example.com/key.png",
        customField: "自定义值",
        anotherExtra: 42,
      },
    };
    const result = flattenBeat(beat, now);

    expect(result.generationContainer.keyframeImageUrl).toBe("https://img.example.com/key.png");
    expect(result.metaContainer).not.toBeNull();
    expect(result.metaContainer!["keyframe.customField"]).toBe("自定义值");
    expect(result.metaContainer!["keyframe.anotherExtra"]).toBe(42);
  });

  it("没有额外字段时 metaContainer 为 null", () => {
    const beat = {
      description: "简单描述",
    };
    const result = flattenBeat(beat, now);

    expect(result.metaContainer).toBeNull();
  });

  it("shotType 映射到 cameraContainer", () => {
    const beat = { shotType: "close_up" };
    const result = flattenBeat(beat, now);

    expect(result.cameraContainer.shotType).toBe("close_up");
  });
});

describe("buildBeatInsert", () => {
  const now = 1700000000000;

  it("返回正确的 SQL 格式", () => {
    const result = buildBeatInsert("beat-1", "story-1", 0, {}, now);

    expect(result.sql).toContain("INSERT OR REPLACE INTO story_beats");
    expect(result.sql).toContain("VALUES");
  });

  it("params 数组长度正确（21个参数）", () => {
    const result = buildBeatInsert("beat-1", "story-1", 0, {}, now);

    expect(result.params).toHaveLength(21);
  });

  it("beatId, storyId, index 正确传递", () => {
    const result = buildBeatInsert("my-beat-id", "my-story-id", 3, {}, now);

    expect(result.params[0]).toBe("my-beat-id");
    expect(result.params[1]).toBe("my-story-id");
    expect(result.params[2]).toBe(3);
  });

  it("characterIds 数组被序列化为 JSON", () => {
    const beat = {
      characterIds: ["char-1", "char-2", "char-3"],
    };
    const result = buildBeatInsert("beat-1", "story-1", 0, beat, now);

    expect(result.params[9]).toBe(JSON.stringify(["char-1", "char-2", "char-3"]));
  });

  it("没有 characterIds 时 character_ids_json 列为 null", () => {
    const result = buildBeatInsert("beat-1", "story-1", 0, {}, now);

    expect(result.params[9]).toBeNull();
  });

  it("beat.order 存在时使用 beat.order 作为 order_num", () => {
    const beat = { order: 7 };
    const result = buildBeatInsert("beat-1", "story-1", 3, beat, now);

    expect(result.params[3]).toBe(7);
  });

  it("beat.order 不存在时使用 index 作为 order_num", () => {
    const result = buildBeatInsert("beat-1", "story-1", 3, {}, now);

    expect(result.params[3]).toBe(3);
  });

  it("camera 容器被序列化为 JSON", () => {
    const beat = { camera: { angle: "low", movement: "pan_left" } };
    const result = buildBeatInsert("beat-1", "story-1", 0, beat, now);

    const camera = JSON.parse(result.params[11] as string);
    expect(camera.angle).toBe("low");
    expect(camera.movement).toBe("pan_left");
  });

  it("generation 容器被序列化为 JSON", () => {
    const beat = { videoGen: { videoUrl: "https://video.example.com/clip.mp4", taskId: "task-1", status: "completed" } };
    const result = buildBeatInsert("beat-1", "story-1", 0, beat, now);

    const generation = JSON.parse(result.params[12] as string);
    expect(generation.videoUrl).toBe("https://video.example.com/clip.mp4");
    expect(generation.videoTaskId).toBe("task-1");
    expect(generation.videoStatus).toBe("completed");
  });

  it("owner_id 默认为 1", () => {
    const result = buildBeatInsert("beat-1", "story-1", 0, {}, now);

    expect(result.params[18]).toBe(1);
  });
});
