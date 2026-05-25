import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  getProviderSupportedCodecs,
  getProviderMaxDuration,
} from "@/infrastructure/ai-providers/model-adapter";
import {
  getModelCapabilities,
  adjustReferenceImages,
  resolveImageSize,
  ReferencePriority,
} from "@/infrastructure/ai-providers/model-capabilities";
import type { ReferenceImageItem } from "@/infrastructure/ai-providers/model-capabilities";

const PROJECT_ROOT = process.cwd();

describe("E2E: 统一 Electron 插件架构验证", () => {
  describe("1. model-adapter 精简验证", () => {
    it('getProviderSupportedCodecs("volcengine") 返回 ["h264", "h265"]', () => {
      expect(getProviderSupportedCodecs("volcengine")).toEqual(["h264", "h265"]);
    });

    it('getProviderSupportedCodecs("google") 返回 ["h264", "h265", "vp9"]', () => {
      expect(getProviderSupportedCodecs("google")).toEqual(["h264", "h265", "vp9"]);
    });

    it('getProviderSupportedCodecs("unknown") 回退到 ["h264", "h265"]', () => {
      expect(getProviderSupportedCodecs("unknown")).toEqual(["h264", "h265"]);
    });

    it('getProviderMaxDuration("openai-sora") 返回 20', () => {
      expect(getProviderMaxDuration("openai-sora")).toBe(20);
    });

    it('getProviderMaxDuration("unknown") 返回 undefined', () => {
      expect(getProviderMaxDuration("unknown")).toBeUndefined();
    });
  });

  describe("2. model-capabilities 精简验证", () => {
    it('getModelCapabilities("seedance-2.0") 仍然正常工作', () => {
      const caps = getModelCapabilities("seedance-2.0");
      expect(caps.maxReferences).toBe(4);
      expect(caps.maxResolution).toBe(2048);
      expect(caps.supportsLastFrame).toBe(true);
      expect(caps.referenceMode).toBe("separate");
      expect(caps.defaultImageSize).toBe("1920x1920");
      expect(caps.supportedImageSizes).toBeDefined();
      expect(caps.supportedImageSizes!.length).toBeGreaterThan(0);
    });

    it("adjustReferenceImages 仍然正常工作", () => {
      const refs: ReferenceImageItem[] = [
        { url: "a.jpg", priority: ReferencePriority.CHARACTER_REF, type: "character" },
        { url: "b.jpg", priority: ReferencePriority.SCENE_REF, type: "scene" },
        { url: "c.jpg", priority: ReferencePriority.LAST_FRAME, type: "lastFrame" },
      ];
      const result = adjustReferenceImages(refs, "seedance-2.0", "video");
      expect(result.length).toBeLessThanOrEqual(4);
      expect(result.every((r) => typeof r.url === "string")).toBe(true);
    });

    it("resolveImageSize 仍然正常工作", () => {
      const size = resolveImageSize("seedance-2.0", "keyframe");
      expect(typeof size).toBe("string");
      expect(size).toContain("x");
    });
  });

  describe("3. 废弃模块已移除验证", () => {
    it("provider-strategy.service 文件不应存在", () => {
      const filePath = path.resolve(PROJECT_ROOT, "src/infrastructure/server/provider-strategy.service.ts");
      expect(fs.existsSync(filePath)).toBe(false);
    });

    it("model-format-detector 文件不应存在", () => {
      const filePath = path.resolve(PROJECT_ROOT, "src/infrastructure/server/model-format-detector.ts");
      expect(fs.existsSync(filePath)).toBe(false);
    });

    it("@/infrastructure/server 不应导出 selectProviderStrategy 或 detectVideoModelFormat", async () => {
      const serverModule = await import("@/infrastructure/server");
      const exportedKeys = Object.keys(serverModule);
      expect(exportedKeys).not.toContain("selectProviderStrategy");
      expect(exportedKeys).not.toContain("detectVideoModelFormat");
    });

    it("@/infrastructure/ai-providers 不应导出 selectProviderStrategy 或 ServerVideoProviderStrategy", async () => {
      const aiProvidersModule = await import("@/infrastructure/ai-providers");
      const exportedKeys = Object.keys(aiProvidersModule);
      expect(exportedKeys).not.toContain("selectProviderStrategy");
      expect(exportedKeys).not.toContain("ServerVideoProviderStrategy");
    });
  });

  describe("4. 已删除 API 路由验证", () => {
    const deletedRoutes = [
      "src/app/api/generate-video/route.ts",
      "src/app/api/video-status/route.ts",
      "src/app/api/generate-image/route.ts",
      "src/app/api/analyze-image/route.ts",
      "src/app/api/generate-text/route.ts",
      "src/app/api/generate-keyframe/route.ts",
      "src/app/api/generate-frame-pair/route.ts",
    ];

    it.each(deletedRoutes)("%s 不应存在", (relativePath) => {
      const fullPath = path.resolve(PROJECT_ROOT, relativePath);
      expect(fs.existsSync(fullPath)).toBe(false);
    });
  });

  describe("5. 保留的 API 路由仍然存在", () => {
    it("src/app/api/config/route.ts 应存在", () => {
      const fullPath = path.resolve(PROJECT_ROOT, "src/app/api/config/route.ts");
      expect(fs.existsSync(fullPath)).toBe(true);
    });

    it("src/app/api/validate/route.ts 应存在", () => {
      const fullPath = path.resolve(PROJECT_ROOT, "src/app/api/validate/route.ts");
      expect(fs.existsSync(fullPath)).toBe(true);
    });
  });
});
