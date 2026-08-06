# cost-tracking 模块 — 成本追踪 / 用量统计

> 设计来源：`docs/DESIGN-COST-TRACKING.md`（v0.2，评审修订）
> 状态：P0 已落地（采集链路）✅ / P1 进行中（定价引擎已落地，看板 UI 待建）

## 职责

把"AI 生成花了多少钱"变成可量化数据：

1. **本地用量记录**：每次 AI 调用（video/image/text）自动记录 provider、model、参数、时间、关联实体，落 `usage_records` 表（migrations v13）；
2. **失败成本处置**（v0.2 评审问题 2）：记录带 `status`（succeeded/failed/cancelled），看板按双口径聚合——有效成本（仅成功）vs 总成本（含失败 = 浪费分析）；
3. **静默降级**（R195）：记录失败绝不影响生成主流程——内存环形缓冲（1000 条）批写，满则丢弃最旧 + warn。

## 采集链路（P0，主进程）

```
api-gateway.ts / api-gateway-image.ts / api-gateway-text.ts   ← 采集点（成功/失败路径，try/catch 包裹）
        ↓ usageTracker.record()（electron/src/services/usage-tracker.ts）
        ↓ 环形缓冲(1000) + 5s 定时批写
electron/src/database/usage-repository.ts                     ← insertUsageBatch / updateUsageStatus / aggregateUsage
        ↓
usage_records 表（SQLite，migrations v13 + FEATURE_TABLES + 3 索引）
```

**采集点选型依据**（v0.2 修订）：主进程 api-gateway 层——参数最全、写库同进程零跨进程通道、天然 providerId/modelId。

## 数据模型（usage_records）

| 字段 | 说明 |
|---|---|
| direction | video / image / text |
| provider_id / model_id | 统一标识（定价表键控） |
| duration_seconds / resolution / image_count / input_tokens / output_tokens | 计费参数 |
| estimated_cost / cost_source | 本地估算（P0）；provider_actual 由 IUsageProvider 回填（P1） |
| status | succeeded / failed / cancelled（失败成本双口径） |
| story_id / beat_id / task_id | 关联实体（可空，attachUsageEntity 回填） |
| source | manual / batch / workflow |
| called_at | 调用时刻（Unix 秒） |

## 定价引擎（P1，shared-logic/cost-engine）

- **位置**：`src/shared-logic/cost-engine/`（零依赖纯函数，主/渲染双向复用）
- **types.ts**：BillingType（per_second/per_call/per_image/per_token）、PriceTable、CostEstimate（含 formula/confidence）
- **prices.ts**：`DEFAULT_PRICE_TABLE`（13 家占位，近似公开定价，rate=null → 待定价）
- **calculator.ts**：`calculateCost()` 按计费方式分派 + `sumEstimates()` 批量合计（忽略待定价）+ `roundToCent()`（EPSILON 修正浮点）
- **关键规则**：预估与看板共用同一 `calculateCost()`，禁止两套口径

## 真实用量 Port（P1，domain/ports/usage-provider-port.ts）

- `IUsageProvider` 纯接口：fetchUsage / isAvailable / 可选 fetchPriceTable
- 注册：DI 容器 token + overrideToken 可测替换；无实现 → 纯本地估算（无缝降级）
- 有真实用真实（cost_source=actual 回填 actual_cost）、无真实用估算、混合逐条标记

## 公共 API

| 导出 | 类型 | 说明 |
|---|---|---|
| `CostTrackingPage` | 页面组件 | 成本看板页面（/cost-tracking 路由，懒加载） |
| `useUsageSummary` | 数据 Hook | React Query 聚合数据 hook（queryKey 含时间范围，1 分钟 staleTime，切换保留旧数据） |
| `RANGE_PRESETS` | 常量 | 时间范围预设（week/month/quarter + labelKey） |
| `UsageSummaryRange` | 类型 | 时间范围结构 |
| `UsageSummaryData` | 类型 | 汇总数据结构 |
| `fetchUsageSummary` | 服务函数 | 调 `POST /api/usage/summary`（经 DI apiClient，Result 模式），失败返回 `EMPTY_SUMMARY` |
| `EMPTY_SUMMARY` | 常量 | 空汇总（看板空态） |
| `UsageSummary` | 类型 | 与主进程 summarizeUsage 返回结构一致 |

采集链路（主进程）与定价引擎（shared-logic）见上两节，不在此导出。

## 守卫

- **R195**：usage 记录链路失败必须静默降级，绝不阻塞/影响生成主流程（`.trae/rules/regression/error-handling.md`）
