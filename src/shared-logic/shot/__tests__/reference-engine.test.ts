import { describe, it, expect } from "vitest";
import {
  ReferenceDirection,
  ReferenceContentType,
  validateReference,
  getTargetShot,
  getReferenceVideoUrl,
  buildReferenceDescription,
  type Shot,
} from "../reference-engine";

function makeShot(overrides: Partial<Shot> = {}): Shot {
  return {
    id: "shot-1",
    sequence: 1,
    duration: 5,
    generationResult: { videoUrl: "https://example.com/video.mp4" },
    ...overrides,
  };
}

function makeShotsList(): Shot[] {
  return [
    makeShot({ id: "shot-1", sequence: 1 }),
    makeShot({ id: "shot-2", sequence: 2 }),
    makeShot({ id: "shot-3", sequence: 3 }),
  ];
}

describe("reference-engine", () => {
  describe("ReferenceDirection 常量", () => {
    it("应该导出四种引用方向", () => {
      expect(ReferenceDirection.None).toBe("none");
      expect(ReferenceDirection.Previous).toBe("previous");
      expect(ReferenceDirection.Next).toBe("next");
      expect(ReferenceDirection.Custom).toBe("custom");
    });
  });

  describe("ReferenceContentType 常量", () => {
    it("应该导出四种引用内容类型", () => {
      expect(ReferenceContentType.FullVideo).toBe("full_video");
      expect(ReferenceContentType.LastFrame).toBe("last_frame");
      expect(ReferenceContentType.FirstFrame).toBe("first_frame");
      expect(ReferenceContentType.VideoSegment).toBe("video_segment");
    });
  });

  describe("getTargetShot", () => {
    it("应该返回上一分镜（Previous 方向）", () => {
      const shots = makeShotsList();
      const current = shots[1]!;
      const target = getTargetShot(current, shots, {
        direction: ReferenceDirection.Previous,
      });
      expect(target).toBeDefined();
      expect(target?.id).toBe("shot-1");
    });

    it("当处于第一个分镜时，Previous 方向应返回 undefined", () => {
      const shots = makeShotsList();
      const current = shots[0]!;
      const target = getTargetShot(current, shots, {
        direction: ReferenceDirection.Previous,
      });
      expect(target).toBeUndefined();
    });

    it("应该返回下一分镜（Next 方向）", () => {
      const shots = makeShotsList();
      const current = shots[1]!;
      const target = getTargetShot(current, shots, {
        direction: ReferenceDirection.Next,
      });
      expect(target).toBeDefined();
      expect(target?.id).toBe("shot-3");
    });

    it("当处于最后一个分镜时，Next 方向应返回 undefined", () => {
      const shots = makeShotsList();
      const current = shots[shots.length - 1]!;
      const target = getTargetShot(current, shots, {
        direction: ReferenceDirection.Next,
      });
      expect(target).toBeUndefined();
    });

    it("应该返回自定义目标分镜（Custom 方向）", () => {
      const shots = makeShotsList();
      const current = shots[0]!;
      const target = getTargetShot(current, shots, {
        direction: ReferenceDirection.Custom,
        targetShotId: "shot-3",
      });
      expect(target).toBeDefined();
      expect(target?.id).toBe("shot-3");
    });

    it("Custom 方向但目标 ID 不存在时应返回 undefined", () => {
      const shots = makeShotsList();
      const target = getTargetShot(shots[0]!, shots, {
        direction: ReferenceDirection.Custom,
        targetShotId: "not-exist",
      });
      expect(target).toBeUndefined();
    });

    it("None 方向应返回 undefined", () => {
      const shots = makeShotsList();
      const target = getTargetShot(shots[0]!, shots, {
        direction: ReferenceDirection.None,
      });
      expect(target).toBeUndefined();
    });

    it("空分镜列表时应返回 undefined", () => {
      const target = getTargetShot(
        makeShot(),
        [],
        { direction: ReferenceDirection.Previous },
      );
      expect(target).toBeUndefined();
    });
  });

  describe("validateReference", () => {
    it("应该通过有效引用（Previous + FullVideo）", () => {
      const shots = makeShotsList();
      const result = validateReference(shots[1]!, shots, {
        direction: ReferenceDirection.Previous,
        contentType: ReferenceContentType.FullVideo,
      });
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("目标分镜不存在时应返回无效（Previous 在第一个分镜）", () => {
      const shots = makeShotsList();
      const result = validateReference(shots[0]!, shots, {
        direction: ReferenceDirection.Previous,
        contentType: ReferenceContentType.FullVideo,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Cannot find referenced shot");
    });

    it("被引用分镜未生成视频时应返回无效", () => {
      const shots: Shot[] = [
        { id: "shot-1", sequence: 1 },
        { id: "shot-2", sequence: 2 },
      ];
      const result = validateReference(shots[1]!, shots, {
        direction: ReferenceDirection.Previous,
        contentType: ReferenceContentType.FullVideo,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Referenced shot has not generated video");
    });

    it("Custom 方向但目标分镜不存在时应返回无效", () => {
      const shots = makeShotsList();
      const result = validateReference(shots[0]!, shots, {
        direction: ReferenceDirection.Custom,
        targetShotId: "not-exist",
        contentType: ReferenceContentType.FullVideo,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Referenced shot does not exist");
    });

    it("VideoSegment 类型但未设置 segmentDuration 时应返回无效", () => {
      const shots = makeShotsList();
      const result = validateReference(shots[1]!, shots, {
        direction: ReferenceDirection.Previous,
        contentType: ReferenceContentType.VideoSegment,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Please set reference segment duration");
    });

    it("VideoSegment 类型但 segmentDuration 为 0 时应返回无效", () => {
      const shots = makeShotsList();
      const result = validateReference(shots[1]!, shots, {
        direction: ReferenceDirection.Previous,
        contentType: ReferenceContentType.VideoSegment,
        segmentDuration: 0,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Please set reference segment duration");
    });

    it("VideoSegment 类型但 segmentDuration 超过分镜时长时应返回无效", () => {
      const shots = makeShotsList();
      const result = validateReference(shots[1]!, shots, {
        direction: ReferenceDirection.Previous,
        contentType: ReferenceContentType.VideoSegment,
        segmentDuration: 10,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Reference segment duration cannot exceed shot duration");
    });

    it("VideoSegment 类型且 segmentDuration 合理时应通过", () => {
      const shots = makeShotsList();
      const result = validateReference(shots[1]!, shots, {
        direction: ReferenceDirection.Previous,
        contentType: ReferenceContentType.VideoSegment,
        segmentDuration: 3,
      });
      expect(result.valid).toBe(true);
    });

    it("应该支持 videoGen.videoUrl 作为视频来源", () => {
      const shots: Shot[] = [
        { id: "shot-1", sequence: 1, videoGen: { videoUrl: "url1" } },
        { id: "shot-2", sequence: 2 },
      ];
      const result = validateReference(shots[1]!, shots, {
        direction: ReferenceDirection.Previous,
        contentType: ReferenceContentType.FullVideo,
      });
      expect(result.valid).toBe(true);
    });
  });

  describe("getReferenceVideoUrl", () => {
    it("FullVideo 类型应返回完整视频 URL", () => {
      const shots: Shot[] = [
        {
          id: "shot-1",
          sequence: 1,
          generationResult: { videoUrl: "https://example.com/v1.mp4" },
        },
        { id: "shot-2", sequence: 2 },
      ];
      const url = getReferenceVideoUrl(shots[1]!, shots, {
        direction: ReferenceDirection.Previous,
        contentType: ReferenceContentType.FullVideo,
      });
      expect(url).toBe("https://example.com/v1.mp4");
    });

    it("LastFrame 类型应返回尾帧 URL", () => {
      const shots: Shot[] = [
        {
          id: "shot-1",
          sequence: 1,
          generationResult: {
            videoUrl: "https://example.com/v1.mp4",
            lastFrameUrl: "https://example.com/last.png",
          },
        },
        { id: "shot-2", sequence: 2 },
      ];
      const url = getReferenceVideoUrl(shots[1]!, shots, {
        direction: ReferenceDirection.Previous,
        contentType: ReferenceContentType.LastFrame,
      });
      expect(url).toBe("https://example.com/last.png");
    });

    it("FirstFrame 类型应返回首帧 URL", () => {
      const shots: Shot[] = [
        {
          id: "shot-1",
          sequence: 1,
          generationResult: {
            videoUrl: "https://example.com/v1.mp4",
            firstFrameUrl: "https://example.com/first.png",
          },
        },
        { id: "shot-2", sequence: 2 },
      ];
      const url = getReferenceVideoUrl(shots[1]!, shots, {
        direction: ReferenceDirection.Previous,
        contentType: ReferenceContentType.FirstFrame,
      });
      expect(url).toBe("https://example.com/first.png");
    });

    it("目标分镜不存在时应返回 undefined", () => {
      const shots = makeShotsList();
      const url = getReferenceVideoUrl(shots[0]!, shots, {
        direction: ReferenceDirection.Previous,
        contentType: ReferenceContentType.FullVideo,
      });
      expect(url).toBeUndefined();
    });

    it("目标分镜无视频时应返回 undefined", () => {
      const shots: Shot[] = [
        { id: "shot-1", sequence: 1 },
        { id: "shot-2", sequence: 2 },
      ];
      const url = getReferenceVideoUrl(shots[1]!, shots, {
        direction: ReferenceDirection.Previous,
        contentType: ReferenceContentType.FullVideo,
      });
      expect(url).toBeUndefined();
    });

    it("None 方向应返回 undefined", () => {
      const shots = makeShotsList();
      const url = getReferenceVideoUrl(shots[0]!, shots, {
        direction: ReferenceDirection.None,
        contentType: ReferenceContentType.FullVideo,
      });
      expect(url).toBeUndefined();
    });
  });

  describe("buildReferenceDescription", () => {
    it("应该构建 Previous 方向的描述", () => {
      const shots = makeShotsList();
      const desc = buildReferenceDescription(shots[1]!, shots, {
        direction: ReferenceDirection.Previous,
        contentType: ReferenceContentType.FullVideo,
      });
      expect(desc).toBe("Reference previous shot full video");
    });

    it("应该构建 Next 方向的描述", () => {
      const shots = makeShotsList();
      const desc = buildReferenceDescription(shots[1]!, shots, {
        direction: ReferenceDirection.Next,
        contentType: ReferenceContentType.LastFrame,
      });
      expect(desc).toBe("Reference next shot last frame");
    });

    it("应该构建 Custom 方向的描述（带分镜序号）", () => {
      const shots = makeShotsList();
      const desc = buildReferenceDescription(shots[0]!, shots, {
        direction: ReferenceDirection.Custom,
        targetShotId: "shot-3",
        contentType: ReferenceContentType.FirstFrame,
      });
      expect(desc).toBe("Reference shot 3 first frame");
    });

    it("应该构建 VideoSegment 类型的描述（带时长）", () => {
      const shots = makeShotsList();
      const desc = buildReferenceDescription(shots[1]!, shots, {
        direction: ReferenceDirection.Previous,
        contentType: ReferenceContentType.VideoSegment,
        segmentDuration: 2,
      });
      expect(desc).toBe("Reference previous shot 2s segment");
    });

    it("目标分镜不存在时应返回空字符串", () => {
      const shots = makeShotsList();
      const desc = buildReferenceDescription(shots[0]!, shots, {
        direction: ReferenceDirection.Previous,
        contentType: ReferenceContentType.FullVideo,
      });
      expect(desc).toBe("");
    });
  });
});
