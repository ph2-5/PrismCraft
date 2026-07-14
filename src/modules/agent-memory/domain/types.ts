/**
 * Memory 领域类型定义（domain 层）
 *
 * 从 @/modules/agent/domain/types.ts 迁移至 @/modules/agent-memory（阶段2-d）。
 * agent/domain/types.ts 保留 re-export 保持向后兼容。
 *
 * 注意：AgentMessage 类型仍归属于 @/modules/agent（它是 Agent 核心类型，
 * 与 AgentSession 紧密耦合）。agent-memory 通过 `import type` 引用，
 * 编译时擦除，无运行时循环依赖（与阶段2-b agent-session 模式一致）。
 */

// ArchivalMemoryEntry 已提取到 @/domain/types/memory（供 vector-search 共享）
export type { ArchivalMemoryEntry } from "@/domain/types/memory";

/** 核心记忆：常驻 prompt 的小量关键信息 */
export interface CoreMemory {
  /** 用户偏好（键值对，如 preferred_style: "赛博朋克"） */
  preferences: Record<string, string | number | boolean>;
  /** 项目事实（带 key 的列表，便于按 key 更新/删除） */
  facts: MemoryFact[];
}

/** 项目事实条目 */
export interface MemoryFact {
  /** 事实键，如 "source_novel"、"target_duration" */
  key: string;
  /** 事实值 */
  value: string;
  /** 更新时间戳 */
  updatedAt: number;
}

/** LLM 自动抽取结果 */
export interface ExtractedMemory {
  /** 提取的偏好（会合并到核心记忆） */
  preferences: Record<string, string | number | boolean>;
  /** 提取的事实（会追加到核心记忆，同 key 覆盖） */
  facts: Array<{ key: string; value: string }>;
  /** 会话摘要（追加到归档记忆） */
  summary: string;
}
