# PrismCraft — 详细开发计划 v5.4

> **本文档为 AI 辅助开发设计。** 每个 Task 包含 `📋前置阅读` `📝产出文件` `🤖执行指令` `✅Done标准` 四个部分。
> 执行顺序：从上到下。标注 ⚡并行 的 Task 可同时推进。
>
> **v5.4 更新**：基于豆包深度分析 + Kimi 战略建议，针对 Seedance 2.5（2026-06-23 发布，7-13 开放 API）新增 4 个 Task。Seedance 2.5 原生支持 3D 白盒输入、局部重绘编辑、50 路全模态参考、30 秒 4K 直出。主要变更：
> - **Phase 2A 新增 4 个 Task**：Task 2A.20（Seedance 2.5 模型注册，+1.5 天）、Task 2A.21（3D 白盒预览编辑器 blockout-3d，+14 天）、Task 2A.22（局部重绘编辑 partial-edit，+8 天）、Task 2A.23（一致性 QC 闭环 consistency-qc，+6 天，落地 Kimi 对话尾部关于元素绑定一致性问题的核心建议）
> - **Phase 2A 工期**：从 40-52 天调整为 69.5-81.5 天（净增 29.5 天）
> - **产品定位**（豆包洞察）：3D 白盒做"不会 Blender 的轻量白模编辑器"，不与 Blender 竞争，做差异化窗口
> - **架构原则**：provider-agnostic 场景图 + 适配层（Seedance 主路径 + 关键帧 fallback），防单点依赖
> - **Kimi 一致性洞察**（v5.4 核心增强）：元素绑定不能"解决"一致性问题（漂移累积/尾帧双刃剑/缺少验证闭环），需要 QC 闭环 + 分镜类型策略区分 + face-swap fallback 三层防御。详见 Task 2A.23
> - **不破坏原功能**：所有新字段 optional，新 Task 类型独立处理，现有 13 个 Provider 不受影响
> - 总工期从 224-336 天调整为 253.5-365.5 天
>
> **v5.3 文档结构**：本主文档仅作为**大纲与导航**，详细 Task 内容已按主题拆分到 `./development-plan/` 子目录下的 4 个子文件（见下方"文档导航"；phase-polish.md / phase-agent.md 已归档至 `./archive/`）。本文件保留 TL;DR、Gantt 图、架构总览、各 Phase 概要与附录索引。
>
> **v5.3 更新**：整合 seedance-2.0 仓库（MIT 许可）的工程方法借鉴，应用于提示词优化、小说导入故事创作、AI Agent 助手三个方向。借鉴清单与映射详见 [`docs/archive/seedance-integration-notes.md`](./archive/seedance-integration-notes.md)。主要变更：
> - **Phase 1 增强**：Task 1.1 增强（Agent Loop 集成意图路由）、Task 1.4 增强（System Prompt Builder 集成 Skill 路由 + 安全改写）、新增 Task 1.12（Agent 意图路由表 + Skill Registry）
> - **Phase 2A 增强**：Task 2A.13 增强（故事结构分析增加 treatment + shot contract）、Task 2A.14 增强（节奏规划增加角色化产出）、新增 Task 2A.18（连续性账本）、新增 Task 2A.19（半自动/全自动工作流增强）
> - **Phase 4 增强**：Task 4.7 增强（Prompt 配方库升级为完整 Skill 体系）、新增 Task 4.12（IP 安全改写 + 误报修复）
> - 总工期从 200-300 天调整为 224-336 天（净增 24-36 天，分散在 3 个 Phase）
> - 不整合部分：Seedance 专属知识（模型 ID/定价/平台能力）、六语言完整词汇表、专业电影工业完整工作流（ACES/调色/M&E）、Codex skill installer
>
> **v5.2 更新**：整合 Kimi 与 kimi2.7code 两轮外部评审（详见[附录 L](./development-plan/appendices.md#附录-l外部评审汇总与信息纠正v52-新增)）+ 故事时间线变体系统设计文档。主要变更：
> - 修正 README 测试数据口径（"5800+" → "4800+ 单元测试"，三体系分项见[附录 L.2 测试体系口径澄清](./development-plan/appendices.md#l2-测试体系口径澄清纠正5800-tests误传)）
> - 修复 sync/MODULE.md 的 getDeviceId 公共 API 不一致 warning
> - 调整 ESLint 配置：测试文件放宽阈值（max-lines-per-function 300 / max-depth 5 / complexity 25），lint warning 从 349 降至 263
> - 修复 24 个失败测试（C 类 sqlite-core fetch mock 生命周期 + D 类 video-cache file-http mock）
> - 新增 Task 4.9 增强：空状态组件库 + 微动效规范 + 加载骨架屏 + 错误状态插画（基于 Kimi UI 评价 85/100）
> - **新增 Phase 4.6：故事时间线变体系统**（8 个 Task，20-30 天）— 架构级创新，把角色/场景状态升级为"剧情时间线的函数"，包含状态推演引擎、级联更新、TimelineBinding 注入、时间线编辑器 UI、增强 Prompt 合成、多时间线支持
> - 同步 story-pipeline-design.md 到 v1.2：补全故事结构分析、节奏规划、三档模式、StalenessTracker 联动机制；角色重要性升级为多维权重；Prompt 合成升级为分层式；数据模型补全 Shot/SubShot/Asset；UI 补充空状态与微动效
> - 新增技术债 W6/W7：记录 complexity 重灾区（shared-logic/story 等 5 文件）和大文件（messages.ts 2662 行等）
> - 修正附录 J.5 验证状态为 2026-07-05 实测权威数据
> - 新增[附录 L.6 信息表达权威表述](./development-plan/appendices.md#l6-信息表达权威表述纠正历史不准确) 信息表达权威表述表，固化 8 项关键指标避免后续文档过时
>
> **v5.1 更新**：整合豆包 AI 外部评审建议（详见[附录 I](./development-plan/appendices.md#附录-i豆包外部评审与改进建议清单)）。主要变更：
> - **路由分隔**：现有 `/story`（实为分镜页）迁移到 `/storyboard`，新增 `/story` 作为故事创作流水线入口（对应 design-preview.html 的 page-story）
> - **新增 novel 模块**：承载故事创作流水线（小说导入、章节分割、叙事 beats、节奏规划等），与现有 story 模块（分镜管理）完全分隔
> - **新增 Phase 2A 实施架构章节**：明确 21 条建议的"新页面开发"vs"现有功能升级"分类、模块边界、Task 归属、实施顺序
> - Phase 2A 新增 4 个 Task：故事结构分析（2A.13）、节奏规划引擎（2A.14）、故事概览视图（2A.15）、新手引导与三档模式（2A.16）
> - Task 2A.1 PipelineConfig 扩展 `aiAssistLevel`（auto/semi/manual 三档）
> - Task 2A.2 match-entities 补充角色别名系统 + 本地向量小模型（all-MiniLM）
> - Task 2A.6 步骤指示器改为"模块式"而非线性 wizard；右栏改为上下文感知 AI 副驾驶
> - Task 2A.10 角色变体补充场景变体过渡效果 + 场景状态字段
> - Task 2B.11 补充场景变体与镜头语言联动（紧张氛围用手持镜头，宁静氛围用固定镜头）
> - Phase 4 新增 Task 4.10（Shot/SubShot 实体）+ Task 4.11（Asset 独立资产表）+ Phase 4.6（故事时间线变体系统）
> - 角色重要性从纯频率升级为多维权重（频率40% + 叙事功能30% + 情感20% + 手动10%）
> - Prompt 合成从"一段式"升级为"分层式"（核心层 + 增强层 + 风格层）
> - 新增[附录 I](./development-plan/appendices.md#附录-i豆包外部评审与改进建议清单)：豆包外部评审与改进建议清单（21 条建议，含采纳状态与实施位置）
>
> **v5.0 更新**：基于"先 UI 重置、再功能扩展"原则重构流程。UI 重置前置为 Step 0，Phase 0 精简为仅 CSS Token + 主题切换。未来规划从 7 Phase 拆为 10 Phase，每个 Phase 职责单一、依赖清晰、可独立验收。新增网页基础设施独立 Phase（P4.5），节点化工作流提前（不依赖网页版），插件市场/移动端/音效轨拆分为独立 Phase。
> **v4.0 更新**：基于2026年AI视频市场分析（AniShort近亿融资/日流水3200万/抖音漫剧757亿播放）重新调整优先级。

---

## 文档导航

> **本主文档仅作为大纲与导航。** 详细 Task 内容按主题拆分到以下 4 个子文件（phase-polish.md / phase-agent.md 已归档至 `./archive/`）：

| 子文件 | 涵盖范围 | 预估工期 | 适用场景 |
|--------|---------|---------|---------|
| [phase-ui-foundation.md](./development-plan/phase-ui-foundation.md) | Step 0 引用 + Phase 0 + Phase 1 + Phase 2A + Phase 2B | 约 100-150 天 | UI 重置 / Agent 基础 / 故事流水线 |
| [phase-web.md](./development-plan/phase-web.md) | Phase 4.5 + Phase 4.6 + Phase 5 | 约 55-75 天 | 网页基础设施 / 时间线变体 / 网页版 |
| [phase-future.md](./development-plan/phase-future.md) | Phase 6 + Phase 7 + Phase 8 + Phase 9 + Phase 10 | 约 95-130 天 | 模板市场 / 节点化 / 协作 / 插件 / 移动端 |
| [appendices.md](./development-plan/appendices.md) | 附录 A-L | — | 工具清单 / 风险 / 数据模型 / 评审汇总 |

**阅读建议**：
- 新会话恢复上下文 → 读本文件 TL;DR + Gantt 图 + 目录
- 实施具体 Task → 跳转到对应子文件
- 查询工具/数据模型/风险 → 直接查 [appendices.md](./development-plan/appendices.md)
- 查询外部评审与口径修正 → 查 [附录 I](./development-plan/appendices.md#附录-i豆包外部评审与改进建议清单) 与 [附录 L](./development-plan/appendices.md#附录-l外部评审汇总与信息纠正v52-新增)

---

## TL;DR（AI 启动摘要）

> **市场背景（2026）**：AI短剧日流水3200万+，抖音漫剧年播放757亿，AniShort近亿融资，市场规模240亿。竞品标配：一键成片 + 角色锁定 + 云端SaaS。PrismCraft的差异化：本地优先 + 13模型 + 开源 + 精细元素绑定。

```
总工期: 约253.5-365.5天（v5.4 新增 Task 2A.20/2A.21/2A.22/2A.23 + 29.5 天；v5.3 新增 Task 1.12/2A.18/2A.19/4.12 + 5 项 Task 增强；14个Phase含 2A/2B 拆分 + 4.5/4.6 新增；Step 0 UI 重置已提前完成）

✅ Step 0 (已完成): UI 重置 — 以 design-preview.html 为标准重写全部 UI（批次 1-9，详见 ui-migration-plan.md）
                  → 7 主页面分层 + shadcn 清理 + 5 套主题 + 188 颜色清零 + 全面 UX 打磨
                  → 遗留可选收尾：3 个路由重命名 + /projects 新建（不阻塞下游）

──── v1.0 发布前打磨（基于现有功能）────
Phase 0.5 (5-7天):  v1.0 发布前全面打磨 — 修复分镜页面布局 + 3 项 P0 隐患 + 9 项 P1 反人类设计 + ComingSoon 清理 ✅ Task 0.5.1-0.5.6 已完成 ✅ v1.0.0 已发布（2026-07）
                    → 不新增功能，仅修复现有问题，为 v1.0 发布做准备
                    → 用户反馈已知问题：分镜引用挤压 + 编辑/预览上下结构
                    → Task 0.5.7-0.5.9（CHANGELOG + 贡献者文档 + 最终验收）已随 v1.0.0 完成发布

──── 核心功能（基于现有功能扩展）────
Phase 0 (4-6天):   CSS Token 统一 + 亮暗主题切换（品牌首页已在 UI 重置中完成）
Phase 1 (48-58天):  Agent Loop(主进程) + IPC streaming(4通道) + 8个基础工具 + 会话持久化 + 悬浮球（✅ 已实现，实际 154 工具，20 域）
                    <!-- v5.3 增强：Task 1.1 增强（意图路由集成）+ Task 1.4 增强（Skill 路由 + 安全改写）+ 新增 Task 1.12（意图路由表 + Skill Registry） -->
                    <!-- 工具计数说明：Phase 1 基础工具 8 个（3 通用 + 5 系统诊断），Phase 4 在此基础上新增 18 个（10 生成类 + 8 素材类），共计 26 个。详见附录 A。 -->
Phase 2A (69.5-81.5天): 一键成片管道（三档渐进式流水线：quick 3步 / standard 6步 / professional 8步）+ 角色一致性强化（LoRA/IP-Adapter）+ 角色变体 + 一致性 QC 闭环
                    <!-- v5.3 增强：Task 2A.13 增强（treatment + shot contract）+ Task 2A.14 增强（角色化产出）+ 新增 Task 2A.18（连续性账本）+ 新增 Task 2A.19（半自动/全自动工作流） -->
                    <!-- v5.4 增强：新增 Task 2A.20（Seedance 2.5 模型注册）+ Task 2A.21（3D 白盒预览编辑器 blockout-3d）+ Task 2A.22（局部重绘编辑 partial-edit）+ Task 2A.23（一致性 QC 闭环 consistency-qc，Kimi 洞察） -->
                    P0优先级
Phase 2B (20-28天): 四栏分镜编辑器 + 元素绑定扩展 + 任务管理重构（与 2A 并行）

Phase 3 (10-14天): Storybook + Stryker + 覆盖率 + 模型能力自适应优化（Task 3.2: 能力系统统一 + 过滤下沉 + 保守默认值 + 一致性测试）
Phase 4  (37-47天):  Agent 完整版(26工具 = Phase 1 基础 8 + Phase 4 生成类 10 + Phase 4 素材类 8) + 后处理工具链（字幕+配音+转场+导出）+ 视频合成（✅ 已完成，v1.3.0，Task 4.1-4.12 全部交付）
                    <!-- v5.3 增强：Task 4.7 增强（Prompt 配方库升级为完整 Skill 体系）+ 新增 Task 4.12（IP 安全改写 + 误报修复） -->

──── 未来规划（v5.0 拆分重构 + v5.2 新增）────
Phase 4.5 (15-20天): 网页基础设施 — DB迁移(SQLite→PostgreSQL) + 认证系统 + 文件存储(S3/OSS) + 服务器部署
                     → 从原 P5 拆出，与 P4 可部分并行，为网页版铺路
Phase 4.6 (20-30天): 故事时间线变体系统（v5.2 新增）— 8 个 Task — 状态推演引擎 + 级联更新 + TimelineBinding + 时间线编辑器 UI + 滑动窗口（治理状态爆炸）✅ 已完成（Q3-1~Q3-10 全部完成）
                     → 架构级创新，把角色/场景状态升级为"剧情时间线的函数"，解决跨片段一致性
                     → 三层快照架构（Pinned 标注 + Active 滑动窗口 + DiffOnly 引用），内存减少 > 85%
                     → 依赖 P2A + P4，可与 P4.5 部分并行
Phase 5  (20-25天): 网页版上线 — 浏览器即用，用户自备 API Key，无 GPU 成本
                     → 依赖 P4.5
Phase 6  (20-25天): 模板市场 — 风格模板/角色模板/剧本模板，桌面+网页同步，创作者分成
                     → 依赖 P5
Phase 7  (20-25天): 节点化工作流 — 可视化节点编辑器（React Flow），不依赖网页版，桌面版独立
                     → 依赖 P4（Agent 完整工具链）
Phase 8  (25-35天): 团队协作 — 实时协同+版本快照+审批流，对标 AniShort
                     → 依赖 P5（网页版）
Phase 9  (15-20天): 插件市场 — 社区插件浏览/安装/评分，开发者发布
                     → 依赖 P4，可与 P8/P10 并行
Phase 10 (15-20天): 移动端 + 音效轨 — PWA 查看/预览 + BGM 库 + AI 配音
                     → 依赖 P4，可与 P8/P9 并行

并行机会: Step 0∥Phase 0, Phase 0∥Phase 1.1-1.4, Phase 2A∥Phase 2B, P4∥P4.5(部分), P8∥P9∥P10
关键依赖: P1→P2A(管道依赖Agent), P4→P4.5(部分), P4.5→P5(网页版), P5→P8(协作依赖网页版), P4→P7(节点化依赖Agent), Task 2A.22→Task 2A.23(face-swap fallback), Task 2A.21↔Task 2A.23(白模作为一致性锚点)
挡路风险: Task 1.0 (ITextProvider流式改造) 必须在 Agent Loop 之前完成（✅ 已完成）
依赖安装: 见附录F，在对应Phase开始前一次性装完
借鉴来源: seedance-2.0 仓库（MIT）工程方法借鉴，详见 docs/archive/seedance-integration-notes.md
```

---

## 目录

> **配套文档**：[`ui-migration-plan.md`](./ui-migration-plan.md) — UI 重置计划，Step 0 ✅ 已完成。
> **配套设计文档**：[`story-pipeline-design.md`](./story-pipeline-design.md) — 故事创作流水线设计 v1.2 / [`timeline-variant-design.md`](./timeline-variant-design.md) — 故事时间线变体系统设计 v1.0

### 主流程 Phase（按执行顺序）

- [Step 0：UI 重置 ✅ 已完成](./development-plan/phase-ui-foundation.md#step-0ui-重置--已完成) — 详见 [ui-migration-plan.md](./ui-migration-plan.md)
- [Phase 0.5：v1.0 发布前打磨](./archive/phase-polish.md) — 分镜布局修复 + P0 隐患 + P1 反人类设计 + ComingSoon 清理
- [Phase 0：CSS Token 统一 + 主题切换](./development-plan/phase-ui-foundation.md#phase-0css-token-统一--主题切换)
- [Phase 1：Agent 基础设施](./development-plan/phase-ui-foundation.md#phase-1agent-基础设施)
- [Phase 2A：一键成片管道 + 角色一致性强化](./development-plan/phase-ui-foundation.md#phase-2a一键成片管道--角色一致性强化p0)
  - [Phase 2A 实施架构（v5.1 新增）](./development-plan/phase-ui-foundation.md#phase-2a-实施架构v51-新增)
- [Phase 2B：四栏分镜编辑器 + 任务管理重构](./development-plan/phase-ui-foundation.md#phase-2b改进方案--四栏分镜编辑器--任务管理重构)
- [Phase 3：架构升级（测试 + 覆盖率）](./archive/phase-agent.md#phase-3架构升级测试--覆盖率)
- [Phase 4：Agent 完整版 + 后处理工具链](./archive/phase-agent.md#phase-4agent-完整版--后处理工具链p1)

### 网页版与时间线变体（v5.0/v5.2 拆分新增）

- [Phase 4.5：网页基础设施](./development-plan/phase-web.md#phase-45网页基础设施p0--新增)
- [Phase 4.6：故事时间线变体系统（v5.2 新增）](./development-plan/phase-web.md#phase-46故事时间线变体系统v52-新增)
- [Phase 5：网页版上线](./development-plan/phase-web.md#phase-5网页版上线p0--新增)

### 未来规划（v5.0 拆分重构）

- [Phase 6：模板市场](./development-plan/phase-future.md#phase-6模板市场p1--新增)
- [Phase 7：节点化工作流](./development-plan/phase-future.md#phase-7节点化工作流p1--新增)
- [Phase 8：团队协作](./development-plan/phase-future.md#phase-8团队协作p2--新增)
- [Phase 9：插件市场](./development-plan/phase-future.md#phase-9插件市场p2--新增)
- [Phase 10：移动端 + 音效轨](./development-plan/phase-future.md#phase-10移动端--音效轨p3--新增)

### 附录（全部位于 [appendices.md](./development-plan/appendices.md)）

- [附录 A：完整工具清单](./development-plan/appendices.md#附录-a完整工具清单)
- [附录 B：Agent 能力全景图](./development-plan/appendices.md#附录-bagent-能力全景图)
- [附录 C：验证命令速查](./development-plan/appendices.md#附录-c验证命令速查)
- [附录 D：文件冲突矩阵](./development-plan/appendices.md#附录-d文件冲突矩阵)
- [附录 E：Architecture Decision Records](./development-plan/appendices.md#附录-earchitecture-decision-records)
- [附录 F：依赖安装清单](./development-plan/appendices.md#附录-f依赖安装清单)
- [附录 G：风险清单](./development-plan/appendices.md#附录-g风险清单)
- [附录 H：故事创作流水线数据模型](./development-plan/appendices.md#附录-h故事创作流水线数据模型)
- [附录 I：豆包外部评审与改进建议清单](./development-plan/appendices.md#附录-i豆包外部评审与改进建议清单)
- [附录 J：技术债清单](./development-plan/appendices.md#附录-j技术债清单)
- [附录 K：功能联动数据流图（v5.1 新增）](./development-plan/appendices.md#附录-k功能联动数据流图v51-新增)
- [附录 L：外部评审汇总与信息纠正（v5.2 新增）](./development-plan/appendices.md#附录-l外部评审汇总与信息纠正v52-新增)

---

## 架构总览图

### Agent Loop 数据流

```
┌─────────────────────────────────────────────────────┐
│                   主进程 (Main Process)               │
│                                                      │
│  ┌──────────┐    ┌───────────┐    ┌──────────────┐  │
│  │ 用户消息  │───→│ Agent Loop│───→│ ITextProvider │  │
│  │ (来自IPC) │    │           │    │ generateText  │  │
│  └──────────┘    │  ┌────┐   │    │ Stream()      │  │
│                  │  │推理│←──│    └──────────────┘  │
│                  │  └────┘   │                      │
│                  │    │      │    ┌──────────────┐  │
│                  │    ↓      │───→│ Tool Registry │  │
│                  │ tool_call │    │ (工具执行)     │  │
│                  │    │      │←───│               │  │
│                  │    ↓      │    └──────────────┘  │
│                  │  结果回填  │                      │
│                  └───────────┘                      │
│                       │ IPC streaming (agent:stream)         │
└───────────────────────┼─────────────────────────────┘
                        │
┌───────────────────────┼─────────────────────────────┐
│              渲染进程 (Renderer Process)              │
│                       ↓                              │
│  ┌──────────────────────────────────────────────┐   │
│  │              AgentPanel (UI)                  │   │
│  │  ┌────────────────┐  ┌─────────────────────┐ │   │
│  │  │  AgentChat     │  │  ToolCallCard       │ │   │
│  │  │  (流式消息)     │  │  (工具结果卡片)      │ │   │
│  │  └────────────────┘  └─────────────────────┘ │   │
│  └──────────────────────────────────────────────┘   │
│                       │                              │
│                       │ agent:renderer-tool (IPC, 双向)      │
│                       ↓                              │
│  ┌──────────────────────────────────────────────┐   │
│  │  ToolRunner (渲染进程工具执行)                  │   │
│  │  → @/modules/character  (角色CRUD)            │   │
│  │  → @/modules/scene      (场景CRUD)            │   │
│  │  → @/modules/novel/tools (Novel工具)           │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### Novel Import Pipeline

```
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│ 上传文本  │→│ AI分段   │→│ 用户选段  │→│ 提取角色  │
│ (Step 1) │  │ (Step 2) │  │ (Step 3) │  │ +场景     │
└──────────┘   └──────────┘   └──────────┘   │ (Step 4)  │
                                              └─────┬────┘
                                                    ↓
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│ 导入故事  │←│ 生成提示词│←│ 分镜拆解  │←│ 实体匹配  │
│ 系统      │  │ (Step 7) │  │ (Step 6) │  │ (Step 5)  │
└──────────┘   └──────────┘   └──────────┘   └──────────┘

半自动模式: 每步完成后暂停→用户编辑→确认→下一步
全自动模式: 仅在 Step 3(选段)+Step 5(角色冲突)暂停确认
```

### Phase 时间线 (Gantt)

```mermaid
gantt
    title PrismCraft 开发计划 v5.2
    dateFormat  YYYY-MM-DD
    axisFormat  %m/%d

    section Step 0 ✅
    UI 重置 (design-preview.html 标准) :crit, s0, 2026-06-12, 25d, done

    section Phase 0.5
    v1.0 发布前打磨 (分镜布局+P0+P1修复) :crit, p05, 2026-07-06, 6d

    section Phase 0
    CSS Token审计+扩展+替换 :p0a, 2026-06-12, 3d
    微渐变背景 :p0b, after p0a, 1d
    主题切换 :p0c, 2026-06-12, 2d

    section Phase 1
    ITextProvider流式改造 :p1_0, 2026-06-12, 3d
    Agent Loop核心(含意图路由集成v5.3) :p1_1, after p1_0, 7d
    Tool Registry+IPC通道+Prompt(含Skill路由v5.3) :p1_2, after p1_1, 8d
    %% ✅ Agent Loop核心 + Tool Registry+IPC通道+Prompt 已实现（v1.2.0，实际 154 工具，20 域）
    Agent UI面板 :p1_5, after p1_2, 5d
    通用工具3个 :p1_6a, after p1_2, 3d
    系统诊断工具5个 :p1_6b, after p1_6a, 5d
    API配置工具 :p1_api, after p1_6b, 2d
    跨进程工具桥接 :p1_7, after p1_6a, 3d
    会话持久化 :p1_8, after p1_2, 3d
    Token追踪+主动干预 :p1_9, after p1_6b, 4d
    意图路由表+SkillRegistry(v5.3新增) :p1_12, after p1_9, 4d

    section Phase 2A
    大文本分块 :p2a0, after p1_12, 2d
    Domain类型 :p2a1, after p2a0, 2d
    Novel工具6个 :p2a2, after p2a1, 5d
    Pipeline状态机 :p2a3, after p2a2, 2d
    UI Panel Part 1 :p2a4, after p2a3, 3d
    UI Panel Part 2 :p2a5, after p2a4, 3d
    首页集成 :p2a6, after p2a5, 1d
    故事结构分析+节奏规划(含treatment+shot contract v5.3) :p2a13, after p2a6, 8d
    故事概览+三档模式 :p2a16, after p2a13, 5d
    道具库模块 :p2a8, after p2a6, 3d
    全局编译器 :p2a9, after p2a8, 3d
    角色变体系统 :p2a10, after p2a9, 3d
    Element Binding扩展 :p2a11, after p2a6, 2d
    StalenessTracker基础 :p2a17, after p2a11, 3d
    连续性账本(v5.3新增) :p2a18, after p2a17, 4d
    半自动全自动工作流(v5.3新增) :p2a19, after p2a18, 3d
    Seedance2.5模型注册(v5.4新增) :p2a20, after p2a19, 2d
    3D白盒预览编辑器blockout-3d(v5.4新增) :p2a21, after p2a20, 14d
    局部重绘编辑partial-edit(v5.4新增) :p2a22, after p2a20, 8d
    一致性QC闭环consistency-qc(v5.4新增Kimi洞察) :p2a23, after p2a22, 6d

    section Phase 2B(并行)
    改进项1-9 :p2b_1, 2026-06-12, 22d
    四栏分镜编辑器 :p2b11, 2026-06-12, 5d
    任务管理UI重构 :p2b10, 2026-06-12, 6d

    section Phase 3
    Storybook+Stryker :p3a, after p2a10, 7d
    覆盖率+锁依赖+配置合并 :p3b, after p3a, 7d
    模型能力自适应优化(Task3.2) :p3c, after p2a10, 4d

    section Phase 4
    生成类工具10个 :p4a1, after p3b, 5d
    素材+知识库工具8个 :p4a2, after p4a1, 3d
    Shot+SubShot+Asset实体 :p4_10, after p4a2, 4d
    视频片段合成 :p4b1, after p4_10, 3d
    分镜对比视图 :p4b2, after p4b1, 3d
    简单图片编辑 :p4c1, after p4b2, 2d
    素材搜索 :p4c2, after p4c1, 2d
    Prompt配方库+Few-Shot(含完整Skill体系v5.3) :p4d1, after p4c2, 6d
    跨镜一致性自动修复 :p4d2, after p4d1, 2d
    IPS安全改写+误报修复(v5.3新增) :p4d4, after p4d2, 4d
    整体UI体验打磨 :p4d3, after p4d4, 3d

    section Phase 4.5
    DB迁移+认证系统 :p45a, after p4a2, 8d
    文件存储+服务器部署 :p45b, after p45a, 7d

    section Phase 4.6 ✅
    状态推演引擎 :p46a, after p2a17, 5d, done
    时间线编辑器UI :p46b, after p46a, 5d, done
    TimelineBinding+级联更新 :p46c, after p46b, 5d, done
    滑动窗口优化 :p46d, after p46c, 5d, done

    section Phase 5
    网页版上线 :p5a, after p45b, 20d

    section Phase 6
    模板市场 :p6a, after p5a, 22d

    section Phase 7
    节点化工作流 :p7a, after p4d3, 22d

    section Phase 8
    团队协作 :p8a, after p5a, 30d

    section Phase 9
    插件市场 :p9a, after p4d3, 18d

    section Phase 10
    移动端+音效轨 :p10a, after p4d3, 18d
```

---

## Phase 概要表

> 详细 Task 内容请点击对应"详情"链接跳转到子文件。

| Phase | 工期 | 优先级 | 核心交付 | 详情 |
|-------|------|--------|---------|------|
| **Step 0** | ✅ 已完成 | P0 | UI 重置（design-preview.html 标准，批次 1-9） | [phase-ui-foundation.md](./development-plan/phase-ui-foundation.md#step-0ui-重置--已完成) / [ui-migration-plan.md](./ui-migration-plan.md) |
| **Phase 0.5** | 5-7 天 | P0 | v1.0 发布前打磨 — 分镜布局修复 + 3 项 P0 隐患 + 9 项 P1 反人类设计 + ComingSoon 清理 | [phase-polish.md](./archive/phase-polish.md) |
| **Phase 0** | 4-6 天 | P0 | CSS Token 统一 + 主题切换 | [phase-ui-foundation.md](./development-plan/phase-ui-foundation.md#phase-0css-token-统一--主题切换) |
| **Phase 1** | 48-58 天 | P0 | Agent Loop + IPC streaming + 8 个基础工具 + 会话持久化 + 意图路由（v5.3）（✅ 已实现，实际 154 工具，20 域） | [phase-ui-foundation.md](./development-plan/phase-ui-foundation.md#phase-1agent-基础设施) |
| **Phase 2A** | 69.5-81.5 天 | P0 | 一键成片管道（三档模式）+ 角色一致性 + 角色变体 + treatment/shot contract + 连续性账本（v5.3）+ Seedance 2.5（v5.4：3D 白盒 + 局部重绘 + 一致性 QC 闭环） | [phase-ui-foundation.md](./development-plan/phase-ui-foundation.md#phase-2a一键成片管道--角色一致性强化p0) |
| **Phase 2B** | 20-28 天 | P0 | 四栏分镜编辑器 + 元素绑定扩展 + 任务管理重构 | [phase-ui-foundation.md](./development-plan/phase-ui-foundation.md#phase-2b改进方案--四栏分镜编辑器--任务管理重构) |
| **Phase 3** | 10-14 天 | P1 | Storybook + Stryker + 覆盖率 + 模型能力自适应优化（Task 3.2） | [phase-agent.md](./archive/phase-agent.md#phase-3架构升级测试--覆盖率) |
| **Phase 4** | 37-47 天 | P1 | Agent 完整版（26 工具）+ 后处理工具链 + 视频合成 + IP 安全改写（v5.3）（✅ 已完成，v1.3.0） | [phase-agent.md](./archive/phase-agent.md#phase-4agent-完整版--后处理工具链p1) |
| **Phase 4.5** | 15-20 天 | P0 | DB 迁移 + 认证系统 + 文件存储 + 服务器部署 | [phase-web.md](./development-plan/phase-web.md#phase-45网页基础设施p0--新增) |
| **Phase 4.6** | 20-30 天 | P1 | 故事时间线变体系统（8 个 Task）— 状态推演引擎 + 级联更新（✅ 已完成，Q3-1~Q3-10） | [phase-web.md](./development-plan/phase-web.md#phase-46故事时间线变体系统v52-新增) |
| **Phase 5** | 20-25 天 | P0 | 网页版上线 — 浏览器即用，用户自备 API Key | [phase-web.md](./development-plan/phase-web.md#phase-5网页版上线p0--新增) |
| **Phase 6** | 20-25 天 | P1 | 模板市场 — 风格/角色/剧本模板，创作者分成 | [phase-future.md](./development-plan/phase-future.md#phase-6模板市场p1--新增) |
| **Phase 7** | 20-25 天 | P1 | 节点化工作流 — 可视化节点编辑器（React Flow） | [phase-future.md](./development-plan/phase-future.md#phase-7节点化工作流p1--新增) |
| **Phase 8** | 25-35 天 | P2 | 团队协作 — 实时协同 + 版本快照 + 审批流 | [phase-future.md](./development-plan/phase-future.md#phase-8团队协作p2--新增) |
| **Phase 9** | 15-20 天 | P2 | 插件市场 — 社区插件浏览/安装/评分 | [phase-future.md](./development-plan/phase-future.md#phase-9插件市场p2--新增) |
| **Phase 10** | 15-20 天 | P3 | 移动端 + 音效轨 — PWA + BGM 库 + AI 配音 | [phase-future.md](./development-plan/phase-future.md#phase-10移动端--音效轨p3--新增) |

**总计**：14 个 Phase + Step 0，约 253.5-365.5 天（v5.4 新增 4 个 Task + 29.5 天；v5.3 新增 4 个 Task + 5 项 Task 增强）

---

## 关键依赖关系

```
✅ Step 0 (UI 重置已完成) ──→ Phase 0 (CSS Token)
                              ↓
                          Phase 1 (Agent 基础) ─→ Phase 2A (故事流水线) ─┐
                                                                          ├─→ Phase 3 ─→ Phase 4 ─┬─→ Phase 4.5 ─→ Phase 5 ─┬─→ Phase 6
                          Phase 2B (四栏分镜) ────────────────────────────┘                          │                         ├─→ Phase 8
                                                                                                      ├─→ Phase 4.6             └─→ Phase 5 (依赖)
                                                                                                      ├─→ Phase 7
                                                                                                      ├─→ Phase 9
                                                                                                      └─→ Phase 10
```

**v5.4 Phase 2A 内部依赖（Seedance 2.5 + 一致性 QC）**：
```
Task 2A.20 (Seedance 2.5 模型注册)
   ├─→ Task 2A.21 (3D 白盒预览编辑器)  ──┐
   ├─→ Task 2A.22 (局部重绘编辑)  ──────┤
   │                                    ├─→ Task 2A.23 (一致性 QC 闭环)
   └─→ Task 2A.19 (半自动/全自动工作流) ─┘
                                     ↑
              现有 local-embedding + vector-search (基础设施复用)
```
- Task 2A.21 ↔ Task 2A.23：白模 animatic 作为一致性锚点（novel-view 引导）
- Task 2A.22 → Task 2A.23：face-swap fallback 作为超差帧修复路径
- Task 2A.23 → Task 2A.19：QC 不通过触发自动重生成（受 maxRegenerateAttempts 限制）

**关键路径**：Phase 1 → Phase 2A → Phase 3 → Phase 4 → Phase 4.5 → Phase 5 → Phase 6/8

**并行机会**：
- ~~Step 0 ∥ Phase 0~~（Step 0 已完成）
- Phase 0 ∥ Phase 1.1-1.4
- Phase 2A ∥ Phase 2B
- Phase 4 ∥ Phase 4.5（部分）
- Phase 8 ∥ Phase 9 ∥ Phase 10
- Task 2A.21 ∥ Task 2A.22（v5.4 新增，两者都依赖 2A.20 但相互独立）

---

## 配套文档索引

| 文档 | 用途 | 状态 |
|------|------|------|
| [ui-migration-plan.md](./ui-migration-plan.md) | Step 0 UI 重置详细计划 | v1.0 |
| [story-pipeline-design.md](./story-pipeline-design.md) | 故事创作流水线设计 v1.2 | v1.2（同步 v5.2） |
| [novel-pipeline-guide.md](./novel-pipeline-guide.md) | Novel 故事创作流水线实施指南（Phase 2A 已完成） | v1.0 |
| [timeline-variant-design.md](./timeline-variant-design.md) | 故事时间线变体系统设计 v1.0 | v1.0 |
| [timeline-implementation.md](./timeline-implementation.md) | 时间线变体系统实施指南（Phase 4.6 Q3-1~Q3-10 已完成） | v1.0 |
| [MODULES.md](./MODULES.md) | 模块全景图（42 个模块） | v1.0 |
| [agent-tools-architecture.md](./agent-tools-architecture.md) | Agent 工具架构（154 工具 / 20 域） | v1.0 |
| [archive/seedance-integration-notes.md](./archive/seedance-integration-notes.md) | seedance-2.0 借鉴来源与映射（v5.3 新增，已归档） | v1.0 |
| [archive/phase-polish.md](./archive/phase-polish.md) | Phase 0.5 v1.0 发布前打磨详细 Task（已归档） | v5.2 |
| [development-plan/phase-ui-foundation.md](./development-plan/phase-ui-foundation.md) | Phase 0/1/2A/2B 详细 Task | v5.4 |
| [archive/phase-agent.md](./archive/phase-agent.md) | Phase 3/4 详细 Task（已归档） | v5.3 |
| [development-plan/phase-web.md](./development-plan/phase-web.md) | Phase 4.5/4.6/5 详细 Task | v5.2 |
| [development-plan/phase-future.md](./development-plan/phase-future.md) | Phase 6-10 详细 Task | v5.2 |
| [development-plan/appendices.md](./development-plan/appendices.md) | 附录 A-L（工具/风险/数据模型/评审） | v5.4 |

---

## 文档版本与维护

- **当前版本**：v5.4
- **拆分日期**：2026-07-05
- **拆分前大小**：365KB / 7082 行（单文件）
- **拆分后大小**：本主文档约 28KB + 4 个子文件共约 320KB（按主题分布；phase-polish.md / phase-agent.md 已归档至 `./archive/`）
- **维护原则**：
  - 主文档：仅维护 TL;DR / Gantt / 目录 / Phase 概要表 / 关键依赖
  - 子文件：维护对应 Phase 的详细 Task 内容
  - 附录：所有附录集中在 `appendices.md`，避免重复
  - 修复口径冲突时，需同步更新主文档 TL;DR + 相关子文件 + 附录 L.6 权威表述表

> **拆分原因**：原 365KB 单文档超出 AI 工具上下文预算，大部分规则对当前任务无用。拆分后按需加载对应子文件，节省上下文。
