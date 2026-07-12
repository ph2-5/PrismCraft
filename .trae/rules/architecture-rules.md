# Architecture Rules (Layer 1)

> This file is loaded when the task involves new feature development, refactoring, or architecture changes.
> For core rules and quick reference, see `quick-start.md`.

---

## Dependency Direction (CRITICAL)

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

## Import Rules Table

| Layer | Allowed Imports | Forbidden Imports |
|-------|----------------|-------------------|
| `domain/` | Nothing external | `@/modules/*`, `@/infrastructure/*`, `@/shared-logic/*` |
| `shared-logic/` | Relative imports within shared-logic only | ALL external imports (`@/`, `@shared/`, any project layer) |
| `shared/` | `@/domain/*`, `@/infrastructure/*` (proxy exports only) | `@/modules/*`, `@/shared-logic/*` |
| `modules/` | `@/domain/*`, `@/shared/*`, `@/shared-logic/*`, `@/infrastructure/di` | `@/infrastructure/*` (except DI), `@/modules/*/*/*` |
| `infrastructure/` | `@/domain/*`, `@/shared/*` | `@/modules/*`, `@/shared-logic/*` |
| `app/` | All layers | Deep module paths `@/modules/*/*/*` |
| `electron/src/api/` | `@shared-logic/*`, `@shared/*`, `@domain/*` | `@/modules/*` |

### Key Violation Rules

- `shared-logic/` MUST NOT import from any other layer (zero external dependencies)
- `shared/` MUST NOT import from `@/modules/*`
- `shared/` MAY re-export from `@/infrastructure/*` via proxy exports
- `domain/` MUST NOT import from `@/modules/*` or `@/infrastructure/*`
- `modules/` MUST NOT directly import from `@/infrastructure/*` except `@/infrastructure/di`
- Cross-module imports: use barrel `@/modules/xxx` not deep paths `@/modules/xxx/hooks/yyy`
- Cross-module deep-path imports blocked by ESLint (error in production code, warn in tests)
- Type re-exports from infrastructure allowed via `export type` (compile-time only)
- Main process route handlers import from `@shared-logic/*`

## Shared-Logic Layer Rules

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
- All types must be self-contained (inline definitions)
- No logger dependencies — callers handle logging
- No I/O — pure functions only

**Path aliases**: `@/shared-logic/*` (renderer), `@shared-logic/*` (main process)

## Module Structure

```
module-name/
  index.ts           → Barrel file (public API)
  MODULE.md          → Module contract
  hooks/             → React hooks
  services/          → Business logic services
  presentation/      → React components
  domain/            → Module-specific domain types (if needed)
```

- `index.ts` MUST re-export all public APIs
- Internal implementation details MUST NOT be exported
- Other modules import via `@/modules/xxx` only

## IPC Channel Separation (CRITICAL)

- **Allowed direct IPC in modules**: `saveFileDialog`, `openFileDialog`, `secureConfigResolve` (desktop-only). File operations (`writeFile`, `readFile`, `getFileInfo`, `getCacheDirectory`, `getDiskSpace`, `fileExists`, `deleteFile`) and config read/write (`getConfig`, `setConfig`) MUST go through `@/shared/file-http` unified layer (HTTP `/api/file/*` + `/api/config/*` with IPC fallback).
- **Forbidden IPC in modules**: `dbQuery`, `dbRun`, `dbBatchInsert`, `dbGet`, `dbTransaction`, `saveImage` (enforced by ESLint `no-direct-db-ipc` rule)

### File & Config Unified HTTP Layer

`src/shared/file-http/` provides 7 standard functions (`writeFile`, `readFile`, `getFileInfo`, `getCacheDirectory`, `getDiskSpace`, `fileExists`, `deleteFile`). HTTP API is tried first (`/api/file/*`, `/api/config/*`); on failure, falls back to IPC. Modules MUST import from `@/shared/file-http`, never call `electronAPI.writeFile/getConfig` directly.

## DI Container

### Usage
```typescript
import { container } from "@/infrastructure/di";
const storage = container.videoTaskStorage;
```

### Token Categories

| Category | Description | Examples |
|----------|-------------|---------|
| A. Domain Port 实现 | Port interface implementations | videoProvider, characterStorage |
| B. 有状态服务 | Singletons needing test replacement | eventBus, apiClient |
| C. Storage 实例 | Stateful storage modules | versionStorage, templateStorage |
| D. Repository 实例 | Drizzle ORM repositories | mediaAssetRepository |
| E. 懒加载模块 | Lazy-loaded to avoid circular deps | elementManager, referenceEngine, syncEngine |

### Token Guidelines

Only register: Port implementations, stateful services, test-replaceable dependencies.
Pure functions from `@/infrastructure/*` → export via `@/shared/` proxy modules (e.g., `@/shared/db-core`, `@/shared/api-config`, `@/shared/video-cache`, `@/shared/outfit`, `@/shared/sql-safety`, `@/shared/model-capabilities`).

## defineRoute (Type-Safe API Routes)

```typescript
import { defineRoute } from "../types";
import { generateVideoSchema, type GenerateVideoRequest } from "../schemas";

"generate-video": defineRoute({
  schema: generateVideoSchema,
  handler: async (_method, body, req) => {
    const { prompt, firstFrameUrl, characterRefs } = body;
  },
  methods: ["POST"],
})
```

- Every route with a schema MUST use `defineRoute()`
- Zod schemas in `schemas.ts` MUST export both the schema and the inferred type: `export type XxxRequest = z.infer<typeof xxxSchema>`
- Handler body parameter is automatically typed — no `as` assertions needed

## Video Task CQRS Pattern

Video task management follows CQRS (Command Query Responsibility Segregation):

```typescript
// State — pure Zustand store, no side effects
import { useVideoTaskState } from "@/modules/video/task-management";
// Queries — read-only derived data
import { useVideoTaskQueries } from "@/modules/video/task-management";
// Commands — write operations
import { useVideoTaskCommands } from "@/modules/video/task-management";
// Polling — periodic status checks
import { useVideoTaskPolling } from "@/modules/video/task-management";
// Composition — backward-compatible unified interface
import { useVideoTaskManager } from "@/modules/video/task-management";
```

**stableActions pattern**: `useVideoTaskManager` caches all action methods (addTask, createTask, pollTask, etc.) via `useMemo` with a constant dependency `[store]`. Since these methods come from `store.getState()`, their references never change. This prevents action references from changing when `allTasks` updates, avoiding unnecessary re-renders in consumers like `StoryProvider`.

**setAllTasks does NOT auto-trigger sync/polling**: `setAllTasks` only updates Zustand state. All write operations (addTask, removeTask, cancelTask, recoverTask, etc.) explicitly call `scheduleSync()` + `checkAndStartOrStopPolling()` after updating state. The polling engine triggers sync/polling once after batch updates, using dynamic `import("./sync-engine")` to avoid circular dependencies.

**useStableCompletedUrls**: In `useStoryVideo`, the `completedTaskUrls` Map is built with shallow comparison — only creating a new Map reference when content actually changes. This prevents polling updates (which change the tasks array reference but not the completed URLs) from triggering downstream useEffects like `useStoryPersistence`.

## SyncEngine Class

```typescript
// Via DI container (recommended)
const engine = container.syncEngine;
// Via function API (backward compatible)
import { initSyncEngine, performSync, startAutoSync } from "@/modules/sync/engine/engine";
```

## Cross-Module Communication Mechanisms

Three mechanisms exist for cross-module communication. Each has a specific scope:

| Mechanism | Use For | Example | Rules |
|-----------|---------|---------|-------|
| **DI Container** | Infrastructure dependencies (Port implementations, stateful services) | `container.videoProvider`, `container.syncEngine` | Only for Port impls, stateful services, test-replaceable deps. Never for pure functions (use `@/shared/` proxy) |
| **Zustand Store** | Module-internal state + cross-module data flow via selectors | `useVideoTaskStore(s => s.allTasks)` | Module owns its store. Other modules read via selectors, never call store methods directly |
| **Event Bus** | Fire-and-forget notifications (toast, logging, UI hints) | `eventBus.emit("video:completed", { taskId })` | Never use for data flow or commands. Subscribers must not return values or throw |

**Decision rules**:
- Need a Port implementation? → DI Container
- Need to read another module's state? → Zustand selector (via the module's public API hook)
- Need to notify about an event (no response needed)? → Event Bus
- Need a pure function from infrastructure? → `@/shared/` proxy export
- Need to call another module's command? → Import the module's public API hook (e.g., `useVideoTaskManager`)

## Adding a New Module

1. Create directory under `src/modules/{name}/` with `index.ts`, `MODULE.md`, `hooks/`, `services/`, `presentation/`
2. Define Port interfaces in `domain/` if needed
3. Register DI tokens in `container.ts` (determine category A-E)
4. Add `codeSplitting.groups` entry in `vite.config.ts` with `test` regex and `priority: 15`
5. Create `contract.json` for each sub-domain with `publicAPI` and `invariants`
6. Update `MODULE.md` with module overview, sub-domain table, public API list, boundary constraints
7. Run `node scripts/check-module-api-consistency.mjs` to verify

## Adding a New API Route

1. Define Zod schema in `electron/src/api/schemas.ts` with `export type XxxRequest = z.infer<typeof xxxSchema>`
2. Create route handler using `defineRoute()` in appropriate route group file
3. Add to route group exports
4. Register in `electron/src/api/routes.ts` (import and merge into routes object) — `routes.ts` explicitly imports `coreRoutes`, `dbRoutes`, `fileRoutes`, `generationRoutes`, `pluginRoutes`, `shotRoutes`, `storyboardRoutes`
5. Verify with `npm run typecheck:electron`

## HTTP Routes Registry

`electron/src/api/routes.ts` merges 9 route groups exposing the following HTTP endpoints:

- **core-routes.ts**: `config/get`, `config/set` (plus upload, export, test-connection, sync)
- **db-routes.ts**: `db/query`, `db/run`, `db/transaction`
- **download-routes.ts**: download management (start, cancel, progress, list)
- **ffmpeg-routes.ts**: ffmpeg operations (probe, transcode, extract-frames, merge)
- **file-routes.ts**: `file/save`, `file/read`, `file/read-base64`, `file/delete`, `file/exists`, `file/copy`, `file/list`, `file/info`, `file/write-atomic`, `file/write`, `file/cache-directory`, `file/disk-space`
- **generation-routes.ts**: image/video/text generation, story generation
- **plugin-routes.ts**: plugin management (list, add, delete, reload, etc.)
- **shot-routes.ts**: shot reference, consistency check, visual consistency
- **storyboard-routes.ts**: storyboard generation, video recovery, bulk save

## File Write Limit

`/api/file/write` enforces 100MB max size (`MAX_WRITE_SIZE = 100 * 1024 * 1024` in `file-routes.ts`). Larger writes must be split or use a different transport.

## SSRF Protection

`ssrfGuard.validate` is enforced for non-loopback user-configured hosts. Loopback (`127.0.0.1`, `localhost`, `::1`) is trusted and bypasses SSRF check. See R105.
