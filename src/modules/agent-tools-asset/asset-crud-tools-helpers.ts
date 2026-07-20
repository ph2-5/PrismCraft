/**
 * 素材 CRUD 工具的辅助函数（内部使用）
 *
 * 包含：
 * - 参数类型转换（unknown → 目标类型）
 * - 字符串相似度算法（Levenshtein 距离）
 *
 * 设计要点：
 * - 纯函数，无副作用，便于测试
 * - 所有函数都不依赖外部模块，可独立复用
 */

/** appearance 对象类型 */
export interface AppearanceInput {
  hairColor: string;
  hairStyle: string;
  eyeColor: string;
  height: string;
  build: string;
  clothing: string;
}

/** camera 对象类型（匹配 SceneCamera schema） */
export interface CameraInput {
  position?: string;
  angle?: string;
  zoom?: number;
  distance?: string;
  movement?: string;
}

/**
 * 将未知值转为字符串数组
 * 支持字符串（按 、，, 分隔）或字符串数组
 */
export function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v)).filter(Boolean);
  }
  if (value === undefined || value === null) {
    return [];
  }
  return String(value)
    .split(/[、，,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 将未知值转为 lighting 字符串
 * sceneSchema 中 lighting 为 string 类型，支持传入对象自动拼接
 */
export function toLightingString(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const parts: string[] = [];
    if (obj.type) parts.push(String(obj.type));
    if (obj.intensity) parts.push(String(obj.intensity));
    if (obj.color) parts.push(String(obj.color));
    return parts.join(", ");
  }
  return String(value);
}

/** 将未知值转为 appearance 对象（匹配 CharacterAppearance schema） */
export function toAppearance(value: unknown): AppearanceInput {
  const empty: AppearanceInput = {
    hairColor: "",
    hairStyle: "",
    eyeColor: "",
    height: "",
    build: "",
    clothing: "",
  };
  if (!value || typeof value !== "object") {
    return empty;
  }
  const obj = value as Record<string, unknown>;
  return {
    hairColor: obj.hairColor !== undefined ? String(obj.hairColor) : "",
    hairStyle: obj.hairStyle !== undefined ? String(obj.hairStyle) : "",
    eyeColor: obj.eyeColor !== undefined ? String(obj.eyeColor) : "",
    height: obj.height !== undefined ? String(obj.height) : "",
    build: obj.build !== undefined ? String(obj.build) : "",
    clothing: obj.clothing !== undefined ? String(obj.clothing) : "",
  };
}

/** 将未知值转为 camera 对象 */
export function toCamera(value: unknown): CameraInput | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const obj = value as Record<string, unknown>;
  const camera: CameraInput = {};
  if (obj.angle !== undefined) camera.angle = String(obj.angle);
  if (obj.movement !== undefined) camera.movement = String(obj.movement);
  if (obj.position !== undefined) camera.position = String(obj.position);
  if (obj.zoom !== undefined) camera.zoom = Number(obj.zoom);
  if (obj.distance !== undefined) camera.distance = String(obj.distance);
  return camera;
}

/** 计算两个字符串的 Levenshtein 距离（滚动数组优化） */
export function levenshteinDistance(s1: string, s2: string): number {
  const len1 = s1.length;
  const len2 = s2.length;
  if (len1 === 0) return len2;
  if (len2 === 0) return len1;

  let prev = new Array<number>(len2 + 1).fill(0);
  let curr = new Array<number>(len2 + 1).fill(0);
  for (let j = 0; j <= len2; j++) prev[j] = j;

  for (let i = 1; i <= len1; i++) {
    curr[0] = i;
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        (prev[j] ?? 0) + 1,
        (curr[j - 1] ?? 0) + 1,
        (prev[j - 1] ?? 0) + cost,
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[len2] ?? 0;
}

/** 计算两个字符串的相似度（0-1，1 表示完全相同） */
export function stringSimilarity(s1: string, s2: string): number {
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(s1, s2) / maxLen;
}
