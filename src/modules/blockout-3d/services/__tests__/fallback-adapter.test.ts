/**
 * Task 2A.21 — fallback-adapter 单元测试
 *
 * 覆盖核心函数：
 * - adaptToFallbackKeyframes：场景 → 5 时间点关键帧图集
 *   - 无 cameraPath 时使用静态相机生成单帧
 *   - 有 cameraPath 时生成 5 帧（0/0.25/0.5/0.75/1.0）
 *   - sceneDescription 包含灯光/道具/角色信息
 * - validateForFallback：场景验证
 *   - 空场景警告
 *   - 无相机轨迹警告
 *   - 单关键帧警告
 *   - 正常场景通过
 * - fillFramePaths：填充 PNG 帧路径
 * - getFirstFramePath：获取首帧路径
 * - getAllFramePaths：获取所有帧路径
 *
 * 纯数据转换无 Three.js 依赖，可直接在 vitest jsdom 环境运行。
 */

import { describe, it, expect } from "vitest";
import {
  adaptToFallbackKeyframes,
  validateForFallback,
  fillFramePaths,
  getFirstFramePath,
  getAllFramePaths,
} from "../fallback-adapter";
import { createEmptyScene } from "../../domain/scene-schema";
import { createDefaultMannequin } from "../../domain/mannequin-types";
import type { BlockoutScene, PrimitiveShape, CameraKeyframe } from "@/domain/schemas/blockout-scene";

// ============================================================================
// 测试辅助
// ============================================================================

function makeProp(overrides: Partial<PrimitiveShape> = {}): PrimitiveShape {
  return {
    id: "prop-1",
    type: "box",
    position: { x: 0, y: 0, z: 0 },
    rotationY: 0,
    scale: { x: 1, y: 1, z: 1 },
    ...overrides,
  };
}

function makeKeyframe(overrides: Partial<CameraKeyframe> = {}): CameraKeyframe {
  return {
    time: 0,
    position: { x: 5, y: 3, z: 5 },
    target: { x: 0, y: 1, z: 0 },
    interpolation: "linear",
    ...overrides,
  };
}

function makeSceneWithCameraPath(
  keyframeCount: number,
  duration: number,
): BlockoutScene {
  const scene = createEmptyScene("scene-1", "测试场景");
  const keyframes: CameraKeyframe[] = [];
  for (let i = 0; i < keyframeCount; i++) {
    const t = keyframeCount === 1 ? 0 : (duration * i) / (keyframeCount - 1);
    keyframes.push(makeKeyframe({
      time: t,
      position: { x: 5 - i, y: 3, z: 5 - i },
      fov: 50,
      interpolation: "linear",
    }));
  }
  return { ...scene, cameraPath: keyframes };
}

// ============================================================================
// adaptToFallbackKeyframes — 转换核心逻辑
// ============================================================================

describe("adaptToFallbackKeyframes", () => {
  it("无 cameraPath 时生成单帧（使用静态相机）", () => {
    const scene = createEmptyScene("scene-1", "测试场景");
    // scene.camera 是默认值（fov=50, position=(5,3,5), target=(0,1,0)）

    const result = adaptToFallbackKeyframes(scene);

    expect(result.sceneId).toBe("scene-1");
    expect(result.duration).toBe(0);
    expect(result.frames).toHaveLength(1);
    expect(result.frames[0]!.time).toBe(0);
    expect(result.frames[0]!.ratio).toBe(0);
    expect(result.frames[0]!.pose.position).toEqual({ x: 5, y: 3, z: 5 });
    expect(result.frames[0]!.pose.target).toEqual({ x: 0, y: 1, z: 0 });
    expect(result.frames[0]!.pose.fov).toBe(50);
  });

  it("有 cameraPath 时生成 5 帧（0/0.25/0.5/0.75/1.0）", () => {
    const scene = makeSceneWithCameraPath(2, 10);

    const result = adaptToFallbackKeyframes(scene);

    expect(result.frames).toHaveLength(5);
    expect(result.frames[0]!.time).toBe(0);
    expect(result.frames[1]!.time).toBe(2.5);
    expect(result.frames[2]!.time).toBe(5);
    expect(result.frames[3]!.time).toBe(7.5);
    expect(result.frames[4]!.time).toBe(10);

    // 检查 ratio 计算
    expect(result.frames[0]!.ratio).toBe(0);
    expect(result.frames[2]!.ratio).toBe(0.5);
    expect(result.frames[4]!.ratio).toBe(1);
  });

  it("sceneDescription 包含场景名称", () => {
    const scene = createEmptyScene("scene-1", "我的测试场景");

    const result = adaptToFallbackKeyframes(scene);

    expect(result.sceneDescription).toContain("我的测试场景");
  });

  it("sceneDescription 包含灯光类型描述", () => {
    const scene = createEmptyScene("scene-1", "测试场景");
    scene.lighting = { ...scene.lighting, type: "night" };

    const result = adaptToFallbackKeyframes(scene);

    expect(result.sceneDescription).toContain("夜晚");
  });

  it("sceneDescription 包含道具分组统计", () => {
    const scene = createEmptyScene("scene-1", "测试场景");
    scene.props = [
      makeProp({ id: "p1", type: "box" }),
      makeProp({ id: "p2", type: "box" }),
      makeProp({ id: "p3", type: "sphere" }),
    ];

    const result = adaptToFallbackKeyframes(scene);

    expect(result.sceneDescription).toContain("道具：3 个");
    expect(result.sceneDescription).toContain("立方体 x2");
    expect(result.sceneDescription).toContain("球体 x1");
  });

  it("sceneDescription 包含角色列表（含姿势）", () => {
    const scene = createEmptyScene("scene-1", "测试场景");
    scene.characters = [
      createDefaultMannequin("m1", "v1", "主角"),
    ];
    // 主角默认姿势是 standing（站立）

    const result = adaptToFallbackKeyframes(scene);

    expect(result.sceneDescription).toContain("角色：1 个");
    expect(result.sceneDescription).toContain("主角");
    expect(result.sceneDescription).toContain("standing");
  });

  it("sceneDescription 包含运镜时长和关键帧数（有 cameraPath 时）", () => {
    const scene = makeSceneWithCameraPath(3, 12);

    const result = adaptToFallbackKeyframes(scene);

    expect(result.sceneDescription).toContain("运镜时长：12 秒");
    expect(result.sceneDescription).toContain("关键帧数：3");
  });

  it("duration=0 时所有 ratio 为 0（避免除零）", () => {
    const scene = makeSceneWithCameraPath(2, 0);
    // duration=0 时 cameraPath 最后一帧 time=0
    // 但实际 makeSceneWithCameraPath(2, 0) 会让 last.time = 0
    // adaptToFallbackKeyframes 中 duration = cameraPath[last].time = 0

    const result = adaptToFallbackKeyframes(scene);

    for (const frame of result.frames) {
      expect(frame.ratio).toBe(0);
    }
  });

  it("使用 scene.camera.fov 作为默认 FOV（当关键帧未指定 fov 时）", () => {
    const scene = createEmptyScene("scene-1", "测试场景");
    scene.camera = { ...scene.camera, fov: 75 };
    scene.cameraPath = [
      makeKeyframe({ time: 0, fov: undefined }),
      makeKeyframe({ time: 5, fov: undefined }),
    ];

    const result = adaptToFallbackKeyframes(scene);

    for (const frame of result.frames) {
      expect(frame.pose.fov).toBe(75);
    }
  });
});

// ============================================================================
// validateForFallback — 验证逻辑
// ============================================================================

describe("validateForFallback", () => {
  it("空场景（无道具无角色）返回警告", () => {
    const scene = createEmptyScene("scene-1", "测试场景");
    const result = validateForFallback(scene);
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes("场景为空"))).toBe(true);
  });

  it("无 cameraPath 返回警告（仅生成单帧）", () => {
    const scene = createEmptyScene("scene-1", "测试场景");
    scene.characters = [createDefaultMannequin("m1", "v1", "主角")];
    const result = validateForFallback(scene);
    expect(result.warnings.some((w) => w.includes("无相机轨迹"))).toBe(true);
  });

  it("仅 1 个关键帧返回警告（无法表达运镜）", () => {
    const scene = makeSceneWithCameraPath(1, 0);
    scene.characters = [createDefaultMannequin("m1", "v1", "主角")];
    const result = validateForFallback(scene);
    expect(result.warnings.some((w) => w.includes("仅 1 个关键帧"))).toBe(true);
  });

  it("正常场景（有内容 + 多关键帧）无警告", () => {
    const scene = makeSceneWithCameraPath(3, 10);
    scene.characters = [createDefaultMannequin("m1", "v1", "主角")];
    scene.props = [makeProp({ id: "p1", type: "box" })];

    const result = validateForFallback(scene);

    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("errors 始终为空数组（fallback 适配器不阻断）", () => {
    const scene = createEmptyScene("scene-1", "空场景");
    const result = validateForFallback(scene);
    expect(result.errors).toHaveLength(0);
  });
});

// ============================================================================
// fillFramePaths — 帧路径填充
// ============================================================================

describe("fillFramePaths", () => {
  it("按顺序填充每个帧的 framePath", () => {
    const scene = makeSceneWithCameraPath(2, 10);
    const keyframeSet = adaptToFallbackKeyframes(scene);
    const paths = ["/tmp/f0.png", "/tmp/f1.png", "/tmp/f2.png", "/tmp/f3.png", "/tmp/f4.png"];

    const result = fillFramePaths(keyframeSet, paths);

    expect(result.frames).toHaveLength(5);
    expect(result.frames[0]!.framePath).toBe("/tmp/f0.png");
    expect(result.frames[1]!.framePath).toBe("/tmp/f1.png");
    expect(result.frames[4]!.framePath).toBe("/tmp/f4.png");
  });

  it("不修改原 keyframeSet（返回新对象）", () => {
    const scene = makeSceneWithCameraPath(2, 10);
    const keyframeSet = adaptToFallbackKeyframes(scene);
    const originalFrames = keyframeSet.frames.map((f) => f.framePath);

    fillFramePaths(keyframeSet, ["a", "b", "c", "d", "e"]);

    // 原 keyframeSet 的 frames 不变
    expect(keyframeSet.frames.map((f) => f.framePath)).toEqual(originalFrames);
  });

  it("帧数与路径数不匹配时按索引填充（多余的路径忽略）", () => {
    const scene = createEmptyScene("scene-1", "测试场景");
    const keyframeSet = adaptToFallbackKeyframes(scene);
    // 单帧场景 + 多余路径
    expect(keyframeSet.frames).toHaveLength(1);

    const result = fillFramePaths(keyframeSet, ["/tmp/only.png", "/tmp/extra.png"]);

    expect(result.frames[0]!.framePath).toBe("/tmp/only.png");
  });
});

// ============================================================================
// getFirstFramePath / getAllFramePaths
// ============================================================================

describe("getFirstFramePath", () => {
  it("返回首帧路径", () => {
    const scene = makeSceneWithCameraPath(2, 10);
    const keyframeSet = adaptToFallbackKeyframes(scene);
    const filled = fillFramePaths(keyframeSet, [
      "/tmp/first.png", "/tmp/1.png", "/tmp/2.png", "/tmp/3.png", "/tmp/4.png",
    ]);

    expect(getFirstFramePath(filled)).toBe("/tmp/first.png");
  });

  it("未填充路径时返回 undefined", () => {
    const scene = makeSceneWithCameraPath(2, 10);
    const keyframeSet = adaptToFallbackKeyframes(scene);

    expect(getFirstFramePath(keyframeSet)).toBeUndefined();
  });
});

describe("getAllFramePaths", () => {
  it("返回所有已填充的路径", () => {
    const scene = makeSceneWithCameraPath(2, 10);
    const keyframeSet = adaptToFallbackKeyframes(scene);
    const filled = fillFramePaths(keyframeSet, [
      "/tmp/0.png", "/tmp/1.png", "/tmp/2.png", "/tmp/3.png", "/tmp/4.png",
    ]);

    const paths = getAllFramePaths(filled);
    expect(paths).toHaveLength(5);
    expect(paths).toEqual([
      "/tmp/0.png", "/tmp/1.png", "/tmp/2.png", "/tmp/3.png", "/tmp/4.png",
    ]);
  });

  it("过滤掉 undefined 的路径", () => {
    const scene = makeSceneWithCameraPath(2, 10);
    const keyframeSet = adaptToFallbackKeyframes(scene);
    // 部分填充
    keyframeSet.frames[0]!.framePath = "/tmp/0.png";
    keyframeSet.frames[2]!.framePath = "/tmp/2.png";
    // frames[1], [3], [4] 的 framePath 仍为 undefined

    const paths = getAllFramePaths(keyframeSet);
    expect(paths).toHaveLength(2);
    expect(paths).toEqual(["/tmp/0.png", "/tmp/2.png"]);
  });

  it("未填充任何路径时返回空数组", () => {
    const scene = makeSceneWithCameraPath(2, 10);
    const keyframeSet = adaptToFallbackKeyframes(scene);

    expect(getAllFramePaths(keyframeSet)).toEqual([]);
  });
});
