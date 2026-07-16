/**
 * Help Tools 共享辅助函数
 *
 * 包含多个 help 工具文件共用的辅助函数，从 help-tools-data.ts 拆分而来。
 * - safeParseJson：安全 JSON 解析（用于解析 LLM 返回的 JSON 片段）
 */

import { extractJsonObject, extractJsonArray } from "@/shared-logic/json";

/** 安全解析 JSON（从文本中提取第一个 JSON 对象或数组） */
export function safeParseJson<T>(text: string): T | null {
  try {
    const trimmed = text.trim();
    // 直接尝试解析
    const direct = JSON.parse(trimmed) as T;
    return direct;
  } catch {
    // 尝试从文本中提取 JSON 片段
    try {
      const objMatch = extractJsonObject(text);
      if (objMatch) {
        return JSON.parse(objMatch) as T;
      }
      const arrMatch = extractJsonArray(text);
      if (arrMatch) {
        return JSON.parse(arrMatch) as T;
      }
    } catch {
      // ignore
    }
    return null;
  }
}
