/**
 * Task 2A.13 v5.3 — shot-contract-builder 单元测试
 *
 * 覆盖：
 *   1. buildShotContractPrompt: 提示词构建
 *   2. parseShotContracts: JSON 数组解析与默认值回退
 *   3. extractJsonArrayFromText: 从文本提取 JSON 数组
 *   4. buildShotContractsForBeat: 主流程（AI 成功 + AI 失败回退默认值）
 *   5. buildShotContractsForBeats: 批量构建（含部分失败）
 *   6. shot-contract domain: validateShotContract / clampDuration / 默认常量
 */

import { describe, it, expect } from "vitest";
import {
  buildShotContractPrompt,
  parseShotContracts,
  extractJsonArrayFromText,
  buildShotContractsForBeat,
  buildShotContractsForBeats,
  type GenerateTextFn,
} from "../shot-contract-builder";
import {
  SHOT_SIZES,
  SHOT_MOVEMENTS,
  SHOT_LIGHTINGS,
  DEFAULT_LENS_BY_SIZE,
  DEFAULT_DURATION_BY_SIZE,
  validateShotContract,
  clampDuration,
  type ShotContract,
} from "../../domain/shot-contract";
import type { NarrativeBeat } from "../../domain/narrative-beats";
import type { NovelSegment } from "../../../domain/types";
import type { StoryTreatment } from "../../domain/treatment";

// 测试辅助
function makeSegment(overrides: Partial<NovelSegment> = {}): NovelSegment {
  return {
    id: overrides.id ?? `seg-${Math.random().toString(36).slice(2, 8)}`,
    title: overrides.title ?? "测试段落",
    summary: overrides.summary ?? "测试摘要",
    startChar: 0,
    endChar: 100,
    estimatedDuration: 10,
    keyEvents: [],
    text: "",
    ...overrides,
  };
}

function makeBeat(overrides: Partial<NarrativeBeat> = {}): NarrativeBeat {
  return {
    id: overrides.id ?? `beat-${Math.random().toString(36).slice(2, 8)}`,
    segmentIds: overrides.segmentIds ?? [],
    type: overrides.type ?? "setup",
    title: overrides.title ?? "测试节点",
    description: overrides.description ?? "",
    emotionIntensity: overrides.emotionIntensity ?? 0.5,
    estimatedDuration: overrides.estimatedDuration ?? 10,
    position: overrides.position ?? 0.5,
  };
}

function makeMockGenerateTextFn(response: string): GenerateTextFn {
  return async () => ({ success: true, data: { text: response } });
}

function makeFailingGenerateTextFn(error: string): GenerateTextFn {
  return async () => ({ success: false, error });
}

const SAMPLE_TREATMENT: StoryTreatment = {
  logline: "主角复仇",
  theme: "复仇",
  characterArcs: [],
  tone: "thriller",
  settingDescription: "古代江湖",
};

describe("Task 2A.13 v5.3 — shot-contract-builder", () => {
  describe("buildShotContractPrompt", () => {
    it("1. 提示词包含 beat 信息与片段信息", () => {
      const beat = makeBeat({
        id: "beat-1",
        type: "climax",
        title: "高潮",
        description: "最终对决",
        emotionIntensity: 0.9,
        estimatedDuration: 15,
        segmentIds: ["seg-1"],
      });
      const segments = [makeSegment({ id: "seg-1", title: "段落一" })];
      const prompt = buildShotContractPrompt(beat, segments, SAMPLE_TREATMENT);
      expect(prompt).toContain("climax");
      expect(prompt).toContain("高潮");
      expect(prompt).toContain("最终对决");
      expect(prompt).toContain("段落一");
      expect(prompt).toContain("主角复仇");
      // 包含所有 shotSize / movement / lighting
      for (const size of SHOT_SIZES) expect(prompt).toContain(size);
      for (const movement of SHOT_MOVEMENTS) expect(prompt).toContain(movement);
      for (const lighting of SHOT_LIGHTINGS) expect(prompt).toContain(lighting);
    });

    it("2. 无 treatment 时提示词不含 treatment 部分", () => {
      const beat = makeBeat();
      const segments = [makeSegment()];
      const prompt = buildShotContractPrompt(beat, segments);
      expect(prompt).not.toContain("故事 Treatment");
    });

    it("3. 提示词包含 beat 对应的 shot 数量", () => {
      const beat = makeBeat({ type: "climax" });  // climax → 3 个 shot
      const segments = [makeSegment()];
      const prompt = buildShotContractPrompt(beat, segments);
      expect(prompt).toContain("3");
    });
  });

  describe("parseShotContracts", () => {
    it("4. 正常解析 shot contract 数组", () => {
      const beat = makeBeat({ type: "climax" });
      const raw = [
        {
          shotSize: "close_up",
          lens: "85mm",
          movement: "handheld",
          lighting: "low_key",
          duration: 3,
          blocking: "主角面部特写",
        },
      ];
      const result = parseShotContracts(raw, beat);
      expect(result).toHaveLength(1);
      expect(result[0]!.shotSize).toBe("close_up");
      expect(result[0]!.lens).toBe("85mm");
      expect(result[0]!.movement).toBe("handheld");
      expect(result[0]!.lighting).toBe("low_key");
      expect(result[0]!.duration).toBe(3);
      expect(result[0]!.blocking).toBe("主角面部特写");
    });

    it("5. shotSize 不合法时回退默认值", () => {
      const beat = makeBeat({ type: "climax" });  // climax 默认 close_up
      const raw = [{ shotSize: "invalid_size" }];
      const result = parseShotContracts(raw, beat);
      expect(result[0]!.shotSize).toBe("close_up");
    });

    it("6. movement 不合法时回退 static", () => {
      const beat = makeBeat();
      const raw = [{ movement: "invalid_movement" }];
      const result = parseShotContracts(raw, beat);
      expect(result[0]!.movement).toBe("static");
    });

    it("7. lighting 不合法时按 beat+treatment 回退", () => {
      const beat = makeBeat({ type: "climax" });
      const raw = [{ lighting: "invalid" }];
      const result = parseShotContracts(raw, beat, SAMPLE_TREATMENT);
      // climax + thriller tone → low_key
      expect(result[0]!.lighting).toBe("low_key");
    });

    it("8. lens 缺失时按 shotSize 回退默认", () => {
      const beat = makeBeat();
      const raw = [{ shotSize: "wide" }];  // wide → 35mm
      const result = parseShotContracts(raw, beat);
      expect(result[0]!.lens).toBe(DEFAULT_LENS_BY_SIZE.wide);
    });

    it("9. duration 缺失时按 shotSize 回退默认", () => {
      const beat = makeBeat();
      const raw = [{ shotSize: "wide" }];  // wide → 5 秒
      const result = parseShotContracts(raw, beat);
      expect(result[0]!.duration).toBe(DEFAULT_DURATION_BY_SIZE.wide);
    });

    it("10. duration 超出范围时 clamp 到 [2, 30]", () => {
      const beat = makeBeat();
      const raw = [
        { duration: 1 },    // 低于下限 → 2
        { duration: 100 },  // 高于上限 → 30
      ];
      const result = parseShotContracts(raw, beat);
      expect(result[0]!.duration).toBe(2);
      expect(result[1]!.duration).toBe(30);
    });

    it("11. blocking 缺失时为空字符串", () => {
      const beat = makeBeat();
      const raw = [{}];
      const result = parseShotContracts(raw, beat);
      expect(result[0]!.blocking).toBe("");
    });

    it("12. 空数组返回空数组", () => {
      const beat = makeBeat();
      expect(parseShotContracts([], beat)).toEqual([]);
    });
  });

  describe("extractJsonArrayFromText", () => {
    it("13. 提取 ```json 代码块中的数组", () => {
      const text = '```json\n[{"shotSize":"wide"}]\n```';
      expect(extractJsonArrayFromText(text)).toBe('[{"shotSize":"wide"}]');
    });

    it("14. 无代码块时提取最外层 [ ]", () => {
      const text = 'AI: [{"shotSize":"wide"}] 完成';
      expect(extractJsonArrayFromText(text)).toBe('[{"shotSize":"wide"}]');
    });

    it("15. 无 JSON 数组时返回 null", () => {
      expect(extractJsonArrayFromText("纯文本")).toBeNull();
    });
  });

  describe("buildShotContractsForBeat", () => {
    it("16. 成功路径：AI 返回合法数组 → 返回 ShotContract[]", async () => {
      const beat = makeBeat({ id: "beat-1", type: "climax" });
      const segments = [makeSegment({ id: "seg-1" })];
      const aiResponse = JSON.stringify([
        {
          shotSize: "close_up",
          lens: "85mm",
          movement: "handheld",
          lighting: "low_key",
          duration: 3,
          blocking: "主角面部",
        },
        {
          shotSize: "medium",
          lens: "50mm",
          movement: "static",
          lighting: "low_key",
          duration: 4,
          blocking: "对手站立",
        },
      ]);
      const result = await buildShotContractsForBeat(beat, segments, makeMockGenerateTextFn(aiResponse));
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(2);
        expect(result.data[0]!.id).toBe("shot-beat-1-1");
        expect(result.data[0]!.beatId).toBe("beat-1");
        expect(result.data[0]!.shotNumber).toBe(1);
        expect(result.data[1]!.shotNumber).toBe(2);
        expect(result.data[0]!.shotSize).toBe("close_up");
      }
    });

    it("17. AI 调用失败时用默认规则生成（不报错）", async () => {
      const beat = makeBeat({ id: "beat-1", type: "setup" });  // setup → 1 个 shot
      const segments = [makeSegment()];
      const result = await buildShotContractsForBeat(beat, segments, makeFailingGenerateTextFn("API 错误"));
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
        // setup 默认 shotSize = extreme_wide
        expect(result.data[0]!.shotSize).toBe("extreme_wide");
        expect(result.data[0]!.movement).toBe("static");
        expect(result.data[0]!.blocking).toBe(beat.description || beat.title);
      }
    });

    it("18. AI 返回无法解析为 JSON 时返回 error", async () => {
      const beat = makeBeat();
      const segments = [makeSegment()];
      const result = await buildShotContractsForBeat(beat, segments, makeMockGenerateTextFn("纯文本"));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("无法解析");
      }
    });

    it("19. AI 返回空数组时返回 error", async () => {
      const beat = makeBeat();
      const segments = [makeSegment()];
      const result = await buildShotContractsForBeat(beat, segments, makeMockGenerateTextFn("[]"));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("为空");
      }
    });

    it("20. startShotNumber 参数控制 shot 序号起始值", async () => {
      const beat = makeBeat({ id: "beat-1", type: "climax" });
      const segments = [makeSegment()];
      const aiResponse = JSON.stringify([
        { shotSize: "close_up", blocking: "shot1" },
        { shotSize: "medium", blocking: "shot2" },
        { shotSize: "wide", blocking: "shot3" },
      ]);
      const result = await buildShotContractsForBeat(
        beat,
        segments,
        makeMockGenerateTextFn(aiResponse),
        undefined,
        10,  // startShotNumber
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[0]!.shotNumber).toBe(10);
        expect(result.data[1]!.shotNumber).toBe(11);
        expect(result.data[2]!.shotNumber).toBe(12);
      }
    });
  });

  describe("buildShotContractsForBeats", () => {
    it("21. 批量构建：所有 beats 成功 → success=true, errors=[]", async () => {
      const beats = [
        makeBeat({ id: "beat-1", type: "setup" }),
        makeBeat({ id: "beat-2", type: "climax" }),
      ];
      const segments = [makeSegment({ id: "seg-1" })];
      const aiResponse = JSON.stringify([
        { shotSize: "close_up", blocking: "x" },
      ]);
      const result = await buildShotContractsForBeats(beats, segments, makeMockGenerateTextFn(aiResponse));
      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      // beat-1: 1 shot (setup) + beat-2: 1 shot (AI 返回的) = 2 shots
      expect(result.data).toHaveLength(2);
      // shotNumber 全局唯一
      expect(result.data[0]!.shotNumber).toBe(1);
      expect(result.data[1]!.shotNumber).toBe(2);
    });

    it("22. 部分 beats AI 返回无法解析 → success=false 但仍累积成功的 contracts", async () => {
      const beats = [
        makeBeat({ id: "beat-1", type: "setup" }),
        makeBeat({ id: "beat-2", type: "climax" }),
      ];
      const segments = [makeSegment({ id: "seg-1" })];
      // 第一次调用返回合法 JSON，第二次返回纯文本
      let callCount = 0;
      const mockFn: GenerateTextFn = async () => {
        callCount++;
        if (callCount === 1) {
          return { success: true, data: { text: '[{"shotSize":"wide","blocking":"x"}]' } };
        }
        return { success: true, data: { text: "纯文本无 JSON" } };
      };
      const result = await buildShotContractsForBeats(beats, segments, mockFn);
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("beat-2");
      // beat-1 的 1 个 shot 仍保留
      expect(result.data).toHaveLength(1);
    });

    it("23. 空 beats 数组返回空 contracts + 空 errors", async () => {
      const result = await buildShotContractsForBeats([], [], makeMockGenerateTextFn("[]"));
      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
      expect(result.errors).toEqual([]);
    });
  });

  describe("shot-contract domain", () => {
    describe("validateShotContract", () => {
      const validContract: ShotContract = {
        id: "shot-1",
        beatId: "beat-1",
        shotNumber: 1,
        shotSize: "wide",
        lens: "35mm",
        movement: "static",
        lighting: "natural",
        duration: 5,
        blocking: "主角站立",
      };

      it("24. 合法 contract 返回空错误数组", () => {
        expect(validateShotContract(validContract)).toEqual([]);
      });

      it("25. shotNumber < 1 时报错", () => {
        const errors = validateShotContract({ ...validContract, shotNumber: 0 });
        expect(errors).toContain("shotNumber 必须 >= 1");
      });

      it("26. shotSize 不合法时报错", () => {
        const errors = validateShotContract({ ...validContract, shotSize: "invalid" as never });
        expect(errors.some((e) => e.includes("shotSize"))).toBe(true);
      });

      it("27. duration < 2 时报错", () => {
        const errors = validateShotContract({ ...validContract, duration: 1 });
        expect(errors.some((e) => e.includes("duration"))).toBe(true);
      });

      it("28. duration > 30 时报错", () => {
        const errors = validateShotContract({ ...validContract, duration: 31 });
        expect(errors.some((e) => e.includes("duration"))).toBe(true);
      });

      it("29. blocking 为空时报错", () => {
        const errors = validateShotContract({ ...validContract, blocking: "" });
        expect(errors).toContain("blocking 不能为空");
      });

      it("30. id 为空时报错", () => {
        const errors = validateShotContract({ ...validContract, id: "" });
        expect(errors).toContain("id 不能为空");
      });
    });

    describe("clampDuration", () => {
      it("31. 低于下限时返回 2", () => {
        expect(clampDuration(0)).toBe(2);
        expect(clampDuration(-5)).toBe(2);
      });

      it("32. 高于上限时返回 30", () => {
        expect(clampDuration(50)).toBe(30);
        expect(clampDuration(1000)).toBe(30);
      });

      it("33. 范围内返回原值", () => {
        expect(clampDuration(5)).toBe(5);
        expect(clampDuration(15)).toBe(15);
        expect(clampDuration(2)).toBe(2);
        expect(clampDuration(30)).toBe(30);
      });
    });

    describe("DEFAULT_LENS_BY_SIZE", () => {
      it("34. 每种 shotSize 都有默认 lens", () => {
        for (const size of SHOT_SIZES) {
          const lens = DEFAULT_LENS_BY_SIZE[size];
          expect(typeof lens).toBe("string");
          expect(lens.length).toBeGreaterThan(0);
          expect(lens).toMatch(/\d+mm$/);
        }
      });
    });

    describe("DEFAULT_DURATION_BY_SIZE", () => {
      it("35. 每种 shotSize 都有默认 duration 在 [2, 30] 范围", () => {
        for (const size of SHOT_SIZES) {
          const duration = DEFAULT_DURATION_BY_SIZE[size];
          expect(duration).toBeGreaterThanOrEqual(2);
          expect(duration).toBeLessThanOrEqual(30);
        }
      });

      it("36. 景别越大默认时长越长", () => {
        // extreme_wide(6) > wide(5) > medium(4) > close_up(3) > extreme_close_up(2)
        expect(DEFAULT_DURATION_BY_SIZE.extreme_wide).toBeGreaterThan(DEFAULT_DURATION_BY_SIZE.wide);
        expect(DEFAULT_DURATION_BY_SIZE.wide).toBeGreaterThan(DEFAULT_DURATION_BY_SIZE.medium);
        expect(DEFAULT_DURATION_BY_SIZE.medium).toBeGreaterThan(DEFAULT_DURATION_BY_SIZE.close_up);
        expect(DEFAULT_DURATION_BY_SIZE.close_up).toBeGreaterThan(DEFAULT_DURATION_BY_SIZE.extreme_close_up);
      });
    });
  });
});
