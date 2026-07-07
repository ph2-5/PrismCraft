# PrismCraft 部署与运维指南

> 版本：1.1.0 | 更新日期：2026-07-07

## 1. 环境要求

### 必要环境

| 工具 | 最低版本 | 说明 |
|------|---------|------|
| Node.js | 20.x | CI 使用 20，本地开发必须对齐 |
| npm | 10+ | 随 Node.js 20 自带 |
| PowerShell | 5.1+ | 执行构建脚本 `build-electron.ps1` |
| Git | 2.x | 版本管理与 pre-commit 钩子 |

### 平台特定要求

**Windows：**
- Windows 10 1803+ 或 Windows 11
- Visual Studio Build Tools（含 C++ 工作负载），用于编译 better-sqlite3 原生模块
- `C:\Windows\System32` 必须在 PATH 中（electron-builder 依赖 `cmd.exe` 执行 `npm ls`）

**macOS：**
- macOS 12 Monterey+
- Xcode Command Line Tools（`xcode-select --install`）
- 通用二进制构建需同时安装 x64 和 arm64 工具链

**Linux：**
- gcc/g++ 及 make
- libgtk-3-dev、libnotify-dev 等桌面依赖（AppImage 运行时需要）

### npm 镜像配置

项目 `.npmrc` 已配置国内 Electron 镜像，中国用户无需额外修改。CI 环境会覆盖为官方源：

```ini
# .npmrc（本地开发用）
electron_mirror=https://npmmirror.com/mirrors/electron/
electron_builder_binaries_mirror=https://npmmirror.com/mirrors/electron-builder-binaries/
```

> **注意**：`.npmrc` 不得包含非标准键，npm 10+ 会产生 "Unknown project config" 警告。

---

## 2. 本地开发环境搭建

### 2.1 克隆与安装

```powershell
git clone <repo-url>
cd prismcraft-source-code
npm ci
```

`npm ci` 会执行 `postinstall` 脚本，自动运行 `electron-rebuild` 重建 better-sqlite3 原生模块，并创建 `node_modules/@shared-logic` junction 用于 Electron 主进程的 TypeScript 编译。若自动重建失败，手动执行：

```powershell
npm run rebuild
```

### 2.2 开发模式

```powershell
# 仅启动渲染进程（Vite Dev Server，无 Electron）
npm run dev

# 启动完整 Electron 应用（需另行启动 Electron）
npm run build:electron
npx electron out/
```

> **提示**：`npm run dev` 仅启动 Vite 开发服务器，适合纯 UI 开发。涉及 Electron 主进程（数据库、IPC、文件系统）的功能必须通过完整构建后启动 Electron 测试。

### 2.3 代码质量检查

```powershell
# 类型检查（三套 tsconfig）
npm run typecheck            # 渲染进程
npm run typecheck:electron   # 主进程
npm run typecheck:test       # 测试文件

# 代码规范
npm run lint                 # 渲染进程 ESLint
npm run lint:electron        # 主进程 ESLint
npm run lint:arch            # DDD 架构违规扫描

# 单元测试
npm run test                 # Vitest 单次运行
npm run test:coverage        # 含覆盖率报告
npm run test:watch           # 监听模式

# 完整验证（提交前必须通过）
npm run validate:full
```

### 2.4 Pre-commit 钩子

项目配置了 Husky pre-commit 钩子，每次提交自动执行：

1. TypeScript 类型检查
2. 架构违规扫描
3. lint-staged（仅检查暂存文件）

如需跳过钩子（**仅限紧急情况**）：`git commit --no-verify`

---

## 3. 构建流程详解

### 3.1 构建脚本 `build-electron.ps1`

构建脚本按以下顺序执行：

```
1. 设置 BUILD_TARGET=electron     → Vite 使用相对基路径 "./" 而非 "/"
2. 清空 out/ 目录                 → 确保无残留文件
3. npx vite build                 → 编译渲染进程，输出 SPA 到 out/
4. npx tsc -p electron/tsconfig.json → 编译 Electron 主进程 TypeScript
5. 复制 electron/dist/* → out/    → 主进程代码与渲染进程产物合并
6. 复制 src/shared-logic/* → out/shared-logic/  → 零依赖纯逻辑，供主进程运行时加载
7. 复制插件文档 → out/docs/       → 插件系统文档
```

**手动执行：**

```powershell
powershell -ExecutionPolicy Bypass -File build-electron.ps1
```

或使用 npm 脚本（等价）：

```powershell
npm run build:electron
```

### 3.2 Vite 构建产物

Vite 8 使用 rolldown 的 `codeSplitting` API 将产物拆分为逻辑分块：

| 分块 | 内容 | 约大小 |
|------|------|--------|
| vendor-react | react, react-dom, react-router-dom | ~284 KB |
| vendor-state | zustand, @tanstack/react-query | ~58 KB |
| vendor-ui | lucide-react, clsx, tailwind-merge | ~51 KB |
| app-story | 故事模块 | ~384 KB |
| app-infra-core | 基础设施层 | ~390 KB |
| app-shared | 共享层 | ~244 KB |
| app-video | 视频模块 | ~100 KB |
| app-infra | 基础设施工具 | ~68 KB |
| app-scene | 场景模块 | ~13 KB |
| app-domain | 领域层 | ~16 KB |
| app-character | 角色模块 | ~20 KB |
| page-* | 懒加载页面组件 | 5-84 KB |

所有页面路由使用 `React.lazy()` 实现按需加载，仅在导航到对应页面时下载。

### 3.3 原生模块重建

better-sqlite3 是 C++ 原生模块，**必须为 Electron 的 Node.js 版本重新编译**：

```powershell
npm run rebuild    # 等价于 npx electron-rebuild
```

**关键**：better-sqlite3 版本锁定为 `12.10.0`（非 `^12.10.0`），不得升级，否则可能导致数据库行为不一致。

---

## 4. 打包与分发

### 4.1 electron-builder 配置

| 配置项 | 值 |
|--------|-----|
| appId | com.prismcraft.app |
| productName | PrismCraft |
| npmRebuild | false（由 npm 脚本手动处理） |
| 输出目录 | release/ |
| asar | true |
| asarUnpack | better-sqlite3 原生模块（必须解包，否则无法加载） |

**打包文件包含**：`out/**/*`、插件文档

**打包文件排除**：node_modules 测试文件、`@types`、sharp、`src/`、`release/`

### 4.2 Windows 打包

```powershell
npm run build:win
```

产物：NSIS 安装程序（`release/PrismCraft Setup 1.1.0.exe`）

NSIS 配置：
- 非一键安装，允许用户选择安装目录
- 创建桌面快捷方式
- 创建开始菜单快捷方式
- `signAndEditExecutable: false`（未配置代码签名时）

### 4.3 macOS 打包

```powershell
npm run build:mac
```

产物：DMG + ZIP（同时构建 x64 和 arm64 架构）

- 图标：`icon.icns`
- 分类：`graphics-design`
- 未配置代码签名时，构建产物为未签名应用，用户需在"系统偏好设置 → 安全性"中手动允许运行

### 4.4 Linux 打包

```powershell
npm run build:linux
```

产物：AppImage + deb + tar.gz

- 分类：`Graphics`
- AppImage 为免安装格式，直接赋予执行权限即可运行

### 4.5 代码签名（可选）

CI 流水线支持可选代码签名，需配置以下 Secrets：

| Secret | 用途 |
|--------|------|
| `WIN_CSC_LINK` | Windows 代码签名证书（Base64） |
| `WIN_CSC_KEY_PASSWORD` | 证书密码 |
| `APPLE_ID` | Apple 开发者账号 |
| `APPLE_APP_SPECIFIC_PASSWORD` | App 专用密码 |
| `APPLE_TEAM_ID` | Apple 团队 ID |

配置后 CI 自动启用签名和公证（notarization）。

---

## 5. CI/CD 流水线

### 5.1 持续集成（`.github/workflows/ci.yml`）

```
lint-and-typecheck ──┐
                     ├── unit-tests ──┬── build-electron-win (main/master)
security-scan ───────┘                └── build-electron-mac (main/master)

dependency-review (仅 PR)
```

**Job 详情：**

| Job | 运行环境 | 触发条件 | 步骤 |
|-----|---------|---------|------|
| lint-and-typecheck | ubuntu | 所有推送/PR | lint → typecheck(root) → typecheck(electron) → 架构检查 → 模块 API 一致性 → 契约验证 |
| security-scan | ubuntu | 所有推送/PR | npm audit + 硬编码密钥扫描 + 私钥扫描 |
| unit-tests | ubuntu | 需前两项通过 | 重建 better-sqlite3 → vitest + 覆盖率 → 上传覆盖率报告 |
| build-electron-win | windows | 需单元测试通过 + main/master | 构建 → 重建 → 可选签名 → 打包 |
| build-electron-mac | macos | 需单元测试通过 + main/master | 构建 → 重建 → 可选签名 → 打包 |
| dependency-review | ubuntu | 仅 PR | 许可证合规检查 |

**CI 关键配置：**
- Node.js 版本：20
- `npm ci --ignore-scripts`（3 次重试），避免 postinstall 钩子干扰
- `.npmrc` 被覆盖为官方源，确保依赖完整性
- 构建产物仅在 main/master 分支推送时生成

### 5.2 本地模拟 CI 验证

提交 PR 前，建议本地运行完整验证：

```powershell
npm run validate:full
```

等价于：typecheck × 3 + lint + 架构检查 + 模块 API 一致性 + 契约验证 + 单元测试 + 覆盖率报告

---

## 6. 发布流程

### 6.1 创建发布

1. **确保 main/master 分支所有 CI 检查通过**

2. **更新版本号**（在 `package.json` 中）

3. **创建版本标签：**

```powershell
git tag v1.1.0
git push origin v1.1.0
```

4. **自动触发 Release 流水线**（`.github/workflows/release.yml`）

### 6.2 Release 流水线

触发条件：推送 `v*` 标签

执行步骤：
1. `npm ci`
2. `npm run build:electron`
3. `npx electron-rebuild`
4. `npx electron-builder --mac --publish=never`

> **注意**：当前 Release 流水线仅构建 macOS DMG。如需发布 Windows 版本，需手动在本地或 CI 中执行 `npm run build:win`。

### 6.3 发布检查清单

- [ ] 版本号已在 `package.json` 中更新
- [ ] CHANGELOG 已更新
- [ ] 所有 CI 检查通过
- [ ] 本地 `npm run validate:full` 通过
- [ ] 在目标平台上手动测试安装包
- [ ] 代码签名和公证正常（如已配置）

---

## 7. 常见构建问题与排查

### 7.1 better-sqlite3 编译失败

**症状**：`Error: The module was compiled against a different Node.js version`

**原因**：原生模块未为 Electron 重建

**解决**：

```powershell
npm run rebuild
```

若仍失败，清除缓存后重试：

```powershell
npm cache clean --force
rm -rf node_modules
npm ci
```

### 7.2 electron-builder 找不到 cmd.exe

**症状**：`Error: spawn cmd.exe ENOENT`

**原因**：`C:\Windows\System32` 不在 PATH 中

**解决**：将 `C:\Windows\System32` 添加到系统 PATH 环境变量

### 7.3 Electron 镜像下载超时

**症状**：`ELIFECYCLE` 错误，下载 electron 二进制包失败

**解决**：确认 `.npmrc` 中镜像配置正确，或手动设置环境变量：

```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
```

### 7.4 asar 打包后 better-sqlite3 无法加载

**症状**：`Error: Cannot find module 'better-sqlite3'`

**原因**：原生模块不能在 asar 归档内加载

**解决**：确认 `package.json` 中 `asarUnpack` 包含 better-sqlite3 原生模块：

```json
"asarUnpack": [
  "node_modules/better-sqlite3/build/Release/better_sqlite3.node"
]
```

### 7.5 Vite 构建内存溢出

**症状**：`FATAL ERROR: Reached heap limit`

**解决**：增大 Node.js 内存限制：

```powershell
$env:NODE_OPTIONS="--max-old-space-size=4096"
npm run build:electron
```

### 7.6 Windows 上 PowerShell 执行策略阻止脚本

**症状**：`UnauthorizedAccess` 错误

**解决**：

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

或使用绕过方式执行：

```powershell
powershell -ExecutionPolicy Bypass -File build-electron.ps1
```

### 7.7 macOS 上应用无法打开（未签名）

**症状**：`"PrismCraft" is damaged and can't be opened`

**解决**：

```bash
xattr -cr /Applications/AI\ Animation\ Studio.app
```

或在系统偏好设置 → 安全性与隐私 → 点击"仍要打开"

---

## 8. 运维监控

### 8.1 日志系统

#### 日志位置

| 环境 | 路径 |
|------|------|
| 生产 | `%APPDATA%/ai-animation-studio/logs/app-YYYY-MM-DD.log` |
| 开发 | `%APPDATA%/ai-animation-studio/logs/dev-YYYY-MM-DD.log` |

macOS 对应路径：`~/Library/Application Support/ai-animation-studio/logs/`

Linux 对应路径：`~/.config/ai-animation-studio/logs/`

#### 日志级别

- **生产环境**：`minLevel: "info"`
- **开发环境**：`minLevel: "debug"`

#### 日志轮转策略

- 单文件上限：10MB
- 超过上限后重命名为 `.1` 备份
- 最多保留 5 个日志文件（最旧的自动删除）
- 刷新间隔：5 秒；队列超过 100 条时立即刷新

#### 日志接口

```typescript
logger.info(message: string, context?: LogContext)
logger.warn(message: string, context?: LogContext)
logger.error(message: string, error?: Error, context?: LogContext)
```

#### 安全日志

安全相关事件通过 `log:security` IPC 通道从 preload 转发到主进程日志，包括：
- IPC 权限违规
- DDL 语句注入尝试
- 速率限制触发

日志内容经过脱敏处理，API Key 模式会被自动替换。

### 8.2 崩溃恢复

#### 渲染进程崩溃

1. `render-process-gone` 事件触发，设置 `isRendererCrashed` 标志
2. 销毁当前窗口
3. `window-all-closed` 检测到崩溃标志后，延迟 1 秒自动重建窗口
4. 仅用户主动关闭窗口时触发 `app.quit()`

#### GPU 进程崩溃

1. `child-process-gone` 检测到 `details.type === "GPU"`
2. 自动执行 `webContents.reload()` 重新加载页面
3. 其他子进程退出仅记录 warn 级别日志

#### 异常处理策略

- `uncaughtException` 和 `unhandledRejection` **仅记录日志，不退出应用**
- 桌面应用必须容忍瞬态错误（网络超时、数据库锁定、IPC 故障）
- 仅 `SIGINT`、`SIGTERM` 和用户主动退出触发 `app.quit()`

#### 优雅关机序列

```
before-quit → gracefulShutdown()
  1. 销毁窗口
  2. 关闭静态文件服务器（destroy 所有活跃连接）
  3. stopApiServer()（destroy 追踪的 HTTP 连接，关闭服务器）
  4. closeDatabase()（关闭 SQLite 连接）
  5. app.quit()
```

静态服务器通过 `activeConnections: Set<net.Socket>` 追踪所有 HTTP 连接，关机时全部 `destroy()`，防止 keep-alive 连接阻塞进程退出。

### 8.3 数据库运维

- SQLite 运行在 WAL 模式，支持并发读写
- 所有查询使用参数化语句，防止 SQL 注入
- Schema 版本：当前为 4，通过 `runMigrations(db, currentVersion)` 管理
- 迁移在 `db.transaction()` 内执行，失败自动回滚
- JSON 容器模式：易变字段存储在 JSON 列中，避免 ALTER TABLE
- 部分更新使用 `json_set(COALESCE(container, '{}'), '$.key', ?)` 模式

### 8.4 安全运维

- API Key 通过 `electron-store` 加密存储，通过 `secure-config:*` IPC 通道访问
- 主进程 HTTP 请求信任用户配置的 URL，SSRF 防护仅拦截云元数据端点（169.254.169.254）
- 请求头必须包含 `X-Electron-App`（服务端验证）
- IPv6 链路本地地址检测：首段解析 `(value & 0xffc0) === 0xfe80`
- 渲染进程禁止执行 DDL 语句（DROP、ALTER、CREATE、TRUNCATE、ATTACH、DETACH）
- SQL 注释在 DDL 检测前被剥离，防止绕过
