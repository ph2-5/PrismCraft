/**
 * Task 2A.13 — structure-analyzer 单元测试
 *
 * 覆盖：
 *   1. buildStructureAnalysisPrompt: 提示词构建正确
 *   2. parseNarrativeBeats: JSON 数组解析与容错
 *   3. populateBeatPositionsAndDurations: position/duration 填充
 *   4. extractJsonArrayFromText: 从文本提取 JSON 数组
 *   5. analyzeStoryStructure: 主流程（成功 + 失败路径）
 *   6. suggestDurationByStructure: 时长建议规则
 *   7. recalculateStoryStructure: 重算（不调 AI）
 *   8. narrative-beats 纯函数: computeBeatPosition / findClimaxPosition / inferOverallPacing / computeEmotionCurve
 */

import { describe, it, expect } from "vitest";
import {
  buildStructureAnalysisPrompt,
  parseNarrativeBeats,
  populateBeatPositionsAndDurations,
  extractJsonArrayFromText,
  analyzeStoryStructure,
  suggestDurationByStructure,
  recalculateStoryStructure,
  type GenerateTextFn,
} from "../structure-analyzer";
import {
  computeBeatPosition,
  findClimaxPosition,
  inferOverallPacing,
  computeEmotionCurve,
  NARRATIVE_BEAT_TYPES,
  type NarrativeBeat,
  type NarrativeBeatType,
} from "../../domain/narrative-beats";
import type { NovelSegment } from "../../../domain/types";

// 测试辅助：构造 NovelSegment
function makeSegment(overrides: Partial<NovelSegment> = {}): NovelSegment {
  return {
    id: overrides.id ?? `seg-${Math.random().toString(36).slice(2, 8)}`,
    title: overrides.title ?? "测试段落",
    summary: overrides.summary ?? "测试摘要",
    startChar: overrides.startChar ?? 0,
    endChar: overrides.endChar ?? 100,
    estimatedDuration: overrides.estimatedDuration ?? 10,
    keyEvents: overrides.keyEvents ?? [],
    text: overrides.text ?? "",
  };
}

// 测试辅助：构造 NarrativeBeat
function makeBeat(overrides: Partial<NarrativeBeat> = {}): NarrativeBeat {
  return {
    id: overrides.id ?? `beat-${Math.random().toString(36).slice(2, 8)}`,
    segmentIds: overrides.segmentIds ?? [],
    type: overrides.type ?? "setup",
    title: overrides.title ?? "测试节点",
    description: overrides.description ?? "",
    emotionIntensity: overrides.emotionIntensity ?? 0.5,
    estimatedDuration: overrides.estimatedDuration ?? 0,
    position: overrides.position ?? 0,
  };
}

// 测试辅助：mock AI 生成函数
function makeMockGenerateTextFn(response: string): GenerateTextFn {
  return async () => ({ success: true, data: { text: response } });
}

function makeFailingGenerateTextFn(error: string): GenerateTextFn {
  return async () => ({ success: false, error });
}

describe("Task 2A.13 — structure-analyzer", () => {
  describe("buildStructureAnalysisPrompt", () => {
    it("1. 提示词包含片段数量与字段", () => {
      const segments = [
        makeSegment({ id: "seg-1", title: "段落一", summary: "摘要一", estimatedDuration: 10 }),
        makeSegment({ id: "seg-2", title: "段落二", summary: "摘要二", estimatedDuration: 15 }),
      ];
      const prompt = buildStructureAnalysisPrompt(segments);
      expect(prompt).toContain("2");
      expect(prompt).toContain("seg-1");
      expect(prompt).toContain("段落一");
      expect(prompt).toContain("seg-2");
      expect(prompt).toContain("段落二");
      // 包含 7 种 beat 类型
      for (const beatType of NARRATIVE_BEAT_TYPES) {
        expect(prompt).toContain(beatType);
      }
    });

    it("2. 空片段仍能构建提示词（不抛错）", () => {
      const prompt = buildStructureAnalysisPrompt([]);
      expect(prompt).toContain("0");
      expect(typeof prompt).toBe("string");
    });
  });

  describe("parseNarrativeBeats", () => {
    it("3. 正常解析完整的 beat 数组", () => {
      const raw = [
        {
          type: "setup",
          title: "开端",
          description: "建立世界观",
          emotionIntensity: 0.3,
          segmentIds: ["seg-1", "seg-2"],
        },
        {
          type: "climax",
          title: "高潮",
          description: "最终对决",
          emotionIntensity: 0.95,
          segmentIds: ["seg-5"],
        },
      ];
      const beats = parseNarrativeBeats(raw);
      expect(beats).toHaveLength(2);
      expect(beats[0]!.type).toBe("setup");
      expect(beats[0]!.title).toBe("开端");
      expect(beats[0]!.segmentIds).toEqual(["seg-1", "seg-2"]);
      expect(beats[0]!.emotionIntensity).toBe(0.3);
      expect(beats[1]!.type).toBe("climax");
      expect(beats[1]!.emotionIntensity).toBe(0.95);
    });

    it("4. 不合法的 type 回退为 setup", () => {
      const raw = [{ type: "invalid_type", title: "测试" }];
      const beats = parseNarrativeBeats(raw);
      expect(beats[0]!.type).toBe("setup");
    });

    it("5. 缺失 type 时默认 setup", () => {
      const raw = [{ title: "无 type 的节点" }];
      const beats = parseNarrativeBeats(raw);
      expect(beats[0]!.type).toBe("setup");
    });

    it("6. emotionIntensity 超出 0-1 时被 clamp", () => {
      const raw = [
        { type: "setup", emotionIntensity: 1.5 },
        { type: "climax", emotionIntensity: -0.3 },
      ];
      const beats = parseNarrativeBeats(raw);
      expect(beats[0]!.emotionIntensity).toBe(1);
      expect(beats[1]!.emotionIntensity).toBe(0);
    });

    it("7. 缺失 emotionIntensity 时默认 0.5", () => {
      const raw = [{ type: "setup" }];
      const beats = parseNarrativeBeats(raw);
      expect(beats[0]!.emotionIntensity).toBe(0.5);
    });

    it("8. segmentIds 非数组时默认空数组", () => {
      const raw = [{ type: "setup", segmentIds: "not-an-array" }];
      const beats = parseNarrativeBeats(raw);
      expect(beats[0]!.segmentIds).toEqual([]);
    });

    it("9. 空数组返回空数组", () => {
      expect(parseNarrativeBeats([])).toEqual([]);
    });

    it("10. 每个 beat 都有唯一 id", () => {
      const raw = [
        { type: "setup" },
        { type: "climax" },
        { type: "resolution" },
      ];
      const beats = parseNarrativeBeats(raw);
      const ids = beats.map((b) => b.id);
      expect(new Set(ids).size).toBe(3);
    });
  });

  describe("populateBeatPositionsAndDurations", () => {
    it("11. 根据 segmentIds 计算 position 与 duration", () => {
      const segments = [
        makeSegment({ id: "seg-1", estimatedDuration: 10 }),
        makeSegment({ id: "seg-2", estimatedDuration: 20 }),
        makeSegment({ id: "seg-3", estimatedDuration: 30 }),
        makeSegment({ id: "seg-4", estimatedDuration: 40 }),
      ];
      const beats = [
        makeBeat({ segmentIds: ["seg-1"] }),
        makeBeat({ segmentIds: ["seg-3", "seg-4"] }),
      ];
      const result = populateBeatPositionsAndDurations(beats, segments);
      // beat-0 关联 seg-1（索引 0，4 个 segment）→ position = 0.5/4 = 0.125
      expect(result[0]!.position).toBeCloseTo(0.125, 3);
      expect(result[0]!.estimatedDuration).toBe(10);
      // beat-1 关联 seg-3（索引 2）+ seg-4（索引 3）
      // position = ((2.5/4) + (3.5/4)) / 2 = (0.625 + 0.875) / 2 = 0.75
      expect(result[1]!.position).toBeCloseTo(0.75, 3);
      expect(result[1]!.estimatedDuration).toBe(70); // 30 + 40
    });

    it("12. segmentIds 不匹配时 position 用 beat 索引回退", () => {
      const segments = [makeSegment({ id: "seg-1" })];
      const beats = [
        makeBeat({ segmentIds: ["non-existent"] }),
        makeBeat({ segmentIds: ["also-non-existent"] }),
      ];
      const result = populateBeatPositionsAndDurations(beats, segments);
      // 回退到 (0.5/2) = 0.25 和 (1.5/2) = 0.75
      expect(result[0]!.position).toBeCloseTo(0.25, 3);
      expect(result[1]!.position).toBeCloseTo(0.75, 3);
    });

    it("13. segmentIds 为空时 position 用 beat 索引回退", () => {
      const segments = [makeSegment({ id: "seg-1", estimatedDuration: 10 })];
      const beats = [makeBeat({ segmentIds: [] }), makeBeat({ segmentIds: [] })];
      const result = populateBeatPositionsAndDurations(beats, segments);
      expect(result[0]!.position).toBeCloseTo(0.25, 3);
      expect(result[1]!.position).toBeCloseTo(0.75, 3);
      // estimatedDuration 无关联，回退到平均时长
      expect(result[0]!.estimatedDuration).toBe(10);
    });

    it("14. segments 为空数组时 position=0、duration=0", () => {
      const beats = [makeBeat({ segmentIds: ["seg-1"] })];
      const result = populateBeatPositionsAndDurations(beats, []);
      expect(result[0]!.position).toBe(0);
      expect(result[0]!.estimatedDuration).toBe(0);
    });
  });

  describe("extractJsonArrayFromText", () => {
    it("15. 提取 ```json 代码块中的数组", () => {
      const text = '一些说明\n```json\n[{"type":"setup"}]\n```\n更多说明';
      const result = extractJsonArrayFromText(text);
      expect(result).toBe('[{"type":"setup"}]');
    });

    it("16. 提取无语言标记的 ``` 代码块中的数组", () => {
      const text = '```\n[{"type":"climax"}]\n```';
      const result = extractJsonArrayFromText(text);
      expect(result).toBe('[{"type":"climax"}]');
    });

    it("17. 无代码块时提取最外层 [ ]", () => {
      const text = 'AI 回复：[{"type":"setup"}, {"type":"climax"}] 完成';
      const result = extractJsonArrayFromText(text);
      expect(result).toBe('[{"type":"setup"}, {"type":"climax"}]');
    });

    it("18. 无 JSON 数组时返回 null", () => {
      expect(extractJsonArrayFromText("纯文本无 JSON")).toBeNull();
    });

    it("19. 多行 JSON 数组也能提取", () => {
      const text = '```json\n[\n  {"type": "setup"},\n  {"type": "climax"}\n]\n```';
      const result = extractJsonArrayFromText(text);
      expect(result).toContain('"setup"');
      expect(result).toContain('"climax"');
    });
  });

  describe("analyzeStoryStructure", () => {
    it("20. 成功路径：AI 返回合法 JSON 数组 → 返回 StoryStructure", async () => {
      const segments = [
        makeSegment({ id: "seg-1", estimatedDuration: 10 }),
        makeSegment({ id: "seg-2", estimatedDuration: 15 }),
        makeSegment({ id: "seg-3", estimatedDuration: 20 }),
      ];
      const aiResponse = JSON.stringify([
        {
          type: "setup",
          title: "开端",
          description: "建立世界观",
          emotionIntensity: 0.3,
          segmentIds: ["seg-1"],
        },
        {
          type: "climax",
          title: "高潮",
          description: "最终对决",
          emotionIntensity: 0.9,
          segmentIds: ["seg-2", "seg-3"],
        },
      ]);
      const generateTextFn = makeMockGenerateTextFn(aiResponse);

      const result = await analyzeStoryStructure(segments, generateTextFn);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.beats).toHaveLength(2);
        expect(result.data.beats[0]!.type).toBe("setup");
        expect(result.data.beats[1]!.type).toBe("climax");
        // 高潮位置 = climax beat 的 position
        expect(result.data.climaxPosition).toBeCloseTo(result.data.beats[1]!.position, 3);
        // 情绪曲线至少有 2 个采样点 + 1 个中点 = 3 个
        expect(result.data.emotionCurve.length).toBeGreaterThanOrEqual(3);
        // overallPacing：平均强度 = (0.3 + 0.9) / 2 = 0.6，不 >0.6，所以 normal
        expect(result.data.overallPacing).toBe("normal");
      }
    });

    it("21. AI 调用失败时返回 error", async () => {
      const segments = [makeSegment()];
      const generateTextFn = makeFailingGenerateTextFn("API 错误");
      const result = await analyzeStoryStructure(segments, generateTextFn);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("API 错误");
      }
    });

    it("22. AI 返回无法解析为 JSON 时返回 error", async () => {
      const segments = [makeSegment()];
      const generateTextFn = makeMockGenerateTextFn("这不是 JSON");
      const result = await analyzeStoryStructure(segments, generateTextFn);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("无法解析");
      }
    });

    it("23. AI 返回 JSON 但非数组时返回 error", async () => {
      const segments = [makeSegment()];
      // 输入是 JSON 对象而非数组，extractJsonArrayFromText 找不到 [...] 返回 null
      const generateTextFn = makeMockGenerateTextFn('{"not": "an array"}');
      const result = await analyzeStoryStructure(segments, generateTextFn);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("无法解析");
      }
    });

    it("24. AI 返回空数组时返回 error", async () => {
      const segments = [makeSegment()];
      const generateTextFn = makeMockGenerateTextFn("[]");
      const result = await analyzeStoryStructure(segments, generateTextFn);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("未识别到");
      }
    });

    it("25. 空 segments 时返回 error", async () => {
      const generateTextFn = makeMockGenerateTextFn("[]");
      const result = await analyzeStoryStructure([], generateTextFn);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("无 segments");
      }
    });

    it("26. AI 返回带 ```json 代码块的数组也能解析", async () => {
      const segments = [makeSegment({ id: "seg-1" })];
      const aiResponse = '```json\n[{"type":"setup","segmentIds":["seg-1"],"emotionIntensity":0.3}]\n```';
      const generateTextFn = makeMockGenerateTextFn(aiResponse);
      const result = await analyzeStoryStructure(segments, generateTextFn);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.beats).toHaveLength(1);
        expect(result.data.beats[0]!.type).toBe("setup");
      }
    });
  });

  describe("suggestDurationByStructure", () => {
    it("27. climax beat 的 segment 时长缩短 20%", () => {
      const segments = [makeSegment({ id: "seg-1", estimatedDuration: 10 })];
      const structure = {
        beats: [makeBeat({ type: "climax", segmentIds: ["seg-1"] })],
        overallPacing: "normal" as const,
        emotionCurve: [],
        climaxPosition: 0.5,
      };
      const result = suggestDurationByStructure(segments, structure);
      expect(result.get("seg-1")).toBe(8); // 10 * 0.8 = 8
    });

    it("28. setup beat 的 segment 时长延长 20%", () => {
      const segments = [makeSegment({ id: "seg-1", estimatedDuration: 10 })];
      const structure = {
        beats: [makeBeat({ type: "setup", segmentIds: ["seg-1"] })],
        overallPacing: "normal" as const,
        emotionCurve: [],
        climaxPosition: 0.5,
      };
      const result = suggestDurationByStructure(segments, structure);
      expect(result.get("seg-1")).toBe(12); // 10 * 1.2 = 12
    });

    it("29. rising_action beat 保持原时长", () => {
      const segments = [makeSegment({ id: "seg-1", estimatedDuration: 10 })];
      const structure = {
        beats: [makeBeat({ type: "rising_action", segmentIds: ["seg-1"] })],
        overallPacing: "normal" as const,
        emotionCurve: [],
        climaxPosition: 0.5,
      };
      const result = suggestDurationByStructure(segments, structure);
      expect(result.get("seg-1")).toBe(10);
    });

    it("30. 不属于任何 beat 的 segment 保持原时长", () => {
      const segments = [makeSegment({ id: "seg-1", estimatedDuration: 10 })];
      const structure = {
        beats: [makeBeat({ type: "setup", segmentIds: ["other-seg"] })],
        overallPacing: "normal" as const,
        emotionCurve: [],
        climaxPosition: 0.5,
      };
      const result = suggestDurationByStructure(segments, structure);
      expect(result.get("seg-1")).toBe(10);
    });

    it("31. 时长建议 clamp 到 [2, 30]", () => {
      // 短时长延长后仍 >= 2
      const segments1 = [makeSegment({ id: "seg-1", estimatedDuration: 1 })];
      const structure1 = {
        beats: [makeBeat({ type: "climax", segmentIds: ["seg-1"] })],
        overallPacing: "normal" as const,
        emotionCurve: [],
        climaxPosition: 0.5,
      };
      expect(suggestDurationByStructure(segments1, structure1).get("seg-1")).toBe(2); // clamp 下限

      // 长时长延长后 clamp 到 30
      const segments2 = [makeSegment({ id: "seg-2", estimatedDuration: 30 })];
      const structure2 = {
        beats: [makeBeat({ type: "setup", segmentIds: ["seg-2"] })],
        overallPacing: "normal" as const,
        emotionCurve: [],
        climaxPosition: 0.5,
      };
      expect(suggestDurationByStructure(segments2, structure2).get("seg-2")).toBe(30); // clamp 上限
    });

    it("32. segment 属于多个 beat 时取第一个 beat 的规则", () => {
      const segments = [makeSegment({ id: "seg-1", estimatedDuration: 10 })];
      const structure = {
        beats: [
          makeBeat({ type: "setup", segmentIds: ["seg-1"] }),       // 第一个，1.2x
          makeBeat({ type: "climax", segmentIds: ["seg-1"] }),      // 第二个，0.8x
        ],
        overallPacing: "normal" as const,
        emotionCurve: [],
        climaxPosition: 0.5,
      };
      const result = suggestDurationByStructure(segments, structure);
      // 取第一个匹配 beat 的规则 → setup 的 1.2x
      expect(result.get("seg-1")).toBe(12);
    });
  });

  describe("recalculateStoryStructure", () => {
    it("33. 不调用 AI，根据当前 beats 重算 structure", () => {
      const segments = [
        makeSegment({ id: "seg-1", estimatedDuration: 10 }),
        makeSegment({ id: "seg-2", estimatedDuration: 20 }),
      ];
      const beats = [
        makeBeat({ type: "setup", segmentIds: ["seg-1"], emotionIntensity: 0.3 }),
        makeBeat({ type: "climax", segmentIds: ["seg-2"], emotionIntensity: 0.9 }),
      ];
      const result = recalculateStoryStructure(beats, segments);
      expect(result.beats).toHaveLength(2);
      expect(result.beats[0]!.position).toBeCloseTo(0.25, 3);
      expect(result.beats[1]!.position).toBeCloseTo(0.75, 3);
      expect(result.beats[0]!.estimatedDuration).toBe(10);
      expect(result.beats[1]!.estimatedDuration).toBe(20);
      // 高潮位置 = climax beat 的 position
      expect(result.climaxPosition).toBeCloseTo(0.75, 3);
      // 情绪曲线至少 3 个点
      expect(result.emotionCurve.length).toBeGreaterThanOrEqual(3);
      // 平均强度 0.6 → normal
      expect(result.overallPacing).toBe("normal");
    });
  });

  describe("narrative-beats 纯函数", () => {
    describe("computeBeatPosition", () => {
      it("34. 根据 segmentIds 计算加权位置", () => {
        const segments = [
          makeSegment({ id: "seg-1" }),
          makeSegment({ id: "seg-2" }),
          makeSegment({ id: "seg-3" }),
          makeSegment({ id: "seg-4" }),
        ];
        // 关联 seg-2 和 seg-4（索引 1 和 3）
        const position = computeBeatPosition(
          { segmentIds: ["seg-2", "seg-4"] },
          segments,
          0,
          1,
        );
        // ((1.5/4) + (3.5/4)) / 2 = (0.375 + 0.875) / 2 = 0.625
        expect(position).toBeCloseTo(0.625, 3);
      });

      it("35. segments 为空时返回 0", () => {
        const position = computeBeatPosition({ segmentIds: ["x"] }, [], 0, 1);
        expect(position).toBe(0);
      });

      it("36. segmentIds 为空时用 beatIndex 回退", () => {
        const segments = [makeSegment({ id: "seg-1" })];
        const position = computeBeatPosition({ segmentIds: [] }, segments, 1, 3);
        // (1.5/3) = 0.5
        expect(position).toBeCloseTo(0.5, 3);
      });
    });

    describe("findClimaxPosition", () => {
      it("37. 有 climax beat 时返回其 position", () => {
        const beats = [
          makeBeat({ type: "setup", position: 0.1 }),
          makeBeat({ type: "climax", position: 0.75 }),
          makeBeat({ type: "resolution", position: 0.9 }),
        ];
        expect(findClimaxPosition(beats)).toBeCloseTo(0.75, 3);
      });

      it("38. 无 climax beat 时回退到 0.75", () => {
        const beats = [
          makeBeat({ type: "setup", position: 0.1 }),
          makeBeat({ type: "resolution", position: 0.9 }),
        ];
        expect(findClimaxPosition(beats)).toBe(0.75);
      });

      it("39. 空 beats 时返回 0.75", () => {
        expect(findClimaxPosition([])).toBe(0.75);
      });
    });

    describe("inferOverallPacing", () => {
      it("40. 平均强度 <0.4 → slow", () => {
        const beats = [
          makeBeat({ emotionIntensity: 0.2 }),
          makeBeat({ emotionIntensity: 0.3 }),
        ];
        expect(inferOverallPacing(beats)).toBe("slow");
      });

      it("41. 平均强度 >0.6 → fast", () => {
        const beats = [
          makeBeat({ emotionIntensity: 0.7 }),
          makeBeat({ emotionIntensity: 0.8 }),
        ];
        expect(inferOverallPacing(beats)).toBe("fast");
      });

      it("42. 平均强度 0.4-0.6 → normal", () => {
        const beats = [
          makeBeat({ emotionIntensity: 0.5 }),
          makeBeat({ emotionIntensity: 0.5 }),
        ];
        expect(inferOverallPacing(beats)).toBe("normal");
      });

      it("43. 空 beats 时返回 normal", () => {
        expect(inferOverallPacing([])).toBe("normal");
      });
    });

    describe("computeEmotionCurve", () => {
      it("44. 在 beats 之间插入中点", () => {
        const beats = [
          makeBeat({ position: 0.0, emotionIntensity: 0.2, title: "开端" }),
          makeBeat({ position: 0.5, emotionIntensity: 0.6, title: "中点" }),
          makeBeat({ position: 1.0, emotionIntensity: 0.9, title: "高潮" }),
        ];
        const curve = computeEmotionCurve(beats);
        // 3 个 beat + 2 个中点 = 5 个点
        expect(curve).toHaveLength(5);
        expect(curve[0]!.position).toBe(0);
        expect(curve[1]!.position).toBe(0.25); // 中点
        expect(curve[2]!.position).toBe(0.5);
        expect(curve[3]!.position).toBe(0.75); // 中点
        expect(curve[4]!.position).toBe(1.0);
      });

      it("45. 单个 beat 返回单点", () => {
        const beats = [makeBeat({ position: 0.5, emotionIntensity: 0.5 })];
        const curve = computeEmotionCurve(beats);
        expect(curve).toHaveLength(1);
      });

      it("46. 空 beats 返回空数组", () => {
        expect(computeEmotionCurve([])).toEqual([]);
      });

      it("47. 按 position 排序输出", () => {
        const beats = [
          makeBeat({ position: 1.0, emotionIntensity: 0.9 }),
          makeBeat({ position: 0.0, emotionIntensity: 0.2 }),
          makeBeat({ position: 0.5, emotionIntensity: 0.6 }),
        ];
        const curve = computeEmotionCurve(beats);
        expect(curve[0]!.position).toBe(0);
        expect(curve[1]!.position).toBe(0.25);
        expect(curve[2]!.position).toBe(0.5);
        expect(curve[3]!.position).toBe(0.75);
        expect(curve[4]!.position).toBe(1.0);
      });
    });
  });
});
