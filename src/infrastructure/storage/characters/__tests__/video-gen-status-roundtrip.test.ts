import { describe, it, expect } from "vitest";
import { parseCharacter } from "../parser";

function buildDbRow(appearanceOverrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "char-test-001",
    name: "测试角色",
    description: "测试描述",
    gender: "unknown",
    style: "",
    source: "ai-generated",
    appearance: JSON.stringify({
      avatarPath: "/avatar.png",
      videoGenerationStatus: undefined,
      videoGenerationTaskId: undefined,
      generatedVideo: undefined,
      ...appearanceOverrides,
    }),
    generation: JSON.stringify({}),
    config: JSON.stringify({}),
    meta: JSON.stringify({}),
  };
}

describe("videoGenerationStatus 双向一致性", () => {
  it('"processing" 写入后读回应为 "generating"（已知不一致）', () => {
    const row = buildDbRow({ videoGenerationStatus: "processing" });
    const parsed = parseCharacter(row);

    expect(parsed.videoGenerationStatus).toBe("generating");
  });

  it('"pending" 应原样保留', () => {
    const row = buildDbRow({ videoGenerationStatus: "pending" });
    const parsed = parseCharacter(row);

    expect(parsed.videoGenerationStatus).toBe("pending");
  });

  it('"generating" 应原样保留', () => {
    const row = buildDbRow({ videoGenerationStatus: "generating" });
    const parsed = parseCharacter(row);

    expect(parsed.videoGenerationStatus).toBe("generating");
  });

  it('"completed" 应原样保留', () => {
    const row = buildDbRow({ videoGenerationStatus: "completed" });
    const parsed = parseCharacter(row);

    expect(parsed.videoGenerationStatus).toBe("completed");
  });

  it('"failed" 应原样保留', () => {
    const row = buildDbRow({ videoGenerationStatus: "failed" });
    const parsed = parseCharacter(row);

    expect(parsed.videoGenerationStatus).toBe("failed");
  });

  it('无效值 "unknown_status" 应返回 undefined', () => {
    const row = buildDbRow({ videoGenerationStatus: "unknown_status" });
    const parsed = parseCharacter(row);

    expect(parsed.videoGenerationStatus).toBeUndefined();
  });

  it("null 应返回 undefined", () => {
    const row = buildDbRow({ videoGenerationStatus: null });
    const parsed = parseCharacter(row);

    expect(parsed.videoGenerationStatus).toBeUndefined();
  });

  it("undefined 应返回 undefined", () => {
    const row = buildDbRow({ videoGenerationStatus: undefined });
    const parsed = parseCharacter(row);

    expect(parsed.videoGenerationStatus).toBeUndefined();
  });

  it("数字 123 应返回 undefined", () => {
    const row = buildDbRow({ videoGenerationStatus: 123 });
    const parsed = parseCharacter(row);

    expect(parsed.videoGenerationStatus).toBeUndefined();
  });

  it("videoGenerationStatus 与 videoGenerationTaskId 同时存在时应都保留", () => {
    const row = buildDbRow({
      videoGenerationStatus: "generating",
      videoGenerationTaskId: "task-abc-123",
    });
    const parsed = parseCharacter(row);

    expect(parsed.videoGenerationStatus).toBe("generating");
    expect(parsed.videoGenerationTaskId).toBe("task-abc-123");
  });

  it("videoGenerationStatus 与 generatedVideo 同时存在时应都保留", () => {
    const row = buildDbRow({
      videoGenerationStatus: "completed",
      generatedVideo: "/path/to/video.mp4",
    });
    const parsed = parseCharacter(row);

    expect(parsed.videoGenerationStatus).toBe("completed");
    expect(parsed.generatedVideo).toBe("/path/to/video.mp4");
  });

  it("只有 videoGenerationStatus 没有 videoGenerationTaskId 时应正常解析", () => {
    const row = buildDbRow({
      videoGenerationStatus: "pending",
    });
    const parsed = parseCharacter(row);

    expect(parsed.videoGenerationStatus).toBe("pending");
    expect(parsed.videoGenerationTaskId).toBeUndefined();
  });
});
