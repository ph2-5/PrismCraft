/**
 * Prompt 绑定注入集成测试
 *
 * 验证项目核心价值：element binding → prompt 注入 → 传给 provider
 *
 * 背景：现有 storyboard-generation-service.test.ts 中没有任何测试传入
 * characterRefs 或 sceneRef，导致 buildReferenceEnhancedPrompt 的注入逻辑
 * 完全未被测试覆盖。本测试专门验证：
 * 1. 传入 characterRefs 时，prompt 文本是否包含角色一致性绑定指令
 * 2. 传入 sceneRef 时，prompt 文本是否包含场景一致性绑定指令
 * 3. 同时传入时是否同时包含两者
 * 4. 不传入时是否保持原样（基线对照）
 *
 * 这层测试弥补了 service → provider 参数传递的验证缺口：
 * - 现有单元测试只验证 customPrompt 精确匹配，不验证绑定指令注入
 * - local-cloud-mock 测试只验证 provider → HTTP，不验证 service → provider
 * - 本测试验证 service 层的 prompt 组装逻辑真实运行并传给 provider
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { expectOk } from "@/__tests__/utils/result-helpers";
import type { StoryBeat } from "@/domain/schemas";
import type { IVideoProvider, IImageProvider, ITextProvider } from "@/domain/ports";

// 与 storyboard-generation-service.test.ts 相同的 mock，确保外部依赖不干扰
vi.mock("@/domain/utils", () => ({
  generateBeatImagePrompt: vi.fn().mockReturnValue("generated prompt"),
  getFirstFrameUrl: vi.fn(),
  getLastFrameUrl: vi.fn(),
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: { warn: vi.fn(), error: vi.fn() },
  extractErrorMessage: vi.fn().mockReturnValue("error message"),
}));

vi.mock("../frame-prompt-service", () => ({
  generateFramePrompts: vi.fn(),
}));

import { generateBeatKeyframe } from "../storyboard-generation-service";

const mockBeat: StoryBeat = {
  id: "beat-1",
  sequence: 0,
  title: "分镜标题",
  description: "分镜描述",
  content: "分镜内容",
  duration: 5,
  type: "scene",
  characterIds: [],
  enhancedGeneration: false,
  elementIds: [],
};

function createRecordingProvider(): IVideoProvider {
  return {
    generateKeyframe: vi.fn().mockResolvedValue({
      success: true,
      data: { imageUrl: "mock.jpg", prompt: "mock" },
    }),
    generateFramePair: vi.fn(),
    generateVideoWithFrames: vi.fn(),
    generateVideo: vi.fn(),
    queryVideoStatus: vi.fn(),
  } as IVideoProvider;
}

const imageProvider = {
  generateImage: vi.fn(),
  analyzeImage: vi.fn(),
} as IImageProvider;

const textProvider = {
  generateText: vi.fn(),
  generateTextStream: vi.fn(),
} as ITextProvider;

describe("prompt 绑定注入集成测试", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("传入 characterRefs 时，prompt 应包含角色一致性绑定指令", async () => {
    const videoProvider = createRecordingProvider();
    const providers = { videoProvider, imageProvider, textProvider };

    const result = await generateBeatKeyframe(mockBeat, null, {
      customPrompt: "一个女孩走在街上",
      characterRefs: ["data:image/png;base64,xxx"],
    }, providers);

    expectOk(result);
    const call = (videoProvider.generateKeyframe as ReturnType<typeof vi.fn>).mock.calls[0][0];
    // 绑定指令应注入到 prompt 前面
    expect(call.content).toContain("关键要求");
    expect(call.content).toContain("角色参考图");
    // 原始 prompt 应保留在后面
    expect(call.content).toContain("一个女孩走在街上");
    // characterRef 字段也应正确传递
    expect(call.characterRef).toBe("data:image/png;base64,xxx");
  });

  it("传入 sceneRef 时，prompt 应包含场景一致性绑定指令", async () => {
    const videoProvider = createRecordingProvider();
    const providers = { videoProvider, imageProvider, textProvider };

    const result = await generateBeatKeyframe(mockBeat, null, {
      customPrompt: "一个女孩走在街上",
      sceneRef: "data:image/png;base64,scene-xxx",
    }, providers);

    expectOk(result);
    const call = (videoProvider.generateKeyframe as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.content).toContain("场景环境");
    expect(call.content).toContain("场景参考图");
    expect(call.content).toContain("一个女孩走在街上");
    expect(call.sceneRef).toBe("data:image/png;base64,scene-xxx");
  });

  it("同时传入 characterRefs 和 sceneRef 时，prompt 应同时包含两者", async () => {
    const videoProvider = createRecordingProvider();
    const providers = { videoProvider, imageProvider, textProvider };

    const result = await generateBeatKeyframe(mockBeat, null, {
      customPrompt: "一个女孩走在街上",
      characterRefs: ["data:image/png;base64,char-xxx"],
      sceneRef: "data:image/png;base64,scene-xxx",
    }, providers);

    expectOk(result);
    const call = (videoProvider.generateKeyframe as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.content).toContain("角色参考图");
    expect(call.content).toContain("场景参考图");
    expect(call.content).toContain("一个女孩走在街上");
    // 绑定指令应在原始 prompt 之前
    expect(call.content.indexOf("角色参考图")).toBeLessThan(
      call.content.indexOf("一个女孩走在街上"),
    );
  });

  it("不传入任何 ref 时，prompt 不应包含绑定指令（基线对照）", async () => {
    const videoProvider = createRecordingProvider();
    const providers = { videoProvider, imageProvider, textProvider };

    const result = await generateBeatKeyframe(mockBeat, null, {
      customPrompt: "一个女孩走在街上",
    }, providers);

    expectOk(result);
    const call = (videoProvider.generateKeyframe as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.content).toBe("一个女孩走在街上");
    expect(call.content).not.toContain("关键要求");
    expect(call.content).not.toContain("角色参考图");
    expect(call.content).not.toContain("场景参考图");
  });
});
