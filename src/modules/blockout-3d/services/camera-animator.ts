/**
 * Task 2A.21: 镜头轨迹动画（纯函数，无 Three.js 依赖）
 *
 * 根据关键帧序列插值出指定时间点的相机位姿。
 * 三种插值类型：
 * - linear：直线插值（推拉/平移）
 * - arc：弧线插值（弧形运镜，自动计算控制点）
 * - orbit：环绕目标点旋转（保持 target 不变，position 绕 target 旋转）
 *
 * 不依赖 Three.js — 纯数学函数，可单独测试。
 * scene-builder / render-service 通过此模块计算每帧相机位姿。
 */

import type { Vec3 } from "../domain/scene-schema";
import type { CameraKeyframe, CameraInterpolation } from "../domain/camera-path-types";

// ─── 工具：向量运算 ──────────────────────────────────────────────────────────

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    z: lerp(a.z, b.z, t),
  };
}

export function distanceVec3(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** 计算两点之间的弧线中点（用于 arc 插值的控制点） */
export function arcMidpoint(start: Vec3, end: Vec3, target: Vec3, bend: number = 0.3): Vec3 {
  // 弧线在 start-end 中点向 target 方向偏移
  const mid = lerpVec3(start, end, 0.5);
  const toTarget = {
    x: target.x - mid.x,
    y: target.y - mid.y,
    z: target.z - mid.z,
  };
  return {
    x: mid.x + toTarget.x * bend,
    y: mid.y + toTarget.y * bend,
    z: mid.z + toTarget.z * bend,
  };
}

/** 二阶贝塞尔曲线插值（用于 arc） */
export function bezier2(start: Vec3, control: Vec3, end: Vec3, t: number): Vec3 {
  const oneMinusT = 1 - t;
  return {
    x: oneMinusT * oneMinusT * start.x + 2 * oneMinusT * t * control.x + t * t * end.x,
    y: oneMinusT * oneMinusT * start.y + 2 * oneMinusT * t * control.y + t * t * end.y,
    z: oneMinusT * oneMinusT * start.z + 2 * oneMinusT * t * control.z + t * t * end.z,
  };
}

// ─── 插值器 ──────────────────────────────────────────────────────────────────

export interface CameraPose {
  position: Vec3;
  target: Vec3;
  fov: number;
}

/** 在两个关键帧之间插值 */
export function interpolateKeyframes(
  from: CameraKeyframe,
  to: CameraKeyframe,
  time: number,
  defaultFov: number = 50,
): CameraPose {
  const fromTime = from.time;
  const toTime = to.time;
  const span = toTime - fromTime;
  const t = span <= 0 ? 0 : (time - fromTime) / span;

  const fov = from.fov && to.fov ? lerp(from.fov, to.fov, t) : (from.fov ?? to.fov ?? defaultFov);

  switch (from.interpolation) {
    case "linear":
      return {
        position: lerpVec3(from.position, to.position, t),
        target: lerpVec3(from.target, to.target, t),
        fov,
      };

    case "arc": {
      // 弧线：使用贝塞尔曲线，控制点为目标点附近
      const controlPos = arcMidpoint(from.position, to.position, to.target, 0.3);
      const controlTarget = arcMidpoint(from.target, to.target, to.target, 0.2);
      return {
        position: bezier2(from.position, controlPos, to.position, t),
        target: bezier2(from.target, controlTarget, to.target, t),
        fov,
      };
    }

    case "orbit": {
      // 环绕：保持 target 线性插值，position 绕 from.target 旋转
      const radius = distanceVec3(from.position, from.target);
      const startAngle = Math.atan2(
        from.position.z - from.target.z,
        from.position.x - from.target.x,
      );
      const endAngle = Math.atan2(
        to.position.z - to.target.z,
        to.position.x - to.target.x,
      );
      // 选择最短旋转方向
      let deltaAngle = endAngle - startAngle;
      if (deltaAngle > Math.PI) deltaAngle -= 2 * Math.PI;
      if (deltaAngle < -Math.PI) deltaAngle += 2 * Math.PI;
      const currentAngle = startAngle + deltaAngle * t;

      // 高度线性插值
      const height = lerp(from.position.y, to.position.y, t);

      return {
        position: {
          x: from.target.x + radius * Math.cos(currentAngle),
          y: height,
          z: from.target.z + radius * Math.sin(currentAngle),
        },
        target: lerpVec3(from.target, to.target, t),
        fov,
      };
    }

    default:
      return {
        position: from.position,
        target: from.target,
        fov: from.fov ?? defaultFov,
      };
  }
}

// ─── 主动画函数 ──────────────────────────────────────────────────────────────

/**
 * 根据关键帧序列计算指定时间的相机位姿。
 *
 * 边界处理：
 * - time < 0：返回首帧位姿
 * - time > duration：返回末帧位姿
 * - 关键帧之间：根据 from.interpolation 插值
 */
export function getCameraPoseAtTime(
  keyframes: CameraKeyframe[],
  time: number,
  defaultFov: number = 50,
): CameraPose {
  if (keyframes.length === 0) {
    return {
      position: { x: 0, y: 0, z: 0 },
      target: { x: 0, y: 0, z: 0 },
      fov: defaultFov,
    };
  }
  if (keyframes.length === 1 || time <= keyframes[0]!.time) {
    const first = keyframes[0]!;
    return {
      position: first.position,
      target: first.target,
      fov: first.fov ?? defaultFov,
    };
  }
  const last = keyframes[keyframes.length - 1]!;
  if (time >= last.time) {
    return {
      position: last.position,
      target: last.target,
      fov: last.fov ?? defaultFov,
    };
  }

  // 查找包含 time 的关键帧区间
  for (let i = 0; i < keyframes.length - 1; i++) {
    const from = keyframes[i]!;
    const to = keyframes[i + 1]!;
    if (time >= from.time && time <= to.time) {
      return interpolateKeyframes(from, to, time, defaultFov);
    }
  }

  // 理论上不会到达这里
  return {
    position: last.position,
    target: last.target,
    fov: last.fov ?? defaultFov,
  };
}

// ─── 采样 ─────────────────────────────────────────────────────────────────────

/**
 * 在 [0, duration] 内均匀采样 N 个相机位姿。
 * 用于：
 * - 渲染 animatic 帧序列（fps * duration 个采样）
 * - 生成 fallback 关键帧图（5 个时间点：0/0.25/0.5/0.75/1.0）
 */
export function sampleCameraPoses(
  keyframes: CameraKeyframe[],
  duration: number,
  sampleCount: number,
  defaultFov: number = 50,
): CameraPose[] {
  if (sampleCount <= 0) return [];
  if (sampleCount === 1) {
    return [getCameraPoseAtTime(keyframes, 0, defaultFov)];
  }
  const samples: CameraPose[] = [];
  const step = duration / (sampleCount - 1);
  for (let i = 0; i < sampleCount; i++) {
    const t = step * i;
    samples.push(getCameraPoseAtTime(keyframes, t, defaultFov));
  }
  return samples;
}

/** 5 个时间点的采样（用于 fallback-adapter 关键帧图生成） */
export function sampleKeyframeThumbnails(
  keyframes: CameraKeyframe[],
  duration: number,
  defaultFov: number = 50,
): Array<{ time: number; pose: CameraPose }> {
  const ratios = [0, 0.25, 0.5, 0.75, 1.0];
  return ratios.map((r) => {
    const time = duration * r;
    return { time, pose: getCameraPoseAtTime(keyframes, time, defaultFov) };
  });
}

export { type CameraInterpolation };
