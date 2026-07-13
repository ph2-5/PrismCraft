/* eslint-disable no-restricted-imports */
/**
 * AI Providers 基础设施代理导出
 *
 * 架构规则：app/ 和 modules/ 层不能直接导入 @/infrastructure/*，
 * 必须通过 @/shared/ 代理模块访问。
 *
 * 本模块 re-export @/infrastructure/ai-providers 的公开 API。
 */

// 离线队列操作
export { processPendingQueue, cleanCompletedRequests } from "@/infrastructure/ai-providers/offline-queue";

// 核心 API 调用
export { apiCall } from "@/infrastructure/ai-providers/core";
