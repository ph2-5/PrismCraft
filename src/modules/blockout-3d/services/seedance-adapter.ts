/**
 * Task 2A.21: Seedance 2.5 白模输入适配器（纯数据转换，无 Three.js 依赖）
 *
 * BlockoutScene → Seedance 2.5 白模输入格式
 *
 * 输出：
 * - sceneGraph (GLB 二进制数据 — 由 scene-io 导出)
 * - cameraPath (JSON 关键帧轨迹)
 * - animaticVideo (MP4 — 由 animatic-exporter 生成)
 * - metadata (场景元数据，便于 Seedance 2.5 理解场景结构)
 *
 * 不依赖 Three.js — 纯数据转换，可单独测试。
 * scene-builder 通过此模块生成 GLB，render-service 通过此模块生成 animatic。
 */

import type { BlockoutScene, PrimitiveShape, LightingPreset } from "../domain/scene-schema";
import type { Mannequin } from "../domain/mannequin-types";
import type { CameraKeyframe } from "../domain/camera-path-types";
import { getMannequinGeometry } from "./mannequin-service";

// ─── Seedance 2.5 输入格式 ───────────────────────────────────────────────────

/**
 * Seedance 2.5 白模输入包
 *
 * 这是 PrismCraft 内部表示 — 实际 API 调用时由 SeedanceProvider 转换为
 * 火山引擎 API 要求的 multipart/form-data 格式。
 *
 * 字段说明：
 * - sceneGraphGlbPath：场景图 GLB 文件本地路径（由 scene-io.exportSceneAsGlb 生成）
 * - cameraPathJson：相机轨迹 JSON 字符串（直接传入 API）
 * - animaticVideoPath：animatic MP4 本地路径（由 animatic-exporter 生成）
 * - metadata：场景元数据（辅助 AI 理解场景结构）
 */
export interface Seedance3DInput {
  /** 场景图 GLB 文件本地路径 */
  sceneGraphGlbPath: string;
  /** 相机轨迹 JSON 字符串 */
  cameraPathJson: string;
  /** animatic 视频 MP4 本地路径 */
  animaticVideoPath: string;
  /** 场景元数据 */
  metadata: SeedanceSceneMetadata;
}

export interface SeedanceSceneMetadata {
  /** 场景名称 */
  sceneName: string;
  /** 场景版本 */
  version: 1;
  /** 道具总数 */
  propCount: number;
  /** 角色总数 */
  characterCount: number;
  /** 总时长（秒） */
  duration: number;
  /** 灯光类型 */
  lightingType: LightingPreset["type"];
  /** 道具列表（精简，用于 prompt-engine 拼接） */
  propSummary: Array<{ label: string; type: string; position: { x: number; y: number; z: number } }>;
  /** 角色列表（精简） */
  characterSummary: Array<{ id: string; displayName?: string; pose: string; position: { x: number; z: number } }>;
}

// ─── 适配器实现 ──────────────────────────────────────────────────────────────

export interface SeedanceAdapterOptions {
  /** GLB 文件路径（必须先由 scene-io.exportSceneAsGlb 生成） */
  glbPath: string;
  /** animatic 视频 MP4 路径（必须先由 animatic-exporter 生成） */
  animaticPath: string;
}

/**
 * 将 BlockoutScene 转换为 Seedance 2.5 白模输入格式。
 *
 * 调用方需要先：
 * 1. 通过 scene-io.exportSceneAsGlb 生成 GLB 文件
 * 2. 通过 animatic-exporter.exportAnimatic 生成 MP4 文件
 *
 * 然后传入 glbPath 和 animaticPath 调用此函数。
 */
export function adaptToSeedanceInput(
  scene: BlockoutScene,
  options: SeedanceAdapterOptions,
): Seedance3DInput {
  const cameraPath = scene.cameraPath ?? [];
  const duration = cameraPath.length > 0
    ? cameraPath[cameraPath.length - 1]!.time
    : 5; // 默认 5 秒

  return {
    sceneGraphGlbPath: options.glbPath,
    cameraPathJson: JSON.stringify(buildCameraPathPayload(cameraPath)),
    animaticVideoPath: options.animaticPath,
    metadata: buildSceneMetadata(scene, duration),
  };
}

// ─── 内部：构建相机轨迹 payload ─────────────────────────────────────────────

interface CameraPathPayload {
  version: 1;
  duration: number;
  keyframes: Array<{
    time: number;
    position: { x: number; y: number; z: number };
    target: { x: number; y: number; z: number };
    interpolation: string;
    fov?: number;
  }>;
}

function buildCameraPathPayload(keyframes: CameraKeyframe[]): CameraPathPayload {
  const duration = keyframes.length > 0 ? keyframes[keyframes.length - 1]!.time : 0;
  return {
    version: 1,
    duration,
    keyframes: keyframes.map((kf) => ({
      time: kf.time,
      position: kf.position,
      target: kf.target,
      interpolation: kf.interpolation,
      fov: kf.fov,
    })),
  };
}

// ─── 内部：构建场景元数据 ───────────────────────────────────────────────────

function buildSceneMetadata(scene: BlockoutScene, duration: number): SeedanceSceneMetadata {
  return {
    sceneName: scene.name,
    version: 1,
    propCount: scene.props.length,
    characterCount: scene.characters.length,
    duration,
    lightingType: scene.lighting.type,
    propSummary: scene.props.map(summarizeProp),
    characterSummary: scene.characters.map(summarizeCharacter),
  };
}

function summarizeProp(prop: PrimitiveShape): SeedanceSceneMetadata["propSummary"][number] {
  return {
    label: prop.label ?? prop.type,
    type: prop.type,
    position: prop.position,
  };
}

function summarizeCharacter(m: Mannequin): SeedanceSceneMetadata["characterSummary"][number] {
  const geom = getMannequinGeometry(m);
  return {
    id: m.id,
    displayName: m.displayName,
    pose: m.pose,
    position: { x: geom.center.x, z: geom.center.z },
  };
}

// ─── 验证 ───────────────────────────────────────────────────────────────────

export interface SeedanceAdapterValidation {
  valid: boolean;
  errors: string[];
}

/** 验证场景是否可转换为 Seedance 2.5 输入 */
export function validateForSeedance(scene: BlockoutScene): SeedanceAdapterValidation {
  const errors: string[] = [];

  if (!scene.cameraPath || scene.cameraPath.length < 2) {
    errors.push("Seedance 2.5 需要至少 2 个相机关键帧");
  }

  if (scene.cameraPath && scene.cameraPath.length > 0) {
    const lastTime = scene.cameraPath[scene.cameraPath.length - 1]!.time;
    if (lastTime > 30) {
      errors.push(`轨迹时长 ${lastTime}s 超过 Seedance 2.5 最大 30s`);
    }
  }

  if (scene.characters.length > 50) {
    errors.push(`角色数 ${scene.characters.length} 超过 Seedance 2.5 最大 50 路参考`);
  }

  if (scene.props.length > 100) {
    errors.push(`道具数 ${scene.props.length} 过多（建议 < 100）`);
  }

  return { valid: errors.length === 0, errors };
}
