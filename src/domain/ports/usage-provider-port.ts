/**
 * usage-provider-port.ts — 真实用量查询 Port（cost-tracking P1/P2）
 *
 * 设计来源：docs/DESIGN-COST-TRACKING.md §任务 4
 * 纯接口（零实现）：支持用量 API 的平台（OpenRouter/火山引擎/OpenAI）实现它，
 * 不支持的平台自然降级为本地估算（cost-engine）。
 * 注册方式：DI 容器 token + overrideToken 可测替换（与 IVideoProvider 同构）。
 */
import type { Result } from "@/domain/types/result";

/** 真实用量条目（平台 API 返回） */
export interface UsageEntry {
  providerId: string;
  modelId: string;
  quantity: number;
  unit: string;
  cost: number;
  currency: string;
}

export interface FetchUsageParams {
  providerId?: string;
  from: Date;
  to: Date;
}

export interface IUsageProvider {
  readonly id: string;

  /** 查询指定时间范围的真实用量与费用 */
  fetchUsage(params: FetchUsageParams): Promise<Result<UsageEntry[]>>;

  /** 当前是否可用（配置了 key / 平台可达） */
  isAvailable(): boolean;

  /** 可选：拉取远端价格表（版本号协商，覆盖本地默认表） */
  fetchPriceTable?(): Promise<Result<{ version: number; currency: string; providers: unknown }>>;
}
