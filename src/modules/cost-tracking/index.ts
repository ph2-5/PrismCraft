/**
 * cost-tracking 模块 — 成本追踪 / 用量统计（P0 骨架）
 *
 * 设计来源：docs/DESIGN-COST-TRACKING.md（v0.2）
 *
 * P0 范围说明：
 * - 采集链路（usage_records 表 / usage-repository / usage-tracker / api-gateway 采集点）
 *   全部在主进程（electron/src/），本模块 P0 仅为占位骨架；
 * - 成本看板 UI / 定价引擎（shared-logic/cost-engine）/ IUsageProvider 为 P1 交付，
 *   届时在本模块补充 services/hooks 并更新 contract.json。
 */
export {};
