/**
 * Task 2A.12 — 角色一致性增强器单元测试
 *
 * 覆盖：
 *   1. extractCharacterReferenceCandidates: 候选列表提取 + 去重 + 优先级
 *   2. selectConsistencyStrategy: 策略选择逻辑
 *   3. selectReferenceImages: 参考图选取 + 截断
 *   4. buildConsistencyEnhancedCharacterRefs: 一站式集成
 *   5. listAllCharacterReferenceOptions: UI 候选列表
 *   6. buildManualCharacterRefs: 手动选择截断
 *   7. describeConsistencyStrategy: 可读描述
 */

import { describe, it, expect } from "vitest";
import {
  DEFAULT_PREPROCESS_HINT,
  extractCharacterReferenceCandidates,
  selectConsistencyStrategy,
  selectReferenceImages,
  buildConsistencyEnhancedCharacterRefs,
  listAllCharacterReferenceOptions,
  buildManualCharacterRefs,
  describeConsistencyStrategy,
  type CharacterAssetInput,
  type ModelConsistencyCapability,
} from "../consistency-enhancer";

describe("Task 2A.12 — consistency-enhancer", () => {
  describe("extractCharacterReferenceCandidates", () => {
    it("1. 按优先级提取所有候选（主图 > 默认变体 > 默认造型 > 其他变体 > 其他造型）", () => {
      const input: CharacterAssetInput = {
        characterId: "char-1",
        primaryImageUrl: "/img/primary.png",
        defaultVariantImageUrl: "/img/default-variant.png",
        defaultOutfitImageUrl: "/img/default-outfit.png",
        variantImageUrls: ["/img/variant-1.png", "/img/variant-2.png"],
        outfitImageUrls: ["/img/outfit-1.png"],
      };

      const candidates = extractCharacterReferenceCandidates(input);

      expect(candidates).toHaveLength(6);
      expect(candidates[0]!).toMatchObject({
        url: "/img/primary.png",
        source: "primary",
        isAuthoritative: true,
      });
      expect(candidates[1]!).toMatchObject({
        url: "/img/default-variant.png",
        source: "default_variant",
        isAuthoritative: true,
      });
      expect(candidates[2]!).toMatchObject({
        url: "/img/default-outfit.png",
        source: "default_outfit",
        isAuthoritative: true,
      });
      expect(candidates[3]!).toMatchObject({
        url: "/img/variant-1.png",
        source: "variant",
        isAuthoritative: false,
      });
      expect(candidates[4]!).toMatchObject({
        url: "/img/variant-2.png",
        source: "variant",
        isAuthoritative: false,
      });
      expect(candidates[5]!).toMatchObject({
        url: "/img/outfit-1.png",
        source: "outfit",
        isAuthoritative: false,
      });
    });

    it("2. 重复 URL 自动去重", () => {
      const input: CharacterAssetInput = {
        characterId: "char-2",
        primaryImageUrl: "/img/same.png",
        defaultVariantImageUrl: "/img/same.png", // 与主图相同
        defaultOutfitImageUrl: "/img/same.png", // 与主图相同
      };

      const candidates = extractCharacterReferenceCandidates(input);

      expect(candidates).toHaveLength(1);
      expect(candidates[0]!.url).toBe("/img/same.png");
      expect(candidates[0]!.source).toBe("primary"); // 第一次出现的来源
    });

    it("3. 空输入返回空数组", () => {
      const candidates = extractCharacterReferenceCandidates({
        characterId: "char-3",
      });
      expect(candidates).toHaveLength(0);
    });

    it("4. 仅主图存在时返回 1 个候选", () => {
      const candidates = extractCharacterReferenceCandidates({
        characterId: "char-4",
        primaryImageUrl: "/img/only.png",
      });
      expect(candidates).toHaveLength(1);
      expect(candidates[0]!.isAuthoritative).toBe(true);
    });

    it("P2-6: URL 前后空白被 trim 后去重", () => {
      const input: CharacterAssetInput = {
        characterId: "char-p2-6a",
        primaryImageUrl: "  /img/same.png  ",
        defaultVariantImageUrl: "/img/same.png",
      };

      const candidates = extractCharacterReferenceCandidates(input);

      expect(candidates).toHaveLength(1);
      expect(candidates[0]!.url).toBe("/img/same.png");
    });

    it("P2-6: URL hash fragment 差异视为相同（去重）", () => {
      const input: CharacterAssetInput = {
        characterId: "char-p2-6b",
        primaryImageUrl: "/img/same.png#v=1",
        defaultVariantImageUrl: "/img/same.png#v=2",
        defaultOutfitImageUrl: "/img/same.png",
      };

      const candidates = extractCharacterReferenceCandidates(input);

      expect(candidates).toHaveLength(1);
      // 第 6 轮审计修复：候选 URL 保留 hash fragment（可能用于 cache busting 或 SVG sprite）
      // 去重时用移除 hash 的 key，但 result.url 保留原始 hash
      expect(candidates[0]!.url).toBe("/img/same.png#v=1");
    });

    it("P2-6: 仅空白字符的 URL 被过滤", () => {
      const input: CharacterAssetInput = {
        characterId: "char-p2-6c",
        primaryImageUrl: "   ",
        defaultVariantImageUrl: "/img/real.png",
      };

      const candidates = extractCharacterReferenceCandidates(input);

      expect(candidates).toHaveLength(1);
      expect(candidates[0]!.url).toBe("/img/real.png");
    });

    it("P2-6: trim 后的 URL 写入候选（不保留原始空白）", () => {
      const input: CharacterAssetInput = {
        characterId: "char-p2-6d",
        primaryImageUrl: "\t/img/primary.png\n",
      };

      const candidates = extractCharacterReferenceCandidates(input);

      expect(candidates).toHaveLength(1);
      expect(candidates[0]!.url).toBe("/img/primary.png");
    });

    it("P2-6: 候选 URL 保留 hash fragment 用于 cache busting", () => {
      const input: CharacterAssetInput = {
        characterId: "char-audit6-hash",
        primaryImageUrl: "/img/primary.png#v=2",
      };

      const candidates = extractCharacterReferenceCandidates(input);

      expect(candidates).toHaveLength(1);
      // 保留 hash fragment，因为可能用于 cache busting（#v=2）或 SVG sprite 引用（#icon-id）
      expect(candidates[0]!.url).toBe("/img/primary.png#v=2");
    });

    it("P2-6: 同时含空白和 hash fragment 时 trim 但保留 hash", () => {
      const input: CharacterAssetInput = {
        characterId: "char-audit6-trim-hash",
        primaryImageUrl: "  /img/primary.png#v=3  ",
      };

      const candidates = extractCharacterReferenceCandidates(input);

      expect(candidates).toHaveLength(1);
      // trim 处理空白，但保留 hash fragment
      expect(candidates[0]!.url).toBe("/img/primary.png#v=3");
    });

    it("P2-6: 空白 + hash fragment URL 与无 hash URL 应去重", () => {
      // 第 8 轮审计补充：验证 normalizeUrlForKey 内部 trim 后的去重正确性
      const input: CharacterAssetInput = {
        characterId: "char-p2-6e",
        primaryImageUrl: "  /img/same.png#v=1  ",
        defaultVariantImageUrl: "/img/same.png",
      };

      const candidates = extractCharacterReferenceCandidates(input);

      expect(candidates).toHaveLength(1);
      // 保留第一个出现的 URL（含 hash fragment 和原始空白经过 trim）
      expect(candidates[0]!.url).toBe("/img/same.png#v=1");
    });

    it("P2-6: 纯空白 + hash URL 被过滤（trim 后仅剩 hash）", () => {
      // 第 8 轮审计补充：验证 trim 后仅剩 hash fragment 的情况被正确过滤
      const input: CharacterAssetInput = {
        characterId: "char-p2-6f",
        primaryImageUrl: "   #v=1",
        defaultVariantImageUrl: "/img/real.png",
      };

      const candidates = extractCharacterReferenceCandidates(input);

      expect(candidates).toHaveLength(1);
      expect(candidates[0]!.url).toBe("/img/real.png");
    });
  });

  describe("selectConsistencyStrategy", () => {
    it("5. 配置明确为 multi_ref_fusion 且候选数≥2 时使用", () => {
      const cap: ModelConsistencyCapability = {
        modelId: "volcengine-pro",
        strategy: "multi_ref_fusion",
        maxCharacterRefs: 4,
      };
      expect(selectConsistencyStrategy(cap, 3)).toBe("multi_ref_fusion");
    });

    it("6. 配置 multi_ref_fusion 但候选数不足时降级为 single_ref", () => {
      const cap: ModelConsistencyCapability = {
        modelId: "volcengine-pro",
        strategy: "multi_ref_fusion",
        maxCharacterRefs: 4,
      };
      expect(selectConsistencyStrategy(cap, 1)).toBe("single_ref");
    });

    it("7. 配置 single_ref 直接使用", () => {
      const cap: ModelConsistencyCapability = {
        modelId: "kling-v2",
        strategy: "single_ref",
        maxCharacterRefs: 1,
      };
      expect(selectConsistencyStrategy(cap, 5)).toBe("single_ref");
    });

    it("8. 配置 text_only 直接使用", () => {
      const cap: ModelConsistencyCapability = {
        modelId: "zhipu",
        strategy: "text_only",
        maxCharacterRefs: 0,
      };
      expect(selectConsistencyStrategy(cap, 5)).toBe("text_only");
    });

    it("9. unknown 模型 + maxCharacterRefs>=3 + 候选>=2 → multi_ref_fusion", () => {
      const cap: ModelConsistencyCapability = {
        modelId: "unknown-model",
        strategy: "unknown",
        maxCharacterRefs: 4,
      };
      expect(selectConsistencyStrategy(cap, 3)).toBe("multi_ref_fusion");
    });

    it("10. unknown 模型 + maxCharacterRefs>=1 → single_ref", () => {
      const cap: ModelConsistencyCapability = {
        modelId: "unknown-model",
        strategy: "unknown",
        maxCharacterRefs: 1,
      };
      expect(selectConsistencyStrategy(cap, 1)).toBe("single_ref");
    });

    it("11. unknown 模型 + maxCharacterRefs=0 → text_only", () => {
      const cap: ModelConsistencyCapability = {
        modelId: "unknown-model",
        strategy: "unknown",
        maxCharacterRefs: 0,
      };
      expect(selectConsistencyStrategy(cap, 0)).toBe("text_only");
    });
  });

  describe("selectReferenceImages", () => {
    const candidates = extractCharacterReferenceCandidates({
      characterId: "char-x",
      primaryImageUrl: "/img/p.png",
      defaultVariantImageUrl: "/img/dv.png",
      defaultOutfitImageUrl: "/img/do.png",
      variantImageUrls: ["/img/v1.png", "/img/v2.png"],
    });

    it("12. multi_ref_fusion 策略按 maxCharacterRefs 截断", () => {
      const selected = selectReferenceImages(candidates, "multi_ref_fusion", 3);
      expect(selected).toHaveLength(3);
      expect(selected[0]!.url).toBe("/img/p.png");
      expect(selected[1]!.url).toBe("/img/dv.png");
      expect(selected[2]!.url).toBe("/img/do.png");
    });

    it("13. multi_ref_fusion 填充 preprocessHint", () => {
      const selected = selectReferenceImages(candidates, "multi_ref_fusion", 2);
      expect(selected[0]!.preprocessHint).toEqual(DEFAULT_PREPROCESS_HINT);
      expect(selected[1]!.preprocessHint).toEqual(DEFAULT_PREPROCESS_HINT);
    });

    it("14. single_ref 策略优先选权威图", () => {
      const selected = selectReferenceImages(candidates, "single_ref", 1);
      expect(selected).toHaveLength(1);
      expect(selected[0]!.url).toBe("/img/p.png"); // 第一张权威图
      expect(selected[0]!.isAuthoritative).toBe(true);
    });

    it("15. text_only 策略返回空数组", () => {
      const selected = selectReferenceImages(candidates, "text_only", 4);
      expect(selected).toHaveLength(0);
    });

    it("16. unknown 策略返回空数组", () => {
      const selected = selectReferenceImages(candidates, "unknown", 4);
      expect(selected).toHaveLength(0);
    });

    it("17. single_ref 无权威图时取第一张", () => {
      const nonAuthoritativeCandidates = candidates.map((c) => ({
        ...c,
        isAuthoritative: false,
      }));
      const selected = selectReferenceImages(nonAuthoritativeCandidates, "single_ref", 1);
      expect(selected).toHaveLength(1);
      expect(selected[0]!.url).toBe("/img/p.png");
    });
  });

  describe("buildConsistencyEnhancedCharacterRefs", () => {
    it("18. 一站式：multi_ref_fusion 模型 + 完整素材 → 返回多张参考图", () => {
      const input: CharacterAssetInput = {
        characterId: "char-1",
        primaryImageUrl: "/img/p.png",
        defaultVariantImageUrl: "/img/dv.png",
        defaultOutfitImageUrl: "/img/do.png",
      };
      const cap: ModelConsistencyCapability = {
        modelId: "volcengine-pro",
        strategy: "multi_ref_fusion",
        maxCharacterRefs: 4,
      };

      const refs = buildConsistencyEnhancedCharacterRefs(input, cap);
      expect(refs).toEqual(["/img/p.png", "/img/dv.png", "/img/do.png"]);
    });

    it("19. 一站式：single_ref 模型 + 完整素材 → 仅返回 1 张权威图", () => {
      const input: CharacterAssetInput = {
        characterId: "char-2",
        primaryImageUrl: "/img/p.png",
        defaultVariantImageUrl: "/img/dv.png",
      };
      const cap: ModelConsistencyCapability = {
        modelId: "kling-v2",
        strategy: "single_ref",
        maxCharacterRefs: 1,
      };

      const refs = buildConsistencyEnhancedCharacterRefs(input, cap);
      expect(refs).toEqual(["/img/p.png"]);
    });

    it("20. 一站式：text_only 模型 → 返回空数组", () => {
      const input: CharacterAssetInput = {
        characterId: "char-3",
        primaryImageUrl: "/img/p.png",
      };
      const cap: ModelConsistencyCapability = {
        modelId: "zhipu",
        strategy: "text_only",
        maxCharacterRefs: 0,
      };

      const refs = buildConsistencyEnhancedCharacterRefs(input, cap);
      expect(refs).toEqual([]);
    });

    it("21. 一站式：空素材 → 返回空数组", () => {
      const input: CharacterAssetInput = { characterId: "char-4" };
      const cap: ModelConsistencyCapability = {
        modelId: "volcengine-pro",
        strategy: "multi_ref_fusion",
        maxCharacterRefs: 4,
      };

      const refs = buildConsistencyEnhancedCharacterRefs(input, cap);
      expect(refs).toEqual([]);
    });
  });

  describe("listAllCharacterReferenceOptions", () => {
    it("22. 返回所有候选（不做策略过滤）", () => {
      const input: CharacterAssetInput = {
        characterId: "char-1",
        primaryImageUrl: "/img/p.png",
        variantImageUrls: ["/img/v1.png", "/img/v2.png"],
      };

      const options = listAllCharacterReferenceOptions(input);
      expect(options).toHaveLength(3);
      expect(options.map((o) => o.url)).toEqual([
        "/img/p.png",
        "/img/v1.png",
        "/img/v2.png",
      ]);
    });
  });

  describe("buildManualCharacterRefs", () => {
    it("23. 用户手动选择按 maxCharacterRefs 截断", () => {
      const selected = buildManualCharacterRefs(
        ["/img/a.png", "/img/b.png", "/img/c.png"],
        { modelId: "kling-v2", strategy: "single_ref", maxCharacterRefs: 1 },
      );
      expect(selected).toEqual(["/img/a.png"]);
    });

    it("24. maxCharacterRefs=0 返回空数组", () => {
      const selected = buildManualCharacterRefs(
        ["/img/a.png"],
        { modelId: "zhipu", strategy: "text_only", maxCharacterRefs: 0 },
      );
      expect(selected).toEqual([]);
    });

    it("25. 选择数 < maxCharacterRefs 时全部返回", () => {
      const selected = buildManualCharacterRefs(
        ["/img/a.png"],
        { modelId: "volcengine-pro", strategy: "multi_ref_fusion", maxCharacterRefs: 4 },
      );
      expect(selected).toEqual(["/img/a.png"]);
    });
  });

  describe("describeConsistencyStrategy", () => {
    it("26. multi_ref_fusion 描述含 IP-Adapter", () => {
      const desc = describeConsistencyStrategy("multi_ref_fusion");
      expect(desc).toContain("IP-Adapter");
      expect(desc).toContain("多参考图融合");
    });

    it("27. single_ref 描述含单参考图", () => {
      expect(describeConsistencyStrategy("single_ref")).toBe("单参考图");
    });

    it("28. text_only 描述含仅文本", () => {
      const desc = describeConsistencyStrategy("text_only");
      expect(desc).toContain("仅文本描述");
    });

    it("29. unknown 描述含未知模型", () => {
      const desc = describeConsistencyStrategy("unknown");
      expect(desc).toContain("未知模型");
    });
  });
});
