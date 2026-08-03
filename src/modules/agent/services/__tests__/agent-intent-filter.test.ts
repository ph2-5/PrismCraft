import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveIntentFilter } from "../agent-intent-filter";
import type { ITextProvider } from "@/domain/ports";

vi.mock("../intent-router", () => ({
  routeIntent: vi.fn(),
  routeIntentWithLlmFallback: vi.fn(),
  mapIntentToToolSet: vi.fn(),
}));

import { routeIntent, routeIntentWithLlmFallback, mapIntentToToolSet } from "../intent-router";

const mockTextProvider = {} as ITextProvider;

const ROUTED = { type: "api-helper", confidence: 0.9 } as const;

describe("resolveIntentFilter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (routeIntent as ReturnType<typeof vi.fn>).mockReturnValue(ROUTED);
    (routeIntentWithLlmFallback as ReturnType<typeof vi.fn>).mockResolvedValue(ROUTED);
    (mapIntentToToolSet as ReturnType<typeof vi.fn>).mockReturnValue(["api-config"]);
  });

  it("未启用 LLM fallback 时走同步 routeIntent", async () => {
    const result = await resolveIntentFilter("帮我配置 API", { enableLlmIntentFallback: false }, mockTextProvider);
    expect(routeIntent).toHaveBeenCalledWith("帮我配置 API");
    expect(routeIntentWithLlmFallback).not.toHaveBeenCalled();
    expect(result).toEqual({ intent: ROUTED, toolSet: ["api-config"] });
  });

  it("启用 LLM fallback 时走 routeIntentWithLlmFallback", async () => {
    const result = await resolveIntentFilter("帮我配置 API", { enableLlmIntentFallback: true }, mockTextProvider);
    expect(routeIntentWithLlmFallback).toHaveBeenCalledTimes(1);
    expect(result.intent).toEqual(ROUTED);
  });

  it("意图无明确工具集时返回 undefined", async () => {
    (mapIntentToToolSet as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
    const result = await resolveIntentFilter("随便聊聊", { enableLlmIntentFallback: false }, mockTextProvider);
    expect(result.toolSet).toBeUndefined();
  });
});
