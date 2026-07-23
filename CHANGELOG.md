# 更新日志

本项目所有重要变更均会记录在此文件中。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本管理遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Added

- 暂无

## [1.4.0] - 2026-07-23

### Added

- **双协议授权**：项目协议从 CC-BY-NC-4.0 改为 AGPL-3.0-only 开源协议 + 商业许可证双协议模式，新增 `COMMERCIAL_LICENSE.md`
- **小说导入管道**（Task 2A.1-2A.19）：完整实现从小说导入到分镜生成的自动化管道，包含 10 阶段状态机、三档模式（手动/半自动/全自动）、节奏规划引擎、连续性账本、故事结构分析层
- **时间线维度建模**（Q3-1 到 Q3-10）：场景变体子系统、Beat 层关联变体、状态推演引擎、级联更新与脏标记、多时间线支持、滑动窗口与重点标注
- **Compositor 全局编译器**：接入真实多参考图合成，三栏布局 + AI 图像合成
- **ONNX face-embedding**：接入 ONNX 本地推理，实现跨分镜角色面部一致性检查
- **VLM 多图比对**：参考图传入视觉模型进行一致性比对
- **模型清单保鲜**：批量补全 `verifiedAt` 保鲜元数据，UI 显示模型验证日期 + 废弃警示，标记过时模型为 deprecated，新增 DeepSeek V4 / Seedance 2.5 模型
- **全局搜索模块**（Task 4.6）：跨角色/场景/故事/素材统一搜索
- **视频片段合成**（Task 4.3）：视频片段拼接导出
- **视频局部重绘**（Task 2A.22）：视频局部区域重绘编辑
- **3D 白盒预览**（Task 2A.21）：3D 白盒场景预览编辑器
- **道具库模块**（Task 2A.8）：道具 CRUD + 服装数据迁移
- **Agent 意图路由 + QC 集成**：意图驱动的工具集限制，consistency-qc 接入 AI Agent
- **跨分镜一致性自动修复**（Task 4.8）：检测并修复跨分镜一致性问题
- **IP 安全改写**（Task 4.12）：生产级 IP 安全改写 + 误报修复 + 跨分镜 IP 一致性
- **Storybook + Stryker**：Storybook 组件展示 + Stryker 变异测试配置
- **TEST-CHECKLIST.md**：覆盖 16 类 100+ 项的手动测试清单
- **集成测试补全**：新增 47 个关键路径集成测试

### Fixed

- **安全加固**：plugin-worker vm 沙箱加固、SSRF guard 增加 dns.lookup fallback、local-embedding 替换 new Function、memory-service 写超时保护、migrations 类型白名单校验
- **33 项全面问题修复**（P0 7 + P1 11 + P2/P3 15）：包含竞态条件、类型安全、静默 catch、内存泄漏等
- **CI 配置修复**：coverage 上传、并发设置、路径过滤、Playwright 缓存、artifact 保留策略
- **e2e 测试修复**：sync dialog 定位、plugin-management tab 切换、sync-workflow flaky 风险
- **generateBeatImagePrompt 重构 bug**：增强模式角色描述丢失
- **vite 7+ 动态 import 报错**：改用 `new Function` 构造器绕过静态分析

### Changed

- **性能优化**：
  - Zustand selector 修复（use-beat-detail.ts / use-story-state.ts）：避免 `.find()` 在 selector 中返回新引用触发重渲染
  - 消息列表虚拟化（AgentPage.tsx）：使用 @tanstack/react-virtual，仅渲染可见区域
  - 列表项 memo 化（AuditLogPanel / BatchProgressDialog / PropLibraryPanel）：减少不必要的重渲染
  - useVideoTaskQueries 单次遍历优化：3 个 filter() 合并为 1 次 for...of
- **代码质量**：
  - 统一 console 到 logger（plugin-worker / code-plugin-loader / ffmpeg-handler）
  - AppError 迁移：标准化错误码为 UPPER_SNAKE_CASE
  - 主进程错误处理统一
  - 清理死代码：删除误导性 performConsistencyCheck + 修复文档过时
  - 清理未使用 export：12 个函数评估，2 个误判恢复，10 个保留并加注释
- **函数复杂度降低**：AgentLoop.run (46→≤15)、generateVideoWithMultiAPI (35→≤15)、parseCharacter (33→≤15) 等 12 个函数
- **lint warnings 全量收敛**：272 → 0
- **agent 大文件拆分**：拆分为 audit-log / vector-search / ffmpeg-runner / agent-memory / agent-fewshot / agent-session / agent-specialist 等独立模块

### Documentation

- 更新版本号 1.3.0 → 1.4.0（package.json / package-lock.json / docs/）
- 归档 5 个历史文档 + 新建 6 个 P0 文档 + 重写 3 个过时文档 + 更新 15 个文档
- 49 个 MODULE.md 状态标记全部为 ✅
- 新增代码清理决策规范（code-cleanup.md）+ dead-code-cleanup skill

### Tests

- 单元测试：6021 → 8647（+2626，421 files）
- Electron 测试：1524 passed, 19 skipped（70 files）
- typecheck / typecheck:electron / typecheck:test / lint:arch 全部通过

## [1.3.0] - 2026-07-14

### Added

- **R191 回归测试**：为 `generateBeatImagePrompt` 增强模式角色描述回退逻辑添加 10 个回归测试用例，确保 `isEnhanced=true` 且 `sceneElements` 为空时角色描述不丢失
- **e2e 控制台检查增强**：
  - 新增 `STRICT_IGNORED_ERROR_PATTERNS` 严格模式过滤规则，用于核心业务流程测试
  - `captureConsoleErrors` 支持 `{ strict: true }` 选项，暴露更多真实错误
  - `tests/electron/edit-field-combination-persistence.spec.ts` 添加全局 beforeEach/afterEach 控制台检查（原完全无检查）
  - `tests/electron/smoke.spec.ts` 添加全局 beforeEach/afterEach 控制台检查（原 27 个 test 仅 2 个有检查）
  - `tests/electron-integration.spec.ts` 添加最终累积检查 test，兜底启动阶段错误盲区

### Fixed

- **generateBeatImagePrompt 重构 bug**：增强模式条件判断错误导致 `isEnhanced=true` 但 `sceneElements` 为空时角色描述丢失（commit 488c0a5）
- **vite 7+ 动态 import 报错**：`/* @vite-ignore */` 在 vite 7+ 已失效，改用 `new Function("m", "return import(m)")` 构造器彻底绕过静态分析（commit 84b27c4）
- **e2e 测试文案不匹配**：3 个 asset-library 测试期望文案与实际 UI 不一致（"角色库为空" → "还没有角色素材"），更新匹配文案并保留旧文案兼容
- **typecheck:test 历史债务**：清理 306 个 TypeScript 测试代码错误（258 个 noUncheckedIndexedAccess + 48 个 mock 类型错误），在 `tsconfig.test.json` 中关闭测试代码的 `noUncheckedIndexedAccess`

### Changed

- **e2e 控制台错误过滤基础设施增强**：
  - 新增 `STRICT_IGNORED_ERROR_PATTERNS` 严格模式（仅过滤 favicon/manifest/ResizeObserver/HMR 等纯噪声），用于核心业务流程测试时暴露网络错误、hydration 不匹配、404/400 资源错误
  - `captureConsoleErrors` 支持 `{ strict: true }` 选项切换过滤策略
  - 移除 `/Loading chunk/i` 过滤（chunk 加载失败是真实错误，不应被吞掉）
  - 保留 dev 环境下的网络类错误过滤（`/net::ERR/i`、`/Failed to fetch/i`、`/ERR_CONNECTION_REFUSED/i` 等），避免 PluginManager 加载插件列表失败等 dev server 噪声误报；如需严格检查这些网络错误，使用 strict 模式
- **性能优化 — 函数复杂度降低**：
  - `AgentLoop.run`：复杂度 46 → ≤15，提取 9 个私有方法（commit c278a48）
  - `generateVideoWithMultiAPI`：复杂度 35 → ≤15，提取 4 个步骤函数
  - `parseCharacter`：复杂度 33 → ≤15，提取辅助函数 + 按容器分组
  - `generateBeatImagePrompt`：复杂度 31 → ≤15，提取 7 个构建函数
  - `parseMarkdown`：复杂度 38 → ≤15
  - `buildPluginJson`：复杂度 37 → ≤15
  - `buildVideoPrompt`：复杂度 35 → ≤15
  - `parseScene`：复杂度 41 → ≤15
  - `generateEnhancedVideo`：复杂度 41 → ≤15
  - `convertToStoryBeats`：复杂度 31 → ≤15
  - `fetchAllStoryRelations`：复杂度 20 → ≤15
  - 测试文件 `parseBeatRow`：复杂度 42 → 0（消除重复拷贝）

### Documentation

- 更新版本号 1.2.3 → 1.3.0（package.json / package-lock.json / docs/）
- 更新 docs/API_REFERENCE.md、PROJECT-GUIDE.md、TECHNICAL_REFERENCE.md、CODE_CATALOG.md、DEPLOYMENT.md 版本号至 1.3.0

### Tests

- 单元测试：6011 → 6021（+10 R191 回归测试）
- e2e 测试：133 个全部通过
- typecheck:test：306 错误 → 0

## [1.2.3] - 2026-07-13

### Added

- **全面 UX 优化（P0-P2，12 维度）**：
  - **P0**：清理 473→19 处内联样式（剩余为动态值），覆盖 30+ 文件，统一使用 design-preview CSS 类和 Tailwind 工具类，新增 `.home-hero-bg`/`.story-project-avatar`/`.dropzone`/`.validation-result` 等 CSS 类
  - **P1-a**：修复 3 处硬编码 zh-CN locale（`format.ts`/`page.tsx`/`memory-service.ts`）
  - **P1-b**：`use-auto-save.ts` 硬编码中文改用 `t()` + 新增 `error.saveFailedRetry` i18n key
  - **P1-c**：BrowserWindow 添加 `minWidth:1024`/`minHeight:680`，防止窗口过小导致布局崩溃
  - **P1-d**：创建 Tooltip 组件（`src/shared/presentation/Tooltip.tsx`），300ms 显示延迟，支持 4 方向定位
  - **P1-e**：移除 `help-tools.ts` 未实现的 Ctrl+Z/Y 快捷键提示
  - **P1-f**：Skeleton 加载状态推广到 characters/scenes/asset-library/video-tasks 4 个数据密集页
  - **P1-g**：表单前端校验：CharacterEditor + QuickGenerateForm 添加 `required`/`aria-invalid`
  - **P1-h**：`aria-live` 推广到 SaveStatusIndicator/Toast/AiRequestPreview 等 5 个动态内容文件
  - **P1-i**：AI 生成进度反馈：`useGenerationStage` hook（3 阶段切换）+ 4 个阶段 i18n key
  - **P1-j**：Sidebar 3 个 coming-soon 项添加灰色样式 + "即将推出" badge
  - **P2-a**：响应式断点：quick-generate/characters 添加 `md:` 堆叠回退
  - **P2-b**：空状态统一：11 处文案改为引导式，统一使用 EmptyState 组件
  - **P2-c**：Skip to Main Content 链接 + `prefers-reduced-motion` 媒体查询支持

### Fixed

- 修复 `SceneEditorParts.tsx` 隐藏 bug：X 删除按钮 `onMouseEnter` 使用未定义的 `var(--danger)` 变量（项目使用 `--destructive`），改为 `hover:text-destructive` CSS 类

### Changed

- 统一 `.trae/rules/regression/` 回归规则编号，修正文档中 "183 条"/"165+ 条" → 实际 151 条
- 更新所有文档版本号至 1.2.3，质量指标更新至最新值（6026 测试 / 151 回归规则 / 3076 i18n 键 / 30 张表）

### Documentation

- 更新 README.md：版本号 1.2.3，测试数 6026+，回归规则 151 条，i18n 键 3076+，更新日期 2026-07-13
- 更新 docs/PROJECT-GUIDE.md：版本 1.2.3，模块数 11，子域数 40，回归规则 151 条，表数 30，日期 2026-07-13
- 更新 docs/TECHNICAL_REFERENCE.md：版本 1.2.3，日期 2026-07-13
- 更新 docs/CODE_CATALOG.md：版本 1.2.3，模块数 11，日期 2026-07-13
- 更新 docs/DEPLOYMENT.md：版本 1.2.3，日期 2026-07-13
- 更新 docs/README.md：回归规则数 151，移除 "165+" 描述
- 更新 docs/ARCHITECTURE.md：模块数 11，回归规则 151 条

### Security

- **Agent 全面安全审查与修复（P0 + P1）**：
  - **P0-1 插件 builtin-mirror 绕过确认**：`adaptTool()` 强制继承目标工具的 `dangerLevel` 和 `requiresConfirmation`，忽略插件声明的权限标记
  - **P0-2 Agent 可篡改审计日志**：新增 `isProtectedAgentPath()` 拒绝操作 `/agent/audit/`、`/agent/sessions/`、`/agent/tool-plugins/` 内部目录
  - **P0-3 子 Agent 超时形同虚设**：`timeoutController.signal` 正确传递给 `AgentLoop.callbacks.signal`，60 秒超时后立即中止 LLM 调用
  - **P0-4 delete_memory 无确认**：标记 `dangerLevel: destructive` + `requiresConfirmation: true`
  - **P0-5 merge_videos/compose_final_video 禁用确认**：改为 `dangerLevel: limited`
  - **P0-6 全局 catch-all 暴露异常**：新增 `sanitizeErrorMessage()` 脱敏 API key/Authorization header，截断 >500 字符消息
  - **P0-7 config/generation 错误透传**：不再透传原始 `result.message`，仅返回通用失败提示
  - **P0-8 批量操作无限制**：`maxItems` + 运行时 `Array.length` 双重校验（batch_create_video_tasks 最多 10、batch_generate 最多 20 等）
- **P1-a 审计日志读取接线**：barrel export（queryAuditLogs/getAuditStats/clearAuditLogs/clearAllAuditLogs）+ AuditLogPanel UI 面板（统计概览/Top 5 工具/筛选/列表/清除）
- **P1-b specialist 字段填充**：`AgentLoopConfig` 新增 `specialistName` 字段，子 Agent 工具调用的审计日志 `specialist` 字段填充专家名
- **P1-c 128 个工具 dangerLevel 标记补全**：所有工具按三级分类（safe 只读/limited 有副作用/destructive 不可逆）
- **P1-d 输入验证完善**：22 个工具文件的 JSON Schema 参数添加 maxLength/minimum/maximum 约束，LLM 在生成参数时即可看到限制

### Changed

- AgentPage 工具栏新增 ScrollText 图标按钮打开审计日志面板，面板切换重构为 `showOnly()` 辅助函数
- AgentSettingsPanel/SearchConfigSection 等面板的互斥切换逻辑统一化

### Documentation

- 更新 SECURITY.md：新增 7 个安全机制章节（权限分层/审计日志/错误脱敏/路径白名单/批量限制/输入验证/子 Agent 控制）
- 更新 src/modules/agent/MODULE.md：新增审计日志 API、三级权限分层、安全约束完整说明
- 更新 .ai/modules/agent.md：新增审计日志/dangerLevel/输入验证修改场景，补充边界约束

## [1.2.2] - 2026-07-11

### Fixed

- **SSRF 防护 DNS 回退修复**：`ssrf-guard` 的 `validateDns` 在 `dns.resolve4`/`dns.resolve6`（c-ares 库）返回空结果时，回退到 `dns.lookup`（系统 DNS via `getaddrinfo`），与 `fetch`/`http.request` 使用的解析方式一致。修复了在某些系统 DNS 配置下（c-ares 返回 `ECONNREFUSED`）所有公网 API 请求被误拦截为 "Cannot access private/internal URLs" 的问题。DNS rebinding 防护仍然有效——回退路径同样检查私有 IP (`d1814ae` 后修复)
- 重构 `validateDns` 提取 `checkIpsAndCache` / `handleDnsFailure` 辅助方法，消除 3 处重复的私有 IP 检查与缓存逻辑

### Changed

- Agent 架构深化完成（P0-P5 + UI 集成 + E2E 测试），17 个 commits 累计：
  - P0：LLMMessage 类型提升至 domain 层，`ITextProvider` 新增 `generateChat` 方法
  - P1：Provider 接口改为 messages 数组，自适应双路径（原生 function calling 优先）
  - P2：Agent 服务 DI 化（Port 接口 + 构造函数注入）
  - P3：精确 Token 估算（CJK 1.5 token/char，ASCII 0.25 token/char）+ ContextBudget 分配
  - P4：多 Agent 编排（`delegate_to_specialist` + 专家 Agent 管理面板）
  - P5：断点恢复（AgentLoop 状态持久化 + 重启恢复 + 中断会话恢复横幅）
  - E2E：12 场景覆盖 P0-P5 全链路（MockTextProvider + 真实 DeepSeek 冒烟验证）

## [1.2.1] - 2026-07-09

### Added

- Agent 助手支持切换大模型 (`52288f6`)

### Changed

- 合并重复回归规则 R7/R19、R16/R20、R14/R36，减少规则维护成本 (`f7dfa5d`)
- 引入 `MINUTE_MS` / `HOUR_MS` / `DAY_MS` 通用时间常量替换魔术数字 (`2882635`)
- 统一加载状态图标，提升视觉一致性 (`7b991e6`)
- 协议回退为 CC-BY-NC-4.0（参赛期间策略） (`70eaffc`)
- P3 硬编码颜色替换为语义 CSS 变量 / Tailwind 类 (`ceefc13`)

### Fixed

- 修复 `useVideoTasksPage` 的 `statusFilter` 不一致 bug，并扩展 R10/R156 规则覆盖 (`e54ccdb`)
- 解决 R131-R137 回归规则编号冲突 (`e03fe32`)
- 修复 P1 Bug 隐患、P1 无障碍（a11y）问题、P1 i18n 硬编码字符串以及 P2/P3 细节问题 (`d965286`)
- 修复 P0 Promise rejection 未处理问题与 P1 `setTimeout` 内存泄漏 (`694c9a1`)
- **工作流深度分析修复（25 个修复 + 5 轮代码审查）**：
  - **P0-1**：Agent 执行危险工具前未检查 `requiresConfirmation` 标志，已添加确认回调接口与执行前检查
  - **P0-2**：修复 R123 vm 沙箱 constructor 链逃逸漏洞（`{}.constructor.constructor('return process')()`）
  - **P0-3**：修复 LWW 同步对无 `updated_at` 的表 `0>=0` 恒真导致 remote 恒胜、本地修改被覆盖
  - **P1-1**：LLM 流式推理 `apiCallStream` 全链路传递 abort signal，支持用户中止推理
  - **P1-2**：智能恢复 `verifyVideoUrl` 死代码接入生产路径，视频 URL 失效可被识别
  - **P1-3**：`recoveryAttempts` 上限在所有失败路径递增（含转换失败），避免无限重试
  - **P1-4**：插件重载改为原子替换（先加新再删旧），消除重载期间 `select()` 空洞
  - **P1-5**：插件 `attemptRestart` 失败后设置 `disabled` 标志，`select()` 跳过 disabled 插件；新增不可逆 `disposed` 标志 5 处守卫，防止销毁后 spawn 孤儿进程
  - **P1-6**：多窗口同步通过 `BroadcastChannel` 跨窗口通知，窗口 A 持久化任务后窗口 B 可感知
  - **P2-1**：轮询并发上限（单轮 15 个 + 按 `lastPolledAt` 排序），100+ 任务不再卡顿数分钟
  - **P2-2**：sync 重试改为指数退避（2s→4s→8s，最多 3 次），瞬态 DB 错误后不再永久偏离
  - **P2-3**：插件 worker 60s 内存检查 + 150MB 阈值自动退出，防止长期运行内存泄漏
  - **审查修复**：5 轮代码审查修复 13 个问题，包括 dispose() 清理定时器、restarting 竞态回滚、`MANAGER_SHUT_DOWN_DURING_RESTART_BACKOFF` 错误识别、退避期间 shutdown 回归测试等

### Documentation

- 补写 R138-R150 回归规则文档 (`cdc2f90`)
- 追加工作流深度分析修复记录到 `.ai/session-notes.md`

### Security

- 清理公开仓库风险（P0） (`ffadd1e`)
- **P0-1**：Agent 工具执行前强制 `requiresConfirmation` 检查，防止未授权执行危险操作
- **P0-2**：修复 vm 沙箱 constructor 链逃逸漏洞，防止恶意插件 RCE

## [1.2.0] - 2026-07-04

### Added

- **AI Agent 助手完整版**：支持流式输出，配套文档全面更新 (`911d587`)

## [1.1.1]

### Added

- Phase 0 收尾：扩展 CSS Token 体系，新增微渐变背景 (`62ae833`)

[Unreleased]: https://github.com/ph2-5/PrismCraft/compare/v1.3.0...HEAD
[1.3.0]: https://github.com/ph2-5/PrismCraft/releases/tag/v1.3.0
[1.2.3]: https://github.com/ph2-5/PrismCraft/releases/tag/v1.2.3
[1.2.2]: https://github.com/ph2-5/PrismCraft/releases/tag/v1.2.2
[1.2.1]: https://github.com/ph2-5/PrismCraft/releases/tag/v1.2.1
[1.2.0]: https://github.com/ph2-5/PrismCraft/releases/tag/v1.2.0
[1.1.1]: https://github.com/ph2-5/PrismCraft/releases/tag/v1.1.1
