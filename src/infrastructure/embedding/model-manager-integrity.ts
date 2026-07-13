/**
 * 本地 Embedding 模型管理器 — 完整性校验
 *
 * 从 model-manager.ts 拆分而来，包含：
 * - findOnnxFile：在候选 ONNX 文件名中查找第一个存在的文件
 * - verifyOnnxIntegrity：校验 ONNX 文件完整性（magic byte + 大小）
 * - verifyTokenizerIntegrity：校验 tokenizer.json 完整性（JSON + 必需字段）
 * - verifyConfigIntegrity：校验 config.json 完整性（modelName + dimensions）
 *
 * 设计要点：
 * - 纯函数，仅依赖 @/shared/file-http 的 readFile/fileExists
 * - 不依赖 registry，可被 model-manager.ts 和测试独立调用
 */

import { fileExists, readFile } from "@/shared/file-http";
import {
  ONNX_FILE_CANDIDATES,
  MIN_ONNX_SIZE,
  PROTOBUF_MAGIC_BYTE,
} from "./model-manager-types";

// ============= 文件查找 =============

/**
 * 在候选 ONNX 文件名中查找第一个存在的文件
 *
 * M1：按 ONNX_FILE_CANDIDATES 顺序尝试，找到即返回。
 * 支持用户拖入量化变体（model_quantized.onnx 等）。
 *
 * @returns { path, fileName } 或 null（无任何 ONNX 文件）
 */
export async function findOnnxFile(
  dir: string,
): Promise<{ path: string; fileName: string } | null> {
  for (const fileName of ONNX_FILE_CANDIDATES) {
    const filePath = `${dir}/${fileName}`;
    if (await fileExists(filePath)) {
      return { path: filePath, fileName };
    }
  }
  return null;
}

// ============= 完整性校验（M3，保留） =============

/**
 * 校验 ONNX 文件完整性
 *
 * ONNX 文件是 protobuf 序列化格式：
 * - 第一个字节通常是 0x08（field 1, varint wire type）
 * - 或文件大小 > 1KB（保守阈值，避免空文件/损坏文件）
 *
 * @returns 错误消息（null 表示通过）
 */
export async function verifyOnnxIntegrity(filePath: string): Promise<string | null> {
  const result = await readFile(filePath);
  if (!result?.success || !result.data) {
    return "无法读取 ONNX 文件";
  }

  const bytes = new Uint8Array(result.data);
  if (bytes.length < MIN_ONNX_SIZE) {
    return `ONNX 文件过小（${bytes.length} 字节，期望 ≥ ${MIN_ONNX_SIZE}）`;
  }

  // protobuf magic byte 检查（0x08 = field 1, wire type 0/varint）
  // 部分 ONNX 文件可能以其他 field 开头，故只对明显非 protobuf 的文件报错
  if (bytes[0] !== PROTOBUF_MAGIC_BYTE && bytes[0] !== 0x0a && bytes[0] !== 0x12) {
    // 0x0a = field 1, wire type 2/length-delimited
    // 0x12 = field 2, wire type 2/length-delimited
    return `ONNX magic byte 异常（0x${bytes[0]!.toString(16).padStart(2, "0")}）`;
  }

  return null;
}

/**
 * 校验 tokenizer.json 完整性
 *
 * 必须是合法 JSON，且包含以下任一关键字段：
 * - model.model_type（如 "bert"、"mpnet"）
 * - vocab 或 model.vocab（词表）
 *
 * @returns 错误消息（null 表示通过）
 */
export async function verifyTokenizerIntegrity(filePath: string): Promise<string | null> {
  const result = await readFile(filePath);
  if (!result?.success || !result.data) {
    return "无法读取 tokenizer.json";
  }

  let parsed: unknown;
  try {
    const text = new TextDecoder().decode(result.data);
    parsed = JSON.parse(text);
  } catch (e) {
    return `tokenizer.json 不是合法 JSON：${e instanceof Error ? e.message : String(e)}`;
  }

  if (!parsed || typeof parsed !== "object") {
    return "tokenizer.json 顶层不是对象";
  }

  const obj = parsed as Record<string, unknown>;
  const hasModelType =
    obj.model && typeof obj.model === "object" && "model_type" in (obj.model as object);
  const hasVocab = "vocab" in obj || (obj.model && "vocab" in (obj.model as object));

  if (!hasModelType && !hasVocab) {
    return "tokenizer.json 缺少 model.model_type 或 vocab 字段";
  }

  return null;
}

/**
 * 校验 config.json 完整性
 *
 * 必须包含：
 * - modelName: 非空字符串
 * - dimensions: 正整数
 *
 * @returns 错误消息（null 表示通过）；同时返回解析后的配置
 */
export async function verifyConfigIntegrity(
  filePath: string,
): Promise<{ error: string | null; config: Record<string, unknown> | null }> {
  const result = await readFile(filePath);
  if (!result?.success || !result.data) {
    return { error: "无法读取 config.json", config: null };
  }

  let parsed: unknown;
  try {
    const text = new TextDecoder().decode(result.data);
    parsed = JSON.parse(text);
  } catch (e) {
    return {
      error: `config.json 不是合法 JSON：${e instanceof Error ? e.message : String(e)}`,
      config: null,
    };
  }

  if (!parsed || typeof parsed !== "object") {
    return { error: "config.json 顶层不是对象", config: null };
  }

  const config = parsed as Record<string, unknown>;

  if (typeof config.modelName !== "string" || !config.modelName.trim()) {
    return { error: "config.json 缺少 modelName（非空字符串）", config: null };
  }

  const dims = Number(config.dimensions);
  if (!Number.isFinite(dims) || dims <= 0 || !Number.isInteger(dims)) {
    return { error: "config.json dimensions 必须是正整数", config: null };
  }

  return { error: null, config };
}
