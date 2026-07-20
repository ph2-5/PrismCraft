import { describe, it, expect } from "vitest";
import { flattenBeat, buildBeatInsert } from "../beat-transformer";
import { parseBeatRow } from "../relations";

const now = 1700000000;

function safeParseJson(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function buildMockDbRow(
  beat: Record<string, unknown>,
  beatId: string,
  storyId: string,
  index: number,
) {
  const insert = buildBeatInsert(beatId, storyId, index, beat, now);
  const p = insert.params;
  return {
    id: p[0],
    story_id: p[1],
    sequence: p[2],
    order_num: p[3],
    title: p[4],
    content: p[5],
    description: p[6],
    duration: p[7],
    type: p[8],
    character_ids_json: p[9],
    scene_id: p[10],
    camera: p[11],
    generation: p[12],
    meta: p[13],
    local_video_path: p[14],
    local_keyframe_path: p[15],
    local_first_frame_path: p[16],
    local_last_frame_path: p[17],
    owner_id: p[18],
    created_at: p[19],
    updated_at: p[20],
  };
}

function roundtrip(
  beat: Record<string, unknown>,
  beatId = "beat-1",
  storyId = "story-1",
  index = 0,
) {
  const row = buildMockDbRow(beat, beatId, storyId, index);
  return parseBeatRow(row);
}

describe("StoryBeat 序列化 roundtrip 验证", () => {
  it("全字段 beat 序列化后应包含所有关键信息", () => {
    const beat = {
      sequence: 2,
      order: 2,
      description: "角色站在门口",
      duration: 8,
      type: "action" as const,
      title: "开场",
      content: "详细内容",
      characterIds: ["char-1", "char-2"],
      sceneId: "scene-1",
      shotType: "close",
      imageGenerationPrompt: "图片生成提示词",
      firstFramePrompt: "首帧提示词",
      lastFramePrompt: "末帧提示词",
      enhancedGeneration: true,
      camera: {
        angle: "low",
        movement: "pan_left",
        distance: "medium",
        speed: "slow",
      },
      keyframe: {
        imageUrl: "https://img.example.com/keyframe.png",
        prompt: "关键帧提示词",
        generatedAt: 1699999999000,
      },
      framePair: {
        firstFrame: { imageUrl: "https://img.example.com/first.png" },
        lastFrame: { imageUrl: "https://img.example.com/last.png" },
      },
      videoGen: {
        videoUrl: "https://video.example.com/clip.mp4",
        taskId: "task-abc-123",
        status: "completed",
      },
      characterOutfits: { "char-1": "suit", "char-2": "dress" },
      createdAt: 1699990000000,
      updatedAt: 1699990001000,
    };

    const flat = flattenBeat(beat, now);

    expect(flat.cameraContainer).toEqual({
      angle: "low",
      movement: "pan_left",
      distance: "medium",
      speed: "slow",
      shotType: "close",
    });
    expect(flat.generationContainer.keyframeImageUrl).toBe(
      "https://img.example.com/keyframe.png",
    );
    expect(flat.generationContainer.keyframePrompt).toBe("关键帧提示词");
    expect(flat.generationContainer.keyframeGeneratedAt).toBe(1699999999000);
    expect(flat.generationContainer.firstFrameUrl).toBe(
      "https://img.example.com/first.png",
    );
    expect(flat.generationContainer.lastFrameUrl).toBe(
      "https://img.example.com/last.png",
    );
    expect(flat.generationContainer.videoUrl).toBe(
      "https://video.example.com/clip.mp4",
    );
    expect(flat.generationContainer.videoTaskId).toBe("task-abc-123");
    expect(flat.generationContainer.videoStatus).toBe("completed");
    expect(flat.generationContainer.imageGenerationPrompt).toBe(
      "图片生成提示词",
    );
    expect(flat.generationContainer.firstFramePrompt).toBe("首帧提示词");
    expect(flat.generationContainer.lastFramePrompt).toBe("末帧提示词");
    expect(flat.generationContainer.enhancedGeneration).toBe(true);
    expect(flat.generationContainer.characterOutfits).toEqual({
      "char-1": "suit",
      "char-2": "dress",
    });

    const result = roundtrip(beat, "beat-1", "story-1", 2);
    expect(result.id).toBe("beat-1");
    expect(result.storyId).toBe("story-1");
    expect(result.sequence).toBe(2);
    expect(result.description).toBe("角色站在门口");
    expect(result.duration).toBe(8);
    expect(result.type).toBe("action");
    expect(result.title).toBe("开场");
    expect(result.content).toBe("详细内容");
    expect(result.characterIds).toEqual(["char-1", "char-2"]);
    expect(result.sceneId).toBe("scene-1");
    expect(result.shotType).toBe("close");
    expect(result.enhancedGeneration).toBe(true);
    expect(result.camera).toEqual({
      angle: "low",
      movement: "pan_left",
      distance: "medium",
      speed: "slow",
    });
    expect(result.keyframe).toEqual({
      imageUrl: "https://img.example.com/keyframe.png",
      prompt: "关键帧提示词",
      generatedAt: 1699999999000,
    });
    expect(result.framePair).toEqual({
      firstFrame: {
        imageUrl: "https://img.example.com/first.png",
        prompt: "首帧提示词",
      },
      lastFrame: {
        imageUrl: "https://img.example.com/last.png",
        prompt: "末帧提示词",
      },
      generatedAt: undefined,
    });
    expect(result.videoGen).toEqual({
      taskId: "task-abc-123",
      status: "completed",
      videoUrl: "https://video.example.com/clip.mp4",
    });
  });

  it("最小 beat 序列化后不应丢失必填字段", () => {
    const beat = {
      sequence: 0,
      description: "简单描述",
      duration: 5,
    };

    const flat = flattenBeat(beat, now);

    expect(flat.cameraContainer).toEqual({});
    expect(flat.generationContainer).toEqual({});
    expect(flat.metaContainer).toBeNull();

    const result = roundtrip(beat);
    expect(result.sequence).toBe(0);
    expect(result.description).toBe("简单描述");
    expect(result.duration).toBe(5);
    expect(result.camera).toBeUndefined();
    expect(result.keyframe).toBeUndefined();
    expect(result.framePair).toBeUndefined();
    expect(result.videoGen).toBeUndefined();
    expect(result.characterIds).toEqual([]);
    expect(result.shotType).toBeUndefined();
  });

  it("图片上传字段应存入 meta 容器", () => {
    const beat = {
      sequence: 1,
      description: "带上传字段的 beat",
      duration: 5,
      uploadedKeyframe: true,
      uploadedFramePair: true,
      imageUrl: "https://img.example.com/uploaded.png",
    };

    const flat = flattenBeat(beat, now);

    expect(flat.metaContainer).not.toBeNull();
    expect(flat.metaContainer!["uploadedKeyframe"]).toBe(true);
    expect(flat.metaContainer!["uploadedFramePair"]).toBe(true);
    expect(flat.metaContainer!["imageUrl"]).toBe(
      "https://img.example.com/uploaded.png",
    );

    const result = roundtrip(beat);
    expect(result.uploadedKeyframe).toBe(true);
    expect(result.uploadedFramePair).toBe(true);
    expect(result.imageUrl).toBe("https://img.example.com/uploaded.png");
  });

  it("视频字段应正确分配到 generation 和 meta 容器", () => {
    const beat = {
      sequence: 1,
      description: "带视频字段的 beat",
      duration: 5,
      videoGen: {
        videoUrl: "https://video.example.com/clip.mp4",
        taskId: "task-xyz",
        status: "completed",
      },
      uploadedVideo: true,
      videoReferenceUrl: "https://ref.example.com/video.mp4",
    };

    const flat = flattenBeat(beat, now);

    expect(flat.generationContainer.videoUrl).toBe(
      "https://video.example.com/clip.mp4",
    );
    expect(flat.generationContainer.videoTaskId).toBe("task-xyz");
    expect(flat.generationContainer.videoStatus).toBe("completed");
    expect(flat.metaContainer).not.toBeNull();
    expect(flat.metaContainer!["uploadedVideo"]).toBe(true);
    expect(flat.metaContainer!["videoReferenceUrl"]).toBe(
      "https://ref.example.com/video.mp4",
    );

    const result = roundtrip(beat);
    expect(result.videoGen).toEqual({
      taskId: "task-xyz",
      status: "completed",
      videoUrl: "https://video.example.com/clip.mp4",
    });
    expect(result.uploadedVideo).toBe(true);
    expect(result.videoReferenceUrl).toBe(
      "https://ref.example.com/video.mp4",
    );
  });

  it("部分字段为空的 beat 应正确序列化", () => {
    const beat = {
      sequence: 3,
      description: "只有标题和内容",
      duration: 5,
      title: "场景标题",
      content: "场景内容描述",
    };

    const flat = flattenBeat(beat, now);

    expect(flat.generationContainer).toEqual({});
    expect(flat.metaContainer).toBeNull();

    const result = roundtrip(beat);
    expect(result.title).toBe("场景标题");
    expect(result.content).toBe("场景内容描述");
    expect(result.keyframe).toBeUndefined();
    expect(result.framePair).toBeUndefined();
    expect(result.videoGen).toBeUndefined();
  });

  it("keyframe 嵌套对象的非标准字段应通过 meta 容器保留", () => {
    const beat = {
      sequence: 1,
      description: "带自定义 keyframe 字段",
      duration: 5,
      keyframe: {
        imageUrl: "https://img.example.com/key.png",
        prompt: "关键帧提示词",
        customData: "自定义值",
      },
    };

    const flat = flattenBeat(beat, now);

    expect(flat.generationContainer.keyframeImageUrl).toBe(
      "https://img.example.com/key.png",
    );
    expect(flat.metaContainer).not.toBeNull();
    expect(flat.metaContainer!["keyframe.customData"]).toBe("自定义值");

    const result = roundtrip(beat);
    expect(result.keyframe).toEqual({
      imageUrl: "https://img.example.com/key.png",
      prompt: "关键帧提示词",
      generatedAt: undefined,
      customData: "自定义值",
    });
  });

  it("framePair 嵌套对象的非标准字段应通过 meta 容器保留", () => {
    const beat = {
      sequence: 1,
      description: "带自定义 framePair 字段",
      duration: 5,
      framePair: {
        firstFrame: { imageUrl: "https://img.example.com/first.png" },
        lastFrame: { imageUrl: "https://img.example.com/last.png" },
        extra: "额外数据",
      },
    };

    const flat = flattenBeat(beat, now);

    expect(flat.generationContainer.firstFrameUrl).toBe(
      "https://img.example.com/first.png",
    );
    expect(flat.generationContainer.lastFrameUrl).toBe(
      "https://img.example.com/last.png",
    );
    expect(flat.metaContainer).not.toBeNull();
    expect(flat.metaContainer!["framePair.extra"]).toBe("额外数据");

    const result = roundtrip(beat);
    expect(result.framePair).toBeDefined();
    expect((result.framePair as Record<string, unknown>)?.extra).toBe(
      "额外数据",
    );
  });

  it("local paths 应在 buildBeatInsert 的 SQL 参数中", () => {
    const beat = {
      sequence: 1,
      description: "带本地路径",
      duration: 5,
      localVideoPath: "/videos/clip.mp4",
      localKeyframePath: "/images/keyframe.png",
      localFirstFramePath: "/images/first.png",
      localLastFramePath: "/images/last.png",
    };

    const insert = buildBeatInsert("beat-lp", "story-1", 0, beat, now);

    expect(insert.params[14]).toBe("/videos/clip.mp4");
    expect(insert.params[15]).toBe("/images/keyframe.png");
    expect(insert.params[16]).toBe("/images/first.png");
    expect(insert.params[17]).toBe("/images/last.png");

    const result = roundtrip(beat, "beat-lp", "story-1", 0);
    expect(result.localVideoPath).toBe("/videos/clip.mp4");
    expect(result.localKeyframePath).toBe("/images/keyframe.png");
    expect(result.localFirstFramePath).toBe("/images/first.png");
    expect(result.localLastFramePath).toBe("/images/last.png");
  });

  it("多个 beat 同时序列化应互不干扰", () => {
    const beat1 = {
      sequence: 0,
      description: "第一个 beat",
      duration: 5,
      camera: { angle: "low", movement: "pan_left" },
      keyframe: { imageUrl: "https://img.example.com/beat1.png" },
    };
    const beat2 = {
      sequence: 1,
      description: "第二个 beat",
      duration: 10,
      camera: { angle: "high", movement: "tilt" },
      videoGen: { videoUrl: "https://video.example.com/beat2.mp4", taskId: "task-2", status: "completed" },
    };

    const flat1 = flattenBeat(beat1, now);
    const flat2 = flattenBeat(beat2, now);

    expect(flat1.cameraContainer.angle).toBe("low");
    expect(flat1.cameraContainer.movement).toBe("pan_left");
    expect(flat1.generationContainer.keyframeImageUrl).toBe(
      "https://img.example.com/beat1.png",
    );
    expect(flat1.generationContainer.videoUrl).toBeUndefined();

    expect(flat2.cameraContainer.angle).toBe("high");
    expect(flat2.cameraContainer.movement).toBe("tilt");
    expect(flat2.generationContainer.keyframeImageUrl).toBeUndefined();
    expect(flat2.generationContainer.videoUrl).toBe(
      "https://video.example.com/beat2.mp4",
    );

    const result1 = roundtrip(beat1, "b1", "s1", 0);
    const result2 = roundtrip(beat2, "b2", "s1", 1);

    expect(result1.camera).toEqual({ angle: "low", movement: "pan_left" });
    expect(result1.keyframe).toBeDefined();
    expect(result1.videoGen).toBeUndefined();

    expect(result2.camera).toEqual({ angle: "high", movement: "tilt" });
    expect(result2.keyframe).toBeUndefined();
    expect(result2.videoGen).toBeDefined();
  });

  it("characterOutfits 应存入 generation 容器", () => {
    const outfits = { "char-1": "outfit-1", "char-2": "outfit-2" };
    const beat = {
      sequence: 1,
      description: "带角色服装",
      duration: 5,
      characterOutfits: outfits,
    };

    const flat = flattenBeat(beat, now);

    expect(flat.generationContainer.characterOutfits).toEqual(outfits);

    roundtrip(beat);
    const genContainer = safeParseJson(
      buildMockDbRow(beat, "b1", "s1", 0).generation,
    );
    expect(genContainer?.characterOutfits).toEqual(outfits);
  });

  it("PR 2c: shotInstruction 应存入 camera 容器并正确还原（dual-write + dual-read）", () => {
    const beat = {
      sequence: 1,
      description: "带 shotInstruction 的 beat",
      duration: 5,
      shotType: "close", // 旧字段
      shotInstruction: { // 新字段（dual-write）
        shotSize: "close",
        cameraAngle: "low",
        cameraMovement: "push",
      },
    };

    const flat = flattenBeat(beat, now);

    // 验证 dual-write：camera 容器同时包含 shotType（旧）和 shotInstruction（新）
    expect(flat.cameraContainer.shotType).toBe("close");
    expect(flat.cameraContainer.shotInstruction).toEqual({
      shotSize: "close",
      cameraAngle: "low",
      cameraMovement: "push",
    });

    const result = roundtrip(beat);

    // 验证 dual-read：shotType 和 shotInstruction 都应正确还原
    expect(result.shotType).toBe("close");
    expect(result.shotInstruction).toEqual({
      shotSize: "close",
      cameraAngle: "low",
      cameraMovement: "push",
    });

    // 验证 camera 容器剥离 shotInstruction 后不包含该字段（避免重复）
    expect(result.camera).toBeUndefined();
  });

  it("PR 2c: 仅 shotInstruction（无 shotType）应正确序列化", () => {
    const beat = {
      sequence: 1,
      description: "仅新格式 shotInstruction",
      duration: 5,
      shotInstruction: {
        shotSize: "wide",
        cameraAngle: "eye_level",
        cameraMovement: "static",
      },
    };

    const flat = flattenBeat(beat, now);

    expect(flat.cameraContainer.shotInstruction).toEqual({
      shotSize: "wide",
      cameraAngle: "eye_level",
      cameraMovement: "static",
    });
    expect(flat.cameraContainer.shotType).toBeUndefined();

    const result = roundtrip(beat);
    expect(result.shotInstruction).toEqual({
      shotSize: "wide",
      cameraAngle: "eye_level",
      cameraMovement: "static",
    });
    expect(result.shotType).toBeUndefined();
  });
});
