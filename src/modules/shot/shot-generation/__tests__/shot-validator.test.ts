import { describe, it, expect, beforeEach } from "vitest";
import {
  validateShotParams,
  validateStoryBeatOutput,
  validateStoryPlanOutput,
  generateFallbackParams,
  formatValidationResult,
} from "@/modules/shot";
import type { ValidationResult } from "@/modules/shot";
import type { ShotParamsType } from "@/modules/shot";
import { clearValidationCache } from "../../shot-generation/shot-validator";

type BeatOutput = Record<string, unknown>;
type BeatOutputList = BeatOutput[];

describe("shot-validator", () => {
  beforeEach(() => {
    clearValidationCache();
  });

  describe("validateShotParams", () => {
    it("应接受有效的镜头参数", () => {
      const result = validateShotParams({
        prompt: "一个英雄站在山顶，俯瞰远方的城市",
        shotType: "wide",
        cameraAngle: "eye_level",
        cameraMovement: "push",
        duration: 5,
      });
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it("应自动修复中文景别别名", () => {
      const result: ValidationResult<ShotParamsType> = validateShotParams({
        prompt: "英雄的面部特写，眼中闪烁着坚定的光芒",
        shotType: "特写",
        cameraMovement: "推",
        cameraAngle: "平视",
        duration: 3,
      });
      // PR 2d Step 4g：fixShotParams 仅输出 shotInstruction（不再 dual-write 顶层 shotType）
      expect(result.data.shotInstruction?.shotSize).toBe("close");
      expect(result.data.shotInstruction?.cameraMovement).toBe("push");
      expect(result.data.shotInstruction?.cameraAngle).toBe("eye_level");
      expect(result.autoFixed.length).toBeGreaterThan(0);
    });

    it("无效 shotType 应回退为 medium", () => {
      const result: ValidationResult<ShotParamsType> = validateShotParams({
        prompt: "一个场景描述，足够长的提示词来通过验证",
        shotType: "invalid_type",
        duration: 5,
      });
      // PR 2d Step 4g：shotType 通过 shotInstruction.shotSize 输出
      expect(result.data.shotInstruction?.shotSize).toBe("medium");
    });

    it("duration 小于 2 应修正为 2", () => {
      const result: ValidationResult<ShotParamsType> = validateShotParams({
        prompt: "一个场景描述，足够长的提示词来通过验证",
        duration: 0,
      });
      expect(result.data.duration).toBe(2);
    });

    it("duration 大于 30 应修正为 30", () => {
      const result: ValidationResult<ShotParamsType> = validateShotParams({
        prompt: "一个场景描述，足够长的提示词来通过验证",
        duration: 60,
      });
      expect(result.data.duration).toBe(30);
    });

    it("缺少 shotType 应默认为 medium", () => {
      const result: ValidationResult<ShotParamsType> = validateShotParams({
        prompt: "一个场景描述，足够长的提示词来通过验证",
      });
      // PR 2d Step 4g：默认值通过 shotInstruction.shotSize 输出
      expect(result.data.shotInstruction?.shotSize).toBe("medium");
    });
  });

  describe("generateFallbackParams", () => {
    it("action 类型应生成快节奏参数", () => {
      const result = generateFallbackParams({}, { genre: "action" });
      // PR 2d Step 4g：仅输出 shotInstruction
      expect(result.shotInstruction?.shotSize).toBe("close");
      expect(result.duration).toBeLessThanOrEqual(4);
    });

    it("drama 类型应生成中等节奏参数", () => {
      const result = generateFallbackParams({}, { genre: "drama" });
      expect(result.shotInstruction?.shotSize).toBe("medium");
      expect(result.duration).toBe(5);
    });

    it("有 content 时应作为 prompt", () => {
      const result = generateFallbackParams({ content: "一段足够长的场景描述内容来作为提示词" });
      expect(result.prompt).toContain("场景描述");
    });

    it("未知类型应使用 drama 默认值", () => {
      const result = generateFallbackParams({}, { genre: "unknown_genre" });
      expect(result.shotInstruction?.shotSize).toBe("medium");
    });
  });

  describe("validateStoryBeatOutput", () => {
    it("应自动补全缺失的 title", () => {
      const result = validateStoryBeatOutput({
        content: "一段足够长的分镜内容描述",
        duration: 5,
      }) as unknown as ValidationResult<BeatOutput>;
      expect(result.data.title).toBeTruthy();
      expect(result.autoFixed.some(f => f.includes("title"))).toBe(true);
    });

    it("应从 description 复制到 content", () => {
      const result = validateStoryBeatOutput({
        title: "测试",
        description: "从描述复制的内容",
        duration: 5,
      }) as unknown as ValidationResult<BeatOutput>;
      expect(result.data.content).toBe("从描述复制的内容");
    });

    it("应推断 shotType", () => {
      const result = validateStoryBeatOutput({
        content: "全景展示城市的壮丽景色",
        duration: 5,
      }) as unknown as ValidationResult<BeatOutput>;
      // PR 2d Step 4g：shotSize 通过 shotInstruction.shotSize 输出
      expect(result.data.shotInstruction?.shotSize).toBe("wide");
    });

    it("应推断 type", () => {
      const result = validateStoryBeatOutput({
        content: `角色说：\u201C你好\u201D`,
        duration: 5,
      }) as unknown as ValidationResult<BeatOutput>;
      expect(result.data.type).toBe("dialogue");
    });
  });

  describe("validateStoryPlanOutput", () => {
    it("应验证整个分镜计划", () => {
      const plan = [
        { content: "第一个分镜内容描述", duration: 5 },
        { content: "第二个分镜内容描述", duration: 4 },
      ];
      const result = validateStoryPlanOutput(plan) as unknown as ValidationResult<BeatOutputList>;
      expect(result.data.length).toBe(2);
    });
  });

  describe("formatValidationResult", () => {
    it("无问题时显示通过", () => {
      const result = formatValidationResult({
        valid: true,
        data: {},
        errors: [],
        warnings: [],
        autoFixed: [],
      });
      expect(result).toContain("校验通过");
    });

    it("有自动修复时显示修复信息", () => {
      const result = formatValidationResult({
        valid: true,
        data: {},
        errors: [],
        warnings: [],
        autoFixed: ["shotType: 缺失 → medium"],
      });
      expect(result).toContain("自动修复");
      expect(result).toContain("shotType");
    });
  });

  describe("validation cache", () => {
    it("cache hit 应返回相同结果而不重新验证", () => {
      const params = {
        prompt: "缓存测试：一个英雄站在山顶俯瞰城市",
        shotType: "wide",
        cameraAngle: "eye_level",
        cameraMovement: "push",
        duration: 5,
      };

      const result1 = validateShotParams(params);
      const result2 = validateShotParams(params);

      expect(result1).toBe(result2);
    });

    it("cache miss 应触发验证", () => {
      const params1 = {
        prompt: "缓存测试1：一个英雄站在山顶俯瞰城市",
        shotType: "wide",
        duration: 5,
      };
      const params2 = {
        prompt: "缓存测试2：一个英雄站在山顶俯瞰城市",
        shotType: "close",
        duration: 3,
      };

      const result1 = validateShotParams(params1);
      const result2 = validateShotParams(params2);

      expect(result1).not.toBe(result2);
      // PR 2d Step 4g：shotType 通过 shotInstruction.shotSize 输出
      expect(result1.data.shotInstruction?.shotSize).toBe("wide");
      expect(result2.data.shotInstruction?.shotSize).toBe("close");
    });

    it("useCache: false 应绕过缓存", () => {
      const params = {
        prompt: "绕过缓存测试：一个英雄站在山顶俯瞰城市",
        shotType: "wide",
        cameraAngle: "eye_level",
        cameraMovement: "push",
        duration: 5,
      };

      const result1 = validateShotParams(params, { useCache: false });
      const result2 = validateShotParams(params, { useCache: false });

      expect(result1).not.toBe(result2);
      expect(result1.data).toEqual(result2.data);
    });

    it("clearValidationCache 应清除所有缓存结果", () => {
      const params = {
        prompt: "清除缓存测试：一个英雄站在山顶俯瞰城市",
        shotType: "wide",
        cameraAngle: "eye_level",
        cameraMovement: "push",
        duration: 5,
      };

      const result1 = validateShotParams(params);
      clearValidationCache();
      const result2 = validateShotParams(params);

      expect(result1).not.toBe(result2);
      expect(result1.data).toEqual(result2.data);
    });

    it("cache 满时应淘汰最旧条目 (50 entries)", () => {
      const firstParams = {
        prompt: "第一个缓存条目：一个英雄站在山顶俯瞰城市",
        shotType: "wide",
        duration: 5,
      };

      validateShotParams(firstParams);

      for (let i = 0; i < 50; i++) {
        validateShotParams({
          prompt: `填充缓存条目${i}：一个英雄站在山顶俯瞰城市`,
          shotType: "medium",
          duration: 5,
        });
      }

      const resultAfterEviction = validateShotParams(firstParams);
      expect(resultAfterEviction).toBeDefined();
      // PR 2d Step 4g：shotType 通过 shotInstruction.shotSize 输出
      expect(resultAfterEviction.data.shotInstruction?.shotSize).toBe("wide");
    });
  });
});
