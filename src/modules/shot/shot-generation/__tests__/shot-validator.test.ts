import { describe, it, expect } from "vitest";
import {
  validateShotParams,
  validateStoryBeatOutput,
  validateStoryPlanOutput,
  generateFallbackParams,
  formatValidationResult,
} from "@/modules/shot/shot-generation/shot-validator";
import type { ValidationResult } from "@/modules/shot/shot-generation/shot-validator";
import type { ShotParamsType } from "@/modules/shot/shot-generation/shot-params";

describe("shot-validator", () => {
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
      expect(result.data.shotType).toBe("close");
      expect(result.data.cameraMovement).toBe("push");
      expect(result.data.cameraAngle).toBe("eye_level");
      expect(result.autoFixed.length).toBeGreaterThan(0);
    });

    it("无效 shotType 应回退为 medium", () => {
      const result: ValidationResult<ShotParamsType> = validateShotParams({
        prompt: "一个场景描述，足够长的提示词来通过验证",
        shotType: "invalid_type",
        duration: 5,
      });
      expect(result.data.shotType).toBe("medium");
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
      expect(result.data.shotType).toBe("medium");
    });
  });

  describe("generateFallbackParams", () => {
    it("action 类型应生成快节奏参数", () => {
      const result = generateFallbackParams({}, { genre: "action" });
      expect(result.shotType).toBe("close");
      expect(result.duration).toBeLessThanOrEqual(4);
    });

    it("drama 类型应生成中等节奏参数", () => {
      const result = generateFallbackParams({}, { genre: "drama" });
      expect(result.shotType).toBe("medium");
      expect(result.duration).toBe(5);
    });

    it("有 content 时应作为 prompt", () => {
      const result = generateFallbackParams({ content: "一段足够长的场景描述内容来作为提示词" });
      expect(result.prompt).toContain("场景描述");
    });

    it("未知类型应使用 drama 默认值", () => {
      const result = generateFallbackParams({}, { genre: "unknown_genre" });
      expect(result.shotType).toBe("medium");
    });
  });

  describe("validateStoryBeatOutput", () => {
    it("应自动补全缺失的 title", () => {
      const result = validateStoryBeatOutput({
        content: "一段足够长的分镜内容描述",
        duration: 5,
      });
      expect(result.data.title).toBeTruthy();
      expect(result.autoFixed.some(f => f.includes("title"))).toBe(true);
    });

    it("应从 description 复制到 content", () => {
      const result = validateStoryBeatOutput({
        title: "测试",
        description: "从描述复制的内容",
        duration: 5,
      });
      expect(result.data.content).toBe("从描述复制的内容");
    });

    it("应推断 shotType", () => {
      const result = validateStoryBeatOutput({
        content: "全景展示城市的壮丽景色",
        duration: 5,
      });
      expect(result.data.shotType).toBe("wide");
    });

    it("应推断 type", () => {
      const result = validateStoryBeatOutput({
        content: `角色说：\u201C你好\u201D`,
        duration: 5,
      });
      expect(result.data.type).toBe("dialogue");
    });
  });

  describe("validateStoryPlanOutput", () => {
    it("应验证整个分镜计划", () => {
      const plan = [
        { content: "第一个分镜内容描述", duration: 5 },
        { content: "第二个分镜内容描述", duration: 4 },
      ];
      const result = validateStoryPlanOutput(plan);
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
});
