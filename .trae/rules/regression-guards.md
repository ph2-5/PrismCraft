# Regression Guards (from Bug Audit)

> These rules are **regression guards** — they prevent known bug patterns from reappearing.
> They are NOT discovery tools for future audits. Future audits must start from usage scenarios, not from this list.
>
> **Total: 80 rules | 8 categories**

## 目录

- [一、数据一致性（18 条）](#一数据一致性18-条) — 数据不丢、不脏、不冲突
- [二、异步安全（13 条）](#二异步安全13-条) — 并发、竞态、轮询、生命周期
- [三、错误处理（11 条）](#三错误处理11-条) — 错误不吞、不假成功、用户可理解
- [四、UI 健壮性（9 条）](#四ui-健壮性9-条) — 界面不崩、有反馈、无泄漏
- [五、工程质量（14 条）](#五工程质量14-条) — 依赖合规、构建安全、测试可靠
- [六、平台兼容（6 条）](#六平台兼容6-条) — IPC、Electron 环境、进程模型
- [七、用户安全防护（6 条）](#七用户安全防护6-条) — 破坏性操作需确认、数据清除需保护
- [八、系统安全（4 条）](#八系统安全4-条) — 沙箱隔离、并发保护、频率限制、缓存一致性

## 一、数据一致性（18 条）

> 核心关注：数据不丢、不脏、不冲突

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

### R42: Auto-Save Must Use Optimistic Locking, Not INSERT OR REPLACE
When auto-saving data that may be concurrently modified by the user, the SQL statement MUST use optimistic locking (`ON CONFLICT(id) DO UPDATE SET ... WHERE timestamp < excluded.timestamp`) instead of `INSERT OR REPLACE`. `INSERT OR REPLACE` unconditionally overwrites the existing row, destroying any newer changes the user made between the auto-save snapshot and the actual write. The optimistic lock ensures that only older data is overwritten by newer data. If the write reports `changes === 0`, a secondary query MUST check whether the existing row's timestamp is newer, and silently skip the write if so.

**BAD**:
```typescript
await safeRun(
  "INSERT OR REPLACE INTO auto_saves (id, type, data_json, timestamp) VALUES (?, ?, ?, ?)",
  [autoSave.id, autoSave.type, JSON.stringify(autoSave.data), ts],
);
```

**GOOD**:
```typescript
const result = await safeRun(
  "INSERT INTO auto_saves (id, type, data_json, timestamp) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data_json = excluded.data_json, timestamp = excluded.timestamp WHERE timestamp < excluded.timestamp",
  [autoSave.id, autoSave.type, JSON.stringify(autoSave.data), ts],
);
if (!result || result.changes === 0) {
  const existing = await safeQuery<{ timestamp: number }>(
    "SELECT timestamp FROM auto_saves WHERE id = ?",
    [autoSave.id],
  );
  if (existing.length > 0 && existing[0].timestamp > ts) {
    return;
  }
}
```

### R45: Entity Update Must Not Delete Unrelated Associated Data
When updating an entity's child collection (e.g., story beats), the update MUST NOT issue blanket DELETE statements on associated tables (video_tasks, generation_tasks, media_assets) for ALL existing children. Instead, it MUST compute the diff (children removed vs. children retained), and only delete associated data for children that are actually being removed. A blanket delete-then-reinsert pattern destroys data that should be preserved (e.g., video tasks for beats that still exist), causing data loss on every save.

**BAD**:
```typescript
if (story.beats !== undefined) {
  statements.push(
    { sql: "DELETE FROM video_tasks WHERE beat_id IN (SELECT id FROM story_beats WHERE story_id = ?)", params: [id] },
    { sql: "DELETE FROM story_beats WHERE story_id = ?", params: [id] },
  );
  for (const beat of story.beats) {
    statements.push(buildBeatInsert(beat.id, id, beat));
  }
}
```

**GOOD**:
```typescript
if (story.beats !== undefined) {
  const newBeatIds = new Set(story.beats.map(b => b.id).filter(Boolean));
  const existingBeats = await safeQuery("SELECT id FROM story_beats WHERE story_id = ?", [id]);
  const removedBeatIds = existingBeats.map(r => r.id).filter(bid => !newBeatIds.has(bid));

  for (const removedId of removedBeatIds) {
    statements.push(
      { sql: "DELETE FROM video_tasks WHERE beat_id = ?", params: [removedId] },
      { sql: "DELETE FROM generation_tasks WHERE beat_id = ?", params: [removedId] },
      { sql: "DELETE FROM media_assets WHERE bound_to_type = 'beat' AND bound_to_id = ?", params: [removedId] },
      { sql: "DELETE FROM story_beats WHERE id = ?", params: [removedId] },
    );
  }
  for (const beat of story.beats) {
    statements.push(buildBeatInsert(beat.id, id, beat));
  }
}
```

### R64: Route Navigation MUST NOT Clear Dirty State

When a user navigates between pages via route changes (React Router navigation), the application MUST NOT automatically clear dirty state (`markAllClean()`). Route navigation is a user-controlled action — clearing dirty state silently discards the reminder that there are unsaved changes. Only explicit user actions (successful save, user confirmation dialog) should clear dirty state. The `beforeunload` event (browser/tab close) is the only automatic guard, and it only prevents the close — it doesn't clear state.

**BAD** — Clears dirty state on route change:
```typescript
useEffect(() => {
  if (prevPathnameRef.current !== pathname) {
    markAllClean(); // Silently discards unsaved changes reminder
    prevPathnameRef.current = pathname;
  }
}, [pathname]);
```

**GOOD** — Only guard browser close, let explicit actions clear state:
```typescript
useEffect(() => {
  if (prevPathnameRef.current !== pathname) {
    prevPathnameRef.current = pathname;
    // Don't clear dirty state — let user save or confirm navigation
  }
}, [pathname]);
```

**Verification**: Search for `markAllClean()` or `markClean()` calls inside `useEffect` dependencies that include `pathname` or `location`. Any such call is a violation.

**Discovered in**: `BeforeUnloadGuard` called `markAllClean()` on every route change. Users editing a story, then clicking to another page and back, found their unsaved changes indicator gone — even though the changes were never saved.

### R65: Auto-Save MUST Check isDirty Before Saving

When an auto-save hook runs on a timer, it MUST check whether there are actual unsaved changes before executing the save operation. Without this check, the timer fires regardless of whether anything changed, causing unnecessary database writes, optimistic lock conflicts, and wasted I/O — especially when the user is viewing but not editing data.

**BAD** — Saves on every timer tick:
```typescript
useEffect(() => {
  const id = setInterval(() => {
    onSave(); // Fires even when nothing changed
  }, interval);
  return () => clearInterval(id);
}, [interval]);
```

**GOOD** — Checks dirty state before saving:
```typescript
useEffect(() => {
  const id = setInterval(() => {
    if (isDirty && !isDirty()) return; // Skip if no changes
    onSave();
  }, interval);
  return () => clearInterval(id);
}, [interval]);
```

**Verification**: Any auto-save implementation must accept an `isDirty` callback and check it before each save attempt.

**Discovered in**: Auto-save fired every 30 seconds even when the user was just viewing a story without making changes. This caused unnecessary database writes and occasional optimistic lock conflicts with manual saves.

### R66: Persistence Failure MUST Re-mark Dirty State

When a persistence operation (save, update, URL persistence) fails, the application MUST re-mark the corresponding entity's dirty state (`markDirty`). If dirty state is not re-marked, the auto-save system will skip the entity on the next cycle (because it appears clean), and the user will not be warned about unsaved changes when leaving — resulting in silent data loss.

**BAD** — Failure doesn't re-mark dirty:
```typescript
try {
  await storyService.update(id, data);
  markClean("story");
} catch (error) {
  showError("Save failed");
  // Dirty state was cleared before the save attempt → data loss
}
```

**GOOD** — Failure re-marks dirty:
```typescript
try {
  await storyService.update(id, data);
  markClean("story");
} catch (error) {
  markDirty("story"); // Ensure next auto-save cycle retries
  showError("Save failed");
}
```

**Verification**: Every `catch` block in a save/persistence operation must call `markDirty()` for the affected entity, unless the error is a validation error (no data to persist).

**Discovered in**: `useStoryPersistence` caught video URL save failures but didn't re-mark "story" as dirty. After a failed save, the auto-save system saw the story as clean and never retried. Users lost video URL associations when switching stories.

### R68: Page Reload MUST Restore UI State from Persistent Storage

When a Provider component loads data from persistent storage on mount (e.g., `storyService.getAll()`), it MUST restore the full UI state — not just the list but also the currently selected entity and its children. Loading only the list without restoring the selected entity leaves the UI in an inconsistent state: the list shows data but the detail panel is empty or shows stale data.

**BAD** — Loads list but doesn't restore selected entity:
```typescript
useEffect(() => {
  storyService.getAll().then((result) => {
    if (result.ok) {
      setStories(result.value);
      // currentStory, beats still at default → UI shows empty detail
    }
  });
}, []);
```

**GOOD** — Restores selected entity and children:
```typescript
const setCurrentStoryRef = useRef(setCurrentStory);
useEffect(() => { setCurrentStoryRef.current = setCurrentStory; }, [setCurrentStory]);
const setBeatsRef = useRef(setBeats);
useEffect(() => { setBeatsRef.current = setBeats; }, [setBeats]);
const markCleanRef = useRef(markClean);
useEffect(() => { markCleanRef.current = markClean; }, [markClean]);

useEffect(() => {
  let cancelled = false;
  storyService.getAll().then((result) => {
    if (!cancelled && result.ok && result.value.length > 0) {
      setStoriesRef.current(result.value);
      const firstStory = result.value[0];
      setCurrentStoryRef.current(firstStory, true);
      setBeatsRef.current(firstStory.beats || [], true);
      markCleanRef.current("story");
    }
  });
  return () => { cancelled = true; };
}, []);
```

**Verification**: For any Provider that loads a list from storage, check that the selected entity and its children are also restored. Search for `getAll()` or similar list-loading calls in Provider components and verify they also call `setCurrent*` and `markClean`.

**Discovered in**: `StoryProvider` loaded stories list on mount but didn't restore `currentStory` or `beats`. After page reload (Ctrl+R), the story list appeared in the sidebar but the detail panel was empty — no beats, no selected story. Users had to manually click a story to see its content.

### R69: Destructive Entity Deletion MUST Require Input Confirmation

When deleting an entity that causes irreversible cascade deletion (e.g., a story with all its beats, video tasks, and cached media), the confirmation dialog MUST require the user to type the entity name (or similar unique identifier) before the delete button becomes enabled. A simple "Are you sure?" dialog is insufficient for operations that permanently destroy multiple related records.

**BAD** — Simple confirm dialog for cascade delete:
```typescript
<Button variant="destructive" onClick={performDeleteStory}>
  确认删除
</Button>
```

**GOOD** — Input confirmation required:
```typescript
<Input
  value={deleteConfirmInput}
  onChange={(e) => setDeleteConfirmInput(e.target.value)}
  placeholder="请输入故事名称以确认删除"
/>
<Button variant="destructive" disabled={deleteConfirmInput !== story.title} onClick={performDeleteStory}>
  确认删除
</Button>
```

**Verification**: Search for `variant="destructive"` buttons in delete dialogs. For cascade-delete operations (story, project), verify an input confirmation step exists. For single-entity deletes (beat, character), a simple confirm dialog is acceptable.

**Discovered in**: Story delete dialog only had a simple "确认删除" button. Accidental clicks or keyboard shortcuts could permanently delete an entire project with all beats and video tasks.

### R72: Auto-Save MUST NOT Be Disabled by Business Data Absence

Auto-save conditions MUST NOT include checks for the existence of specific business data (e.g., `beats.length > 0`). If a user has unsaved changes to any field (title, description, settings), auto-save must be active regardless of whether child entities exist. Disabling auto-save based on child entity presence means changes to parent entity metadata are never persisted until a child is created.

**BAD** — Auto-save disabled when no beats exist:
```typescript
useAutoSave({
  enabled: autoSaveSettings.enabled && story.hasUnsavedChanges && story.beats.length > 0,
  ...
});
```

**GOOD** — Auto-save based only on dirty state:
```typescript
useAutoSave({
  enabled: autoSaveSettings.enabled && story.hasUnsavedChanges,
  ...
});
```

**Verification**: Search for `useAutoSave` calls and verify the `enabled` condition does not reference business data existence checks (`.length > 0`, `!!entity.id`, etc.). The only valid conditions are feature flags (`autoSaveSettings.enabled`) and dirty state (`hasUnsavedChanges`).

**Discovered in**: Story page auto-save was disabled when `story.beats.length === 0`. Users who edited story title/description without adding beats would lose their changes on crash — auto-save never triggered.

## 二、异步安全（13 条）

> 核心关注：并发、竞态、轮询、生命周期

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

### R38: Video URL Persistence MUST Complete Before Story Switch
When video URLs are updated in memory (from completed generation tasks), they MUST be persisted to the database via `await` before the user can switch to a different story. Fire-and-forget persistence (`.catch()` without `await`) creates a race condition: if the user switches stories before persistence completes, the URL is lost because the new story's state overwrites the in-memory beats. The `isVideoUrlPersisting` flag MUST be exposed to the UI layer, and story switching MUST be blocked while persistence is in flight.

**BAD**:
```typescript
storyService.updateBeatMediaUrls(allPersistData).catch((e) => {
  errorLogger.warn("自动保存视频URL失败", e);
});
```

**GOOD**:
```typescript
setIsVideoUrlPersisting(true);
try {
  await storyService.updateBeatMediaUrls(allPersistData);
} catch (e) {
  errorLogger.warn("自动保存视频URL失败", e);
  showErrorRef.current("自动保存失败", "视频URL自动保存到数据库失败，请手动保存");
} finally {
  setIsVideoUrlPersisting(false);
}

// In switchStory:
if (story.isVideoUrlPersisting) {
  showWarning("请稍候", "视频URL正在保存中，请等待保存完成后再切换故事");
  return;
}
```

### R46: Polling Engine State Flags Must Reset in Correct Order with Top-Level Catch
When a polling engine uses `isPollingScheduled` and `pollingInProgress` flags to prevent concurrent scheduling, the `finally` block MUST reset `pollingInProgress` BEFORE `isPollingScheduled`. If `isPollingScheduled` is reset first, a concurrent call to `schedulePolling()` can pass the guard check (`isPollingScheduled === false`) while `pollingInProgress` is still true, leading to duplicate scheduling. Additionally, the polling function MUST have a top-level `catch` block to prevent unhandled exceptions from bypassing the `finally` block, which would leave both flags stuck at `true` and permanently stop polling.

**BAD**:
```typescript
const pollTasks = async () => {
  pollingState.pollingInProgress = true;
  try {
    // ... polling logic (may throw unexpectedly)
  } finally {
    pollingState.isPollingScheduled = false;  // Reset scheduled first
    pollingState.pollingInProgress = false;    // Reset in-progress second — RACE CONDITION
  }
  if (shouldReschedule) schedulePolling();     // Can enter while pollingInProgress is still true
};
```

**GOOD**:
```typescript
const pollTasks = async () => {
  pollingState.pollingInProgress = true;
  let shouldReschedule = false;
  try {
    // ... polling logic
    shouldReschedule = true;
  } catch (e) {
    errorLogger.warn("[PollingEngine] Unexpected error in poll cycle", e);  // Prevent unhandled exception
  } finally {
    pollingState.pollingInProgress = false;    // Reset in-progress FIRST
    pollingState.isPollingScheduled = false;    // Reset scheduled SECOND
  }
  if (shouldReschedule && !abortSignal.aborted) schedulePolling();
};
```

### R48: useEffect Async Operations MUST Have Unmount Protection
When a `useEffect` contains an async operation (fetch, API call, database query) that updates React state, the effect MUST use a `cancelled` flag or `AbortController` to prevent state updates after component unmount. Without this protection, async callbacks can call `setState` on unmounted components, causing React warnings and potential memory leaks. The cleanup function MUST set the cancellation flag or abort the controller.

**BAD**:
```typescript
useEffect(() => {
  loadConfig().then((config) => {
    setAvailableModels(config.models);
    setIsLoading(false);
  });
}, [capability]);
```

**GOOD**:
```typescript
useEffect(() => {
  let cancelled = false;
  loadConfig().then((config) => {
    if (cancelled) return;
    setAvailableModels(config.models);
    setIsLoading(false);
  }).catch((error) => {
    if (cancelled) return;
    setIsLoading(false);
    setLoadError(true);
  });
  return () => { cancelled = true; };
}, [capability]);
```

### R62: Page-Level Components MUST NOT Call Global Store cleanup()

When a Zustand store is shared across multiple pages (e.g., `useVideoTaskStore` used by both quick-generate and story pages), page-level components MUST NOT call `store.cleanup()` in their `useEffect` cleanup. The `cleanup()` function stops all polling engines and resets `isInitialized: false`, which breaks task tracking for ALL pages — not just the one being unmounted.

The lifecycle of global shared stores MUST be managed by app-level components (e.g., `VideoTaskManagerInitializer` in the root layout) that only unmount when the entire app closes.

**BAD** — Page component calls cleanup on unmount:
```typescript
useEffect(() => {
  initialize();
  return () => {
    useVideoTaskStore.getState().cleanup(); // Stops ALL polling, resets isInitialized
  };
}, [initialize]);
```

**GOOD** — Only initialize, let app-level component handle cleanup:
```typescript
useEffect(() => {
  initialize();
}, [initialize]);
```

**Verification**: Search for `\.cleanup\(\)` calls outside of `VideoTaskManagerInitializer` and test files. Any call in page-level components is a violation.

**Discovered in**: Quick-generate page called `useVideoTaskStore.cleanup()` on unmount, which stopped the polling engine. After navigating away from quick-generate, all video tasks (including story mode tasks) stopped receiving status updates.

### R67: Concurrency Guard Ref MUST Be Set After Validation

When using a `savingRef` (or similar boolean ref) to prevent concurrent save operations, the ref MUST be set to `true` AFTER input validation passes, not before. If set before validation, an invalid input (e.g., empty name) causes an early return while `savingRef` remains `true` — permanently blocking all future save attempts until the component remounts.

**BAD** — Sets ref before validation:
```typescript
const handleSave = async () => {
  if (savingRef.current) return;
  savingRef.current = true; // Set before validation
  const trimmedName = (entity.name || "").trim();
  if (!trimmedName) {
    showError("Name required");
    return; // savingRef stays true → save permanently blocked
  }
  // ... actual save
  savingRef.current = false;
};
```

**GOOD** — Sets ref after validation:
```typescript
const handleSave = async () => {
  if (savingRef.current) return;
  const trimmedName = (entity.name || "").trim();
  if (!trimmedName) {
    showError("Name required");
    return; // savingRef still false → can retry
  }
  savingRef.current = true; // Set after validation passes
  try {
    // ... actual save
  } finally {
    savingRef.current = false;
  }
};
```

**Verification**: In any function using a concurrency guard ref, the `ref.current = true` assignment must appear AFTER all early-return validation checks. The `ref.current = false` must be in a `finally` block.

**Discovered in**: `useEntityCRUD` set `savingRef.current = true` before checking if the entity name was empty. When the name was empty, the function returned early without resetting the ref. The save button became permanently disabled — the only recovery was to reload the page.

## 三、错误处理（11 条）

> 核心关注：错误不吞、不假成功、用户可理解

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

### R47: Catch Blocks MUST NOT Silently Swallow Errors
When a `catch` block catches an error, it MUST either (1) log the error via `errorLogger.warn`/`errorLogger.error`, (2) propagate the error to the caller, or (3) show user feedback via `emitToast`. Empty `catch {}` blocks with no logging or notification are "安慰剂" error handling — they make failures invisible to both developers and users, making debugging impossible. The only exception is cleanup operations (e.g., `URL.revokeObjectURL`) where failure is inconsequential. Additionally, production code MUST use `errorLogger` instead of `console.warn`/`console.error` — console methods bypass the structured logging system and cannot be filtered or persisted in production.

**BAD**:
```typescript
try {
  const config = JSON.parse(rawConfig);
} catch {
  return defaultConfig;
}
```

**BAD** — console.warn bypasses structured logging:
```typescript
catch (e) {
  console.warn("[Module] 配置 JSON 解析失败", e);
  return defaultConfig;
}
```

**GOOD**:
```typescript
try {
  const config = JSON.parse(rawConfig);
} catch (e) {
  errorLogger.warn("[Module] 配置 JSON 解析失败，使用默认配置", e);
  return defaultConfig;
}
```

### R50: Floating Promises MUST Have .catch() Handlers
When a Promise chain uses `.then()` without a corresponding `.catch()`, any rejection becomes an unhandled promise rejection. This is especially dangerous in React components where the rejection may occur after unmount, causing both silent failures and potential memory leaks. Every `.then()` chain MUST end with `.catch()` that either logs the error or provides user feedback.

**BAD**:
```typescript
container.referenceEngine.then((engine) => {
  const result = engine.validateReference(beat, allShots, reference);
  setValidation(result);
});
```

**GOOD**:
```typescript
container.referenceEngine.then((engine) => {
  if (cancelled) return;
  const result = engine.validateReference(beat, allShots, reference);
  setValidation(result);
}).catch((err: unknown) => {
  if (!cancelled) {
    errorLogger.warn("[Component] 参考验证失败", err);
  }
});
```

### R53: Result Type Error Paths MUST Use err() Not ok()
When a function returns `Result<T>`, failure paths MUST return `err(...)` rather than `ok({ passed: false, ... })`. Wrapping a failure in `ok()` is a "安慰剂" (placebo) error pattern — callers checking `result.ok` will believe the operation succeeded, and downstream code will try to access `result.value` on a failure-shaped object.

**BAD**:
```typescript
catch (_e) {
  return ok({
    passed: false,
    characterScores: elements.map((el) => ({
      elementId: el.id,
      elementName: el.name,
      score: 0.5,
      issues: ["检查过程出错"],
    })),
    overallScore: 0.5,
    recommendation: "adjust",
  });
}
```

**GOOD**:
```typescript
catch (e) {
  return err(new AppError("CONSISTENCY_CHECK_ERROR", "检查过程出错", e));
}
```

**Discovered in**: `consistency-check-service.ts` — catch block and analysis failure both returned `ok()` with `passed: false`, hiding real errors from callers.

### R44: User-Facing Error Messages Must Use mapUserFacingError
When displaying error messages to users via toast, dialog, or inline text, the code MUST use `mapUserFacingError(error)` from `@/shared/utils/user-facing-error` instead of raw `extractErrorMessage(error)` or `e instanceof Error ? e.message : "未知错误"`. Raw error messages expose technical details (IPC channel names, error codes, English text) that are meaningless or alarming to users. `mapUserFacingError` translates error categories (rate_limit, timeout, network, auth, database_busy, etc.) and IPC rate limit patterns into concise, actionable Chinese messages.

**BAD**:
```typescript
showError("保存失败", `数据库持久化失败: ${extractErrorMessage(err)}，请重试`);
showError("删除失败", e instanceof Error ? e.message : "未知错误");
```

**GOOD**:
```typescript
showError("保存失败", mapUserFacingError(err));
showError("删除失败", mapUserFacingError(e));
```

### R56: User-Facing Messages MUST Use Shared Message Constants
User-facing strings (toast messages, dialog titles, error descriptions, button labels, placeholders, section headings) MUST use the `t()` function from `@/shared/constants/messages` instead of hardcoded Chinese strings. This ensures consistency across the UI and makes future internationalization feasible.

**BAD**:
```typescript
success("保存成功", "分镜项目已更新");
error("删除失败", err instanceof Error ? err.message : "未知错误");
const confirmed = await confirm({ title: "确认删除", confirmText: "删除" });
<DialogTitle>同步设置</DialogTitle>
<Label>启用同步</Label>
<Button>保存设置</Button>
```

**GOOD**:
```typescript
success(t("success.saved"), t("success.beatDeleted"));
showError(t("error.deleteFailed"), mapUserFacingError(err));
const confirmed = await confirm(t("confirm.deleteTitle"), t("confirm.delete"));
<DialogTitle>{t("sync.settingsTitle")}</DialogTitle>
<Label>{t("sync.enableSync")}</Label>
<Button>{t("sync.saveSettings")}</Button>
```

**Message key categories** (in `src/shared/constants/messages.ts`, 840+ keys):
- `common.*` — Save, delete, cancel, retry, loading, upload, regenerate, generate, etc.
- `error.*` — All error messages (save, delete, upload, generate, network, copy, openLink, etc.)
- `success.*` — All success messages (saved, deleted, generated, copied, etc.)
- `confirm.*` — Confirmation dialog titles and content
- `warning.*` — Warning messages
- `video.*` — Video task lifecycle messages
- `image.*` — Image generation messages
- `story.*` — Story editing messages
- `batch.*` — Batch operation messages
- `plugin.*` — Plugin management and creator messages
- `asset.*` — Asset library, export/import, batch operations messages
- `provider.*` — Provider management, API config, connection test messages
- `capability.*` — Capability type names (text/image/analysis/video)
- `mapping.*` — Function mapping configuration messages
- `connection.*` — Connection test messages
- `sidebar.*` — Sidebar navigation labels
- `onboarding.*` — Onboarding step labels and descriptions
- `errorBoundary.*` — Error boundary messages
- `config.*` — Config check banner messages
- `sync.*` — Sync settings, conflict resolution, status indicator messages
- `search.*` — Search dialog messages
- `quickGenerate.*` — Quick generate panel messages
- `page.*` — Page titles and descriptions
- `settings.*` — Settings page labels
- `home.*` — Home page content
- `beat.*` — Beat detail/editor/overview card messages
- `element.*` — Element binding panel messages
- `shot.*` — Shot generation panel messages
- `keyframe.*` — Keyframe panel messages
- `refVideo.*` — Reference video uploader messages
- `prompt.*` — Prompt editor/floating ball messages
- `template.*` — Template manager dialog messages
- `assetPicker.*` — Asset picker dialog messages
- `version.*` — Version dialog messages
- `task.*` — Video task detail/tracking/filter/card messages
- `model.*` — Model selector messages
- `outfit.*` — Outfit dialog messages
- `scene.*` / `character.*` — List item fallback text and editor messages
- `dialog.*` — Shared dialog labels

**Discovered in**: ~19000+ hardcoded Chinese strings across 100+ files. Full migration completed: core toast/confirm/showError → presentation components (buttons, labels, titles, placeholders) → page components → module presentation components → shared components. ESLint R56 rule enforces t() usage in success/error/showError calls. Only AI prompt templates, error-codes business data, and log messages remain in Chinese (by design).

### R63: API Status Must Be Validated Against Actual Resource Existence

When mapping an external API status to an internal task status, the mapping function MUST check whether the actual resource (e.g., videoUrl) exists **as a confirming signal only when the API status maps to completed**. When the API returns completed but no videoUrl is available, the status MUST be downgraded to generating — marking a task as completed without the actual resource is a "false completion". Conversely, videoUrl alone MUST NOT override a non-completed API status.

**BAD** — videoUrl overrides API status unconditionally:
```typescript
function mapApiStatus(apiStatus: string, videoUrl?: string): VideoTaskStatus {
  if (videoUrl) return "completed"; // Overrides API status blindly
  if (apiStatus === "success") return "completed";
  if (apiStatus === "failed") return "failed";
  return "generating";
}
```

**GOOD** — videoUrl confirms completed, missing videoUrl downgrades:
```typescript
function mapApiStatus(apiStatus: string, videoUrl?: string): VideoTaskStatus {
  if (apiStatus === "success") return videoUrl ? "completed" : "generating";
  if (apiStatus === "failed") return "failed";
  return "generating";
}
```

**Verification**: Any `mapApiStatus` or similar status mapping function must accept and check the resource URL parameter as a confirming signal for completed status only. When API says completed but resource is missing, status must be downgraded. Callers must pass the resource URL when available.

**Discovered in**: Video tasks showed as "completed" in task manager even though the video URL was not available. The API returned a completed status, but the video had not actually been generated. Users saw completed tasks with no playable video.

## 四、UI 健壮性（9 条）

> 核心关注：界面不崩、有反馈、无泄漏

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

## 五、工程质量（14 条）

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

## 六、平台兼容（6 条）

> 核心关注：IPC、Electron 环境、进程模型

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

## 七、用户安全防护（6 条）

> 核心关注：破坏性操作需确认、数据清除需保护、不可逆操作需二次验证

### R70: Irreversible Data Clearing MUST Require Confirmation

When a UI action permanently deletes user data (e.g., auto-save recovery records, cached data, session state), the action MUST require a second confirmation. A single button click must never trigger irreversible data destruction. The confirmation dialog MUST clearly state the operation is permanent and cannot be undone.

**BAD** — Single click deletes recovery data:
```typescript
const handleDismiss = async () => {
  for (const save of autoSaves) {
    await deleteAutoSave(save.id);
  }
  setOpen(false);
};
```

**GOOD** — Confirmation before clearing:
```typescript
const handleDismiss = async () => {
  const confirmed = await confirm(
    t("crash.dismissConfirmMsg"),
    t("crash.dismissConfirmTitle")
  );
  if (!confirmed) return;
  for (const save of autoSaves) {
    await deleteAutoSave(save.id);
  }
  setOpen(false);
};
```

**Verification**: Search for functions that call `deleteAutoSave`, `clearAutoSaves`, or similar bulk-delete operations. Verify each is guarded by a `confirm()` call or equivalent user confirmation step.

**Discovered in**: CrashRecoveryDialog's "忽略" button directly deleted all auto-save records without confirmation. Users clicking "忽略" to temporarily dismiss the dialog permanently lost their recovery data.

### R71: Route Navigation MUST Intercept When Dirty State Exists

When a user has unsaved changes (dirty state), the application MUST intercept all navigation events — including browser back/forward buttons, not just programmatic navigation via `guardedPush`. Using `useBlocker` from react-router-dom ensures that browser-initiated navigation is also caught and confirmed.

**BAD** — Only programmatic navigation is guarded:
```typescript
const guardedPush = (href: string) => {
  if (dirtyCount > 0) { confirm(...); }
  navigate(href);
};
// Browser back button bypasses this guard entirely
```

**GOOD** — Browser navigation also intercepted:
```typescript
const blocker = useBlocker(dirtyCount > 0);
useEffect(() => {
  if (blocker.state === "blocked") {
    confirm(t("nav.unsavedChangesConfirm"), t("nav.unsavedChanges")).then((ok) => {
      if (ok) { markAllClean(); blocker.proceed?.(); }
      else { blocker.reset?.(); }
    });
  }
}, [blocker]);
```

**Verification**: In any page that uses `useNavigationGuard`, verify that `useBlocker` is also active. Test by making changes, then pressing the browser back button — a confirmation dialog should appear.

**Discovered in**: `useNavigationGuard` only provided `guardedPush` for programmatic navigation. Pressing the browser back button with unsaved changes silently navigated away, potentially losing data.

### R73: Cross-Origin Resource Download MUST Use fetch+blob

When downloading resources from cross-origin URLs (e.g., AI provider video URLs), the `<a download="filename">` approach does NOT work — browsers ignore the `download` attribute for cross-origin links and instead open the resource in a new tab. Always use `fetch()` + `Blob` + `URL.createObjectURL()` for cross-origin downloads.

**BAD** — Cross-origin download fails silently:
```typescript
const a = document.createElement("a");
a.href = crossOriginUrl;
a.download = "video.mp4";
a.click();
// Browser opens video in new tab instead of downloading
```

**GOOD** — fetch + blob approach:
```typescript
const response = await fetch(crossOriginUrl);
const blob = await response.blob();
const blobUrl = URL.createObjectURL(blob);
const a = document.createElement("a");
a.href = blobUrl;
a.download = "video.mp4";
document.body.appendChild(a);
a.click();
document.body.removeChild(a);
URL.revokeObjectURL(blobUrl);
```

**Verification**: Search for `a.download` or `createElement("a")` patterns in download handlers. If the URL is potentially cross-origin, verify it uses fetch+blob. Add a fallback error message for fetch failures.

**Discovered in**: Beat detail page video download used `<a download>` for AI provider URLs. Clicking "下载" opened the video in a new browser tab instead of downloading it.

### R74: Error Recovery MUST NOT Remove Retry Option Based on Count

Error boundary or error recovery UI MUST NOT remove the retry button based on error count. Even after multiple failures, the user should always have the option to retry. Removing the retry button forces the user to reload the page (losing current state) or reset (losing all session data). Instead, show a warning hint after multiple failures but keep the retry button available.

**BAD** — Retry button removed after 3 failures:
```typescript
{errorCount < 3 ? (
  <Button onClick={handleRetry}>重试</Button>
) : (
  <p>多次重试失败</p>
)}
```

**GOOD** — Retry always available with contextual hint:
```typescript
<Button onClick={handleRetry}>
  {errorCount < 3 ? "重试" : "再试一次"}
</Button>
{errorCount >= 3 && (
  <p className="text-sm text-muted-foreground">多次检测到错误，如果问题持续存在，请尝试刷新页面</p>
)}
```

**Verification**: Search for `errorCount` or retry-count-based conditional rendering in error boundary components. Verify the retry action is always available regardless of error count.

**Discovered in**: ErrorBoundary removed the retry button after 3 failures, showing only a text message. Users had no way to retry without reloading or resetting.

### R75: Session Clearing MUST Only Delete Application-Prefixed Keys

When a "reset" or "recover" operation clears session/local storage, it MUST only delete keys with the application prefix (e.g., `ai-animation-`). Using `sessionStorage.clear()` or `localStorage.clear()` destroys ALL stored data including data from other applications sharing the same origin, which is destructive and unexpected.

**BAD** — Clears all session data:
```typescript
sessionStorage.clear();
```

**GOOD** — Only clears application-prefixed keys:
```typescript
const keysToRemove: string[] = [];
for (let i = 0; i < sessionStorage.length; i++) {
  const key = sessionStorage.key(i);
  if (key?.startsWith("ai-animation-")) {
    keysToRemove.push(key);
  }
}
keysToRemove.forEach((key) => sessionStorage.removeItem(key));
```

**Verification**: Search for `sessionStorage.clear()` and `localStorage.clear()` calls. Replace with prefix-scoped removal. The only acceptable use of `.clear()` is in test teardown.

**Discovered in**: ErrorBoundary's "重置并恢复" called `sessionStorage.clear()`, destroying all session data including non-application data.

### R76: Toast Deduplication MUST Include Message Content

When deduplicating toast notifications, the dedup key MUST include the message content, not just the type and title. Deduplicating by type+title alone means multiple different errors with the same title (e.g., "生成失败" for different beats) are merged into a single "(3次)" notification, hiding which specific items failed.

**BAD** — Dedup by type+title only:
```typescript
const dedupKey = `${toast.type}-${toast.title}`;
```

**GOOD** — Dedup includes message:
```typescript
const dedupKey = `${toast.type}-${toast.title}-${toast.message || ""}`;
```

**Verification**: Search for toast dedup logic and verify the dedup key includes the message field. Test by triggering multiple errors with the same title but different messages — each should appear as a separate toast.

**Discovered in**: Toast deduplication merged all "生成失败" toasts into one, showing "(3次)" without indicating which 3 beats failed. Users couldn't identify which specific operations failed.

### R77: Critical Updates MUST Use Optimistic Locking

When updating records that may be concurrently modified (e.g., from multiple tabs or windows), the update operation MUST use the `version` column for optimistic locking. Without this, last-write-wins silently overwrites earlier changes, causing data loss.

**BAD** — Blind update, no version check:
```typescript
db.run("UPDATE story_beats SET title = ? WHERE id = ?", [title, id]);
```

**GOOD** — Version-protected update:
```typescript
const result = db.run("UPDATE story_beats SET title = ?, version = version + 1 WHERE id = ? AND version = ?", [title, id, version]);
if (result.changes === 0) throw new VersionConflictError("story_beats", id, version);
```

**Verification**: Search for `updateStory`, `updateCharacter`, `updateElement`, `updateVideoTask` calls and verify they pass `version` when available. Check that `VersionConflictError` is caught and surfaced to the user via `mapUserFacingError`.

**Discovered in**: Concurrent tab edits silently overwrote each other's changes. The `version` column existed in schema but was never used in production code.

## 八、系统安全（4 条）

> 核心关注：沙箱隔离、并发保护、频率限制、缓存一致性

### R78: Code Plugin Sandbox MUST Prevent Prototype Chain Escape

When executing user-provided JavaScript code in a VM sandbox, the sandbox MUST prevent prototype chain escape attacks. Without protection, plugins can access `process`, `require`, and other dangerous globals through `this.constructor.constructor('return process')()` or similar chains.

**BAD** — Naive sandbox without escape prevention:
```typescript
const sandbox = { console, module, exports };
vm.runInContext(code, vm.createContext(sandbox));
// Plugin can escape: this.constructor.constructor('return process')()
```

**GOOD** — Multi-layer sandbox hardening:
```typescript
// 1. Wrap in IIFE with 'use strict'
const code = `(function() { 'use strict'; ${rawCode} })();`;
// 2. Pre-scan for escape patterns
if (/__proto__|getPrototypeOf|Reflect/.test(rawCode)) reject();
// 3. Freeze prototypes
Object.freeze(Object.prototype);
// 4. Disable Function constructor
sandbox.Function = undefined;
// 5. Disable Proxy, Reflect, Promise, Symbol
sandbox.Proxy = undefined; sandbox.Reflect = undefined;
```

**Verification**: Attempt to load a plugin containing `this.constructor.constructor('return process')()` — it must be rejected or fail at runtime.

**Discovered in**: Code plugin sandbox allowed prototype chain escape, giving plugins access to Node.js `process` and `require`.

### R79: IPC Channels MUST Be Registered Before Use

All IPC channels MUST be registered in `preload.ts` `IPC_PERMISSIONS` before use. Unregistered channels MUST be blocked and logged. This prevents typos in channel names and ensures all IPC communication is auditable. In a local-first app, the renderer loads trusted local code, so rate limiting is unnecessary — channel registration is sufficient.

**BAD** — Unregistered channel allowed:
```typescript
return ipcRenderer.invoke("secure-config:resovle", providerId); // Typo, silently fails
```

**GOOD** — Registered channel with permission check:
```typescript
const IPC_PERMISSIONS: Record<string, string[]> = {
  SECURE: ["secure-config:resolve"],
  // ...
};
function checkPermission(channel: string): { allowed: boolean; level: string } {
  for (const [level, channels] of Object.entries(IPC_PERMISSIONS)) {
    if (channels.includes(channel)) return { allowed: true, level };
  }
  return { allowed: false, level: "UNKNOWN" };
}
```

**Verification**: Call an unregistered IPC channel — it must be blocked and a `log:security` event must be sent.

**Discovered in**: Unregistered IPC channels could be called without any audit trail or permission check.

### R80: Plugin Hot-Reload MUST Invalidate Frontend Caches

When plugins are added, removed, or reloaded at runtime, all frontend caches derived from plugin data (detection rules, provider templates, model profiles) MUST be invalidated and reloaded. Stale caches cause new plugins to be invisible until the user manually refreshes the page.

**BAD** — Cache loaded once, never refreshed:
```typescript
useEffect(() => { loadPluginDetectionRules(); }, []); // Only on mount
```

**GOOD** — Cache refreshed after plugin changes:
```typescript
const handleReload = async () => {
  await fetch("/api/plugins/reload-code");
  await loadPluginDetectionRules();  // Refresh detection rules
  await loadPluginTemplates();       // Refresh provider templates
  await loadModelProfilesFromServer(); // Refresh model profiles
};
```

**Verification**: Add a new plugin via the plugin manager, then check if the API config panel shows the new provider template without requiring a page refresh.

**Discovered in**: After adding a new plugin through the plugin manager, the API config panel didn't show the new provider until the user closed and reopened the settings page.
