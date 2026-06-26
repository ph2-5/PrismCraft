/**
 * shot-routes.ts 路由 handler 测试
 *
 * 参考 regression-r136-bulk-save-failures.test.ts 的模式：
 * - mock shared-logic 模块（reference-engine / consistency-check / reference-check / visual-consistency-check）
 * - mock createApiGatewayAdapter
 * - 验证每个路由的 handler 行为
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── hoisted mocks ──────────────────────────────────────────────────────
const {
  mockValidateReference,
  mockGetReferenceVideoUrl,
  mockBuildReferenceDescription,
  mockPerformConfigCheck,
  mockValidateFeatureAnchoringConfig,
  mockValidateNoFrameBinding,
  mockCheckCharacterReferences,
  mockCheckSceneReferences,
  mockCheckVisualConsistency,
  mockCheckBeatElementConsistency,
  mockCreateApiGatewayAdapter,
} = vi.hoisted(() => ({
  mockValidateReference: vi.fn(),
  mockGetReferenceVideoUrl: vi.fn(),
  mockBuildReferenceDescription: vi.fn(),
  mockPerformConfigCheck: vi.fn(),
  mockValidateFeatureAnchoringConfig: vi.fn(),
  mockValidateNoFrameBinding: vi.fn(),
  mockCheckCharacterReferences: vi.fn(),
  mockCheckSceneReferences: vi.fn(),
  mockCheckVisualConsistency: vi.fn(),
  mockCheckBeatElementConsistency: vi.fn(),
  mockCreateApiGatewayAdapter: vi.fn(),
}));

vi.mock("@shared-logic/shot/reference-engine", () => ({
  validateReference: mockValidateReference,
  getReferenceVideoUrl: mockGetReferenceVideoUrl,
  buildReferenceDescription: mockBuildReferenceDescription,
}));

vi.mock("@shared-logic/shot/consistency-check", () => ({
  performConfigCheck: mockPerformConfigCheck,
  validateFeatureAnchoringConfig: mockValidateFeatureAnchoringConfig,
  validateNoFrameBinding: mockValidateNoFrameBinding,
}));

vi.mock("@shared-logic/shot/reference-check", () => ({
  checkCharacterReferences: mockCheckCharacterReferences,
  checkSceneReferences: mockCheckSceneReferences,
}));

vi.mock("@shared-logic/shot/visual-consistency-check", () => ({
  checkVisualConsistency: mockCheckVisualConsistency,
  checkBeatElementConsistency: mockCheckBeatElementConsistency,
}));

vi.mock("../../../api-gateway", () => ({
  // shot-routes.ts 在模块加载时调用 createApiGatewayAdapter()，
  // 必须在 factory 内部设置默认返回值，否则在 mockReturnValue 调用之前就被执行
  createApiGatewayAdapter: mockCreateApiGatewayAdapter.mockReturnValue({ id: "mock-adapter" }),
}));

import { shotRoutes } from "../shot-routes";

// ── 测试数据 ──────────────────────────────────────────────────────────
const validShot = {
  id: "shot-1",
  sequence: 0,
  duration: 5,
  videoGen: { videoUrl: "http://example.com/v.mp4" },
  generationResult: {
    videoUrl: "http://example.com/v.mp4",
    firstFrameUrl: "http://example.com/first.png",
    lastFrameUrl: "http://example.com/last.png",
  },
};

const validReference = {
  direction: "previous" as const,
  contentType: "full_video" as const,
};

const validAllShots = [validShot];

describe("shot-routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateApiGatewayAdapter.mockReturnValue({ id: "mock-adapter" });
  });

  // ── 路由注册 ───────────────────────────────────────────────────────
  it("应注册 9 个 shot/validate 路由", () => {
    const expectedRoutes = [
      "shot/validate-reference",
      "shot/get-reference-video-url",
      "shot/build-reference-description",
      "validate/consistency",
      "validate/feature-anchoring",
      "validate/no-frame-binding",
      "reference/check-character",
      "reference/check-scene",
      "visual-consistency/check",
      "visual-consistency/check-beat",
    ];
    expectedRoutes.forEach((route) => {
      expect(shotRoutes[route]).toBeDefined();
      expect(shotRoutes[route].methods).toContain("POST");
    });
  });

  // ── shot/validate-reference ────────────────────────────────────────
  describe("shot/validate-reference", () => {
    it("应调用 referenceEngine.validateReference 并返回 success:true", async () => {
      mockValidateReference.mockReturnValue({ valid: true });
      const route = shotRoutes["shot/validate-reference"];
      const result = await route.handler(
        "POST",
        { shot: validShot, allShots: validAllShots, reference: validReference },
        {},
      ) as Record<string, unknown>;

      expect(mockValidateReference).toHaveBeenCalledWith(
        validShot,
        validAllShots,
        validReference,
      );
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ valid: true });
    });

    it("应透传 referenceEngine 返回的对象（即使是 undefined）", async () => {
      mockValidateReference.mockReturnValue(undefined);
      const route = shotRoutes["shot/validate-reference"];
      const result = await route.handler(
        "POST",
        { shot: validShot, allShots: validAllShots, reference: validReference },
        {},
      ) as Record<string, unknown>;
      expect(result.success).toBe(true);
      expect(result.data).toBeUndefined();
    });
  });

  // ── shot/get-reference-video-url ───────────────────────────────────
  describe("shot/get-reference-video-url", () => {
    it("应调用 referenceEngine.getReferenceVideoUrl 并包装为 { videoUrl }", async () => {
      mockGetReferenceVideoUrl.mockReturnValue("http://example.com/ref.mp4");
      const route = shotRoutes["shot/get-reference-video-url"];
      const result = await route.handler(
        "POST",
        { shot: validShot, allShots: validAllShots, reference: validReference },
        {},
      ) as Record<string, unknown>;

      expect(mockGetReferenceVideoUrl).toHaveBeenCalledWith(
        validShot,
        validAllShots,
        validReference,
      );
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ videoUrl: "http://example.com/ref.mp4" });
    });

    it("url 为 undefined 时也应包装为 { videoUrl: undefined }", async () => {
      mockGetReferenceVideoUrl.mockReturnValue(undefined);
      const route = shotRoutes["shot/get-reference-video-url"];
      const result = await route.handler(
        "POST",
        { shot: validShot, allShots: validAllShots, reference: validReference },
        {},
      ) as Record<string, unknown>;
      expect(result.data).toEqual({ videoUrl: undefined });
    });
  });

  // ── shot/build-reference-description ────────────────────────────────
  describe("shot/build-reference-description", () => {
    it("应调用 referenceEngine.buildReferenceDescription 并包装为 { description }", async () => {
      mockBuildReferenceDescription.mockReturnValue("previous shot clip");
      const route = shotRoutes["shot/build-reference-description"];
      const result = await route.handler(
        "POST",
        { shot: validShot, allShots: validAllShots, reference: validReference },
        {},
      ) as Record<string, unknown>;

      expect(mockBuildReferenceDescription).toHaveBeenCalledWith(
        validShot,
        validAllShots,
        validReference,
      );
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ description: "previous shot clip" });
    });
  });

  // ── validate/consistency ────────────────────────────────────────────
  describe("validate/consistency", () => {
    it("应调用 consistencyCheck.performConfigCheck(body) 直接透传", async () => {
      mockPerformConfigCheck.mockReturnValue({ errors: [] });
      const body = {
        featureAnchoring: {
          enabled: true,
          characterAnchors: [
            { elementId: "el-1", referenceImageUrl: "http://x", weight: 0.5 },
          ],
        },
        elements: [{ id: "el-1", name: "Alice" }],
      };
      const route = shotRoutes["validate/consistency"];
      const result = await route.handler("POST", body, {}) as Record<string, unknown>;

      expect(mockPerformConfigCheck).toHaveBeenCalledWith(body);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ errors: [] });
    });
  });

  // ── validate/feature-anchoring ──────────────────────────────────────
  describe("validate/feature-anchoring", () => {
    it("应调用 consistencyCheck.validateFeatureAnchoringConfig(body.config)", async () => {
      mockValidateFeatureAnchoringConfig.mockReturnValue({ valid: true });
      const config = { enabled: true, characterAnchors: [] };
      const route = shotRoutes["validate/feature-anchoring"];
      const result = await route.handler("POST", { config }, {}) as Record<string, unknown>;

      expect(mockValidateFeatureAnchoringConfig).toHaveBeenCalledWith(config);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ valid: true });
    });
  });

  // ── validate/no-frame-binding ───────────────────────────────────────
  describe("validate/no-frame-binding", () => {
    it("应调用 consistencyCheck.validateNoFrameBinding(body) 直接透传", async () => {
      mockValidateNoFrameBinding.mockReturnValue({ ok: true });
      const body = { arbitrary: "shape" };
      const route = shotRoutes["validate/no-frame-binding"];
      const result = await route.handler("POST", body, {}) as Record<string, unknown>;

      expect(mockValidateNoFrameBinding).toHaveBeenCalledWith(body);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ ok: true });
    });
  });

  // ── reference/check-character ──────────────────────────────────────
  describe("reference/check-character", () => {
    it("应调用 referenceCheck.checkCharacterReferences(characterId, stories)", async () => {
      mockCheckCharacterReferences.mockReturnValue({ references: [] });
      const body = {
        characterId: "char-1",
        stories: [{ id: "story-1", title: "S1", characters: ["char-1"] }],
      };
      const route = shotRoutes["reference/check-character"];
      const result = await route.handler("POST", body, {}) as Record<string, unknown>;

      expect(mockCheckCharacterReferences).toHaveBeenCalledWith(body.characterId, body.stories);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ references: [] });
    });
  });

  // ── reference/check-scene ──────────────────────────────────────────
  describe("reference/check-scene", () => {
    it("应调用 referenceCheck.checkSceneReferences(sceneId, stories)", async () => {
      mockCheckSceneReferences.mockReturnValue({ references: ["ref-1"] });
      const body = {
        sceneId: "scene-1",
        stories: [{ id: "story-1", title: "S1", scenes: ["scene-1"] }],
      };
      const route = shotRoutes["reference/check-scene"];
      const result = await route.handler("POST", body, {}) as Record<string, unknown>;

      expect(mockCheckSceneReferences).toHaveBeenCalledWith(body.sceneId, body.stories);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ references: ["ref-1"] });
    });
  });

  // ── visual-consistency/check ────────────────────────────────────────
  describe("visual-consistency/check", () => {
    it("应调用 checkVisualConsistency(adapter, { generatedImageUrl, referenceImageUrl, element })", async () => {
      mockCheckVisualConsistency.mockResolvedValue({ consistent: true });
      const body = {
        generatedImageUrl: "http://example.com/gen.png",
        referenceImageUrl: "http://example.com/ref.png",
        element: { id: "el-1", name: "Alice" },
      };
      const route = shotRoutes["visual-consistency/check"];
      const result = await route.handler("POST", body, {}) as Record<string, unknown>;

      expect(mockCheckVisualConsistency).toHaveBeenCalledWith(
        { id: "mock-adapter" },
        {
          generatedImageUrl: body.generatedImageUrl,
          referenceImageUrl: body.referenceImageUrl,
          element: body.element,
        },
      );
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ consistent: true });
    });

    it("referenceImageUrl 缺失时也应透传 undefined", async () => {
      mockCheckVisualConsistency.mockResolvedValue({ consistent: false });
      const body = {
        element: { id: "el-1", name: "Alice" },
      };
      const route = shotRoutes["visual-consistency/check"];
      const result = await route.handler("POST", body, {}) as Record<string, unknown>;

      expect(mockCheckVisualConsistency).toHaveBeenCalledWith(
        { id: "mock-adapter" },
        expect.objectContaining({ referenceImageUrl: undefined }),
      );
      expect(result.success).toBe(true);
    });
  });

  // ── visual-consistency/check-beat ───────────────────────────────────
  describe("visual-consistency/check-beat", () => {
    it("应调用 checkBeatElementConsistency 并传入 getGeneratedImageUrl 闭包", async () => {
      mockCheckBeatElementConsistency.mockResolvedValue({ issues: [] });
      const body = {
        beat: { id: "beat-1", elementIds: ["el-1", "el-2"] },
        elements: [
          { id: "el-1", name: "Alice" },
          { id: "el-2", name: "Bob" },
        ],
        generatedImageMap: { "el-1": "http://example.com/1.png" },
      };
      const route = shotRoutes["visual-consistency/check-beat"];
      const result = await route.handler("POST", body, {}) as Record<string, unknown>;

      expect(mockCheckBeatElementConsistency).toHaveBeenCalledWith(
        { id: "mock-adapter" },
        expect.objectContaining({
          beat: body.beat,
          elements: body.elements,
        }),
      );

      // 验证 getGeneratedImageUrl 闭包行为
      const callArgs = mockCheckBeatElementConsistency.mock.calls[0][1] as {
        getGeneratedImageUrl: (elementId: string) => string;
      };
      expect(callArgs.getGeneratedImageUrl("el-1")).toBe("http://example.com/1.png");
      expect(callArgs.getGeneratedImageUrl("el-2")).toBeUndefined();

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ issues: [] });
    });

    it("generatedImageMap 缺失时应使用 {} 作为默认值", async () => {
      mockCheckBeatElementConsistency.mockResolvedValue({});
      const body = {
        beat: { id: "beat-1", elementIds: [] },
        elements: [],
      };
      const route = shotRoutes["visual-consistency/check-beat"];
      const result = await route.handler("POST", body, {}) as Record<string, unknown>;

      const callArgs = mockCheckBeatElementConsistency.mock.calls[0][1] as {
        getGeneratedImageUrl: (elementId: string) => string;
      };
      // 任意 id 都应返回 undefined（无 map）
      expect(callArgs.getGeneratedImageUrl("any-id")).toBeUndefined();
      expect(result.success).toBe(true);
    });
  });
});
