/**
 * Task 2A.21 — scene-builder 单元测试
 *
 * 覆盖核心函数：
 * - computeSceneStats：场景统计（纯函数，无 Three.js 依赖）
 *   - 空场景统计
 *   - 道具统计（按类型计算三角形数）
 *   - 人偶统计（每个 100 三角形）
 *   - 可见性过滤
 *   - 三角形总数累加
 * - applyCameraPose：应用相机位姿（需 PerspectiveCamera，无 WebGL）
 * - applyShotCamera：应用静态相机（含 roll 处理）
 * - buildScene：构建场景（mock WebGLRenderer 避免 jsdom WebGL 限制）
 * - disposeScene：资源释放（验证 dispose 调用）
 *
 * Three.js 在 jsdom 中 WebGLRenderer 无法创建真实 WebGL context，
 * 因此 buildScene / disposeScene 测试通过 vi.mock 替换 WebGLRenderer。
 * 其他类（Scene/PerspectiveCamera/Geometry/Material）可在 jsdom 中正常创建。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mock WebGLRenderer — 避免 jsdom 中 WebGL context 不可用问题
// 使用 vi.hoisted 确保 mock 在 vi.mock factory 中可用（vi.mock 调用被提升到文件顶部）
// ============================================================================

const { mockWebGLRenderer } = vi.hoisted(() => ({
  // 必须用普通函数（不能用箭头函数），因为 WebGLRenderer 通过 new 调用
  // 普通函数作为构造函数时，this 绑定到新实例
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockWebGLRenderer: vi.fn(function (this: any, options: any) {
    this.options = options;
    this.setPixelRatio = vi.fn();
    this.setSize = vi.fn();
    this.setClearColor = vi.fn();
    this.render = vi.fn();
    this.dispose = vi.fn();
    this.forceContextLoss = vi.fn();
    this.domElement = document.createElement("canvas");
  }),
}));

vi.mock("three", async () => {
  const actual = await vi.importActual<typeof import("three")>("three");
  return {
    ...actual,
    WebGLRenderer: mockWebGLRenderer,
  };
});

// 在 mock 之后导入
import * as THREE from "three";
import {
  buildScene,
  disposeScene,
  applyCameraPose,
  applyShotCamera,
  computeSceneStats,
  type SceneBuilderOptions,
} from "../scene-builder";
import { createEmptyScene } from "../../domain/scene-schema";
import { createDefaultMannequin } from "../../domain/mannequin-types";
import type { BlockoutScene, PrimitiveShape } from "@/domain/schemas/blockout-scene";

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

function makeScene(overrides: Partial<BlockoutScene> = {}): BlockoutScene {
  return { ...createEmptyScene("scene-1", "测试场景"), ...overrides };
}

const defaultOptions: SceneBuilderOptions = {
  width: 800,
  height: 600,
};

// ============================================================================
// computeSceneStats — 纯函数统计
// ============================================================================

describe("computeSceneStats", () => {
  it("空场景统计正确", () => {
    const scene = makeScene();
    const stats = computeSceneStats(scene);

    expect(stats.propCount).toBe(0);
    expect(stats.mannequinCount).toBe(0);
    expect(stats.visiblePropCount).toBe(0);
    expect(stats.visibleMannequinCount).toBe(0);
    expect(stats.triangleCount).toBe(0);
  });

  it("道具统计正确（按类型累加三角形）", () => {
    const scene = makeScene({
      props: [
        makeProp({ id: "p1", type: "box" }),       // 12 triangles
        makeProp({ id: "p2", type: "sphere" }),    // 96 triangles
        makeProp({ id: "p3", type: "cylinder" }),  // 32 triangles
      ],
    });
    const stats = computeSceneStats(scene);

    expect(stats.propCount).toBe(3);
    expect(stats.visiblePropCount).toBe(3);
    expect(stats.triangleCount).toBe(12 + 96 + 32);
  });

  it("人偶统计正确（每个 100 三角形）", () => {
    const scene = makeScene({
      characters: [
        createDefaultMannequin("m1", "v1", "主角"),
        createDefaultMannequin("m2", "v2", "配角"),
      ],
    });
    const stats = computeSceneStats(scene);

    expect(stats.mannequinCount).toBe(2);
    expect(stats.visibleMannequinCount).toBe(2);
    expect(stats.triangleCount).toBe(200);
  });

  it("visible=false 的道具不计入可见数和三角形", () => {
    const scene = makeScene({
      props: [
        makeProp({ id: "p1", type: "box", visible: true }),
        makeProp({ id: "p2", type: "box", visible: false }),
      ],
    });
    const stats = computeSceneStats(scene);

    expect(stats.propCount).toBe(2);
    expect(stats.visiblePropCount).toBe(1);
    expect(stats.triangleCount).toBe(12); // 仅可见道具
  });

  it("visible=false 的人偶不计入可见数和三角形", () => {
    const scene = makeScene({
      characters: [
        createDefaultMannequin("m1", "v1", "主角"),
        { ...createDefaultMannequin("m2", "v2", "配角"), visible: false },
      ],
    });
    const stats = computeSceneStats(scene);

    expect(stats.mannequinCount).toBe(2);
    expect(stats.visibleMannequinCount).toBe(1);
    expect(stats.triangleCount).toBe(100);
  });

  it("各类道具三角形数正确（box/cylinder/sphere/plane/cone/torus）", () => {
    const types: PrimitiveShape["type"][] = ["box", "cylinder", "sphere", "plane", "cone", "torus"];
    const scene = makeScene({
      props: types.map((type, i) => makeProp({ id: `p${i}`, type })),
    });
    const stats = computeSceneStats(scene);

    // box:12 + cylinder:32 + sphere:96 + plane:2 + cone:16 + torus:192 = 350
    expect(stats.triangleCount).toBe(12 + 32 + 96 + 2 + 16 + 192);
  });
});

// ============================================================================
// applyCameraPose — 相机位姿应用
// ============================================================================

describe("applyCameraPose", () => {
  it("正确设置相机位置和目标点", () => {
    const camera = new THREE.PerspectiveCamera(50, 800 / 600, 0.1, 1000);
    applyCameraPose(camera, {
      position: { x: 5, y: 3, z: 5 },
      target: { x: 0, y: 1, z: 0 },
      fov: 50,
    });

    expect(camera.position.x).toBe(5);
    expect(camera.position.y).toBe(3);
    expect(camera.position.z).toBe(5);
  });

  it("fov 变化时更新投影矩阵", () => {
    const camera = new THREE.PerspectiveCamera(50, 800 / 600, 0.1, 1000);
    const originalFov = camera.fov;
    applyCameraPose(camera, {
      position: { x: 0, y: 0, z: 5 },
      target: { x: 0, y: 0, z: 0 },
      fov: 75,
    });

    expect(camera.fov).toBe(75);
    expect(camera.fov).not.toBe(originalFov);
  });

  it("fov 不变时不更新投影矩阵", () => {
    const camera = new THREE.PerspectiveCamera(50, 800 / 600, 0.1, 1000);
    const updateProjectionMatrixSpy = vi.spyOn(camera, "updateProjectionMatrix");

    applyCameraPose(camera, {
      position: { x: 0, y: 0, z: 5 },
      target: { x: 0, y: 0, z: 0 },
      fov: 50, // 同初始 fov
    });

    // fov 相同，不调用 updateProjectionMatrix
    expect(updateProjectionMatrixSpy).not.toHaveBeenCalled();
  });
});

// ============================================================================
// applyShotCamera — 静态相机应用
// ============================================================================

describe("applyShotCamera", () => {
  it("应用位置/目标/fov", () => {
    const camera = new THREE.PerspectiveCamera(50, 800 / 600, 0.1, 1000);
    applyShotCamera(camera, {
      fov: 60,
      position: { x: 10, y: 5, z: 10 },
      target: { x: 0, y: 0, z: 0 },
    });

    expect(camera.position.x).toBe(10);
    expect(camera.fov).toBe(60);
  });

  it("roll=0 时不旋转", () => {
    const camera = new THREE.PerspectiveCamera(50, 800 / 600, 0.1, 1000);
    const beforeZ = camera.rotation.z;
    applyShotCamera(camera, {
      fov: 50,
      position: { x: 0, y: 0, z: 5 },
      target: { x: 0, y: 0, z: 0 },
      roll: 0,
    });
    // Three.js lookAt 可能产生 -0，用 Math.abs 比较
    expect(Math.abs(camera.rotation.z - beforeZ)).toBe(0);
  });

  it("roll=90 时绕 Z 轴旋转 π/2 弧度", () => {
    const camera = new THREE.PerspectiveCamera(50, 800 / 600, 0.1, 1000);
    applyShotCamera(camera, {
      fov: 50,
      position: { x: 0, y: 0, z: 5 },
      target: { x: 0, y: 0, z: 0 },
      roll: 90,
    });
    expect(camera.rotation.z).toBeCloseTo(Math.PI / 2, 5);
  });

  it("无 roll 字段时不旋转", () => {
    const camera = new THREE.PerspectiveCamera(50, 800 / 600, 0.1, 1000);
    const beforeZ = camera.rotation.z;
    applyShotCamera(camera, {
      fov: 50,
      position: { x: 0, y: 0, z: 5 },
      target: { x: 0, y: 0, z: 0 },
      // 不提供 roll
    });
    expect(Math.abs(camera.rotation.z - beforeZ)).toBe(0);
  });
});

// ============================================================================
// buildScene — 场景构建（mock WebGLRenderer）
// ============================================================================

describe("buildScene", () => {
  beforeEach(() => {
    mockWebGLRenderer.mockClear();
  });

  it("返回 BuiltScene 结构（含 scene/camera/renderer/disposables）", () => {
    const scene = makeScene();
    const result = buildScene(scene, defaultOptions);

    expect(result).toHaveProperty("scene");
    expect(result).toHaveProperty("camera");
    expect(result).toHaveProperty("renderer");
    expect(result).toHaveProperty("disposables");
    expect(result.scene).toBeInstanceOf(THREE.Scene);
    expect(result.camera).toBeInstanceOf(THREE.PerspectiveCamera);
    expect(Array.isArray(result.disposables)).toBe(true);
  });

  it("WebGLRenderer 使用 options 配置（width/height/antialias）", () => {
    const scene = makeScene();
    buildScene(scene, { width: 1024, height: 768, antialias: false });

    expect(mockWebGLRenderer).toHaveBeenCalledWith({
      antialias: false,
      alpha: true,
      preserveDrawingBuffer: false,
    });
  });

  it("相机 fov 从 BlockoutScene.camera.fov 读取", () => {
    const scene = makeScene();
    scene.camera = { ...scene.camera, fov: 75 };
    const result = buildScene(scene, defaultOptions);

    expect(result.camera.fov).toBe(75);
  });

  it("道具被添加到 scene 中", () => {
    const scene = makeScene({
      props: [
        makeProp({ id: "p1", type: "box", visible: true }),
        makeProp({ id: "p2", type: "sphere", visible: true }),
      ],
    });
    const result = buildScene(scene, defaultOptions);

    // scene.children 应该包含：灯光 + 地面(group) + 2 个道具
    // 至少 4 个 children
    expect(result.scene.children.length).toBeGreaterThanOrEqual(4);
  });

  it("visible=false 的道具不被添加到 scene", () => {
    const scene = makeScene({
      props: [
        makeProp({ id: "p1", type: "box", visible: true }),
        makeProp({ id: "p2", type: "sphere", visible: false }),
      ],
    });
    const result = buildScene(scene, defaultOptions);

    // 仅 1 个道具添加到 scene
    // scene.children: 灯光(2: DirectionalLight + AmbientLight) + 地面 + 1 道具
    const propMeshes = result.scene.children.filter(
      (c) => c instanceof THREE.Mesh && c.userData?.type === "prop",
    );
    expect(propMeshes).toHaveLength(1);
  });

  it("人偶被添加到 scene 中（作为 Group）", () => {
    const scene = makeScene({
      characters: [
        createDefaultMannequin("m1", "v1", "主角"),
      ],
    });
    const result = buildScene(scene, defaultOptions);

    const mannequinGroups = result.scene.children.filter(
      (c) => c instanceof THREE.Group && c.userData?.type === "mannequin",
    );
    expect(mannequinGroups).toHaveLength(1);
  });

  it("visible=false 的人偶不被添加到 scene", () => {
    const scene = makeScene({
      characters: [
        createDefaultMannequin("m1", "v1", "主角"),
        { ...createDefaultMannequin("m2", "v2", "配角"), visible: false },
      ],
    });
    const result = buildScene(scene, defaultOptions);

    const mannequinGroups = result.scene.children.filter(
      (c) => c instanceof THREE.Group && c.userData?.type === "mannequin",
    );
    expect(mannequinGroups).toHaveLength(1);
  });

  it("戏剧光类型添加额外侧光", () => {
    const scene = makeScene();
    scene.lighting = { ...scene.lighting, type: "dramatic" };
    const result = buildScene(scene, defaultOptions);

    const lights = result.scene.children.filter((c) => c instanceof THREE.Light);
    // dramatic: 1 主光 + 1 环境光 + 1 侧光 = 3
    expect(lights.length).toBe(3);
  });

  it("夜晚光类型添加冷色补光", () => {
    const scene = makeScene();
    scene.lighting = { ...scene.lighting, type: "night" };
    const result = buildScene(scene, defaultOptions);

    const lights = result.scene.children.filter((c) => c instanceof THREE.Light);
    // night: 1 主光 + 1 环境光 + 1 补光 = 3
    expect(lights.length).toBe(3);
  });

  it("常规光类型只有主光 + 环境光", () => {
    const scene = makeScene();
    scene.lighting = { ...scene.lighting, type: "daylight" };
    const result = buildScene(scene, defaultOptions);

    const lights = result.scene.children.filter((c) => c instanceof THREE.Light);
    expect(lights.length).toBe(2);
  });
});

// ============================================================================
// disposeScene — 资源释放
// ============================================================================

describe("disposeScene", () => {
  beforeEach(() => {
    mockWebGLRenderer.mockClear();
  });

  it("调用 renderer.dispose 和 forceContextLoss", () => {
    const scene = makeScene();
    const built = buildScene(scene, defaultOptions);
    const rendererMock = built.renderer as unknown as {
      dispose: ReturnType<typeof vi.fn>;
      forceContextLoss: ReturnType<typeof vi.fn>;
    };

    disposeScene(built);

    expect(rendererMock.dispose).toHaveBeenCalledTimes(1);
    expect(rendererMock.forceContextLoss).toHaveBeenCalledTimes(1);
  });

  it("清空 disposables 数组", () => {
    const scene = makeScene({
      props: [makeProp({ id: "p1", type: "box" })],
    });
    const built = buildScene(scene, defaultOptions);
    expect(built.disposables.length).toBeGreaterThan(0);

    disposeScene(built);

    expect(built.disposables).toHaveLength(0);
  });

  it("dispose 错误被静默忽略（不抛出）", () => {
    const scene = makeScene();
    const built = buildScene(scene, defaultOptions);
    // 在 disposables 中添加一个会抛错的 disposable
    const badDisposable = {
      dispose: vi.fn(() => {
        throw new Error("dispose 失败");
      }),
    };
    built.disposables.push(badDisposable);

    expect(() => disposeScene(built)).not.toThrow();
    expect(badDisposable.dispose).toHaveBeenCalled();
  });
});
