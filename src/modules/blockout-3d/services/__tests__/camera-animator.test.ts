/**
 * Task 2A.21 — camera-animator 单元测试
 *
 * 覆盖核心函数：
 * - lerp / lerpVec3 / distanceVec3：基础数学工具
 * - arcMidpoint / bezier2：弧线插值控制点
 * - interpolateKeyframes：linear / arc / orbit 三种插值模式
 * - getCameraPoseAtTime：边界处理（空数组/单帧/超时/区间查找）
 * - sampleCameraPoses：均匀采样
 * - sampleKeyframeThumbnails：5 时间点采样
 *
 * 纯函数无 Three.js 依赖，可直接在 vitest jsdom 环境运行。
 */

import { describe, it, expect } from "vitest";
import {
  lerp,
  lerpVec3,
  distanceVec3,
  arcMidpoint,
  bezier2,
  interpolateKeyframes,
  getCameraPoseAtTime,
  sampleCameraPoses,
  sampleKeyframeThumbnails,
} from "../camera-animator";
import type { CameraKeyframe } from "../../domain/camera-path-types";

// ============================================================================
// 测试辅助
// ============================================================================

function makeKeyframe(overrides: Partial<CameraKeyframe> = {}): CameraKeyframe {
  return {
    time: 0,
    position: { x: 0, y: 0, z: 0 },
    target: { x: 0, y: 0, z: 0 },
    interpolation: "linear",
    ...overrides,
  };
}

// ============================================================================
// 基础数学工具
// ============================================================================

describe("lerp", () => {
  it("端点值正确（t=0 返回 a，t=1 返回 b）", () => {
    expect(lerp(0, 100, 0)).toBe(0);
    expect(lerp(0, 100, 1)).toBe(100);
    expect(lerp(0, 100, 0.5)).toBe(50);
  });

  it("支持负数和负方向", () => {
    expect(lerp(10, -10, 0.5)).toBe(0);
    expect(lerp(-5, 5, 0.25)).toBe(-2.5);
  });
});

describe("lerpVec3", () => {
  it("三轴独立插值", () => {
    const a = { x: 0, y: 10, z: -5 };
    const b = { x: 10, y: 20, z: 5 };
    const result = lerpVec3(a, b, 0.5);
    expect(result).toEqual({ x: 5, y: 15, z: 0 });
  });

  it("t=0 时返回 a 的副本（不引用原对象）", () => {
    const a = { x: 1, y: 2, z: 3 };
    const b = { x: 4, y: 5, z: 6 };
    const result = lerpVec3(a, b, 0);
    expect(result).toEqual(a);
    expect(result).not.toBe(a);
  });
});

describe("distanceVec3", () => {
  it("计算两点欧氏距离", () => {
    const a = { x: 0, y: 0, z: 0 };
    const b = { x: 3, y: 4, z: 0 };
    expect(distanceVec3(a, b)).toBe(5);
  });

  it("相同点距离为 0", () => {
    const a = { x: 1.5, y: 2.5, z: -3.5 };
    expect(distanceVec3(a, a)).toBe(0);
  });
});

// ============================================================================
// 弧线工具
// ============================================================================

describe("arcMidpoint", () => {
  it("中点向 target 方向偏移", () => {
    const start = { x: 0, y: 0, z: 0 };
    const end = { x: 10, y: 0, z: 0 };
    const target = { x: 5, y: 5, z: 0 };
    const mid = arcMidpoint(start, end, target, 0.3);
    // 中点 (5,0,0) + 朝 target (5,5,0) 方向偏移 0.3 = (5, 1.5, 0)
    expect(mid.x).toBeCloseTo(5, 5);
    expect(mid.y).toBeCloseTo(1.5, 5);
    expect(mid.z).toBeCloseTo(0, 5);
  });

  it("bend=0 时返回纯中点（无偏移）", () => {
    const start = { x: 0, y: 0, z: 0 };
    const end = { x: 10, y: 10, z: 10 };
    const target = { x: 100, y: 100, z: 100 };
    const mid = arcMidpoint(start, end, target, 0);
    expect(mid).toEqual({ x: 5, y: 5, z: 5 });
  });
});

describe("bezier2", () => {
  it("t=0 返回起点，t=1 返回终点", () => {
    const start = { x: 0, y: 0, z: 0 };
    const control = { x: 5, y: 10, z: 5 };
    const end = { x: 10, y: 0, z: 10 };
    expect(bezier2(start, control, end, 0)).toEqual(start);
    expect(bezier2(start, control, end, 1)).toEqual(end);
  });

  it("t=0.5 时位于控制点附近（贝塞尔曲线中点公式）", () => {
    const start = { x: 0, y: 0, z: 0 };
    const control = { x: 10, y: 10, z: 10 };
    const end = { x: 20, y: 0, z: 20 };
    const mid = bezier2(start, control, end, 0.5);
    // 二阶贝塞尔曲线 t=0.5: 0.25*start + 0.5*control + 0.25*end
    // x = 0.25*0 + 0.5*10 + 0.25*20 = 10
    // y = 0.25*0 + 0.5*10 + 0.25*0 = 5
    // z = 0.25*0 + 0.5*10 + 0.25*20 = 10
    expect(mid.x).toBeCloseTo(10, 5);
    expect(mid.y).toBeCloseTo(5, 5);
    expect(mid.z).toBeCloseTo(10, 5);
  });
});

// ============================================================================
// interpolateKeyframes — 三种插值模式
// ============================================================================

describe("interpolateKeyframes", () => {
  it("linear 模式：直线插值 position 和 target", () => {
    const from = makeKeyframe({
      time: 0,
      position: { x: 0, y: 0, z: 0 },
      target: { x: 0, y: 0, z: 0 },
      fov: 50,
      interpolation: "linear",
    });
    const to = makeKeyframe({
      time: 10,
      position: { x: 10, y: 10, z: 10 },
      target: { x: 5, y: 5, z: 5 },
      fov: 70,
      interpolation: "linear",
    });
    const pose = interpolateKeyframes(from, to, 5);
    expect(pose.position).toEqual({ x: 5, y: 5, z: 5 });
    expect(pose.target).toEqual({ x: 2.5, y: 2.5, z: 2.5 });
    expect(pose.fov).toBe(60);
  });

  it("arc 模式：贝塞尔曲线插值（端点正确）", () => {
    const from = makeKeyframe({
      time: 0,
      position: { x: 0, y: 0, z: 0 },
      target: { x: 0, y: 0, z: 0 },
      fov: 50,
      interpolation: "arc",
    });
    const to = makeKeyframe({
      time: 10,
      position: { x: 10, y: 0, z: 0 },
      target: { x: 5, y: 0, z: 0 },
      fov: 50,
      interpolation: "linear",
    });
    // t=0 时返回起点
    const startPose = interpolateKeyframes(from, to, 0);
    expect(startPose.position.x).toBeCloseTo(0, 5);
    // t=10 时返回终点
    const endPose = interpolateKeyframes(from, to, 10);
    expect(endPose.position.x).toBeCloseTo(10, 5);
  });

  it("orbit 模式：环绕 target 旋转（半径保持）", () => {
    const target = { x: 0, y: 0, z: 0 };
    const from = makeKeyframe({
      time: 0,
      position: { x: 5, y: 0, z: 0 },
      target,
      fov: 50,
      interpolation: "orbit",
    });
    const to = makeKeyframe({
      time: 5,
      position: { x: -5, y: 0, z: 0 },
      target,
      fov: 50,
      interpolation: "linear",
    });
    // 半径 = 5（from.position 到 from.target 的 3D 距离）
    const pose = interpolateKeyframes(from, to, 2.5);
    const radius = Math.sqrt(pose.position.x ** 2 + pose.position.z ** 2);
    expect(radius).toBeCloseTo(5, 2);
    // 中点应该是绕到 z 方向（顺时针或逆时针最短路径）
    // from: angle = atan2(0-0, 5-0) = 0；to: angle = atan2(0-0, -5-0) = π
    // 中点 angle = π/2，position = (0, 0, 5) 或 (0, 0, -5)
    expect(Math.abs(pose.position.x)).toBeCloseTo(0, 5);
    expect(pose.position.y).toBe(0);
  });

  it("span<=0 时 t=0（避免除零）", () => {
    const from = makeKeyframe({ time: 5, fov: 50 });
    const to = makeKeyframe({ time: 5, fov: 60 });
    const pose = interpolateKeyframes(from, to, 5);
    // span=0 时 t=0，返回 from 值
    expect(pose.fov).toBe(50);
  });

  it("fov 缺失时回退到默认值 50", () => {
    const from = makeKeyframe({ time: 0, fov: undefined, interpolation: "linear" });
    const to = makeKeyframe({ time: 10, fov: undefined, interpolation: "linear" });
    const pose = interpolateKeyframes(from, to, 5);
    expect(pose.fov).toBe(50);
  });
});

// ============================================================================
// getCameraPoseAtTime — 边界处理
// ============================================================================

describe("getCameraPoseAtTime", () => {
  it("空关键帧数组返回原点默认位姿", () => {
    const pose = getCameraPoseAtTime([], 5);
    expect(pose.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(pose.target).toEqual({ x: 0, y: 0, z: 0 });
    expect(pose.fov).toBe(50);
  });

  it("空数组时使用传入的 defaultFov", () => {
    const pose = getCameraPoseAtTime([], 0, 75);
    expect(pose.fov).toBe(75);
  });

  it("单关键帧始终返回首帧位姿", () => {
    const kfs = [makeKeyframe({
      time: 0,
      position: { x: 1, y: 2, z: 3 },
      target: { x: 4, y: 5, z: 6 },
      fov: 65,
    })];
    const pose = getCameraPoseAtTime(kfs, 100);
    expect(pose.position).toEqual({ x: 1, y: 2, z: 3 });
    expect(pose.fov).toBe(65);
  });

  it("time<0 返回首帧位姿", () => {
    const kfs = [
      makeKeyframe({ time: 0, position: { x: 0, y: 0, z: 0 }, fov: 50 }),
      makeKeyframe({ time: 10, position: { x: 10, y: 10, z: 10 }, fov: 70 }),
    ];
    const pose = getCameraPoseAtTime(kfs, -5);
    expect(pose.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(pose.fov).toBe(50);
  });

  it("time>duration 返回末帧位姿", () => {
    const kfs = [
      makeKeyframe({ time: 0, position: { x: 0, y: 0, z: 0 }, fov: 50 }),
      makeKeyframe({ time: 10, position: { x: 10, y: 10, z: 10 }, fov: 70 }),
    ];
    const pose = getCameraPoseAtTime(kfs, 100);
    expect(pose.position).toEqual({ x: 10, y: 10, z: 10 });
    expect(pose.fov).toBe(70);
  });

  it("中间区间查找正确（线性插值）", () => {
    const kfs = [
      makeKeyframe({ time: 0, position: { x: 0, y: 0, z: 0 }, fov: 50, interpolation: "linear" }),
      makeKeyframe({ time: 10, position: { x: 10, y: 10, z: 10 }, fov: 70, interpolation: "linear" }),
    ];
    const pose = getCameraPoseAtTime(kfs, 2.5);
    expect(pose.position).toEqual({ x: 2.5, y: 2.5, z: 2.5 });
    expect(pose.fov).toBe(55);
  });

  it("三关键帧时正确查找包含区间", () => {
    const kfs = [
      makeKeyframe({ time: 0, position: { x: 0, y: 0, z: 0 }, fov: 50, interpolation: "linear" }),
      makeKeyframe({ time: 5, position: { x: 5, y: 5, z: 5 }, fov: 60, interpolation: "linear" }),
      makeKeyframe({ time: 10, position: { x: 10, y: 10, z: 10 }, fov: 70, interpolation: "linear" }),
    ];
    // time=7.5 应该在 [5, 10] 区间内，插值结果 = (7.5, 7.5, 7.5)
    const pose = getCameraPoseAtTime(kfs, 7.5);
    expect(pose.position).toEqual({ x: 7.5, y: 7.5, z: 7.5 });
    expect(pose.fov).toBe(65);
  });

  it("关键帧 fov 缺失时使用 defaultFov", () => {
    const kfs = [
      makeKeyframe({ time: 0, fov: undefined }),
      makeKeyframe({ time: 10, fov: undefined }),
    ];
    const pose = getCameraPoseAtTime(kfs, 5, 80);
    expect(pose.fov).toBe(80);
  });
});

// ============================================================================
// sampleCameraPoses — 均匀采样
// ============================================================================

describe("sampleCameraPoses", () => {
  it("sampleCount<=0 返回空数组", () => {
    expect(sampleCameraPoses([], 10, 0)).toEqual([]);
    expect(sampleCameraPoses([], 10, -1)).toEqual([]);
  });

  it("sampleCount=1 返回单采样（time=0）", () => {
    const kfs = [
      makeKeyframe({ time: 0, position: { x: 0, y: 0, z: 0 }, fov: 50 }),
      makeKeyframe({ time: 10, position: { x: 10, y: 10, z: 10 }, fov: 70 }),
    ];
    const samples = sampleCameraPoses(kfs, 10, 1);
    expect(samples).toHaveLength(1);
    expect(samples[0]!.position).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("均匀采样 N 个点", () => {
    const kfs = [
      makeKeyframe({ time: 0, position: { x: 0, y: 0, z: 0 }, fov: 50, interpolation: "linear" }),
      makeKeyframe({ time: 10, position: { x: 10, y: 10, z: 10 }, fov: 70, interpolation: "linear" }),
    ];
    const samples = sampleCameraPoses(kfs, 10, 5);
    expect(samples).toHaveLength(5);
    // 采样点 t = 0, 2.5, 5, 7.5, 10
    expect(samples[0]!.position.x).toBeCloseTo(0, 5);
    expect(samples[1]!.position.x).toBeCloseTo(2.5, 5);
    expect(samples[2]!.position.x).toBeCloseTo(5, 5);
    expect(samples[3]!.position.x).toBeCloseTo(7.5, 5);
    expect(samples[4]!.position.x).toBeCloseTo(10, 5);
  });
});

// ============================================================================
// sampleKeyframeThumbnails — 5 时间点采样
// ============================================================================

describe("sampleKeyframeThumbnails", () => {
  it("返回 5 个时间点（0/0.25/0.5/0.75/1.0）", () => {
    const kfs = [
      makeKeyframe({ time: 0, position: { x: 0, y: 0, z: 0 }, fov: 50, interpolation: "linear" }),
      makeKeyframe({ time: 10, position: { x: 10, y: 10, z: 10 }, fov: 70, interpolation: "linear" }),
    ];
    const samples = sampleKeyframeThumbnails(kfs, 10);
    expect(samples).toHaveLength(5);
    expect(samples[0]!.time).toBe(0);
    expect(samples[1]!.time).toBe(2.5);
    expect(samples[2]!.time).toBe(5);
    expect(samples[3]!.time).toBe(7.5);
    expect(samples[4]!.time).toBe(10);
  });

  it("duration=0 时所有采样点 time=0", () => {
    const kfs = [makeKeyframe({ time: 0, fov: 50 })];
    const samples = sampleKeyframeThumbnails(kfs, 0);
    expect(samples).toHaveLength(5);
    for (const s of samples) {
      expect(s.time).toBe(0);
    }
  });

  it("每个采样包含 pose 字段", () => {
    const kfs = [
      makeKeyframe({ time: 0, position: { x: 0, y: 0, z: 0 }, fov: 50 }),
      makeKeyframe({ time: 10, position: { x: 10, y: 10, z: 10 }, fov: 70 }),
    ];
    const samples = sampleKeyframeThumbnails(kfs, 10);
    for (const s of samples) {
      expect(s.pose).toBeDefined();
      expect(s.pose.position).toBeDefined();
      expect(s.pose.target).toBeDefined();
      expect(s.pose.fov).toBeDefined();
    }
  });
});
