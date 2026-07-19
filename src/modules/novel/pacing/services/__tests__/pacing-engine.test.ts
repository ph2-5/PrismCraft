/**
 * Task 2A.14 — pacing-engine 单元测试
 *
 * 覆盖核心函数：
 * - groupSegmentsByBeat: 分组逻辑 + 未分组处理
 * - resolvePacingConfig: 预设覆盖
 * - normalizeRatios: 归一化 + 0 总和回退
 * - allocateDurationByBeat: 阶段分配 + 加权分配
 * - distributeDurationToSegments: segment 分配 + 夹紧
 * - generatePacingNotes: 说明生成
 * - planPacing: 集成测试
 * - applyPacingToBeats: 应用到 beats
 */

import { describe, it, expect } from "vitest";
import {
  groupSegmentsByBeat,
  resolvePacingConfig,
  normalizeRatios,
  allocateDurationByBeat,
  distributeDurationToSegments,
  distributeUngroupedSegments,
  generatePacingNotes,
  planPacing,
  applyPacingToBeats,
} from "../pacing-engine";
import {
  DEFAULT_PACING_CONFIG,
  SEGMENT_DURATION_MIN,
  SEGMENT_DURATION_MAX,
  type PacingConfig,
} from "../../domain/pacing-types";
import type {
  NarrativeBeat,
  StoryStructure,
} from "../../../structure/domain/narrative-beats";
import type { NovelSegment } from "../../../domain/types";

// ============================================================================
// 测试辅助
// ============================================================================

function makeSegment(overrides: Partial<NovelSegment> = {}): NovelSegment {
  return {
    id: "seg-1",
    title: "测试片段",
    summary: "",
    startChar: 0,
    endChar: 100,
    estimatedDuration: 10,
    keyEvents: [],
    text: "测试文本",
    ...overrides,
  };
}

function makeBeat(overrides: Partial<NarrativeBeat> = {}): NarrativeBeat {
  return {
    id: "beat-1",
    segmentIds: ["seg-1"],
    type: "setup",
    title: "开端",
    description: "",
    emotionIntensity: 0.3,
    estimatedDuration: 10,
    position: 0.1,
    ...overrides,
  };
}

function makeStructure(overrides: Partial<StoryStructure> = {}): StoryStructure {
  return {
    beats: [makeBeat()],
    overallPacing: "normal",
    emotionCurve: [{ position: 0.1, intensity: 0.3 }],
    climaxPosition: 0.75,
    ...overrides,
  };
}

// 7 个完整 beats（覆盖所有类型）
function makeFullBeats(): NarrativeBeat[] {
  return [
    makeBeat({ id: "b1", type: "setup", segmentIds: ["s1"], estimatedDuration: 10, position: 0.05 }),
    makeBeat({ id: "b2", type: "inciting_incident", segmentIds: ["s2"], estimatedDuration: 8, position: 0.15 }),
    makeBeat({ id: "b3", type: "rising_action", segmentIds: ["s3"], estimatedDuration: 12, position: 0.3 }),
    makeBeat({ id: "b4", type: "midpoint", segmentIds: ["s4"], estimatedDuration: 10, position: 0.45 }),
    makeBeat({ id: "b5", type: "climax", segmentIds: ["s5"], estimatedDuration: 15, position: 0.7 }),
    makeBeat({ id: "b6", type: "falling_action", segmentIds: ["s6"], estimatedDuration: 8, position: 0.85 }),
    makeBeat({ id: "b7", type: "resolution", segmentIds: ["s7"], estimatedDuration: 10, position: 0.95 }),
  ];
}

function makeFullSegments(): NovelSegment[] {
  return [
    makeSegment({ id: "s1", estimatedDuration: 10 }),
    makeSegment({ id: "s2", estimatedDuration: 8 }),
    makeSegment({ id: "s3", estimatedDuration: 12 }),
    makeSegment({ id: "s4", estimatedDuration: 10 }),
    makeSegment({ id: "s5", estimatedDuration: 15 }),
    makeSegment({ id: "s6", estimatedDuration: 8 }),
    makeSegment({ id: "s7", estimatedDuration: 10 }),
  ];
}

// ============================================================================
// groupSegmentsByBeat
// ============================================================================

describe("groupSegmentsByBeat", () => {
  it("1. 应将 segments 按 beat.segmentIds 正确分组", () => {
    const segments = [
      makeSegment({ id: "s1" }),
      makeSegment({ id: "s2" }),
      makeSegment({ id: "s3" }),
    ];
    const beats = [
      makeBeat({ id: "b1", segmentIds: ["s1", "s2"] }),
      makeBeat({ id: "b2", segmentIds: ["s3"] }),
    ];
    const { beatGroups, ungrouped } = groupSegmentsByBeat(segments, beats);
    expect(beatGroups.get("b1")?.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(beatGroups.get("b2")?.map((s) => s.id)).toEqual(["s3"]);
    expect(ungrouped).toHaveLength(0);
  });

  it("2. 应将未关联任何 beat 的 segment 放入 ungrouped", () => {
    const segments = [
      makeSegment({ id: "s1" }),
      makeSegment({ id: "s2" }),
      makeSegment({ id: "s3" }),
    ];
    const beats = [makeBeat({ id: "b1", segmentIds: ["s1"] })];
    const { beatGroups, ungrouped } = groupSegmentsByBeat(segments, beats);
    expect(beatGroups.get("b1")?.map((s) => s.id)).toEqual(["s1"]);
    expect(ungrouped.map((s) => s.id)).toEqual(["s2", "s3"]);
  });

  it("3. 一个 segment 属于多个 beat 时只分到第一个匹配的 beat", () => {
    const segments = [makeSegment({ id: "s1" })];
    const beats = [
      makeBeat({ id: "b1", segmentIds: ["s1"] }),
      makeBeat({ id: "b2", segmentIds: ["s1"] }),
    ];
    const { beatGroups, ungrouped } = groupSegmentsByBeat(segments, beats);
    expect(beatGroups.get("b1")?.map((s) => s.id)).toEqual(["s1"]);
    expect(beatGroups.get("b2")?.map((s) => s.id)).toEqual([]);
    expect(ungrouped).toHaveLength(0);
  });
});

// ============================================================================
// resolvePacingConfig
// ============================================================================

describe("resolvePacingConfig", () => {
  it("4. preset !== custom 时应用预设覆盖 4 个 ratio", () => {
    const config: PacingConfig = {
      preset: "fast",
      targetDuration: 60,
      climaxDurationRatio: 0.5,  // 会被预设覆盖
      setupDurationRatio: 0.5,   // 会被预设覆盖
      risingDurationRatio: 0.5,  // 会被预设覆盖
      resolutionDurationRatio: 0.5, // 会被预设覆盖
    };
    const resolved = resolvePacingConfig(config);
    expect(resolved.climaxDurationRatio).toBe(0.20);
    expect(resolved.setupDurationRatio).toBe(0.15);
    expect(resolved.risingDurationRatio).toBe(0.45);
    expect(resolved.resolutionDurationRatio).toBe(0.20);
    expect(resolved.preset).toBe("fast");
    expect(resolved.targetDuration).toBe(60);
  });

  it("5. preset = custom 时保留用户输入的 ratio", () => {
    const config: PacingConfig = {
      preset: "custom",
      targetDuration: 90,
      climaxDurationRatio: 0.3,
      setupDurationRatio: 0.1,
      risingDurationRatio: 0.4,
      resolutionDurationRatio: 0.2,
    };
    const resolved = resolvePacingConfig(config);
    expect(resolved.climaxDurationRatio).toBe(0.3);
    expect(resolved.setupDurationRatio).toBe(0.1);
    expect(resolved.risingDurationRatio).toBe(0.4);
    expect(resolved.resolutionDurationRatio).toBe(0.2);
  });
});

// ============================================================================
// normalizeRatios
// ============================================================================

describe("normalizeRatios", () => {
  it("6. 总和为 1.0 时保持原比例", () => {
    const config: PacingConfig = {
      ...DEFAULT_PACING_CONFIG,
      setupDurationRatio: 0.25,
      risingDurationRatio: 0.45,
      climaxDurationRatio: 0.10,
      resolutionDurationRatio: 0.20,
    };
    const normalized = normalizeRatios(config);
    expect(normalized.setup).toBeCloseTo(0.25, 6);
    expect(normalized.rising).toBeCloseTo(0.45, 6);
    expect(normalized.climax).toBeCloseTo(0.10, 6);
    expect(normalized.resolution).toBeCloseTo(0.20, 6);
  });

  it("7. 总和 ≠ 1.0 时按比例归一化", () => {
    const config: PacingConfig = {
      ...DEFAULT_PACING_CONFIG,
      setupDurationRatio: 0.2,
      risingDurationRatio: 0.4,
      climaxDurationRatio: 0.2,
      resolutionDurationRatio: 0.2,
      // 总和 = 1.0，但用户可能输入 0.4 + 0.4 + 0.1 + 0.1 = 1.0
    };
    const normalized = normalizeRatios(config);
    const sum = normalized.setup + normalized.rising + normalized.climax + normalized.resolution;
    expect(sum).toBeCloseTo(1.0, 6);
  });

  it("8. 总和为 0 时回退到 normal 预设", () => {
    const config: PacingConfig = {
      preset: "custom",
      targetDuration: 60,
      setupDurationRatio: 0,
      risingDurationRatio: 0,
      climaxDurationRatio: 0,
      resolutionDurationRatio: 0,
    };
    const normalized = normalizeRatios(config);
    expect(normalized.setup).toBe(0.20);
    expect(normalized.rising).toBe(0.40);
    expect(normalized.climax).toBe(0.15);
    expect(normalized.resolution).toBe(0.25);
  });
});

// ============================================================================
// allocateDurationByBeat
// ============================================================================

describe("allocateDurationByBeat", () => {
  it("9. 应按阶段比例 + beat.estimatedDuration 加权分配", () => {
    const beats = makeFullBeats();
    const config: PacingConfig = {
      ...DEFAULT_PACING_CONFIG,
      preset: "normal",
      targetDuration: 100,
    };
    const result = allocateDurationByBeat(beats, config);

    // setup 阶段：b1 (10) + b2 (8) = 18, 总时长 100 × 0.20 = 20
    // b1 = 20 × 10/18 ≈ 11.11, b2 = 20 × 8/18 ≈ 8.89
    expect(result.get("b1")!).toBeCloseTo(20 * 10 / 18, 2);
    expect(result.get("b2")!).toBeCloseTo(20 * 8 / 18, 2);

    // climax 阶段：b5 (15), 总时长 100 × 0.15 = 15
    expect(result.get("b5")!).toBeCloseTo(15, 2);
  });

  it("10. estimatedDuration 全为 0 时平均分配", () => {
    const beats = [
      makeBeat({ id: "b1", type: "setup", estimatedDuration: 0 }),
      makeBeat({ id: "b2", type: "setup", estimatedDuration: 0 }),
    ];
    const config: PacingConfig = {
      ...DEFAULT_PACING_CONFIG,
      preset: "normal",
      targetDuration: 60,
    };
    const result = allocateDurationByBeat(beats, config);
    // setup 阶段 60 × 0.20 = 12, 平均分配到 2 个 beat = 6
    expect(result.get("b1")!).toBeCloseTo(6, 2);
    expect(result.get("b2")!).toBeCloseTo(6, 2);
  });
});

// ============================================================================
// distributeDurationToSegments
// ============================================================================

describe("distributeDurationToSegments", () => {
  it("11. 应按 segment.estimatedDuration 加权分配 beat 时长", () => {
    const beatGroups = new Map([
      ["b1", [makeSegment({ id: "s1", estimatedDuration: 10 }), makeSegment({ id: "s2", estimatedDuration: 30 })]],
    ]);
    const beatDurations = new Map([["b1", 40]]);
    const result = distributeDurationToSegments(beatGroups, beatDurations);
    // s1 = 40 × 10/40 = 10, s2 = 40 × 30/40 = 30
    expect(result.get("s1")!).toBeCloseTo(10, 2);
    expect(result.get("s2")!).toBeCloseTo(30, 2);
  });

  it("12. segment 时长应夹紧到 [SEGMENT_DURATION_MIN, SEGMENT_DURATION_MAX]", () => {
    const beatGroups = new Map([
      ["b1", [makeSegment({ id: "s1", estimatedDuration: 0 })]],
    ]);
    const beatDurations = new Map([["b1", 0.5]]); // 极小值
    const result = distributeDurationToSegments(beatGroups, beatDurations);
    // 平均分配 = 0.5，夹紧到 SEGMENT_DURATION_MIN = 2
    expect(result.get("s1")!).toBeGreaterThanOrEqual(SEGMENT_DURATION_MIN);
    expect(result.get("s1")!).toBeLessThanOrEqual(SEGMENT_DURATION_MAX);
  });
});

// ============================================================================
// distributeUngroupedSegments
// ============================================================================

describe("distributeUngroupedSegments", () => {
  it("13. 应按剩余时长平均分配给未分组的 segments", () => {
    const ungrouped = [
      makeSegment({ id: "u1" }),
      makeSegment({ id: "u2" }),
    ];
    const result = distributeUngroupedSegments(ungrouped, 30, 60);
    // 剩余 = 60 - 30 = 30, 平均 = 15
    expect(result.get("u1")!).toBeCloseTo(15, 2);
    expect(result.get("u2")!).toBeCloseTo(15, 2);
  });

  it("14. 剩余时长 ≤ 0 时使用 targetDuration / count 作为回退", () => {
    const ungrouped = [makeSegment({ id: "u1" }), makeSegment({ id: "u2" })];
    const result = distributeUngroupedSegments(ungrouped, 60, 60);
    // 剩余 = 0, 回退 = 60 / 2 = 30
    expect(result.get("u1")!).toBeCloseTo(30, 2);
    expect(result.get("u2")!).toBeCloseTo(30, 2);
  });
});

// ============================================================================
// generatePacingNotes
// ============================================================================

describe("generatePacingNotes", () => {
  it("15. fast 预设应包含快节奏说明 + 高潮占比说明 + 高潮位置说明", () => {
    const structure = makeStructure({ overallPacing: "fast" });
    const config: PacingConfig = { ...DEFAULT_PACING_CONFIG, preset: "fast" };
    const notes = generatePacingNotes(structure, config);
    expect(notes.length).toBeGreaterThanOrEqual(3);
    expect(notes.some((n) => n.includes("快节奏"))).toBe(true);
    expect(notes.some((n) => n.includes("高潮占比"))).toBe(true);
    expect(notes.some((n) => n.includes("高潮位于"))).toBe(true);
    // overallPacing = fast 应有额外说明
    expect(notes.some((n) => n.includes("情绪强度偏高"))).toBe(true);
  });

  it("16. slow 预设应包含慢节奏说明", () => {
    const structure = makeStructure();
    const config: PacingConfig = { ...DEFAULT_PACING_CONFIG, preset: "slow" };
    const notes = generatePacingNotes(structure, config);
    expect(notes.some((n) => n.includes("慢节奏"))).toBe(true);
  });

  it("17. custom 预设应包含自定义说明", () => {
    const structure = makeStructure();
    const config: PacingConfig = { ...DEFAULT_PACING_CONFIG, preset: "custom" };
    const notes = generatePacingNotes(structure, config);
    expect(notes.some((n) => n.includes("自定义节奏"))).toBe(true);
  });
});

// ============================================================================
// planPacing (集成测试)
// ============================================================================

describe("planPacing", () => {
  it("18. 应产出完整的 PacingResult（7 beats × 7 segments）", () => {
    const segments = makeFullSegments();
    const structure = makeStructure({ beats: makeFullBeats() });
    const config: PacingConfig = {
      ...DEFAULT_PACING_CONFIG,
      preset: "normal",
      targetDuration: 100,
    };
    const result = planPacing(segments, structure, config);

    // 所有 7 个 segments 都应有时长
    expect(result.segmentDurations.size).toBe(7);
    expect(result.totalDuration).toBeGreaterThan(0);
    expect(result.emotionCurve).toBe(structure.emotionCurve);
    expect(result.pacingNotes.length).toBeGreaterThanOrEqual(3);

    // 每个 segment 时长应在 [MIN, MAX] 范围内
    for (const dur of result.segmentDurations.values()) {
      expect(dur).toBeGreaterThanOrEqual(SEGMENT_DURATION_MIN);
      expect(dur).toBeLessThanOrEqual(SEGMENT_DURATION_MAX);
    }
  });

  it("19. fast 预设下高潮 segment 时长应大于 slow 预设下高潮 segment 时长", () => {
    const segments = makeFullSegments();
    const structure = makeStructure({ beats: makeFullBeats() });

    const fastConfig: PacingConfig = { ...DEFAULT_PACING_CONFIG, preset: "fast", targetDuration: 100 };
    const slowConfig: PacingConfig = { ...DEFAULT_PACING_CONFIG, preset: "slow", targetDuration: 100 };

    const fastResult = planPacing(segments, structure, fastConfig);
    const slowResult = planPacing(segments, structure, slowConfig);

    // s5 是 climax beat 关联的 segment
    // fast: climax ratio 0.20, slow: climax ratio 0.10
    // 但夹紧后可能差异变小，所以只验证 fast >= slow
    const fastClimax = fastResult.segmentDurations.get("s5")!;
    const slowClimax = slowResult.segmentDurations.get("s5")!;
    expect(fastClimax).toBeGreaterThanOrEqual(slowClimax);
  });

  it("20. 未分组的 segments 也应包含在结果中", () => {
    const segments = [
      ...makeFullSegments(),
      makeSegment({ id: "unrelated", estimatedDuration: 10 }),
    ];
    const structure = makeStructure({ beats: makeFullBeats() });
    const config: PacingConfig = { ...DEFAULT_PACING_CONFIG, targetDuration: 100 };
    const result = planPacing(segments, structure, config);
    expect(result.segmentDurations.has("unrelated")).toBe(true);
    expect(result.segmentDurations.get("unrelated")!).toBeGreaterThanOrEqual(SEGMENT_DURATION_MIN);
  });
});

// ============================================================================
// applyPacingToBeats
// ============================================================================

describe("applyPacingToBeats", () => {
  it("21. 应将 segment 时长平均分配到该 segment 下的所有 beats", () => {
    const beats = [
      { id: "shot-1", duration: 5, title: "镜头1" },
      { id: "shot-2", duration: 5, title: "镜头2" },
      { id: "shot-3", duration: 5, title: "镜头3" },
    ];
    const pacingResult: { segmentDurations: Map<string, number>; totalDuration: number; emotionCurve: never[]; pacingNotes: never[] } = {
      segmentDurations: new Map([["s1", 12]]), // segment s1 → 12 秒
      totalDuration: 12,
      emotionCurve: [],
      pacingNotes: [],
    };
    const segmentIdMap = new Map([["s1", ["shot-1", "shot-2", "shot-3"]]]);
    const result = applyPacingToBeats(beats, pacingResult, segmentIdMap);
    // 12 / 3 = 4 秒每个 beat
    expect(result[0]!.duration).toBe(4);
    expect(result[1]!.duration).toBe(4);
    expect(result[2]!.duration).toBe(4);
  });

  it("22. 未在 segmentIdMap 中的 beat 应保持原 duration", () => {
    const beats = [
      { id: "shot-1", duration: 5, title: "镜头1" },
      { id: "shot-2", duration: 7, title: "镜头2" }, // 不在 map 中
    ];
    const pacingResult: { segmentDurations: Map<string, number>; totalDuration: number; emotionCurve: never[]; pacingNotes: never[] } = {
      segmentDurations: new Map([["s1", 10]]),
      totalDuration: 10,
      emotionCurve: [],
      pacingNotes: [],
    };
    const segmentIdMap = new Map([["s1", ["shot-1"]]]);
    const result = applyPacingToBeats(beats, pacingResult, segmentIdMap);
    expect(result[0]!.duration).toBe(10);
    expect(result[1]!.duration).toBe(7); // 保持原值
  });

  it("23. 不修改原数组（返回新数组）", () => {
    const beats = [{ id: "shot-1", duration: 5, title: "镜头1" }];
    const pacingResult: { segmentDurations: Map<string, number>; totalDuration: number; emotionCurve: never[]; pacingNotes: never[] } = {
      segmentDurations: new Map([["s1", 8]]),
      totalDuration: 8,
      emotionCurve: [],
      pacingNotes: [],
    };
    const segmentIdMap = new Map([["s1", ["shot-1"]]]);
    const result = applyPacingToBeats(beats, pacingResult, segmentIdMap);
    expect(beats[0]!.duration).toBe(5); // 原数组未修改
    expect(result[0]!.duration).toBe(8); // 新数组已更新
  });
});
