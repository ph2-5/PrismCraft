# 五、工程质量

> 核心关注：依赖合规、构建安全、测试可靠

### R3: Cross-Context State Updates Must Verify Ownership
When a useEffect or callback updates state for an entity that may not be the currently active one (e.g., video completion callback updating beats for a different story), the update MUST verify the entity ID matches the current context before applying changes.

**BAD**:
```typescript
useEffect(() => {
  const updates = buildVideoUrlUpdates(beatsRef.current, completedUrls);
  setBeatsRef.current(updates);
}, [completedUrls]);
```

**GOOD**:
```typescript
useEffect(() => {
  const currentStoryId = storyState.currentStoryId;
  const updates = buildVideoUrlUpdates(beatsRef.current, completedUrls)
    .filter(u => u.storyId === currentStoryId);
  setBeatsRef.current(updates);
}, [completedUrls]);
```

### R26: Unnecessary Dynamic Imports Must Be Replaced with Static Imports
When a module is always needed and has no circular dependency risk, it MUST use a top-level static import. Dynamic `await import()` adds unnecessary overhead (code splitting, async boundary) and makes the code harder to follow. Dynamic imports are acceptable ONLY for code splitting large optional features or avoiding proven circular dependencies.

**BAD**:
```typescript
const { storyService } = await import("@/modules/storyboard");
```

**GOOD**:
```typescript
import { storyService } from "@/modules/storyboard";
```

### R27: DDD Layer Violations in App Layer Must Use DI Container
When app-layer code (`src/app/`) needs to access infrastructure storage or services, it MUST use the DI container (`container.xxx`) instead of directly importing from `@/infrastructure/*`. Direct infrastructure imports from the app layer violate the DDD dependency direction rule.

**BAD**:
```typescript
const { container } = await import("@/infrastructure/di");
// or
import { storyboardStorage } from "@/infrastructure/storage";
```

**GOOD**:
```typescript
import { container } from "@/infrastructure/di";
// Then use: container.storyboardStorage
```

### R28: Batch Queries Over N+1 Loop Queries in Storage Layer
When a storage layer's `getAll`-style method needs to fetch related data (relations, outfits, children), it MUST use batch queries (query all related data at once, group by parent ID in memory) instead of querying related data per entity in a loop. N+1 queries cause excessive IPC calls in Electron, leading to rate limit exhaustion and database timeouts.

**BAD**:
```typescript
async getCharacters() {
  const rows = await safeQuery("SELECT * FROM characters");
  const characters = [];
  for (const row of rows) {
    const outfits = await getOutfitsForCharacter(row.id); // N+1 IPC calls
    characters.push({ ...parseCharacter(row), outfits });
  }
  return characters;
}
```

**GOOD**:
```typescript
async getCharacters() {
  const rows = await safeQuery("SELECT * FROM characters");
  const outfitsMap = await getAllOutfits(); // 1 IPC call, group by character_id
  return rows.map((row) => {
    const char = parseCharacter(row);
    char.outfits = outfitsMap.get(char.id) || [];
    return char;
  });
}
```

### R33: Existence-Check Queries Before Write Operations Must Be Eliminated When Possible
When performing a write operation (UPDATE, DELETE) that naturally handles non-existent records (UPDATE affects 0 rows, DELETE affects 0 rows), the code MUST NOT issue a separate existence-check query (SELECT/getById) before the write. The pre-check query adds unnecessary IPC calls that contribute to rate limit exhaustion. Instead, rely on the write operation's natural behavior or its return value (rows affected) to determine if the record existed.

**BAD**:
```typescript
for (const beat of beats) {
  const existing = await storage.getStoryByBeatId(beat.id);
  if (!existing) continue;
  await safeTransaction([{ sql: "UPDATE story_beats SET ... WHERE id = ?", params: [beat.id] }]);
}
```

**GOOD**:
```typescript
const statements = beats.map(beat => ({
  sql: "UPDATE story_beats SET ... WHERE id = ?",
  params: [beat.id],
}));
await safeTransaction(statements);
```

### R39: 批量 DB 写入/删除/更新操作必须使用 safeTransaction 或批量方法，禁止逐条 IPC
When performing batch write operations (INSERT, UPDATE, DELETE) on multiple records, the code MUST use `safeTransaction` with multiple statements, `batchUpdateVideoTasks`, `batchDeleteVideoTasks`, or `SELECT WHERE IN` for existence checks. Looping over items and calling `safeRun`/`safeQuery`/`safeTransaction` per item causes N×M IPC calls that exhaust rate limits. This extends R28 (N+1 reads) and R33 (existence checks) to cover batch writes and deletes.

**BAD**:
```typescript
for (const task of timedOutTasks) {
  await container.videoTaskStorage.updateVideoTask(task.taskId, { status: "failed" });
}
```

**GOOD**:
```typescript
await container.videoTaskStorage.batchUpdateVideoTasks(
  timedOutTasks.map(task => ({ taskId: task.taskId, updates: { status: "failed" } }))
);
```

**BAD**:
```typescript
for (const id of taskIds) {
  await container.videoTaskStorage.deleteVideoTask(id);
}
```

**GOOD**:
```typescript
await container.videoTaskStorage.batchDeleteVideoTasks(taskIds);
```

**BAD**:
```typescript
for (const task of tasks) {
  const existing = await safeQuery("SELECT id FROM video_tasks WHERE id = ?", [task.taskId]);
  // ... per-item logic
}
```

**GOOD**:
```typescript
const placeholders = taskIds.map(() => "?").join(",");
const existingRows = await safeQuery(`SELECT id FROM video_tasks WHERE id IN (${placeholders})`, taskIds);
const existingIdSet = new Set(existingRows.map(r => r.id));
```

### R40: 非关键元数据更新必须延迟批量，禁止读后立即写
When a read operation (e.g., `getCachedImageFile`) triggers a non-critical metadata update (e.g., `last_accessed_at`), the update MUST be deferred and batched rather than executed immediately after the read. Immediate writes double the IPC call count for every read operation, contributing to rate limit exhaustion. Use a debounce/batch timer pattern with a `flush()` method for cleanup on app shutdown.

**BAD**:
```typescript
async getCachedImageFile(sourceUrl: string) {
  const result = await safeQuery("SELECT * FROM image_cache WHERE source_url = ?", [sourceUrl]);
  if (result.length === 0) return null;
  await safeRun("UPDATE image_cache SET last_accessed_at = ? WHERE source_url = ?", [Date.now(), sourceUrl]);
  return result[0];
}
```

**GOOD**:
```typescript
async getCachedImageFile(sourceUrl: string) {
  const result = await safeQuery("SELECT * FROM image_cache WHERE source_url = ?", [sourceUrl]);
  if (result.length === 0) return null;
  scheduleAccessUpdate(sourceUrl); // Debounced batch update
  return result[0];
}

// On app shutdown:
await imageCacheStorage.flushPendingAccessUpdates();
```

### R41: trackChange 循环必须并行执行（Promise.allSettled），禁止串行等待
When calling `trackChange` for multiple entities in a loop (e.g., after batch delete, bulk put), the calls MUST be executed in parallel using `Promise.allSettled` instead of sequential `for...of` with `await`. Each `trackChange` call triggers 2 `safeTransaction` IPC calls (read + write), so serializing N calls takes N×2 time units vs. 2 time units in parallel. Partial failures MUST be handled individually with `.catch()`.

**BAD**:
```typescript
for (const id of deletedIds) {
  try {
    await trackChange("video_task", id, "delete");
  } catch (e) { errorLogger.warn("trackChange failed", e); }
}
```

**GOOD**:
```typescript
await Promise.allSettled(
  deletedIds.map(id =>
    trackChange("video_task", id, "delete").catch(e => {
      errorLogger.warn("trackChange failed", e);
    })
  )
);
```

### R54: Production Code MUST NOT Use `any` Type
Production code (non-test files) MUST NOT use `any` type. Use specific interfaces, `unknown`, or generic type parameters instead. `any` disables TypeScript's type checking and can hide bugs that would otherwise be caught at compile time.

**BAD**:
```typescript
let sharpModule: any = null;
const parsed = safeJsonParse(jsonMatch[0], {}) as Record<string, any>;
function fixShotParams(data: Record<string, any>): { fixed: Record<string, any>; autoFixed: string[] }
```

**GOOD**:
```typescript
let sharpModule: typeof import("sharp") | null = null;
interface ConsistencyAnalysisResult { scores: ConsistencyAnalysisScore[]; overallScore: number; recommendation: string; }
const parsed = safeJsonParse<ConsistencyAnalysisResult>(jsonMatch[0], defaultValue);
interface ShotParamsData { shotType?: string; cameraMovement?: string; [key: string]: unknown; }
function fixShotParams(data: ShotParamsData): { fixed: ShotParamsData; autoFixed: string[] }
```

**Discovered in**: `consistency-check-service.ts`, `story-service.ts`, `assets.ts`, `registry.ts` — all used `any` or `Record<string, any>` where specific types were appropriate.

### R55: Test Files MUST Pass TypeScript Type Checking
Test files MUST be included in TypeScript type checking (via `tsconfig.test.json`) and MUST NOT have type errors. Common patterns that cause test type errors:

1. **`vi.fn()` without generic params** — TypeScript infers `never[]` return type for empty arrays, causing `mockResolvedValueOnce` to reject non-never values. Fix: `vi.fn<(arg: Type) => Promise<ResultType>>()`
2. **`as any` type assertions** — Use `as unknown as TargetType` instead
3. **Missing non-null assertions** — After `expect()` assertions that verify a value exists, use `!` operator: `calls[0]![0]`
4. **`Error` vs `AppError`** — Functions returning `Result<T, AppError>` must receive `AppError` instances, not plain `Error`

**BAD**:
```typescript
const mockCreate = vi.fn(() => Promise.resolve({ ok: true, value: entity }));
mockCreate.mockResolvedValueOnce({ ok: true, value: { id: "1", name: "test" } });
```

**GOOD**:
```typescript
const mockCreate = vi.fn<(entity: TestEntity) => Promise<Result<TestEntity, AppError>>>(() =>
  Promise.resolve(ok(entity))
);
```

**Discovered in**: 13 test files had 80 type errors total, all caused by missing generic params on `vi.fn()` and `as any` assertions.

### R57: No Next.js Imports After Vite Migration
After migrating from Next.js to Vite + React Router, all `next/*` imports are forbidden. Use the corresponding React Router or native alternatives.

| Next.js API | React Router / Native Alternative |
|-------------|-----------------------------------|
| `next/link` → `<Link>` with `href` | `react-router-dom` → `<Link>` with `to` |
| `next/navigation` → `useRouter()` | `react-router-dom` → `useNavigate()` |
| `next/navigation` → `usePathname()` | `react-router-dom` → `useLocation().pathname` |
| `next/navigation` → `useSearchParams()` | `react-router-dom` → `useSearchParams()` returns `[params, setParams]` tuple |
| `next/image` → `<Image>` | Native `<img>` or `SafeImage` component |
| `"use client"` directive | Not needed (Vite SPA, all components are client) |
| `generateStaticParams` export | Not applicable (SPA, no SSG) |
| `metadata` / `generateMetadata` export | Not applicable (SPA, no SSR metadata) |

**BAD**:
```typescript
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
```

**GOOD**:
```typescript
import { Link, useNavigate, useLocation } from "react-router-dom";
```

**Discovered in**: Next.js → Vite migration. Next.js had ~15% feature utilization in Electron desktop app (only file routing + Link + Navigation hooks used).

### R58: React Router useSearchParams Returns Tuple
React Router's `useSearchParams()` returns `[URLSearchParams, SetURLSearchParams]` tuple, unlike Next.js which returns `URLSearchParams` directly. Always destructure the first element.

**BAD**:
```typescript
const searchParams = useSearchParams();
searchParams.get("tab");
```

**GOOD**:
```typescript
const [searchParams] = useSearchParams();
searchParams.get("tab");
```

**Discovered in**: Next.js → Vite migration. Next.js `useSearchParams()` returns `URLSearchParams` directly; React Router returns a tuple.

### R59: No Ineffective Dynamic Imports
When a module is both statically and dynamically imported within the same bundle, the dynamic import is ineffective — it will not produce code splitting. Either use static import only, or ensure the dynamic import is the sole reference for code splitting purposes.

**BAD** — module statically imported elsewhere, dynamic import is wasted:
```typescript
import { saveConfig } from "./storage";
const { saveConfig } = await import("./storage");
```

**GOOD** — choose one strategy:
```typescript
import { saveConfig } from "./storage";
await saveConfig(migrated);
```

**Discovered in**: Vite build produced INEFFECTIVE_DYNAMIC_IMPORT warnings for 4 modules that were both statically and dynamically imported.

### R60: New Modules Must Register codeSplitting Group
When adding a new module under `src/modules/` that is expected to be >50KB, add a corresponding `codeSplitting.groups` entry in `vite.config.ts` (`build.rolldownOptions.output.codeSplitting.groups`). This ensures the bundle stays properly split and no single chunk grows too large. Use rolldown's `codeSplitting` API (not `manualChunks` which is ignored by rolldown's chunk merging).

**BAD** — new module not in codeSplitting groups, gets merged into another chunk:
```typescript
codeSplitting: {
  groups: [
    { name: "app-story", test: /src[\\/]modules[\\/]story/, priority: 15 },
    { name: "app-video", test: /src[\\/]modules[\\/]video/, priority: 15 },
  ],
}
```

**GOOD** — new module gets its own chunk group:
```typescript
codeSplitting: {
  groups: [
    { name: "app-story", test: /src[\\/]modules[\\/]story/, priority: 15 },
    { name: "app-video", test: /src[\\/]modules[\\/]video/, priority: 15 },
    { name: "app-newmodule", test: /src[\\/]modules[\\/]newmodule/, priority: 15 },
  ],
}
```

**Priority guide**: 30 for core vendor (react), 25 for secondary vendor, 20 for infrastructure, 18 for shared/domain, 15 for app modules, 10 for generic vendor, 5 for common.

**Discovered in**: Vite migration — initial build produced a single 1.6MB chunk; `manualChunks` was ineffective (rolldown merged vendor-react into app-character creating 784KB chunk); `codeSplitting` API with priority-based groups resolved the issue.

### R87: Model IDs MUST Match Official API Documentation

Model IDs in `BUILTIN_MODEL_CAPABILITIES` and `PROVIDER_TEMPLATES` MUST exactly match the provider's official API documentation. Date suffixes (e.g., `-250528`) are version identifiers from the provider, not arbitrary values. Guessing or copying date suffixes from other models causes API calls to fail with "model not found" errors.

**BAD** — Guessed date suffix:
```typescript
"doubao-seedance-1-0-pro-fast-250528"  // Copied from pro model's date suffix
```

**GOOD** — Verified from official docs:
```typescript
"doubao-seedance-1-0-pro-fast-251015"  // From Volcengine API documentation
```

**Verification**: For each model ID with a date suffix, cross-reference with the provider's official API documentation. Date suffixes must not be copied between models without verification.

**Discovered in**: `doubao-seedance-1-0-pro-fast` had date suffix `250528` (copied from `doubao-seedance-1-0-pro-250528`), but the official API documentation specifies `251015` as the correct version.

### R88: New ModelCapabilities Fields MUST Have Conservative Defaults in getDefaultCapabilities

When the `ModelCapabilities` interface adds new optional fields, `getDefaultCapabilities()` MUST provide a reasonable default value for each new field. Default values MUST be conservative (false/0/empty), never permissive (true/unlimited). Unknown models should degrade safely — assuming they DON'T support a feature is always safer than assuming they DO.

**BAD** — New field without default, unknown model implicitly supports feature:
```typescript
interface ModelCapabilities {
  supportsCharacterRef?: boolean;  // undefined → truthy checks pass
  supportsSceneRef?: boolean;      // undefined → truthy checks pass
}

function getDefaultCapabilities(): ModelCapabilities {
  return { maxReferences: 4, ... };  // Missing supportsCharacterRef/supportsSceneRef
}
```

**GOOD** — Conservative defaults:
```typescript
function getDefaultCapabilities(): ModelCapabilities {
  return {
    maxReferences: 4,
    supportsCharacterRef: false,  // Unknown models don't support reference images
    supportsSceneRef: false,
  };
}
```

**Verification**: When adding a new optional field to `ModelCapabilities`, verify `getDefaultCapabilities()` includes it with a conservative default value. The default should be the safest assumption for unknown models.

**Discovered in**: `supportsCharacterRef`/`supportsSceneRef` were added to `ModelCapabilities` but `getDefaultCapabilities()` didn't include them. Unknown models had `undefined` for these fields, and `getVideoGenerationStrategy` treated `undefined` as `true`, sending reference images to models that don't support them.

### R92: Deprecated Provider Templates MUST Be Filtered from User-Visible Lists

When a provider template is marked as `deprecated` (e.g., API not publicly available, service discontinued), `getAllTemplates()` MUST filter it out so users cannot select it. Deprecated templates should use the `deprecated` + `deprecatedReason` fields rather than being deleted, preserving configuration for potential future re-enablement.

**BAD** — Unavailable provider still shown to users:
```typescript
const PROVIDER_TEMPLATES = [
  { id: "sora", name: "Sora", ... },  // API not available, but users can select it
];
```

**GOOD** — Deprecated and filtered:
```typescript
const PROVIDER_TEMPLATES = [
  { id: "sora", name: "Sora", deprecated: true, deprecatedReason: "API not publicly available", ... },
];

function getAllTemplates(pluginTemplates?: PluginProviderTemplate[]) {
  const all = [...PROVIDER_TEMPLATES, ...(pluginTemplates ?? [])];
  return all.filter(t => !t.deprecated);
}
```

**Verification**: Search for provider templates that reference unavailable APIs. Verify they have `deprecated: true` and that `getAllTemplates()` filters them. Users should never see a template they can't actually use.

**Discovered in**: Sora was listed in provider templates but its API is not publicly available. Users could select it, configure it, but all API calls would fail.

### R107: Upload File Size MUST Be Limited to 50MB

When uploading files via `uploadFile` (in `src/infrastructure/ai-providers/utils.ts`), the file size MUST be checked against `MAX_UPLOAD_FILE_BYTES` (50MB) before initiating the network upload. Files exceeding the limit MUST be rejected with an error message containing both the actual size and the limit size, and MUST NOT trigger any network upload call. This prevents memory exhaustion and network timeout issues from oversized uploads.

**BAD** — No size check before upload:
```typescript
async function uploadFile(file: File) {
  const base64 = await fileToBase64(file);
  return await apiCallWithRetry(() => uploadToProvider(base64));
}
```

**GOOD** — Size check with descriptive error:
```typescript
const MAX_UPLOAD_FILE_BYTES = 50 * 1024 * 1024;

async function uploadFile(file: File) {
  if (file.size > MAX_UPLOAD_FILE_BYTES) {
    return err(new Error(
      `文件大小 ${formatBytes(file.size)} 超过限制 ${formatBytes(MAX_UPLOAD_FILE_BYTES)}`
    ));
  }
  const base64 = await fileToBase64(file);
  return ok(await apiCallWithRetry(() => uploadToProvider(base64)));
}
```

**Verification**: Call `uploadFile` with a File object whose `size` exceeds 50MB (use `Object.defineProperty` to override `size` without allocating real memory). Verify: (1) the function returns an error without calling `apiCallWithRetry`, (2) the error message contains both sizes.

**Discovered in**: Security audit identified that file uploads had no size limit, allowing users to upload arbitrarily large files that could exhaust memory or hang the network layer. Test: `src/infrastructure/ai-providers/__tests__/r107-upload-file-size-limit.test.ts`.

### R135: secureConfigRouteSchema 必须使用 operation 字段（与 handler 一致）

`secureConfigRouteSchema` in `electron/src/api/schemas.ts` MUST use the `operation` field (matching the handler), NOT the `action` field. If the schema uses `action` but the handler reads `operation`, all secure-config requests will fail validation (missing `operation`), or worse, schema validation passes but the handler reads `undefined`, causing config operations to be silently skipped.

**BAD** — Schema 使用 action，handler 读取 operation：
```typescript
// schemas.ts
export const secureConfigRouteSchema = z.object({
  action: z.enum(["save", "load", "clear"]), // ❌ 字段名不匹配
});

// handler
const { operation } = body; // ❌ 读取到 undefined
```

**GOOD** — Schema 与 handler 一致使用 operation：
```typescript
// schemas.ts
export const secureConfigRouteSchema = z.object({
  operation: z.enum(["save", "load", "clear"]), // ✅ 与 handler 一致
});

// handler
const { operation } = body; // ✅ 正确读取
```

**Verification**: 调用 `secureConfigRouteSchema.safeParse({ operation: "save" })`，验证返回 `success: true`。调用 `secureConfigRouteSchema.safeParse({ action: "save" })`，验证返回 `success: false`（缺少 `operation` 字段）。

**Discovered in**: API schema 一致性审计发现 `secureConfigRouteSchema` 使用 `action` 字段而 handler 读取 `operation`，导致配置操作被跳过。Test: `electron/src/api/__tests__/regression-r135-secure-config-schema.test.ts`。

### R146: domain Layer MUST Have Zero External Dependencies

All `.ts` files under `src/domain/` MUST NOT import from any other project layer (`@/shared/*`, `@/infrastructure/*`, `@/modules/*`, `@/shared-logic/*`). The domain layer defines pure types only; importing from other layers creates circular dependencies and violates the layered architecture (domain is the innermost layer with zero external dependencies). Type-only re-exports of domain-internal types are allowed.

**BAD** — domain imports from shared:
```typescript
// src/domain/something.ts
// ❌ domain importing shared → circular dep, layering violation
import { t } from "@/shared/constants";
import type { Config } from "@/infrastructure/config";
```

**GOOD** — domain is pure (no external imports):
```typescript
// src/domain/something.ts
// ✅ zero external imports — only relative domain-internal imports
import type { Story } from "./story";
export interface Something { /* ... */ }
```

**Verification**: Recursively scan `src/domain/` for all `.ts` files (excluding `__tests__` and `.test.ts`). Extract all import/export-from paths from each file. Assert none start with `@/shared/`, `@/infrastructure/`, `@/modules/`, or `@/shared-logic/`.

**Discovered in**: Architecture purity audit found domain files importing from `@/shared/*`, breaking the dependency direction. Test: `src/domain/__tests__/regression-r146-domain-purity.test.ts`.

### R147: Cross-Module Store Access MUST Go Through Public API

Cross-module access to the video task store MUST go through the module's public API barrel (`@/modules/video/task-management`) — e.g. `useVideoTaskManager`, `useVideoTaskQueries`, `useVideoTaskState` — NOT by directly importing the internal `useVideoTaskStore` from deep paths. Direct internal imports bypass module encapsulation, break callers when the module is refactored internally, violate the dependency direction, and make cross-module data flow hard to trace. The ESLint rule blocks deep-path cross-module imports; this guard enforces the same for store access specifically.

**BAD** — Direct import of internal store:
```typescript
// src/modules/persistence/services/transactional-delete.ts
// ❌ deep-path internal store import — bypasses module encapsulation
import { useVideoTaskStore } from "@/modules/video/task-management/hooks/internals/use-video-task-store";
```

**GOOD** — Public API access:
```typescript
// src/modules/persistence/services/transactional-delete.ts
// ✅ import via public barrel — stable, encapsulated
import { useVideoTaskManager } from "@/modules/video/task-management";
```

**Verification**: Scan known cross-module consumers (`transactional-delete.ts`, `useStorySaver.ts`) for `import ... useVideoTaskStore ... from` with a path that is NOT `@/modules/video/task-management`. Assert no direct deep-path imports of `useVideoTaskStore`. Assert each consumer imports from `@/modules/video/task-management`.

**Discovered in**: Cross-module coupling audit found `transactional-delete.ts` and `useStorySaver.ts` directly importing the internal store. Test: `src/modules/__tests__/regression-r147-cross-module-store-access.test.ts`.

### R154: useAssetLoader MUST Load Characters/Scenes/StoryboardAssets via Promise.all

`useAssetLoader` in `src/modules/storyboard/beat-editor/hooks/useAssetLoader.ts` MUST load the three asset sources (`getAllCharacters`, `getAllScenes`, `getStoryboardAssets`) concurrently via `Promise.all([services.A(), services.B(), services.C()])`. Sequential `await` chains are FORBIDDEN — they make first-screen latency equal to `T(chars) + T(scenes) + T(storyboard)` instead of `max(...)`, degrading performance by 50–60%.

**BAD** — Sequential awaits (perf regression):
```typescript
useEffect(() => {
  const load = async () => {
    const chars = await services.getAllCharacters(); // ❌ waits full duration
    const scns = await services.getAllScenes();        // ❌ starts only after chars
    const sbAssets = await services.getStoryboardAssets(); // ❌ starts only after scenes
    // ...
  };
  load();
}, [services]);
```

**GOOD** — Concurrent via Promise.all:
```typescript
useEffect(() => {
  const load = async () => {
    const [charsResult, scnsResult, sbAssets] = await Promise.all([ // ✅ all start together
      services.getAllCharacters(),
      services.getAllScenes(),
      services.getStoryboardAssets(),
    ]);
    // ...
  };
  load();
}, [services]);
```

**Verification**: Mock three services with deferred promises that never resolve. Call `useAssetLoader` once and verify all three service spies were called synchronously (proves Promise.all concurrent dispatch, not serial await). Also: with delays 200ms/150ms/100ms, total elapsed must be `< SERIAL_SUM * 0.7` (well below 450ms, near max 200ms).

**Discovered in**: Batch 2 performance optimization audit found sequential `await` chain causing 50–60% first-screen latency regression in the story editor. Test: `src/modules/storyboard/beat-editor/hooks/__tests__/regression-r154-asset-loader-parallel.test.ts`.

### R155: StoryProvider MUST Memoize the services Object Passed to useAssetLoader

`StoryProvider` in `src/modules/storyboard/StoryProvider.tsx` MUST wrap the `services` object passed to `useAssetLoader` in `useMemo(..., [])`. The services object literal MUST NOT be inlined at the `useAssetLoader(services)` call site, because `useAssetLoader` has an internal `useEffect` with `[services]` dependency — every re-render would create a new object reference, re-triggering the effect and re-fetching characters/scenes/storyboard from the database.

**BAD** — Inline services object (effect re-fires every render):
```typescript
const assetLoader = useAssetLoader({ // ❌ new object every render
  getAllCharacters: () => characterService.getAll(),
  getAllScenes: () => sceneService.getAll(),
  getStoryboardAssets: async () => container.storyboardStorage.getStoryboardAssets(),
});
```

**GOOD** — Memoized services object (stable reference):
```typescript
const assetLoaderServices = useMemo( // ✅ stable reference across renders
  () => ({
    getAllCharacters: () => characterService.getAll(),
    getAllScenes: () => sceneService.getAll(),
    getStoryboardAssets: async () => container.storyboardStorage.getStoryboardAssets(),
  }),
  [],
);
const assetLoader = useAssetLoader(assetLoaderServices);
```

**Verification**: Mock `useAssetLoader` to capture the `services` argument on each call. Render `<StoryProvider>` once, then `rerender` it 3 times with different children. Verify `useAssetLoader` was called 4 times AND every captured `services` reference is `===` to the first one (i.e., same object identity across all renders).

**Discovered in**: Batch 2 performance optimization audit found inline services object causing `useAssetLoader` effect to re-fire on every state change (beat edits, saveStatus toggle), triggering redundant database queries and UI flicker. Test: `src/modules/storyboard/__tests__/regression-r155-story-provider-services-memo.test.tsx`.

### R156: useVideoTasksPage Statistics MUST Be Memoized (Single Pass) with Full Non-Terminal Status Classification

`useVideoTasksPage` in `src/app/video-tasks/hooks/useVideoTasksPage.ts` MUST compute the five statistics (`totalTasks`, `completedTasks`, `processingTasks`, `pendingTasks`, `failedTasks`) via a single `useMemo`-wrapped pass with a `switch` over `task.status`. Five separate `tasks.filter(...)` calls are FORBIDDEN (5× O(n) allocations per render). Additionally, the following non-terminal status classifications MUST be applied:

- `timeout` → `failedTasks` (not omitted, not a separate category)
- `retrying` → `processingTasks` (retrying is still in-flight, consistent with `POLLABLE_STATUSES`)
- `cancelled` → `failedTasks` (cancelled is an unrecoverable terminal state, same bucket as failed/timeout)

**BAD** — Five filters + missing timeout/retrying/cancelled:
```typescript
const completedTasks = tasks.filter(t => t.status === "completed").length;   // ❌ 5 passes
const processingTasks = tasks.filter(t => t.status === "generating").length; // ❌ 5 passes, drops retrying!
const pendingTasks = tasks.filter(t => t.status === "pending").length;      // ❌ 5 passes
const failedTasks = tasks.filter(t => t.status === "failed").length;         // ❌ drops timeout + cancelled!
// totalTasks also recomputed separately
```

**GOOD** — Single useMemo pass, full non-terminal classification:
```typescript
const { totalTasks, completedTasks, processingTasks, pendingTasks, failedTasks } = useMemo(() => {
  let completed = 0, processing = 0, pending = 0, failed = 0;
  for (const task of tasks) {
    switch (task.status) {
      case "completed": completed++; break;
      case "generating":
      case "retrying":  // ✅ retrying folded into processing (still in-flight)
        processing++; break;
      case "pending": pending++; break;
      case "failed":
      case "timeout":   // ✅ timeout folded into failed
      case "cancelled": // ✅ cancelled folded into failed (unrecoverable terminal)
        failed++; break;
    }
  }
  return { totalTasks: tasks.length, completedTasks: completed, processingTasks: processing, pendingTasks: pending, failedTasks: failed };
}, [tasks]);
```

**Extension — statusFilter consistency (2026-07-08)**: The `statusFilter='failed'` filter MUST also include `timeout` AND `cancelled` tasks, mirroring the statistics classification. Inconsistency between statistics classification and filter logic causes the failed count to disagree with the filtered task list (count says 5 failed, filter shows 3). The same classification mapping MUST be applied in both places.

**Verification**: Pass mixed-status tasks (pending/generating/retrying/completed/failed/timeout/cancelled) and verify:
1. `failedTasks` includes failed + timeout + cancelled tasks
2. `processingTasks` includes generating + retrying tasks
3. Sum of categories equals `totalTasks`
4. `statusFilter='failed'` returns failed + timeout + cancelled tasks (consistent with `failedTasks` count)
5. `statusFilter='processing'` returns generating + retrying tasks (consistent with `processingTasks` count)
6. Change tasks and `rerender` — verify stats recompute (memoize invalidates correctly)

**Discovered in**: Batch 2 performance optimization audit found 5 sequential `filter` calls creating 5 intermediate arrays per render; also found `timeout` tasks were not folded into `failedTasks`, causing the failed count to disagree with the filtered task list. 2026-07-08 extension: `retrying` and `cancelled` statuses added to video task model but statistics/filter logic not updated, causing same kind of count/list disagreement. Test: `src/app/video-tasks/hooks/__tests__/regression-r156-tasks-stats-memo.test.ts`.

### R159: validateApiKey MUST Return errorKey (i18n key), NOT Hardcoded Chinese Strings

`validateApiKey` in `src/infrastructure/ai-providers/api-config/detect.ts` MUST return `{ valid: boolean; errorKey?: string }`. The `errorKey` MUST be a dotted i18n key (e.g. `"provider.apiKey.empty"`, `"provider.apiKey.tooShort"`, `"provider.apiKey.tooLong"`, `"provider.apiKey.placeholderDetected"`, `"provider.apiKey.invalidChars"`), NOT a localized Chinese string. Callers translate via `t(result.errorKey)`. This keeps `detect.ts` a pure function with no dependency on the renderer i18n module, and allows the same key to render in any locale.

**BAD** — Returns localized Chinese, breaks i18n:
```typescript
export function validateApiKey(apiKey: string): { valid: boolean; error?: string } {
  if (!apiKey) return { valid: false, error: "API Key 不能为空" }; // ❌ hardcoded Chinese
  if (apiKey.length < 10) return { valid: false, error: "API Key 长度不足" };
}
// caller:
if (!result.valid) showToast(result.error); // ❌ always Chinese, no translation
```

**GOOD** — Returns i18n key, caller translates:
```typescript
export function validateApiKey(apiKey: string): { valid: boolean; errorKey?: string } {
  if (!apiKey) return { valid: false, errorKey: "provider.apiKey.empty" };
  if (apiKey.length < 10) return { valid: false, errorKey: "provider.apiKey.tooShort" };
  if (apiKey.length > 512) return { valid: false, errorKey: "provider.apiKey.tooLong" };
  if (apiKey.includes("your_") || apiKey.includes("placeholder"))
    return { valid: false, errorKey: "provider.apiKey.placeholderDetected" };
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(apiKey))
    return { valid: false, errorKey: "provider.apiKey.invalidChars" };
  return { valid: true };
}
// caller:
if (!result.valid && result.errorKey) showToast(t(result.errorKey)); // ✅ translated per locale
```

**Verification**: Call `validateApiKey` with empty, short (<10), long (>512), placeholder, control-char, and valid inputs. Assert each invalid result has `errorKey` matching `^provider\.apiKey\.` and NOT containing any CJK characters. Assert `valid: true` results have `errorKey === undefined`. Grep `detect.ts` to confirm no Chinese characters inside the `validateApiKey` body.

**Discovered in**: Batch 3 P0-5 i18n refactor of API key validation. Test: `src/__tests__/lib/api-config/regression-r159-validate-api-key-errorkey.test.ts`.

### R162: Config-Layer Display Strings MUST Use labelKey, But Prompt-Building value MUST Stay as the Chinese String

Option lists in `src/modules/character/constants.ts` (and similar config files) that back UI `<select>`/option lists MUST expose both a `value` (the actual semantic value, used when building AI prompts) and a `labelKey` (dotted i18n key, used for display). The `value` MUST be the original Chinese string (e.g. `"日式动漫"`) because prompts are sent to the AI in that exact form — translating the value would change prompt semantics. The `labelKey` MUST be a `styleOption.*` (or analogous) i18n key so the UI can render in the user's locale. UI components MUST display `t(option.labelKey)`, NEVER `option.value`. Prompt builders MUST use `option.value`, NEVER `t(option.labelKey)`.

**BAD** — Single field, either i18n breaks prompts or prompts break i18n:
```typescript
export const styleSuggestions = ["日式动漫", "写实风格", ...]; // ❌ no labelKey → UI shows Chinese always
// OR:
export const styleSuggestions = [
  { value: "japanese-anime", label: "日式动漫" }, // ❌ value is not what the prompt needs; prompt gets English id
];
```

**GOOD** — value is the prompt string, labelKey is the display string:
```typescript
export interface StyleOption { value: string; labelKey: string; }
export const styleSuggestions: readonly StyleOption[] = [
  { value: "日式动漫", labelKey: "styleOption.japanese-anime" }, // ✅ value feeds prompt, labelKey feeds UI
  { value: "写实风格", labelKey: "styleOption.realistic" },
  // ...
];
// UI:
{styleSuggestions.map(o => <option key={o.value} value={o.value}>{t(o.labelKey)}</option>)}
// Prompt builder:
const style = styleSuggestions.find(o => o.value === selectedValue)!;
prompt += `风格：${style.value}`; // ✅ Chinese value sent to AI
```

**Verification**: Import `styleSuggestions` and assert every entry is `{ value: string, labelKey: string }` and `labelKey` starts with `"styleOption."`. Assert every `value` is a non-empty CJK string (the prompt-facing value MUST stay Chinese). Grep `constants.ts` to confirm no `label:` field (only `labelKey:`). Grep the UI consumers (e.g. character presentation) to confirm they call `t(option.labelKey)` for display and `option.value` for prompt building.

**Discovered in**: Batch 3 P2-13 style option i18n refactor. Test: `src/modules/character/__tests__/regression-r162-style-options-labelkey.test.ts`.

### R165: Coming-Soon Page Titles MUST Use t() (i18n), Not Hardcoded Strings

Coming-soon pages (`src/app/coming-soon/*.tsx`) that render `<ComingSoon title={...} />` MUST pass `t("sidebar.<page>")` as the title, NOT a hardcoded Chinese/English string. The `descriptionKey` MUST also be an i18n key. This keeps the sidebar label and the page title in sync (both come from the same `sidebar.*` key) and supports locale switching. Currently `LoginPage`, `AgentPage`, `ComposerPage`, `MobilePage`, `WorkspacePage`, `WorkflowPage`, `TemplateMarketPage`, `StoryPage` follow this pattern.

**BAD** — Hardcoded title, breaks locale switch:
```tsx
export default function LoginPage() {
  return <ComingSoon icon="🔑" title="登录" descriptionKey="comingSoon.agentDesc" />; // ❌ hardcoded Chinese
}
```

**GOOD** — Title from i18n:
```tsx
import { t } from "@/shared/constants/messages";
export default function LoginPage() {
  return <ComingSoon icon="🔑" title={t("sidebar.login")} descriptionKey="comingSoon.agentDesc" />; // ✅
}
```

**Verification**: For each coming-soon page file, assert the `title` prop passed to `<ComingSoon>` is a call expression `t("sidebar.<something>")` (AST or regex), NOT a string literal. Optionally render each page with a `t` mock returning the key and assert the title text matches the expected `sidebar.*` key.

**Discovered in**: Batch 3 P1-9 coming-soon page i18n. Test: `src/app/coming-soon/__tests__/regression-r165-coming-soon-i18n.test.tsx`.

### R166: Date Formatting MUST Use toLocaleString()/toLocaleTimeString() Without Hardcoded "zh-CN" Locale

When formatting `Date` instances for user-facing display (e.g. crash recovery timestamps, task created-at), code MUST call `date.toLocaleString()` or `date.toLocaleTimeString()` WITHOUT a hardcoded `"zh-CN"` locale argument. Passing the user's default locale (no argument, or `undefined`) lets the OS/browser locale win — a Chinese-locale user sees `2026/6/25 14:30:00`, an English-locale user sees `6/25/2026, 2:30:00 PM`. Hardcoding `"zh-CN"` forces Chinese formatting on all users, defeating i18n. (Explicit locale args are allowed ONLY for non-user-facing logs.)

**BAD** — Hardcoded zh-CN locale, English users see Chinese dates:
```tsx
const saveTime = new Date(timestamp).toLocaleString("zh-CN"); // ❌ forced Chinese format
const timeStr = new Date(timestamp).toLocaleTimeString("zh-CN");
```

**GOOD** — Default locale, OS decides:
```tsx
const saveTime = new Date(timestamp).toLocaleString(); // ✅ user's locale
const timeStr = new Date(timestamp).toLocaleTimeString();
```

**Verification**: Grep `src/**/*.tsx` for `toLocaleString("zh-CN")` and `toLocaleTimeString("zh-CN")` (and `toLocaleString('zh-CN')`) — assert zero matches in user-facing components. Specifically assert `src/shared/presentation/CrashRecoveryDialog.tsx` calls `.toLocaleString()` and `.toLocaleTimeString()` with no arguments.

**Discovered in**: Batch 3 P1-10 CrashRecoveryDialog date localization. Test: `src/shared/presentation/__tests__/regression-r166-date-locale.test.tsx`.

### R175: throw Error 必须用 t() 国际化

用户可见的 `throw new Error(...)` 消息必须用 `t()` 国际化（渲染进程）或 `@shared/i18n`（主进程），不能硬编码中文字符串。开发者内部错误（如 "useStory must be used within a StoryProvider"）和错误码常量（如 "PREVIEW_REQUIRED_BEFORE_KEYFRAME"）不受此规则约束，因为它们不展示给最终用户。

**BAD** — 用户可见错误硬编码中文：
```tsx
if (!apiKey) throw new Error("API Key 不能为空");
```

**GOOD** — 用 t() 国际化：
```tsx
if (!apiKey) throw new Error(t("error.apiKeyRequired"));
```

**GOOD** — 错误码常量（非用户可见，不受约束）：
```tsx
throw new Error("PREVIEW_REQUIRED_BEFORE_KEYFRAME");
```

**Verification**: Grep `src/**/*.ts(x)` for `throw new Error("`，确认用户可见错误消息用 `t()` 而非硬编码中文。

**Discovered in**: 深度审计 i18n 修复。Test: `src/__tests__/lib/regression-r175-throw-error-i18n.test.ts`。

### R176: 数据常量层双用途字段（value + labelKey）

数据常量（如风格选项、类型选项）需同时支持 prompt 构造（中文 value）和 UI 显示（i18n labelKey）时，必须使用 `{ value, labelKey }` 结构而非 `{ value, label }`。`value` 是发送给 AI 的中文 prompt 字符串（不可翻译），`labelKey` 是点分 i18n key 用于 UI 显示。`label` 字段同时承担两种用途会导致 i18n 与 prompt 语义耦合。

**BAD** — label 字段双用途：
```tsx
export const genres = [
  { value: "drama", label: "剧情", description: "情感驱动的故事" },
];
// label 同时用于 UI 显示和（可能的）prompt 构造 → i18n 时 label 翻译会破坏 prompt
```

**GOOD** — value + labelKey 分离：
```tsx
export const genres = [
  { value: "剧情", labelKey: "genre.drama", description: "情感驱动的故事" },
];
// value 用于 prompt 构造（中文），labelKey 用于 UI 显示（t(labelKey)）
```

**Verification**: 检查数据常量文件（`constants.ts`、`story-constants.ts` 等），确认 UI 显示用 `t(labelKey)`，prompt 构造用 `value`。

**Discovered in**: 深度审计 i18n 修复（R162 的泛化）。Test: `src/modules/character/__tests__/regression-r176-data-constant-labelkey.test.ts`。

### R177: DOM 操作必须用 useRef

React 组件内对 DOM 元素的操作（如 `.click()`、`.focus()`、`.scrollIntoView()`）必须通过 `useRef` 引用元素，不能使用 `document.getElementById` / `document.querySelector`。`document.getElementById` 在 React 的虚拟 DOM 之外操作，可能导致引用过期、SSR 不兼容、多实例冲突。

**BAD** — document.getElementById 操作 DOM：
```tsx
const handleSubmit = () => {
  document.getElementById("file-input")?.click();
};
```

**GOOD** — useRef 引用 DOM：
```tsx
const fileInputRef = useRef<HTMLInputElement>(null);
const handleSubmit = () => {
  fileInputRef.current?.click();
};
// JSX: <input ref={fileInputRef} type="file" />
```

**Verification**: Grep `src/**/*.ts(x)` for `document.getElementById`，确认仅在入口文件（main.tsx）使用，组件内一律用 `useRef`。

**Discovered in**: 深度审计工程质量修复。Test: `src/app/quick-generate/__tests__/regression-r177-dom-use-ref.test.tsx`。

### R178: 回调参数不能遮蔽导入的 t

当文件导入了 i18n 的 `t` 函数（`import { t } from "@/shared/constants/messages"`）后，回调函数参数不能命名为 `t`，否则会遮蔽（shadow）i18n 的 `t`，导致回调内调用 `t(...)` 实际调用的是回调参数而非 i18n 函数（运行时错误或静默失败）。

**BAD** — 回调参数 t 遮蔽 i18n 的 t：
```tsx
import { t } from "@/shared/constants/messages";
// ...
{tasks.filter((t) => t.status === "completed")}
//                                  ^ 此 t 是 task，遮蔽了 i18n 的 t
// 若回调内需要 t() 会调用错误的 t
```

**GOOD** — 用语义化参数名：
```tsx
import { t } from "@/shared/constants/messages";
// ...
{tasks.filter((task) => task.status === "completed")}
```

**Verification**: Grep `src/**/*.ts(x)` for 回调参数命名 `t`（如 `.filter((t)`、`.map((t)`、`.find((t)`），确认在导入了 `t` 的文件中不使用 `t` 作为回调参数名。

**Discovered in**: 深度审计工程质量修复。Test: `src/modules/video/task-management/hooks/__tests__/regression-r178-callback-no-shadow.test.ts`。

### R179: Port 接口扩展优先于 as 断言

当需要调用 Port 接口未定义的可选方法（如 `cancelTask`）时，必须在 Port 接口定义中声明可选方法（`cancelTask?(...): ...`），不能在调用处用 `as` 断言扩展接口。`as` 断言绕过类型检查，且散落在各调用处难以维护；接口扩展集中定义契约，TypeScript 编译器能正确检查实现。

**BAD** — as 断言扩展 Port 接口：
```tsx
const provider = container.videoProvider as {
  generateVideo: (...) => ...;
  cancelTask?: (taskId: string) => Promise<void>;
};
await provider.cancelTask?.(taskId);
```

**GOOD** — Port 接口定义可选方法：
```tsx
// domain/ports/ai-provider-port.ts
export interface IVideoProvider {
  generateVideo(...): Promise<...>;
  // 可选：服务端任务取消（best-effort）
  cancelTask?(taskId: string): Promise<void>;
}
// 调用处
await container.videoProvider.cancelTask?.(taskId);
```

**Verification**: Grep `src/**/*.ts(x)` for `container.\w+ as {` 或 `as IVideoProvider &`，确认 Port 接口扩展在接口定义处而非调用处。

**Discovered in**: 深度审计工程质量修复。Test: `src/domain/ports/__tests__/regression-r179-port-interface-extension.test.ts`。

### R180: 函数职责单一（>100 行的注册函数应拆分）

注册函数（如 IPC handler 注册、事件监听注册）超过 100 行时，必须按类别拆分为独立的注册函数（如 `registerLogHandlers`、`registerShellHandlers`、`registerWindowHandlers`），由顶层函数调用。单函数承担多类别注册导致难以定位、难以测试、修改风险扩散。

**BAD** — 单个函数 121 行注册 7 类 handler：
```tsx
function setupApiHandlers() {
  // 日志 handler (10 行)
  ipcMain.on("log:security", ...);
  // 健康检查 handler (15 行)
  ipcMain.handle("api:health", ...);
  // Shell handler (40 行)
  ipcMain.handle("shell:open-external", ...);
  ipcMain.handle("shell:open-path", ...);
  // 窗口 handler (30 行)
  ipcMain.on("window:minimize", ...);
  // 配置 handler (26 行)
  ipcMain.on("config:get", ...);
  // 总计 121 行 → 难以测试、修改风险高
}
```

**GOOD** — 按类别拆分：
```tsx
function registerLogHandlers(): void { /* ... */ }
function registerHealthHandlers(): void { /* ... */ }
function registerShellHandlers(): void { /* ... */ }
function registerWindowHandlers(): void { /* ... */ }
function registerConfigHandlers(): void { /* ... */ }

function setupApiHandlers(): void {
  registerLogHandlers();
  registerHealthHandlers();
  registerShellHandlers();
  registerWindowHandlers();
  registerConfigHandlers();
}
```

**Verification**: 检查注册函数行数，>100 行的注册函数应拆分为按类别分组的子函数。

**Discovered in**: 深度审计工程质量修复。Test: `electron/src/__tests__/regression-r180-function-split.test.ts`。

### R181: 禁止硬编码 Tailwind 颜色类名（必须使用语义变量）

项目支持 6 个主题（默认/cyber/amber/minimal/lavender/emerald），所有颜色必须通过 `globals.css` 中的语义变量引用。硬编码 `slate-*`、`gray-*`、`dark:` 前缀等颜色不会随主题切换，导致视觉断裂。

**禁止使用的类名**：
- `text-slate-*`, `bg-slate-*`, `border-slate-*`
- `text-gray-*`, `bg-gray-*`, `border-gray-*`
- `dark:` 前缀（项目是暗色优先，`:root` 即为暗色）
- `bg-white`（改用 `bg-card`）
- `bg-blue-50`, `border-blue-500`（改用 `bg-primary/10`, `border-primary`）

**必须使用的语义变量**：

| 场景 | 语义类名 |
|------|---------|
| 次要文本 | `text-muted-foreground` |
| 主文本 | `text-foreground` |
| 卡片背景 | `bg-card` / `bg-card2` |
| 边框 | `border-border` |
| muted 背景 | `bg-muted` |
| 主色调 | `text-primary`, `bg-primary`, `border-primary` |
| 成功 | `text-success`, `bg-success/10` |
| 警告 | `text-warning`, `bg-warning/10` |
| 错误 | `text-destructive`, `bg-destructive/10` |

**BAD**:
```tsx
<div className="text-slate-400 bg-slate-800/50 border-slate-700 dark:bg-slate-900" />
```

**GOOD**:
```tsx
<div className="text-muted-foreground bg-card2 border-border" />
```

**Verification**: `grep -r "text-slate-\|bg-slate-\|border-slate-\|text-gray-\|bg-gray-\|border-gray-" src/ --include="*.tsx" --include="*.ts"` 应返回 0 结果。

**Discovered in**: 批次 5 UI 颜色系统清理。188 处硬编码颜色已全部替换为语义变量。

### R182: `/api/config/set` 必须走异步 keyStorage 持久化（禁止明文 apiKey 落盘）

**Rule**: 前端 `saveConfig` 发送的 `ai_animation_studio_api_config` 字段必须通过 `saveConfigAsync()` 持久化，apiKey 通过 `$secure:` 引用机制存入 keyStorage，禁止明文 apiKey 写入 `config.json`。

**Why**: 前端 `saveConfig` 会将整个 config 序列化为 JSON 字符串作为 `value` 发送到 `/api/config/set`。`applyConfigValue` 必须正确解析字符串或对象，否则 `typeof value === "object"` 对字符串永远为 false，导致：
1. 明文 apiKey 写入磁盘 `config.json`（安全漏洞）
2. apiKey 更新丢失（用户感知不到，但下次重启后 keyStorage 仍是旧值）

**Requirements**:
1. `applyConfigValue(key, value)` 在 `key === "ai_animation_studio_api_config"` 时必须先尝试 `JSON.parse(value)`，解析失败时 warn 并 return，不能静默写入字符串
2. `/api/config/set` 路由必须调用 `saveConfigAsync(config)` 而非 `saveConfig(config)`（sync 版本会在检测到明文 apiKey 时 throw）
3. `saveConfig` (sync) 检测到明文 apiKey 必须抛错，强制调用方迁移到 `saveConfigAsync`
4. `validateConfigValue` 必须拒绝 `data:`、`javascript:`、`vbscript:`、`file:`、`blob:` 协议
5. `PlaintextFallbackStrategy` 必须 fail-close，拒绝明文 JSON 格式
6. `SafeStorageStrategy` 必须用 `writeChain` Promise 链串行化写操作，防止并发覆盖

**BAD**:
```typescript
// ❌ applyConfigValue 不解析字符串，直接 typeof 判断
function applyConfigValue(config, key, value) {
  if (key === "ai_animation_studio_api_config") {
    if (typeof value === "object") {  // 字符串永远不是 object
      Object.assign(config, value);
    }
  }
}
// 结果：apiKey 明文落盘 + 更新丢失
```

**GOOD**:
```typescript
// ✅ 正确解析字符串，使用 saveConfigAsync 持久化
function applyConfigValue(config, key, value) {
  if (key === "ai_animation_studio_api_config") {
    let apiConfig = value;
    if (typeof value === "string") {
      try { apiConfig = JSON.parse(value); }
      catch { logger.warn("malformed JSON"); return; }
    }
    if (apiConfig && typeof apiConfig === "object") {
      Object.assign(config, apiConfig);
    }
  }
}
// 路由层：
const saved = await saveConfigAsync(config);  // 异步持久化到 keyStorage
```

**Verification**: `npm run test:electron -- regression-r182` 必须通过 17 个测试用例。

**Test**: `electron/src/__tests__/regression-r182-config-set-async-persistence.test.ts`

**Discovered in**: v0.12.1 API 配置系统彻底性修复。C1 Critical bug：前端 saveConfig 绕过 keyStorage。

### R188: network-monitor MUST Defer Side Effects to startMonitoring()

`src/infrastructure/network/network-monitor.ts` MUST NOT execute any top-level side effects during module load. Specifically, `window.__NETWORK_MONITOR_STATE__` MUST NOT be set, and `window.addEventListener("online"/"offline")` MUST NOT be called at module scope. All side effects MUST be deferred to `startMonitoring()` (via `ensureStateInitialized()`). This prevents accidental registration on bare imports, simplifies HMR, and makes the module testable without triggering global state mutation.

**BAD** — Top-level side effects on import:
```typescript
// ❌ Module scope executes immediately on import
window.__NETWORK_MONITOR_STATE__ = { /* ... */ };
window.addEventListener("online", handleOnline);
window.addEventListener("offline", handleOffline);
export function startMonitoring() { /* ... */ }
```

**GOOD** — Lazy initialization inside startMonitoring:
```typescript
let stateInitialized = false;
function ensureStateInitialized(): void {
  if (stateInitialized || typeof window === "undefined") return;
  stateInitialized = true;
  window.__NETWORK_MONITOR_STATE__ = { /* getters */ };
}
export function startMonitoring(): void {
  if (isMonitoring) return;
  ensureStateInitialized();  // ✅ Side effect deferred
  isMonitoring = true;
  // ...
  window.addEventListener("online", boundHandleOnline);
  window.addEventListener("offline", boundHandleOffline);
}
```

**Verification**: Reset modules, spy on `window.addEventListener`, dynamically `import()` the module. Verify spy NOT called and `window.__NETWORK_MONITOR_STATE__` is undefined. Call `startMonitoring()`. Verify `__NETWORK_MONITOR_STATE__` is set and `addEventListener` called with `online`/`offline`.

**Discovered in**: P0 fix audit found `network-monitor.ts` registered `window.__NETWORK_MONITOR_STATE__` at module scope, causing the side effect to fire on any import (including tests and HMR). Test: `src/infrastructure/network/__tests__/regression-r188-no-top-level-side-effects.test.ts`.

### R189: video-cache MUST Defer beforeunload Registration to registerObjectUrl()

`src/infrastructure/storage/video-cache.ts` MUST NOT register a `beforeunload` listener at module scope. The `window.addEventListener("beforeunload", ...)` call MUST be wrapped in a lazy initializer (`ensureBeforeUnloadRegistered()`) that is invoked from `registerObjectUrl()`. `cleanupVideoCache()` MUST remove the listener. This pattern prevents HMR-time duplicate registrations and makes the module testable.

**BAD** — Top-level beforeunload registration:
```typescript
// ❌ Fires on every import, including tests and HMR
window.addEventListener("beforeunload", () => {
  cleanupAllObjectUrls();
});
export function registerObjectUrl(...) { /* ... */ }
```

**GOOD** — Lazy registration with cleanup:
```typescript
let beforeUnloadHandler: (() => void) | null = null;
let beforeUnloadRegistered = false;
function ensureBeforeUnloadRegistered(): void {
  if (beforeUnloadRegistered || typeof window === "undefined") return;
  beforeUnloadRegistered = true;
  beforeUnloadHandler = () => { cleanupAllObjectUrls(); };
  window.addEventListener("beforeunload", beforeUnloadHandler);
}
export function cleanupVideoCache(): void {
  if (beforeUnloadHandler && typeof window !== "undefined") {
    window.removeEventListener("beforeunload", beforeUnloadHandler);
    beforeUnloadHandler = null;
    beforeUnloadRegistered = false;
  }
}
export function registerObjectUrl(taskId: string, url: string): void {
  ensureBeforeUnloadRegistered();  // ✅ Deferred
  // ...
}
```

**Verification**: Reset modules, spy on `window.addEventListener`, dynamically `import()` the module. Verify spy NOT called with `"beforeunload"`. Call `registerObjectUrl()`. Verify `addEventListener` called once with `"beforeunload"`. Call `registerObjectUrl()` again — verify no second registration (idempotent). Call `cleanupVideoCache()`. Verify `removeEventListener` called.

**Discovered in**: P0 fix audit found `video-cache.ts` registered `beforeunload` at module scope, causing duplicate listeners on HMR and making the module untestable in isolation. Test: `src/infrastructure/storage/__tests__/regression-r189-no-top-level-beforeunload.test.ts`.
