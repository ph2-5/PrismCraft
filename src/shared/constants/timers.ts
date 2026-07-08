export const BLOB_URL_REVOKE_DELAY_MS = 5000;
export const BLOB_URL_LONG_REVOKE_DELAY_MS = 10000;
export const COPY_RESET_DELAY_MS = 2000;
export const BATCH_OPERATION_INTERVAL_MS = 500;
export const CACHE_RETRY_INTERVAL_MS = 1000;

/** 通用时间单位（毫秒）—— 用于时间表达式可读性 */
export const MINUTE_MS = 60 * 1000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

/** React Query 默认 staleTime（数据被视为新鲜的时间） */
export const DEFAULT_STALE_TIME_MS = 5 * MINUTE_MS;
/** React Query 默认 gcTime（垃圾回收时间） */
export const DEFAULT_GC_TIME_MS = 10 * MINUTE_MS;
