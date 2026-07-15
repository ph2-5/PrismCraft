/**
 * Skill 路由表 + 注册器（Task 1.4 v5.3 增强）
 *
 * 本文件属于 shared-logic 层，零外部依赖。
 * 所有类型使用 inline 字面量定义，不导入项目其他层。
 *
 * 设计借鉴 seedance-2.0（MIT 许可）的 Skill 路由模式：
 * - 用户消息 → routeSkill() 按 matchers 关键词匹配 → 返回对应 Skill
 * - Skill.buildInstructions(ctx) 构建该 Skill 的指令片段，拼入 system prompt
 * - 4 个核心 Skill：interview（模糊想法）/ prompt（清晰概念）/ compress（压缩）/ troubleshoot（诊断）
 * - 扩展 Skill（Task 4.7 v5.3 增强）：camera/lighting/characters/style/vfx/audio
 *
 * 注册时机：模块加载时自动注册 4 个核心 Skill。扩展 Skill 由调用方按需注册
 *（见 src/modules/prompt/prompt-recipes/recipe-skill-mapper.ts）。
 */

// === 类型定义（自包含，不依赖外部） ===

export type ProjectType = "ancient" | "modern" | "scifi" | "fantasy" | "unknown";

export type FailureDimension =
  | "camera"
  | "lighting"
  | "motion"
  | "character"
  | "duration"
  | "composition"
  | "audio"
  | "safety";

export interface FailureContext {
  dimension: FailureDimension;
  issue: string;
  prompt?: string;
}

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

export interface AgentContext {
  userMessage: string;
  projectType?: ProjectType;
  recentFailures?: FailureContext[];
  conversationHistory?: ConversationTurn[];
}

export interface Skill {
  /** Skill 唯一标识 */
  id: string;
  /** 关键词列表（小写），用于 routeSkill 匹配。空数组表示默认 fallback Skill */
  matchers: string[];
  /** 构建该 Skill 的指令片段，拼入 system prompt */
  buildInstructions(ctx: AgentContext): string;
}

// === Skill 注册器 ===

const skillRegistry = new Map<string, Skill>();

/** 注册一个 Skill。重复注册会覆盖旧值 */
export function registerSkill(skill: Skill): void {
  skillRegistry.set(skill.id, skill);
}

/** 按 id 获取 Skill */
export function getSkill(id: string): Skill | undefined {
  return skillRegistry.get(id);
}

/** 列出所有已注册 Skill */
export function listSkills(): Skill[] {
  return Array.from(skillRegistry.values());
}

/** 清空注册表（仅用于测试） */
export function clearSkills(): void {
  skillRegistry.clear();
}

/**
 * 按 matchers 关键词匹配 Skill。
 *
 * 匹配规则：
 * 1. 遍历注册表，返回第一个 matchers 命中用户消息的 Skill
 * 2. 无命中时返回 id="prompt" 的默认 Skill
 * 3. 若 prompt Skill 也未注册，返回注册表中第一个 Skill；若注册表为空，抛错
 *
 * 注意：注册顺序影响优先级。核心 Skill 注册顺序为
 * troubleshoot > interview > compress > prompt，确保诊断/引导意图优先命中。
 */
export function routeSkill(userMessage: string): Skill {
  const msg = userMessage.toLowerCase();
  for (const skill of skillRegistry.values()) {
    if (skill.matchers.length > 0 && skill.matchers.some((m) => msg.includes(m.toLowerCase()))) {
      return skill;
    }
  }
  const fallback = skillRegistry.get("prompt");
  if (fallback) return fallback;
  const first = Array.from(skillRegistry.values())[0];
  if (first) return first;
  throw new Error("[routeSkill] no Skill registered");
}

// === 自动注册内置核心 Skill ===
// import 必须在顶部，但为避免循环依赖，各 Skill 文件仅用 `import type` 导入本文件类型，
// 运行时不反向依赖，因此此处 import 是安全的单向依赖。

// re-export 各核心 Skill，供外部按需导入
export { interviewSkill } from "./interview-skill";
export { promptSkill } from "./prompt-skill";
export { compressSkill } from "./compress-skill";
export { troubleshootSkill } from "./troubleshoot-skill";

import { interviewSkill } from "./interview-skill";
import { promptSkill } from "./prompt-skill";
import { compressSkill } from "./compress-skill";
import { troubleshootSkill } from "./troubleshoot-skill";

// 注册顺序决定 routeSkill 的匹配优先级：
// troubleshoot（诊断）→ interview（引导）→ compress（压缩）→ prompt（默认）
registerSkill(troubleshootSkill);
registerSkill(interviewSkill);
registerSkill(compressSkill);
registerSkill(promptSkill);
