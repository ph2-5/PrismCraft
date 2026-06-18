# 六、平台兼容

> 核心关注：IPC、Electron 环境、进程模型

### R21 (UPDATED): Internal Communication SHOULD Use HTTP API via @/shared/file-http
The app now has an HTTP API server (`electron/src/api/server.ts`) running on `API_SERVER_PORT`. Internal communication for file operations and config read/write SHOULD use HTTP API (`/api/file/*`, `/api/config/*`) via the `@/shared/file-http` unified layer (HTTP first + IPC fallback). Direct `fetch("/api/...")` without going through `file-http` is discouraged because it bypasses the IPC fallback. Browser dev mode (no Electron) should use `isElectron()` guard for desktop-only features.

**BAD** — Direct fetch without unified layer (bypasses IPC fallback):
```typescript
const res = await fetch("/api/config");
const data = await res.json();
```

**BAD** — Direct electronAPI call in modules (bypasses HTTP unified layer):
```typescript
const value = window.electronAPI.getConfig("key");
window.electronAPI.setConfig("key", value);
```

**GOOD** — Use @/shared/file-http unified layer:
```typescript
import { writeFile, getCacheDirectory } from "@/shared/file-http";
const result = await writeFile(filePath, data);
const cacheDir = await getCacheDirectory();
```

**GOOD** — Use @/shared/api-config for config status checks:
```typescript
import { checkConfigStatus } from "@/shared/api-config";
const data = await checkConfigStatus();
```

**Note**: Desktop-only features (saveFileDialog, openPath, openExternal) may retain direct IPC with browser fallback.

### R43: Destructive UI Operations Must Require User Confirmation
When a UI action will permanently delete data (single item delete, batch delete, clear all), the handler MUST call `confirm()` with `variant: "danger"` before executing the destructive operation. The handler MUST await the confirmation result and abort if the user cancels (`if (!confirmed) return`). This applies to video task deletion, batch deletion, and any other irreversible operations. Without confirmation, accidental clicks cause permanent data loss.

**BAD**:
```typescript
const handleRemoveTask = () => {
  removeTask(detailTask.taskId);
  setIsDetailOpen(false);
};

const handleRemoveSelected = () => {
  removeTasks(Array.from(selectedTaskIds));
  setSelectedTaskIds(new Set());
};
```

**GOOD**:
```typescript
const handleRemoveTask = async () => {
  if (!detailTask) return;
  const confirmed = await confirm({
    title: "确认删除",
    description: "确定删除该视频任务？此操作不可撤销。",
    confirmText: "删除",
    cancelText: "取消",
    variant: "danger",
  });
  if (!confirmed) return;
  removeTask(detailTask.taskId);
  setIsDetailOpen(false);
};

const handleRemoveSelected = async () => {
  if (selectedTaskIds.size === 0) return;
  const confirmed = await confirm({
    title: "确认批量删除",
    description: `确定删除选中的 ${selectedTaskIds.size} 个视频任务？此操作不可撤销。`,
    confirmText: "删除",
    cancelText: "取消",
    variant: "danger",
  });
  if (!confirmed) return;
  removeTasks(Array.from(selectedTaskIds));
  setSelectedTaskIds(new Set());
};
```

### R49: React Event Handlers MUST Use e.currentTarget Over e.target
When a React event handler needs to access the DOM element that the handler is attached to, it MUST use `e.currentTarget` instead of `e.target`. The `e.target` refers to the innermost element that triggered the event (which may be a child element due to event bubbling), while `e.currentTarget` always refers to the element the handler is bound to. Using `e.target` with a type assertion like `e.target as HTMLVideoElement` is unsafe when the element has children, as `e.target` may point to a child node.

**BAD**:
```tsx
<video onError={(e) => {
  const target = e.target as HTMLVideoElement;
  target.dataset.retried = "1";
}} />
```

**GOOD**:
```tsx
<video onError={(e) => {
  const target = e.currentTarget;
  if (target.dataset.retried) return;
  target.dataset.retried = "1";
}} />
```

### R51: Electron-Dependent Operations MUST Guard Against Non-Electron Environment
When a component or hook performs operations that require `electronAPI` (database queries, IPC calls, API server requests), it MUST check `isElectron()` before attempting the operation. In browser dev mode (Vite dev server without Electron), these operations will always fail with "electronAPI not available" errors, producing console noise and potentially triggering error toasts that mislead developers.

**Guard patterns by context**:

1. **useEffect** — guard inside async callback:
```typescript
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
      if (!cancelled) errorLogger.error("Failed to load plugins", err);
    } finally {
      if (!cancelled) setIsLoading(false);
    }
  })();
  return () => { cancelled = true; };
}, []);
```

2. **useQuery (react-query)** — use `enabled` option:
```typescript
export function useStories() {
  return useQuery({
    queryKey: ["stories"],
    queryFn: async () => { /* ... */ },
    enabled: isElectron(),  // Skip query in browser mode
  });
}
```

**BAD** — useQuery without enabled guard, fires in browser mode and fails:
```typescript
export function useStories() {
  return useQuery({
    queryKey: ["stories"],
    queryFn: async () => { /* ... */ },
    // Missing: enabled: isElectron()
  });
}
```

**Affected patterns** (discovered in console error audit):
- `useAssetLoader` → `services.getAllCharacters()` / `services.getAllScenes()`
- `PluginManager` → `fetchPlugins()` (API server)
- `AssetLibraryPage` → `fetchSecondaryData()` (storage via DI)
- `useVideoTaskManager` → `container.videoTaskStorage.getAllVideoTasks()`
- `CrashRecoveryDialog` → `electronAPI.onNavigate`
- `ProfessionalModeEditor` → element loading
- `ensureSyncSchema()` → `electronAPI.dbRun`
- `useStories`, `useCharacters`, `useScenes`, `useVideoTasks`, `useVideoCacheStats`, `useMediaAssets` → react-query useQuery hooks

### R52: localStorage-Dependent Initial State MUST Use usePreference Hook
When a component reads `localStorage` for its initial state (e.g., theme preference, sidebar collapse state, onboarding dismissed state, auto-save settings), it MUST use the `usePreference` hook from `@/shared/utils/preferences` instead of `useState(() => localStorage.getItem(...))` or manual `useSyncExternalStore`. The `usePreference` hook wraps `useSyncExternalStore` with snapshot caching (for object reference stability) and cross-tab sync (via `storage` event listener). Direct `localStorage` access in `useState` causes hydration mismatches; manual `useSyncExternalStore` with per-component listeners creates boilerplate and risks infinite re-renders from unstable object references.

**BAD**:
```typescript
const [enabled, setEnabled] = useState(() => {
  try {
    const parsed = preferencesStorage.get("autosave-settings", {});
    return typeof parsed.enabled === "boolean" ? parsed.enabled : true;
  } catch { return true; }
});
```

**GOOD**:
```typescript
import { usePreference } from "@/shared/utils/preferences";

const [settings, setSettings] = usePreference<AutoSaveSettings>("autosave-settings", {});
const enabled = typeof settings.enabled === "boolean" ? settings.enabled : true;
```

**Affected components** (migrated in hydration audit):
- `ThemeProvider` → theme preference (uses custom useSyncExternalStore for subscribe logic)
- `Sidebar` → collapsed state, modKey
- `OnboardingGuide` / `onboarding` → visibility state
- `ConfigCheckBanner` → dismissed state
- `story/page.tsx` → auto-save settings
- `settings/page.tsx` → auto-save settings

### R61: Test Mock IPC Return Format MUST Match Production Contract
When `tests/helpers/electron-mock.ts` provides mock implementations for `electronAPI` methods (dbQuery, dbRun, dbTransaction, secureConfigSave, etc.), the return format MUST exactly match what the production `preload.ts` IPC handlers return. A format mismatch causes `safeQuery`/`safeRun`/`safeTransaction` to misinterpret the response, leading to silent failures or spurious error toasts in e2e tests.

**Contract** (defined in `src/infrastructure/storage/sqlite-core.ts`):
- `dbQuery` → `{ success: boolean, data: T[] }` (safeQuery extracts `response.data` as `T[]`)
- `dbRun` → `{ success: boolean, data: { changes: number, lastInsertRowid: number } }` (safeRun extracts `response.data` as `DbRunResult`)
- `dbTransaction` → `{ success: boolean, data: unknown[] }` (safeTransaction extracts `response.data` as `unknown[]`)

**BAD** — mock returns raw array instead of wrapped format:
```typescript
dbQuery: async (sql, params) => {
  const result = parseSelect(sql, params ?? []);
  return result.data;  // Returns T[], but safeQuery expects { success, data }
},
```

**GOOD** — mock returns wrapped format matching production:
```typescript
dbQuery: async (sql, params) => {
  const result = parseSelect(sql, params ?? []);
  return { success: true, data: result.data ?? [] };
},
```

**Verification**: When modifying `sqlite-core.ts` return types or `preload.ts` IPC handlers, run `npx playwright test tests/database-storage.spec.ts` to verify mock contract alignment.

**Discovered in**: e2e test audit — `dbQuery` mock returned raw array, `safeQuery` checked `response.success` (undefined on array), threw error, `useVideoTaskManager` showed error toast.
