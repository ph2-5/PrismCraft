# 任务书：成本追踪 / 用量统计模块设计

> 任务性质：**设计任务**（先出方案，不实施）

## 一、背景：设计初衷确认

项目设计初衷有两条（已确认）：
1. **素材管理更方便**：统一资产库 + 结构化属性 + 引用检查
2. **分镜系统降低抽卡次数、节约成本**：AI 生成是概率性的，每次生成都花钱，减少无效生成 = 省钱

### 初衷符合度分析结论（设计输入）

**初衷 2（降本）是项目灵魂，已有 10 层机制系统性落地**：

| # | 机制 | 位置 |
|---|---|---|
| 1 | 链式引用：分镜引用前一分镜末帧/视频，抽到好卡锁死 | `modules/shot/shot-reference/reference-engine.ts` |
| 2 | 视频生成模式自适应：continuous→续接，contrast/景别切换→首帧锚定 | `storyboard/generation/services/video-generation-mode.ts` |
| 3 | 三阶段管线成本分层：keyframe→framePair→video，便宜的先抽 | `beat-chain-generator.ts` |
| 4 | 特征锚定 + 元素绑定：结构化特征写进 prompt，减少废卡 | `modules/shot/feature-extraction/`、`element-binding/` |
| 5 | 智能重试分类：余额不足/参数错误不重试，带 tokenWasteRisk | `modules/video/recovery/services/smart-retry-engine.ts` |
| 6 | 本地零成本质检：ONNX face embedding 优先，VLM 降级 | `modules/video/consistency-qc/services/face-embedding-service.ts` |
| 7 | 模型能力自适应：5 策略 + 自动升降级 | `getVideoGenerationStrategy(modelId)` |
| 8 | 成本预估字段：estimatedCost / estimatedTokens 已定义 | `domain/schemas/story.ts` |
| 9 | 批量生成、双层缓存、模板复用、few-shot、导演规则 | 各处 |

**关键缺口（本次任务要解决）**：
- `estimatedCost` / `estimatedTokens` **仅在 schema 定义，业务代码零使用**
- **全项目无用量记录、无成本报表**——用户省钱但看不到省了多少，降本效果无法量化

### 方案可行性认知（已确认）

- 平台费用 API 现状：OpenAI ✅ / 火山引擎 ✅ / MiniMax ⚠️ / **Kling、Runway、Pika、Luma ❌** / OpenRouter ✅
- **结论：不能依赖平台 API 回传费用**（不到一半有、口径不统一、违背模型无关原则）
- **正确姿势：本地计量 + 公开定价估算为主，平台用量 API 做成可插拔增强**——与"模型能力自适应 + 降级链"哲学同构

## 二、设计目标

1. **本地用量记录**：每次 AI 调用自动记录 provider、model、参数（时长/分辨率/数量/类型）、时间、关联实体，存本地 SQLite
2. **定价引擎**：公开单价表（JSON），费用 = 调用参数 × 单价；估算值标注来源
3. **成本看板 UI**：按分镜/项目/提供商/时间聚合；估算 vs 实际（如有）
4. **生成前费用预估**：把 `estimatedCost` 用起来
5. **可插拔真实用量**：`IUsageProvider` Port——支持 API 的平台返回实际数据，不支持的自然降级本地估算

## 三、现有资产盘点（设计输入）

| 资产 | 位置 | 说明 |
|---|---|---|
| 预估字段（未使用） | `domain/schemas/story.ts` | estimatedCost / estimatedTokens |
| 调用参数齐备 | `domain/ports/ai-provider-port.ts` | 每次生成都有 providerId/modelId/format/duration |
| 本地 SQLite | electron 主进程 | 37 表，migrations v12，声明式 schema-builder |
| CQRS 先例 | `modules/video/task-management/` | State/Queries/Commands/Polling 四层拆分 |
| 能力自适应先例 | `getVideoGenerationStrategy` | 5 策略 + 升降级，IUsageProvider 降级链应对齐 |
| 任务记录先例 | `modules/video/task-management/` | 已记录 provider/model/状态，是天然入口 |
| 插件体系 | `electron/src/plugins/` | providerId 统一标识，定价表按此键控 |

## 四、设计任务分解

### 任务 1：用量记录模型（本地计量）
1. **记录字段**：调用时间、方向（image/video/text）、providerId、modelId、参数（duration/resolution/count/首尾帧/refs 数量）、估算费用、关联实体（storyId/beatId，可空）、来源（手动/批量/workflow）
2. **存储**：SQLite 新表（表名/字段/索引/迁移版本），遵循 schema-builder + 事务性迁移
3. **采集点**（给出推荐 + 覆盖度 vs 侵入度论证）：生成服务层（beat-chain-generator）/ AI provider 适配层（infrastructure/ai-providers 统一入口）/ 视频任务层（已有记录但只覆盖视频）
4. **失败语义**：记录失败不能影响生成主流程（静默降级/内存缓冲）
5. **范围界定**：文本 LLM（按 token 估算）和图像（按张）是否纳入

### 任务 2：定价引擎（本地估算）
1. **单价表 JSON Schema**：provider → model → { 计费方式: 按秒/按次/按张/按token, 单价, 币种, 生效日期 }；历史价格保留
2. **覆盖范围**：13 家公开定价（Kling 按秒、Seedance 按秒、MiniMax 按次/秒、OpenAI 图像按张、文本按 token）；结构设计，数值可留占位
3. **估算公式**：费用 = f(参数, 单价表)，按计费方式分派
4. **更新机制**：价格表放代码内 / 配置文件 / 远端拉取？推荐 + 理由
5. **误差标注**：套餐/优惠影响，UI 如何呈现"估算"语义

### 任务 3：成本看板 UI
1. **页面归属**：新页面还是并入现有页面（video-tasks/settings）？
2. **聚合维度**：时间（日/周/月）、提供商（性价比对比）、分镜/项目、生成类型
3. **复用**：现有图表/表格组件；状态管理选型（React Query vs Zustand）论证
4. **i18n**：全量文案走 i18n 体系

### 任务 4：IUsageProvider Port（可插拔真实用量）
1. **接口定义**：最小接口——查询时间范围/provider 的实际用量与费用；放 `domain/ports/` 纯 interface
2. **注册与降级**：对齐 `getVideoGenerationStrategy` 模式；候选实现（OpenRouter/火山/OpenAI）；无实现降级估算
3. **数据合并**：真实与估算如何合并展示（有真实用真实、无真实用估算、标记来源）
4. **本期范围**：接口 + 降级链设计；具体平台实现列后续

### 任务 5：生成前费用预估
1. **estimatedCost 落地节点**：生成确认弹窗 / 批量生成前 / 工作流节点？
2. **展示内容**：本次预估、批量合计、本月累计
3. **共用定价引擎**：预估与看板同一套计算，避免两套

## 五、设计约束（必须遵守）
1. **架构纪律**：lint:arch 强制依赖方向；新模块配套 `MODULE.md` + `contract.json`
2. **shared-logic 规则**：估算公式是纯函数，建议放 shared-logic（零外部依赖，主/渲染复用）
3. **回归守卫**：不违反 R1-R191；记录链路不得影响生成主流程（可新增守卫建议）
4. **失败即预期**：记录失败静默降级；真实用量 API 不可用降级估算
5. **测试策略**：定价公式、估算聚合、Port 降级链的 Vitest 粒度
6. **不实施**：只产出设计；单价表数值可留占位

## 六、产出物与验收标准
| 产出物 | 验收标准 |
|---|---|
| 用量记录模型设计 | 表结构 + 采集点推荐（含论证）+ 失败语义 |
| 定价引擎设计 | 单价表 Schema + 公式分派 + 更新机制 + 误差标注 |
| 成本看板 UI 设计 | 页面归属、聚合维度、组件复用、状态管理论证 |
| IUsageProvider 设计 | 接口草案 + 降级链 + 候选实现清单 |
| 生成前预估方案 | estimatedCost 落地节点 + 共用定价引擎验证 |
| 工作量估算 | 分阶段（P0/P1/P2）+ 风险点 |

## 七、与另一份任务书的关系
- 并行任务：《模型无关质检层 + 自研模型接入方案设计》（已另发）
- 两者互不依赖、可并行设计；都遵循"可插拔 Port + 降级链"同一哲学
- 本模块对收购价值：**"帮你省钱"和"告诉你省了多少"是两件事，成本看板是能写进销售材料的直观价值证明**
