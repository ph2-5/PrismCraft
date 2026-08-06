# PrismCraft 本地项目优化方向规划（v2）

> **生成时间**: 2026-08-02（v2 修订）
> **基线**: main 分支 `6322d3d`（feat(novel+phase3): 角色管理重构 + 流程灵活性 + Task 3.1 Storybook/Stryker 配置）
> **来源**: 基于会话 `6a6707cd9d35f6e35f5c3962` 的完整内容分析（90 条消息，11694 行，323.9 KB）
> **本地状态**: 会话中 AI 在远程沙盒 `feature/story-shot-enhancements` 分支实施的 13 个文件改动未同步到本地；本地 P0 阶段 1 修复已完成 4 项（race condition + 2 处 localStorage + CI Python 环境），未提交
> **v2 修订说明**: 补充 11 项遗漏内容，修正 4 项理解错误

---

## 一、本地项目现状验证

### 1.1 已确认存在的问题（本地验证）

| 问题 | 文件 | 验证结果 |
|---|---|---|
| `withGenerationState` race condition | `src/modules/storyboard/generation/hooks/use-ai-generator-base.ts:121-157` | ✅ 本地存在，`finally` 块会误删新启动的 controller |
| Sync 模块直接读写 localStorage | `src/modules/sync/engine/changelog.ts:27,42` | ✅ 本地存在 |
| file-storage-factory 访问 window.localStorage | `src/infrastructure/storage/file-storage-factory.ts` | ✅ 本地存在 |
| ErrorBoundary 直接操作 localStorage | `src/shared/presentation/ErrorBoundary.tsx:104` | ✅ 本地存在 |
| 缺少导演规则引擎 | `src/shared-logic/director/` | ✅ 本地不存在（会话中 AI 在远程沙盒创建） |
| 缺少模型参数适配 | `src/shared/text-generation-params.ts` | ✅ 本地不存在（会话中 AI 在远程沙盒创建） |
| 角色一致性引擎无自研视觉算法 | `src/shared-logic/shot/consistency-enhancer.ts` | ✅ 本地存在，只是参考图筛选/排序 |
| ~~agent-tools-* 模块违规（10 个文件）~~ | ~~`src/modules/agent-tools-*/`~~ | ❌ 本地已确认不存在此违规（会话中扫描结果来自远程沙盒） |

### 1.2 本地分支状态

- 当前分支: `feature/p0-cleanup`（本地新建，用于 P0 修复）
- 最新 commit: `6322d3d`
- 本地分支: `legacy-ui`, `main`, `refactor/agent-architecture`, `refactor/ddd-and-e2e-fixes`, `refactor/quality-improvements`, `temp-ui-refactor`, `分层已完成`
- 远程分支: `origin/main`, `origin/refactor/agent-architecture`, `cnb/main`, `cnb/legacy-ui`, `cnb/分层已完成`
- **会话中 AI 在远程沙盒创建的 `feature/story-shot-enhancements` 分支在本地不存在**

### 1.3 会话中 AI 在远程沙盒实施的完整改动清单（消息 90）

会话结束时，远程沙盒 `feature/story-shot-enhancements` 分支相对 `6322d3d` 共 **13 个文件变更，+585/-51**：

| 方向 | 文件 | 说明 |
|---|---|---|
| 修复竞态 | `use-ai-generator-base.ts` | `withGenerationState` 改为 `promise.finally()`，避免变量未赋值错误 |
| 情绪驱动分镜 | `shot-contract-builder.ts` | 新增 `applyEmotionAndPacingToContracts`，把情绪强度、节奏、故事结构映射到景别/运镜/时长 |
| 导演规则引擎 | `shared-logic/director/director-rules.ts` | 新建纯函数规则引擎：180 度规则、动作匹配、高潮强化、抒情远景、快速节奏 |
| 模型参数适配 | `shared/text-generation-params.ts` | 按任务类型和模型 ID 推荐 temperature/maxTokens |
| provider 接入 | `infrastructure/ai-providers/text.ts` | `generateText/generateChat/generateTextStream` 新增 `taskType` 参数 |
| 接口更新 | `domain/ports/ai-provider-port.ts` | `ITextProvider` 增加 `taskType` |
| 调用点补全 | `structure-analyzer.ts` / `treatment-extractor.ts` / `frame-prompt-service.ts` | 传入对应 `taskType` |
| 测试补充 | `director-rules.test.ts`（8 个测试）+ `text-generation-params.test.ts`（8 个测试）+ `frame-prompt-service.test.ts` | 新增 16 个测试 + 修复断言 |

**验证结果**：typecheck ✅、lint ✅（0 errors，19 个既有 warnings）、lint:arch ✅、22 files / 403 tests 通过

**会话结束时远程沙盒状态**：已提交 + 3 处未提交改动（均为测试相关），**未同步到本地**

---

## 二、会话完整内容摘要（按消息顺序）

> 本节补充 v1 遗漏的会话内容，确保规划基于完整信息。

### 2.1 消息 20-21：Traction 核心指标体系

会话中详细介绍了 4 个低成本获取 Traction 的实验方法：

| 实验 | 验证周期 | 核心做法 |
|---|---|---|
| **实验 1：开源版+商业授权页面** | 2-4 周 | GitHub 开源核心 engine，网站提供商业授权入口（个人 ¥1,999 / 团队 ¥9,999 / 企业 ¥49,999） |
| **实验 2：企业定向冷启动** | 4-8 周 | 锁定 10 家潜在 B 端客户（MCN、出版社、短剧平台），提供免费 PoC |
| **实验 3：产品案例+内容营销** | 4-12 周 | 用自己的工具生成漫剧/短剧案例，发 B 站/抖音/小红书，建立"能用出来的产品"信任 |
| **实验 4：价格敏感度测试** | 持续 | A/B 测试不同定价（¥99/¥299/¥999），观察转化率 |

**Traction 水平与估值修正表**：0 用户 → 工程资产价；10 付费用户 → +50% 溢价；100 付费用户 → 商业溢价 3-5 倍

**最该优先做的 3 件事**：
1. 在 GitHub README 加商业授权入口
2. 录 3-5 分钟 demo 视频
3. 锁定 5 个潜在用户做访谈

### 2.2 消息 26-27：项目前景分析五维度

#### 技术资产判断
- **优势**：架构成熟度（六层 DDD + DI + CQRS）、代码规模（23 万+ 行）、测试覆盖（8600+ 单元测试）、AI 集成（13+ 家 AI 厂商）、工程化（Playwright E2E、Stryker 突变测试）
- **隐忧**：技术债务（P0 race condition、localStorage 跨层违规）、Native 依赖（better-sqlite3）、Electron 包袱

#### 5 种商业模式

| 模式 | 可行性 | 说明 |
|---|---|---|
| **SaaS 订阅** | 高 | 按生成量/功能分级订阅，月付 20-100 美元 |
| **API/企业服务** | 中高 | 为 MCN、出版社、短剧平台提供私有化部署 |
| **模型分销抽成** | 中 | 通过平台调用第三方 AI 模型赚取差价 |
| **素材/模板市场** | 中 | 角色模板、故事板模板、LoRA 模型交易 |
| **一次性买断（桌面版）** | 中低 | 当前 Electron 形态可行，但天花板低 |

#### 3 阶段成功路径
1. **短期（0-12 个月）**：打磨"剧本/小说 → 短视频"工作流，积累种子用户
2. **中期（1-2 年）**：转向 SaaS，建立模板市场和社区，形成网络效应
3. **长期（2-3 年）**：B 端私有化 + 自有/微调视频模型，构建深护城河

**关键建议**：绑定 1-2 家头部视频模型厂商，建立差异化合作

### 2.3 消息 29-30：云端化接口 7 项预埋分析

项目已预埋的 7 项云端化接口：

1. **统一的 HTTP/IPC 文件与配置层**：`file-http` 封装 7 个标准函数，HTTP 优先 + IPC fallback
2. **Electron API 路由已 HTTP 化**：9 个路由组（core/db/file/generation/download/ffmpeg/plugin/shot/storyboard）
3. **SSRF 防护已具备**：DNS 解析 + 私有 IP 拦截 + 云元数据端点屏蔽 + 白名单机制
4. **AI Provider 层完全基于 HTTP**：所有 provider 通过 fetch 调用，云端化时前端不需要暴露 API Key
5. **存储层有端口抽象**：DI container 注入 storage（characterStorage/storyboardStorage/videoTaskStorage）
6. **同步模块已经存在**：向量时钟、变更日志、冲突解决、远程变更拉取
7. **用户/会话抽象**：`usePreference`、`getDeviceId()`、Agent session/conversation manager

**云端化迁移成本评估**：

| 成本等级 | 模块 | 人月 |
|---|---|---|
| **低成本** | 文件存储、配置存储、AI 调用、数据库 | 1-2 人月 |
| **中等成本** | 用户系统、权限隔离、任务队列、ffmpeg/本地工具 | 2-4 人月 |
| **高成本** | 多租户架构、计费系统、监控告警、CDN 分发 | 4+ 人月 |

### 2.4 消息 32-33：2026 年市场格局详细对比

#### 主流 AI 视频生成工具（8 个）

| 工具 | 核心特点 | 价格参考 |
|---|---|---|
| **Sora** | 物理真实感最强，1080p-4K | ~$200/月 |
| **Runway Gen-4/4.5** | 专业级 camera control、运动笔刷、VFX | ~$95/月 |
| **Kling 3.0** | 中文友好、人物动作自然、最长 3 分钟 | ¥46-266/月 |
| **Seedance 2.0（即梦）** | 字节生态、与剪映打通、中文提示词强 | ¥69/月起 |
| **Pika 2.0/3.0** | 社交化、局部修改、Lip Sync | $8-28/月 |
| **Vidu** | 电影级、二次元/写实 | 高端定价 |
| **通义万相 Wan2.7** | 4K、120 秒、开源模型 | API 按量 |
| **海螺 AI** | 情感表达、口型同步 | ¥68/月起 |

#### 短剧/网文改编全链路工具（9 个，直接竞争对手）

| 工具 | 定位 | 关键能力 |
|---|---|---|
| **泡漫（掌阅）** | 剧本→分镜→视频 + 发行 + 真人签约版权 | 全链路、IP 资源、保底分成 |
| **海艺TV** | 短剧一体化平台，节点式画布 | 首尾帧、参考图、素材库、免费基础版 |
| **小云雀（剪映）** | 剧本到成片，内置短剧 Agent | 与剪映/抖音生态打通 |
| **有戏AI** | 专业团队角色一致性 | 资产库、多角度锁定、跨模型通用 |
| **中劢AI** | 剧本工厂 + 自研算力 | 低成本、自研模型 |
| **橙星梦工厂** | 一键出海、批量量产 | 10 人团队月产 18000 集 |
| **灵境AI** | 网文→漫剧/真人剧 | 网文大数据、DIT 架构 |
| **蛙蛙写作** | 网文→剧本→漫剧视频 | 5000+ 工作流 |
| **白日梦AI** | 新手一键成片 | 输入梗概 20 秒出片 |

#### 故事板/角色一致性专门工具（5 个）

| 工具 | 核心卖点 |
|---|---|
| **Katalist AI** | 从脚本到角色一致的故事板再到完整视频 |
| **MagicLight** | 30 分钟长视频、100+ 角色库、多语言配音 |
| **DreamShot（字节/中大）** | "视频骨架，图像皮肤"，Role-Attention Consistency Loss |
| **Onestory.art** | 专业级故事板，速度较慢 |
| **Kapwing AI Storyboard** | 角色保存到品牌工具包跨项目复用 |

#### 项目在市场地图中的位置

项目落在 **"全链路工作流"** 象限，是 2026 年竞争最激烈的区域。

#### 6 项能力的特色度评分

| 项目能力 | 特色度 |
|---|---|
| 剧本/故事板 → 分镜 → 视频 | ⭐⭐ 不独特 |
| 角色/场景一致性引擎 | ⭐⭐⭐ 中等 |
| 多模型调度（13+ provider） | ⭐⭐⭐⭐ 较强 |
| Agent 工作流 | ⭐⭐⭐ 中等 |
| 桌面端本地优先 | ⭐⭐⭐⭐ 独特但小众 |
| 网文/短剧改编 | ⭐⭐ 红海 |

**结论**：不是"没有特色"，而是核心 workflow 已经是行业标配，多模型调度 + 本地优先有特色但受众面窄。

### 2.5 消息 35-36：决策框架 5 个关键问题

**5 个决策问题**：
1. **资金还能撑多久？**（< 3 个月→卖、3-6 个月→小规模验证、> 6 个月→尝试转型）
2. **是否有稳定的现金流来源？**（有→可继续做、全靠这个项目→风险极高）
3. **是否能忍受 6-12 个月不赚钱？**（不能→现在卖）
4. **是否能找到垂直细分市场的种子用户？**（找不到→没有出路）
5. **卖掉的目的是什么？**（拿钱做下一个项目→合理、彻底退出→评估心理接受度、缺钱周转→不是最佳选择）

**3 种情况的建议**：
- **情况 A**：资金紧张/有更好机会 → 现在卖（挂牌 ¥60-80 万，底价 ¥30 万）
- **情况 B**：资金尚可/找到垂直场景 → 继续做 6 个月再决定
- **情况 C**：折中方案 → 部分出售/授权（代码授权、技术入股、MVP 合作）

### 2.6 消息 38-39："没有资金只有时间"核心策略

**核心策略**：继续做，但不要幻想做平台，而是把项目做成一个"能变现的小生意"。

**4 项铁律**：
- 不做任何需要花钱的事（服务器、API 额度、广告、设计外包）
- 不碰云端 SaaS
- 不追求大而全
- 先验证变现，再扩大规模

**3 个推荐定位**：

| 定位 | 目标客户 | 收费 | 优势 |
|---|---|---|---|
| **A：网文作者的「本地漫剧生产线」** | 网文作者 | ¥99-299/年 | 本地运行稿子不外泄、一次买断 |
| **B：短剧承制团队的「离线批量生成器」** | 小团队 | 软件授权+插件 | 批量分镜、本地管理、用户自己付模型费 |
| **C：独立动画/自媒体的「AI 分镜助手」** | 自媒体 | 买断制 | 脚本到故事板快速可视化、多模型切换 |

**零成本获客路径表**（6 个渠道）：B 站/抖音/视频号、小红书、知乎/公众号、网文作者群/短剧群、GitHub/开源、Discord/微信群

**M1/M2/M3 里程碑**：
- M1：第一个付费用户（1-2 个月）
- M2：月收入 > ¥3000（3-4 个月）
- M3：月收入 > ¥10000（6-8 个月）

### 2.7 消息 41-42：现实估值表与买方视角分析

**5 类买家的可能出价表**：

| 买家类型 | 可能出价 | 原因 |
|---|---|---|
| 个人开发者/独立工作室 | ¥5-20 万 | 买代码 base，省去 3-6 个月开发时间 |
| 小型 AI 创业公司 | ¥20-80 万 | 缺工程团队，想快速补齐产品 |
| 传统行业公司做 AI 转型 | ¥30-100 万 | 看重完整 workflow 和工程化 |
| 拿到融资的 AI 视频团队 | ¥50-150 万 | 买模块、买架构、买时间 |
| 海外买家/出海团队 | $10k-80k（约 ¥7-60 万） | 买多语言、多 provider 接入的代码 base |

**估值修正过程**（会话中经历了多次修正）：
- 消息 36：¥300-800 万（假设有用户基础或团队背景，**后被修正**）
- 消息 42：快速脱手价 ¥15-40 万、理想成交价 ¥50-100 万（**修正后**）
- 消息 48：急售底价 ¥15-30 万、合理市场价 ¥30-80 万、理想价格 ¥80-150 万（**最终**）

**4 个估值低的原因**：
1. 买方视角买的是"省下的开发时间"，不是"商业机会"
2. 没有 traction = 没有商业溢价
3. "Trae 免费 AI 开发"是双刃剑（买方会质疑代码质量）
4. 赛道红海加剧折价

**7 天落地清单**：
1. 整理项目 demo 视频（3-5 分钟）
2. 写一份 1 页售卖/合作介绍
3. 在 3 个渠道挂牌测试水温（V2EX、电鸭、GitHub）
4. 同时选一个垂直定位，做最小化版本
5. 评估 2-3 个接外包的平台，准备接单

### 2.8 消息 44-48：代码深度审查的真实资产和幻灭点

#### 7 项真实资产（加分项）

| 模块 | 发现 | 价值 |
|---|---|---|
| **AI Provider 聚合层** | 支持 20+ provider | ⭐⭐⭐⭐⭐ 这是最大资产 |
| **模型能力注册表** | `model-registry.ts` 有 per-model 能力配置 | ⭐⭐⭐⭐⭐ 工程价值高 |
| **Workflow 闭环** | `beat-chain-generator.ts` 完整实现 keyframe → frame pair → video | ⭐⭐⭐⭐ |
| **视频任务状态机** | `task-machine.ts` + CQRS + 轮询 + 同步 + 去重 | ⭐⭐⭐⭐ |
| **Agent Loop** | intent routing、skill routing、few-shot、checkpoint 恢复、function calling、流式 | ⭐⭐⭐⭐ |
| **云端化预埋** | `file-http` HTTP+IPC fallback、`sync engine`、HTTP 路由、`IFileStorage`（含 S3）、`DatabaseInterface` 抽象 | ⭐⭐⭐⭐ 确实有 |
| **工程化水平** | 23 万行代码、8600+ 测试、DDD+DI、架构 lint 通过 | ⭐⭐⭐⭐ |

#### 5 项幻灭点（减分项）

| 模块 | 发现 | 影响 |
|---|---|---|
| **角色一致性引擎** | `consistency-enhancer.ts` 只是"参考图筛选/排序/策略选择"，**没有自研视觉算法** | 核心壁垒比想象弱 |
| **reference-engine** | 只是 shot 引用关系管理，没有视觉层面的匹配算法 | 不是真正的视觉一致性引擎 |
| **依赖第三方模型** | 所有角色/场景一致性最终依赖 Kling/Seedance/豆包等模型的原生能力 | 护城河浅 |
| **better-sqlite3** | 原生绑定在 CI 都跑不通，部署有坑 | 买家会砍价 |
| **AI 生成代码痕迹** | 大量注释、Task 编号、审计修复记录，说明代码主要由 AI 生成 | 买家会担心可维护性 |

**核心结论**：这不是"有自研算法的 AI 视频公司"，而是 **"工程化程度很高的 AI 视频工作流编排平台"**。

### 2.9 消息 62-63：当前策略 6 大核心问题

项目当前有两条并行的"故事 → 分镜"路径：

- **路径 A：Novel/Structure 路径**（偏分析型）：小说文本 → segment-novel-text → extract-characters/scenes → structure-analyzer → treatment-extractor → pacing-engine → shot-contract-builder
- **路径 B：Shot/Generation 路径**（偏生成型）：Story + Characters + Scenes + Elements → story-plan-prompt → dynamic-few-shot → textProvider.generateText → shot-validator → applyShotParamsAutoFix → convertToStoryBeats → frame-prompt-service → beat-chain-generator
- **路径 C：Novel Tools 路径**（偏工具型）：breakdown-text-to-shots Tool → 直接调用 AI 把文本拆成 ShotBreakdown[]

**6 大核心问题**：

1. **三条路径并存，职责边界模糊**：Novel/structure 生成的 shot contract 和 shot/generation 生成的 StoryBeat 是什么关系？breakdown-text-to-shots 和 story-generation-pipeline 都在做"文本 → 分镜"
2. **过度依赖大模型，缺少规则层**：缺少 180 度规则（越轴问题）、视线匹配、动作匹配、节奏剪辑规则
3. **Pacing 和情绪曲线没有真正驱动镜头语言**：高潮应该更多 close-up + push + 快速剪辑，但现在只是"建议时长缩短 20%"
4. **Shot Contract 和 StoryBeat 字段有重复/冲突**：shot-contract 有 shotSize/lens/movement/lighting/blocking，StoryBeat 有 shotInstruction.shotSize/cameraAngle/cameraMovement
5. **Few-shot 是静态的，没有学习机制**：示例写在代码里，不能根据用户编辑/反馈自动优化
6. **缺少"视觉连贯性"的主动规划**：当前连续性检查是事后检查，更好方式是在生成阶段就规划好角色位置、镜头轴线、动作衔接

### 2.10 消息 71-72："大胆一点"4 个方向

1. **把导演规则真正接入分镜生成 pipeline**
   - 当前 `director-rules.ts` 只影响 shot contract，下一步让它直接影响首帧/尾帧 prompt、镜头衔接、情感强度
   - 改动点：`frame-prompt-service.ts` 里读取 shot contract 和前后镜头上下文，生成带 180 度规则、动作匹配、高潮强化的 prompt

2. **做 shot contract 的可视化编辑 UI**
   - 在 storyboard 页面加一个表格/时间线，让用户直接改每个镜头的景别、运动、灯光、时长，改完实时影响后续生成
   - 改动点：新增 `ShotContractEditor` 组件 + 把 shot contract 接入 storyboard store

3. **自动故事结构 + 角色弧线分析**
   - 上传小说后自动识别三幕结构、情节点、角色成长曲线，然后自动推荐导演规则配置（比如高潮段落自动启用 climaxIntensifyRule）
   - 改动点：`structure-analyzer.ts` + 新增 `story-director-config.ts`

4. **云端化接口预研**
   - 把当前 Electron 本地 HTTP API 抽象成可切换本地/远程的 provider 层，为未来 SaaS 化留接口
   - 改动点：新增 `api-gateway` 抽象 + 远程 provider 实现

---

## 三、优化方向规划（按优先级分层）

### P0 - 紧急修复（工程债务，1-2 周）

#### P0.1 修复 `withGenerationState` race condition
- **文件**: `src/modules/storyboard/generation/hooks/use-ai-generator-base.ts:121-157`
- **问题**: `finally` 块在 `pendingPromisesRef.current.delete(beatId)` 后，如果同一 `beatId` 快速重入，新启动的 controller/promise 会被误删
- **修复方案**: 改为 `promise.finally()` 模式，确保清理逻辑只清理当前 promise 对应的 controller
- **本地状态**: ✅ 已修复（未提交）
- **预估**: 0.5 天

#### P0.2 清理 localStorage 违规（3 处）
- **文件**:
  1. `src/modules/sync/engine/changelog.ts:27,42` - 直接读写 `localStorage`
  2. `src/infrastructure/storage/file-storage-factory.ts:17-43` - 直接访问 `window.localStorage`
  3. `src/shared/presentation/ErrorBoundary.tsx:104` - 直接操作 `localStorage`
- **修复方案**: 统一改用 `@/shared/file-http` 或 `usePreference`
- **本地状态**: ✅ 3 处全部修复（未提交）
  - 第 1 处：`changelog.ts` 改用 `file-http` 的 `getConfig/setConfig`
  - 第 2 处：`file-storage-factory.ts` 异步化，改用 `file-http` 的 `getConfig/setConfig`
  - 第 3 处：`ErrorBoundary.tsx` 改用 `preferencesStorage.clearAll()`（新增的统一清理方法），避免直接访问 `localStorage`
- **理由**: 违反项目架构规则，阻碍云端化迁移
- **预估**: 1 天

#### P0.3 CI 环境修复
- **问题 1**: `better-sqlite3` 原生绑定在 CI 跑不通 → CI 安装 `python3 make g++`
- **问题 2**: E2E 测试 Playwright `chromium-headless-shell` 启动不稳定 → CI 使用 `npx playwright install --with-deps chromium`
- **问题 3**: 1 个失败测试 `delete-character-cascade.integration.test.ts` 因原生绑定缺失
- **本地状态**: ✅ Python 3 环境配置已添加（未提交）
- **预估**: 1 天

> **注**：v1 中的 P0.3 "清理 agent-tools-* 模块违规" 已删除，因为本地已确认不存在此违规（会话中扫描结果来自远程沙盒）。

---

### P1 - 高 ROI 功能改动（1-2 周）

> 这些是会话中 AI 实际在远程沙盒 `feature/story-shot-enhancements` 分支实施的 4 项高 ROI 改动，本地需要同步实施。

#### P1.1 引入导演规则引擎（会话已验证有效）
- **新建文件**: `src/shared-logic/director/director-rules.ts`
- **新建测试**: `src/shared-logic/director/__tests__/director-rules.test.ts`（8 个测试）
- **功能**: 180 度规则（越轴检测）、动作匹配、高潮强化、抒情远景、快速节奏
- **规则**: 纯函数，零外部依赖，位于 shared-logic 层
- **远程沙盒状态**: ✅ 已实施
- **预估**: 2 天

#### P1.2 情绪驱动分镜
- **修改文件**: `src/modules/novel/structure/services/shot-contract-builder.ts`
- **功能**: 新增 `applyEmotionAndPacingToContracts`，把情绪强度、节奏、故事结构映射到景别/运镜/时长
- **接入点**: shot contract 生成后、prompt 生成前
- **远程沙盒状态**: ✅ 已实施
- **预估**: 1.5 天

#### P1.3 模型参数适配
- **新建文件**: `src/shared/text-generation-params.ts`
- **新建测试**: `src/shared/__tests__/text-generation-params.test.ts`（8 个测试）
- **修改文件**:
  - `src/infrastructure/ai-providers/text.ts` - 新增 `taskType` 参数
  - `src/domain/ports/ai-provider-port.ts` - `ITextProvider` 增加 `taskType`
  - `src/modules/novel/structure/services/structure-analyzer.ts` - 传入 `taskType`
  - `src/modules/novel/structure/services/treatment-extractor.ts` - 传入 `taskType`
  - `src/modules/storyboard/generation/services/frame-prompt-service.ts` - 传入 `taskType`
- **功能**: 按任务类型（story_planning/shot_contract/frame_prompt 等）和模型 ID 推荐 temperature/maxTokens
- **远程沙盒状态**: ✅ 已实施
- **预估**: 2 天

#### P1.4 统一"故事 → 分镜"架构（部分实施）
- **目标**: 把三条路径（Novel/structure、Shot/generation、breakdown-text-to-shots）合并为一条 4 层流水线
- **分层**:
  - Layer 1 文本理解（纯规则/轻 LLM）
  - Layer 2 导演规划（规则 + LLM）← P1.1 + P1.2 在此层
  - Layer 3 画面实现（LLM + 图像生成）
  - Layer 4 后处理（规则 + LLM）
- **实施策略**:
  - 先把 `shot-contract` 作为 Layer 2 标准输出
  - `StoryBeat` 改为 `shot-contract` 的扩展
  - 废弃 `breakdown-text-to-shots` 的直接拆分
- **解决的 6 大核心问题**: 三条路径并存、过度依赖大模型、Pacing 未驱动镜头语言、字段重复/冲突、Few-shot 静态、视觉连贯性事后检查
- **预估**: 5-7 天（较大重构）

---

### P2 - 代码质量优化（2-3 周）

#### P2.1 拆分超长文件（6 个 >700 行）

| 文件 | 行数 | 拆分方向 |
|---|---|---|
| `agent-tools-web-file/web-tools.ts` | 771 | 按功能域拆分（搜索/抓取/解析） |
| `agent-memory/services/memory-service.ts` | 777 | 按职责拆分（存储/检索/过期） |
| `agent-tools-media/video-post-tools.ts` | 792 | 按工具类型拆分 |
| `agent/services/agent-loop.ts` | 736 | 按阶段拆分（规划/执行/反馈） |
| `scenes/SceneEditorParts.tsx` | 733 | 按面板拆分 |
| `settings/EmbeddingModelPanelParts.tsx` | 711 | 按表单分组拆分 |

- **预估**: 6 天（每个 1 天）

#### P2.2 拆分超长组件
- **文件**: `src/modules/agent/presentation/AgentPage.tsx:221`（328 行，超过 lint 上限 300）
- **拆分方向**: 把侧边栏、消息列表、输入框抽为独立组件
- **预估**: 1 天

#### P2.3 降低函数复杂度（2 个圈复杂度 26）
- `src/modules/compositor/services/compositor-engine.ts:205` `composeImage`
- `src/modules/novel/hooks/pipeline-helpers.ts:105` `extractAndMatchEntities`
- **方案**: 提取子函数，使用早返回
- **预估**: 1.5 天

#### P2.4 代码异味清理
- 移除 `SegmentList.stories.tsx:58-77` 的 `console.log` 残留 → 替换为 `console.debug`（6 处）
- 清理 `compositor.schema.test.ts:219-318` 未使用变量 → 重命名为 `_` 前缀（10 个变量）
- 修复 `registry.json` 版本不匹配 warning → 本地不存在此文件（历史遗留描述，无需修复）
- 替换 `version-control.ts:179-180` 的 `JSON.stringify` 深比较 → 新增 `stringArraysEqual` 结构化比较函数
- **本地状态**: ✅ 已完成（未提交）
- **验证**: typecheck ✅、lint ✅（0 errors）、lint:arch ✅、99 个测试通过
- **预估**: 1 天

---

### P3 - 产品/架构优化（3-6 周）

> 这些是会话消息 72 中"大胆一点"提出的战略性优化方向。

#### P3.1 把导演规则真正接入分镜生成 pipeline（消息 72 方向 1）
- **修改文件**: `src/modules/storyboard/generation/services/frame-prompt-service.ts`
- **功能**: 当前 `director-rules.ts` 只影响 shot contract，下一步让它直接影响首帧/尾帧 prompt、镜头衔接、情感强度
- **改动点**: `frame-prompt-service.ts` 里读取 shot contract 和前后镜头上下文，生成带 180 度规则、动作匹配、高潮强化的 prompt
- **本地状态**: ✅ 已完成（commit `1c33793`）
  - `director-guidance.ts` 生成导演指导并注入帧提示词
  - `beat-frame-generator` / `beat-chain-generator` 透传 `prevBeat`/`nextBeat`/`directorContext`
  - hook 与单 beat 重生成补传相邻镜头对象，主生成链路真正应用导演规则
- **预估**: 5-7 天

#### P3.2 shot contract 可视化编辑 UI（消息 72 方向 2）
- **新增**: `ShotContractEditor` 组件
- **功能**: 在 storyboard 页面加表格/时间线，用户直接改景别/运动/灯光/时长，实时影响后续生成
- **改动点**: 新增 `ShotContractEditor` 组件 + 把 shot contract 接入 storyboard store
- **本地状态**: ✅ 已完成（commit `6008ab5`）
- **预估**: 5-7 天

#### P3.3 自动故事结构 + 角色弧线分析（消息 72 方向 3）
- **修改文件**: `src/modules/novel/structure/services/structure-analyzer.ts`
- **新增文件**: `src/shared-logic/story/story-director-config.ts`
- **功能**: 上传小说后自动识别三幕结构、情节点、角色成长曲线，自动推荐导演规则配置（高潮段落自动启用 climaxIntensifyRule）
- **本地状态**: ✅ 已完成（commit `46eb0a2`）
- **预估**: 7-10 天

#### P3.4 Few-shot 学习机制
- **功能**: 根据用户编辑/反馈自动优化示例
- **当前问题**: 示例写在代码里，不能自适应
- **解决的 6 大核心问题**: Few-shot 是静态的，没有学习机制
- **本地状态**: ✅ 已完成（commit `441ae99`）
  - `dynamic-few-shot` 支持合并用户示例，评分加权优先选中（USER_EXAMPLE_BONUS）
  - `collectUserFewShotExamples` 从当前 story.beats 实时提取成品分镜为示例
  - `buildEnrichedPrompt` 接入用户示例，后续 AI 规划参考用户已编辑分镜风格
- **预估**: 5-7 天

#### P3.5 视觉连贯性主动规划
- **功能**: 生成阶段就规划角色位置、镜头轴线、动作衔接（当前是事后检查）
- **解决的 6 大核心问题**: 缺少"视觉连贯性"的主动规划
- **本地状态**: ✅ 已完成（commit `d6e9579`）
  - `planVisualContinuity` 纯函数规划器：同场景保持轴线、场景切换重置、内容关键词推断
  - `shotInstruction` 新增 `subjectScreenSide`/`actionDirection` 字段
  - story-generation-pipeline 生成后写入规划，director-guidance 消费形成闭环
- **预估**: 7-10 天

#### P3.6 云端化接口预研（消息 72 方向 4）
- **目标**: 把当前 Electron 本地 HTTP API 抽象成可切换本地/远程的 provider 层
- **新增**: `api-gateway` 抽象 + 远程 provider 实现
- **前置条件**: P0.2（localStorage 清理）已完成
- **可利用的 7 项预埋接口**: file-http、HTTP 路由、SSRF 防护、AI Provider HTTP 层、存储端口抽象、同步模块、用户/会话抽象
- **迁移成本评估**: 低成本 1-2 人月（文件/配置/AI/DB）、中等成本 2-4 人月（用户/权限/队列/ffmpeg）、高成本 4+ 人月（多租户/计费/监控/CDN）
- **本地状态**: ✅ 已完成（commit `3d2fe1f`）
  - `infrastructure/api/gateway.ts`：local/remote 双模式，baseUrl 纯函数解析，remote 自动加 Bearer 鉴权
  - 持久化走 file-http `cloud.gateway` 配置，损坏/缺失自动回退本地
  - `apiClient` 接入网关抽象，业务 API 请求 baseUrl 可切换
- **预估**: 7-10 天

---

### P4 - 商业化/战略（持续）

> 会话中讨论的商业方向，需要用户决策后执行。

#### P4.1 市场定位聚焦

**2026 年市场格局**：项目落在"全链路工作流"象限，是 2026 年竞争最激烈的区域。直接竞争对手包括泡漫、海艺TV、小云雀、有戏AI、中劢AI、橙星梦工厂、灵境AI、蛙蛙写作、白日梦AI。

**建议方向**（三选一，基于"没有资金只有时间"前提）:

| 定位 | 目标客户 | 收费 | 优势 |
|---|---|---|---|
| **A：网文作者的「本地漫剧生产线」** | 网文作者 | ¥99-299/年 | 本地运行稿子不外泄、一次买断 |
| **B：短剧承制团队的「离线批量生成器」** | 小团队 | 软件授权+插件 | 批量分镜、本地管理、用户自己付模型费 |
| **C：独立动画/自媒体的「AI 分镜助手」** | 自媒体 | 买断制 | 脚本到故事板快速可视化、多模型切换 |

**应砍定位**: "通用 AI 视频生成工具"、"C 端一键成片工具"、"纯云端 SaaS 全链路平台"

#### P4.2 商业 traction 验证（4 个实验方法）

| 实验 | 验证周期 | 核心做法 |
|---|---|---|
| **实验 1：开源版+商业授权页面** | 2-4 周 | GitHub 开源核心 engine，网站提供商业授权入口（个人 ¥1,999 / 团队 ¥9,999 / 企业 ¥49,999） |
| **实验 2：企业定向冷启动** | 4-8 周 | 锁定 10 家潜在 B 端客户，提供免费 PoC |
| **实验 3：产品案例+内容营销** | 4-12 周 | 用自己的工具生成漫剧/短剧案例，发 B 站/抖音/小红书 |
| **实验 4：价格敏感度测试** | 持续 | A/B 测试不同定价（¥99/¥299/¥999） |

**零成本获客路径**（6 个渠道）：B 站/抖音/视频号、小红书、知乎/公众号、网文作者群/短剧群、GitHub/开源、Discord/微信群

**M1/M2/M3 里程碑**：第一个付费用户（1-2 个月）、月收入 > ¥3000（3-4 个月）、月收入 > ¥10000（6-8 个月）

#### P4.3 售卖材料准备（如选择快速脱手）

**估值修正过程**（会话中经历了多次修正）：

| 阶段 | 估值范围 | 前提条件 |
|---|---|---|
| 消息 36 初始估值 | ¥300-800 万 | 假设有用户基础或团队背景（**后被修正**） |
| 消息 42 修正估值 | 快速脱手价 ¥15-40 万、理想成交价 ¥50-100 万 | 没有资金只有时间 |
| 消息 48 最终估值 | 急售底价 ¥15-30 万、合理市场价 ¥30-80 万、理想价格 ¥80-150 万 | 基于代码深度审查 |

**5 类买家的可能出价**：
- 个人开发者/独立工作室：¥5-20 万
- 小型 AI 创业公司：¥20-80 万
- 传统行业公司做 AI 转型：¥30-100 万
- 拿到融资的 AI 视频团队：¥50-150 万
- 海外买家/出海团队：$10k-80k（约 ¥7-60 万）

**建议挂牌价**：¥60-80 万，**心理底价**：¥30 万

**7 天落地清单**：
1. 整理项目 demo 视频（3-5 分钟）
2. 写一份 1 页售卖/合作介绍
3. 在 3 个渠道挂牌测试水温（V2EX、电鸭、GitHub）
4. 同时选一个垂直定位，做最小化版本
5. 评估 2-3 个接外包的平台，准备接单

**售卖材料核心卖点**（基于代码深度审查的真实资产）：
- 23 万行 TypeScript，8600+ 单元测试
- 20+ AI provider 接入（豆包/可灵/智谱/MiniMax/Seedance/Runway/Pika 等）
- 完整 workflow：剧本 → 故事板 → 分镜 → 关键帧 → 首尾帧 → 视频
- Agent 驱动生成：intent routing、skill routing、few-shot
- 云端化预埋：HTTP API、sync engine、S3 存储抽象

**避坑指南**：不要先给完整代码、删除个人敏感信息

---

## 四、实施路线图

### 阶段 1: 工程债务清理（第 1-2 周）
```
Week 1:
  ├── P0.1 修复 withGenerationState race condition (0.5d) ✅ 已完成
  ├── P0.2 清理 localStorage 违规 - 3 处全部完成 (1d) ✅ 已完成
  │   ├── changelog.ts → file-http getConfig/setConfig
  │   ├── file-storage-factory.ts → file-http getConfig/setConfig（异步化）
  │   └── ErrorBoundary.tsx → preferencesStorage.clearAll()（新增统一清理方法）
  └── P0.3 CI 环境修复 (1d) ✅ 已完成

Week 2:
  ├── 提交 P0 阶段 1 修复到 feature/p0-cleanup 分支
  ├── P2.4 代码异味清理 (1d) ✅ 已完成
  └── P2.2 拆分 AgentPage 超长组件 (1d)
```

### 阶段 2: 高 ROI 功能（第 3-4 周）
```
Week 3:
  ├── P1.1 导演规则引擎 (2d) - 远程沙盒已实施，本地同步
  ├── P1.2 情绪驱动分镜 (1.5d) - 远程沙盒已实施，本地同步
  └── P1.3 模型参数适配 - 前半 (1.5d) - 远程沙盒已实施，本地同步

Week 4:
  ├── P1.3 模型参数适配 - 后半 (0.5d) - 远程沙盒已实施，本地同步
  ├── P2.3 降低函数复杂度 (1.5d)
  └── P2.1 拆分超长文件 - 前 3 个 (3d)
```

### 阶段 3: 架构统一（第 5-7 周）
```
Week 5-6:
  ├── P1.4 统一"故事 → 分镜"架构 (5-7d) ✅ 已完成
  └── P2.1 拆分超长文件 - 后 3 个 (3d) ✅ 已完成

Week 7:
  ├── P3.1 把导演规则真正接入分镜生成 pipeline ✅ 已完成
  └── P3.4 Few-shot 学习机制 ✅ 已完成
```

### 阶段 4: 战略功能（第 8-12 周）
```
Week 8-9:  P3.1 导演规则接入 pipeline + P3.4 Few-shot 学习 ✅ 已完成
Week 10-11: P3.2 ShotContractEditor + P3.3 自动故事结构 ✅ 已完成
Week 12: P3.5 视觉连贯性主动规划 + P3.6 云端化接口预研 ✅ 已完成
```

### 阶段 5: 商业化（持续）
```
并行执行 P4.1/P4.2/P4.3，根据用户决策定向投入
```

---

## 五、关键决策点

### 决策 1: 继续做 vs 卖掉

**5 个决策问题**（消息 36）：
1. 资金还能撑多久？（< 3 个月→卖、3-6 个月→小规模验证、> 6 个月→尝试转型）
2. 是否有稳定的现金流来源？
3. 是否能忍受 6-12 个月不赚钱？
4. 是否能找到垂直细分市场的种子用户？
5. 卖掉的目的是什么？

**3 种情况的建议**：
- **情况 A**：资金紧张/有更好机会 → 现在卖
- **情况 B**：资金尚可/找到垂直场景 → 继续做 6 个月再决定
- **情况 C**：折中方案 → 部分出售/授权（代码授权、技术入股、MVP 合作）

**用户当前情况**：没有资金只有时间，依靠 Trae 免费 AI 开发 → 建议继续做，但不要幻想做平台，而是把项目做成一个"能变现的小生意"

### 决策 2: 市场定位（P4.1）
- 方向 A（网文作者漫剧生产线）：¥99-299/年，本地运行稿子不外泄
- 方向 B（短剧承制团队离线批量生成器）：软件授权+插件，批量分镜
- 方向 C（独立动画/自媒体 AI 分镜助手）：买断制，脚本到故事板快速可视化
- **建议**：方向 A，与项目"本地优先 + 多模型调度"的技术资产最匹配

### 决策 3: 远程沙盒改动是否同步到本地
- 会话中 AI 在 `feature/story-shot-enhancements` 分支实施了 P1.1-P1.3（13 个文件，+585/-51）
- 该分支在远程沙盒环境，本地无法直接 `git pull`
- **选项**:
  - A: 在本地重新实施（基于本规划文档，保证代码质量）
  - B: 尝试从远程沙盒导出 patch 文件
  - C: 直接参考会话中的 finish summary 手动重建
- **建议**: 选项 A，重新实施，因为可以结合本地实际情况优化

---

## 六、验证标准

每个阶段完成后需通过:

```bash
# 静态检查
npm run typecheck
npm run typecheck:electron
npm run lint
npm run lint:arch

# 测试
npm run test
npm run test:e2e

# 架构一致性
node scripts/check-module-api-consistency.mjs
```

### 回归防护
- 每个修复点新增回归测试
- 更新 `regression-guards.md`（当前 152 条规则）
- 遵循 `code-cleanup.md` 的四步判断流程处理发现的死代码

---

## 七、与会话的对应关系

| 会话消息 | 提出的优化点 | 本规划对应项 | 状态 |
|---|---|---|---|
| msg 20-21 | Traction 核心指标体系 | P4.2 | 本地未实施 |
| msg 24 | P0/P1/P2 级问题 | P0.1-P0.3, P2.1-P2.4 | ✅ 全部完成 |
| msg 27 | 项目前景分析五维度 | P4.1 | 待决策 |
| msg 30 | 云端化接口 7 项预埋分析 | P3.6 | ✅ 已完成（commit `3d2fe1f`） |
| msg 33 | 2026 年市场格局详细对比 | P4.1 | 待决策 |
| msg 36 | 决策框架 5 个关键问题 | 决策 1 | 待决策 |
| msg 39 | "没有资金只有时间"核心策略 | P4.1, P4.2 | 待决策 |
| msg 42 | 现实估值表与买方视角 | P4.3 | 待决策 |
| msg 48 | 代码深度审查 + 脱手方案 | P0.1-P0.3, P4.3 | P0 阶段 1 已完成 |
| msg 63 | 当前策略 6 大核心问题 | P1.4 | ✅ 已完成（commit `ef238ae`） |
| msg 72 | "大胆一点"4 个方向 | P3.1-P3.6 | ✅ 全部完成 |
| msg 90 | 实际实施的 4 项高 ROI 改动 | P1.1, P1.2, P1.3 | ✅ 本地同步完成 |

---

## 八、下一步行动

1. **已全部完成**: P0（工程债务）、P1（高 ROI 功能）、P2（代码质量）、P3（产品/架构优化）——P1.1-P1.4、P2.1-P2.4、P3.1-P3.6 均已实现并提交
2. **待决策项（P4 商业化）**: 市场定位聚焦、Traction 验证、售卖材料准备——需用户决策后执行
3. **后续候选（未启动）**: P3.6 云端化的远程 provider 实际落地（api-gateway 已预埋接口，待接入远程服务端）、启动时加载网关配置、云端网关 UI 设置页

> **注**: 本规划基于会话 `6a6707cd9d35f6e35f5c3962` 的完整内容（90 条消息，11694 行，323.9 KB），会话记录见 `session_full_content.md`。
> **v2 修订**: 补充 11 项遗漏内容（Traction 指标体系、项目前景五维度、云端化 7 项预埋、2026 市场格局、决策框架 5 问题、零成本策略、现实估值表、代码审查真实资产/幻灭点、6 大核心问题、大胆一点 4 方向、远程沙盒完整文件清单），修正 4 项理解错误（删除 P0.3 agent-tools-* 违规、估值修正过程、远程沙盒改动描述、会话最终状态描述）。
> **v3 修订（2026-08-04）**: P1-P3 全部完成并标注提交号；剩余 P4 商业化项待用户决策。
> **v4 修订（2026-08-06）**: 新增"九、设计任务落地"——模型无关质检层 + 成本追踪/用量统计两份设计（已评审修订 v0.2），P0 批准开工。

---

## 九、设计任务落地（2026-08-06 新增）

> 两份设计任务书（`tasks/prismcraft-quality-gate-design.md`、`tasks/prismcraft-cost-tracking-design.md`）已完成设计（v0.2，经评审修订），P0 已批准开工。

### 9.1 模型无关质检层（Quality Gate Layer）

- **设计文档**: `docs/DESIGN-QUALITY-GATE.md`（v0.2）
- **定位**: shared-logic/quality-gate（零依赖纯逻辑）+ QualityChecker 注册表 + 降级链 + standardsUsed 口径标注
- **对齐哲学**: 可插拔 Port + 降级链 + 失败即预期（绝不 throw）
- **P0 范围**: types/registry/runner + 3 个 rule checker + 单元测试（约 2 周，纯增量）——骨架已落地
- **P1**: 新 API checkWithQualityGate + 旧 API deprecated 包装 + workflow 节点切换 + 阈值配置 + feedback 落库（2-3 周）
- **P2**: VLM/embedding checker + code-plugin 适配器（单独排期 2-3 周）
- **收购价值**: 让自研模型企业看到"模型接入后被工作流放大"（接入指南 + 价值展示文档已就绪）
- **新守卫**: R192 quality-gate-no-throw / R193 downgrade-chain / R194 threshold-resolution

### 9.2 成本追踪 / 用量统计（Cost Tracking）

- **设计文档**: `docs/DESIGN-COST-TRACKING.md`（v0.2）
- **定位**: usage_records 表（migrations v13）+ 主进程 api-gateway 层采集（写库同进程零通道）+ shared-logic/cost-engine 定价 + IUsageProvider 可插拔真实用量
- **P0 范围**: usage_records 表 + api-gateway 采集 + usage-tracker（缓冲/降级/status）+ 测试（约 2 周）
- **P1**: cost-engine + 成本看板页（双口径）+ summary API（2 周）
- **P2**: estimatedCost 弹窗（手动/批量）+ IUsageProvider 接口；平台实现单独排期
- **收购价值**: "帮你省钱"+"告诉你省了多少"合体——成本看板是销售材料的直观证明
- **新守卫**: R195 usage-record-never-throws

### 9.3 与 P4 商业化衔接

- 两份设计是"卖出前的临门一脚"：质检层 + 成本看板提升项目"可演示、可证明价值"的卖相
- Web 版（估值 +50-100%）仍是最优先商业化前置项（见八、下一步行动）
- **安全备注（2026-08-06 事故）**：本机曾发生 .git 对象库损坏（lint-staged 卡死），历史经远程恢复；后续改动务必及时 commit + push，避免依赖单一本地对象库
