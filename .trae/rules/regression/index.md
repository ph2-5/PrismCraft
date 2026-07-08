# Regression Guards — 分类索引

> 这些规则是**回归防护**（regression guards）——防止已知 bug 模式再次出现。
> 它们**不是**未来审计的发现工具。未来审计必须从使用场景出发，而非从此列表出发。

**⚠️ 关键隔离原则**：规则是回归防护，NOT 发现工具。不要用此列表作为未来审计的起点。

**总计：187 条规则 | 8 个分类**

| 分类 | 规则编号 | 规则数 | 文件 |
|------|---------|--------|------|
| 一、数据一致性 | R1, R2, R8, R9, R13, R14, R30, R36, R37, R42, R45, R64, R65, R66, R68, R69, R72, R109, R116, R125, R141, R150, R157 | 23 | [data-consistency.md](data-consistency.md) |
| 二、异步安全 | R4, R10, R11, R12, R29, R31, R32, R34, R38, R46, R48, R62, R67, R85, R106, R110, R115, R117, R122, R127, R140, R187 | 22 | [async-safety.md](async-safety.md) |
| 三、错误处理 | R5, R6, R15, R17, R18, R44, R47, R50, R53, R56, R63, R86, R108, R129, R134, R136 | 16 | [error-handling.md](error-handling.md) |
| 四、UI 健壮性 | R7, R16, R19, R20, R22, R23, R24, R25, R35, R158, R160, R161, R163, R164, R167, R168, R169, R170, R171, R172, R173, R174, R183, R184, R185, R186 | 26 | [ui-robustness.md](ui-robustness.md) |
| 五、工程质量 | R3, R26, R27, R28, R33, R39, R40, R41, R54, R55, R57, R58, R59, R60, R87, R88, R92, R107, R135, R146, R147, R154, R155, R156, R159, R162, R165, R166, R175, R176, R177, R178, R179, R180, R181, R182, R188, R189 | 38 | [engineering.md](engineering.md) |
| 六、平台兼容 | R21, R43, R49, R51, R52, R61 | 6 | [platform.md](platform.md) |
| 七、用户安全防护 | R70, R71, R73, R74, R75, R76, R77, R89, R90, R91, R93, R94, R95, R96, R97, R98, R99 | 17 | [user-safety.md](user-safety.md) |
| 八、系统安全 | R78, R79, R80, R81, R82, R83, R84, R100, R101, R102, R103, R104, R105, R111, R112, R113, R114, R118, R119, R120, R121, R123, R124, R126, R128, R130, R131, R132, R133, R137, R138, R139, R142, R143, R144, R145, R148, R149 | 38 | [system-security.md](system-security.md) |

## 使用方式

- AI 上下文加载时，按需加载相关分类文件，而非加载全部 169 条规则
- 每个分类文件包含该分类下所有规则的完整文本（BAD/GOOD 示例、验证方法、发现来源）
- 完整原始文件见 [../regression-guards.md](../regression-guards.md)

## R131-R150 新增规则速览

> 以下规则为后续安全审计与一致性补强新增，详细 BAD/GOOD 示例见对应分类文件与测试文件。

| 规则 | 主题 | 分类 | 测试文件 |
|------|------|------|---------|
| R131 | SQLite 外键约束必须启用（PRAGMA foreign_keys = ON） | 系统安全 | `electron/src/database/__tests__/regression-r131-foreign-keys-enabled.test.ts` |
| R132 | sync-http-client 发起 HTTP 请求前必须调用 SSRF 校验 | 系统安全 | `electron/src/__tests__/regression-r132-sync-http-client-ssrf.test.ts` |
| R133 | SSRF 校验异常时必须 fail-close（视为私有 URL） | 系统安全 | `electron/src/__tests__/regression-r133-ssrf-fail-close.test.ts` |
| R134 | handler 返回 `{ success: false }` 时必须使用 HTTP 400 状态码 | 错误处理 | `electron/src/api/__tests__/regression-r134-http-status-code.test.ts` |
| R135 | secureConfigRouteSchema 必须使用 `operation` 字段（与 handler 一致） | 工程质量 | `electron/src/api/__tests__/regression-r135-secure-config-schema.test.ts` |
| R136 | bulk-save 路由必须收集失败任务信息并在响应中返回 `failures` | 错误处理 | `electron/src/api/route-groups/__tests__/regression-r136-bulk-save-failures.test.ts` |
| R137 | db-interface 错误消息中的 params 必须经 `sanitizeParams` 脱敏 | 系统安全 | `electron/src/database/__tests__/regression-r137-param-sanitization.test.ts` |
| R138 | schema-builder 生成的 SQL 中表名/列名必须用双引号包裹 | 系统安全 | `electron/src/database/__tests__/regression-r138-schema-builder-quotes.test.ts` |
| R139 | `validateSqlIdentifier` 必须使用 `^[a-zA-Z_][a-zA-Z0-9_]*$` 正则 | 系统安全 | `electron/src/database/__tests__/regression-r139-identifier-validation.test.ts` |
| R140 | polling-engine 必须通过 `initPollingEngine()` 惰性初始化，禁止模块级副作用 | 异步安全 | `src/modules/video/task-management/hooks/internals/__tests__/regression-r140-polling-engine-lazy-init.test.ts` |
| R141 | db/run HTTP 路由在写操作成功后必须调用 `scheduleSave()` | 数据一致性 | `electron/src/api/__tests__/regression-r141-db-run-schedule-save.test.ts` |
| R142 | api-gateway-utils `isPrivateUrl` 异常时必须 fail-close（返回 true） | 系统安全 | `electron/src/__tests__/regression-r142-api-gateway-ssrf-fail-close.test.ts` |
| R143 | validateSql 表名白名单必须防御双引号绕过（正则兼容 `"?`） | 系统安全 | `electron/src/handlers/__tests__/regression-r143-validate-sql-quote-bypass.test.ts` |
| R144 | SSRF 校验必须并行解析 IPv4+IPv6 双栈（防 DNS rebinding） | 系统安全 | `electron/src/__tests__/regression-r144-ssrf-dual-stack-check.test.ts` |
| R145 | isSensitiveQuery 必须识别 CTE/RETURNING 子句并脱敏 | 系统安全 | `electron/src/handlers/__tests__/regression-r145-cte-returning-redact.test.ts` |
| R146 | domain 层必须零外部依赖（纯净性） | 工程质量 | `src/domain/__tests__/regression-r146-domain-purity.test.ts` |
| R147 | 跨模块 Store 访问必须走公共 API（禁止深路径直导 useVideoTaskStore） | 工程质量 | `src/modules/__tests__/regression-r147-cross-module-store-access.test.ts` |
| R148 | createBackup 的 verifyDb.close() 必须在 finally 块中（防连接泄漏） | 系统安全 | `electron/src/database/__tests__/regression-r148-backup-connection-leak.test.ts` |
| R149 | file/read 路由必须在读取前检查文件大小（>50MB 拒绝） | 系统安全 | `electron/src/api/__tests__/regression-r149-file-read-size-limit.test.ts` |
| R150 | normalizeCameraValue 别名表必须按字段隔离（防跨表污染） | 数据一致性 | `src/domain/__tests__/regression-r150-normalize-camera-value.test.ts` |

## R154-R157 新增规则速览（批次 2 性能优化）

> 以下规则为批次 2 P0 性能优化的回归防护，详细 BAD/GOOD 示例见 `regression-guards.md` 末尾及对应测试文件。

| 规则 | 主题 | 分类 | 测试文件 |
|------|------|------|---------|
| R154 | `useAssetLoader` 必须使用 `Promise.all` 并发加载角色/场景/分镜资产，禁止顺序 await | 工程质量 | `src/modules/story/beat-editor/hooks/__tests__/regression-r154-asset-loader-parallel.test.ts` |
| R155 | `StoryProvider` 传入 `useAssetLoader` 的 services 对象必须用 `useMemo(..., [])` 包裹，保证引用稳定 | 工程质量 | `src/app/story/__tests__/regression-r155-story-provider-services-memo.test.tsx` |
| R156 | `useVideoTasksPage` 统计必须用 `useMemo` 单次遍历计算，timeout/retrying/cancelled 正确分类（timeout/cancelled→failed, retrying→processing） | 工程质量 | `src/app/video-tasks/hooks/__tests__/regression-r156-tasks-stats-memo.test.ts` |
| R157 | `video-cache` 大小常量在 infrastructure/services 两层必须一致（均 = 10GB） | 数据一致性 | `src/infrastructure/storage/__tests__/regression-r157-video-cache-limits-consistency.test.ts` |

## R158-R166 新增规则速览（批次 3 UI/UX + i18n 优化）

> 以下规则为批次 3 UI/UX 与国际化优化的回归防护，详细 BAD/GOOD 示例见 `regression-guards.md` 末尾及对应测试文件。

| 规则 | 主题 | 分类 | 测试文件 |
|------|------|------|---------|
| R158 | Toast hover 暂停必须用 useRef + useState 单计时器模式，进度条与持续时间一致（避免双重计时器） | UI 健壮性 | `src/shared/presentation/__tests__/regression-r158-toast-hover-pause.test.tsx` |
| R159 | `validateApiKey` 必须返回 errorKey（i18n key），调用方用 t() 翻译，不硬编码中文 | 工程质量 | `src/__tests__/lib/api-config/regression-r159-validate-api-key-errorkey.test.ts` |
| R160 | Modal 类组件必须使用统一 `<Modal>` 组件（`src/shared/presentation/Modal.tsx`），不重复实现 overlay/Escape/aria 样板 | UI 健壮性 | `src/shared/presentation/__tests__/regression-r160-modal-component-required.test.tsx` |
| R161 | `IconButton` 组件强制 aria-label prop（不允许渲染无 aria-label 的纯图标按钮） | UI 健壮性 | `src/shared/presentation/__tests__/regression-r161-icon-button-aria-required.test.tsx` |
| R162 | 配置层中文显示字符串通过 labelKey 字段国际化，但 prompt 构造用的中文 value 必须保留 | 工程质量 | `src/modules/character/__tests__/regression-r162-style-options-labelkey.test.ts` |
| R163 | 全局 :focus-visible 样式在 globals.css 中定义，所有交互元素继承该样式 | UI 健壮性 | `src/app/__tests__/regression-r163-focus-visible-style.test.ts` |
| R164 | Modal 打开时必须聚焦 modal 容器（tabIndex={-1}）以支持屏幕阅读器 | UI 健壮性 | `src/shared/presentation/__tests__/regression-r164-modal-focus-trap.test.tsx` |
| R165 | coming-soon 页面 title 必须使用 `t()` 国际化（sidebar.login 等） | 工程质量 | `src/app/coming-soon/__tests__/regression-r165-coming-soon-i18n.test.tsx` |
| R166 | 日期格式化使用 `toLocaleString()` / `toLocaleTimeString()` 而非硬编码 "zh-CN" locale | 工程质量 | `src/shared/presentation/__tests__/regression-r166-date-locale.test.tsx` |

## R167-R180 新增规则速览（深度审计全量修复 a11y/i18n/工程质量）

> 以下规则为深度审计 P0+P1+P2 全量修复的无障碍（a11y）、i18n、工程质量回归防护，详细 BAD/GOOD 示例见 `regression-guards.md` 末尾及对应测试文件。

| 规则 | 主题 | 分类 | 测试文件 |
|------|------|------|---------|
| R167 | 自定义模态框必须使用 Modal 组件或补 role/aria-modal | UI 健壮性 | `src/shared/presentation/__tests__/regression-r167-custom-modal-role.test.tsx` |
| R168 | 纯图标按钮必须有 aria-label | UI 健壮性 | `src/shared/presentation/__tests__/regression-r168-icon-button-aria.test.tsx` |
| R169 | div onClick 必须补 role="button"/tabIndex/onKeyDown | UI 健壮性 | `src/shared/presentation/__tests__/regression-r169-div-onclick-role.test.tsx` |
| R170 | Tab 模式必须使用 Tabs 组件（role="tablist"/role="tab"） | UI 健壮性 | `src/shared/presentation/__tests__/regression-r170-tabs-component.test.tsx` |
| R171 | 表单控件必须有 label 关联（htmlFor 或 aria-label） | UI 健壮性 | `src/app/__tests__/regression-r171-form-label-association.test.tsx` |
| R172 | 进度条必须有 role="progressbar" + aria-valuenow/min/max | UI 健壮性 | `src/modules/asset/presentation/__tests__/regression-r172-progressbar-role.test.tsx` |
| R173 | 动态状态变化必须有 aria-live（role="status"） | UI 健壮性 | `src/modules/asset/presentation/__tests__/regression-r173-aria-live.test.tsx` |
| R174 | 装饰性 emoji 必须 aria-hidden="true" | UI 健壮性 | `src/modules/story/beat-editor/presentation/__tests__/regression-r174-emoji-aria-hidden.test.tsx` |
| R175 | throw Error 必须用 t() 国际化（用户可见错误） | 工程质量 | `src/__tests__/lib/regression-r175-throw-error-i18n.test.ts` |
| R176 | 数据常量层双用途字段（value + labelKey） | 工程质量 | `src/modules/character/__tests__/regression-r176-data-constant-labelkey.test.ts` |
| R177 | DOM 操作必须用 useRef（禁止 document.getElementById） | 工程质量 | `src/app/quick-generate/__tests__/regression-r177-dom-use-ref.test.tsx` |
| R178 | 回调参数不能遮蔽导入的 t（filter((t) => ...) 在导入 t 的文件中违规） | 工程质量 | `src/modules/video/task-management/hooks/__tests__/regression-r178-callback-no-shadow.test.ts` |
| R179 | Port 接口扩展优先于 as 断言（cancelTask? 在接口定义） | 工程质量 | `src/domain/ports/__tests__/regression-r179-port-interface-extension.test.ts` |
| R180 | 函数职责单一（>100 行的注册函数应拆分） | 工程质量 | `electron/src/__tests__/regression-r180-function-split.test.ts` |
| R181 | 禁止硬编码 Tailwind 颜色类名（必须使用语义变量） | 工程质量 | — |
| R182 | /api/config/set 必须走异步 keyStorage 持久化（禁止明文 apiKey 落盘） | 工程质量 | `electron/src/__tests__/regression-r182-config-set-async-persistence.test.ts` |

## R183-R189 新增规则速览（P0 修复审计 UI 规则，原 R131-R137 重新编号）

> 以下规则为 P0 修复审计产物，原编号 R131-R137 与系统安全规则冲突，重新编号为 R183-R189。详细 BAD/GOOD 示例见 `regression-guards.md` 及对应测试文件。

| 规则 | 主题 | 分类 | 测试文件 |
|------|------|------|---------|
| R183 | `PageErrorBoundary.getDerivedStateFromError` 必须单参数，errorCount 在 componentDidCatch 中累加 | UI 健壮性 | `src/shared/presentation/__tests__/regression-r183-error-boundary-error-count.test.tsx` |
| R184 | `VideoTasksPage` statusFilter 与刷新按钮必须实际绑定（value/onChange/onClick） | UI 健壮性 | `src/app/video-tasks/hooks/__tests__/regression-r184-status-filter-and-refresh.test.ts` |
| R185 | `AssetUploadSection` 拖拽 handlers 不能为空 stub，需支持键盘 | UI 健壮性 | `src/app/asset-library/__tests__/regression-r185-upload-drop-zone.test.tsx` |
| R186 | `DeleteConfirmDialog` 有引用时 confirm 按钮必须 disabled | UI 健壮性 | `src/shared/presentation/__tests__/regression-r186-delete-dialog-disable-on-referenced.test.tsx` |
| R187 | `useBeatDetail` 必须用 Zustand selector 订阅，禁止自定义 setInterval 轮询 | 异步安全 | `src/app/story/beat/$beatId/__tests__/regression-r187-no-setinterval-polling.test.ts` |
| R188 | `network-monitor` 顶层副作用必须延迟到 startMonitoring() | 工程质量 | `src/infrastructure/network/__tests__/regression-r188-no-top-level-side-effects.test.ts` |
| R189 | `video-cache` beforeunload 注册必须延迟到 registerObjectUrl() | 工程质量 | `src/infrastructure/storage/__tests__/regression-r189-no-top-level-beforeunload.test.ts` |
