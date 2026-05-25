# AI Animation Studio - 修改记录

> 本文档记录项目代码和架构的重大变更，与 PROJECT_DOCUMENTATION.md 分离维护

---

## 2026-05-21 全项目审查与 AI 友好性强化

### Phase 1：严重问题修复（8 项）

| ID | 严重度 | 问题 | 修复 | 文件 |
|----|--------|------|------|------|
| S1 | 严重 | API Server 端口未在退出时释放 | SIGINT/SIGTERM/before-quit/window-all-closed 添加 `stopApiServer()` | `electron/src/main.ts` |
| S2 | 严重 | unhandledRejection 未清理资源 | 改为 `app.exit(1)` + `stopApiServer()` + `closeDatabase()` | `electron/src/main.ts` |
| S3 | 严重 | API Key XOR 混淆 + localStorage 降级 | 移除 XOR obfuscate/deobfuscate，非 Electron 环境拒绝存储 | `src/modules/security/hooks/use-secure-config.ts` |
| S4 | 严重 | StoryProvider useEffect 闭包陷阱 | 用 `useRef` 稳定闭包引用，依赖数组仅保留 `completedTaskUrls` | `src/app/story/StoryProvider.tsx` |
| S5 | 严重 | Electron 模式下 sendBeacon 泄露 | 移除 Electron 模式下的 `navigator.sendBeacon` 调用 | `src/modules/video/task-management/hooks/use-video-task-manager.ts` |
| S6 | 严重 | SQL 注释绕过 DDL 检测 | 添加 `stripSqlComments()` 剥离 `/* */` 和 `--` 注释再检测 DDL | `electron/src/preload.ts` |
| S7 | 严重 | 请求体过大时 res.end 双写 | `req.on("end")` 添加 `res.writableEnded` 检查 | `electron/src/api-server.ts` |
| S8 | 严重 | SQLite 重试正则误匹配约束错误 | 从重试正则中移除 `constraint|unique`，仅保留 `busy|locked|timeout` | `src/infrastructure/storage/sqlite-core.ts` |

### Phase 2：高优先级修复（12 项）

| ID | 严重度 | 问题 | 修复 | 文件 |
|----|--------|------|------|------|
| H1 | 高 | 限流清理定时器阻塞进程退出 | 添加 `unref()`，Map 大小限制 200 条目 | `electron/src/preload.ts` |
| H3 | 高 | Beat ID 生成使用 Date.now + Math.random | 改用 `crypto.randomUUID()` | `src/modules/story/beat-editor/hooks/useStoryState.ts` |
| H7 | 高 | parseRecord 无 table 参数时凭前缀猜测 JSON | 无 table 参数时仅处理 `is_` 布尔字段 | `src/infrastructure/storage/core.ts` |
| H8 | 高 | Toast 内联 @keyframes 导致多实例冲突 | 移除内联 style 标签，添加到全局 CSS | `src/shared/presentation/Toast.tsx` + `src/app/globals.css` |
| H10 | 高 | removeTasks 缓存清理串行阻塞 | 改 `Promise.all` 并行 | `src/modules/video/task-management/hooks/use-video-task-manager.ts` |
| H11 | 高 | SSRF Guard 缺少 IPv6 DNS 解析 | DNS 解析增加 `dns.resolve6` fallback | `electron/src/security/ssrf-guard/ssrf-guard.ts` |
| H12 | 高 | x-electron-app 头检查区分大小写 | 确认为误报（Node.js headers 自动转小写） | — |

### Phase 3：中优先级修复（10 项）

| ID | 严重度 | 问题 | 修复 | 文件 |
|----|--------|------|------|------|
| M5 | 中 | 日志中 API Key 明文泄露 | 添加 `sanitizeMessage()` 脱敏 API Key 模式 | `src/shared/error-logger.ts` |
| M6 | 中 | window 全局变量泄露内部状态 | 移除 `window.__VIDEO_TASK_POLLING_STATE__` 和 `window.__VIDEO_TASK_STORE__` | `src/modules/video/task-management/hooks/use-video-task-manager.ts` |
| M8 | 中 | userData 路径检测不兼容大小写 | 改用 `toLowerCase().endsWith("electron")` | `electron/src/main.ts` |

### 额外 Bug 修复

| 问题 | 修复 | 文件 |
|------|------|------|
| removeTasks 中 allTasks 已被过滤导致删除失败 | 先保存 `tasksToRemove` 再执行 `setAllTasks` 过滤 | `src/modules/video/task-management/hooks/use-video-task-manager.ts` |

### 死代码清理

| 操作 | 文件 |
|------|------|
| 删除只做 re-export 的间接层 | `src/modules/video/utils/video-export.ts` |
| 修改 downloadJSONFile 导入路径 | `src/modules/video/utils/index.ts` |
| 移除无外部消费者的 `clearInterceptorCache` | `src/infrastructure/network/interceptors/cache.interceptor.ts` + `index.ts` |
| 移除无外部消费者的 re-export（resilient-fetch 3个、download-manager 9个、network-monitor 4个、request-lifecycle 12个） | `src/infrastructure/network/index.ts` |

### AI 友好性强化

| 强化项 | 说明 | 文件 |
|--------|------|------|
| project_rules.md | AI 开发指令文件，定义架构规则、依赖方向、代码模式 | `.trae/rules/project_rules.md` |
| MODULE.md × 4 | 为 feedback、security、persistence、integrity 补齐模块契约文档 | `src/modules/{feedback,security,persistence,integrity}/MODULE.md` |
| ESLint DDD 分层守卫 | `no-restricted-imports` 规则检测分层违规：domain→infrastructure/modules (error)、shared→infrastructure/modules (warn)、modules→infrastructure/* (warn, di 除外) | `eslint.config.mjs` |
| /health 端点 | API Server 健康检查，无需认证，返回服务状态+数据库状态+运行时间 | `electron/src/api-server.ts` |

### 技术债清理（更早的会话）

| 变更 | 文件 |
|------|------|
| electron/tsconfig.json moduleResolution 改 "bundler"，exclude 添加 after-sign.js 和 code-sign-config.ts | `electron/tsconfig.json` |
| next.config.ts Electron 模式下用条件展开完全移除 rewrites | `next.config.ts` |
| ELECTRON_APP_HEADERS 集中到共享常量 | `src/config/constants.ts` + 4 处引用 |
| better-sqlite3 版本锁定 12.10.0 | `package.json` |
| api-server.ts 添加 resolveDocsPath() 环境适配 | `electron/src/api-server.ts` |

### 已知架构债务（未修复，非本次引入）

- `shared/presentation/` 有 5 个文件导入 `@/infrastructure/`（ErrorBoundary、ModelSelector、CrashRecoveryDialog、VirtualList、ConfigCheckBanner）
- `modules/persistence/services/transactional-delete.ts` 直接导入 `@/infrastructure/storage/sqlite-core`
- `modules/story/generation/services/style-guide-service.ts` 直接导入 `@/infrastructure/ai-providers/model-capabilities`
- `modules/sync/presentation/SyncSettingsPanel.tsx` 直接导入 `@/infrastructure/api/client`
- `modules/story/generation/hooks/useUploadHandlers.ts` 直接导入 `@/infrastructure/video-utils`
- `modules/video/utils/` 下 2 个文件直接导入 `@/infrastructure/video-utils`
