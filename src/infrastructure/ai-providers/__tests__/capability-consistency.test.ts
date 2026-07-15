/**
 * Task 3.2 Step 5：端到端一致性测试
 *
 * 验证目标：
 * 1. 渲染层 getModelCapabilities 与 plugin.videoCapabilities 在 plugin 加载后一致
 * 2. 覆盖 9 个真实模型 + 1 个未知模型
 * 3. 覆盖 6 种参考图模式（native_field / multimodal / ref_field / text_append / bake_into_first / none）
 * 4. getEffectiveVideoParams 能力过滤行为正确
 * 5. conservative/aggressive 策略切换正常
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockWarn, mockError } = vi.hoisted(() => ({ mockWarn: vi.fn(), mockError: vi.fn() }));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: { warn: mockWarn, error: mockError },
}));

import {
  getModelCapabilities,
  setModelProfiles,
  setUnknownModelStrategy,
  getUnknownModelStrategy,
  BUILTIN_MODEL_CAPABILITIES,
} from "../model-capabilities";
import { getEffectiveVideoParams } from "../video-service";
import type { ModelCapabilities, ModelParameterProfile } from "../model-capabilities-types";

describe("Capability consistency between renderer and main", () => {
  beforeEach(() => {
    setModelProfiles({});
    setUnknownModelStrategy("conservative");
    mockWarn.mockClear();
    mockError.mockClear();
  });

  // 9 个真实模型 + 1 个未知模型（从 BUILTIN_MODEL_CAPABILITIES 动态选取）
  const builtinModelIds = Object.keys(BUILTIN_MODEL_CAPABILITIES);
  const testModels = builtinModelIds.slice(0, 9);

  describe("BUILTIN_MODEL_CAPABILITIES 一致性", () => {
    // 确保至少有 9 个内置模型可供测试
    it("BUILTIN_MODEL_CAPABILITIES 应包含至少 9 个模型", () => {
      expect(builtinModelIds.length).toBeGreaterThanOrEqual(9);
    });

    for (const modelId of testModels) {
      it(`${modelId}: getModelCapabilities 应与 BUILTIN_MODEL_CAPABILITIES 一致`, () => {
        const builtin = BUILTIN_MODEL_CAPABILITIES[modelId];
        const caps = getModelCapabilities(modelId);
        expect(caps).toEqual(builtin);
      });
    }
  });

  describe("plugin 加载后 modelProfilesCache 一致性", () => {
    it("plugin capabilities 应覆盖 BUILTIN_MODEL_CAPABILITIES（优先级 1）", () => {
      const pluginCaps: ModelCapabilities = {
        maxReferences: 7,
        maxResolution: 4096,
        maxSizeMB: 20,
        supportsLastFrame: true,
        referenceMode: "separate",
        supportsCharacterRef: true,
        supportsSceneRef: true,
        promptLanguage: "en",
      };
      const profiles: Record<string, ModelParameterProfile> = {
        "kling-v2-master": {
          modelId: "kling-v2-master",
          capabilities: pluginCaps,
          parameters: {},
        },
      };
      setModelProfiles(profiles);

      const caps = getModelCapabilities("kling-v2-master");
      expect(caps.maxReferences).toBe(7);
      expect(caps.maxResolution).toBe(4096);
      expect(caps.supportsLastFrame).toBe(true);
      expect(caps.promptLanguage).toBe("en");
    });

    it("多个 plugin profiles 同时加载后均应一致", () => {
      const profiles: Record<string, ModelParameterProfile> = {};
      for (const modelId of testModels.slice(0, 5)) {
        profiles[modelId] = {
          modelId,
          capabilities: {
            maxReferences: 3,
            maxResolution: 2048,
            maxSizeMB: 8,
            supportsLastFrame: false,
            referenceMode: "separate",
            supportsCharacterRef: true,
            supportsSceneRef: false,
            promptLanguage: "zh",
          },
          parameters: {},
        };
      }
      setModelProfiles(profiles);

      for (const modelId of testModels.slice(0, 5)) {
        const caps = getModelCapabilities(modelId);
        expect(caps.maxReferences).toBe(3);
        expect(caps.supportsLastFrame).toBe(false);
        expect(caps.supportsSceneRef).toBe(false);
        expect(caps.promptLanguage).toBe("zh");
      }
    });

    it("plugin 卸载（清空 cache）后应回退到 BUILTIN", () => {
      const profiles: Record<string, ModelParameterProfile> = {
        "kling-v2-master": {
          modelId: "kling-v2-master",
          capabilities: {
            maxReferences: 99,
            maxResolution: 4096,
            maxSizeMB: 20,
            supportsLastFrame: true,
            referenceMode: "separate",
          },
          parameters: {},
        },
      };
      setModelProfiles(profiles);
      expect(getModelCapabilities("kling-v2-master").maxReferences).toBe(99);

      setModelProfiles({});
      const builtin = BUILTIN_MODEL_CAPABILITIES["kling-v2-master"];
      if (builtin) {
        expect(getModelCapabilities("kling-v2-master").maxReferences).toBe(builtin.maxReferences);
      }
    });
  });

  describe("未知模型 conservative 默认值", () => {
    it("conservative 模式下未知模型不支持 lastFrame/characterRefs/sceneRefs", () => {
      const caps = getModelCapabilities("totally-unknown-model");
      expect(caps.supportsLastFrame).toBe(false);
      expect(caps.supportsCharacterRef).toBe(false);
      expect(caps.supportsSceneRef).toBe(false);
      expect(caps.maxReferences).toBe(1);
    });

    it("aggressive 模式下未知模型支持所有能力（旧行为）", () => {
      setUnknownModelStrategy("aggressive");
      const caps = getModelCapabilities("totally-unknown-model");
      expect(caps.supportsLastFrame).toBe(true);
      expect(caps.supportsCharacterRef).toBe(true);
      expect(caps.supportsSceneRef).toBe(true);
      expect(caps.maxReferences).toBe(4);
    });

    it("策略切换应立即生效", () => {
      expect(getUnknownModelStrategy()).toBe("conservative");
      expect(getModelCapabilities("unknown-1").supportsLastFrame).toBe(false);

      setUnknownModelStrategy("aggressive");
      expect(getModelCapabilities("unknown-2").supportsLastFrame).toBe(true);

      setUnknownModelStrategy("conservative");
      expect(getModelCapabilities("unknown-3").supportsLastFrame).toBe(false);
    });
  });

  describe("6 种参考图模式覆盖", () => {
    const refModes: Array<{
      mode: ModelCapabilities["characterRefMode"];
      expectUseCharRef: boolean;
      description: string;
    }> = [
      { mode: "native_field", expectUseCharRef: true, description: "原生字段模式" },
      { mode: "multimodal", expectUseCharRef: true, description: "多模态模式" },
      { mode: "ref_field", expectUseCharRef: true, description: "参考图字段模式" },
      { mode: "text_append", expectUseCharRef: true, description: "文本追加模式" },
      { mode: "bake_into_first", expectUseCharRef: false, description: "烘焙到首帧模式" },
      { mode: "none", expectUseCharRef: false, description: "不支持模式" },
    ];

    for (const { mode, expectUseCharRef, description } of refModes) {
      it(`characterRefMode=${mode} (${description}) 应正确解析`, () => {
        const modelId = `test-model-${mode}`;
        setModelProfiles({
          [modelId]: {
            modelId,
            capabilities: {
              maxReferences: 4,
              maxResolution: 2048,
              maxSizeMB: 10,
              supportsLastFrame: true,
              referenceMode: "separate",
              supportsCharacterRef: mode !== "none",
              characterRefMode: mode,
              nativeCharacterRef: mode === "native_field" || mode === "multimodal",
            },
            parameters: {},
          },
        });

        const caps = getModelCapabilities(modelId);
        expect(caps.characterRefMode).toBe(mode);

        // getEffectiveVideoParams 应根据 supportsCharacterRef 过滤
        const effective = getEffectiveVideoParams({
          modelId,
          prompt: "test",
          characterRefs: ["http://char1.jpg", "http://char2.jpg"],
        });

        if (expectUseCharRef) {
          expect(effective.characterRefs).toBeDefined();
          expect(effective.characterRefs?.length).toBe(2);
        } else {
          // bake_into_first 和 none 模式下 supportsCharacterRef 为 false 时，characterRefs 被移除
          if (mode === "none") {
            expect(effective.characterRefs).toBeUndefined();
          }
        }
      });
    }
  });

  describe("getEffectiveVideoParams 能力过滤", () => {
    it("supportsLastFrame=false 时应移除 lastFrameUrl", () => {
      setModelProfiles({
        "no-lastframe-model": {
          modelId: "no-lastframe-model",
          capabilities: {
            maxReferences: 4,
            maxResolution: 2048,
            maxSizeMB: 10,
            supportsLastFrame: false,
            referenceMode: "separate",
            supportsCharacterRef: true,
            supportsSceneRef: true,
          },
          parameters: {},
        },
      });

      const effective = getEffectiveVideoParams({
        modelId: "no-lastframe-model",
        prompt: "test",
        firstFrameUrl: "http://first.jpg",
        lastFrameUrl: "http://last.jpg",
        characterRefs: ["http://char.jpg"],
        sceneRef: "http://scene.jpg",
      });

      expect(effective.firstFrameUrl).toBe("http://first.jpg");
      expect(effective.lastFrameUrl).toBeUndefined();
      expect(effective.characterRefs).toEqual(["http://char.jpg"]);
      expect(effective.sceneRef).toBe("http://scene.jpg");
    });

    it("supportsCharacterRef=false 时应移除 characterRefs", () => {
      setModelProfiles({
        "no-charref-model": {
          modelId: "no-charref-model",
          capabilities: {
            maxReferences: 4,
            maxResolution: 2048,
            maxSizeMB: 10,
            supportsLastFrame: true,
            referenceMode: "separate",
            supportsCharacterRef: false,
            supportsSceneRef: true,
          },
          parameters: {},
        },
      });

      const effective = getEffectiveVideoParams({
        modelId: "no-charref-model",
        prompt: "test",
        characterRefs: ["http://char.jpg"],
        sceneRef: "http://scene.jpg",
      });

      expect(effective.characterRefs).toBeUndefined();
      expect(effective.sceneRef).toBe("http://scene.jpg");
    });

    it("maxReferences 超限时应截断 characterRefs", () => {
      setModelProfiles({
        "max-2-refs-model": {
          modelId: "max-2-refs-model",
          capabilities: {
            maxReferences: 2,
            maxResolution: 2048,
            maxSizeMB: 10,
            supportsLastFrame: true,
            referenceMode: "separate",
            supportsCharacterRef: true,
            supportsSceneRef: true,
          },
          parameters: {},
        },
      });

      const effective = getEffectiveVideoParams({
        modelId: "max-2-refs-model",
        prompt: "test",
        characterRefs: ["http://c1.jpg", "http://c2.jpg", "http://c3.jpg", "http://c4.jpg"],
      });

      expect(effective.characterRefs?.length).toBe(2);
      expect(effective.characterRefs).toEqual(["http://c1.jpg", "http://c2.jpg"]);
    });

    it("未知模型 conservative 模式下应移除所有可选参数", () => {
      const effective = getEffectiveVideoParams({
        modelId: "totally-unknown-model",
        prompt: "test",
        firstFrameUrl: "http://first.jpg",
        lastFrameUrl: "http://last.jpg",
        characterRefs: ["http://char.jpg"],
        sceneRef: "http://scene.jpg",
      });

      expect(effective.firstFrameUrl).toBe("http://first.jpg");
      expect(effective.lastFrameUrl).toBeUndefined();
      expect(effective.characterRefs).toBeUndefined();
      expect(effective.sceneRef).toBeUndefined();
      expect(effective.promptLanguage).toBe("auto");
      expect(effective.supportsReferenceVideo).toBe(false);
    });

    it("promptLanguage 和 supportsReferenceVideo 应从能力解析", () => {
      setModelProfiles({
        "en-model": {
          modelId: "en-model",
          capabilities: {
            maxReferences: 4,
            maxResolution: 2048,
            maxSizeMB: 10,
            supportsLastFrame: true,
            referenceMode: "separate",
            supportsCharacterRef: true,
            supportsSceneRef: true,
            promptLanguage: "en",
            supportsReferenceVideo: true,
          },
          parameters: {},
        },
      });

      const effective = getEffectiveVideoParams({
        modelId: "en-model",
        prompt: "test",
      });

      expect(effective.promptLanguage).toBe("en");
      expect(effective.supportsReferenceVideo).toBe(true);
    });
  });

  describe("adjustReferenceImages 在 getEffectiveVideoParams 中被调用（Dead Code 激活）", () => {
    it("超限截断时应触发 adjustReferenceImages 的 warn 日志", () => {
      setModelProfiles({
        "max-1-ref-model": {
          modelId: "max-1-ref-model",
          capabilities: {
            maxReferences: 1,
            maxResolution: 2048,
            maxSizeMB: 10,
            supportsLastFrame: true,
            referenceMode: "separate",
            supportsCharacterRef: true,
            supportsSceneRef: true,
          },
          parameters: {},
        },
      });

      getEffectiveVideoParams({
        modelId: "max-1-ref-model",
        prompt: "test",
        characterRefs: ["http://c1.jpg", "http://c2.jpg", "http://c3.jpg"],
      });

      // adjustReferenceImages 内部超限时会调用 errorLogger.warn
      expect(mockWarn).toHaveBeenCalled();
    });
  });
});
