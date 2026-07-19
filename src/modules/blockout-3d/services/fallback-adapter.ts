/**
 * Task 2A.21: Fallback 适配器 — 场景 → 关键帧图（给其他模型作为参考）
 *
 * 当模型不支持 3D 白模输入（如 Seedance 2.0 / Kling / Runway 等）时，
 * 通过渲染关键帧图作为参考图/首帧给其他模型（结构引导，弱一些但通用）。
 *
 * 5 个时间点采样：0/0.25/0.5/0.75/1.0 — 用于 fallback 关键帧图生成。
 *
 * 不依赖 Three.js — 纯数据转换，可单独测试。
 * render-service 通过此模块的采样结果渲染 PNG。
 */

import type { BlockoutScene } from "../domain/scene-schema";
import type { CameraKeyframe } from "../domain/camera-path-types";
import { sampleKeyframeThumbnails, type CameraPose } from "./camera-animator";

// ─── Fallback 关键帧图集 ──────────────────────────────────────────────────────

/**
 * Fallback 关键帧图集 — 用于不支持 3D 白模的模型
 *
 * 5 个时间点的相机位姿 + 对应的 PNG 帧路径（由 render-service 渲染）。
 * 调用方可以：
 * - 把首帧作为参考图给其他模型
 * - 把所有 5 帧作为参考图组给支持多参考图的模型
 * - 拼成 animatic 给支持视频参考的模型
 */
export interface FallbackKeyframeSet {
  /** 关联的场景 ID */
  sceneId: string;
  /** 总时长（秒） */
  duration: number;
  /** 5 个时间点的关键帧 */
  frames: FallbackKeyframe[];
  /** 场景元数据（prompt-engine 拼接用） */
  sceneDescription: string;
}

export interface FallbackKeyframe {
  /** 时间点（秒） */
  time: number;
  /** 时间比例（0-1） */
  ratio: number;
  /** 相机位姿 */
  pose: CameraPose;
  /** PNG 帧本地路径（由 render-service 填充） */
  framePath?: string;
}

// ─── 适配器实现 ──────────────────────────────────────────────────────────────

/** 默认 FOV（当场景相机未指定时） */
const DEFAULT_FOV = 50;

/**
 * 将 BlockoutScene 转换为 fallback 关键帧图集（5 个时间点）。
 *
 * 调用方需要：
 * 1. 调用此函数获得关键帧位姿
 * 2. 通过 render-service 渲染每个位姿对应的 PNG 帧
 * 3. 把 PNG 路径填入 framePath
 */
export function adaptToFallbackKeyframes(scene: BlockoutScene): FallbackKeyframeSet {
  const cameraPath = scene.cameraPath ?? [];

  // 当没有 cameraPath 时，使用静态相机作为单帧
  if (cameraPath.length === 0) {
    return {
      sceneId: scene.id,
      duration: 0,
      frames: [{
        time: 0,
        ratio: 0,
        pose: {
          position: scene.camera.position,
          target: scene.camera.target,
          fov: scene.camera.fov,
        },
      }],
      sceneDescription: buildSceneDescription(scene),
    };
  }

  const duration = cameraPath[cameraPath.length - 1]!.time;
  const defaultFov = scene.camera.fov ?? DEFAULT_FOV;
  const samples = sampleKeyframeThumbnails(cameraPath, duration, defaultFov);

  return {
    sceneId: scene.id,
    duration,
    frames: samples.map((s) => ({
      time: s.time,
      ratio: duration > 0 ? s.time / duration : 0,
      pose: s.pose,
    })),
    sceneDescription: buildSceneDescription(scene),
  };
}

// ─── 内部：场景描述（用于 prompt-engine 拼接） ──────────────────────────────

function buildSceneDescription(scene: BlockoutScene): string {
  const parts: string[] = [];

  parts.push(`3D 白模场景：${scene.name}`);
  parts.push(`灯光：${describeLighting(scene.lighting.type)}`);

  if (scene.props.length > 0) {
    parts.push(`道具：${scene.props.length} 个`);
    const propGroups = groupPropsByType(scene.props);
    for (const [type, count] of Object.entries(propGroups)) {
      parts.push(`  - ${describePropType(type)} x${count}`);
    }
  }

  if (scene.characters.length > 0) {
    parts.push(`角色：${scene.characters.length} 个`);
    for (const c of scene.characters) {
      const name = c.displayName ?? c.characterVariantId;
      parts.push(`  - ${name}（${c.pose}）`);
    }
  }

  if (scene.cameraPath && scene.cameraPath.length > 0) {
    const duration = scene.cameraPath[scene.cameraPath.length - 1]!.time;
    parts.push(`运镜时长：${duration} 秒`);
    parts.push(`关键帧数：${scene.cameraPath.length}`);
  }

  return parts.join("\n");
}

function describeLighting(type: string): string {
  const map: Record<string, string> = {
    daylight: "日光",
    sunset: "黄昏",
    indoor: "室内",
    night: "夜晚",
    dramatic: "戏剧光",
    soft: "柔光",
  };
  return map[type] ?? type;
}

function describePropType(type: string): string {
  const map: Record<string, string> = {
    box: "立方体",
    cylinder: "圆柱",
    sphere: "球体",
    plane: "平面",
    cone: "圆锥",
    torus: "圆环",
  };
  return map[type] ?? type;
}

function groupPropsByType(props: BlockoutScene["props"]): Record<string, number> {
  const groups: Record<string, number> = {};
  for (const p of props) {
    groups[p.type] = (groups[p.type] ?? 0) + 1;
  }
  return groups;
}

// ─── 验证 ───────────────────────────────────────────────────────────────────

export interface FallbackAdapterValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/** 验证场景是否可用于 fallback 适配器 */
export function validateForFallback(scene: BlockoutScene): FallbackAdapterValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (scene.props.length === 0 && scene.characters.length === 0) {
    warnings.push("场景为空（无道具无角色），fallback 关键帧可能信息量不足");
  }

  if (!scene.cameraPath || scene.cameraPath.length === 0) {
    warnings.push("无相机轨迹，仅生成单张静态关键帧");
  } else if (scene.cameraPath.length === 1) {
    warnings.push("仅 1 个关键帧，无法表达运镜");
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ─── 工具：填充帧路径 ────────────────────────────────────────────────────────

/**
 * 在已生成的 fallback 关键帧图集上填充 PNG 帧路径。
 * 调用方先调用 adaptToFallbackKeyframes 获取位姿，渲染后再用此函数填充路径。
 */
export function fillFramePaths(
  keyframeSet: FallbackKeyframeSet,
  framePaths: string[],
): FallbackKeyframeSet {
  return {
    ...keyframeSet,
    frames: keyframeSet.frames.map((frame, i) => ({
      ...frame,
      framePath: framePaths[i],
    })),
  };
}

/** 从 fallback 图集中提取首帧路径（用作给其他模型的首帧参考） */
export function getFirstFramePath(keyframeSet: FallbackKeyframeSet): string | undefined {
  return keyframeSet.frames[0]?.framePath;
}

/** 从 fallback 图集中提取所有帧路径（用作给其他模型的参考图组） */
export function getAllFramePaths(keyframeSet: FallbackKeyframeSet): string[] {
  return keyframeSet.frames
    .map((f) => f.framePath)
    .filter((p): p is string => p !== undefined);
}

export { type CameraKeyframe };
