# 成本追踪 / 用量统计模块设计

> 状态：**设计草案 v0.2**（评审修订版，重建于 2026-08-06 对象库事故后）
> 依据：`tasks/prismcraft-cost-tracking-design.md` 任务书

---

## 0. 验证发现（对任务书输入的修正与补充）

| 发现 | 影响 |
|---|---|
| **`generation_tasks` 表已预埋 `provider_id`、`model_id`、`estimated_cost REAL`** | 设计衔接预埋，`estimated_cost` 已有落库位 |
| **`estimatedTokens` 已被真实使用**（prompt-enhancer.ts `estimateTokens()`） | 文本计费直接复用 |
| **`estimatedCost` 确为零业务使用** | 任务书缺口成立，本设计落地它 |
| 计费可用参数：video/framepair 有 `duration`，text 有 `maxTokens`，image 有 `size`；**无 resolution/count** | 公式分派以此为准 |
| 全库无 billing/用量统计专属模块 | 新表用 `usage_records` 系列 |

## 任务 1：用量记录模型

### 1.1 表结构（schema-builder + 7 基础列）

```ts
usage_records: {
  provider_id: "TEXT NOT NULL", model_id: "TEXT NOT NULL",
  direction: "TEXT NOT NULL",           // image | video | text | audio
  parameters_json: "TEXT NOT NULL",     // { duration?, size?, count?, maxTokens?, ... }
  estimated_cost: "REAL NOT NULL DEFAULT 0",
  cost_currency: "TEXT NOT NULL DEFAULT 'CNY'",
  cost_source: "TEXT NOT NULL DEFAULT 'estimate'",   // estimate | actual
  entity_type: "TEXT", entity_id: "TEXT",
  origin: "TEXT NOT NULL DEFAULT 'manual'",          // manual | batch | workflow | agent
  task_id: "TEXT",
  status: "TEXT NOT NULL DEFAULT 'succeeded'",       // v0.2: succeeded | failed | cancelled
  actual_cost: "REAL",
}
// 索引：provider_id+model_id / created_at / entity_id / cost_source
```

**迁移**：`CURRENT_SCHEMA_VERSION 12 → 13`，事务内 `CREATE TABLE IF NOT EXISTS`。

### 1.2 采集点（v0.2 修订：主采集点为主进程 api-gateway 层）

| 候选 | 覆盖度 | 侵入度 | 结论 |
|---|---|---|---|
| **主进程 api-gateway 层**（`electron/src/api-gateway*.ts`） | 100% | 低 | **推荐**：①参数最全（buildVideoRequestBody 含 duration/refs）；②**写库同进程**（better-sqlite3 在主进程，零跨进程通道）；③天然 providerId/modelId |
| ~~渲染进程 infrastructure/ai-providers（薄客户端）~~ | 100% | 低 | **放弃**：参数不全且写库需跨进程通道（评审问题 3） |
| 生成服务层（beat-chain-generator） | 高 | 中 | **补充点**：entity 关联回填 |
| 视频任务层（task-management） | 低 | 低 | 仅 task_id 关联 |

**写库通道结论**：主采集点在主进程内 → `recordUsage` 直连 SQLite（同进程零通道）；补充点回填走新增 `POST /api/usage/attach-entity`（route-groups 同构）；不存在渲染进程直接写主进程 DB 的路径。

### 1.3 失败语义
`recordUsage` 失败 → 静默降级：内存环形缓冲（1000 条）批写，满则丢弃 + errorLogger.warn，**绝不 throw**（R195）。

### 1.4 范围界定
纳入：文本（按 token，复用 estimateTokens()）、图像（按张）、视频（按秒）、音频（按秒）；不纳入：本地推理（ONNX）、文件读写、缓存命中。

## 任务 2：定价引擎

### 2.1 单价表 JSON Schema
```jsonc
{
  "version": 1, "currency": "CNY",
  "providers": {
    "kling": { "models": { "kling-v1": { "billing": "per_second", "rate": 0.35, "effectiveFrom": "2026-01-01" } } },
    // 13 家全覆盖；未知 → "unknown"（rate: null → "待定价"）
  },
  "history": []
}
```
`billing`: per_second | per_call | per_image | per_token。

### 2.2 估算公式（shared-logic/cost-engine/calculator.ts，纯函数）
按 billing 分派：per_second → duration×rate；per_image → count×rate；per_token → maxTokens×rate；per_call → rate。返回 `{ cost, currency, source: "estimate", confidence, formula }`（formula 供 UI 透明度）。

### 2.3 更新机制
默认=代码内常量（零依赖可测）；增强=可插拔远端拉取（`fetchPriceTable()`，版本号协商）。

### 2.4 误差标注
金额旁显示 `~` + confidence 徽标；套餐/优惠未配置则标注"未含套餐优惠"；未知定价显示"待定价"不参与合计。

## 任务 3：成本看板 UI

- **页面**：新路由 `/cost-tracking`（职责独立，不污染现有测试）；
- **聚合**：时间（日/周/月）、提供商（性价比）、分镜/项目、生成类型；
- **状态管理**：React Query（服务端聚合，`/api/usage/summary`）+ Zustand（瞬时筛选态）——双轨哲学；
- **双口径（v0.2）**：有效成本（仅 succeeded，主数字）/ 总成本含失败（浪费分析：失败成本=降本叙事素材）；`status=failed` 费用显示"潜在浪费"不计入有效成本；
- **i18n**：`costTracking.*` 键组。

## 任务 4：IUsageProvider Port

```ts
export interface IUsageProvider {
  readonly id: string;
  fetchUsage(params: { providerId?: string; from: Date; to: Date; })
    : Promise<Result<Array<{ providerId: string; modelId: string; quantity: number;
      unit: string; cost: number; currency: string }>>>;
  isAvailable(): boolean;
  fetchPriceTable?(): Promise<Result<PriceTable>>;
}
```
- 注册：DI 容器 token + overrideToken 可测替换；无实现 → 纯本地估算（无缝）；
- 降级链：本地估算（兜底）← IUsageProvider 实现（openrouter ✅ / volcengine ✅ / openai ✅，具体接入列后续）；
- 合并：有真实用真实（cost_source=actual 回填 actual_cost）、无真实用估算、混合逐条标记 + 看板顶部"估算占比 %"。

## 任务 5：生成前费用预估（v0.2）

- 落地节点：①生成确认弹窗（**仅手动生成场景**）；②批量生成前（合计）；③工作流节点（**只展示不弹窗**——自动批量执行不打断，executor 节点摘要 passive 显示，评审问题 8）；
- 展示：本次预估 / 批量合计 / 本月累计；
- 共用定价引擎：预估与看板同一 `calculateCost()`，杜绝两套口径。

## 命名与模块归属

| 层 | 位置 |
|---|---|
| shared-logic | `shared-logic/cost-engine/`（calculator + prices + types，零依赖） |
| Port | `domain/ports/usage-provider-port.ts` |
| 业务模块 | `modules/cost-tracking/` + `services/usage-tracker.ts` |
| 主进程 | usage_records 表 v13 + `api/route-groups/cost-routes.ts` |

## 工作量估算（v0.2 修订：原 3-5 周偏乐观）

| 阶段 | 内容 | 工作量 |
|---|---|---|
| **P0** | usage_records v13 + api-gateway 采集 + usage-tracker（缓冲/降级/status）+ 测试 | **2 周** |
| **P1** | cost-engine + 看板页（双口径）+ summary API | **2 周** |
| **P2** | estimatedCost 弹窗 + 批量合计 + IUsageProvider 接口 | **2 周** |
| **P2+（单独排期）** | IUsageProvider 平台实现 | 每平台 3-5 天 |
| **合计（主线）** | | **6 周** |

## 与既有路线衔接 & 质检层关系

- **OPTIMIZATION-PLAN.md 同步（v0.2）**：与质检层一起在评审通过后新增"成本追踪/用量统计"章节；
- 同哲学（可插拔 Port + 降级链）；互补卖点：质检"提升质量" + 成本看板"量化省钱"——**"帮你省钱"和"告诉你省了多少"合体**，成本看板是销售材料的直观证明。
