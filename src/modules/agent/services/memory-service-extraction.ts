/**
 * 记忆抽取与摘要（Memory Extraction & Summarization）
 *
 * 从 memory-service.ts 拆分而来，包含：
 * - extractFromConversation：从对话中自动抽取记忆
 * - applyExtractedMemory：应用抽取结果到记忆系统
 * - summarizeConversation：摘要对话历史（P2 上下文摘要压缩）
 *
 * 设计要点：
 * - 使用 lazy import 获取 memory-service.ts 的 storage 函数，避免循环依赖
 * - 通过 DI container 获取 textProvider（用于 LLM 文本生成）
 * - 失败时不抛异常，返回 null（不阻断 Agent Loop）
 */

import { container } from "@/infrastructure/di";
import type { AgentMessage, ExtractedMemory } from "../domain/types";

// ============= 常量（与 memory-service.ts 保持一致） =============

/** 核心记忆 facts 最大条数（与 memory-service.ts 同步） */
const MAX_FACTS_COUNT = 20;

// ============= 工具函数 =============

/**
 * Lazy import storage 函数（避免循环依赖）
 *
 * memory-service.ts 在模块顶层 import 本文件的函数并 re-export，
 * 如果本文件也在顶层 import memory-service.ts 的函数，会形成循环依赖。
 * 使用 lazy import（在函数内部 import）可打破循环：当本文件的函数被调用时，
 * memory-service.ts 已完成模块初始化。
 */
async function getStorage() {
  const { getCoreMemory, saveCoreMemory, addArchivalMemory } = await import("./memory-service");
  return { getCoreMemory, saveCoreMemory, addArchivalMemory };
}

// ============= 自动抽取 =============

/**
 * 从对话中自动抽取记忆
 *
 * 使用 textProvider 分析最近的消息，提取：
 * - 用户偏好（如风格、provider 偏好）
 * - 项目事实（如改编来源、目标时长）
 * - 会话摘要（追加到归档记忆）
 *
 * 失败时不抛异常，返回 null。
 */
export async function extractFromConversation(
  messages: AgentMessage[],
  _sessionId?: string,
  options?: { providerId?: string; modelId?: string },
): Promise<ExtractedMemory | null> {
  // 过滤出最近的消息（最多 20 条，跳过 tool 消息）
  const recentMessages = messages
    .filter((m) => m.role === "user" || (m.role === "assistant" && m.content))
    .slice(-20);

  if (recentMessages.length < 3) {
    // 消息太少，不值得抽取
    return null;
  }

  const conversationText = recentMessages
    .map((m) => {
      const role = m.role === "user" ? "用户" : "助手";
      return `[${role}] ${m.content}`;
    })
    .join("\n\n");

  const prompt = `请分析以下对话，提取值得长期记住的信息。严格按 JSON 格式输出，不要输出其他内容。

对话内容：
${conversationText}

请输出以下 JSON 结构：
{
  "preferences": {
    "preferred_style": "用户偏好的视觉风格（如有）",
    "preferred_provider": "用户偏好的 API provider（如有）",
    "language": "用户使用语言（如 zh-CN）"
  },
  "facts": [
    { "key": "source_novel", "value": "项目改编来源（如有）" },
    { "key": "target_duration", "value": "目标视频时长（如有）" }
  ],
  "summary": "本次对话的 200 字摘要，包含用户的核心需求和达成的结果"
}

要求：
1. 只提取明确出现的信息，不要臆测
2. preferences 和 facts 可以为空对象/数组
3. summary 必须填写
4. 不要输出 JSON 以外的内容`;

  try {
    const result = await container.textProvider.generateText(prompt, {
      maxTokens: 1024,
      temperature: 0.3,
      providerId: options?.providerId,
      modelId: options?.modelId,
    });

    if (!result.success || !result.data) return null;

    const text = result.data.text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

    const preferences: Record<string, string | number | boolean> = {};
    if (parsed.preferences && typeof parsed.preferences === "object") {
      for (const [k, v] of Object.entries(parsed.preferences as Record<string, unknown>)) {
        if (v != null && (typeof v === "string" || typeof v === "number" || typeof v === "boolean")) {
          preferences[k] = v;
        }
      }
    }

    const facts: Array<{ key: string; value: string }> = [];
    if (Array.isArray(parsed.facts)) {
      for (const f of parsed.facts as Array<Record<string, unknown>>) {
        if (f && typeof f.key === "string" && typeof f.value === "string" && f.value) {
          facts.push({ key: f.key, value: f.value });
        }
      }
    }

    const summary =
      typeof parsed.summary === "string" && parsed.summary.trim()
        ? parsed.summary.trim()
        : "";

    return { preferences, facts, summary };
  } catch {
    return null;
  }
}

/**
 * 应用抽取结果到记忆系统
 *
 * - 偏好合并到核心记忆（覆盖同 key）
 * - 事实追加到核心记忆（同 key 覆盖）
 * - 摘要追加到归档记忆
 */
export async function applyExtractedMemory(
  extracted: ExtractedMemory,
  sessionId?: string,
): Promise<void> {
  const { getCoreMemory, saveCoreMemory, addArchivalMemory } = await getStorage();
  const memory = await getCoreMemory();

  // 合并偏好
  for (const [k, v] of Object.entries(extracted.preferences)) {
    memory.preferences[k] = v;
  }

  // 合并事实
  const now = Date.now();
  for (const fact of extracted.facts) {
    const idx = memory.facts.findIndex((f) => f.key === fact.key);
    if (idx >= 0) {
      memory.facts[idx] = { ...fact, updatedAt: now };
    } else {
      memory.facts.push({ ...fact, updatedAt: now });
    }
  }

  // 限制 facts 数量
  if (memory.facts.length > MAX_FACTS_COUNT) {
    memory.facts.sort((a, b) => a.updatedAt - b.updatedAt);
    memory.facts = memory.facts.slice(memory.facts.length - MAX_FACTS_COUNT);
  }

  await saveCoreMemory(memory);

  // 追加摘要到归档记忆
  if (extracted.summary) {
    await addArchivalMemory({
      type: "summary",
      content: extracted.summary,
      sessionId,
      tags: ["auto-extracted"],
    });
  }
}

// ============= 上下文摘要压缩（P2 深化） =============

/**
 * 摘要对话历史（P2 上下文摘要压缩）
 *
 * 将旧消息压缩为摘要，释放上下文空间。
 * - 使用 textProvider 从消息中提取关键信息
 * - 支持增量摘要（合并已有摘要 + 新消息）
 * - 失败时返回 null，不阻断 Agent Loop
 *
 * @param messages 需要摘要的消息列表
 * @param existingSummary 已有的摘要（增量合并，传 undefined 表示首次摘要）
 * @returns 新的摘要文本，或 null
 */
export async function summarizeConversation(
  messages: AgentMessage[],
  existingSummary?: string,
): Promise<string | null> {
  // 过滤出 user + assistant 消息（跳过 tool 消息，太结构化不适合摘要）
  const dialogueMessages = messages.filter(
    (m) => (m.role === "user" || (m.role === "assistant" && m.content)) && m.content,
  );

  if (dialogueMessages.length < 3) {
    // 消息太少，不值得摘要
    return null;
  }

  // 构建摘要 prompt
  const conversationText = dialogueMessages
    .map((m) => `${m.role === "user" ? "用户" : "助手"}: ${m.content!.slice(0, 500)}`)
    .join("\n");

  const summaryPrompt = existingSummary
    ? `请更新以下对话摘要。合并已有摘要与新对话内容，保持简洁（200字以内）：

已有摘要：
${existingSummary}

新对话：
${conversationText}

更新后的摘要（只输出摘要内容，不要其他文字）：`
    : `请将以下对话摘要为简洁的要点（200字以内），保留关键决策、用户偏好和重要上下文：

${conversationText}

摘要（只输出摘要内容，不要其他文字）：`;

  try {
    const result = await container.textProvider.generateText(summaryPrompt, {
      maxTokens: 300,
      temperature: 0.3,
    });

    if (!result.success || !result.data?.text) {
      return null;
    }

    return result.data.text.trim();
  } catch {
    return null;
  }
}
