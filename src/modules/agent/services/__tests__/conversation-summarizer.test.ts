import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentSession } from "../../domain/types";
import type { IMemoryService } from "../../domain/ports";
import { maybeSummarizeConversation } from "../conversation-summarizer";

vi.mock("@/shared-logic/agent", () => ({
  estimateMessagesTokens: vi.fn(),
}));

import { estimateMessagesTokens } from "@/shared-logic/agent";

function makeSession(messages: Array<{ id: string; role: string; content: string }>): AgentSession {
  return {
    id: "session-1",
    messages: messages as unknown as AgentSession["messages"],
    conversationSummary: undefined,
    summaryCoveredUpTo: undefined,
  } as unknown as AgentSession;
}

const mockMemory: IMemoryService = {
  summarizeConversation: vi.fn().mockResolvedValue("摘要结果"),
  buildCoreMemoryPrompt: vi.fn(),
  searchRelevant: vi.fn(),
} as unknown as IMemoryService;

const MAX_HISTORY_TOKENS = 1000;

describe("maybeSummarizeConversation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (estimateMessagesTokens as ReturnType<typeof vi.fn>).mockReturnValue(500);
  });

  it("未达阈值（token < 80% 上限）时不触发摘要", async () => {
    await maybeSummarizeConversation(
      makeSession([
        { id: "m1", role: "user", content: "hi" },
        { id: "m2", role: "assistant", content: "hello" },
        { id: "m3", role: "user", content: "how are you" },
      ]),
      mockMemory,
      MAX_HISTORY_TOKENS,
    );

    expect(mockMemory.summarizeConversation).not.toHaveBeenCalled();
  });

  it("超过阈值时摘要除最近 10 条外的消息", async () => {
    (estimateMessagesTokens as ReturnType<typeof vi.fn>).mockReturnValue(900);
    const messages = Array.from({ length: 13 }, (_, i) => ({
      id: `m${i}`,
      role: i % 2 === 0 ? "user" : "assistant",
      content: `content-${i}`,
    }));

    await maybeSummarizeConversation(makeSession(messages), mockMemory, MAX_HISTORY_TOKENS);

    expect(mockMemory.summarizeConversation).toHaveBeenCalledTimes(1);
    const calledWith = (mockMemory.summarizeConversation as ReturnType<typeof vi.fn>).mock.calls[0]!;
    // 保留最近 10 条 → 摘要前 3 条
    expect(calledWith[0]).toHaveLength(3);
    expect(calledWith[0]![0]).toMatchObject({ id: "m0" });
    expect(calledWith[0]![2]).toMatchObject({ id: "m2" });
  });

  it("摘要成功后写入 conversationSummary 与 summaryCoveredUpTo", async () => {
    (estimateMessagesTokens as ReturnType<typeof vi.fn>).mockReturnValue(900);
    const messages = Array.from({ length: 13 }, (_, i) => ({
      id: `m${i}`,
      role: i % 2 === 0 ? "user" : "assistant",
      content: `content-${i}`,
    }));
    const session = makeSession(messages);

    await maybeSummarizeConversation(session, mockMemory, MAX_HISTORY_TOKENS);
    // summarizeConversation 是 fire-and-forget（void + .then），需要等待微任务
    await vi.waitFor(() => {
      expect(session.conversationSummary).toBe("摘要结果");
    });
    expect(session.summaryCoveredUpTo).toBe("m2");
  });

  it("可摘要消息少于 3 条时不触发", async () => {
    (estimateMessagesTokens as ReturnType<typeof vi.fn>).mockReturnValue(900);
    await maybeSummarizeConversation(
      makeSession([{ id: "m1", role: "user", content: "a" }]),
      mockMemory,
      MAX_HISTORY_TOKENS,
    );

    expect(mockMemory.summarizeConversation).not.toHaveBeenCalled();
  });
});
