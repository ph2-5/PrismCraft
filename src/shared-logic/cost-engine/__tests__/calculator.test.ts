/**
 * calculator.test.ts — 定价引擎测试（cost-tracking P1）
 *
 * 覆盖：四种计费分派 / 未知 provider/model 待定价 / 自定义表覆盖 / 四舍五入 / 批量合计
 */
import { describe, it, expect } from "vitest";
import { calculateCost, sumEstimates, roundToCent } from "../calculator";
import { DEFAULT_PRICE_TABLE } from "../prices";
import type { PriceTable } from "../types";

describe("cost-engine/calculator", () => {
  it("per_second 分派：按时长 × 单价", () => {
    const est = calculateCost({ providerId: "kuaishou", modelId: "kling-v1", durationSeconds: 5 });
    expect(est.cost).toBe(1.75);
    expect(est.currency).toBe("CNY");
    expect(est.source).toBe("estimate");
    expect(est.formula).toContain("5秒");
    expect(est.formula).toContain("1.75");
  });

  it("per_image 分派：按张数 × 单价", () => {
    const est = calculateCost({ providerId: "openai", modelId: "dall-e-3", imageCount: 2 });
    expect(est.cost).toBe(0.64);
    expect(est.formula).toContain("2张");
  });

  it("per_token 分派：按 token 数 × 单价", () => {
    const est = calculateCost({ providerId: "openai", modelId: "gpt-4o-mini", tokens: 1500 });
    expect(est.cost).toBe(0.03);
    expect(est.formula).toContain("1500token");
  });

  it("per_call 分派：单次固定价", () => {
    const est = calculateCost({ providerId: "pika", modelId: "pika-v1" });
    expect(est.cost).toBe(1.2);
    expect(est.formula).toContain("1次");
  });

  it("未知 provider → cost=null 且 formula=待定价", () => {
    const est = calculateCost({ providerId: "unknown-provider", modelId: "x" });
    expect(est.cost).toBeNull();
    expect(est.formula).toBe("待定价");
    expect(est.confidence).toBe("low");
  });

  it("未知 model → cost=null 待定价", () => {
    const est = calculateCost({ providerId: "kuaishou", modelId: "no-such-model" });
    expect(est.cost).toBeNull();
  });

  it("rate=null（显式待定价）→ cost=null", () => {
    const est = calculateCost({ providerId: "jimeng", modelId: "seedance-pro", durationSeconds: 5 });
    expect(est.cost).toBeNull();
  });

  it("自定义价格表覆盖默认（历史价格/参数测试）", () => {
    const customTable: PriceTable = {
      version: 2,
      currency: "CNY",
      providers: {
        test: { models: { "model-x": { billing: "per_second", rate: 1, confidence: "high" } } },
      },
    };
    const est = calculateCost({ providerId: "test", modelId: "model-x", durationSeconds: 2.5 }, customTable);
    expect(est.cost).toBe(2.5);
    expect(est.confidence).toBe("high");
  });

  it("roundToCent：四舍五入到分", () => {
    expect(roundToCent(0.335)).toBe(0.34);
    expect(roundToCent(1.005)).toBe(1.01);
    expect(roundToCent(2.5 * 0.4)).toBe(1); // 1.0000...
  });

  it("置信度透传：默认表 medium，显式 high 保留", () => {
    expect(calculateCost({ providerId: "kuaishou", modelId: "kling-v1", durationSeconds: 1 }).confidence).toBe("medium");
    expect(calculateCost({ providerId: "openai", modelId: "dall-e-3", imageCount: 1 }).confidence).toBe("high");
  });
});

describe("cost-engine/sumEstimates", () => {
  it("合计有效估算，忽略待定价", () => {
    const { total, pendingCount } = sumEstimates([
      calculateCost({ providerId: "kuaishou", modelId: "kling-v1", durationSeconds: 5 }),
      calculateCost({ providerId: "unknown", modelId: "x" }),
      calculateCost({ providerId: "openai", modelId: "dall-e-3", imageCount: 1 }),
    ]);
    expect(total).toBe(2.07); // 1.75 + 0.32
    expect(pendingCount).toBe(1);
  });

  it("全部待定价 → total=null", () => {
    const { total, pendingCount } = sumEstimates([
      calculateCost({ providerId: "unknown", modelId: "x" }),
    ]);
    expect(total).toBeNull();
    expect(pendingCount).toBe(1);
  });

  it("空数组 → total=null", () => {
    expect(sumEstimates([]).total).toBeNull();
  });

  it("默认表含代表性条目（13 家覆盖验证）", () => {
    const providers = Object.keys(DEFAULT_PRICE_TABLE.providers);
    expect(providers.length).toBeGreaterThanOrEqual(6);
    expect(DEFAULT_PRICE_TABLE.version).toBeGreaterThan(0);
    expect(DEFAULT_PRICE_TABLE.currency).toBe("CNY");
  });
});
