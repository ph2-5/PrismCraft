/**
 * Task 2A.21: scene-io — BlockoutScene 文件导入/导出
 *
 * 提供场景数据的双向序列化能力：
 *
 * 导出：
 * - exportSceneAsGlb — BlockoutScene → GLB 二进制（给 Seedance 2.5 用，需要先 build Three.js Scene）
 * - exportSceneAsJson — BlockoutScene → JSON 字符串（数据所有权，可重新导入）
 *
 * 导入：
 * - importSceneFromJson — JSON 字符串 → BlockoutScene（含版本校验）
 * - importExternalModel — GLB/GLTF/OBJ → Three.js Scene（外部 3D 资产，不直接转为 BlockoutScene）
 *
 * 依赖 Three.js 的 GLTFExporter / GLTFLoader / OBJLoader（在浏览器/Electron 渲染进程可用）
 */

import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { writeFile, readFile, getCacheDirectory } from "@/shared/file-http";
import type { BlockoutScene } from "../domain/scene-schema";
import { buildScene, disposeScene } from "./scene-builder";

// ─── GLB 导出 ─────────────────────────────────────────────────────────────────

export interface GlbExportOptions {
  /** 是否动画（包含相机轨迹动画）— 当前未实现，预留 */
  animated?: boolean;
  /** 是否仅导出可见对象 */
  onlyVisible?: boolean;
  /** 是否包含网格 */
  binary?: boolean;
}

/**
 * 将 BlockoutScene 导出为 GLB 二进制文件。
 *
 * 流程：
 * 1. 通过 scene-builder 构建 Three.js Scene
 * 2. 通过 GLTFExporter 序列化为 GLB
 * 3. 写入指定路径或缓存目录
 *
 * 返回 GLB 文件本地路径，供 seedance-adapter 使用。
 */
export async function exportSceneAsGlb(
  blockout: BlockoutScene,
  outputPath?: string,
  options: GlbExportOptions = {},
): Promise<{ success: boolean; outputPath?: string; error?: string }> {
  const opts = { binary: true, onlyVisible: true, ...options };

  // 解析输出路径
  let glbPath = outputPath;
  if (!glbPath) {
    const cacheDir = await getCacheDirectory();
    if (!cacheDir.success || !cacheDir.path) {
      return { success: false, error: "无法获取缓存目录" };
    }
    glbPath = `${cacheDir.path}/blockout-3d/${blockout.id}_${Date.now()}.glb`;
  }

  // 构建 Three.js Scene
  const built = buildScene(blockout, {
    width: 100, // GLB 导出不需要真实分辨率
    height: 100,
    preserveDrawingBuffer: false,
  });

  try {
    // 导出为 GLB
    const exporter = new GLTFExporter();
    const glbBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      exporter.parse(
        built.scene,
        (result) => {
          if (result instanceof ArrayBuffer) {
            resolve(result);
          } else {
            // JSON 模式（不应该到这里，因为 binary=true）
            const json = JSON.stringify(result);
            const encoder = new TextEncoder();
            resolve(encoder.encode(json).buffer);
          }
        },
        (error) => reject(error),
        {
          binary: opts.binary,
          onlyVisible: opts.onlyVisible,
          embedImages: false,
        },
      );
    });

    // 写入文件
    const writeResult = await writeFile(glbPath, glbBuffer);
    if (!writeResult.success) {
      return { success: false, error: `写入 GLB 失败：${writeResult.error ?? "未知错误"}` };
    }

    return { success: true, outputPath: glbPath };
  } catch (e) {
    return {
      success: false,
      error: `GLB 导出失败：${e instanceof Error ? e.message : String(e)}`,
    };
  } finally {
    disposeScene(built);
  }
}

// ─── JSON 导出/导入 ──────────────────────────────────────────────────────────

export interface JsonExportOptions {
  /** 是否美化输出（默认 true） */
  pretty?: boolean;
}

/** 将 BlockoutScene 导出为 JSON 字符串 */
export function serializeSceneToJson(
  blockout: BlockoutScene,
  options: JsonExportOptions = {},
): string {
  return JSON.stringify(blockout, null, options.pretty === false ? 0 : 2);
}

/** 将 BlockoutScene 导出为 JSON 文件 */
export async function exportSceneAsJson(
  blockout: BlockoutScene,
  outputPath?: string,
  options: JsonExportOptions = {},
): Promise<{ success: boolean; outputPath?: string; error?: string }> {
  let jsonPath = outputPath;
  if (!jsonPath) {
    const cacheDir = await getCacheDirectory();
    if (!cacheDir.success || !cacheDir.path) {
      return { success: false, error: "无法获取缓存目录" };
    }
    jsonPath = `${cacheDir.path}/blockout-3d/${blockout.id}_${Date.now()}.json`;
  }

  const json = serializeSceneToJson(blockout, options);
  const writeResult = await writeFile(jsonPath, json);
  if (!writeResult.success) {
    return { success: false, error: `写入 JSON 失败：${writeResult.error ?? "未知错误"}` };
  }

  return { success: true, outputPath: jsonPath };
}

export interface JsonImportResult {
  success: boolean;
  scene?: BlockoutScene;
  error?: string;
}

/** 从 JSON 字符串导入 BlockoutScene（含版本校验） */
export function parseSceneFromJson(json: string): JsonImportResult {
  try {
    const parsed = JSON.parse(json) as BlockoutScene;
    return validateBlockoutScene(parsed);
  } catch (e) {
    return {
      success: false,
      error: `JSON 解析失败：${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/** 从 JSON 文件导入 BlockoutScene */
export async function importSceneFromJson(filePath: string): Promise<JsonImportResult> {
  const readResult = await readFile(filePath);
  if (!readResult || !readResult.success || !readResult.data) {
    return { success: false, error: `读取文件失败：${readResult?.error ?? "未知错误"}` };
  }

  // readResult.data 是 ArrayBuffer
  const text = new TextDecoder().decode(readResult.data);
  return parseSceneFromJson(text);
}

// ─── 外部模型导入（GLB/GLTF/OBJ → Three.js Scene） ──────────────────────────

export interface ExternalModelImportResult {
  success: boolean;
  /** Three.js Scene 对象（成功时） */
  scene?: THREE.Object3D;
  /** 模型包含的网格数 */
  meshCount?: number;
  /** 模型包含的材质数 */
  materialCount?: number;
  error?: string;
}

/**
 * 从文件加载外部 3D 模型（GLB/GLTF/OBJ）。
 *
 * 注意：此函数返回的是 Three.js Scene，不是 BlockoutScene。
 * 外部模型通常包含复杂网格，无法直接转换为 BlockoutScene 的 primitive 表示。
 * 用户可将外部模型作为参考显示在 3D 视图中，但不参与 Seedance 2.5 白模输入。
 */
export async function importExternalModel(
  filePath: string,
): Promise<ExternalModelImportResult> {
  const ext = filePath.toLowerCase().split(".").pop();

  try {
    switch (ext) {
      case "glb":
      case "gltf":
        return await loadGltfModel(filePath);
      case "obj":
        return await loadObjModel(filePath);
      default:
        return {
          success: false,
          error: `不支持的模型格式：${ext ?? "未知"}（仅支持 .glb/.gltf/.obj）`,
        };
    }
  } catch (e) {
    return {
      success: false,
      error: `模型加载失败：${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

async function loadGltfModel(filePath: string): Promise<ExternalModelImportResult> {
  // 读取文件
  const readResult = await readFile(filePath);
  if (!readResult || !readResult.success || !readResult.data) {
    return { success: false, error: `读取文件失败：${readResult?.error ?? "未知错误"}` };
  }

  // readResult.data 是 ArrayBuffer
  const buffer = readResult.data;

  const loader = new GLTFLoader();
  const gltf = await new Promise<{ scene: THREE.Object3D }>((resolve, reject) => {
    loader.parse(
      buffer,
      "",
      (gltf) => resolve(gltf),
      (error) => reject(error),
    );
  });

  const stats = countMeshesAndMaterials(gltf.scene);
  return {
    success: true,
    scene: gltf.scene,
    meshCount: stats.meshCount,
    materialCount: stats.materialCount,
  };
}

async function loadObjModel(filePath: string): Promise<ExternalModelImportResult> {
  const readResult = await readFile(filePath);
  if (!readResult || !readResult.success || !readResult.data) {
    return { success: false, error: `读取文件失败：${readResult?.error ?? "未知错误"}` };
  }

  // readResult.data 是 ArrayBuffer
  const text = new TextDecoder().decode(readResult.data);

  const loader = new OBJLoader();
  const scene = loader.parse(text);
  const stats = countMeshesAndMaterials(scene);

  return {
    success: true,
    scene,
    meshCount: stats.meshCount,
    materialCount: stats.materialCount,
  };
}

function countMeshesAndMaterials(obj: THREE.Object3D): { meshCount: number; materialCount: number } {
  let meshCount = 0;
  const materials = new Set<THREE.Material>();

  obj.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      meshCount++;
      const mat = child.material;
      if (Array.isArray(mat)) {
        for (const m of mat) materials.add(m);
      } else if (mat) {
        materials.add(mat);
      }
    }
  });

  return { meshCount, materialCount: materials.size };
}

// ─── 校验 ───────────────────────────────────────────────────────────────────

/** 校验 BlockoutScene 数据完整性（用于从 JSON 导入时） */
export function validateBlockoutScene(scene: unknown): JsonImportResult {
  if (!scene || typeof scene !== "object") {
    return { success: false, error: "场景数据不是有效对象" };
  }

  const s = scene as Record<string, unknown>;

  if (s.version !== 1) {
    return { success: false, error: `不支持的版本：${s.version ?? "未知"}（仅支持 1）` };
  }

  if (typeof s.id !== "string" || !s.id) {
    return { success: false, error: "场景 ID 缺失或非字符串" };
  }

  if (typeof s.name !== "string") {
    return { success: false, error: "场景 name 缺失或非字符串" };
  }

  if (!s.ground || typeof s.ground !== "object") {
    return { success: false, error: "ground 字段缺失或非对象" };
  }

  if (!Array.isArray(s.props)) {
    return { success: false, error: "props 字段缺失或非数组" };
  }

  if (!Array.isArray(s.characters)) {
    return { success: false, error: "characters 字段缺失或非数组" };
  }

  if (!s.camera || typeof s.camera !== "object") {
    return { success: false, error: "camera 字段缺失或非对象" };
  }

  if (!s.lighting || typeof s.lighting !== "object") {
    return { success: false, error: "lighting 字段缺失或非对象" };
  }

  return { success: true, scene: scene as BlockoutScene };
}
