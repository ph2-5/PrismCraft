import { describe, it, expect } from "vitest";
import { collectUserFewShotExamples } from "../user-few-shot-examples";
import type { Story } from "@/domain/schemas";

function makeStory(overrides: Partial<Story> = {}): Partial<Story> {
  return {
    id: "story-1",
    title: "测试故事",
    genre: "action",
    tone: "epic",
    targetDuration: 60,
    ...overrides,
  };
}

const fullBeat = {
  id: "beat-1",
  sequence: 1,
  title: "对峙",
  content: "主角与对手面对面站立，目光如炬。风吹动两人的衣角，空气中弥漫着紧张的气氛，主角缓缓拔出武器。",
  duration: 4,
  type: "action",
  characterIds: [],
  elementIds: [],
  shotInstruction: { shotSize: "close", cameraAngle: "low", cameraMovement: "push" },
};

describe("collectUserFewShotExamples", () => {
  it("无 beats 时返回空数组", () => {
    expect(collectUserFewShotExamples(makeStory())).toEqual([]);
  });

  it("内容不足或缺少 shotInstruction 的分镜被跳过", () => {
    const story = makeStory({
      beats: [
        { ...fullBeat, id: "a", content: "短" },
        { ...fullBeat, id: "b", shotInstruction: undefined },
        { ...fullBeat, id: "c" },
      ] as Story["beats"],
    });
    const examples = collectUserFewShotExamples(story);
    expect(examples).toHaveLength(1);
    expect(examples[0]!.output.title).toBe("对峙");
  });

  it("提取 input/output 字段映射正确", () => {
    const story = makeStory({
      beats: [fullBeat] as Story["beats"],
    });
    const examples = collectUserFewShotExamples(story);
    expect(examples).toHaveLength(1);
    const ex = examples[0]!;
    expect(ex.input).toEqual({
      genre: "action",
      tone: "epic",
      beatIndex: 1,
      totalBeats: 1,
      shotType: "close",
      hasDialogue: false,
      hasAction: true,
    });
    expect(ex.output).toEqual({
      title: "对峙",
      content: fullBeat.content,
      shotType: "close",
      cameraAngle: "low",
      cameraMovement: "push",
      duration: 4,
      type: "action",
    });
  });

  it("相同内容的分镜去重", () => {
    const story = makeStory({
      beats: [
        { ...fullBeat, id: "a" },
        { ...fullBeat, id: "b" },
        { ...fullBeat, id: "c" },
      ] as Story["beats"],
    });
    const examples = collectUserFewShotExamples(story);
    expect(examples).toHaveLength(1);
  });

  it("超过上限时截断", () => {
    const beats = Array.from({ length: 30 }, (_, i) => ({
      ...fullBeat,
      id: `beat-${i}`,
      sequence: i,
      title: `分镜${i}`,
      content: `这是第${i}个分镜的完整内容描述，包含足够的视觉细节与动作描写，长度超过采集门槛以测试上限截断逻辑。`,
    }));
    const examples = collectUserFewShotExamples(makeStory({ beats: beats as Story["beats"] }));
    expect(examples.length).toBeLessThanOrEqual(20);
  });
});
