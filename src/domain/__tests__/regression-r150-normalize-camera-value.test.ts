/**
 * R150: normalizeCameraValue 别名表正确性
 * 回归防护: 确保 normalizeCameraValue 正确使用别名表进行值归一化，
 *           不同别名表之间不应相互影响。
 *
 * 问题场景：normalizeCameraValue 接收别名表参数，将用户输入的别名
 *           （如 "full"）映射到标准值（如 "wide"）。若别名表传递错误
 *           或函数实现有 bug，可能导致别名无法识别或跨表污染。
 *
 * 注意：normalizeCameraValue 和 SHOT_SIZE_ALIASES 是 shot-prompt.ts 的
 *       私有函数/常量，通过公共 API resolveShotInstruction 间接测试。
 */
import { describe, it, expect } from "vitest";
import {
  resolveShotInstruction,
  SHOT_SIZE_OPTIONS,
} from "@/domain/utils/shot-prompt";

describe("R150: normalizeCameraValue 别名表正确性", () => {
  describe("SHOT_SIZE_ALIASES 别名映射", () => {
    it('"full" 别名应归一化为 "wide"', () => {
      // SHOT_SIZE_ALIASES["full"] = "wide"
      const result = resolveShotInstruction({ shotType: "full" });
      expect(result).not.toBeNull();
      expect(result!.shotSize).toBe("wide");
    });

    it('"close-up" 别名应归一化为 "close"', () => {
      const result = resolveShotInstruction({ shotType: "close-up" });
      expect(result).not.toBeNull();
      expect(result!.shotSize).toBe("close");
    });

    it('"medium-shot" 别名应归一化为 "medium"', () => {
      const result = resolveShotInstruction({ shotType: "medium-shot" });
      expect(result).not.toBeNull();
      expect(result!.shotSize).toBe("medium");
    });

    it('"extreme-close-up" 别名应归一化为 "extreme_close"', () => {
      const result = resolveShotInstruction({ shotType: "extreme-close-up" });
      expect(result).not.toBeNull();
      expect(result!.shotSize).toBe("extreme_close");
    });

    it('"establishing" 别名应归一化为 "extreme_wide"', () => {
      const result = resolveShotInstruction({ shotType: "establishing" });
      expect(result).not.toBeNull();
      expect(result!.shotSize).toBe("extreme_wide");
    });
  });

  describe("无别名时保持原值", () => {
    it("未知 shotType 值应保持原值", () => {
      const result = resolveShotInstruction({ shotType: "unknown" });
      expect(result).not.toBeNull();
      expect(result!.shotSize).toBe("unknown");
    });

    it("自定义 shotType 值应保持原值", () => {
      const result = resolveShotInstruction({ shotType: "custom-shot" });
      expect(result).not.toBeNull();
      expect(result!.shotSize).toBe("custom-shot");
    });
  });

  describe("标准值应直接通过", () => {
    it('"close" 标准值应保持 "close"', () => {
      const result = resolveShotInstruction({ shotType: "close" });
      expect(result).not.toBeNull();
      expect(result!.shotSize).toBe("close");
    });

    it('"wide" 标准值应保持 "wide"', () => {
      const result = resolveShotInstruction({ shotType: "wide" });
      expect(result).not.toBeNull();
      expect(result!.shotSize).toBe("wide");
    });

    it('"medium" 标准值应保持 "medium"', () => {
      const result = resolveShotInstruction({ shotType: "medium" });
      expect(result).not.toBeNull();
      expect(result!.shotSize).toBe("medium");
    });
  });

  describe("不同别名表不应相互影响", () => {
    it("camera movement 不应使用 shot size 别名表", () => {
      // camera 对象路径使用 CAMERA_MOVEMENT_OPTIONS（无别名表传入）
      // "full" 不是 camera movement 的有效值，应保持原值
      const result = resolveShotInstruction({
        camera: { movement: "full", angle: "eye_level" },
        shotType: "medium",
      });
      expect(result).not.toBeNull();
      // movement "full" 不在 CAMERA_MOVEMENT_OPTIONS 中，保持原值
      expect(result!.cameraMovement).toBe("full");
      // shotType "medium" 是标准值，应保持
      expect(result!.shotSize).toBe("medium");
    });

    it("camera angle 不应使用 shot size 别名表", () => {
      // "full" 不是 camera angle 的有效值，应保持原值
      const result = resolveShotInstruction({
        camera: { movement: "static", angle: "full" },
        shotType: "medium",
      });
      expect(result).not.toBeNull();
      expect(result!.cameraAngle).toBe("full");
    });

    it("shotType 应使用 SHOT_SIZE_ALIASES，camera movement 不应", () => {
      // 同一个值 "full" 在不同上下文应有不同行为
      const result = resolveShotInstruction({
        camera: { movement: "full", angle: "eye_level" },
        shotType: "full",
      });
      expect(result).not.toBeNull();
      // shotType "full" 通过 SHOT_SIZE_ALIASES 映射为 "wide"
      expect(result!.shotSize).toBe("wide");
      // camera movement "full" 无别名表，保持原值
      expect(result!.cameraMovement).toBe("full");
    });
  });

  describe("SHOT_SIZE_OPTIONS 完整性", () => {
    it("应包含所有标准 shot size 值", () => {
      const values = SHOT_SIZE_OPTIONS.map((o) => o.value);
      expect(values).toContain("extreme_close");
      expect(values).toContain("close");
      expect(values).toContain("medium");
      expect(values).toContain("wide");
      expect(values).toContain("extreme_wide");
    });
  });

  describe("边界情况", () => {
    it("空 shotType 应返回 null", () => {
      const result = resolveShotInstruction({ shotType: "" });
      // 空字符串 falsy，normalizeCameraValue 返回 undefined
      // resolveShotInstruction 对 falsy shotType 不进入分支
      expect(result).toBeNull();
    });

    it("null shotType 应返回 null", () => {
      const result = resolveShotInstruction({ shotType: null });
      expect(result).toBeNull();
    });

    it("undefined shotType 应返回 null", () => {
      const result = resolveShotInstruction({ shotType: undefined });
      expect(result).toBeNull();
    });

    it("无 shotInstruction/camera/shotType 应返回 null", () => {
      const result = resolveShotInstruction({});
      expect(result).toBeNull();
    });
  });
});
