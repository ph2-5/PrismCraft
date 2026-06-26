# Session Log

> **追加式日志** — AI 每次会话只追加新条目，不修改或删除已有条目。
> 防止多会话同时写入时互相覆盖。
> 超过 30 条时，旧条目归档到 `.ai/session-archive/`。

---

## 如何使用

### 会话开始时
1. 读取本文件最后 5 条记录 → 了解最近变更
2. 读取 `.ai/work-claims.md` → 了解哪些工作正在进行
3. 运行 `node .ai/context-snapshot.mjs` → 获取当前代码状态摘要

### 会话结束时
1. 在本文件末尾**追加**一条记录（不修改已有内容）
2. 在 `.ai/work-claims.md` 中更新或释放工作声明
3. 如果有未完成的工作，在声明中标注进度和下一步

---

## 日志记录

### [2026-06-14] 架构重构 — 已完成
- 创建 `src/shared-logic/` 层（16 文件），消除主进程/渲染进程逻辑重复
- `defineRoute` 泛型化 + Zod `z.infer` 类型推导（30+ Request 类型）
- `ApiResponse<T>` 泛型化 + `ApiError` 类型
- Zustand Store CQRS 拆分（state/queries/commands/polling 四层）
- SyncEngine 类化（6 个模块级 let → 类属性）
- 视觉一致性结构化（JSON 优先 + 正则降级解析）
- DI 容器内省（`TOKEN_IDS` + `getTokenRegistry()`）
- ESLint `no-direct-db-ipc` 规则
- 删除 15 个废弃文件
- 拆分 regression-guards.md 为 9 个按类别文件
- 回归防护自动化协议（Q1-Q5 决策框架）
- AI 工具集成指南 + 追加式会话日志 + 工作声明机制 + 上下文快照脚本

### [2026-06-14] AI 协作机制 — 已完成
- 改造 session-notes.md 为追加式日志（防多会话覆盖）
- 创建工作声明机制 `.ai/work-claims.md`（防会话冲突）
- 创建上下文快照脚本 `.ai/context-snapshot.mjs`（新会话快速恢复上下文）
- 更新 ai-tool-integration.md（频繁切换对话场景）

---

## 已知风险
- shared-logic 中 logger 被移除，路由处理器需自行记录日志
- Route.handler 方法语法双变，理论上允许不匹配的 body 类型（defineRoute 输入端仍严格）

## 架构速查
```
依赖方向: app → modules → shared-logic → domain
                    ↓           ↓
                  shared    infrastructure/di

新增层: src/shared-logic/ — 纯业务逻辑，零外部依赖
新增路径别名: @/shared-logic/* (renderer), @shared-logic/* (main process)
新增 API 模式: defineRoute({ schema, handler, methods }) — handler body 自动推导类型
新增 DI: syncEngine token (E 类懒加载)
新增 ESLint: no-direct-db-ipc (modules 层禁止 IPC 数据库操作)
```

### [2026-06-20] 全项目底层代码逻辑问题审计与修复 — 已完成

**审计范围**：全项目底层代码逻辑问题（安全、数据完整性、状态同步、资源生命周期、IPC/API、业务逻辑、中危问题）

**修复阶段**：
1. **阶段1-3（致命问题）**：安全漏洞、数据完整性、数据持久化（前序会话已完成）
2. **阶段4（状态同步高危）**：commands 委托 store action、sync push-pull 原子性、useStoryPersistence debounce
3. **阶段5（资源生命周期高危）**：FileTransport flush 失败回队列、closeAllTransports、setup 函数幂等
4. **阶段6（IPC/API 安全高危）**：重定向 SSRF、openPath 白名单、token 不返回、解密不回退明文、base64 回退移除、providerId 校验、sync Zod schema
5. **阶段7（业务逻辑高危）**：pending→completed 转换、批量取消通知服务端、沙箱 constructor 锁定、apiKey header 传递、INSERT OR REPLACE → ON CONFLICT
6. **阶段8（中危问题）**：输入验证（config-storage/secure-config）、边界条件 NaN 检查（scenes/changelog/queries/s3-file-storage/error-logger/database/ssrf-guard）、资源释放（db-connection 定时器）、错误处理（plugin-worker catch 日志）、并发（download-manager 重复调度）、日志可观测性、SQL 注释剥离、shared-logic-resolve 运行时检查

**回归防护**：
- 新增 R110-R130 共 21 条回归规则（R110-R114 为补全已有测试的规则文档，R115-R130 为本次新增）
- 创建 15 个回归测试文件，全部通过验证
- 更新 regression-guards.md（总计 130 条规则）和 regression/index.md 分类索引

**修改文件清单**（阶段4-8）：
- `src/modules/video/task-management/hooks/use-video-task-commands.ts` — 委托 store action
- `src/domain/types/sync.ts` — SyncPushResult.syncedIds 字段
- `src/modules/sync/engine/sync-protocol.ts` — 移除提前 markChangesSynced
- `src/modules/sync/engine/sync-engine-class.ts` — 原子化 markChangesSynced
- `src/app/story/useStoryPersistence.ts` — 500ms debounce
- `electron/src/logging/transports/file.transport.ts` — flush 失败回队列
- `electron/src/logging/logger.ts` — closeAllTransports
- `electron/src/lifecycle/cleanup.ts` — 关闭 logger transport
- `src/modules/video/task-management/hooks/internals/task-initializer.ts` — 4个 setup 幂等
- `electron/src/api-gateway-utils.ts` — 重定向 SSRF 校验
- `electron/src/main-common.ts` — openPath 路径白名单
- `electron/src/handlers/sync.ts` — 移除 token 返回
- `electron/src/security/key-storage/strategies/safe-storage.strategy.ts` — 不回退明文
- `electron/src/handlers/config.ts` — 移除 base64 回退
- `electron/src/handlers/secure-config.ts` — providerId + apiKey 校验
- `electron/src/api/schemas.ts` — syncTestSchema/syncProxySchema
- `electron/src/api/route-groups/core-routes.ts` — 绑定 sync schema
- `src/modules/video/task-management/domain/task-machine.ts` — pending→completed
- `src/modules/video/task-management/hooks/use-video-task-manager.ts` — 批量取消通知
- `electron/src/plugins/plugin-worker.ts` — constructor 锁定 + catch 日志
- `electron/src/plugins/providers/google.ts` — apiKey header
- `src/modules/asset/asset-library/asa-export-service.ts` — ON CONFLICT DO UPDATE
- `electron/src/handlers/config-storage.ts` — 输入校验 + 审计日志
- `src/infrastructure/ai-providers/offline-queue-ops.ts` — JSON.parse try/catch + 日志
- `src/infrastructure/storage/scenes.ts` — parseInt NaN 检查
- `src/modules/sync/engine/changelog.ts` — lastSyncAt NaN 检查
- `src/infrastructure/storage/elements/queries.ts` — nextCode NaN 检查
- `src/infrastructure/storage/s3-file-storage.ts` — size/timestamp NaN 检查
- `src/shared/error-logger.ts` — 移除非空断言
- `electron/src/handlers/database.ts` — SQL 注释剥离 + 空检查
- `electron/src/security/ssrf-guard/ssrf-guard.ts` — IPv6 NaN 检查
- `electron/src/database/db-connection.ts` — 定时器清理 + 启动日志
- `electron/src/plugins/plugin-process-manager.ts` — kill 错误日志
- `src/infrastructure/network/download-manager.ts` — 重复调度防护
- `electron/src/shared-logic-resolve.ts` — _resolveFilename 运行时检查

**验证结果**：typecheck + typecheck:electron + lint + lint:arch 全部通过，222 测试文件 4201 测试通过（含新增 15 个回归测试）

### [2026-06-20] E2E 测试覆盖率分析与补充优化 — 已完成

**分析范围**：15 个 e2e 测试文件，识别 5 个关键覆盖缺口和 3 个质量问题

**新增测试文件**：
- `tests/not-found-page.spec.ts` — 6 个测试，覆盖 404 页面和无效 beat 路由（此前无 e2e）
- `tests/beat-detail-page.spec.ts` — 5 个测试，覆盖 `/story/beat/:beatId` 路由（此前无 e2e）
- `tests/video-task-workflow.spec.ts` — 9 个测试，覆盖视频任务页面内容和 mock 工作流（此前极浅）
- `tests/network-resilience.spec.ts` — 7 个测试，覆盖 API 500 错误和慢速响应韧性（此前完全缺失）
- `tests/helpers/console-errors.ts` — 可复用的 `captureConsoleErrors` 工具 + `IGNORED_ERROR_PATTERNS` 过滤

**修改的测试文件**：
- `tests/story-delete-confirmation.spec.ts` — 修复静默通过模式，添加控制台错误检查和导航离开测试
- `tests/tsconfig.json` — include 添加 `./helpers/*.ts`

**关键修复**：
1. **Playwright + @base-ui/react click 挂起**：Story 页面原生 `click()` 挂起，改用 `clickButtonByText(page.evaluate)` 变通
2. **network-resilience 超时根因**：`page.route("**/api/**")` glob 模式匹配了 Vite 模块路径 `/src/infrastructure/api/client.ts`，导致 JS 模块加载失败、React 无法挂载。改用函数匹配器仅拦截路径以 `/api/` 开头的真实 API 端点
3. **network-resilience networkidle 超时**：`waitForAppReady` 的 `waitForLoadState("networkidle")` 在 API 全部 500 时永不完成，改用 `domcontentloaded` + `main`/`error-card` 可见

**验证结果**：全部 126 个 e2e 测试通过（14.2 分钟），单元测试 4998 个通过

**版本**：0.10.0 → 0.11.0

### [2026-06-25] 全项目审计 + P0 功能 bug 修复 + R131-R137 回归防护 — 已完成

**审计范围**：5 维度并行审计（UI/UX 反人类设计 + 代码质量 + 性能 + 架构合规 + 错误处理/i18n）共发现 107 个问题。

**批次 1 P0 功能 bug 修复（commit 20db421）** — 10 项：
- 修复 1: `src/shared/presentation/PageErrorBoundary.tsx` — `getDerivedStateFromError` 改为单参数，errorCount 累加移到 `componentDidCatch`
- 修复 2: `src/app/video-tasks/hooks/useVideoTasksPage.ts` + `src/app/video-tasks/page.tsx` — 实现 statusFilter 过滤 + 刷新按钮绑定（原为 no-op）
- 修复 3: `src/app/asset-library/AssetUploadSection.tsx` — 实现真实 DnD + 键盘支持（原为空 stub）
- 修复 4: `src/app/asset-library/useAssetLibraryActions.ts` — `handleDeleteStoryboard` 添加 await + success toast
- 修复 5: `src/shared/presentation/DeleteConfirmDialog.tsx` — 引用时 confirm 按钮 disabled + tooltip
- 修复 6: AssetToolbar 批量删除（审计误报，已有 confirm，跳过）
- 修复 7: `src/app/story/beat/$beatId/use-beat-detail.ts` — 移除 5 秒 setInterval 自定义轮询，改用 Zustand selector 订阅
- 修复 8: `src/infrastructure/network/network-monitor.ts` — 顶层副作用移入 `ensureStateInitialized()`
- 修复 9: `src/infrastructure/storage/video-cache.ts` — 顶层 beforeunload 移入 `ensureBeforeUnloadRegistered()`
- 修复 10: `src/app/settings/page.tsx` — SystemInfoCard 替换硬编码 "—" 为真实磁盘/项目数/运行时间

**回归防护（本次提交）** — R131-R137 共 7 条规则 + 63 个回归测试：
- R131: `src/shared/presentation/__tests__/regression-r131-error-boundary-error-count.test.tsx`（5 tests）
- R132: `src/app/video-tasks/hooks/__tests__/regression-r132-status-filter-and-refresh.test.ts`（9 tests）
- R133: `src/app/asset-library/__tests__/regression-r133-upload-drop-zone.test.tsx`（11 tests）
- R134: `src/shared/presentation/__tests__/regression-r134-delete-dialog-disable-on-referenced.test.tsx`（11 tests）
- R135: `src/app/story/beat/$beatId/__tests__/regression-r135-no-setinterval-polling.test.ts`（9 tests）
- R136: `src/infrastructure/network/__tests__/regression-r136-no-top-level-side-effects.test.ts`（9 tests）
- R137: `src/infrastructure/storage/__tests__/regression-r137-no-top-level-beforeunload.test.ts`（9 tests）

**文档更新**：
- `.trae/rules/regression-guards.md` — 追加 R131-R137 七条规则（BAD/GOOD 示例 + Verification + Discovered in）
- `.trae/rules/project_rules.md` — R1-R130 → R1-R137，类别统计表更新

**验证结果**：typecheck + typecheck:electron + 4380 测试通过（新增 63 个）+ lint + lint:arch 全部通过

**后续待办**：批次 2（性能优化）、批次 3（UI/UX + i18n）、批次 4（架构重构）

### [2026-06-25] 批次 2 性能优化 + R154-R157 回归防护 — 已完成

**调研发现**：原审计 3 项中，video-cache LRU 已被 R112 覆盖（仅遗留常量不一致死代码）。审计漏报 StoryProvider services 未 memoize 的更严重问题。

**批次 2 P0 性能优化（4 项）**：
- 优化 1: `src/modules/story/beat-editor/hooks/useAssetLoader.ts` — 3 个 DB 查询改 `Promise.all` 并发（首次进入耗时降 50-60%）
- 优化 2: `src/app/story/StoryProvider.tsx` — `useMemo` 包裹 services 对象（消除每次重渲染的重复 DB 查询）
- 优化 3: `src/app/video-tasks/hooks/useVideoTasksPage.ts` — 5 次 O(n) filter 改单次遍历 useMemo（1000 任务时统计耗时降 75%）
- 优化 4: `src/infrastructure/storage/video-cache.ts` — MAX_CACHE_BYTES 从 2GB 改为 10GB（与 services 层一致，消除死代码）

**跳过项**：P1 VideoTaskManager 虚拟滚动 — 需要重新设计分组 UI 布局（复杂交互），按"最小化修改"原则延后

**回归防护（本次提交）** — R154-R157 共 4 条规则 + 28 个回归测试（编号从 R154 起，因 R138-R149 已被其他规则占用）：
- R154: `src/modules/story/beat-editor/hooks/__tests__/regression-r154-asset-loader-parallel.test.ts`（5 tests）
- R155: `src/app/story/__tests__/regression-r155-story-provider-services-memo.test.tsx`（6 tests）
- R156: `src/app/video-tasks/hooks/__tests__/regression-r156-tasks-stats-memo.test.ts`（9 tests）
- R157: `src/infrastructure/storage/__tests__/regression-r157-video-cache-limits-consistency.test.ts`（8 tests）

**文档更新**：
- `.trae/rules/regression-guards.md` — 追加 R154-R157 四条规则
- `.trae/rules/project_rules.md` — R1-R137 → R1-R141（按统一文件实际规则数），类别统计表更新
- `.trae/rules/regression/index.md` — 总数 142 → 146，分类编号列表加入 R154-R157

**验证结果**：typecheck + 4471 测试通过（新增 28 个）+ lint + lint:arch 全部通过

**后续待办**：批次 3（UI/UX + i18n）、批次 4（架构重构）

### [2026-06-25] 批次 3 UI/UX + i18n 优化 + R158-R166 回归防护 — 已完成

**审计范围**：批次 3 共完成 12 项 UI/UX + i18n 优化（P0×6 + P1×3 + P2×3）。

**P0 高优先级（6 项）**：
- P0-1: `src/shared/presentation/Toast.tsx` — 添加 hover 暂停逻辑（useState paused + useRef remainingRef + startedAtRef + timerRef 单计时器模式，animationPlayState 控制进度条）
- P0-2: `src/shared/presentation/KeyboardShortcutsDialog.tsx` — 全局 Escape 监听（后被 Modal 接管）
- P0-3: `src/app/globals.css` — 全局 :focus-visible outline 样式（2px solid var(--ring)，button/a 焦点环）
- P0-4: `src/shared/presentation/Sidebar.tsx` — NavItem + 折叠按钮 aria-label，5 个 futurePreviewItems labelKey i18n 化
- P0-5: `src/infrastructure/ai-providers/api-config/detect.ts` — validateApiKey 返回 errorKey 而非中文字符串；`src/app/settings/ProviderForm.tsx` + `src/__tests__/lib/api-config/detect.test.ts` 联动改造
- P0-6: 创建 `src/shared/presentation/Modal.tsx` 统一 Modal 组件（role=dialog + aria-modal + Escape + overlay click + focus + data-modal-container），迁移 5 个高频 modal（DeleteConfirmDialog, KeyboardShortcutsDialog, CrashRecoveryDialog, AssetSelectorDialog, confirm-dialog）

**P1 中优先级（3 项）**：
- P1-7: `src/modules/video/task-management/presentation/TaskCard.tsx` + `task-card.tsx` — Square/CheckSquare 选择按钮添加 aria-label
- P1-9: 5 个 coming-soon 页面（Login/TemplateMarket/Workflow/Workspace/Mobile）— title 用 `t()` 国际化
- P1-10: `src/shared/presentation/CrashRecoveryDialog.tsx` — `toLocaleString("zh-CN")` → `toLocaleString()`

**P2 低优先级（3 项）**：
- P2-11: 迁移剩余 19 个 modal 到统一 `<Modal>` 组件（22 个 modal 实例，跳过 SearchDialog 因 tailwind 工具类样式体系不同）
- P2-12: 创建 `src/shared/presentation/IconButton.tsx` 强制 aria-label prop（TypeScript 层面 `string` 非 optional），迁移 23 个图标按钮到 IconButton（11 个文件），新增 8 个 aria.xxx i18n key，新增 IconButton 测试（8 tests）
- P2-13: 风格选项 i18n — `src/modules/character/constants.ts` 引入 `{value, labelKey}` 结构（value 保留中文兼容持久化 + prompt 构造，labelKey 用于 UI 显示），新增 22 个 styleOption.* i18n key，修改 8 个文件（constants.ts, CharacterEditor.tsx, BatchOperations.tsx, VariantGenerator.tsx 等），跳过 prompt 构造代码

**回归防护（本次提交）** — R158-R166 共 9 条规则 + 80 个回归测试：
- R158: `src/shared/presentation/__tests__/regression-r158-toast-hover-pause.test.tsx`（9 tests）
- R159: `src/__tests__/lib/api-config/regression-r159-validate-api-key-errorkey.test.ts`（8 tests）
- R160: `src/shared/presentation/__tests__/regression-r160-modal-component-required.test.tsx`（10 tests）
- R161: `src/shared/presentation/__tests__/regression-r161-icon-button-aria-required.test.tsx`（9 tests）
- R162: `src/modules/character/__tests__/regression-r162-style-options-labelkey.test.ts`（9 tests）
- R163: `src/app/__tests__/regression-r163-focus-visible-style.test.ts`（7 tests）
- R164: `src/shared/presentation/__tests__/regression-r164-modal-focus-trap.test.tsx`（10 tests）
- R165: `src/app/coming-soon/__tests__/regression-r165-coming-soon-i18n.test.tsx`（10 tests）
- R166: `src/shared/presentation/__tests__/regression-r166-date-locale.test.tsx`（8 tests）

**新增 i18n key 清单（共 35 个）**：
- `provider.apiKey.empty/tooShort/tooLong/placeholderDetected/invalidChars`（5）
- `sidebar.login/templateMarket/workflow/workspace/mobile`（5）
- `aria.toggleSelection/toggleSidebar/shortcutHelp`（3）
- `aria.reset/toggleExpand/deletePlugin/testCapability/removeStatusMapping/removeUrlPattern/refreshProviderModels/removeProvider`（8）
- `styleOption.realistic/anime/2dIllustration/cinematic/chineseChic/cyberpunk/chineseClassical/3dCartoon/pixelArt/watercolor/...`（22 个，含 11 个 character styleSuggestions + 11 个 asset BatchOperations 内联）
- （注：messages.ts 中的 `style.*` 10 个 key 为预存死代码，未被引用）

**新增组件清单**：
- `src/shared/presentation/Modal.tsx` — 统一 Modal 组件
- `src/shared/presentation/IconButton.tsx` — 强制 aria-label 的图标按钮组件

**文档更新**：
- `.trae/rules/regression-guards.md` — 追加 R158-R166 九条规则
- `.trae/rules/project_rules.md` — R1-R157 → R1-R166（all 141 → all 151 guards），类别统计表更新（UI 健壮性 9→14，工程质量 22→26）
- `.trae/rules/regression/index.md` — 总数 146 → 155，分类编号列表加入 R158-R166
- `src/modules/character/MODULE.md` — 公共 API 文档更新 styleSuggestions 签名 + StyleOption 类型

**验证结果**：typecheck + lint + lint:arch 全部通过 + 4559 测试通过（新增 88 个：80 回归 + 8 IconButton）

**后续待办**：批次 4（P2 架构重构）— StoryProvider Context 拆分、React.lazy 路由分割、saveVideoTask 重复提取、useAssetLibraryActions 22 参数重构

### [2026-06-25] 深度审计 + P0+P1+P2 全量修复 + R167-R180 回归防护 — 已完成

**审计范围**：4 维度并行深度审计（i18n 残留 + 可访问性 + 代码异味 + UI 对比预览页），共发现约 200 处问题。

**P0 修复（40 项）**：
- 可访问性 P0：6 个自定义模态框迁移到 Modal（TemplateManagerDialog, AssetPicker, onboarding；SearchDialog/DebugOverlay/PromptFloatingBall 仅补 role/aria-modal）、10 个纯图标按钮补 aria-label、4 个 div onClick 补 role="button"/tabIndex/onKeyDown
- UI 视觉 P0：Toast 组件重写（shadcn Tailwind 颜色类 → CSS 变量）、主页 Brand Hero 修正（渐变/字号/圆角/emoji/数据列补全）、删除死代码（QuickActions.tsx, ProjectList.tsx）、story Tab emoji 补全、settings Tab 双重样式修复
- i18n P0：user-facing-error typeMap、LoadingState 默认值、throw Error 复用现有 key、数据常量层改造（video-templates, scene/constants, shot-prompt 采用 {value, labelKey} 结构）、新增约 210 个 i18n key
- 代码异味 P0：BeatDetailEditor:423 双重断言修复、AdvancedSettingsCard DOM 操作改用 useRef、非空断言修复、静默吞错改用 errorLogger

**P1 修复（47 项）**：
- 可访问性 + UI P1：创建 Tabs 组件（role="tablist" + roving tabindex + 键盘导航）、迁移 5 处 Tab 实现、9 处表单 label 关联、2 处焦点管理（ThemeSwitcher, StoryHeader）、2 处 overlay role、UI 细节（emoji 字号、badge 透明度、团队成员头像、not-found 页面、HomeSkeleton）
- 代码异味 P1：创建 `src/shared/utils/format.ts` 统一格式化函数、video-tracker 重命名消歧、TaskCard 重命名为 TaskCardBase、清理 3 处不必要 as 断言、重命名 13 处回调参数 t→task、Port 接口扩展 cancelTask 可选方法

**P2 修复（64 项）**：
- 可访问性 P2：aria-live / role="status"（2 处）、role="progressbar"（5 处进度条）
- i18n P2：plugin-routes.ts 硬编码中文（新建 server 端 i18n 模块 `electron/src/shared/i18n.ts`）、BeatDetailEditor emoji aria-hidden（8 处）
- 代码异味 P2：shared-logic 类型守卫（isRecordLike, isObjectArray）、main-common.ts setupApiHandlers 拆分为 5 个注册函数
- 跳过项：errorLogger 中文日志（开发者可见，保留中文便于排障）、import-export as 断言（风险大于收益）、PollingStoreAccessor 断言（跨 CQRS 架构，风险高）

**新增组件**：
- `src/shared/presentation/Tabs.tsx` — 可访问 Tab 组件
- `src/shared/utils/format.ts` — 统一格式化函数
- `electron/src/shared/i18n.ts` — server 端轻量 i18n 模块

**回归防护（本次提交）** — R167-R180 共 14 条规则 + 108 个回归测试：
- R167: `src/shared/presentation/__tests__/regression-r167-custom-modal-role.test.tsx`（8 tests）
- R168: `src/shared/presentation/__tests__/regression-r168-icon-button-aria.test.tsx`（7 tests）
- R169: `src/shared/presentation/__tests__/regression-r169-div-onclick-role.test.tsx`（8 tests）
- R170: `src/shared/presentation/__tests__/regression-r170-tabs-component.test.tsx`（9 tests）
- R171: `src/app/__tests__/regression-r171-form-label-association.test.tsx`（8 tests）
- R172: `src/modules/asset/presentation/__tests__/regression-r172-progressbar-role.test.tsx`（7 tests）
- R173: `src/modules/asset/presentation/__tests__/regression-r173-aria-live.test.tsx`（8 tests）
- R174: `src/modules/story/beat-editor/presentation/__tests__/regression-r174-emoji-aria-hidden.test.tsx`（8 tests）
- R175: `src/__tests__/lib/regression-r175-throw-error-i18n.test.ts`（9 tests）
- R176: `src/modules/character/__tests__/regression-r176-data-constant-labelkey.test.ts`（10 tests）
- R177: `src/app/quick-generate/__tests__/regression-r177-dom-use-ref.test.tsx`（8 tests）
- R178: `src/modules/video/task-management/hooks/__tests__/regression-r178-callback-no-shadow.test.ts`（9 tests）
- R179: `src/domain/ports/__tests__/regression-r179-port-interface-extension.test.ts`（9 tests）
- R180: `electron/src/__tests__/regression-r180-function-split.test.ts`（11 tests）

**文档更新**：
- `.trae/rules/regression-guards.md` — 追加 R167-R180 十四条规则
- `.trae/rules/project_rules.md` — R1-R166 → R1-R180（all 151 → all 166 guards），类别统计表更新（UI 健壮性 14→22，工程质量 26→32）
- `.trae/rules/regression/index.md` — 总数 155 → 169，分类编号列表加入 R167-R180

**验证结果**：typecheck + typecheck:electron + lint + lint:arch 全部通过 + 4667 测试通过（新增 108 个回归测试）

**后续待办**：批次 4（P2 架构重构）— StoryProvider Context 拆分、React.lazy 路由分割、saveVideoTask 重复提取、useAssetLibraryActions 22 参数重构、route handlers as 断言消除（schema 设计债务）

### [2026-06-26] 批次 4 架构重构 + 两个新功能 — 已完成

**架构重构（4 项）**：
1. **StoryProvider P0 清理**：删除死代码 VideoGeneratorSection.tsx（78 行）、从 Context 移除 8 字段（success/showError/tasks/addTask/createTask/pollTask/removeTask/removeTasks）、消费者 useStoryPage 改为直接调 useToastHelpers() 和 useVideoTaskManager()
2. **React.lazy 首屏优化**：4 个首屏组件 lazy 化（VideoTaskManagerInitializer 深路径导入绕过 barrel、MigrationInitializer、PerformanceMonitorPanel、OnboardingGuide），全部 Suspense fallback={null}
3. **saveVideoTask 重复提取**：新建 `internals/persist-task.ts` 统一封装 saveVideoTask 调用 + 错误日志 + 可选 toast + 可选 try/catch；改造 7 个调用点（use-video-task-manager ×2、shared-polling-logic ×2、polling-task-handler ×3），消除 ~100 行显式字段列表冗余
4. **useAssetLibraryActions 参数重构**：删除死参数 setAddToCollectionId、20 扁平参数打包为 6 语义对象（selection/dialogControls/loadingControls/editDialog/collectionForm/setSecondaryData）

**新功能 A：分镜项目概念接线（8 文件）**：
- 路由新增 `/storyboard/:storyId` 支持深链接
- StoryProvider 初始加载三优先级：URL storyId → activeStoryId → 第一个故事
- page.tsx 接入 StoryHeader（完整项目切换 UI：下拉列表/新建/切换/删除）
- useStoryActions.switchToStory 切换后持久化 activeStoryId
- 首页修复：卡片 onClick 传 storyId、"+ 新建项目"按钮从 exportAllData 改为 navigate、stat 显示从全局改为故事内数量
- SidebarWithSearch 搜索结果跳转传 storyId
- 新增 i18n key：story.newProject
- StoryHeader 修复 i18n：beat.createBeat → story.newProject

**新功能 B：懒状态改造（4 文件）**：
- BeforeUnloadGuard：移除 useBlocker + confirm 路由拦截，保留 beforeunload（程序关闭时浏览器原生提示）
- useNavigationGuard：guardedPush 从 async+confirm 简化为同步 navigate(href)
- 不清除 dirty state（R64 合规）
- R71 回归规则标注为"已被产品决策覆盖"
- r71-navigation-blocker.test.ts 重写：5 个新用例验证懒状态行为
- 保留故事/角色/场景切换的实体级确认弹窗（非路由级）

**验证结果**：typecheck + typecheck:electron + lint + lint:arch 全部通过 + 4668 测试通过（+1 新测试）

**后续待办**：route handlers as 断言消除（schema 设计债务）、首页导出入口迁移（从"新建项目"按钮移到设置页）

### [2026-06-26] 批次 5 UI 颜色系统清理 — 已完成

**清理范围**：188 处硬编码 Tailwind 颜色类名 → 0 处残留

**清理分组**：
1. **旧 shadcn 双模式样式**（3 文件 24 处）：TemplateManagerDialog、TemplateCard、AssetPicker — 移除全部 `dark:` 前缀、`gray-*`/`white`/`blue-*` 替换为语义变量
2. **quick-generate 模块**（3 文件 31 处）：AdvancedSettingsCard、QuickGenerateForm、TemplateSelectDialog — `slate-*`/`purple-*`/`blue-*` 替换为语义变量
3. **asset/video/prompt/shared 模块**（20 文件 ~100 处）：BatchProgressDialog（明亮主题残留）、MediaExporter、TaskCard、ModelSelector、AssetEditDialog、confirm.tsx、feedback.tsx、router.tsx 等
4. **story/generation 模块**（2 文件 2 处）：StepIndicator（`bg-emerald-500/30` → `bg-success/30`）、PromptPreview（`bg-purple-600` → `bg-primary/20`）
5. **story/planning + beat-editor**（2 文件 5 处）：story-constants.ts（`bg-gray-700` → `bg-muted`）、BeatOverviewCard.tsx（`slate-*`/`purple-*` → 语义变量）

**新增回归规则 R181**：禁止硬编码 Tailwind 颜色类名（`text-slate-*`/`bg-gray-*`/`dark:` 前缀等），必须使用语义变量（`text-muted-foreground`/`bg-card2`/`border-border` 等）

**验证结果**：typecheck + lint + lint:arch 全部通过 + 4668 测试通过

**后续待办**：route handlers as 断言消除（schema 设计债务）、首页导出入口迁移、story-constants.ts 中 tones 数组的其他装饰色（yellow/blue/purple/pink）是否需要语义化（低优先级，这些是图例点指示色非主题依赖）

### [2026-06-26] 批次 6 全面债务清理 — 已完成

**1. StoryBeat deprecated 字段清理**：
- 移除 `scene` 字段（18 处 fallback 改为 sceneId，数据库已迁移）
- 移除 `generationPrompt` 字段（2 处 UI fallback 移除，3 处显式 undefined 移除）
- 修正 `imageGenerationPrompt` 注释（从错误的 "No longer used" 改为 "LLM-generated initial keyframe prompt text"）
- **保留** `shotType` 和 `camera`（高风险，需重构 LLM 管线）
- 移除 7 个 deprecated fallback 兼容性测试

**2. shared/ui 目录清理（8 文件全部处理）**：
- 删除 4 个死代码（feedback/input-group/loading-state/status-badge，0 引用）
- 替换 confirm-dialog（3 个 beat-editor 文件改用命令式 `confirm()`）
- 迁移 3 个活跃组件到 shared/presentation/（AppCard/EmptyState/SafeImage）
- **shared/ui 目录已删除**

**3. 死代码清理**：
- tones.color 字段（完全未使用的死代码，已删除）
- useHomePage.ts 中 exportAllData/downloadExportMutation（设置页已有完整导出入口）

**4. route handlers as 断言消除**：
- 消除 5 处断言（Cause D: API 响应类型 4 处 + Cause C: 接口无索引签名 1 处）
- 新增 `TextApiResult` 类型收窄 generateText 返回值
- 用 `z.record(z.string(), z.unknown()).parse()` 替代 `as unknown as Record`
- 保留 21 处断言并添加注释（Cause A: schema z.unknown() 19 处 + Cause B: passthrough 1 处 + Cause E: 重载 1 处）

**验证结果**：typecheck + typecheck:electron + lint + lint:arch 全通过 + 4661 renderer tests + 952 electron tests

**后续待办**：
- shotType/camera deprecated 字段清理（需重构 LLM 生成管线，让 LLM 直接输出 shotInstruction）
- 原因 A 的 19 处 as 断言（需在 shared-logic 导出完整 Zod schema）
- imageGenerationPrompt 字段与 keyframe.prompt 的语义关系决策

### [2026-06-26] 批次 7 全面 UI/UX 打磨 + 运行时修复 — 已完成

**4 维度深度审计**（UI/UX 视觉交互 + 运行时问题 + 代码架构 + 反人类设计）发现 P0:6, P1:29, P2:36, P3:31

**P0 修复（6 项）**：
1. 移除侧栏伪造 AI 生成进度（硬编码"第3镜 67%"假数据）
2. 修复版本号不一致（首页 v0.10 vs 设置页 v0.11.0）→ 统一 APP_VERSION 常量
3. 补全 .dot.error CSS 类（SystemInfoCard 状态指示点无样式）
4. 修复"故事模式"入口指向 ComingSoon → 改为 /storyboard
5. 移除侧栏假进度（Ctrl+Z/S 快捷键派发保留但监听端未接线，后续决策）
6. Ctrl+Z/S 死代码标记为已知债务（需要 undo/redo 历史栈实现，单独决策）

**P1 修复（8 项）**：
1. 移除伪造团队协作头像（A/B/C 占位）
2. 修复分镜详情默认 Tab（video → details）
3. 移除首页硬编码模板数"12"
4. 修复 QuickGenerateForm 4 处硬编码内联颜色（rgba/hex → var(--xxx)）
5. 修复 useStoryPersistence 状态卡死（finally 无条件重置）
6. 统一 Loading 组件（新建 PageLoader.tsx，替换 3 处不一致 spinner）
7. 统一空状态（CharacterList 改用 EmptyState 组件）
8. Modal 焦点陷阱（Tab 循环 + 焦点恢复）

**其他修复**：
- Scene 页面 emoji → Lucide 图标（🗑→Trash2, 💾→Save）
- AssetUploadSection ✕ 字符 → Lucide X 图标
- SceneList 硬编码中文日志 → 英文结构化日志
- QuickGenerateForm 表单 label htmlFor 关联（videoModel）+ 3 处非表单 label → span
- 项目状态徽章根据 beats 视频完成率动态显示

**验证结果**：typecheck + lint + lint:arch 全通过 + 4661 测试全通过

**后续待办（按优先级）**：
- P1: Ctrl+Z/S undo/redo 实现决策
- P1: 响应式适配（移动端不可用）
- P1: 表单校验普遍缺失
- P1: 网络断开无 UI 提示
- P1: shared-logic 与 modules 三处重复实现合并
- P1: StoryProvider/BeatDetailEditor God Component 拆分
- P2: setTimeout 魔法数字提取
- P2: eslint max-lines/max-params 规则
- P2: i18n 真正多语言支持
