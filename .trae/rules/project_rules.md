# AI Animation Studio - Project Rules

## Architecture Overview

This is an **Electron + Vite** desktop application for AI-powered animation production.
Architecture: **DDD (Domain-Driven Design) with sub-domain modules**, optimized for AI-driven development.

- **Build Target**: Electron desktop app (local-first, offline-capable)
- **Frontend**: Vite 8 + React 19 + React Router 7 + Zustand 5 + Tailwind CSS 4
- **Backend**: Electron main process + better-sqlite3 (WAL mode) + HTTP API server
- **Language**: TypeScript (strict mode)

## Directory Structure & Layer Rules

```
src/
  domain/          → Pure types, schemas, result types. NO imports from modules/ or infrastructure/
  shared-logic/    → Pure business logic shared by both renderer and main process. NO external dependencies
  modules/         → Business logic sub-domains (each has hooks/, services/, presentation/)
  infrastructure/  → DI container, storage, network, API client, AI providers
  shared/          → Cross-cutting UI (Toast, Sidebar, ErrorBoundary), utils, error-logger
  app/             → Page components and layouts (consumes modules via Context)
  config/          → Constants, ports, shared config

electron/src/
  main.ts          → App lifecycle, window management, crash recovery
  main-dev.ts      → Dev mode entry (same crash recovery, debug logging, DevTools)
  main-common.ts   → Shared: createWindow, static server, gracefulShutdown, config IPC
  api-server.ts    → Re-export from api/server.ts (backward-compatible entry point)
  api/             → HTTP API server (modular structure)
    types.ts       → Route<T>, RouteHandler<T>, ApiResponse<T>, defineRoute<T> (generic, Zod-inferred)
    middleware.ts   → Rate limiting, CORS, X-Electron-App auth, connection tracking
    schemas.ts     → Zod schemas for all route request bodies (40+ schemas with z.infer type exports)
    routes.ts      → Route registry (merges all route groups)
    route-groups/  → Route handler groups (all use defineRoute for type-safe body)
      core-routes.ts       → Config, upload, export, test-connection, sync routes
      db-routes.ts         → Database query/run/transaction HTTP routes
      file-routes.ts       → File operations (save/read/write/delete/exists/copy/list/info/cache-directory/disk-space) HTTP routes
      generation-routes.ts → Image/video/text generation, story generation routes
      plugin-routes.ts     → Plugin management routes (list, add, delete, reload, etc.)
      shot-routes.ts       → Shot reference, consistency check, visual consistency routes
      storyboard-routes.ts → Storyboard generation, video recovery, bulk save routes
    server.ts      → HTTP server start/stop, request dispatch, schema validation
  preload.ts       → IPC bridge with permission system and rate limiting
  database/        → SQLite connection, schema builder, schema, migrations
  handlers/        → IPC handlers (database, config, sync, secure-config)
  plugins/         → Plugin registry, user plugin loader, user plugin adapter, code plugin loader, providers
  security/        → SSRF guard, key storage
  logging/         → Logger with ConsoleTransport + FileTransport
```

## Dependency Direction (CRITICAL)

Dependencies must flow **inward only**:

```
app → modules → domain
              → shared-logic
              → shared
              → infrastructure/di (via container only)
infrastructure → domain, shared
shared-logic → NOTHING (pure logic, zero external dependencies)
shared → domain, infrastructure (proxy exports only)
domain → NOTHING (pure types)
```

### Violations to avoid:
- `shared-logic/` MUST NOT import from any other layer (zero external dependencies, self-contained types only)
- `shared/` MUST NOT import from `@/modules/*`
- `shared/` MAY re-export from `@/infrastructure/*` via proxy exports (e.g., `@/shared/db-core`, `@/shared/api-config`)
- `domain/` MUST NOT import from `@/modules/*` or `@/infrastructure/*`
- `modules/` MUST NOT directly import from `@/infrastructure/*` except `@/infrastructure/di` (use DI container or `@/shared/` proxy exports)
- `modules/` MAY import from `@/shared-logic/*` for pure business logic (prompt building, consistency check, reference engine, etc.)
- Cross-module imports: use barrel `@/modules/xxx` or `@/modules/xxx/subdomain` not deep paths `@/modules/xxx/hooks/yyy`
- Cross-module deep-path imports (`@/modules/xxx/yyy/zzz`) are blocked by ESLint (error in production code, warn in tests)
- Type re-exports from infrastructure are allowed via `export type` (compile-time only, no runtime dependency)
- Main process route handlers import from `@shared-logic/*` (configured in electron/tsconfig.json)

## Module Conventions

Each module under `src/modules/` follows this structure:
```
module-name/
  index.ts           → Barrel file (public API)
  MODULE.md          → Module contract (purpose, sub-domains, dependencies)
  hooks/             → React hooks
  services/          → Business logic services
  presentation/      → React components
  domain/            → Module-specific domain types (if needed)
```

### Module barrel rules:
- `index.ts` MUST re-export all public APIs
- Internal implementation details MUST NOT be exported
- Other modules import via `@/modules/xxx` only

## Electron IPC Rules

- All IPC channels MUST be registered in `preload.ts` `IPC_PERMISSIONS`
- Permission levels: READONLY → READWRITE → DANGEROUS → SYSTEM → SECURE
- DDL statements (DROP, ALTER, CREATE, TRUNCATE, ATTACH, DETACH) are blocked in main process handler
- `log:security` IPC channel forwards preload security events to main process logger

## Security Rules

- API keys are stored via `electron-store` encryption through IPC (`secure-config:*` channels)
- NEVER store API keys in localStorage or use XOR obfuscation
- User-configured API URLs (providers, sync servers) are trusted and allowed including private/internal addresses
- SSRF guard is enforced for non-loopback user-configured hosts (R105) — loopback addresses (127.0.0.1, localhost, ::1) are trusted; other hosts go through ssrfGuard.validate for DNS rebinding protection
- `X-Electron-App` header required on all API requests (validated server-side)
- Error logs are sanitized to redact API key patterns
- IPv6 link-local detection uses first hextet parsing (`(value & 0xffc0) === 0xfe80`)

## Crash Recovery & Process Lifecycle

### Error Handling Policy (CRITICAL)
- `uncaughtException` and `unhandledRejection` MUST NOT call `app.exit()` — log only, keep running
- Only `SIGINT`, `SIGTERM`, and explicit user quit trigger `app.quit()`

### Recovery Behaviors
- Renderer crash: `render-process-gone` → set flag → destroy window → `window-all-closed` auto-recreates after 1s
- GPU crash: `child-process-gone` with `GPU` type → `webContents.reload()`
- Graceful shutdown: `before-quit` → destroy window + close static server → stop API server → close database → `app.quit()`
- Static server: `activeConnections: Set<net.Socket>` tracked, all `destroy()` on shutdown

## Logging System

- `main.ts` initializes `ConsoleTransport` + `FileTransport` via `loggerRegistry.setDefaultTransports()`
- Production: `minLevel: "info"`, filename: `"app"`. Development: `minLevel: "debug"`, filename: `"dev"`
- Log location: `%APPDATA%/ai-animation-studio/logs/{app|dev}-YYYY-MM-DD.log`
- Rotation: 10MB per file, max 5 files retained. Flush interval: 5s (immediate when queue > 100)
- Method signatures: `logger.info(message, context?)`, `logger.warn(message, context?)`, `logger.error(message, error?, context?)`

## Database Rules

- SQLite in WAL mode via better-sqlite3
- All queries use parameterized statements (never string concatenation)
- `sql-sanitizer.ts` provides `buildSafeUpdate` and `buildSafeDelete`
- Schema defined declaratively via `schema-builder.ts` → `db-schema.ts`
- Migration framework: `migrations.ts` with `runMigrations(db, currentVersion)` — migrations execute within `db.transaction()` for rollback safety
- CURRENT_SCHEMA_VERSION=3, MIGRATIONS contains v3 migration (adds local_video_path columns)
- `MigrationDb` interface requires `transaction(fn: () => void): void` method
- Version locked: better-sqlite3@12.10.0 (NOT ^12.10.0)

### Schema Architecture

- **7-Field Base Columns**: All business tables auto-get: owner_id, created_at, updated_at, is_deleted, deleted_at, version, sync_id
- **JSON Container Pattern**: Volatile fields stored in JSON columns (config, provider, media_refs, tracking, camera, generation, meta, appearance, etc.) to avoid ALTER TABLE
- **Feature Flags**: `SCHEMA_FEATURES` in schema-builder.ts controls which table groups are created
- **Feature Groups**: Each `TableDef` has `featureGroup` marking (core, video, sync, templates, assets)
- **TypeScript Interfaces**: Each JSON container has a corresponding interface in `json-schemas.ts` files (e.g., `VideoTaskConfig`, `VideoTaskProvider`)
- **UPDATE Pattern**: Use `json_set(COALESCE(container, '{}'), '$.key', ?)` for partial JSON container updates
- **Parse Pattern**: Use `parseXxx()` functions from json-schemas.ts to safely parse JSON containers

## Build Rules

- Build script: `build-electron.ps1` (PowerShell) — runs `vite build` with `BUILD_TARGET=electron` for relative base path
- Vite produces static SPA bundle — NO server-side features
- Electron TypeScript compiles separately with `electron/tsconfig.json`
- Plugin docs are copied to `out/docs/` during build
- electron-builder requires `C:\Windows\System32` in PATH (for `cmd.exe` used by `npm ls`)
- Electron mirror config in `.npmrc`: `electron_mirror`, `electron_builder_binaries_mirror`
- `.npmrc` MUST NOT contain non-standard keys (causes "Unknown project config" warnings in npm 10+)
- `out/` is packaged into asar via `files` config; `better-sqlite3` native module is unpacked via `asarUnpack`
- Build-time dependencies (vite, @vitejs/plugin-react, sharp) are excluded from electron-builder `files` to reduce package size

### Code Splitting Strategy

Vite 8 uses rolldown's `codeSplitting` API in `vite.config.ts` with priority-based matching. When adding a new module under `src/modules/`, add a corresponding `codeSplitting.groups` entry with appropriate `test` regex and `priority` (30 for core react vendor, 25 for secondary vendor, 20 for infrastructure, 18 for shared/domain, 15 for app modules, 10 for generic vendor, 5 for common).

All page routes use `React.lazy()` for code splitting — pages are only loaded when navigated to.

### ESLint Configuration

ESLint 9 flat config with the following plugins:
- `typescript-eslint` — TypeScript-specific rules (`@typescript-eslint/no-unused-vars`, `@typescript-eslint/no-explicit-any`)
- `eslint-plugin-react` — React rules (`react/no-unescaped-entities`)
- `eslint-plugin-react-hooks` — Hooks rules (`react-hooks/rules-of-hooks`)

Production code: `@typescript-eslint/no-explicit-any` is **error**. Test code: **warn**.

### Native Module Rules (CRITICAL for AI)

**原生模块必须精确锁定版本**，禁止使用 `^` 或 `~`。原因：原生模块的小版本升级可能引入 C++ API 变更，导致 `electron-rebuild` 编译失败。

当前原生模块清单：
| 模块 | 锁定版本 | 原因 |
|------|---------|------|
| better-sqlite3 | 12.10.0 | SQLite3 绑定，C++ 原生编译 |

**AI 修改 package.json 时必须遵守**：
1. 不要将原生模块版本从精确锁定改为 `^` 或 `~`
2. 新增原生模块依赖时，必须精确锁定版本
3. 新增原生模块后，必须在 `electron-builder` 的 `asarUnpack` 中添加对应的 `.node` 文件路径
4. 新增原生模块后，必须在 `postinstall` 和 `rebuild` 脚本中添加 rebuild 命令

**验证脚本**：`node scripts/check-native-modules.mjs` — 检查原生模块版本是否精确锁定

### NPM Scripts

> See `quick-start.md` for the full NPM scripts table.

### CI/CD Pipeline

- **CI** (`.github/workflows/ci.yml`): lint → typecheck → architecture check → module API consistency → unit tests → Electron build (Win + Mac, main/master only)
- **Release** (`.github/workflows/release.yml`): triggered by `v*` tags → build:electron → rebuild native → electron-builder --publish always
- **Pre-commit** (`.husky/pre-commit`): typecheck → architecture check → lint-staged

## Code Style

- NO comments in code unless explicitly requested
- Use `crypto.randomUUID()` for ID generation (not Date.now + Math.random)
- Use `useRef` for stable references in useEffect to avoid closure traps
- All async operations in useEffect must have cancellation guards
- Toast notifications for user feedback on failures
- Non-React code (Zustand stores, polling engines) must use `emitToast()` from `@/shared/utils/toast-bridge` instead of `useToastHelpers`
- `withTransitionGuard`: dev mode throws `TransitionError` on invalid state transitions, production mode strips status field silently
- ErrorBoundary wraps all page-level components
- `unknown` over `any` for caught errors; use `instanceof Error` for safe property access
- Production code MUST use `errorLogger` instead of `console.warn`/`console.error` for logging

## Key Patterns

### Shared-Logic Layer (CRITICAL for AI)

`src/shared-logic/` contains pure business logic shared by both renderer and main process. This eliminates the previous duplication between `electron/src/services/` and `src/modules/`.

**Structure**:
```
src/shared-logic/
  shot/       → reference-engine, consistency-check, reference-check, visual-consistency-check
  prompt/     → prompt-engine, prompt-service
  video/      → video-task-params, video-tracker, video-recovery
  story/      → story-service, storyboard-generation
  index.ts    → Top-level barrel
```

**Rules**:
- ZERO external dependencies — no imports from `@/`, `@shared/`, `@domain/`, or any project layer
- Only relative imports within `shared-logic/` directory
- All types must be self-contained (inline definitions, not imported from other layers)
- No logger dependencies — callers handle logging
- No I/O — pure functions only, accept data and return data

**Usage**:
```typescript
// Renderer (src/modules/)
import { validateReference } from "@/shared-logic/shot/reference-engine";

// Main process (electron/src/api/route-groups/)
import { validateReference } from "@shared-logic/shot/reference-engine";
```

**Path aliases**: `@/shared-logic/*` (renderer, configured in tsconfig.json + vite.config.ts), `@shared-logic/*` (main process, configured in electron/tsconfig.json)

### defineRoute (Type-Safe API Routes)

All API routes use `defineRoute()` for automatic type inference from Zod schemas:

```typescript
import { defineRoute } from "../types";
import { generateVideoSchema, type GenerateVideoRequest } from "../schemas";

"generate-video": defineRoute({
  schema: generateVideoSchema,
  handler: async (_method, body, req) => {
    // body is typed as GenerateVideoRequest (inferred from schema)
    const { prompt, firstFrameUrl, characterRefs } = body;
  },
  methods: ["POST"],
})
```

**Rules**:
- Every route with a schema MUST use `defineRoute()`
- Routes without a schema use `defineRoute({ handler, methods })` (no schema parameter)
- Zod schemas in `schemas.ts` MUST export both the schema and the inferred type: `export type XxxRequest = z.infer<typeof xxxSchema>`
- Handler body parameter is automatically typed — no `as` assertions needed for schema-typed fields

### Video Task CQRS Pattern

Video task management follows CQRS (Command Query Responsibility Segregation):

```typescript
// State — pure Zustand store, no side effects
import { useVideoTaskState } from "@/modules/video/task-management";

// Queries — read-only derived data
import { useVideoTaskQueries } from "@/modules/video/task-management";

// Commands — write operations (API calls + state updates)
import { useVideoTaskCommands } from "@/modules/video/task-management";

// Polling — periodic status checks
import { useVideoTaskPolling } from "@/modules/video/task-management";

// Composition — backward-compatible unified interface
import { useVideoTaskManager } from "@/modules/video/task-management";
```

**Rules**:
- `useVideoTaskState` — NO API calls, NO side effects, only state mutations
- `useVideoTaskQueries` — read-only, uses useMemo for derived data
- `useVideoTaskCommands` — handles API calls then updates state
- `useVideoTaskPolling` — handles periodic status checks
- `useVideoTaskManager` — combines all above, existing consumers don't need to change

**Performance patterns**:
- **stableActions**: `useVideoTaskManager` caches all action methods via `useMemo([store])` — their references never change since they come from `store.getState()`. This prevents action references from changing when `allTasks` updates, avoiding unnecessary re-renders in consumers like `StoryProvider`.
- **setAllTasks no auto-trigger**: `setAllTasks` only updates Zustand state. Write operations explicitly call `scheduleSync()` + `checkAndStartOrStopPolling()` after state updates. Polling engine triggers sync/polling once after batch updates via dynamic `import("./sync-engine")`.
- **useStableCompletedUrls**: In `useStoryVideo`, the `completedTaskUrls` Map uses shallow comparison — only creates a new reference when content actually changes, preventing polling updates from triggering downstream useEffects.

### SyncEngine Class

Sync engine is encapsulated as a class (`src/modules/sync/engine/sync-engine-class.ts`), accessed via DI or function-based API:

```typescript
// Via DI container (recommended for new code)
const engine = container.syncEngine;

// Via function API (backward compatible)
import { initSyncEngine, performSync, startAutoSync } from "@/modules/sync/engine/engine";
```

**Rules**:
- No module-level `let` variables — all state encapsulated in class
- No `window.__SYNC_ENGINE_STATE__` HMR hack
- Function-based API delegates to singleton instance for backward compatibility

### DI Container Introspection

```typescript
import { TOKEN_IDS, getTokenRegistry } from "@/infrastructure/di";

// Get all token IDs (compile-time constant)
const tokenIds = TOKEN_IDS; // Record<string, string>

// Get token metadata with categories
const registry = getTokenRegistry(); // Array<{ key, id, category }>
```

### IPC Channel Separation (CRITICAL)

Business logic MUST go through HTTP API, not direct IPC database operations:

- **Allowed direct IPC in modules**: `saveFileDialog`, `openFileDialog`, `secureConfigResolve` (desktop-only). File operations (`writeFile`, `readFile`, `getFileInfo`, `getCacheDirectory`, `getDiskSpace`, `fileExists`, `deleteFile`) and config read/write (`getConfig`, `setConfig`) MUST go through `@/shared/file-http` unified layer (HTTP `/api/file/*` + `/api/config/*` with IPC fallback).
- **Forbidden IPC in modules**: `dbQuery`, `dbRun`, `dbBatchInsert`, `dbGet`, `dbTransaction` (enforced by ESLint `no-direct-db-ipc` rule)

### DI Container Usage
```typescript
import { container } from "@/infrastructure/di";
const storage = container.videoTaskStorage;
```

**DI Token 准则**：仅注册 Port 接口实现、有状态服务、需测试替换的依赖。`@/shared/*` 的纯函数（如 `resolveImageUrl`、`mapUserFacingError`）直接导入，不走 DI。来自 `@/infrastructure/*` 的纯函数通过 `@/shared/` 代理导出（如 `@/shared/db-core`、`@/shared/api-config`、`@/shared/video-cache`、`@/shared/outfit`），不走 DI。

### Key Code Patterns

```typescript
// Electron App Headers
import { ELECTRON_APP_HEADERS } from "@/config/constants";
fetch(url, { headers: { ...ELECTRON_APP_HEADERS, "Content-Type": "application/json" } });

// Safe Storage Operations
import { withRetry, safeQuery, safeRun, safeTransaction } from "@/shared/db-core";
await withRetry(() => storage.run(sql, params));

// JSON Container Pattern
import { parseConfig, parseProvider } from "@/infrastructure/storage/video-tasks/json-schemas";
const config = parseConfig(record.config);

// Schema Builder
import { generateTableSQL, BASE_COLUMNS } from "../../../electron/src/database/schema-builder";
const sql = generateTableSQL(tableDef);

// Domain Port + DI Decoupling
// Modules define Port interfaces in domain/ (e.g., VideoGeneratorPort)
// Infrastructure provides implementations registered in DI container
// Modules access via container.xxx — never direct infrastructure imports

// React Router Navigation (Vite SPA)
import { Link, useNavigate, useLocation, useSearchParams, useParams } from "react-router-dom";
```

### Preference Storage (Hydration-Safe)

```typescript
import { usePreference, preferencesStorage } from "@/shared/utils/preferences";
const [value, setValue] = usePreference<SettingsType>("storage-key", defaultValue);
```

Uses `useSyncExternalStore` internally with snapshot caching. Supports cross-tab sync via `storage` event listener.

### Frame Pair Generation Pipeline

首尾帧生成管线：预览图(keyframe) → 首尾帧(framePair) → 视频(video). Uses `videoProvider.generateFramePair` single path. Providers without reference image support must convert `keyframeUrl` to text prompt `[参考预览图 URL]`.

### Model Capabilities & Reference Strategy

```typescript
import { getModelCapabilities, getVideoGenerationStrategy } from "@/shared/model-capabilities";

const caps = getModelCapabilities(modelId);
// caps.supportsCharacterRef, caps.supportsSceneRef

const strategy = getVideoGenerationStrategy(modelId);
// strategy.useCharacterRef, strategy.useSceneRef — from caps, not hardcoded
// strategy.characterRefMode — "native_field" | "bake_into_first" | "ref_field" | "both" | "none"
// strategy.sceneRefMode — same options
// strategy.promptLanguage — "en" | "zh" | "auto"
```

- `bake_into_first`: Video API doesn't receive reference images; they're baked into first frame via `ref_image` param (Seedance pro)
- `ref_field`: Via `role: "reference_image"` (Seedance lite-i2v)
- `native_field`: Via API native fields (Kling V2+ `subject_reference`, MiniMax `subject_image_url`)
- `BUILTIN_MODEL_CAPABILITIES` model IDs must match provider official API docs exactly
- `getDefaultCapabilities()` uses conservative defaults (`false`/`0`/empty) for new fields

### API Connection Test Error Suggestions

When `testConnection()` fails, the UI shows specific error reasons and actionable suggestions based on HTTP status code:

| Status Code | Suggestion i18n Key | Meaning |
|-------------|---------------------|---------|
| 401 / 403 | `test.suggestion.checkApiKey` | API Key 无效或权限不足 |
| 404 | `test.suggestion.checkBaseUrl` | Base URL 不正确 |
| 0 / 5xx | `test.suggestion.checkNetwork` | 网络问题或服务器故障 |

Implementation in `multi-api.ts`: checks `error.statusCode` from `ApiClientError`, falls back to generic error message for unknown status codes.

`getAllTemplates()` auto-filters `deprecated: true` templates. Set `deprecated` (not delete) for unavailable providers to preserve config for future use.

### Vite Build Configuration

`vite.config.ts` uses `BUILD_TARGET=electron` for relative base path. See `vite.config.ts` for the full code splitting groups configuration.

## Testing

- Framework: Vitest (unit) + Playwright (e2e)
- Unit tests: `npx vitest run`
- Module integration tests in `__tests__/` directories
- Test files follow `*.test.ts` or `*.test.tsx` naming
- better-sqlite3 must be rebuilt for Node.js before testing (`npm rebuild better-sqlite3`)
- Before Electron packaging, better-sqlite3 is auto-rebuilt by `@electron/rebuild`

### E2E Testing

Three modes: **Browser mode** (`npx playwright test`, uses electron-mock, no Electron build required), **Electron mode** (`--config=playwright.electron.config.ts`, requires `npm run build:electron` first), **Page load tests** (`--config=playwright.electron-pages.config.ts`). Test infrastructure: `tests/helpers/electron-fixture.ts`, `tests/helpers/electron-page-helpers.ts`, `tests/electron/`.

## Lint & Type Check

- ESLint: `npx eslint .` (includes architecture guard rules)
- Architecture scan: `node scripts/check-architecture.mjs` (checks DDD violations, bare SQL, deep-path imports)
- Module API consistency: `node scripts/check-module-api-consistency.mjs` (checks MODULE.md ↔ index.ts sync)
- TypeScript: `npx tsc --noEmit` (root) and `npx tsc -p electron/tsconfig.json --noEmit` (electron)
- Build: `powershell -ExecutionPolicy Bypass -File build-electron.ps1`

## Known Architecture Debt

| 债务项 | 严重度 | 说明 |
|--------|--------|------|
| WASM 依赖膨胀 | 低 | better-sqlite3 原生模块，打包时 asarUnpack 解压 .node 文件，无害 |
| Electron 镜像依赖 | 低 | .npmrc 配置国内镜像（有注释说明），海外构建可用环境变量覆盖 |
| 版本锁定策略 | 低 | better-sqlite3 精确锁定 12.10.0（原生模块必须精确锁定，见下方规则） |

## AI Maintenance Workflow (CRITICAL)

When modifying code in this project, follow this standard workflow to ensure architectural integrity:

### Step 1: Read Contracts Before Coding

Before modifying any module, read its contracts in this order:
1. **`MODULE.md`** — Module overview, sub-domain table, public API list, boundary constraints
2. **`contract.json`** (per sub-domain) — Sub-domain name, description, dependencies, publicAPI, **invariants**
3. **`.ai/modules/{module}.md`** — Detailed AI maintenance guide with modification rules and sub-domain specifics
4. **`index.ts`** — Actual barrel exports

Total reading: ~130 lines per sub-domain. Do NOT read internal implementation files unless modifying them.

### Step 2: Respect Invariants

Every `contract.json` has an `invariants` array. These are **non-negotiable business rules**:
- State transitions must go through designated state machines
- Certain operations must be serial/idempotent/pausable
- Specific data flows must follow prescribed paths

If your change violates an invariant, either:
- Change your approach to respect the invariant, OR
- Update the invariant in `contract.json` with explicit justification

### Step 3: Follow Import Rules

| Layer | Allowed Imports | Forbidden Imports |
|-------|----------------|-------------------|
| `domain/` | Nothing external | `@/modules/*`, `@/infrastructure/*`, `@/shared-logic/*` |
| `shared-logic/` | Relative imports within shared-logic only | ALL external imports (`@/`, `@shared/`, any project layer) |
| `shared/` | `@/domain/*`, `@/infrastructure/*` (proxy exports only) | `@/modules/*`, `@/shared-logic/*` |
| `modules/` | `@/domain/*`, `@/shared/*`, `@/shared-logic/*`, `@/infrastructure/di` | `@/infrastructure/*` (except DI), `@/modules/*/*/*` |
| `infrastructure/` | `@/domain/*`, `@/shared/*` | `@/modules/*`, `@/shared-logic/*` |
| `app/` | All layers | Deep module paths `@/modules/*/*/*` |
| `electron/src/api/` | `@shared-logic/*`, `@shared/*`, `@domain/*` | `@/modules/*` |

When a module needs an infrastructure function, create a proxy export in `@/shared/` (e.g., `@/shared/db-core`, `@/shared/api-config`). Only register in DI container if the dependency is stateful or needs test replacement via `overrideToken()`.

### Step 4: Update Contracts When API Changes

If your change modifies a module's public API:
1. Add/remove exports in sub-domain `index.ts`
2. Re-export in module `index.ts`
3. Update `MODULE.md` public API section
4. Update `contract.json` `publicAPI` field
5. Run `node scripts/check-module-api-consistency.mjs` to verify

If your change only modifies internal implementation (no API change), no contract updates needed.

### Step 5: Validate After Changes

Run `npm run validate:full` after every code change. This runs: typecheck (root + electron + test), eslint, architecture check, module API consistency, contract validation, and unit tests.

### Step 6: Write Tests

- New services MUST have unit tests in `__tests__/` within the sub-domain
- Use `overrideToken()` from DI to mock dependencies
- Test files can use `@/infrastructure/*` imports (warn level, not error)
- Run: `npx vitest run src/modules/{module-name}`

### Plugin System Architecture

The plugin system supports two forms of user plugins:

| Plugin Type | Format | Location | Loader |
|-------------|--------|----------|--------|
| Built-in | TypeScript class | `electron/src/plugins/providers/` | Direct import |
| Declarative | `.plugin.json` | `~/AI Animation Studio/UserPlugins/` | `UserPluginAdapter` |
| Code | `.plugin.js` | `~/AI Animation Studio/CodePlugins/` | `CodePluginAdapter` (process isolation) |

**Key interfaces**: `AIProviderPlugin` (base), `ProviderCapabilities` (`{ video, image, text, vision }`), `MatchPattern` (URL/model matching), `getApiKeyDetection()`, `getModelParameterProfile(modelId)`

**Code plugin sandbox**: `vm.createContext()` + `vm.runInContext()` with 5s timeout inside worker process. Pre-scans for escape patterns, freezes prototypes, disables dangerous objects. Reference template: `docs/examples/reference-code-plugin.plugin.js`

**Code plugin process isolation**: Each code plugin runs in a dedicated child process via `child_process.fork()`. `PluginProcessManager` manages lifecycle with crash protection (max 3 crashes in 60s → auto-disable), 10s call timeout, 15s spawn timeout. Security boundary: OS-level separation protects main process even if V8 escape occurs.

### Optimistic Locking

All business tables have a `version` column (7-field base columns). Critical update operations support optimistic locking:

- `buildSafeUpdate()` accepts optional `options.version` → adds `WHERE version = ?` + `SET version = version + 1`
- `updateStory(id, data, version?)`, `updateCharacter(id, data, version?)`, `updateElement(id, data, version?)`, `updateVideoTask(id, data, version?)` all support version parameter
- When `version` is provided and `changes === 0`, throws `VersionConflictError` (from `@/shared/errors/version-conflict`)
- `mapUserFacingError` handles `VersionConflictError` → returns `t("error.versionConflict")`
- **mapUserFacingError 使用边界**：`catch(err)` 中的原始异常必须用 `mapUserFacingError(err)` 映射（过滤技术细节），但 `result.error`（Result 类型的已处理字符串消息）应直接展示 `result.error || t("...")`，不应再包装 `mapUserFacingError`（否则会丢失具体信息变成通用"操作失败"）

### Security Hardening

**Local-first security model**: IPC channel registration check, DDL blocking in main process handler, user-configured API URLs trusted, SSRF guard enforced for non-loopback hosts (R105), API Key encrypted storage via electron-store.

**Plugin cache invalidation**: `plugin-manager` calls `loadPluginDetectionRules()` + `loadPluginTemplates()` + `loadModelProfilesFromServer()` after reload. `ApiConfigPanel` refreshes plugin caches on provider add/remove.

### DI Container Token Categories

| Category | Description | Examples |
|----------|-------------|---------|
| A. Domain Port 实现 | Port interface implementations | videoProvider, characterStorage |
| B. 有状态服务 | Singletons needing test replacement | eventBus, apiClient |
| C. Storage 实例 | Stateful storage modules | versionStorage, templateStorage |
| D. Repository 实例 | Drizzle ORM repositories | mediaAssetRepository |
| E. 懒加载模块 | Lazy-loaded to avoid circular deps | elementManager, referenceEngine, syncEngine |

Full token reference: `docs/di-tokens.md` (auto-generated by `npm run di-docs`).

Note: Pure functions from `@/infrastructure/*` that modules need are exported via `@/shared/` proxy modules (e.g., `@/shared/db-core`, `@/shared/api-config`, `@/shared/video-cache`, `@/shared/outfit`, `@/shared/sql-safety`, `@/shared/model-capabilities`).

## Regression Guards (from Bug Audit)

> Full regression guard rules (R1-R151) are split by category in `.trae/rules/regression/`.
> Start with `index.md` for the category overview, then load only the relevant category file.
> The original unified file is at [regression-guards.md](./regression-guards.md) (181KB, not recommended for AI context loading).

### Bug Audit Methodology

When conducting a bug audit, follow the 3-phase workflow from `docs/bug-audit-methodology.md`:

1. **Scenario Discovery** — AI simulates real users, finds breakpoints from usage scenarios. NO pre-set checklists.
2. **Targeted Verification** — Find code evidence for each scenario: [Confirmed] / [Ruled Out] / [Needs Confirmation]
3. **Rule Consolidation** — Abstract confirmed bugs into reusable detection rules → write to regression-guards.md

**CRITICAL Isolation Principle**: Phase 3 rules are **regression guards**, NOT discovery tools. The next audit's Phase 1 MUST start from scratch — never reference Phase 3 rules as a checklist.

### Regression Guard Automation (CRITICAL)

When AI discovers a bug (during audit, code review, or development), it MUST follow the automated protocol in `.trae/rules/regression-guard-automation.md`:

1. **Fix the bug** — Record what was changed and why
2. **Decision evaluation** — Answer 5 questions (Q1-Q5) to determine if regression guard is needed:
   - Q1: Reproducible? (No → add monitoring, stop)
   - Q2: Regression risk? (No → stop)
   - Q3: Auto-detectable? (No → add CR rule, skip automation)
   - Q4: Severity ≥ P2? (No → record only, stop)
   - Q5: General pattern? (Yes → general rule; No → targeted test only)
3. **Write regression test** — `regression-r{n}.test.ts` with positive + negative + boundary tests
4. **Write regression guard rule** — Add to `regression-guards.md` with R{N} number, BAD/GOOD examples, detection method
5. **Implement automated detection** — ESLint rule, architecture scan script, or CR rule
6. **Update project docs** — Update rule count in `project_rules.md`, update MODULE.md if invariants changed

**Quick reference — all 151 guards by category:**

| Category | Count | Key Concern |
|----------|-------|-------------|
| 数据一致性 | 22 | 数据不丢、不脏、不冲突（含 R109 transactional delete orphan tracking, R116 sync push-pull atomicity, R125 import ON CONFLICT, R141 db/run scheduleSave, R150 normalize camera value, R157 video-cache constants cross-layer consistency） |
| 异步安全 | 22 | 并发、竞态、轮询、生命周期（含 R115 commands delegate to store, R117 setup idempotent, R122 clear tasks notify server, R127 persistence debounce, R140 polling engine lazy init, R187 no setInterval polling） |
| 错误处理 | 16 | 错误不吞、不假成功、用户可理解（含 R108 api client result no throw, R129 JSON.parse try/catch, R134 delete dialog disable on referenced, R136 bulk-save failures） |
| UI 健壮性 | 24 | 界面不崩、有反馈、无泄漏、a11y 可访问（含 R158 Toast hover pause, R160 unified Modal, R161 IconButton aria-label, R163 focus-visible, R164 Modal focus, R167 custom modal role/aria-modal, R168 icon button aria-label, R169 div onClick role, R170 Tabs component, R171 form label, R172 progressbar role, R173 aria-live, R174 emoji aria-hidden, R183-R186 P0 修复审计） |
| 工程质量 | 38 | 依赖合规、构建安全、测试可靠、i18n（含 R154 useAssetLoader Promise.all, R155 StoryProvider useMemo, R156 stats memo, R159 validateApiKey errorKey, R162 labelKey/value split, R165 coming-soon t(), R166 no zh-CN locale, R175 throw Error t() i18n, R176 data constant labelKey, R177 DOM useRef, R178 callback no shadow t, R179 Port interface extension, R180 function split, R181 no hardcoded Tailwind colors, R182 config/set async keyStorage persistence, R188 no top-level side effects, R189 no top-level beforeunload） |
| 平台兼容 | 6 | IPC、Electron环境、进程模型 |
| 用户安全防护 | 17 | 破坏性操作需确认、数据清除需保护 |
| 系统安全 | 38 | 沙箱隔离防逃逸、IPC通道注册检查（含 R105 SSRF 防护, R118 redirect SSRF guard, R119 openPath whitelist, R120 no plaintext fallback, R123 sandbox constructor lock, R124 apikey header, R126 IPC no credential leak, R128 IPC input validation, R130 timer cleanup, R131 foreign keys, R132 sync http client SSRF, R133 SSRF fail-close, R137 param sanitization, R138 schema-builder quotes, R139 identifier validation, R142 api-gateway fail-close, R143-R145 SQL/SSRF 防护, R148-R149 备份/文件大小限制） |

> For individual rule details, see `.trae/rules/regression/{category}.md`.

## Documentation Index

**CRITICAL**: Documentation MUST be updated in the same commit as the code change, not deferred.

### Active Documents (must update when code changes)

| Document | Location | When to Update |
|----------|----------|----------------|
| Regression Guards | `.trae/rules/regression/index.md` + per-category files | New bug pattern discovered and fixed |
| Regression Guard Automation | `.trae/rules/regression-guard-automation.md` | AI discovers a bug and needs to decide whether to add guard |
| AI Tool Integration | `.trae/rules/ai-tool-integration.md` | Optimizing project for AI coding tool workflows |
| Session Notes | `.ai/session-notes.md` | End of each AI session |
| Module Contracts | `src/modules/{module}/MODULE.md` | Module public API, behavior, or invariants change |
| Sub-domain Contracts | `src/modules/{module}/{subdomain}/contract.json` | Sub-domain publicAPI or invariants change |
| DI Container Tokens | `src/infrastructure/di/container.ts` | Adding/removing DI tokens |
| Project Rules | `.trae/rules/project_rules.md` | npm scripts, test infrastructure, architecture patterns, guard counts |
| Quick Start | `.trae/rules/quick-start.md` | Key file paths, commands, or common scenarios change |

### Reference Documents (read-only)

| Document | Location | Purpose |
|----------|----------|---------|
| Architecture & Design | `docs/ARCHITECTURE.md` | Single authoritative doc for architecture decisions |
| DI Token Reference | `docs/di-tokens.md` | Auto-generated DI token docs (`npm run di-docs`) |
| Plugin Specification | `docs/plugin-specification.md` | Plugin system specification |
| Bug Audit Report | `docs/bug-audit-report.md` | Original audit findings (R1-R18 source) |

## AI Modification Guidelines (CRITICAL)

### Common Pitfalls & Anti-Patterns

#### 1. "安慰剂"错误处理
NEVER silently swallow errors and return a success-like result. If an operation fails, the result MUST reflect the failure.

```typescript
// GOOD — Failure is honestly reported:
catch {
  return { passed: false, recommendation: "adjust" };
}
```

#### 2. Fragile String Matching for Error Classification
NEVER rely on `message.includes("timeout")` for error classification. Use structured error codes with regex fallback.

```typescript
// GOOD — Structured error classification:
const ERROR_CODE_PATTERNS = [
  { category: "timeout", codes: ["TIMEOUT", "ETIMEDOUT"], patterns: [/timeout/i] },
  { category: "rate_limit", codes: ["RATE_LIMITED", "429"], patterns: [/rate[\s_-]?limit/i] },
];
export function classifyError(errorCode?: string, errorMessage?: string): ErrorCategory { ... }
```

#### 3. DI Container Abuse for Pure Functions
NEVER register pure functions in the DI container. Move them to `@/shared/` so modules can import directly.

```typescript
// GOOD — Direct import from shared:
import { sanitizeIdentifier, sanitizeTable } from "@/shared/sql-safety";
```

DI is for: Port implementations, stateful services, test-replaceable dependencies.

#### 4. Unnecessary Dynamic Imports
NEVER use `await import()` for modules that are always needed and have no circular dependency risk. Use top-level static imports.

```typescript
// GOOD — Static import:
import { saveVideoTask } from "@/modules/video/recovery";
```

Dynamic imports are acceptable ONLY for: code splitting large optional features, avoiding proven circular dependencies, or lazy-loading heavy modules.

#### 5. Event Propagation in Nested Click Handlers
When a clickable container has a nested action button, ALWAYS call `e.stopPropagation()` on the nested button.

```tsx
// GOOD:
<div onClick={onClick}>
  <button onClick={(e) => { e.stopPropagation(); onDelete(e); }}>Delete</button>
</div>
```

#### 6. Result Type Unwrapping
When a function returns `Result<T>`, ALWAYS unwrap before using the value.

```typescript
// GOOD:
const result = generateBeatKeyframe(...);
if (result.ok) {
  beat.keyframe = result.value;
}
```

#### 7. Unguarded Electron-Dependent Operations in useEffect
When a `useEffect` performs operations that require `electronAPI`, it MUST check `isElectron()` inside the async callback.

```typescript
// GOOD:
useEffect(() => {
  let cancelled = false;
  (async () => {
    if (!isElectron()) {
      if (!cancelled) setIsLoading(false);
      return;
    }
    try {
      const data = await fetchPlugins();
      if (!cancelled) setPlugins(data);
    } catch (err) {
      if (!cancelled) errorLogger.error("Failed", err);
    } finally {
      if (!cancelled) setIsLoading(false);
    }
  })();
  return () => { cancelled = true; };
}, []);
```

#### 8. localStorage in useState Initializer (Hydration Mismatch)
NEVER use `useState(() => localStorage.getItem(...))`. Use the `usePreference` hook instead.

```typescript
// GOOD:
import { usePreference } from "@/shared/utils/preferences";
const [theme, setTheme] = usePreference<string>("theme", "dark");
```

### Modification Checklist

Before submitting any code change, verify:

1. **Dependency direction**: No `shared → modules` or `domain → infrastructure` imports
2. **Error honesty**: All error paths return failure indicators, not silent "success"
3. **DI necessity**: Only stateful/test-replaceable/infrastructure-bridge items in container
4. **Static imports**: No dynamic imports unless circular dependency is proven
5. **Event isolation**: Nested click handlers use `stopPropagation()`
6. **Result unwrapping**: `Result<T>` values are unwrapped before use
7. **Contract sync**: If public API changed, update MODULE.md + contract.json + index.ts
8. **Test coverage**: New services/hooks have tests in `__tests__/`
9. **Validation pass**: `npx eslint .` + `npx tsc --noEmit` + `npx vitest run`
10. **Video onError guard**: All `<video>` onError handlers use `data-retried` guard (R7)
11. **No fetch("/api/...")**: All internal communication uses DI/IPC/proxy exports (R21)
12. **Async button loading**: Delete/save confirm buttons have loading state (R22/R23)
13. **Action feedback**: Explicit user actions provide success toast feedback (R24)
14. **Data loading indicator**: Data-dependent UI shows spinner during fetch (R25)
15. **Electron environment guard**: useEffect with electronAPI operations checks `isElectron()` (R51)
16. **No localStorage in useState**: Use `usePreference` hook for localStorage-dependent state (R52)
17. **No next/* imports**: All Next.js imports replaced with react-router-dom or native alternatives (R57)
18. **useSearchParams destructuring**: React Router's `useSearchParams()` returns tuple, always destructure `[searchParams]` (R58)
19. **User-facing strings use t()**: All toast/confirm/showError/dialog title/placeholder/label text MUST use `t()` from `@/shared/constants` (R56)
20. **Documentation sync**: All affected documents updated in the same commit (see Documentation Update Triggers table)
21. **Regression guard evaluation**: If this change fixes a bug, evaluate Q1-Q5 from `regression-guard-automation.md` and add guard if applicable

### Testing Conventions

- Test files: `src/modules/{module}/{subdomain}/{services|hooks}/__tests__/{name}.test.ts`
- Mock strategy: `vi.hoisted()` for pre-import mocks, `vi.mock()` for module-level, `overrideToken()` for DI
- Coverage thresholds: 80% branches/functions/lines/statements, per-file enforcement
- See `testing-rules.md` for detailed test structure template and mock patterns

**Adding a new token**: Determine which category it belongs to. If category E, add a comment explaining why the module cannot import directly.
