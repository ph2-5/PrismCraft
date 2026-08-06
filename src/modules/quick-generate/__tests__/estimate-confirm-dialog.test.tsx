/**
 * EstimateConfirmDialog.test.tsx — 生成前费用预估确认弹窗测试（cost-tracking P1）
 *
 * 覆盖：有定价模型的预估显示 / 未选模型的提示 / 待定价提示 / 确认取消回调
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EstimateConfirmDialog } from "../EstimateConfirmDialog";

vi.mock("@/shared/constants", () => ({
  t: (key: string) => key, // 直接返回键名便于断言
}));

// 关闭本月累计查询（避免等待网络）
vi.mock("@/modules/cost-tracking", () => ({
  useUsageSummary: () => ({ data: { effectiveCost: 12.34 }, isPending: false }),
}));

function renderDialog(props: Partial<React.ComponentProps<typeof EstimateConfirmDialog>> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <EstimateConfirmDialog
        open
        onOpenChange={() => {}}
        duration={5}
        onConfirm={() => {}}
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe("EstimateConfirmDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("有定价模型时显示本次预估金额与公式", () => {
    renderDialog({ providerId: "kuaishou", modelId: "kling-v1", duration: 5 });
    // 0.35 * 5 = 1.75
    expect(screen.getByText("¥1.75")).toBeTruthy();
    expect(screen.getByText(/5秒/)).toBeTruthy();
  });

  it("未选择模型时显示提示而非金额", () => {
    renderDialog({ duration: 5 });
    expect(screen.getByText("costTracking.estimate.unknownProvider")).toBeTruthy();
    expect(screen.queryByText("¥1.75")).toBeNull(); // 本次预估金额不应出现（本月累计 ¥12.34 仍显示）
  });

  it("待定价模型（rate=null）显示待定价提示", () => {
    renderDialog({ providerId: "jimeng", modelId: "seedance-pro", duration: 5 });
    expect(screen.getByText("costTracking.estimate.pendingNote")).toBeTruthy();
  });

  it("显示本月累计有效成本", () => {
    renderDialog({ providerId: "kuaishou", modelId: "kling-v1", duration: 5 });
    expect(screen.getByText("¥12.34")).toBeTruthy();
  });

  it("点击开始生成触发 onConfirm，取消触发 onOpenChange(false)", () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    renderDialog({ providerId: "kuaishou", modelId: "kling-v1", duration: 5, onConfirm, onOpenChange });

    screen.getByText("costTracking.estimate.submit").click();
    expect(onConfirm).toHaveBeenCalledTimes(1);

    screen.getByText("common.cancel").click();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
