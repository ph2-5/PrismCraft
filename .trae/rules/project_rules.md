# AI Animation Studio - Project Rules

## Architecture Overview

This is an **Electron + Next.js** desktop application for AI-powered animation production.
Architecture: **DDD (Domain-Driven Design) with sub-domain modules**, optimized for AI-driven development.

- **Build Target**: Electron desktop app (local-first, offline-capable)
- **Frontend**: Next.js 16 (output: "export") + React 19 + Zustand 5 + Tailwind CSS 4
- **Backend**: Electron main process + better-sqlite3 (WAL mode) + HTTP API server
- **Language**: TypeScript (strict mode)

## Directory Structure & Layer Rules

```
src/
  domain/          → Pure types, schemas, result types. NO imports from modules/ or infrastructure/
  modules/         → Business logic sub-domains (each has hooks/, services/, presentation/)
  infrastructure/  → DI container, storage, network, API client, AI providers
  shared/          → Cross-cutting UI (Toast, Sidebar, ErrorBoundary), utils, error-logger
  app/             → Next.js pages and layouts (consumes modules via Context)
  config/          → Constants, ports, shared config

electron/src/
  main.ts          → App lifecycle, window management, crash recovery
  main-dev.ts      → Dev mode entry (same crash recovery, debug logging, DevTools)
  main-common.ts   → Shared: createWindow, static server, gracefulShutdown, config IPC
  api-server.ts    → HTTP API server for renderer↔main communication
  preload.ts       → IPC bridge with permission system and rate limiting
  database/        → SQLite connection, schema builder, schema, migrations
  handlers/        → IPC handlers (database, config, sync, secure-config)
  plugins/         → Plugin registry, user plugin loader, providers
  security/        → SSRF guard, key storage
  logging/         → Logger with ConsoleTransport + FileTransport
```

## Dependency Direction (CRITICAL)

Dependencies must flow **inward only**:

```
app → modules → domain
              → shared
              → infrastructure/di (via container only)
infrastructure → domain, shared
shared → domain, infrastructure (proxy exports only)
domain → NOTHING (pure types)
```

### Violations to avoid:
- `shared/` MUST NOT import from `@/modules/*`
- `shared/` MAY re-export from `@/infrastructure/*` via proxy exports (e.g., `@/shared/db-core`, `@/shared/api-config`)
- `domain/` MUST NOT import from `@/modules/*` or `@/infrastructure/*`
- `modules/` MUST NOT directly import from `@/infrastructure/*` except `@/infrastructure/di` (use DI container or `@/shared/` proxy exports)
- Cross-module imports: use barrel `@/modules/xxx` or `@/modules/xxx/subdomain` not deep paths `@/modules/xxx/hooks/yyy`
- Cross-module deep-path imports (`@/modules/xxx/yyy/zzz`) are blocked by ESLint (error in production code, warn in tests)
- Type re-exports from infrastructure are allowed via `export type` (compile-time only, no runtime dependency)

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
- Rate limiting is enforced per channel
- DDL statements (DROP, ALTER, CREATE, TRUNCATE, ATTACH, DETACH) are blocked from renderer
- SQL comments are stripped before DDL detection to prevent bypass
- `log:security` IPC channel forwards preload security events to main process logger

## Security Rules

- API keys are stored via `electron-store` encryption through IPC (`secure-config:*` channels)
- NEVER store API keys in localStorage or use XOR obfuscation
- All HTTP requests from main process go through SSRF guard
- `X-Electron-App` header required on all API requests (validated server-side)
- Error logs are sanitized to redact API key patterns
- IPv6 link-local detection uses first hextet parsing (`(value & 0xffc0) === 0xfe80`)

## Crash Recovery & Process Lifecycle

### Error Handling Policy (CRITICAL)
- `uncaughtException` and `unhandledRejection` MUST NOT call `app.exit()` — log only, keep running
- Desktop apps must survive transient errors (network timeout, DB busy, IPC glitch)
- Only `SIGINT`, `SIGTERM`, and explicit user quit trigger `app.quit()`

### Renderer Crash Recovery
- `render-process-gone` event sets `isRendererCrashed` flag, destroys window
- `window-all-closed` checks `isRendererCrashed`: if true, auto-recreates window after 1s delay
- Only genuine user-initiated window close triggers `app.quit()`

### GPU Process Crash
- `child-process-gone` with `details.type === "GPU"` triggers `webContents.reload()`
- Other child process exits are logged at warn level

### Graceful Shutdown Sequence
1. `before-quit` → `gracefulShutdown()` (destroy window, close static server)
2. `stopApiServer()` (destroy tracked connections, close HTTP server)
3. `closeDatabase()` (close SQLite connection)
4. `app.quit()`

### Static Server Connection Tracking
- `activeConnections: Set<net.Socket>` tracks all HTTP connections
- On shutdown, all tracked connections are `destroy()` before `server.close()`
- Prevents keep-alive connections from blocking process exit

## Logging System

### Transport Initialization
- `main.ts` initializes `ConsoleTransport` + `FileTransport` at startup via `loggerRegistry.setDefaultTransports()`
- `main-dev.ts` uses `minLevel: "debug"` and `filename: "dev"`
- `main.ts` (production) uses `minLevel: "info"` and `filename: "app"`

### Log File Location
- Production: `%APPDATA%/ai-animation-studio/logs/app-YYYY-MM-DD.log`
- Development: `%APPDATA%/ai-animation-studio/logs/dev-YYYY-MM-DD.log`
- Log rotation: 10MB per file triggers rename to `.1` backup; max 5 log files retained (oldest deleted)
- Flush interval: 5 seconds (immediate flush when queue > 100 entries)

### Logger Method Signatures
```typescript
logger.info(message: string, context?: LogContext)   // 2 params
logger.warn(message: string, context?: LogContext)   // 2 params
logger.error(message: string, error?: Error, context?: LogContext)  // 3 params
```

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

- Build script: `build-electron.ps1` (PowerShell) — temporarily removes `src/app/api/` during build for `output: "export"` compatibility, restores after
- Next.js uses `output: "export"` for Electron — NO server-side features
- Electron TypeScript compiles separately with `electron/tsconfig.json`
- Plugin docs are copied to `out/docs/` during build
- electron-builder requires `C:\Windows\System32` in PATH (for `cmd.exe` used by `npm ls`)
- Electron mirror config in `.npmrc`: `electron_mirror`, `electron_builder_binaries_mirror`
- `.npmrc` MUST NOT contain non-standard keys (causes "Unknown project config" warnings in npm 10+)
- `out/` is packaged into asar via `files` config; `better-sqlite3` native module is unpacked via `asarUnpack`
- Build-time dependencies (next, @next/swc*, sharp, shadcn) are excluded from electron-builder `files` to reduce package size

### NPM Scripts Index

| Script | Purpose |
|--------|---------|
| `npm run dev` | Next.js dev server (renderer only, no Electron) |
| `npm run build` | Next.js production build (web mode) |
| `npm run build:electron` | Full Electron build (Next.js static export + Electron TS compile + file copy) |
| `npm run build:win` | Build + rebuild native + package Windows NSIS installer |
| `npm run build:mac` | Build + rebuild native + package macOS DMG |
| `npm run rebuild` | Rebuild better-sqlite3 for Electron |
| `npm run typecheck` | TypeScript check (root) |
| `npm run typecheck:electron` | TypeScript check (electron/) |
| `npm run lint` | ESLint (src/) |
| `npm run lint:electron` | ESLint (electron/src/) |
| `npm run lint:arch` | Architecture violation scan |
| `npm run test` | Vitest unit tests |
| `npm run test:coverage` | Vitest with coverage report |
| `npm run validate` | typecheck + typecheck:electron + lint + lint:arch + module API consistency + contract validation + test |
| `npm run validate:full` | validate + coverage report with threshold enforcement |

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

## Key Patterns

### DI Container Usage
```typescript
import { container } from "@/infrastructure/di";
const storage = container.videoTaskStorage;
```

**DI Token 准则**：仅注册 Port 接口实现、有状态服务、需测试替换的依赖。`@/shared/*` 的纯函数（如 `resolveImageUrl`、`getErrorMessage`）直接导入，不走 DI。来自 `@/infrastructure/*` 的纯函数通过 `@/shared/` 代理导出（如 `@/shared/db-core`、`@/shared/api-config`、`@/shared/video-cache`、`@/shared/outfit`），不走 DI。

### Electron App Headers
```typescript
import { ELECTRON_APP_HEADERS } from "@/config/constants";
fetch(url, { headers: { ...ELECTRON_APP_HEADERS, "Content-Type": "application/json" } });
```

### Safe Storage Operations
```typescript
import { withRetry, safeQuery, safeRun, safeTransaction } from "@/shared/db-core";
await withRetry(() => storage.run(sql, params));
```

### JSON Container Pattern
```typescript
import { parseConfig, parseProvider, parseMediaRefs, parseTracking } from "@/infrastructure/storage/video-tasks/json-schemas";

const config = parseConfig(record.config);
const provider = parseProvider(record.provider);
```

### Schema Builder
```typescript
import { generateTableSQL, BASE_COLUMNS } from "../../../electron/src/database/schema-builder";
const sql = generateTableSQL(tableDef);
```

### Safe JSON Parse (Element Repository)
```typescript
function safeJsonParse<T>(raw: unknown, field: string, id: string): T | undefined {
  if (!raw) return undefined;
  try { return JSON.parse(raw as string) as T; }
  catch { return undefined; }
}
```

### Domain Port + DI Decoupling
- Modules define Port interfaces in `domain/` (e.g., `VideoGeneratorPort`)
- Infrastructure provides implementations registered in DI container
- Modules access via `container.xxx` — never direct infrastructure imports

## Testing

- Framework: Vitest
- Run: `npx vitest run`
- Module integration tests in `__tests__/` directories
- Test files follow `*.test.ts` or `*.test.tsx` naming
- better-sqlite3 must be rebuilt for Node.js before testing (`npm rebuild better-sqlite3`)
- Before Electron packaging, better-sqlite3 is auto-rebuilt by `@electron/rebuild`

## Lint & Type Check

- ESLint: `npx eslint .` (includes architecture guard rules)
- Architecture scan: `node scripts/check-architecture.mjs` (checks DDD violations, bare SQL, deep-path imports)
- Module API consistency: `node scripts/check-module-api-consistency.mjs` (checks MODULE.md ↔ index.ts sync)
- TypeScript: `npx tsc --noEmit` (root) and `npx tsc -p electron/tsconfig.json --noEmit` (electron)
- Build: `powershell -ExecutionPolicy Bypass -File build-electron.ps1`

## Known Architecture Debt

- Extraneous WASM packages (`@emnapi/core`, `@emnapi/runtime`, etc.) in node_modules from better-sqlite3 optional deps — cannot be pruned, harmless
- `tsconfig.json` excludes all test files from type checking — Vitest handles test types independently, acceptable for MVP but consider `tsconfig.test.json` for stricter CI
- Hardcoded Chinese strings (~19000+ occurrences across 100 files) — Chinese-only desktop app, full i18n low ROI; extract shared message constants if multi-language support needed in future

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
| `domain/` | Nothing external | `@/modules/*`, `@/infrastructure/*` |
| `shared/` | `@/domain/*`, `@/infrastructure/*` (proxy exports only) | `@/modules/*` |
| `modules/` | `@/domain/*`, `@/shared/*`, `@/infrastructure/di` | `@/infrastructure/*` (except DI), `@/modules/*/*/*` |
| `infrastructure/` | `@/domain/*`, `@/shared/*` | `@/modules/*` |
| `app/` | All layers | Deep module paths `@/modules/*/*/*` |

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

Run this validation sequence after every code change:
```bash
npm run validate:full
```

This is equivalent to:
```bash
npx tsc --noEmit                                     # Type safety
npx tsc -p electron/tsconfig.json --noEmit           # Electron type safety
npx eslint src/                                      # Import restrictions + code style
node scripts/check-architecture.mjs                  # DDD violations + contract.json consistency
node scripts/check-module-api-consistency.mjs         # MODULE.md ↔ index.ts sync
node scripts/validate-contracts.mjs                  # Contract structure + invariants + size checks
npx vitest run                                       # Unit tests
```

### Step 6: Write Tests

- New services MUST have unit tests in `__tests__/` within the sub-domain
- Use `overrideToken()` from DI to mock dependencies
- Test files can use `@/infrastructure/*` imports (warn level, not error)
- Run: `npx vitest run src/modules/{module-name}`

### DI Container Token Categories

When reading or modifying `src/infrastructure/di/container.ts`, understand the 5 categories:

| Category | Description | Examples |
|----------|-------------|---------|
| A. Domain Port 实现 | Port interface implementations | videoProvider, characterStorage |
| B. 有状态服务 | Singletons needing test replacement | eventBus, apiClient |
| C. Storage 实例 | Stateful storage modules cannot import directly | versionStorage, templateStorage |
| D. Repository 实例 | Drizzle ORM repositories | mediaAssetRepository |
| E. 懒加载模块 | Lazy-loaded to avoid circular deps | elementManager, referenceEngine |

Full token reference: `docs/di-tokens.md` (auto-generated by `npm run di-docs`).

Note: Pure functions from `@/infrastructure/*` that modules need are exported via `@/shared/` proxy modules (e.g., `@/shared/db-core`, `@/shared/api-config`, `@/shared/video-cache`, `@/shared/outfit`, `@/shared/sql-safety`, `@/shared/model-capabilities`).

## Regression Guards (from Bug Audit)

> Full regression guard rules (R1-R29) are in [regression-guards.md](./regression-guards.md).
> These rules prevent known bug patterns from reappearing. They are NOT discovery tools for future audits.

### Bug Audit Methodology

When conducting a bug audit, follow the 3-phase workflow from `docs/bug-audit-methodology.md`:

1. **Scenario Discovery** — AI simulates real users, finds breakpoints from usage scenarios. NO pre-set checklists.
2. **Targeted Verification** — Find code evidence for each scenario: [Confirmed] / [Ruled Out] / [Needs Confirmation]
3. **Rule Consolidation** — Abstract confirmed bugs into reusable detection rules → write to regression-guards.md

**CRITICAL Isolation Principle**: Phase 3 rules are **regression guards**, NOT discovery tools. The next audit's Phase 1 MUST start from scratch — never reference Phase 3 rules as a checklist.

**Quick reference — all 29 guards:**

| Category | Rules | Key Concern |
|----------|-------|-------------|
| Data Consistency | R1, R2, R8, R9, R13, R14 | Persist before state, cascade delete, rollback on failure |
| Async Safety | R4, R10, R11, R12, R29 | Dedup, concurrency guard, ownership verify, in-flight warning, entity ID consistency |
| Error Handling | R5, R6, R15, R17, R18 | No silent failure, identifiable labels, partial failure resilience |
| UI Robustness | R7, R16, R19, R20 | Video onError guard, ErrorBoundary retry limit |
| Electron Compatibility | R21 | No fetch("/api/..."), use DI/IPC/proxy exports |
| UX Completeness | R22, R23, R24, R25 | Loading states, action feedback, data loading indicators |
| Code Quality | R3, R26, R27, R28 | Cross-context verify, static imports, DDD layer compliance, batch over N+1 queries |

## Documentation Index

### Active Documents (must update when code changes)

| Document | Location | When to Update |
|----------|----------|----------------|
| Regression Guards | `.trae/rules/regression-guards.md` | When a new bug pattern is discovered and fixed |
| Module Contracts | `src/modules/{module}/MODULE.md` | When module public API changes (Step 4 of AI Maintenance Workflow) |
| Sub-domain Contracts | `src/modules/{module}/{subdomain}/contract.json` | When sub-domain publicAPI or invariants change |
| DI Container Tokens | `src/infrastructure/di/container.ts` | When adding/removing DI tokens (update Category A-E comment) |

### Module Contract Files

Each module has a `MODULE.md` (module overview + public API list) and sub-domain `contract.json` files (invariants, dependencies, publicAPI). When modifying a module, read contracts in this order:

1. `MODULE.md` — Module overview, sub-domain table, public API list, boundary constraints
2. `contract.json` (per sub-domain) — Sub-domain name, description, dependencies, publicAPI, **invariants**
3. `index.ts` — Actual barrel exports

**Module contract locations:**

| Module | MODULE.md | Sub-domains with contract.json |
|--------|-----------|-------------------------------|
| story | `src/modules/story/MODULE.md` | beat-editor, generation, planning, template, prompt-editor |
| video | `src/modules/video/MODULE.md` | task-management (5 sub-contracts), utils, recovery, cache |
| character | `src/modules/character/MODULE.md` | hooks, services |
| scene | `src/modules/scene/MODULE.md` | hooks, services |
| shot | `src/modules/shot/MODULE.md` | shot-instruction, shot-generation, shot-reference, feature-extraction, consistency-check, element-binding, reference-check |
| asset | `src/modules/asset/MODULE.md` | asset-library, import-export, hooks, media-assets, presentation |
| prompt | — | base, builder, beat-image, video, scene, character, server-prompts |
| sync | `src/modules/sync/MODULE.md` | engine, presentation |
| persistence | `src/modules/persistence/MODULE.md` | (single contract) |

### Reference Documents (read-only, historical context)

| Document | Location | Purpose |
|----------|----------|---------|
| Architecture & Design | `docs/ARCHITECTURE.md` | Single authoritative doc: architecture, design decisions, modules, storage, security |
| DI Token Reference | `docs/di-tokens.md` | Auto-generated DI token docs (run `npm run di-docs`) |
| Plugin Specification | `docs/plugin-specification.md` | Plugin system specification |
| Bug Audit Report | `docs/bug-audit-report.md` | Original audit findings (R1-R18 source) |
| Bug Audit Methodology | `docs/bug-audit-methodology.md` | How the audit was conducted |
| Architecture Diagrams | `docs/architecture/diagrams/` | PNG + Mermaid source files |

> **Note**: `docs/ARCHITECTURE.md` is the single source of truth for project architecture. If you find a discrepancy between it and the code, update the document.

## AI Modification Guidelines (CRITICAL)

### Common Pitfalls & Anti-Patterns

#### 1. "安慰剂"错误处理
NEVER silently swallow errors and return a success-like result. If an operation fails, the result MUST reflect the failure.

**BAD** — AI analysis failure returns `passed: true`:
```typescript
catch {
  return { passed: true, recommendation: "accept" };
}
```

**GOOD** — Failure is honestly reported:
```typescript
catch {
  return { passed: false, recommendation: "adjust" };
}
```

#### 2. Fragile String Matching for Error Classification
NEVER rely on `message.includes("timeout")` or similar substring matching for error classification. Use structured error codes with regex fallback.

**BAD**:
```typescript
if (error.message.includes("timeout")) return "timeout";
if (error.message.includes("rate")) return "rate_limit";
```

**GOOD**:
```typescript
const ERROR_CODE_PATTERNS = [
  { category: "timeout", codes: ["TIMEOUT", "ETIMEDOUT"], patterns: [/timeout/i] },
  { category: "rate_limit", codes: ["RATE_LIMITED", "429"], patterns: [/rate[\s_-]?limit/i] },
];
export function classifyError(errorCode?: string, errorMessage?: string): ErrorCategory { ... }
```

#### 3. DI Container Abuse for Pure Functions
NEVER register pure functions (no side effects, no state) in the DI container. Move them to `@/shared/` so modules can import directly.

**BAD** — Pure function in DI:
```typescript
container.sanitizeIdentifier  // Pure function, no state
container.sanitizeTable       // Pure function, no state
```

**GOOD** — Direct import from shared:
```typescript
import { sanitizeIdentifier, sanitizeTable } from "@/shared/sql-safety";
```

DI is for: Port implementations, stateful services, test-replaceable dependencies. Infrastructure pure functions should use `@/shared/` proxy exports instead of DI registration.

#### 4. Unnecessary Dynamic Imports
NEVER use `await import()` or `import().then()` for modules that are always needed and have no circular dependency risk. Use top-level static imports.

**BAD**:
```typescript
const { saveVideoTask } = await import("@/modules/video/recovery");
```

**GOOD**:
```typescript
import { saveVideoTask } from "@/modules/video/recovery";
```

Dynamic imports are acceptable ONLY for: code splitting large optional features, avoiding proven circular dependencies, or lazy-loading heavy modules.

#### 5. Event Propagation in Nested Click Handlers
When a clickable container has a nested action button (e.g., delete inside a list item), ALWAYS call `e.stopPropagation()` on the nested button to prevent the container's onClick from firing.

**BAD**:
```tsx
<div onClick={onClick}>
  <button onClick={onDelete}>Delete</button>
</div>
```

**GOOD**:
```tsx
<div onClick={onClick}>
  <button onClick={(e) => { e.stopPropagation(); onDelete(e); }}>Delete</button>
</div>
```

#### 6. Result Type Unwrapping
When a function returns `Result<T>`, ALWAYS unwrap before using the value. Never assign `Result<T>` directly where `T` is expected.

**BAD**:
```typescript
beat.keyframe = generateBeatKeyframe(...);  // Returns Result<StoryBeatKeyframe>
```

**GOOD**:
```typescript
const result = generateBeatKeyframe(...);
if (result.ok) {
  beat.keyframe = result.value;
}
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
10. **Video onError guard**: All `<video>` onError handlers use `data-retried` guard (R19)
11. **No fetch("/api/...")**: All internal communication uses DI/IPC/proxy exports (R21)
12. **Async button loading**: Delete/save confirm buttons have loading state (R22/R23)
13. **Action feedback**: Explicit user actions provide success toast feedback (R24)
14. **Data loading indicator**: Data-dependent UI shows spinner during fetch (R25)

### Testing Conventions

#### Test File Location
- Services: `src/modules/{module}/{subdomain}/services/__tests__/{service}.test.ts`
- Hooks: `src/modules/{module}/{subdomain}/hooks/__tests__/{hook}.test.ts`
- Components: `src/modules/{module}/presentation/__tests__/{Component}.test.tsx`

#### Mock Strategy
- Use `vi.hoisted()` for mock functions that must exist before module import
- Use `vi.mock()` for module-level mocking (DI container, external packages, UI components)
- Use `overrideToken()` from DI to replace specific container tokens in tests
- Mock UI components (`@/shared/ui/*`) as simple HTML elements in component tests
- Mock `next/link` as `<a>` tag in component tests

#### Test Structure
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// 1. Hoisted mocks (before any imports that use them)
const { mockFn } = vi.hoisted(() => ({ mockFn: vi.fn() }));

// 2. Module mocks
vi.mock("@/infrastructure/di", () => ({ container: { ...mockFn } }));

// 3. Import SUT (system under test)
import { ComponentName } from "../ComponentName";

// 4. Factory functions
function buildProps(overrides = {}) { return { ...defaults, ...overrides }; }

// 5. Test suite
describe("ComponentName", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it("does something", () => { ... });
});
```

#### Coverage Thresholds
- Branches: 70%, Functions: 70%, Lines: 70%, Statements: 70%
- Per-file enforcement (`perFile: true` in vitest.config.ts)
- Coverage includes: domain schemas, services, infrastructure core, shared utils

**Adding a new token**: Determine which category it belongs to. If category E, add a comment explaining why the module cannot import directly.
