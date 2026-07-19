/**
 * Task 2A.21 — seedance-adapter 单元测试
 *
 * 覆盖核心函数：
 * - adaptToSeedanceInput：BlockoutScene → Seedance3DInput 转换
 *   - 输出结构正确性（GLB/JSON/MP4 路径 + metadata）
 *   - cameraPathJson 序列化（version/duration/keyframes）
 *   - metadata 字段映射（propSummary/characterSummary）
 *   - 无 cameraPath 时默认 5s 时长
 * - validateForSeedance：场景验证
 *   - 关键帧不足（<2）
 *   - 时长超限（>30s）
 *   - 角色过多（>50）
 *   - 道具过多（>100）
 *   - 正常场景
 *
 * 纯数据转换无 Three.js 依赖，可直接在 vitest jsdom 环境运行。
 */

import { describe, it, expect } from "vitest";
import {
  adaptToSeedanceInput,
  validateForSeedance,
} from "../seedance-adapter";
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
  overrides: Partial<BlockoutScene> = {},
): BlockoutScene {
  const scene = createEmptyScene("scene-1", "测试场景");
  const keyframes: CameraKeyframe[] = [];
  for (let i = 0; i < keyframeCount; i++) {
    const t = keyframeCount === 1 ? 0 : (duration * i) / (keyframeCount - 1);
    keyframes.push(makeKeyframe({
      time: t,
      position: { x: 5 - i, y: 3, z: 5 - i },
      fov: 50,
    }));
  }
  return {
    ...scene,
    ...overrides,
    cameraPath: keyframes,
  };
}

// ============================================================================
// adaptToSeedanceInput — 输出结构正确性
// ============================================================================

describe("adaptToSeedanceInput", () => {
  it("返回完整 Seedance3DInput 结构（含 GLB/JSON/MP4 路径 + metadata）", () => {
    const scene = makeSceneWithCameraPath(2, 5);
    const result = adaptToSeedanceInput(scene, {
      glbPath: "/tmp/scene.glb",
      animaticPath: "/tmp/scene.mp4",
    });

    expect(result).toHaveProperty("sceneGraphGlbPath", "/tmp/scene.glb");
    expect(result).toHaveProperty("cameraPathJson");
    expect(result).toHaveProperty("animaticVideoPath", "/tmp/scene.mp4");
    expect(result).toHaveProperty("metadata");
    expect(result.metadata).toHaveProperty("sceneName", "测试场景");
    expect(result.metadata).toHaveProperty("version", 1);
  });

  it("cameraPathJson 正确序列化为 JSON 字符串（version/duration/keyframes）", () => {
    const scene = makeSceneWithCameraPath(3, 10);
    const result = adaptToSeedanceInput(scene, {
      glbPath: "/tmp/scene.glb",
      animaticPath: "/tmp/scene.mp4",
    });

    const parsed = JSON.parse(result.cameraPathJson);
    expect(parsed.version).toBe(1);
    expect(parsed.duration).toBe(10);
    expect(parsed.keyframes).toHaveLength(3);
    expect(parsed.keyframes[0]).toHaveProperty("time");
    expect(parsed.keyframes[0]).toHaveProperty("position");
    expect(parsed.keyframes[0]).toHaveProperty("target");
    expect(parsed.keyframes[0]).toHaveProperty("interpolation");
    expect(parsed.keyframes[0]).toHaveProperty("fov");
  });

  it("metadata 正确映射 propSummary（label/type/position）", () => {
    const scene = createEmptyScene("scene-1", "测试场景");
    scene.props = [
      makeProp({ id: "p1", type: "box", label: "桌子", position: { x: 1, y: 0, z: 2 } }),
      makeProp({ id: "p2", type: "sphere", label: "球", position: { x: -1, y: 1, z: 0 } }),
    ];
    scene.cameraPath = [
      makeKeyframe({ time: 0 }),
      makeKeyframe({ time: 5 }),
    ];

    const result = adaptToSeedanceInput(scene, {
      glbPath: "/tmp/scene.glb",
      animaticPath: "/tmp/scene.mp4",
    });

    expect(result.metadata.propCount).toBe(2);
    expect(result.metadata.propSummary).toHaveLength(2);
    expect(result.metadata.propSummary[0]).toEqual({
      label: "桌子",
      type: "box",
      position: { x: 1, y: 0, z: 2 },
    });
  });

  it("metadata 中 propSummary 缺失 label 时回退到 type", () => {
    const scene = createEmptyScene("scene-1", "测试场景");
    scene.props = [makeProp({ id: "p1", type: "cylinder", label: undefined })];
    scene.cameraPath = [
      makeKeyframe({ time: 0 }),
      makeKeyframe({ time: 5 }),
    ];

    const result = adaptToSeedanceInput(scene, {
      glbPath: "/tmp/scene.glb",
      animaticPath: "/tmp/scene.mp4",
    });

    expect(result.metadata.propSummary[0]!.label).toBe("cylinder");
  });

  it("metadata 正确映射 characterSummary（含位置计算）", () => {
    const scene = createEmptyScene("scene-1", "测试场景");
    scene.characters = [
      createDefaultMannequin("m1", "variant-1", "主角"),
    ];
    scene.cameraPath = [
      makeKeyframe({ time: 0 }),
      makeKeyframe({ time: 5 }),
    ];

    const result = adaptToSeedanceInput(scene, {
      glbPath: "/tmp/scene.glb",
      animaticPath: "/tmp/scene.mp4",
    });

    expect(result.metadata.characterCount).toBe(1);
    expect(result.metadata.characterSummary).toHaveLength(1);
    expect(result.metadata.characterSummary[0]).toEqual({
      id: "m1",
      displayName: "主角",
      pose: "standing",
      position: { x: 0, z: 0 },
    });
  });

  it("无 cameraPath 时 duration 默认为 5 秒", () => {
    const scene = createEmptyScene("scene-1", "测试场景");
    // 不设置 cameraPath

    const result = adaptToSeedanceInput(scene, {
      glbPath: "/tmp/scene.glb",
      animaticPath: "/tmp/scene.mp4",
    });

    expect(result.metadata.duration).toBe(5);
    const parsed = JSON.parse(result.cameraPathJson);
    expect(parsed.duration).toBe(0); // 空关键帧数组时 duration=0
    expect(parsed.keyframes).toHaveLength(0);
  });

  it("lightingType 字段从 scene.lighting.type 映射", () => {
    const scene = makeSceneWithCameraPath(2, 5);
    scene.lighting = { ...scene.lighting, type: "dramatic" };

    const result = adaptToSeedanceInput(scene, {
      glbPath: "/tmp/scene.glb",
      animaticPath: "/tmp/scene.mp4",
    });

    expect(result.metadata.lightingType).toBe("dramatic");
  });
});

// ============================================================================
// validateForSeedance — 场景验证
// ============================================================================

describe("validateForSeedance", () => {
  it("关键帧 <2 时返回错误", () => {
    const scene = makeSceneWithCameraPath(1, 0);
    const result = validateForSeedance(scene);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("至少 2 个");
  });

  it("关键帧 =0 时返回错误", () => {
    const scene = createEmptyScene("scene-1", "测试场景");
    const result = validateForSeedance(scene);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("至少 2 个");
  });

  it("时长 >30s 时返回错误", () => {
    const scene = makeSceneWithCameraPath(2, 35);
    const result = validateForSeedance(scene);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("超过"))).toBe(true);
  });

  it("角色数 >50 时返回错误", () => {
    const scene = makeSceneWithCameraPath(2, 5);
    scene.characters = Array.from({ length: 51 }, (_, i) =>
      createDefaultMannequin(`m${i}`, `v${i}`),
    );
    const result = validateForSeedance(scene);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("角色数"))).toBe(true);
  });

  it("道具数 >100 时返回错误", () => {
    const scene = makeSceneWithCameraPath(2, 5);
    scene.props = Array.from({ length: 101 }, (_, i) =>
      makeProp({ id: `p${i}`, type: "box" }),
    );
    const result = validateForSeedance(scene);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("道具数"))).toBe(true);
  });

  it("正常场景（2 关键帧 + 5s + 少量内容）通过验证", () => {
    const scene = makeSceneWithCameraPath(2, 5);
    scene.characters = [createDefaultMannequin("m1", "v1", "主角")];
    scene.props = [makeProp({ id: "p1", type: "box" })];

    const result = validateForSeedance(scene);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("边界值：2 关键帧 + 30s + 50 角色 + 100 道具 通过验证", () => {
    const scene = makeSceneWithCameraPath(2, 30);
    scene.characters = Array.from({ length: 50 }, (_, i) =>
      createDefaultMannequin(`m${i}`, `v${i}`),
    );
    scene.props = Array.from({ length: 100 }, (_, i) =>
      makeProp({ id: `p${i}`, type: "box" }),
    );

    const result = validateForSeedance(scene);
    expect(result.valid).toBe(true);
  });
});
