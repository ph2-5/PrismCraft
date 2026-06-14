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
const { storyService } = await import("@/modules/story");
```

**GOOD**:
```typescript
import { storyService } from "@/modules/story";
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
