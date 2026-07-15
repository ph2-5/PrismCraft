/**
 * Task 4.9 子项 2：Agent 会话搜索与导出服务单元测试
 *
 * 覆盖范围：
 * - searchSessionList: 按标题过滤、大小写不敏感、空查询、特殊字符
 * - searchInSession: 单会话搜索、标题命中、内容命中、无命中、空查询
 * - searchAcrossSessions: 多会话搜索、空查询
 * - serializeSessionAsJSON: JSON 序列化、streaming 字段重置
 * - serializeSessionAsMarkdown: Markdown 格式、role 图标、toolCalls 渲染、error 渲染
 * - buildExportFilename: 文件名清理、扩展名、空标题兜底
 */

import { describe, it, expect } from "vitest";
import {
  searchSessionList,
  searchInSession,
  searchAcrossSessions,
  serializeSessionAsJSON,
  serializeSessionAsMarkdown,
  buildExportFilename,
} from "../session-search";
import type { AgentSession, AgentMessage } from "@/modules/agent";
import type { SessionListItem } from "../session-storage";

// ============= 测试辅助函数 =============

function makeMessage(overrides: Partial<AgentMessage> = {}): AgentMessage {
  return {
    id: `msg-${Math.random().toString(36).slice(2, 8)}`,
    role: "user",
    content: "",
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeSession(overrides: Partial<AgentSession> = {}): AgentSession {
  const now = Date.now();
  return {
    id: `session-${Math.random().toString(36).slice(2, 8)}`,
    title: "测试会话",
    messages: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeListItem(overrides: Partial<SessionListItem> = {}): SessionListItem {
  const now = Date.now();
  return {
    id: `session-${Math.random().toString(36).slice(2, 8)}`,
    title: "测试会话",
    messageCount: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// ============= searchSessionList =============

describe("searchSessionList", () => {
  it("空查询应返回原列表的副本", () => {
    const sessions = [
      makeListItem({ id: "s1", title: "会话一" }),
      makeListItem({ id: "s2", title: "会话二" }),
    ];
    const result = searchSessionList(sessions, "");
    expect(result).toHaveLength(2);
    expect(result).not.toBe(sessions); // 应返回副本而非原引用
  });

  it("空格查询应等同于空查询", () => {
    const sessions = [makeListItem({ title: "会话" })];
    expect(searchSessionList(sessions, "   ")).toHaveLength(1);
  });

  it("应按标题大小写不敏感过滤", () => {
    const sessions = [
      makeListItem({ id: "s1", title: "API 配置指南" }),
      makeListItem({ id: "s2", title: "api 故障排查" }),
      makeListItem({ id: "s3", title: "角色创建" }),
    ];
    const result = searchSessionList(sessions, "api");
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.id)).toEqual(["s1", "s2"]);
  });

  it("无匹配应返回空数组", () => {
    const sessions = [makeListItem({ title: "会话一" })];
    expect(searchSessionList(sessions, "不存在的关键词")).toHaveLength(0);
  });

  it("应保持原列表顺序", () => {
    const sessions = [
      makeListItem({ id: "s1", title: "测试 A" }),
      makeListItem({ id: "s2", title: "测试 B" }),
      makeListItem({ id: "s3", title: "其他" }),
    ];
    const result = searchSessionList(sessions, "测试");
    expect(result.map((s) => s.id)).toEqual(["s1", "s2"]);
  });
});

// ============= searchInSession =============

describe("searchInSession", () => {
  it("空查询应返回 null", () => {
    const session = makeSession({ title: "测试", messages: [makeMessage({ content: "内容" })] });
    expect(searchInSession(session, "")).toBeNull();
    expect(searchInSession(session, "   ")).toBeNull();
  });

  it("标题命中应返回 titleMatched=true", () => {
    const session = makeSession({
      title: "API 配置指南",
      messages: [makeMessage({ content: "无关内容" })],
    });
    const result = searchInSession(session, "API");
    expect(result).not.toBeNull();
    expect(result!.titleMatched).toBe(true);
    expect(result!.messageMatches).toHaveLength(0);
  });

  it("消息内容命中应返回 messageMatches", () => {
    const session = makeSession({
      title: "无关标题",
      messages: [
        makeMessage({ id: "m1", content: "请帮我配置 API" }),
        makeMessage({ id: "m2", content: "其他内容" }),
      ],
    });
    const result = searchInSession(session, "API");
    expect(result).not.toBeNull();
    expect(result!.titleMatched).toBe(false);
    expect(result!.messageMatches).toHaveLength(1);
    expect(result!.messageMatches[0]!.messageId).toBe("m1");
  });

  it("无任何命中应返回 null", () => {
    const session = makeSession({
      title: "无关标题",
      messages: [makeMessage({ content: "无关内容" })],
    });
    expect(searchInSession(session, "API")).toBeNull();
  });

  it("snippet 应包含上下文窗口和省略号", () => {
    const longContent = "前缀".repeat(50) + "关键词" + "后缀".repeat(50);
    const session = makeSession({
      messages: [makeMessage({ id: "m1", content: longContent })],
    });
    const result = searchInSession(session, "关键词");
    expect(result).not.toBeNull();
    const snippet = result!.messageMatches[0]!.snippet;
    expect(snippet).toContain("关键词");
    expect(snippet.startsWith("…")).toBe(true);
    expect(snippet.endsWith("…")).toBe(true);
  });

  it("短消息 snippet 不应包含省略号", () => {
    const session = makeSession({
      messages: [makeMessage({ id: "m1", content: "找关键词" })],
    });
    const result = searchInSession(session, "关键词");
    expect(result!.messageMatches[0]!.snippet).toBe("找关键词");
  });

  it("tool 消息内容也应被搜索", () => {
    const session = makeSession({
      messages: [
        makeMessage({
          id: "m1",
          role: "tool",
          content: "工具执行结果：API 配置已更新",
          toolName: "set_config",
        }),
      ],
    });
    const result = searchInSession(session, "API");
    expect(result!.messageMatches[0]!.messageId).toBe("m1");
  });

  it("空 content 消息应被跳过", () => {
    const session = makeSession({
      messages: [
        makeMessage({ id: "m1", content: "" }),
        makeMessage({ id: "m2", content: "含 API 内容" }),
      ],
    });
    const result = searchInSession(session, "API");
    expect(result!.messageMatches).toHaveLength(1);
    expect(result!.messageMatches[0]!.messageId).toBe("m2");
  });
});

// ============= searchAcrossSessions =============

describe("searchAcrossSessions", () => {
  it("空查询应返回空数组", () => {
    const sessions = [makeSession({ title: "测试" })];
    expect(searchAcrossSessions(sessions, "")).toEqual([]);
  });

  it("应跨多个会话搜索", () => {
    const sessions = [
      makeSession({ id: "s1", title: "API 配置", messages: [] }),
      makeSession({
        id: "s2",
        title: "无关",
        messages: [makeMessage({ content: "含 API 关键词" })],
      }),
      makeSession({ id: "s3", title: "完全无关", messages: [makeMessage({ content: "无关" })] }),
    ];
    const results = searchAcrossSessions(sessions, "API");
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.sessionId)).toEqual(["s1", "s2"]);
  });

  it("空会话数组应返回空数组", () => {
    expect(searchAcrossSessions([], "test")).toEqual([]);
  });
});

// ============= serializeSessionAsJSON =============

describe("serializeSessionAsJSON", () => {
  it("应输出合法 JSON", () => {
    const session = makeSession({
      title: "测试",
      messages: [makeMessage({ content: "内容" })],
    });
    const json = serializeSessionAsJSON(session);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it("streaming 字段应被重置为 false", () => {
    const session = makeSession({
      messages: [makeMessage({ content: "流式中", streaming: true })],
    });
    const parsed = JSON.parse(serializeSessionAsJSON(session));
    expect(parsed.messages[0].streaming).toBe(false);
  });

  it("不应修改原 session 对象（纯函数）", () => {
    const session = makeSession({
      messages: [makeMessage({ content: "测试", streaming: true })],
    });
    serializeSessionAsJSON(session);
    expect(session.messages[0]!.streaming).toBe(true);
  });

  it("应保留 conversationSummary 等可选字段", () => {
    const session = makeSession({
      conversationSummary: "摘要内容",
      summaryCoveredUpTo: "msg-1",
    });
    const parsed = JSON.parse(serializeSessionAsJSON(session));
    expect(parsed.conversationSummary).toBe("摘要内容");
    expect(parsed.summaryCoveredUpTo).toBe("msg-1");
  });
});

// ============= serializeSessionAsMarkdown =============

describe("serializeSessionAsMarkdown", () => {
  it("应以 # 标题开头", () => {
    const session = makeSession({ title: "我的会话" });
    expect(serializeSessionAsMarkdown(session).startsWith("# 我的会话")).toBe(true);
  });

  it("空标题应使用默认标题", () => {
    const session = makeSession({ title: "" });
    expect(serializeSessionAsMarkdown(session).startsWith("# Agent 会话")).toBe(true);
  });

  it("应包含创建时间和消息数", () => {
    const session = makeSession({
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
      messages: [makeMessage(), makeMessage()],
    });
    const md = serializeSessionAsMarkdown(session);
    expect(md).toContain("消息数：2");
    expect(md).toContain("2023-");
  });

  it("user 消息应渲染为 👤 用户", () => {
    const session = makeSession({
      messages: [makeMessage({ role: "user", content: "你好" })],
    });
    const md = serializeSessionAsMarkdown(session);
    expect(md).toContain("## 👤 用户");
    expect(md).toContain("你好");
  });

  it("assistant 消息应渲染为 🤖 助手", () => {
    const session = makeSession({
      messages: [makeMessage({ role: "assistant", content: "你好，有什么可以帮助你？" })],
    });
    const md = serializeSessionAsMarkdown(session);
    expect(md).toContain("## 🤖 助手");
  });

  it("tool 消息应渲染为 🔧 工具调用 + toolName", () => {
    const session = makeSession({
      messages: [
        makeMessage({
          role: "tool",
          content: "执行成功",
          toolName: "query_character",
        }),
      ],
    });
    const md = serializeSessionAsMarkdown(session);
    expect(md).toContain("## 🔧 工具调用：query_character");
    expect(md).toContain("执行成功");
  });

  it("tool 消息 error 字段应渲染为 ⚠️ 错误", () => {
    const session = makeSession({
      messages: [
        makeMessage({
          role: "tool",
          content: "",
          toolName: "failing_tool",
          error: "权限不足",
        }),
      ],
    });
    const md = serializeSessionAsMarkdown(session);
    expect(md).toContain("⚠️ 错误：权限不足");
  });

  it("assistant 消息的 toolCalls 应渲染为 json 代码块", () => {
    const session = makeSession({
      messages: [
        makeMessage({
          role: "assistant",
          content: "调用工具",
          toolCalls: [
            {
              id: "tc-1",
              function: {
                name: "set_config",
                arguments: JSON.stringify({ key: "api_key", value: "xxx" }),
              },
            } as never,
          ],
        }),
      ],
    });
    const md = serializeSessionAsMarkdown(session);
    expect(md).toContain("🔧 调用工具 `set_config`");
    expect(md).toContain("```json");
    expect(md).toContain('"key": "api_key"');
  });

  it("空内容消息不应输出空段落", () => {
    const session = makeSession({
      messages: [makeMessage({ role: "user", content: "" })],
    });
    const md = serializeSessionAsMarkdown(session);
    // 应有标题但不应该有 "## 👤 用户\n\n\n---"
    expect(md).toContain("## 👤 用户");
    expect(md).not.toContain("## 👤 用户\n\n\n---");
  });
});

// ============= buildExportFilename =============

describe("buildExportFilename", () => {
  it("json 格式应生成 .json 扩展名", () => {
    const session = makeSession({ title: "测试", updatedAt: 1700000000000 });
    const filename = buildExportFilename(session, "json");
    expect(filename.endsWith(".json")).toBe(true);
  });

  it("markdown 格式应生成 .md 扩展名", () => {
    const session = makeSession({ title: "测试", updatedAt: 1700000000000 });
    const filename = buildExportFilename(session, "markdown");
    expect(filename.endsWith(".md")).toBe(true);
  });

  it("标题中的非法文件名字符应被替换为下划线", () => {
    const session = makeSession({ title: "会话/测试<>:|?*", updatedAt: 1700000000000 });
    const filename = buildExportFilename(session, "json");
    expect(filename).not.toMatch(/[<>:"/\\|?*]/);
  });

  it("空标题应使用默认文件名", () => {
    const session = makeSession({ title: "", updatedAt: 1700000000000 });
    const filename = buildExportFilename(session, "json");
    expect(filename.startsWith("agent-session-")).toBe(true);
  });

  it("标题超长应被截断到 60 字符", () => {
    const longTitle = "a".repeat(100);
    const session = makeSession({ title: longTitle, updatedAt: 1700000000000 });
    const filename = buildExportFilename(session, "json");
    // 文件名格式：{safeTitle}-{dateStr}.json
    const safeTitle = filename.split("-2")[0]; // 取日期前部分
    expect(safeTitle.length).toBeLessThanOrEqual(60);
  });

  it("文件名应包含日期时间", () => {
    const session = makeSession({
      title: "测试",
      updatedAt: new Date("2024-01-15T10:30:00Z").getTime(),
    });
    const filename = buildExportFilename(session, "json");
    // 日期格式 YYYYMMDD-HHMM
    expect(filename).toMatch(/\d{8}-\d{4}\.json$/);
  });

  it("updatedAt 缺失应回退到 createdAt", () => {
    const session = makeSession({
      title: "测试",
      createdAt: new Date("2024-01-15T10:30:00Z").getTime(),
      updatedAt: 0,
    });
    const filename = buildExportFilename(session, "json");
    expect(filename).toMatch(/\d{8}-\d{4}\.json$/);
  });
});
