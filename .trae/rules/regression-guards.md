# Regression Guards (from Bug Audit)

> These rules are **regression guards** — they prevent known bug patterns from reappearing.
> They are NOT discovery tools for future audits. Future audits must start from usage scenarios, not from this list.

## Phase 1: Core Bug Audit (R1-R18)

### R1: Persist Before State Update
When an async operation modifies both React state and persistent storage, the storage write MUST complete before the state update. Reversing the order risks state-persistence inconsistency if the async operation fails.

**BAD**:
```typescript
setAllTasks(tasks.filter(t => t.status !== "completed"));
await deleteVideoTasksByStatus("completed");
```

**GOOD**:
```typescript
await deleteVideoTasksByStatus("completed");
setAllTasks(tasks.filter(t => t.status !== "completed"));
```

### R2: Delete Must Cascade
When deleting an entity (story, beat, character), all associated resources (VideoTask, cache, media refs) MUST be explicitly cleaned up. Relying only on React state removal leaves orphaned records in the database and orphaned files in cache.

**BAD**:
```typescript
function deleteBeat(beatId: string) {
  setBeats(beats.filter(b => b.id !== beatId));
}
```

**GOOD**:
```typescript
async function deleteBeat(beatId: string) {
  await videoTaskService.deleteTasksByBeatId(beatId);
  await cacheService.invalidateByBeatId(beatId);
  setBeats(beats.filter(b => b.id !== beatId));
}
```

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

### R4: Deduplication Over Abort for In-Flight Requests
When a user triggers the same async operation while a previous one is in-flight, prefer returning the existing Promise (deduplication) over aborting the previous request. AbortController.abort() cannot cancel an already-sent HTTP request — it only prevents reading the response, wasting API quota.

**BAD**:
```typescript
if (controller) controller.abort();
controller = new AbortController();
await fetch(url, { signal: controller.signal });
```

**GOOD**:
```typescript
if (pendingPromise) return pendingPromise;
pendingPromise = fetch(url);
const result = await pendingPromise;
pendingPromise = null;
return result;
```

### R5: Silent Failure in Background Operations Must Notify User
When a background operation (auto-save, polling, sync) fails after exhausting retries, the user MUST be notified. Silent failure causes users to believe data is persisted when it is not.

**BAD**:
```typescript
if (retryCount >= MAX_RETRY) {
  retryCount = 0;
  return;
}
```

**GOOD**:
```typescript
if (retryCount >= MAX_RETRY) {
  emitToast("error", "自动保存失败", "多次重试后仍无法保存，请手动保存您的更改");
  retryCount = 0;
  return;
}
```

### R6: User-Facing Error Messages Must Use Identifiable Labels
When notifying users about task failures, use human-readable labels (beat title, story title, character name) instead of internal IDs. Truncated UUIDs are meaningless to users.

**BAD**:
```typescript
emitToast("error", "视频生成失败", `任务 ${taskId.slice(0, 8)} 失败`);
```

**GOOD**:
```typescript
const taskLabel = task.beatTitle || task.storyTitle || taskId.slice(0, 8);
emitToast("error", "视频生成失败", `「${taskLabel}」失败`);
```

### R7: Video onError Must Guard Against Infinite Retry Loops
When a `<video>` element fails to load and the onError handler sets a fallback `src`, the handler MUST prevent re-triggering if the fallback also fails. Without a guard, an infinite onError loop will occur.

**BAD**:
```tsx
<video onError={(e) => { (e.target as HTMLVideoElement).src = fallbackUrl; }} />
```

**GOOD**:
```tsx
<video onError={(e) => {
  const target = e.target as HTMLVideoElement;
  if (!target.dataset.retried) {
    target.dataset.retried = "1";
    target.src = fallbackUrl;
  }
}} />
```

### R8: Auto-Save Must Cover New Entities Without IDs
When auto-save is enabled for an entity type, it MUST NOT be disabled solely because the entity lacks a persistent ID. New entities (e.g., stories with `id: ""`) must still be auto-savable — the save handler should create the entity on first save. If the save handler requires certain conditions (e.g., non-empty beats), guard those conditions separately rather than disabling auto-save entirely.

**BAD**:
```typescript
useAutoSave({ enabled: !!entity.id && hasUnsavedChanges, ... });
```

**GOOD**:
```typescript
useAutoSave({ enabled: hasUnsavedChanges && meetsMinimumSaveCriteria, ... });
```

### R9: Optimistic Updates Must Roll Back on Failure
When an async operation uses optimistic UI updates (e.g., showing a blob URL before server upload completes), the handler MUST: (1) show success feedback ONLY after the operation succeeds, (2) roll back to the previous state if the operation fails, and (3) show error feedback on failure. Never show success before the operation completes.

**BAD**:
```typescript
setBeats(prev => prev.map(b => b.id === id ? { ...b, imageUrl: tempUrl } : b));
success("上传成功");
const persistentUrl = await upload(file);
// If upload fails, beat still has tempUrl which gets revoked → broken image
```

**GOOD**:
```typescript
setBeats(prev => prev.map(b => b.id === id ? { ...b, imageUrl: tempUrl } : b));
const persistentUrl = await upload(file);
if (persistentUrl) {
  setBeats(prev => prev.map(b => b.id === id ? { ...b, imageUrl: persistentUrl } : b));
  success("上传成功");
} else {
  setBeats(prev => prev.map(b => b.id === id ? { ...b, imageUrl: previousUrl } : b));
  showError("上传失败");
}
```

### R10: Async Save Operations Must Guard Against Concurrent Invocations
When a save operation is async and can be triggered by both UI buttons and keyboard shortcuts (e.g., Ctrl+S), it MUST use a ref-based concurrency guard. React state (`saveStatus`) is unsuitable for this purpose because closure captures stale values.

**BAD**:
```typescript
const handleSave = useCallback(async () => {
  if (saveStatus === "saving") return; // Stale closure value
  setSaveStatus("saving");
  await persist();
}, [saveStatus]);
```

**GOOD**:
```typescript
const savingRef = useRef(false);
const handleSave = useCallback(async () => {
  if (savingRef.current) return;
  savingRef.current = true;
  try {
    await persist();
  } finally {
    savingRef.current = false;
  }
}, []);
```

### R11: Cross-Entity Async Callbacks Must Verify Ownership
When an async callback (e.g., video task completion, polling result) updates state for an entity that may have changed since the callback was scheduled (e.g., user switched stories), the callback MUST verify the entity ID matches the current context before applying state updates. This is especially critical for long-running async operations like video generation, AI planning, and file uploads.

**BAD**:
```typescript
useEffect(() => {
  const updates = buildVideoUrlUpdates(beatsRef.current, completedTaskUrls);
  setBeats(updates); // May apply updates to wrong story if user switched
}, [completedTaskUrls]);
```

**GOOD**:
```typescript
const completedTaskUrls = useMemo(() => {
  const map = new Map<string, string>();
  for (const task of tasks) {
    if (currentStoryId && task.storyId && task.storyId !== currentStoryId) continue;
    map.set(task.beatId, task.videoUrl);
  }
  return map;
}, [tasks, currentStoryId]);
```

### R12: Destructive Overwrites Must Warn About In-Flight Operations
When an operation will completely replace a collection (e.g., AI planning replacing all beats, bulk import replacing all characters), it MUST check for in-flight async operations on the existing items and warn the user. Without this warning, users may lose the results of operations they've already initiated.

**BAD**:
```typescript
if (beats.length > 0) {
  const confirmed = await confirm("AI规划将覆盖所有镜头，确定继续？");
}
```

**GOOD**:
```typescript
if (beats.length > 0) {
  const videoWarning = activeVideoTaskCount > 0
    ? `\n\n⚠️ 当前有 ${activeVideoTaskCount} 个视频任务正在进行中，覆盖后结果将无法回写。`
    : "";
  const confirmed = await confirm(`AI规划将覆盖所有镜头。${videoWarning}\n\n确定继续？`);
}
```

### R13: Destructive Import/Export Must Use Write-Then-Clean Pattern
When importing data with a "replace" strategy, NEVER delete existing data before writing new data. If the write process fails partway through, the old data is permanently lost. Instead, write all new data first, then clean up only the records not in the new set.

**BAD**:
```typescript
if (mergeStrategy === "replace") {
  await db.run("DELETE FROM table");
}
for (const item of items) {
  await db.insert(item); // If this fails, data is lost
}
```

**GOOD**:
```typescript
const importedIds: string[] = [];
for (const item of items) {
  try {
    await db.insert(item);
    importedIds.push(item.id);
  } catch (e) { /* skip */ }
}
if (mergeStrategy === "replace" && importedIds.length > 0) {
  await db.run("DELETE FROM table WHERE id NOT IN (?)", [importedIds]);
}
```

### R14: Async AI Analysis Must Merge Results, Not Replace
When an async AI analysis operation completes and updates an entity (e.g., character image analysis, scene analysis), it MUST merge its results into the current state rather than replacing the entire entity. The user may have edited fields during the async operation.

**BAD**:
```typescript
const snapshot = ref.current;
const updated = { ...snapshot, ...analysisResult };
setState(updated); // Overwrites user edits made during analysis
```

**GOOD**:
```typescript
setState((prev) => ({
  ...prev,
  name: analyzed.name || prev.name,
  description: analyzed.description || prev.description,
  // Only overwrite fields that AI actually produced
}));
```

### R15: Batch Delete Operations Must Be Resilient to Partial Failure
When deleting multiple items in a loop, each iteration MUST be independently try-caught. Collect successfully deleted IDs and update the store only with those IDs. If the loop fails midway, already-deleted items must be removed from the store to maintain consistency. NEVER wrap the entire loop in a single try-catch that prevents store updates on partial failure.

**BAD**:
```typescript
try {
  for (const id of ids) {
    await db.delete(id); // If this fails on item 3, items 1-2 are deleted from DB but still in store
  }
  setAllTasks(prev => prev.filter(t => !ids.includes(t.id))); // Never reached
} catch (error) {
  log(error); // Store is now inconsistent with DB
}
```

**GOOD**:
```typescript
const deletedIds: string[] = [];
for (const id of ids) {
  try {
    await db.delete(id);
    deletedIds.push(id);
  } catch (error) {
    log(error); // Skip this item, continue with others
  }
}
if (deletedIds.length > 0) {
  setAllTasks(prev => prev.filter(t => !deletedIds.includes(t.id)));
}
```

### R16: ErrorBoundary Must Limit Retry Attempts
When an ErrorBoundary catches a rendering error, the retry button MUST be disabled after a configurable number of consecutive failures (default: 3). Repeatedly retrying a deterministic error creates an infinite crash-retry loop that degrades the user experience. After the limit, guide the user to refresh or reset instead.

**BAD**:
```tsx
<Button onClick={() => setState({ hasError: false })}>重试</Button>
// User can click this infinitely, each time the component crashes again
```

**GOOD**:
```tsx
{errorCount < 3 ? (
  <Button onClick={() => setState({ hasError: false })}>重试</Button>
) : (
  <p>错误多次重复出现，请尝试刷新页面或重置</p>
)}
```

### R17: Cascade Updates Must Be Resilient to Partial Failure
When deleting an entity triggers updates to multiple related entities (e.g., deleting a scene requires updating all stories that reference it), each related entity update MUST be handled independently. A single failure MUST NOT abort the entire cascade, leaving remaining entities with stale references. Collect failed entity labels and notify the user after all updates are attempted.

**BAD**:
```typescript
for (const story of affectedStories) {
  const result = await storyService.update(story.id, updatedStory);
  if (!result.ok) throw result.error; // Remaining stories not updated
}
```

**GOOD**:
```typescript
const failedStories: string[] = [];
for (const story of affectedStories) {
  try {
    const result = await storyService.update(story.id, updatedStory);
    if (!result.ok) failedStories.push(story.title || story.id.slice(0, 8));
  } catch (e) {
    failedStories.push(story.title || story.id.slice(0, 8));
  }
}
if (failedStories.length > 0) {
  showError("部分更新失败", `以下故事引用未清除: ${failedStories.join("、")}`);
}
```

### R18: Storage Quota Errors Must Notify User
When a background sync or auto-save operation fails due to storage quota limits (QuotaExceededError), the user MUST be notified. Silent failure causes users to believe their data is persisted when it is not. After attempting automatic cleanup, if the error persists, show a toast with actionable guidance.

**BAD**:
```typescript
catch (error) {
  errorLogger.error("Failed to sync", error);
  // User never knows their data wasn't saved
}
```

**GOOD**:
```typescript
catch (error) {
  errorLogger.error("Failed to sync", error);
  if (error.name === "QuotaExceededError" || error.message.includes("quota")) {
    await attemptCleanup();
    emitToast("error", "存储空间不足", "数据同步失败，请清理部分记录后重试");
  }
}
```

## Phase 2: MVP Polish Audit (R19-R27)

### R19: Video onError Must Use data-retried Guard (Extended R7)
When a `<video>` element's onError handler sets a fallback or retry `src`, the handler MUST use a `dataset.retried` guard to prevent infinite onError loops. This applies to ALL video elements across the app, not just specific pages. Without this guard, a fallback URL that also fails will trigger onError again, creating an infinite loop.

**BAD**:
```tsx
<video
  src={videoUrl}
  onError={(e) => {
    (e.target as HTMLVideoElement).src = fallbackUrl;
  }}
/>
```

**GOOD**:
```tsx
<video
  src={videoUrl}
  onError={(e) => {
    const target = e.target as HTMLVideoElement;
    if (!target.dataset.retried) {
      target.dataset.retried = "1";
      target.src = fallbackUrl;
    }
  }}
/>
```

### R20: ErrorBoundary Retry Must Have Limit (Extended R16)
When an ErrorBoundary catches a rendering error, the retry mechanism MUST limit consecutive retry attempts (default: 3). After the limit, the UI MUST guide the user to refresh or reset instead of offering another retry button. This applies to ALL ErrorBoundary implementations, including page-level and component-level boundaries.

**BAD**:
```tsx
<Button onClick={() => setState({ hasError: false })}>重试</Button>
```

**GOOD**:
```tsx
{errorCount < MAX_RETRY_ATTEMPTS ? (
  <Button onClick={() => setState({ hasError: false })}>重试</Button>
) : (
  <p>错误多次重复出现，请尝试刷新页面或重置</p>
)}
```

### R21: Electron App Must NOT Use fetch("/api/...") for Internal Communication
In an Electron + Next.js (output: "export") app, there is no server-side API route handler. All `fetch("/api/...")` calls will fail at runtime. Internal data access MUST go through the DI container, IPC bridge, or shared proxy exports (e.g., `checkConfigStatus()`, `testConnection()`). This applies to config checks, connection tests, and any other renderer↔main communication.

**BAD**:
```typescript
const res = await fetch("/api/config");
const data = await res.json();
```

**GOOD**:
```typescript
import { checkConfigStatus } from "@/shared/api-config";
const data = await checkConfigStatus();
```

### R22: Async Delete Operations Must Have Loading State
When a delete confirmation dialog triggers an async operation (database delete, cascade updates), the confirm button MUST show a loading state and be disabled during the operation. Without this, users can click "确认删除" multiple times, triggering duplicate delete operations.

**BAD**:
```tsx
<Button variant="destructive" onClick={() => performDelete(id)}>
  确认删除
</Button>
```

**GOOD**:
```tsx
<Button variant="destructive" disabled={isDeleting} onClick={() => performDelete(id)}>
  {isDeleting ? "删除中..." : "确认删除"}
</Button>
```

### R23: Async Save/Edit Dialogs Must Have Loading State
When a dialog's save/confirm button triggers an async operation (API call, database write), the button MUST show a loading state and be disabled during the operation. Without this, users can submit multiple times, causing duplicate writes or race conditions.

**BAD**:
```tsx
<Button onClick={async () => { await save(); close(); }}>保存</Button>
```

**GOOD**:
```tsx
<Button disabled={isSaving} onClick={async () => {
  setIsSaving(true);
  try { await save(); close(); }
  finally { setIsSaving(false); }
}}>
  {isSaving ? "保存中..." : "保存"}
</Button>
```

### R24: User Action Feedback Must Include Success Toast
When a user explicitly triggers a save/delete/update operation (not auto-save), the UI MUST provide success feedback via toast notification. Silent success leaves users uncertain whether their action took effect. This applies to settings changes, provider management, feature mapping, and asset edits.

**BAD**:
```typescript
await saveConfig(updatedConfig);
// No feedback — user doesn't know if it succeeded
```

**GOOD**:
```typescript
await saveConfig(updatedConfig);
showSuccess("已保存", "配置已更新");
```

### R25: Loading States Must Be Shown for Data-Dependent UI
When a page or component renders data fetched asynchronously (characters list, scenes list, assets), it MUST show a loading indicator (spinner, skeleton) while data is loading. Showing an empty state during loading misleads users into thinking no data exists.

**BAD**:
```tsx
{characters.length === 0 ? (
  <EmptyState />  // Shown even during loading!
) : (
  <CharacterList />
)}
```

**GOOD**:
```tsx
{charactersLoading ? (
  <LoadingSpinner />
) : characters.length === 0 ? (
  <EmptyState />
) : (
  <CharacterList />
)}
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

## Phase 3: Comprehensive Bug Audit (R28-R29)

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

### R29: Async Callbacks Must Verify Entity ID Consistency
When an async operation (AI analysis, image generation, video completion) completes and updates entity state, it MUST verify that the entity ID at the start of the operation still matches the current entity ID. If the user switched to a different entity during the async operation, the result MUST be discarded to prevent updating the wrong entity.

**BAD**:
```typescript
const analyzeImage = async (imageUrl: string) => {
  const result = await container.imageProvider.analyzeImage(imageUrl);
  // User may have switched characters during analysis
  setCurrentCharacter((prev) => ({ ...prev, ...result.data.analyzed }));
};
```

**GOOD**:
```typescript
const analyzeImage = async (imageUrl: string) => {
  const entityIdAtStart = currentEntityRef.current.id;
  const result = await container.imageProvider.analyzeImage(imageUrl);
  if (currentEntityRef.current.id !== entityIdAtStart) return;
  setCurrentEntity((prev) => ({ ...prev, ...result.data.analyzed }));
};
```

## Phase 4: Comprehensive Bug Audit Round 2 (R30-R33)

### R30: Cascade Delete Operations Must Be Atomic
When deleting an entity and cleaning up its references across multiple tables, all DELETE/UPDATE statements MUST be executed within a single `safeTransaction`. Splitting cascade deletes into multiple transactions risks partial completion: if the second transaction fails, references are cleaned but the entity still exists (or vice versa), leaving the database in an inconsistent state.

**BAD**:
```typescript
await safeTransaction([
  { sql: "DELETE FROM story_characters WHERE character_id = ?", params: [id] },
  { sql: "UPDATE story_beats SET character = NULL WHERE character = ?", params: [id] },
]);
await safeTransaction([
  { sql: "DELETE FROM character_outfits WHERE character_id = ?", params: [id] },
  { sql: "DELETE FROM characters WHERE id = ?", params: [id] },
]);
```

**GOOD**:
```typescript
await safeTransaction([
  { sql: "DELETE FROM story_characters WHERE character_id = ?", params: [id] },
  { sql: "UPDATE story_beats SET character = NULL WHERE character = ?", params: [id] },
  { sql: "DELETE FROM character_outfits WHERE character_id = ?", params: [id] },
  { sql: "DELETE FROM characters WHERE id = ?", params: [id] },
]);
```

### R31: User-Initiated Async Save Must Verify Entity Context After Completion
When a user explicitly triggers a save operation (Ctrl+S, save button) for an entity, the save handler MUST snapshot the entity ID at the start and verify it still matches the current entity ID after the async operation completes. If the user switched to a different entity during the save, the state update MUST be discarded to prevent overwriting the new entity's state with the old entity's saved data.

**BAD**:
```typescript
const handleSave = useCallback(async () => {
  if (savingRef.current) return;
  savingRef.current = true;
  try {
    await storyService.update(currentStory.id, currentStory);
    setCurrentStory(savedStory, true);
  } finally {
    savingRef.current = false;
  }
}, [currentStory]);
```

**GOOD**:
```typescript
const currentStoryIdRef = useRef(currentStory.id);
useEffect(() => { currentStoryIdRef.current = currentStory.id; }, [currentStory.id]);

const handleSave = useCallback(async () => {
  if (savingRef.current) return;
  const storyIdAtSaveStart = currentStory.id;
  savingRef.current = true;
  try {
    await storyService.update(storyIdAtSaveStart, currentStory);
    if (currentStoryIdRef.current !== storyIdAtSaveStart) return;
    setCurrentStory(savedStory, true);
  } finally {
    savingRef.current = false;
  }
}, [currentStory]);
```

### R32: Batch Generation Loops Must Check Cancellation on Component Unmount
When a batch generation loop (keyframes, frame pairs, videos) processes multiple items sequentially, it MUST check a cancellation flag before each iteration and after each async operation. When the component unmounts, the flag MUST be set to true via a useEffect cleanup. Without this, in-flight batch operations continue running after navigation, causing state updates on unmounted components and wasting API quota.

**BAD**:
```typescript
for (let i = 0; i < beats.length; i++) {
  const result = await generateKeyframe(beats[i].id);
  setBeats(prev => prev.map(b => b.id === result.id ? result : b));
}
```

**GOOD**:
```typescript
const cancelledRef = useRef(false);
useEffect(() => { return () => { cancelledRef.current = true; }; }, []);

for (let i = 0; i < beats.length; i++) {
  if (cancelledRef.current) break;
  const result = await generateKeyframe(beats[i].id);
  if (cancelledRef.current) break;
  setBeats(prev => prev.map(b => b.id === result.id ? result : b));
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

## Phase 5: Vibe Coding Audit (R34-R36)

### R34: Zustand Store Updates MUST Use Functional Form When Deriving From Current State
When a Zustand store update derives new state from the current state (e.g., filtering a list, incrementing a counter, merging into an existing object), it MUST use the functional form `set((state) => ({ ... }))` instead of `get()` + `set({ ... })`. The `get()` + `set()` pattern reads a snapshot that may be stale by the time `set()` is called, causing concurrent updates to overwrite each other.

**BAD**:
```typescript
const current = get().allTasks;
set({ allTasks: current.filter(t => t.id !== id) });
```

**GOOD**:
```typescript
set((state) => ({ allTasks: state.allTasks.filter(t => t.id !== id) }));
```

### R35: Blob URLs Created for Preview MUST Be Revoked on Component Unmount
When a component creates a Blob URL via `URL.createObjectURL()` for temporary preview (e.g., uploaded image/video preview, reference video), the Blob URL MUST be revoked when the component unmounts. Use a `useRef` to track the current Blob URL and a `useEffect` with empty dependency array to revoke on cleanup. Failing to revoke causes memory leaks proportional to the file size.

**BAD**:
```typescript
const [referenceVideo, setReferenceVideo] = useState<string | null>(null);
const handleUpload = (file: File) => {
  setReferenceVideo(URL.createObjectURL(file));
};
// No cleanup on unmount — Blob URL leaks
```

**GOOD**:
```typescript
const [referenceVideo, setReferenceVideo] = useState<string | null>(null);
const referenceVideoBlobRef = useRef<string | null>(null);
const handleUpload = (file: File) => {
  const blobUrl = URL.createObjectURL(file);
  referenceVideoBlobRef.current = blobUrl;
  setReferenceVideo(blobUrl);
};
useEffect(() => {
  return () => {
    if (referenceVideoBlobRef.current) {
      URL.revokeObjectURL(referenceVideoBlobRef.current);
    }
  };
}, []);
```

### R36: Async AI Analysis Results MUST Use Selective Merge, Not Spread Override
When an async AI analysis operation (image analysis, scene analysis, character analysis) completes and updates entity state, it MUST merge only the fields that AI actually produced (e.g., appearance, style, elements, colors) using `??` (nullish coalescing), NOT spread-override the entire entity with `{ ...prev, ...analysisResult }`. Spread override will overwrite user edits made during the async operation on fields like `name`, `description`, `gender`.

**BAD**:
```typescript
setCurrentCharacter((prev) => ({ ...prev, ...analysisResult }), true);
```

**GOOD**:
```typescript
setCurrentCharacter((prev) => ({
  ...prev,
  appearance: analysisResult.appearance ?? prev.appearance,
  style: analysisResult.style ?? prev.style,
  personality: analysisResult.personality ?? prev.personality,
}), true);
```

### R37: Dynamic SQL Table Names MUST Be Validated Against Identifier Pattern
When constructing SQL queries with dynamic table names (e.g., iterating over table names in a cleanup loop, building queries from variables), the table name MUST be validated against a strict identifier pattern (`/^[a-zA-Z_][a-zA-Z0-9_]*$/`) and quoted with double quotes before interpolation. String interpolation of unvalidated table names into SQL is a SQL injection vector, even in Electron desktop apps where the attack surface is limited — malformed table names from bugs or corrupted config can still break queries silently.

**BAD**:
```typescript
const tables = ["characters", "scenes"];
for (const table of tables) {
  db.prepare(`DELETE FROM ${table} WHERE is_deleted = 1`).run();
}
```

**GOOD**:
```typescript
const VALID_TABLE_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const tables = ["characters", "scenes"];
for (const table of tables) {
  if (!VALID_TABLE_IDENTIFIER.test(table)) {
    logger.warn(`Invalid table name: ${table}`);
    continue;
  }
  db.prepare(`DELETE FROM "${table}" WHERE is_deleted = 1`).run();
}
```
