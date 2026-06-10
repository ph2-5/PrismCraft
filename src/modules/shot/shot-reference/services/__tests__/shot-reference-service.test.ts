import { describe, it, expect } from "vitest";
import type { ShotReference, StoryBeat } from "@/domain/schemas";
import {
  validateReference,
  getTargetShot,
  getReferenceVideoUrl,
  buildReferenceDescription,
} from "../shot-reference-service";

const createBeat = (overrides: Partial<StoryBeat> = {}): StoryBeat => ({
  id: "beat-1",
  sequence: 0,
  title: "镜头1",
  description: "描述1",
  content: "内容1",
  duration: 5,
  type: "scene",
  characterIds: [],
  elementIds: [],
  enhancedGeneration: false,
  ...overrides,
});

const createBeats = (): StoryBeat[] => [
  createBeat({ id: "beat-1", sequence: 0, title: "镜头1", description: "描述1" }),
  createBeat({ id: "beat-2", sequence: 1, title: "镜头2", description: "描述2" }),
  createBeat({ id: "beat-3", sequence: 2, title: "镜头3", description: "描述3" }),
];

describe("validateReference", () => {
  it("direction 为 none 时应始终有效", () => {
    const ref: ShotReference = { direction: "none", contentType: "full_video" };
    const result = validateReference(ref, createBeats(), "beat-1");

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it("direction 为 custom 但无 targetShotId 时应报错", () => {
    const ref: ShotReference = { direction: "custom", contentType: "full_video" };
    const result = validateReference(ref, createBeats(), "beat-1");

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("自定义引用必须指定目标镜头");
  });

  it("direction 为 previous 且为第一个镜头时应报错", () => {
    const ref: ShotReference = { direction: "previous", contentType: "full_video" };
    const result = validateReference(ref, createBeats(), "beat-1");

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("第一个镜头无法引用前一个镜头");
  });

  it("direction 为 previous 且为第二个镜头时应有效", () => {
    const ref: ShotReference = { direction: "previous", contentType: "full_video" };
    const result = validateReference(ref, createBeats(), "beat-2");

    expect(result.valid).toBe(true);
  });

  it("direction 为 next 且为最后一个镜头时应报错", () => {
    const ref: ShotReference = { direction: "next", contentType: "full_video" };
    const result = validateReference(ref, createBeats(), "beat-3");

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("最后一个镜头无法引用后一个镜头");
  });

  it("direction 为 next 且为中间镜头时应有效", () => {
    const ref: ShotReference = { direction: "next", contentType: "full_video" };
    const result = validateReference(ref, createBeats(), "beat-1");

    expect(result.valid).toBe(true);
  });

  it("targetShotId 不存在时应报错", () => {
    const ref: ShotReference = {
      direction: "custom",
      targetShotId: "non-existent",
      contentType: "full_video",
    };
    const result = validateReference(ref, createBeats(), "beat-1");

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("目标镜头 non-existent 不存在");
  });

  it("targetShotId 等于 currentBeatId 时应报错", () => {
    const ref: ShotReference = {
      direction: "custom",
      targetShotId: "beat-1",
      contentType: "full_video",
    };
    const result = validateReference(ref, createBeats(), "beat-1");

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("不能引用自身");
  });

  it("contentType 为 video_segment 但 segmentDuration 未设置时应报错", () => {
    const ref: ShotReference = {
      direction: "previous",
      contentType: "video_segment",
    };
    const result = validateReference(ref, createBeats(), "beat-2");

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("视频片段引用必须指定片段时长");
  });

  it("contentType 为 video_segment 且 segmentDuration 为 0 时应报错", () => {
    const ref: ShotReference = {
      direction: "previous",
      contentType: "video_segment",
      segmentDuration: 0,
    };
    const result = validateReference(ref, createBeats(), "beat-2");

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("视频片段引用必须指定片段时长");
  });

  it("contentType 为 video_segment 且 segmentDuration > 0 时应有效", () => {
    const ref: ShotReference = {
      direction: "previous",
      contentType: "video_segment",
      segmentDuration: 3,
    };
    const result = validateReference(ref, createBeats(), "beat-2");

    expect(result.valid).toBe(true);
  });

  it("引用前一镜头末帧但前一镜头无末帧时应警告", () => {
    const beats = createBeats();
    const ref: ShotReference = { direction: "previous", contentType: "last_frame" };
    const result = validateReference(ref, beats, "beat-2");

    expect(result.valid).toBe(true);
    expect(result.warnings).toContain("前一个镜头没有末帧图片，引用可能无效");
  });

  it("引用前一镜头末帧且前一镜头有末帧时不应警告", () => {
    const beats = createBeats();
    beats[0] = { ...beats[0]!,
      framePair: {
        lastFrameUrl: "last.jpg",
        firstFrameUrl: "first.jpg",
        firstFramePrompt: "",
        lastFramePrompt: "",
        generatedAt: new Date().toISOString(),
      },
    };
    const ref: ShotReference = { direction: "previous", contentType: "last_frame" };
    const result = validateReference(ref, beats, "beat-2");

    expect(result.warnings).not.toContain("前一个镜头没有末帧图片，引用可能无效");
  });

  it("引用前一镜头视频但前一镜头无视频时应警告", () => {
    const beats = createBeats();
    const ref: ShotReference = { direction: "previous", contentType: "full_video" };
    const result = validateReference(ref, beats, "beat-2");

    expect(result.valid).toBe(true);
    expect(result.warnings).toContain("前一个镜头没有视频，引用可能无效");
  });

  it("引用前一镜头视频且前一镜头有视频时不应警告", () => {
    const beats = createBeats();
    beats[0] = { ...beats[0]!,
      videoGen: {
        videoUrl: "video.mp4",
        status: "completed",
        generatedAt: new Date().toISOString(),
      },
    };
    const ref: ShotReference = { direction: "previous", contentType: "full_video" };
    const result = validateReference(ref, beats, "beat-2");

    expect(result.warnings).not.toContain("前一个镜头没有视频，引用可能无效");
  });

  it("currentBeatId 不在 beats 中时 direction=next 应报错", () => {
    const ref: ShotReference = { direction: "next", contentType: "full_video" };
    const result = validateReference(ref, createBeats(), "unknown-beat");

    expect(result.valid).toBe(false);
  });

  it("多个错误应同时返回", () => {
    const ref: ShotReference = {
      direction: "custom",
      contentType: "video_segment",
      targetShotId: "beat-1",
    };
    const result = validateReference(ref, createBeats(), "beat-1");

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});

describe("getTargetShot", () => {
  const beats = createBeats();

  it("direction 为 none 时应返回 null", () => {
    const ref: ShotReference = { direction: "none", contentType: "full_video" };
    expect(getTargetShot(ref, beats, "beat-1")).toBeNull();
  });

  it("direction 为 previous 时应返回前一个 beat", () => {
    const ref: ShotReference = { direction: "previous", contentType: "full_video" };
    const target = getTargetShot(ref, beats, "beat-2");
    expect(target).not.toBeNull();
    expect(target!.id).toBe("beat-1");
  });

  it("direction 为 previous 且为第一个 beat 时应返回 null", () => {
    const ref: ShotReference = { direction: "previous", contentType: "full_video" };
    expect(getTargetShot(ref, beats, "beat-1")).toBeNull();
  });

  it("direction 为 next 时应返回后一个 beat", () => {
    const ref: ShotReference = { direction: "next", contentType: "full_video" };
    const target = getTargetShot(ref, beats, "beat-1");
    expect(target).not.toBeNull();
    expect(target!.id).toBe("beat-2");
  });

  it("direction 为 next 且为最后一个 beat 时应返回 null", () => {
    const ref: ShotReference = { direction: "next", contentType: "full_video" };
    expect(getTargetShot(ref, beats, "beat-3")).toBeNull();
  });

  it("direction 为 custom 时应返回目标 beat", () => {
    const ref: ShotReference = {
      direction: "custom",
      targetShotId: "beat-3",
      contentType: "full_video",
    };
    const target = getTargetShot(ref, beats, "beat-1");
    expect(target).not.toBeNull();
    expect(target!.id).toBe("beat-3");
  });

  it("direction 为 custom 但 targetShotId 不存在时应返回 null", () => {
    const ref: ShotReference = {
      direction: "custom",
      targetShotId: "non-existent",
      contentType: "full_video",
    };
    expect(getTargetShot(ref, beats, "beat-1")).toBeNull();
  });

  it("direction 为 custom 但无 targetShotId 时应返回 null", () => {
    const ref: ShotReference = { direction: "custom", contentType: "full_video" };
    expect(getTargetShot(ref, beats, "beat-1")).toBeNull();
  });

  it("currentBeatId 不在 beats 中时 direction=previous 应返回 null", () => {
    const ref: ShotReference = { direction: "previous", contentType: "full_video" };
    expect(getTargetShot(ref, beats, "unknown")).toBeNull();
  });
});

describe("getReferenceVideoUrl", () => {
  it("目标 beat 不存在时应返回 null", () => {
    const ref: ShotReference = { direction: "previous", contentType: "full_video" };
    expect(getReferenceVideoUrl(ref, createBeats(), "beat-1")).toBeNull();
  });

  it("contentType 为 full_video 且有 videoUrl 时应返回 videoUrl", () => {
    const beats = createBeats();
    beats[0] = { ...beats[0]!,
      videoGen: { videoUrl: "video.mp4", status: "completed", generatedAt: new Date().toISOString() },
    };
    const ref: ShotReference = { direction: "previous", contentType: "full_video" };

    expect(getReferenceVideoUrl(ref, beats, "beat-2")).toBe("video.mp4");
  });

  it("contentType 为 full_video 但无 videoUrl 时应返回 null", () => {
    const ref: ShotReference = { direction: "previous", contentType: "full_video" };
    expect(getReferenceVideoUrl(ref, createBeats(), "beat-2")).toBeNull();
  });

  it("contentType 为 last_frame 且有 framePair.lastFrameUrl 时应返回", () => {
    const beats = createBeats();
    beats[0] = { ...beats[0]!,
      framePair: {
        lastFrameUrl: "last.jpg",
        firstFrameUrl: "first.jpg",
        firstFramePrompt: "",
        lastFramePrompt: "",
        generatedAt: new Date().toISOString(),
      },
    };
    const ref: ShotReference = { direction: "previous", contentType: "last_frame" };

    expect(getReferenceVideoUrl(ref, beats, "beat-2")).toBe("last.jpg");
  });

  it("contentType 为 last_frame 无 framePair 但有 keyframe 时应回退", () => {
    const beats = createBeats();
    beats[0] = { ...beats[0]!,
      keyframe: { imageUrl: "keyframe.jpg", prompt: "prompt", generatedAt: new Date().toISOString() },
    };
    const ref: ShotReference = { direction: "previous", contentType: "last_frame" };

    expect(getReferenceVideoUrl(ref, beats, "beat-2")).toBe("keyframe.jpg");
  });

  it("contentType 为 first_frame 且有 framePair.firstFrameUrl 时应返回", () => {
    const beats = createBeats();
    beats[0] = { ...beats[0]!,
      framePair: {
        firstFrameUrl: "first.jpg",
        lastFrameUrl: "last.jpg",
        firstFramePrompt: "",
        lastFramePrompt: "",
        generatedAt: new Date().toISOString(),
      },
    };
    const ref: ShotReference = { direction: "previous", contentType: "first_frame" };

    expect(getReferenceVideoUrl(ref, beats, "beat-2")).toBe("first.jpg");
  });

  it("contentType 为 first_frame 无 framePair 但有 keyframe 时应回退", () => {
    const beats = createBeats();
    beats[0] = { ...beats[0]!,
      keyframe: { imageUrl: "keyframe.jpg", prompt: "prompt", generatedAt: new Date().toISOString() },
    };
    const ref: ShotReference = { direction: "previous", contentType: "first_frame" };

    expect(getReferenceVideoUrl(ref, beats, "beat-2")).toBe("keyframe.jpg");
  });

  it("contentType 为 video_segment 时应返回 videoUrl", () => {
    const beats = createBeats();
    beats[0] = { ...beats[0]!,
      videoGen: { videoUrl: "video.mp4", status: "completed", generatedAt: new Date().toISOString() },
    };
    const ref: ShotReference = { direction: "previous", contentType: "video_segment" };

    expect(getReferenceVideoUrl(ref, beats, "beat-2")).toBe("video.mp4");
  });

  it("contentType 为 video_segment 但无 videoUrl 时应返回 null", () => {
    const ref: ShotReference = { direction: "previous", contentType: "video_segment" };
    expect(getReferenceVideoUrl(ref, createBeats(), "beat-2")).toBeNull();
  });
});

describe("buildReferenceDescription", () => {
  const beats = createBeats();

  it("direction 为 none 时应返回 '无引用'", () => {
    const ref: ShotReference = { direction: "none", contentType: "full_video" };
    expect(buildReferenceDescription(ref, beats, "beat-1")).toBe("无引用");
  });

  it("direction 为 previous 时应包含 '前一镜头'", () => {
    const ref: ShotReference = { direction: "previous", contentType: "full_video" };
    const desc = buildReferenceDescription(ref, beats, "beat-2");
    expect(desc).toContain("前一镜头");
    expect(desc).toContain("完整视频");
  });

  it("direction 为 next 时应包含 '后一镜头'", () => {
    const ref: ShotReference = { direction: "next", contentType: "last_frame" };
    const desc = buildReferenceDescription(ref, beats, "beat-1");
    expect(desc).toContain("后一镜头");
    expect(desc).toContain("末帧图片");
  });

  it("direction 为 custom 时应包含 '自定义镜头'", () => {
    const ref: ShotReference = {
      direction: "custom",
      targetShotId: "beat-3",
      contentType: "first_frame",
    };
    const desc = buildReferenceDescription(ref, beats, "beat-1");
    expect(desc).toContain("自定义镜头");
    expect(desc).toContain("首帧图片");
  });

  it("目标 beat 存在时应包含其标题", () => {
    const ref: ShotReference = { direction: "previous", contentType: "full_video" };
    const desc = buildReferenceDescription(ref, beats, "beat-2");
    expect(desc).toContain("镜头1");
  });

  it("目标 beat 不存在时应显示 '未知镜头'", () => {
    const ref: ShotReference = { direction: "previous", contentType: "full_video" };
    const desc = buildReferenceDescription(ref, beats, "beat-1");
    expect(desc).toContain("未知镜头");
  });

  it("有 segmentDuration 时应包含时长信息", () => {
    const ref: ShotReference = {
      direction: "previous",
      contentType: "video_segment",
      segmentDuration: 3,
    };
    const desc = buildReferenceDescription(ref, beats, "beat-2");
    expect(desc).toContain("3秒");
  });

  it("contentType 为 video_segment 时应包含 '视频片段'", () => {
    const ref: ShotReference = {
      direction: "previous",
      contentType: "video_segment",
      segmentDuration: 2,
    };
    const desc = buildReferenceDescription(ref, beats, "beat-2");
    expect(desc).toContain("视频片段");
  });

  it("目标 beat 无标题但有 description 时应截取前 20 字符", () => {
    const beatsNoTitle = createBeats();
    beatsNoTitle[0] = { ...beatsNoTitle[0]!, title: undefined as string | undefined, description: "这是一段很长的描述内容用来测试截断" };
    const ref: ShotReference = { direction: "previous", contentType: "full_video" };
    const desc = buildReferenceDescription(ref, beatsNoTitle, "beat-2");
    expect(desc).toContain("这是一段很长的描述内容用来测试截断".slice(0, 20));
  });

  it("目标 beat 无标题且无 description 时应显示 '未命名'", () => {
    const beatsNoInfo = createBeats();
    beatsNoInfo[0] = { ...beatsNoInfo[0]!, title: undefined as string | undefined, description: "" };
    const ref: ShotReference = { direction: "previous", contentType: "full_video" };
    const desc = buildReferenceDescription(ref, beatsNoInfo, "beat-2");
    expect(desc).toContain("未命名");
  });
});
