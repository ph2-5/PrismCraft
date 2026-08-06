/**
 * cost-tracking 模块 — 成本追踪 / 用量统计
 *
 * 设计来源：docs/DESIGN-COST-TRACKING.md（v0.2）
 * P0：采集链路（主进程 usage_records + api-gateway 采集 + 缓冲 tracker）
 * P1：定价引擎（shared-logic/cost-engine）+ IUsageProvider Port + 成本看板（本模块页面/hook/service）
 */
export { default as CostTrackingPage } from "./page";
export { useUsageSummary, RANGE_PRESETS, type UsageSummaryRange, type UsageSummaryData } from "./hooks/use-usage-summary";
export { fetchUsageSummary, EMPTY_SUMMARY, type UsageSummary } from "./services/usage-summary-service";
