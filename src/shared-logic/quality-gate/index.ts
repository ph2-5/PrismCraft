/**
 * quality-gate — 模型无关质检层（v0.2）
 *
 * 零依赖纯逻辑：质检器注册表 + 编排器 + 阈值解析。
 * 供 modules/shot、modules/workflow 与主进程复用（shared-logic 双向复用约定）。
 */
export * from "./types";
export * from "./registry";
export * from "./runner";
export * from "./thresholds";
