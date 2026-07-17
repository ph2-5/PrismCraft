/**
 * Task 3: API 边界类型安全 — BaseAIProviderPlugin extract* 方法运行时验证测试
 *
 * 验证 base-provider.ts 中的 extract* 方法在遇到类型不匹配的输入时
 * 通过 Zod safeParse 安全返回 undefined，而不是通过 `as` 断言返回错误值。
 *
 * 文件位置遵循 electron 测试规范：electron/src/plugins/__tests__/{name}.test.ts
 */
import { describe, it, expect } from "vitest";
import { BaseAIProviderPlugin } from "../base-provider";

/**
 * 最小化子类，仅用于测试 BaseAIProviderPlugin 的默认 extract* 实现。
 */
class TestPlugin extends BaseAIProviderPlugin {
  id = "test-plugin";
  match = () => true;
  capabilities = { video: false, image: false, text: false, vision: false };
  videoCapabilities = {
    supportsLastFrame: false,
    supportsReferenceVideo: false,
    supportsMimicryLevel: false,
    supportsCharacterRef: false,
    supportsSceneRef: false,
    characterRefMode: "none" as const,
    sceneRefMode: "none" as const,
    imageUploadMode: "url" as const,
    defaultModel: "test",
    maxDuration: 5,
    supportedCodecs: ["h264"],
    urlTtl: 0,
  };
  imageCapabilities = {
    supportsReferenceImage: false,
    defaultModel: "test",
  };
  getModelCapabilities() {
    return {
      maxReferences: 0,
      maxResolution: 1024,
      maxSizeMB: 1,
      supportsLastFrame: false,
      referenceMode: "merged" as const,
      defaultImageSize: "1024x1024",
      supportedImageSizes: [{ width: 1024, height: 1024, label: "1:1", aspectRatio: "1:1" }],
    };
  }
  buildVideoRequest() {
    return { body: {}, endpoint: "/v1" };
  }
  buildImageRequest() {
    return { body: {}, endpoint: "/v1" };
  }
}

describe("BaseAIProviderPlugin.extractTaskId (运行时验证)", () => {
  const plugin = new TestPlugin();

  it("应从顶层 id 提取任务 ID", () => {
    expect(plugin.extractTaskId({ id: "task-123" })).toBe("task-123");
  });

  it("应从顶层 task_id 提取任务 ID", () => {
    expect(plugin.extractTaskId({ task_id: "task-456" })).toBe("task-456");
  });

  it("应从 data.task_id 提取任务 ID", () => {
    expect(plugin.extractTaskId({ data: { task_id: "task-789" } })).toBe("task-789");
  });

  it("应从 output.task_id 提取任务 ID", () => {
    expect(plugin.extractTaskId({ output: { task_id: "task-abc" } })).toBe("task-abc");
  });

  it("无任何已知字段时返回 undefined", () => {
    expect(plugin.extractTaskId({})).toBeUndefined();
  });

  it("当 id 不是字符串时返回 undefined（类型安全）", () => {
    expect(plugin.extractTaskId({ id: 123 })).toBeUndefined();
  });

  it("当 data 是字符串而非对象时返回 undefined（类型安全）", () => {
    expect(plugin.extractTaskId({ data: "not-an-object" })).toBeUndefined();
  });

  it("当 data.task_id 不是字符串时返回 undefined（类型安全）", () => {
    expect(plugin.extractTaskId({ data: { task_id: 123 } })).toBeUndefined();
  });

  it("当 output 是数组而非对象时返回 undefined（类型安全）", () => {
    expect(plugin.extractTaskId({ output: ["not", "an", "object"] })).toBeUndefined();
  });
});

describe("BaseAIProviderPlugin.extractVideoUrl (运行时验证)", () => {
  const plugin = new TestPlugin();

  it("应从顶层 video_url 提取视频 URL", () => {
    expect(plugin.extractVideoUrl({ video_url: "https://cdn.example.com/v.mp4" })).toBe(
      "https://cdn.example.com/v.mp4",
    );
  });

  it("应从顶层 url 提取视频 URL", () => {
    expect(plugin.extractVideoUrl({ url: "https://cdn.example.com/v2.mp4" })).toBe(
      "https://cdn.example.com/v2.mp4",
    );
  });

  it("应从 data.video_url 提取视频 URL", () => {
    expect(plugin.extractVideoUrl({ data: { video_url: "https://cdn.example.com/v3.mp4" } })).toBe(
      "https://cdn.example.com/v3.mp4",
    );
  });

  it("无任何已知字段时返回 undefined", () => {
    expect(plugin.extractVideoUrl({})).toBeUndefined();
  });

  it("当 video_url 不是字符串时返回 undefined（类型安全）", () => {
    expect(plugin.extractVideoUrl({ video_url: 123 })).toBeUndefined();
  });

  it("当 data 是字符串而非对象时返回 undefined（类型安全）", () => {
    expect(plugin.extractVideoUrl({ data: "not-an-object" })).toBeUndefined();
  });

  it("当 data.video_url 不是字符串时返回 undefined（类型安全）", () => {
    expect(plugin.extractVideoUrl({ data: { video_url: 123 } })).toBeUndefined();
  });
});

describe("BaseAIProviderPlugin.extractImageUrl (运行时验证)", () => {
  const plugin = new TestPlugin();

  it("应从 data[0].url 提取图片 URL", () => {
    expect(plugin.extractImageUrl({ data: [{ url: "https://cdn.example.com/img.png" }] })).toBe(
      "https://cdn.example.com/img.png",
    );
  });

  it("应从 data[0].b64_json 构造 data URL", () => {
    const result = plugin.extractImageUrl({ data: [{ b64_json: "aGVsbG8=" }] });
    expect(result).toBe("data:image/png;base64,aGVsbG8=");
  });

  it("无 data 字段时返回 undefined", () => {
    expect(plugin.extractImageUrl({})).toBeUndefined();
  });

  it("当 data 不是数组时返回 undefined（类型安全 - 消除 as Record<string,unknown>[] 断言）", () => {
    expect(plugin.extractImageUrl({ data: "not-an-array" })).toBeUndefined();
    expect(plugin.extractImageUrl({ data: { url: "wrong" } })).toBeUndefined();
    expect(plugin.extractImageUrl({ data: 123 })).toBeUndefined();
  });

  it("当 data 数组为空时返回 undefined", () => {
    expect(plugin.extractImageUrl({ data: [] })).toBeUndefined();
  });

  it("当 data[0].url 不是字符串时返回 undefined（类型安全 - 不再返回非字符串值）", () => {
    expect(plugin.extractImageUrl({ data: [{ url: 123 }] })).toBeUndefined();
    expect(plugin.extractImageUrl({ data: [{ url: null }] })).toBeUndefined();
    expect(plugin.extractImageUrl({ data: [{ url: true }] })).toBeUndefined();
  });

  it("当 data[0].b64_json 不是字符串时返回 undefined（类型安全）", () => {
    expect(plugin.extractImageUrl({ data: [{ b64_json: 123 }] })).toBeUndefined();
    expect(plugin.extractImageUrl({ data: [{ b64_json: null }] })).toBeUndefined();
  });

  it("当 data[0] 不是对象时返回 undefined（类型安全）", () => {
    expect(plugin.extractImageUrl({ data: ["not-an-object"] })).toBeUndefined();
    expect(plugin.extractImageUrl({ data: [123] })).toBeUndefined();
  });
});

describe("BaseAIProviderPlugin.extractTextContent (运行时验证)", () => {
  const plugin = new TestPlugin();

  it("应从 choices[0].message.content 提取文本", () => {
    const response = {
      choices: [{ message: { content: "hello world" } }],
    };
    expect(plugin.extractTextContent(response)).toBe("hello world");
  });

  it("无 choices 字段时返回空字符串", () => {
    expect(plugin.extractTextContent({})).toBe("");
  });

  it("choices 为空数组时返回空字符串", () => {
    expect(plugin.extractTextContent({ choices: [] })).toBe("");
  });

  it("当 choices 不是数组时返回空字符串（类型安全 - 消除 as Record<string,unknown>[] 断言）", () => {
    expect(plugin.extractTextContent({ choices: "not-an-array" })).toBe("");
    expect(plugin.extractTextContent({ choices: 123 })).toBe("");
    expect(plugin.extractTextContent({ choices: { not: "array" } })).toBe("");
  });

  it("当 choices[0] 不是对象时返回空字符串（类型安全）", () => {
    expect(plugin.extractTextContent({ choices: ["not-an-object"] })).toBe("");
    expect(plugin.extractTextContent({ choices: [123] })).toBe("");
  });

  it("当 message 不是对象时返回空字符串（类型安全）", () => {
    expect(plugin.extractTextContent({ choices: [{ message: "not-an-object" }] })).toBe("");
    expect(plugin.extractTextContent({ choices: [{ message: 123 }] })).toBe("");
  });

  it("当 content 不是字符串时返回空字符串（类型安全 - 不再返回非字符串值）", () => {
    expect(plugin.extractTextContent({ choices: [{ message: { content: 123 } }] })).toBe("");
    expect(plugin.extractTextContent({ choices: [{ message: { content: null } }] })).toBe("");
    expect(plugin.extractTextContent({ choices: [{ message: { content: true } }] })).toBe("");
  });
});

describe("BaseAIProviderPlugin.extractStatus (运行时验证)", () => {
  const plugin = new TestPlugin();

  it("应从 status 字段提取状态，默认为 generating", () => {
    expect(plugin.extractStatus({ status: "completed" }).status).toBe("completed");
    expect(plugin.extractStatus({}).status).toBe("generating");
  });

  it("应从 progress 字段提取进度", () => {
    expect(plugin.extractStatus({ progress: 50 }).progress).toBe(50);
  });

  it("应从 progress_percentage 字段提取进度", () => {
    expect(plugin.extractStatus({ progress_percentage: 75 }).progress).toBe(75);
  });

  it("应从 message/error/msg 字段提取消息", () => {
    expect(plugin.extractStatus({ message: "processing" }).message).toBe("processing");
    expect(plugin.extractStatus({ error: "failed" }).message).toBe("failed");
    expect(plugin.extractStatus({ msg: "running" }).message).toBe("running");
  });

  it("当 status 不是字符串时回退到默认值 generating（类型安全）", () => {
    expect(plugin.extractStatus({ status: 123 }).status).toBe("generating");
    expect(plugin.extractStatus({ status: null }).status).toBe("generating");
    expect(plugin.extractStatus({ status: true }).status).toBe("generating");
  });

  it("当 progress 不是数字时返回 undefined（类型安全 - 不再返回非数字值）", () => {
    expect(plugin.extractStatus({ progress: "50" }).progress).toBeUndefined();
    expect(plugin.extractStatus({ progress: true }).progress).toBeUndefined();
    expect(plugin.extractStatus({ progress: null }).progress).toBeUndefined();
  });

  it("当 message 不是字符串时返回 undefined（类型安全）", () => {
    expect(plugin.extractStatus({ message: 123 }).message).toBeUndefined();
    expect(plugin.extractStatus({ error: { code: 500 } }).message).toBeUndefined();
  });
});

describe("BaseAIProviderPlugin.extractTextChunk (运行时验证 - 类型安全)", () => {
  const plugin = new TestPlugin();

  it("当 choices 不是数组时返回 undefined（类型安全）", () => {
    expect(plugin.extractTextChunk('data: {"choices":"not-an-array"}')).toBeUndefined();
    expect(plugin.extractTextChunk('data: {"choices":123}')).toBeUndefined();
    expect(plugin.extractTextChunk('data: {"choices":{"not":"array"}}')).toBeUndefined();
  });

  it("当 choices[0] 不是对象时返回 undefined（类型安全）", () => {
    expect(plugin.extractTextChunk('data: {"choices":["not-an-object"]}')).toBeUndefined();
    expect(plugin.extractTextChunk('data: {"choices":[123]}')).toBeUndefined();
  });

  it("当 delta.content 不是字符串时返回空 delta（类型安全 - 不再返回非字符串值）", () => {
    const chunk = plugin.extractTextChunk('data: {"choices":[{"delta":{"content":123}}]}');
    // content 不是字符串 → delta=""
    // 无 finishReason + 无 toolCalls + delta="" → undefined
    expect(chunk).toBeUndefined();
  });

  it("当 delta.tool_calls 不是数组时安全跳过（类型安全）", () => {
    const chunk = plugin.extractTextChunk(
      'data: {"choices":[{"delta":{"content":"hi","tool_calls":"not-an-array"}}]}',
    );
    expect(chunk).toEqual({ delta: "hi" });
  });

  it("当 tool_calls[0] 不是对象时安全跳过（类型安全）", () => {
    const chunk = plugin.extractTextChunk(
      'data: {"choices":[{"delta":{"content":"hi","tool_calls":["not-an-object",123]}}]}',
    );
    expect(chunk).toEqual({ delta: "hi" });
  });

  it("当 tool_calls[0].function 不是对象时安全降级（类型安全）", () => {
    const chunk = plugin.extractTextChunk(
      'data: {"choices":[{"delta":{"content":"hi","tool_calls":[{"id":"c1","function":"not-an-object"}]}}]}',
    );
    // function 不是对象 → name="" arguments=""
    // id="c1" 为 truthy → tool_call 不被 filter 过滤，保留但 name/arguments 为空
    expect(chunk?.delta).toBe("hi");
    expect(chunk?.toolCalls).toEqual([
      { id: "c1", function: { name: "", arguments: "" } },
    ]);
  });

  it("当 tool_calls[0].id 不是字符串时回退为空字符串（类型安全 - 不再返回非字符串值）", () => {
    const chunk = plugin.extractTextChunk(
      'data: {"choices":[{"delta":{"content":"hi","tool_calls":[{"id":123,"function":{"name":"f","arguments":"{}"}}]}}]}',
    );
    // id=123 不是字符串 → 回退为 ""
    // name="f" arguments="{}" → 因为 name 不为空，tool_call 保留
    expect(chunk?.delta).toBe("hi");
    expect(chunk?.toolCalls?.[0].id).toBe("");
    expect(chunk?.toolCalls?.[0].function.name).toBe("f");
  });

  it("当 tool_calls[0].function.name 不是字符串时回退为空字符串（类型安全）", () => {
    const chunk = plugin.extractTextChunk(
      'data: {"choices":[{"delta":{"content":"hi","tool_calls":[{"id":"c1","function":{"name":123,"arguments":"{}"}}]}}]}',
    );
    expect(chunk?.toolCalls?.[0].function.name).toBe("");
    expect(chunk?.toolCalls?.[0].function.arguments).toBe("{}");
  });

  it("当 tool_calls[0].function.arguments 不是字符串时回退为空字符串（类型安全）", () => {
    const chunk = plugin.extractTextChunk(
      'data: {"choices":[{"delta":{"content":"hi","tool_calls":[{"id":"c1","function":{"name":"f","arguments":123}}]}}]}',
    );
    expect(chunk?.toolCalls?.[0].function.name).toBe("f");
    expect(chunk?.toolCalls?.[0].function.arguments).toBe("");
  });
});
