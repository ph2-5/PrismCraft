/**
 * Task 2A.21: 镜头轨迹业务逻辑（验证 + 工厂函数）
 *
 * 类型定义已迁移到 `@/domain/schemas/blockout-scene`（domain 层零依赖规则）。
 * 本文件保留验证函数和工厂函数（含业务规则：时长限制、关键帧顺序等）。
 *
 * 设计原则：
 * - 简化时间轴 — 时间范围 0-30 秒（Seedance 2.5 maxDuration）
 * - 三种插值类型 — linear（直线）/ arc（弧线）/ orbit（环绕），覆盖常见运镜
 * - 关键帧最少 2 个 — 起止帧；中间可任意插入
 *
 * Seedance 2.5 核心能力 — 白模 + 相机轨迹 → AI 严格遵循空间结构生成视频
 */

// 类型 re-export（透明转发到 domain 层）
export type {
  CameraInterpolation,
  CameraKeyframe,
  CameraPath,
  CameraPathValidation,
} from "@/domain/schemas/blockout-scene";

import type {
  CameraInterpolation,
  CameraKeyframe,
  CameraPath,
  CameraPathValidation,
} from "@/domain/schemas/blockout-scene";

// ─── 插值类型常量 ─────────────────────────────────────────────────────────────

export const INTERPOLATION_TYPES: CameraInterpolation[] = ["linear", "arc", "orbit"];

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

export function validateCameraPath(path: CameraPath): CameraPathValidation {
  const errors: string[] = [];

  if (path.keyframes.length < 2) {
    errors.push("至少需要 2 个关键帧");
  }

  if (path.duration <= 0 || path.duration > 30) {
    errors.push("总时长必须在 0-30 秒之间");
  }

  for (let i = 0; i < path.keyframes.length; i++) {
    const kf = path.keyframes[i]!;
    if (kf.time < 0 || kf.time > path.duration) {
      errors.push(`关键帧 ${i + 1} 时间 ${kf.time}s 超出 [0, ${path.duration}]`);
    }
    if (i > 0) {
      const prev = path.keyframes[i - 1]!;
      if (kf.time < prev.time) {
        errors.push(`关键帧 ${i + 1} 时间 ${kf.time}s 早于前一帧 ${prev.time}s`);
      }
    }
  }

  if (path.keyframes.length > 0) {
    const first = path.keyframes[0]!;
    const last = path.keyframes[path.keyframes.length - 1]!;
    if (Math.abs(first.time - 0) > 0.01) {
      errors.push(`首帧时间应为 0s（实际 ${first.time}s）`);
    }
    if (Math.abs(last.time - path.duration) > 0.01) {
      errors.push(`末帧时间应为 ${path.duration}s（实际 ${last.time}s）`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/** 创建默认相机轨迹（2 关键帧直线运镜，5 秒） */
export function createDefaultCameraPath(id: string): CameraPath {
  return {
    id,
    name: "默认轨迹",
    duration: 5,
    defaultFov: 50,
    keyframes: [
      {
        time: 0,
        position: { x: 5, y: 3, z: 5 },
        target: { x: 0, y: 1, z: 0 },
        interpolation: "linear",
      },
      {
        time: 5,
        position: { x: 3, y: 2, z: 3 },
        target: { x: 0, y: 1, z: 0 },
        interpolation: "linear",
      },
    ],
  };
}

/** 把 CameraPath 转换为关键帧数组（用于 BlockoutScene.cameraPath） */
export function cameraPathToKeyframes(path: CameraPath): CameraKeyframe[] {
  return path.keyframes.map((kf) => ({
    ...kf,
    fov: kf.fov ?? path.defaultFov,
  }));
}
