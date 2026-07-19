/**
 * Task 2A.21: scene-builder — BlockoutScene → Three.js Scene
 *
 * 将 provider-agnostic 的 BlockoutScene 数据结构转换为 Three.js Scene 对象。
 *
 * 渲染策略：
 * - flat-shaded 灰模 — 不需要纹理/PBR，仅表达空间结构
 * - 每个 PrimitiveShape → BoxGeometry / CylinderGeometry / SphereGeometry 等
 * - 每个 Mannequin → CapsuleGeometry（按姿势/身高缩放）
 * - 地面 → PlaneGeometry（带可选 GridHelper）
 * - 灯光 → DirectionalLight + AmbientLight（按 LightingPreset 配置）
 *
 * 设计要点：
 * - 动态 import three — 首屏不加载 Three.js，仅在用户进入 3D 白模 Tab 时加载
 * - 无副作用 — 同一 BlockoutScene 输入始终生成等价 Scene
 * - 资源可释放 — buildScene 返回的 Scene 可通过 disposeScene 释放 GPU 资源
 */

import * as THREE from "three";
import type {
  BlockoutScene,
  GroundPlane,
  PrimitiveShape,
  LightingPreset,
  ShotCamera,
} from "../domain/scene-schema";
import type { Mannequin } from "../domain/mannequin-types";
import { POSE_PRESETS, getMannequinHeight, getMannequinWidth } from "../domain/mannequin-types";
import { getMannequinGeometry } from "./mannequin-service";
import type { CameraPose } from "./camera-animator";

// ─── 公共类型 ─────────────────────────────────────────────────────────────────

/** 可释放资源接口（Three.js 中的 geometry / material / renderer 等都实现此接口） */
export interface Disposable {
  dispose(): void;
}

export interface BuiltScene {
  /** Three.js Scene 对象（包含地面/道具/人偶/灯光） */
  scene: THREE.Scene;
  /** 相机（PerspectiveCamera）— 已根据 BlockoutScene.camera 配置 */
  camera: THREE.PerspectiveCamera;
  /** 渲染器（WebGLRenderer）— 调用方负责挂载到 canvas 并 dispose */
  renderer: THREE.WebGLRenderer;
  /** 资源追踪列表 — 用于 disposeScene 释放 */
  disposables: Disposable[];
}

// ─── 渲染配置 ─────────────────────────────────────────────────────────────────

export interface SceneBuilderOptions {
  /** 画布宽度（像素） */
  width: number;
  /** 画布高度（像素） */
  height: number;
  /** 是否启用抗锯齿（默认 true） */
  antialias?: boolean;
  /** 渲染器像素比（默认 window.devicePixelRatio） */
  pixelRatio?: number;
  /** 背景色（默认透明） */
  clearColor?: number;
  /** 背景透明度（默认 0） */
  clearAlpha?: number;
  /** 是否保留 drawing buffer（默认 false，离屏渲染 PNG 时设为 true） */
  preserveDrawingBuffer?: boolean;
}

const DEFAULT_OPTIONS: Required<Omit<SceneBuilderOptions, "clearColor">> = {
  width: 800,
  height: 600,
  antialias: true,
  pixelRatio: typeof window !== "undefined" ? window.devicePixelRatio : 1,
  clearAlpha: 0,
  preserveDrawingBuffer: false,
};

// ─── 主构建函数 ───────────────────────────────────────────────────────────────

/**
 * 构建 Three.js Scene + Camera + Renderer。
 *
 * 调用方职责：
 * 1. 持有返回的 renderer，将 renderer.domElement 挂载到 DOM
 * 2. 调用 renderer.render(scene, camera) 渲染
 * 3. 不再使用时调用 disposeScene(result) 释放资源
 */
export function buildScene(
  blockout: BlockoutScene,
  options: SceneBuilderOptions,
): BuiltScene {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const disposables: Disposable[] = [];

  // ── Scene ──
  const scene = new THREE.Scene();
  if (opts.clearColor !== undefined) {
    scene.background = new THREE.Color(opts.clearColor);
  }

  // ── Camera ──
  const aspect = opts.width / opts.height;
  const camera = new THREE.PerspectiveCamera(blockout.camera.fov, aspect, 0.1, 1000);
  applyCameraPose(camera, {
    position: blockout.camera.position,
    target: blockout.camera.target,
    fov: blockout.camera.fov,
  });

  // ── Renderer ──
  const renderer = new THREE.WebGLRenderer({
    antialias: opts.antialias,
    alpha: opts.clearAlpha === 0,
    preserveDrawingBuffer: opts.preserveDrawingBuffer,
  });
  renderer.setPixelRatio(opts.pixelRatio);
  renderer.setSize(opts.width, opts.height);
  if (opts.clearColor !== undefined) {
    renderer.setClearColor(opts.clearColor, opts.clearAlpha);
  } else {
    renderer.setClearColor(0x000000, 0);
  }

  // ── 灯光 ──
  const lights = buildLights(blockout.lighting);
  for (const light of lights) {
    scene.add(light);
  }

  // ── 地面 ──
  const ground = buildGround(blockout.ground, disposables);
  scene.add(ground);

  // ── 道具 ──
  for (const prop of blockout.props) {
    if (prop.visible === false) continue;
    const mesh = buildPropMesh(prop, disposables);
    scene.add(mesh);
  }

  // ── 人偶 ──
  for (const mannequin of blockout.characters) {
    if (mannequin.visible === false) continue;
    const mesh = buildMannequinMesh(mannequin, disposables);
    scene.add(mesh);
  }

  return { scene, camera, renderer, disposables };
}

// ─── 相机位姿应用 ─────────────────────────────────────────────────────────────

/** 把 CameraPose（位置 + 目标 + FOV）应用到 Three.js PerspectiveCamera */
export function applyCameraPose(
  camera: THREE.PerspectiveCamera,
  pose: CameraPose,
): void {
  camera.position.set(pose.position.x, pose.position.y, pose.position.z);
  camera.lookAt(pose.target.x, pose.target.y, pose.target.z);
  if (pose.fov !== camera.fov) {
    camera.fov = pose.fov;
    camera.updateProjectionMatrix();
  }
}

/** 应用 ShotCamera（静态相机配置） */
export function applyShotCamera(
  camera: THREE.PerspectiveCamera,
  shot: ShotCamera,
): void {
  applyCameraPose(camera, {
    position: shot.position,
    target: shot.target,
    fov: shot.fov,
  });
  if (shot.roll) {
    camera.rotateZ((shot.roll * Math.PI) / 180);
  }
}

// ─── 灯光构建 ─────────────────────────────────────────────────────────────────

function buildLights(preset: LightingPreset): THREE.Light[] {
  const lights: THREE.Light[] = [];

  // 主光源（平行光 — 模拟太阳）
  const directional = new THREE.DirectionalLight(
    preset.sunColor ?? 0xffffff,
    preset.intensity ?? 1.2,
  );

  // 根据 azimuth / elevation 计算光源位置
  const azimuth = (preset.sunAzimuth ?? 45) * Math.PI / 180;
  const elevation = (preset.sunElevation ?? 60) * Math.PI / 180;
  const radius = 20;
  directional.position.set(
    radius * Math.cos(elevation) * Math.sin(azimuth),
    radius * Math.sin(elevation),
    radius * Math.cos(elevation) * Math.cos(azimuth),
  );
  lights.push(directional);

  // 环境光
  const ambient = new THREE.AmbientLight(
    preset.ambientColor ?? 0xffffff,
    preset.ambientIntensity ?? 0.4,
  );
  lights.push(ambient);

  // 戏剧光：增加侧光
  if (preset.type === "dramatic") {
    const rim = new THREE.DirectionalLight(0xffd700, 0.6);
    rim.position.set(-10, 5, -10);
    lights.push(rim);
  }

  // 夜晚：增加冷色补光
  if (preset.type === "night") {
    const fill = new THREE.DirectionalLight(0x4a6afa, 0.3);
    fill.position.set(-5, 8, 5);
    lights.push(fill);
  }

  return lights;
}

// ─── 地面构建 ─────────────────────────────────────────────────────────────────

function buildGround(ground: GroundPlane, disposables: Disposable[]): THREE.Object3D {
  const group = new THREE.Group();
  group.name = "ground";

  const { width, depth } = ground.size;

  // 地面平面
  const planeGeo = new THREE.PlaneGeometry(width, depth);
  disposables.push(planeGeo);
  const planeMat = new THREE.MeshStandardMaterial({
    color: ground.color ?? 0x3a3a3a,
    roughness: 0.9,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
  disposables.push(planeMat);
  const planeMesh = new THREE.Mesh(planeGeo, planeMat);
  planeMesh.rotation.x = -Math.PI / 2; // 水平
  planeMesh.name = "ground-plane";
  group.add(planeMesh);

  // 网格线（可选）
  if (ground.showGrid) {
    const grid = new THREE.GridHelper(
      Math.max(width, depth),
      Math.max(width, depth),
      0x666666,
      0x444444,
    );
    // GridHelper 内部创建了 geometry 和 material，需要追踪以便 dispose
    if ("geometry" in grid) disposables.push(grid.geometry as THREE.BufferGeometry);
    if ("material" in grid) {
      const mat = grid.material;
      if (Array.isArray(mat)) {
        for (const m of mat) disposables.push(m as THREE.Material);
      } else {
        disposables.push(mat as THREE.Material);
      }
    }
    grid.name = "ground-grid";
    group.add(grid);
  }

  return group;
}

// ─── 道具 mesh 构建 ───────────────────────────────────────────────────────────

function buildPropMesh(prop: PrimitiveShape, disposables: Disposable[]): THREE.Mesh {
  const geometry = buildPropGeometry(prop.type);
  disposables.push(geometry);

  const material = new THREE.MeshStandardMaterial({
    color: parseColor(prop.color ?? 0x808080),
    roughness: 0.7,
    metalness: 0.1,
    flatShading: true,
  });
  disposables.push(material);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(prop.position.x, prop.position.y, prop.position.z);
  mesh.rotation.y = (prop.rotationY * Math.PI) / 180;
  mesh.scale.set(prop.scale.x, prop.scale.y, prop.scale.z);
  mesh.name = prop.label ?? prop.id;
  mesh.userData = { propId: prop.id, type: "prop" };

  return mesh;
}

function buildPropGeometry(type: PrimitiveShape["type"]): THREE.BufferGeometry {
  switch (type) {
    case "box":
      return new THREE.BoxGeometry(1, 1, 1);
    case "cylinder":
      return new THREE.CylinderGeometry(0.5, 0.5, 1, 16);
    case "sphere":
      return new THREE.SphereGeometry(0.5, 16, 12);
    case "plane":
      return new THREE.PlaneGeometry(1, 1);
    case "cone":
      return new THREE.ConeGeometry(0.5, 1, 16);
    case "torus":
      return new THREE.TorusGeometry(0.5, 0.18, 8, 24);
    default:
      return new THREE.BoxGeometry(1, 1, 1);
  }
}

// ─── 人偶 mesh 构建 ───────────────────────────────────────────────────────────

/**
 * 构建人偶 mesh — 简化的灰色人形 placeholder
 *
 * 设计：
 * - 主体：CapsuleGeometry（身体）
 * - 头部：SphereGeometry
 * - 不携带骨骼 — 仅表达空间位置/朝向/姿势/比例
 * - 姿势通过 heightFactor/widthFactor 缩放表达（不模拟骨骼动作）
 */
function buildMannequinMesh(mannequin: Mannequin, disposables: Disposable[]): THREE.Group {
  const group = new THREE.Group();
  group.name = mannequin.displayName ?? mannequin.id;

  const geom = getMannequinGeometry(mannequin);
  const poseMeta = POSE_PRESETS[mannequin.pose];

  const bodyHeight = geom.height * 0.7;
  const bodyRadius = Math.max(0.1, geom.width / 2);
  const headRadius = Math.max(0.08, bodyRadius * 0.7);

  // 身体（胶囊）
  const bodyGeo = new THREE.CapsuleGeometry(bodyRadius, bodyHeight, 4, 8);
  disposables.push(bodyGeo);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: parseColor(getMannequinColor(mannequin)),
    roughness: 0.8,
    metalness: 0.0,
    flatShading: true,
  });
  disposables.push(bodyMat);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = bodyHeight / 2 + bodyRadius;
  group.add(body);

  // 头部（球）
  const headGeo = new THREE.SphereGeometry(headRadius, 12, 8);
  disposables.push(headGeo);
  const head = new THREE.Mesh(headGeo, bodyMat); // 复用材质
  head.position.y = bodyHeight + bodyRadius * 2 + headRadius * 0.5;
  group.add(head);

  // 朝向标识（小三角锥，指示正面方向）
  if (poseMeta.silhouette === "upright" || poseMeta.silhouette === "extended") {
    const arrowGeo = new THREE.ConeGeometry(0.08, 0.25, 4);
    disposables.push(arrowGeo);
    const arrowMat = new THREE.MeshStandardMaterial({
      color: 0xff5555,
      roughness: 0.6,
      flatShading: true,
    });
    disposables.push(arrowMat);
    const arrow = new THREE.Mesh(arrowGeo, arrowMat);
    arrow.position.set(0, bodyHeight + bodyRadius * 2 + headRadius * 0.5, headRadius + 0.2);
    arrow.rotation.x = Math.PI / 2;
    group.add(arrow);
  }

  // 应用整体变换
  group.position.set(geom.center.x, 0, geom.center.z);
  group.rotation.y = geom.rotationRad;

  // 躺卧姿势：将整个 group 旋转
  if (poseMeta.silhouette === "low") {
    group.rotation.z = Math.PI / 2;
    group.position.y = geom.height / 2;
  }

  group.userData = { mannequinId: mannequin.id, type: "mannequin" };
  return group;
}

/** 根据人偶 ID 生成稳定的颜色（用于区分不同人偶） */
function getMannequinColor(mannequin: Mannequin): number {
  // 灰色基调 + 基于 ID 的轻微色调变化
  const hash = hashString(mannequin.id);
  const hue = (hash % 60) - 30; // -30 到 30 度，接近灰色
  return hslToColorInt(hue, 0.1, 0.5);
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function hslToColorInt(h: number, s: number, l: number): number {
  const c = new THREE.Color().setHSL((h + 360) / 360, s, l);
  return c.getHex();
}

// ─── 颜色解析 ─────────────────────────────────────────────────────────────────

function parseColor(color: string | number): number {
  if (typeof color === "number") return color;
  if (typeof color === "string") {
    if (color.startsWith("#")) {
      return parseInt(color.slice(1), 16);
    }
    if (color.startsWith("rgb")) {
      const c = new THREE.Color(color);
      return c.getHex();
    }
    // 命名色
    const c = new THREE.Color(color);
    return c.getHex();
  }
  return 0x808080;
}

// ─── 资源释放 ─────────────────────────────────────────────────────────────────

/**
 * 释放 buildScene 返回的 Scene 资源。
 *
 * 调用方在组件卸载或不再渲染该场景时必须调用此函数，
 * 避免内存泄漏。
 */
export function disposeScene(built: BuiltScene): void {
  for (const d of built.disposables) {
    try {
      d.dispose();
    } catch {
      // 忽略 dispose 错误
    }
  }
  built.disposables.length = 0;

  // 清理 scene 中所有 mesh 的 geometry / material
  built.scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry?.dispose();
      const mat = obj.material;
      if (Array.isArray(mat)) {
        for (const m of mat) m.dispose();
      } else if (mat) {
        mat.dispose();
      }
    }
  });

  // 释放渲染器
  built.renderer.dispose();
  built.renderer.forceContextLoss();
}

// ─── 场景统计 ─────────────────────────────────────────────────────────────────

export interface SceneStats {
  propCount: number;
  mannequinCount: number;
  visiblePropCount: number;
  visibleMannequinCount: number;
  triangleCount: number;
}

/** 统计场景中可见对象数和三角形数（用于性能提示） */
export function computeSceneStats(blockout: BlockoutScene): SceneStats {
  let triangleCount = 0;
  let visiblePropCount = 0;

  for (const prop of blockout.props) {
    if (prop.visible === false) continue;
    visiblePropCount++;
    triangleCount += estimatePropTriangles(prop.type);
  }

  let visibleMannequinCount = 0;
  for (const m of blockout.characters) {
    if (m.visible === false) continue;
    visibleMannequinCount++;
    triangleCount += 100; // 人偶约 100 三角形
  }

  return {
    propCount: blockout.props.length,
    mannequinCount: blockout.characters.length,
    visiblePropCount,
    visibleMannequinCount,
    triangleCount,
  };
}

function estimatePropTriangles(type: PrimitiveShape["type"]): number {
  switch (type) {
    case "box": return 12;
    case "cylinder": return 32;
    case "sphere": return 96;
    case "plane": return 2;
    case "cone": return 16;
    case "torus": return 192;
    default: return 12;
  }
}

// ─── 重新导出 ─────────────────────────────────────────────────────────────────

export { getMannequinHeight, getMannequinWidth };
