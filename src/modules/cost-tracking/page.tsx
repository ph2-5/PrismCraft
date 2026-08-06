import { useMemo, useState } from "react";
import { PieChart, TrendingUp, Wallet, AlertTriangle, Loader2 } from "lucide-react";
import { t } from "@/shared/constants";
import { PageErrorBoundary } from "@/shared/presentation/PageErrorBoundary";
import { EmptyState } from "@/shared/presentation/EmptyState";
import { useUsageSummary, RANGE_PRESETS } from "./hooks/use-usage-summary";

const DAY_SECONDS = 86_400;

type RangeKey = keyof typeof RANGE_PRESETS;

function rangeFor(key: RangeKey): { from: number; to: number } {
  const now = Math.floor(Date.now() / 1000);
  const days = key === "week" ? 7 : key === "month" ? 30 : 90;
  return { from: now - days * DAY_SECONDS, to: now };
}

function formatCost(cost: number): string {
  return `¥${cost.toFixed(2)}`;
}

function CostTrackingPageInner() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("month");
  const range = useMemo(() => rangeFor(rangeKey), [rangeKey]);
  const { data, isPending } = useUsageSummary(range);

  const summary = data ?? { totalEstimatedCost: 0, effectiveCost: 0, failedCost: 0, recordCount: 0, byProvider: [], byDirection: [] };
  const hasData = summary.recordCount > 0;
  const directionLabel: Record<string, string> = {
    video: t("costTracking.direction.video"),
    image: t("costTracking.direction.image"),
    text: t("costTracking.direction.text"),
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">{t("costTracking.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("costTracking.subtitle")}</p>
      </header>

      {/* 时间范围切换 */}
      <div role="tablist" aria-label={t("costTracking.title")} className="inline-flex rounded-md border bg-card p-1">
        {(Object.keys(RANGE_PRESETS) as RangeKey[]).map((key) => (
          <button
            key={key}
            role="tab"
            aria-selected={rangeKey === key}
            onClick={() => setRangeKey(key)}
            className={`rounded px-3 py-1 text-sm transition-colors ${
              rangeKey === key ? "bg-primary text-primary-foreground" : "hover:bg-muted"
            }`}
          >
            {t(RANGE_PRESETS[key].labelKey)}
          </button>
        ))}
      </div>

      {isPending && !hasData ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {t("common.loading")}
        </div>
      ) : !hasData ? (
        <EmptyState icon={PieChart} title={t("costTracking.empty")} />
      ) : (
        <div className="space-y-6">
          {/* 双口径主卡片 */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Wallet className="h-4 w-4" aria-hidden="true" />
                {t("costTracking.effectiveCost")}
              </div>
              <div className="mt-1 text-2xl font-semibold">{formatCost(summary.effectiveCost)}</div>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <TrendingUp className="h-4 w-4" aria-hidden="true" />
                {t("costTracking.totalCost")}
              </div>
              <div className="mt-1 text-2xl font-semibold">{formatCost(summary.totalEstimatedCost)}</div>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                {t("costTracking.failedCost")}
              </div>
              <div className="mt-1 text-2xl font-semibold text-amber-600">{formatCost(summary.failedCost)}</div>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <PieChart className="h-4 w-4" aria-hidden="true" />
                {t("costTracking.recordCount")}
              </div>
              <div className="mt-1 text-2xl font-semibold">{summary.recordCount}</div>
            </div>
          </div>

          {/* 按提供商 */}
          <section className="rounded-lg border bg-card p-4">
            <h2 className="mb-3 text-base font-medium">{t("costTracking.providerSection")}</h2>
            {summary.byProvider.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("costTracking.empty")}</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 font-medium">{t("costTracking.providerId")}</th>
                    <th className="pb-2 text-right font-medium">{t("costTracking.cost")}</th>
                    <th className="pb-2 text-right font-medium">{t("costTracking.effective")}</th>
                    <th className="pb-2 text-right font-medium">{t("costTracking.count")}</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.byProvider.map((p) => (
                    <tr key={p.providerId} className="border-b last:border-0">
                      <td className="py-2">{p.providerId || t("costTracking.providerUnknown")}</td>
                      <td className="py-2 text-right">{formatCost(p.cost)}</td>
                      <td className="py-2 text-right">{formatCost(p.effectiveCost)}</td>
                      <td className="py-2 text-right">{p.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* 按生成类型 */}
          <section className="rounded-lg border bg-card p-4">
            <h2 className="mb-3 text-base font-medium">{t("costTracking.directionSection")}</h2>
            {summary.byDirection.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("costTracking.empty")}</p>
            ) : (
              <div className="space-y-2">
                {summary.byDirection.map((d) => (
                  <div key={d.direction} className="flex items-center gap-3">
                    <span className="w-16 text-sm">{directionLabel[d.direction] ?? d.direction}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{
                          width: summary.totalEstimatedCost > 0
                            ? `${Math.min(100, (d.cost / summary.totalEstimatedCost) * 100)}%`
                            : "0%",
                        }}
                      />
                    </div>
                    <span className="w-20 text-right text-sm tabular-nums">{formatCost(d.cost)}</span>
                    <span className="w-12 text-right text-xs text-muted-foreground">{d.count}次</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <p className="text-xs text-muted-foreground">{t("costTracking.estimateNote")}</p>
        </div>
      )}
    </div>
  );
}

export default function CostTrackingPage() {
  return (
    <PageErrorBoundary>
      <CostTrackingPageInner />
    </PageErrorBoundary>
  );
}
