# 【学习工作赛道】PrismCraft — 智能动画创作工作台（初赛 Demo 提交）

**赛道** ：通用赛道 / 02 学习工作

**版本** ：v1.2.2（测试版）

**报名帖** ：[本地桌面应用，把角色和场景从提示词里拎出来做结构化](https://forum.trae.cn/t/topic/33047)

## 一、产品概览

### 创意名称

**PrismCraft — 智能动画创作工作台**

### 一句话定位

**把专业工作室的动画创作流程，搬到普通创作者的电脑上——让一个人也能完成团队级的内容生产。**

### 解决什么问题

做系列视频内容时：

- 同一个角色的提示词要反复写、角色图要反复上传

- 改一次设定要同步十几个分镜

- 素材散落在各家平台，版本混乱

- 重做一个镜头可能找不到之前的参考

市面上的工具都只解决"生成"，不解决"管理"。真正的痛点不在"会不会生成"，而在"能不能系统化管理角色、场景、分镜和元素绑定"。

### 产品形态

桌面应用（Electron + React + TypeScript + better-sqlite3），所有数据存在本地 SQLite 数据库，可整体导出、备份、迁移，零云端依赖，同时项目在架构设计方面也为云端发展留下了充足空间。

### 赛道归属

PrismCraft 归属学习工作赛道的**工作方向**。它是内容生产工具而非学习工具——对标 Runway/Pika 的 AI 创作能力，但补齐了它们缺失的资产库、分镜编排、多模型调度、本地数据安全等生产流水线能力。核心价值是"让创作者更快产出可商用的动画/视频内容"，目标用户是做内容赚钱的短视频博主、自媒体团队、内容工作室。

## 二、快速体验

### Demo 下载

**Windows x64** （约 114 MB）：

- 下载 [`PrismCraft-Setup.exe`](https://github.com/ph2-5/PrismCraft/releases/latest/download/PrismCraft-Setup.exe)（**固定链接，始终指向最新版本** ）

- 运行环境：Windows 10/11 x64

- 未签名提示：首次运行 Windows SmartScreen 可能拦截，点击"更多信息 → 仍要运行"即可

**macOS Apple Silicon (M1/M2/M3)** ：

- 下载 [`PrismCraft-arm64.dmg`](https://github.com/ph2-5/PrismCraft/releases/latest/download/PrismCraft-arm64.dmg)（**固定链接，始终指向最新版本** ）

**macOS Intel** ：

- 下载 [`PrismCraft-x64.dmg`](https://github.com/ph2-5/PrismCraft/releases/latest/download/PrismCraft-x64.dmg)（**固定链接，始终指向最新版本** ）

**macOS 安装说明（未签名，需手动信任）** ：

1. 下载 .dmg → 将 PrismCraft 拖到 Applications 文件夹

2. 打开"终端"应用，执行以下命令清除隔离属性：

```
xattr -cr "/Applications/PrismCraft.app"
```

3. 执行完毕后双击 PrismCraft 即可正常启动

4. 提示：macOS 14+ 双击会显示"已损坏"或"无法验证开发者"，**必须执行第 2 步命令** 才能运行，仅右键"打开"可能无效

- 完整 Release 页面：[https://github.com/ph2-5/PrismCraft/releases/latest](https://github.com/ph2-5/PrismCraft/releases/latest)

### 快速体验路径（5 分钟）

1. **安装并启动** PrismCraft

2. **首次启动** ：会引导配置至少 1 个 AI 提供商（推荐先用智谱 AI 或 OpenAI 测试文本生成）

3. **创建角色** ：进入"角色"页面 → 点击"+ 创建新角色" → 填写名称 → 点击"生成角色图"

4. **创建场景** ：进入"场景"页面 → 创建一个场景

5. **创建分镜** ：进入"分镜"页面 → 创建 2-3 个分镜 → 绑定刚才的角色和场景

6. **生成视频** （可选，需要视频模型 API Key）：选中分镜 → 点击"生成视频"

### 体验重点

- **本地优先** ：所有数据存在本地 SQLite，关闭应用再打开数据仍在

- **结构化管理** ：改一次角色信息，所有引用该角色的分镜自动同步

- **多模型聚合** ：13 家 AI 提供商统一接口，无需学习各家参数体系

- **AI 请求预览** ：角色编辑页可查看"最终发送给大模型的完整请求内容"

- **重复检测** ：相似 prompt + 参考图会自动复用已有任务，避免重复计费

- **AI Agent 助手** （v1.2.0 新增–功能测试阶段）：20 域 141 工具的智能助手，支持小说转分镜、一键视频生成、故障自愈

## 三、核心功能展示

### 创作流程总览

从故事大纲到剪辑素材包的端到端工作流：**故事大纲 → 角色/场景录入 → 分镜编排 → 多模型生成 → 素材导出** 。把"提示词反复写、参考图反复传、素材散落各处"的混乱流程，变成"结构化资产 + 自动拼装 + 统一调用 + 一键导出"的工程化流水线。

![](https://aka.doubaocdn.com/s/lqWt1wkwWI)

### 1. 主页 — 项目工作台

主页作为创作工作台，集中展示项目状态、快捷入口和最近任务，对齐 design-preview 设计稿。

### 2. 角色管理 — 结构化管理 + 一致性锚定

- 角色卡片化管理，支持头像 / 生成图 / 参考图 / 服装库

- AI 请求预览卡片：展示最终发送给大模型的完整请求内容（Prompt / 模型配置 / 参考图片 / 关联分镜 / JSON）

- 特征锚定：把角色的关键特征（发色 / 服装 / 表情）固化为可复用模板

- 删除被分镜引用的角色时自动拦截

### 3. 场景管理 — 状态化场景库

- 场景状态库（白天 / 黑夜 / 雨天等）

- 与角色管理一致的结构化模式

### 4. 分镜编辑 — 元素绑定 + 一致性检查

- 分镜卡片化（timeline-card）

- 元素绑定面板：把角色 / 场景 / 道具绑定到具体分镜

- 一致性检查：自动检测分镜间的元素是否冲突

- Prompt 编辑器：浮动球式 prompt 编辑，支持模板变量

### 5. 视频任务管理 — CQRS 模式 + 多模型聚合

- 13 家 AI 视频提供商统一接口（Kling / Runway / Pika / Luma / MiniMax 等）

- CQRS 模式：State / Queries / Commands / Polling 分离

- 任务状态机：transition-guard 防止非法状态转换

- 任务恢复：崩溃后自动恢复未完成任务

- 视频缓存：自动缓存生成结果，避免重复请求

### 6. 素材库 — 统一管理 + 导入导出

- 多 tab 分类：全部素材 / 角色库 / 场景库 / 分镜库 / 道具 / 合集 / 媒体资产

- 搜索 + 标签筛选

- 支持 .asa 项目导出导入

### 7. 设置 — API 密钥系统级加密

- 13 家 AI 提供商配置

- API Key 系统级加密存储（macOS Keychain / Windows Credential Manager）

- 模型能力自适应：自动检测模型支持的能力（首尾帧 / 参考图 / 时长等）

- 声明式 JSON 插件：零代码接入新提供商

### 8. AI Agent 助手（v1.2.0 新增）

- **定位** ：系统管理员角色，通过工具调用（function-calling）操控项目所有功能

- **20 域 141 工具** ：资产管理 / API 配置 / 系统监控 / 内容生成 / 网络搜索 / 图像编辑 / 故事创作 / 视频生成 / 分镜操作 / 视频后期 / 音频处理 / 模板管理 / 工作流编排 / 任务监控 / 故障诊断 / 帮助系统 / 子工作流 / 记忆系统 / 项目导入导出 / 文件管理

- **流式输出** ：文本生成全链路流式化，实时显示 AI 推理过程

- **一键自动化** ：

  - `auto_create_from_novel` — 小说转分镜，端到端自动化

  - `auto_generate_video_full` — 一键视频生成全流程

  - `configure_api_provider` — 用户发 API Key + 厂商名，自动配置

  - `diagnose_error` + `auto_fix` — 故障自愈

- **安全约束** ：maxIterations 防死循环、API key 脱敏、工具超时分级（查询 30s / 变更 60s / 生成 5min / 视频 30min）

- **会话持久化** ：对话历史保存到本地，支持多会话切换

## 四、技术架构

### 工程规模

| 指标 | 数值 |
|------|------|
| 代码行数 | 220,000+ 行 TypeScript（不含测试）/ 310,000+ 行（含测试） |
| 业务模块 | 10 个（故事 / 角色 / 场景 / 分镜 / 视频任务 / 视频恢复 / 视频缓存 / 素材 / 同步 / Agent 助手） |
| AI 提供商 | 13 家原生 + 声明式 JSON 插件扩展 |
| 单元测试 | 5,767 个（310 文件，renderer） |
| Electron 主进程测试 | 1,286 个（61 文件） |
| 测试用例总计 | 7,053 个（371 文件） |
| 回归防护规则 | 184 条（R1-R190） |
| DDD 分层 | 6 层（app / modules / domain / shared-logic / shared / infrastructure） |
| Agent 工具 | 141 个（20 域 22 文件） |

### 技术栈

| 层 | 技术 |
|----|------|
| 运行时 | Electron 41 |
| 前端 | React 19 + TypeScript 6 strict + Tailwind CSS 4 |
| 状态 | Zustand + React Query |
| 数据库 | better-sqlite3（本地 SQLite） |
| 构建 | Vite + electron-builder |
| 测试 | Vitest（单测）+ Playwright（E2E） |
| 架构 | DDD 分层 + DI Container + CQRS |
| 安全 | 系统级 API Key 加密 + SQL 参数化 + vm 沙箱插件隔离 + SSRF 防护（fail-close） |

### v1.2.0 关键技术改进

**1. 长视频支持（100MB 写入限制彻底解决）**

- 方案 B（二进制 IPC）：新增 `file/write-binary` 路由，支持 500MB 二进制写入

- 方案 C（流式下载到磁盘）：主进程 fetch + stream/promises.pipeline 直接落盘，内存占用恒定（~64KB chunk buffer）

- 支持 Seedance 2.5 30秒 4K（~150MB）和 Kling 180秒视频

**2. SSRF 安全加固**

- `download-to-file` 集成 `ssrfGuard.validate`，fail-close 策略

- 手动重定向循环（max 3 跳），每跳 SSRF 校验

- 16 条 SSRF 回归测试（R105 / R118 / R133 合规）

**3. 流式输出**

- 文本生成全链路流式化（plugin → network → HTTP server → renderer）

- SSE 自定义事件（chunk / done / error）

- 不支持流式的 provider 自动降级为非流式

### v1.2.2 关键技术改进

**1. SSRF Guard DNS 回退修复**

- 问题：`dns.resolve4`/`dns.resolve6`（c-ares 库）在某些系统返回 `ECONNREFUSED`，导致 fail-close 策略误拦截所有公网 API 请求

- 修复：c-ares 解析返回空结果时回退到 `dns.lookup`（系统 DNS，通过 `getaddrinfo`），仍做私有 IP 检查，确保 DNS rebinding 防护有效

- 新增 R190 回归规则

**2. Agent 架构深化（P0-P5 完整链路）**

- P0：LLMMessage 类型提升到 domain 层，ITextProvider 新增 `generateChat` 方法（原生 messages 数组 + function calling）

- P1：Provider 接口改为 messages 数组，自适应双路径（原生 function calling 优先，旧式 generateTextStream 降级）

- P2：Agent 服务 DI 化，Port 接口 + 构造函数注入，支持测试替换

- P3：精确 Token 估算（CJK 1.5 token/char，ASCII 0.25 token/char）+ ContextBudget 分配 + 工具结果截断

- P4：多 Agent 编排（delegate_to_specialist 专家委派）

- P5：断点恢复（增量 checkpoint + 中断检测 + resume/dismiss + 索引清理）

- E2E 集成测试：12 个场景覆盖简单聊天 / 列表查询 / 角色创建（P0 并行）/ 专家委派 / API 配置 / LLM 消息构建 / 消息历史完整性 / RAG 注入

- 真实 LLM 冒烟验证：DeepSeek API 流式 + function calling 全链路打通

## 五、Trae 协作叙事

### 项目由来与开发时间线

PrismCraft 是一个用 AI 编程工具从零起步、持续维护了 **3 个月** 的真实工程项目，并非"用 AI 写了一个 Demo"。

开发工具经历了三次演进：**OpenClaw（搭建原型）→ Trae CN → Trae Solo CN** ，最终稳定在 Trae Solo CN 持续开发至今。

| 时间 | 阶段 | 工具 | 产出 |
|------|------|------|------|
| 2026-04-07 | 项目起源 | Next.js 16 + OpenClaw | 短暂使用 OpenClaw 搭建原型，首次 git commit，搭建 Electron 桌面应用骨架 |
| 2026-04-08 ~ 04-11 | 早期三阶段开发 | OpenClaw | 完成自动保存、API Key AES-256-GCM 加密、AI 队列管控、工程 ZIP 打包、剧本-角色-场景联动、ErrorBoundary、崩溃恢复、内存监控 |
| 2026-04 ~ 2026-05 上旬 | 工具切换 | Trae CN | 改用 Trae CN 继续开发 |
| 2026-05-09 | 迁移到 Trae Solo | **Trae Solo CN**（首次启动） | telemetry.firstSessionDate 记录首次启动时间，项目目录迁移到 `Desktop/重构/` |
| 2026-05-10 起 | 全面迁移到 Trae Solo | Trae Solo CN | 在 Trae Solo CN 上持续开发至今 |
| 2026-05 ~ 2026-06 | 架构演进 | Trae Solo CN | Next.js → Vite + Electron、单体 → DDD 六层、4 → 13 个 AI 提供商、0 → 7,053 测试用例 |
| 2026-06-24 ~ 06-28 | UI 重构 + 大赛初赛 | Trae Solo CN | 旧 UI 全量弃用、design-preview.html 99% 还原、GitHub Release v0.12.1/v0.12.2 发布 |
| 2026-07-07 | **v1.2.0 测试版发布** | Trae Solo CN | AI Agent 助手完整版（141 工具）+ 流式输出 + 长视频支持 + SSRF 加固 + 文档全面更新 |
| 2026-07-11 | **v1.2.2 测试版发布** | Trae Solo CN | SSRF DNS 回退修复 + Agent 架构深化 P0-P5（DI 化、原生 function calling、断点恢复、E2E 测试） |

**核心协作模式** ：Trae Solo CN 生成初版代码 → 人工调试完善 → 抽取规则固化防止回归 → 持续维护演进。

### TRAE 实践过程 — 关键任务对话 Session ID

以下 3 个 Trae Solo CN 对话 Session ID 对应项目三个关键架构演进节点，可在 Trae 社区后台或 Trae IDE 历史中查询验证：

#### 1. Session ID: `6a1c670721c1f14dd6677ec7` — Next.js → Vite 架构迁移

- **时间** ：2026-06-01 11:38:55

- **TRAE 版本** ：TRAE Work CN 0.1.23

- **关键工作** ：将项目从 Next.js 16 App Router 迁移到 Vite + Electron 独立架构，解决 Next.js 在 Electron 主进程中的运行时冲突；确立后续 DDD 六层架构的技术基座

#### 2. Session ID: `6a32ac4fe0e182cc2729ff62` — IPC → HTTP 统一通信改造

- **时间** ：2026-06-17 23:32 至 2026-06-20 03:19（持续 2 天 4 小时，跨 4 个日历日）

- **模型** ：DeepSeek-V4-Pro（solo_agent_lite_3 模式）

- **关键工作** ：

  - P0-P3 安全与稳定性修复（SSRF 防护、SQL 注入、文件上传限制、Result 模式）

  - 新增 5 条 HTTP 路由，创建 `src/shared/file-http/index.ts` 双轨通信层

  - 替换前端所有 electronAPI 文件/配置调用为统一 HTTP API

  - 项目正式改名（AI Animation Studio → PrismCraft）

#### 3. Session ID: `6a3ae8e6009f9531a5ac39f0` — UI 重构 + AI 助手实现 + Agent 架构深化

- **时间** ：2026-06-24 04:36 至 2026-07-11（持续 17 天，跨 18 个日历日）

- **模型** ：GLM-5.2

- **关键工作** ：

  - design-preview.html 99% 还原，旧 UI 全量弃用删除

  - 7 个核心页面业务逻辑与 UI 样式分离

  - 188 处硬编码 Tailwind 颜色清理为语义变量，新增 R181 回归规则

  - StoryProvider 清理死代码 + 8 字段移除、4 个首屏组件懒加载、useAssetLibraryActions 参数语义化重构

  - GitHub Release v0.12.1 / v1.2.0 / v1.2.2 发布，3 个平台安装包（Windows exe + macOS arm64/x64 dmg）上传

  - 初赛说明贴撰写、创作流程图 HTML→PNG 渲染、legacy-ui 分支保留旧版

  - **v1.2.2 Agent 架构深化**（17 commits）：LLMMessage domain 层提升、Provider 接口 messages 数组化、Agent 服务 DI 化、Token 精确估算 + ContextBudget、多 Agent 编排、断点恢复、E2E 集成测试（12 场景）、真实 LLM 冒烟验证

### 3 个月持续协作的关键机制

#### 1. 分层规则加载

- Layer 0：始终加载的 quick-start.md（~1,500 tokens）

- Layer 1：任务触发加载（architecture-rules / testing-rules / regression-guard-automation）

- Layer 2：按需查找（regression-guards / MODULE.md / contract.json）

解决的问题：AI 上下文有限，无法一次加载所有规则。按需加载让 AI 用最少上下文做最正确决策。

#### 2. contract 驱动开发

- 每个模块有 `MODULE.md` 定义边界

- 每个子域有 `contract.json` 定义 `publicAPI` 和 `invariants`

- 防止 AI 跨层违规、幻觉 API、重复造轮子

#### 3. 回归防护体系

- 184 条回归规则（R1-R190），每条对应一个真实 bug

- ESLint `no-direct-db-ipc` 等自定义规则强制执行

- 架构扫描脚本 `check-architecture.mjs` 检测依赖方向

#### 4. 会话状态传递

- `.ai/session-notes.md`：追加式会话日志，新会话可恢复上下文

- `.ai/work-claims.md`：工作声明机制，防止多会话冲突

- `.ai/context-snapshot.mjs`：一键获取当前项目状态快照

- `.ai/modules/`：10 个模块的详细 AI 维护指南

- 防幻觉检查点：调用 DI token / shared-logic / API 路由前必须先读对应文件

### 协作成果

| 协作维度 | 成果 |
|---------|------|
| 持续时间 | 3 个月（2026-04 至今） |
| Trae Solo CN 对话 Session 数 | 30+ 个（主账号） |
| 代码规模 | 220,000+ 行（不含测试）/ 310,000+ 行（含测试） |
| 测试覆盖 | 5,767 renderer + 1,286 electron = 7,053 个测试 |
| 回归规则 | 184 条（R1-R190） |
| 架构层级 | DDD 6 层 |
| 模块数 | 10 个业务模块 + shared-logic |
| Agent 工具 | 141 个（20 域） |

**这不是"用 AI 写代码"，而是"建立了一套让 AI 能长期稳定维护大型项目的工程基础设施"。**

## 六、后续规划与联系方式

### 当前进度

收集反馈打磨已有功能，继续开发其他功能。下一步重点是将 Agent 助手从测试阶段推进到生产可用，对接真实 LLM + 工具链，并扩展更多 AI 提供商。

### v1.2.2 质量基线

- typecheck 通过

- lint 0 errors

- lint:arch 0 violations

- 7,053 个测试全部通过（0 失败）

- 184 条回归规则

### 下载

- **Windows 固定链接**（始终最新）：[PrismCraft-Setup.exe](https://github.com/ph2-5/PrismCraft/releases/latest/download/PrismCraft-Setup.exe)

- **macOS Apple Silicon 固定链接**（始终最新）：[PrismCraft-arm64.dmg](https://github.com/ph2-5/PrismCraft/releases/latest/download/PrismCraft-arm64.dmg)

- **macOS Intel 固定链接**（始终最新）：[PrismCraft-x64.dmg](https://github.com/ph2-5/PrismCraft/releases/latest/download/PrismCraft-x64.dmg)

- **Release 页面**：[https://github.com/ph2-5/PrismCraft/releases/latest](https://github.com/ph2-5/PrismCraft/releases/latest)

- **项目仓库**：[https://github.com/ph2-5/PrismCraft](https://github.com/ph2-5/PrismCraft)

### 联系方式

- **项目仓库**： [https://github.com/ph2-5/PrismCraft](https://github.com/ph2-5/PrismCraft) （已开源，CC BY-NC 4.0 协议）

- **问题反馈**：通过社区私信，或 GitHub Issues

- **社区主页**：[ph2.5](https://forum.trae.cn/u/ph2.5)
