# Regression Guards (from Bug Audit)

> **📋 本文件已拆分为按分类独立文件，便于 AI 按需加载上下文：**
>
> | 分类 | 文件 |
> |------|------|
> | 索引（~500 tokens） | [regression/index.md](regression/index.md) |
> | 数据一致性 | [regression/data-consistency.md](regression/data-consistency.md) |
> | 异步安全 | [regression/async-safety.md](regression/async-safety.md) |
> | 错误处理 | [regression/error-handling.md](regression/error-handling.md) |
> | UI 健壮性 | [regression/ui-robustness.md](regression/ui-robustness.md) |
> | 工程质量 | [regression/engineering.md](regression/engineering.md) |
> | 平台兼容 | [regression/platform.md](regression/platform.md) |
> | 用户安全防护 | [regression/user-safety.md](regression/user-safety.md) |
> | 系统安全 | [regression/system-security.md](regression/system-security.md) |
>
> 本文件保留作为完整参考，AI 工具应优先加载分类文件以节省上下文。

> These rules are **regression guards** — they prevent known bug patterns from reappearing.
> They are NOT discovery tools for future audits. Future audits must start from usage scenarios, not from this list.
>
> **Total: 142 rules | 8 categories**

## 目录

- [一、数据一致性（25 条）](#一数据一致性25-条) — 数据不丢、不脏、不冲突
- [二、异步安全（14 条）](#二异步安全14-条) — 并发、竞态、轮询、生命周期
- [三、错误处理（12 条）](#三错误处理12-条) — 错误不吞、不假成功、用户可理解
- [四、UI 健壮性（9 条）](#四ui-健壮性9-条) — 界面不崩、有反馈、无泄漏
- [五、工程质量（17 条）](#五工程质量17-条) — 依赖合规、构建安全、测试可靠
- [六、平台兼容（6 条）](#六平台兼容6-条) — IPC、Electron 环境、进程模型
- [七、用户安全防护（7 条）](#七用户安全防护7-条) — 破坏性操作需确认、数据清除需保护
- [八、系统安全（7 条）](#八系统安全7-条) — 沙箱隔离、并发保护、资源生命周期、DOM 安全

## 一、数据一致性（25 条）

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

## 二、异步安全（14 条）

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

### R85: Network Errors MUST NOT Increment Poll Failure Count

When a polling engine tracks consecutive failures to determine task timeout, network errors (ECONNREFUSED, ETIMEDOUT, ENOTFOUND, EPIPE, EAI_AGAIN, fetch failures, ERR_NETWORK, ERR_CONNECTION, socket hang up, etc.) MUST NOT increment the failure counter. Network errors are transient infrastructure issues unrelated to the task itself — the task may still be generating successfully on the provider side. Only API-level errors (provider rejected, invalid parameters, business logic errors) should increment the failure count. Incrementing on network errors causes false "timeout" markings that mislead users into thinking their task failed when it's still processing.

**BAD** — All errors increment failure count:
```typescript
const handlePollException = (task: VideoTask, error: unknown) => {
  const failCount = task.pollFailureCount + 1;
  if (failCount >= MAX_POLL_FAILURES) {
    transitionToTimeout(task);
  }
};
```

**GOOD** — Network errors skip, only API errors increment:
```typescript
const NETWORK_ERROR_PATTERNS = [
  /ECONNREFUSED/i, /ECONNRESET/i, /ETIMEDOUT/i, /ENOTFOUND/i,
  /EPIPE/i, /EAI_AGAIN/i, /Failed to fetch/i, /NetworkError/i,
  /Network request failed/i, /fetch.*failed/i, /abort/i,
  /ERR_NETWORK/i, /ERR_CONNECTION/i, /socket hang up/i, /connect ETIMEDOUT/i,
];

function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError && error.message.includes("fetch")) return true;
  if (error instanceof Error) {
    return NETWORK_ERROR_PATTERNS.some((p) => p.test(error.message));
  }
  return false;
}

const handlePollException = (task: VideoTask, error: unknown) => {
  if (isNetworkError(error)) {
    errorLogger.warn("[Polling] Network error, will retry next cycle", error);
    return; // Don't increment pollFailureCount
  }
  const failCount = task.pollFailureCount + 1;
  if (failCount >= MAX_POLL_FAILURES) {
    transitionToTimeout(task);
  }
};
```

**Verification**: Search for `pollFailureCount` increment locations. Verify each increment is guarded by a network error check that skips the increment. Search for `isNetworkError` or equivalent pattern-matching function.

**Discovered in**: Video task polling incremented `pollFailureCount` on every error including network timeouts. Users on unstable connections saw tasks marked as "failed" even though the video was still generating on the provider side.

## 三、错误处理（12 条）

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

**Message key categories** (in `src/shared/constants/messages.ts`, 1850+键):
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

### R86: Timeout and Failed States MUST Be Distinguished in Task Status Machine

When a long-running task (e.g., video generation) exceeds a polling timeout threshold, the task MUST be transitioned to a dedicated `timeout` status rather than `failed`. Timeout indicates "we stopped checking, but the task may still be processing on the provider side", while `failed` indicates "the provider confirmed the task failed". These are fundamentally different user situations:

- **timeout**: The user should be advised that the video may still be generating, and offered a "manual recovery" option to check again later.
- **failed**: The user should be advised that the generation definitively failed, and offered a "retry" option.

Both `timeout` and `failed` are recoverable states (`isRecoverable()` returns true), but the user-facing messaging and recovery guidance must differ. All code that queries failed tasks (recovery, cleanup, statistics) MUST include both `failed` and `timeout` statuses.

**BAD** — Timeout marks task as failed:
```typescript
if (isTimedOut(task)) {
  TaskMachine.transition(task, "failed", { error: "任务超时" });
  emitToast("error", "视频生成失败", "任务超时");
}
```

**GOOD** — Timeout uses dedicated status with appropriate messaging:
```typescript
if (isTimedOut(task)) {
  TaskMachine.transition(task, "timeout", { error: "任务超时" });
  emitToast("warning", t("video.timeoutTitle"), t("task.timeoutMayStillGenerating"));
}

// Recovery queries include both states:
const [failedTasks, timeoutTasks] = await Promise.all([
  container.videoTaskStorage.getVideoTasksByStatus("failed"),
  container.videoTaskStorage.getVideoTasksByStatus("timeout"),
]);
return [...failedTasks, ...timeoutTasks];
```

**Verification**: Search for `status === "failed"` in task-related code. Verify each location also handles `timeout` where appropriate (recovery, cleanup, statistics, UI display). Search for `getFailedTasks` and verify it includes timeout tasks. Search for `clearFailedTasks` and verify it clears both states.

**Discovered in**: Video task timeout directly marked tasks as `failed`, making it impossible to distinguish between "provider confirmed failure" and "we stopped polling". Users couldn't tell whether their video might still be generating, and recovery guidance was misleading.

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

## 五、工程质量（17 条）

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

## 七、用户安全防护（7 条）

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

### R89: Non-null Assertion MUST NOT Be Used on Possibly-Undefined Nested Properties

When accessing nested properties from async operations or external data sources (e.g., `beat.framePair.firstFrame`), non-null assertion (`!`) MUST NOT be used. Use optional chaining (`?.`) with explicit null checks instead. Non-null assertions on properties whose parent may be `undefined` cause runtime crashes when the data is missing.

**BAD** — Non-null assertion on possibly-undefined chain:
```typescript
const framePair = beat.framePair!;
const firstFrame = framePair.firstFrame!;
const imageUrl = firstFrame.imageUrl;
```

**GOOD** — Optional chaining with explicit check:
```typescript
const framePair = beat?.framePair;
const firstFrame = framePair?.firstFrame;
if (!beat || !firstFrame?.imageUrl) {
  showError(t("story.cannotGenerateVideo"));
  return;
}
const imageUrl = firstFrame.imageUrl;
```

**Verification**: Search for patterns like `obj.prop!.subProp` or `obj.prop!.method()` where `prop` type includes `undefined`. All such patterns must use `?.` + explicit check instead.

**Discovered in**: `useVideoGenerator` used `beat.framePair!` and `framePair.firstFrame!`, causing runtime crash when framePair or firstFrame was missing.

### R90: Providers That Don't Support Reference Images MUST Convert Image URLs to Text Prompts

When a generation pipeline needs to pass a reference image (e.g., keyframe URL) but the target provider/model doesn't support reference image input, the image URL MUST be included as text in the prompt (e.g., `[参考预览图 URL]`), NOT silently discarded. Silently discarding the reference image means the AI has zero awareness of the visual content it should reference.

**注意**：对于 `bake_into_first` 模式的视频模型（如 Seedance pro），参考图信息应通过首帧融入架构传递（首帧生成时传 `ref_image` 给图片模型），而非通过视频 API 传递。`buildReferenceEnhancedPrompt` 在首帧 prompt 中注入参考图指令是辅助手段。

**BAD** — Reference image silently discarded:
```typescript
const effectiveRefUrl = supportsRef ? keyframeUrl : undefined;
// keyframeUrl is completely lost for non-supporting providers
```

**GOOD** — Fallback to text prompt:
```typescript
const effectiveRefUrl = supportsRef ? keyframeUrl : undefined;
if (!supportsRef && keyframeUrl) {
  promptParts.push(`[参考预览图 ${keyframeUrl}]`);
}
```

**Verification**: In `generateFramePair` and similar functions, when `referenceImageUrl` is set to `undefined` due to model limitations, verify there is a corresponding text prompt fallback that includes the URL. For bake_into_first models, also verify the reference image URL is passed to image generation via `ref_image`.

**Discovered in**: `api-gateway.ts` `generateFramePair` silently discarded `keyframeUrl` for providers that don't support reference images. The AI had no way to know what the preview image looked like.

### R91: Generation Pipeline Parameters MUST Be Fully Passed, No Hardcoded Empty Arrays

In generation pipeline call chains, context parameters like `elements`/`characters`/`scenes` MUST be fetched from actual data sources and passed through, NOT hardcoded as empty arrays `[]` or omitted. Hardcoded empty arrays cause reference resolution to silently fail, resulting in generation without character/scene references.

**BAD** — Hardcoded empty array:
```typescript
const result = await generateBeatFramePair(beat, {
  elements: [],  // Always empty, references never resolved
  ...
});
```

**GOOD** — Fetch from data source:
```typescript
const elements = await container.elementStorage.getAllElements();
const result = await generateBeatFramePair(beat, {
  elements,
  ...
});
```

**Verification**: Search for `elements: []`, `characters: []`, `scenes: []` in generation function calls. All such hardcoded empty arrays must be replaced with actual data fetching logic.

**Discovered in**: `useFramePairGenerator` passed `elements: []` to `generateBeatFramePair`, so character/scene references were never resolved. `beat-chain-generator` didn't call `resolveCharacterRefs`/`resolveSceneRef` at all.

### R93: Seedance Video API Three Modes Are Mutually Exclusive

Seedance pro 系列模型的视频 API 有三种互斥模式：首帧、首尾帧、参考图（仅 lite-i2v）。pro 模型的 `buildVideoRequest` 不得在 content 数组中同时传递首帧/尾帧和参考图（`role: "reference_image"`）。pro 模型只有首帧和首尾帧两种合法模式，参考图信息必须通过 `bake_into_first` 融入首帧，而非通过 API 原生传递。

**BAD** — pro 模型在首尾帧模式中追加参考图：
```typescript
content.push({ type: "image_url", image_url: { url: firstFrameUrl } });
content.push({ type: "image_url", image_url: { url: lastFrameUrl } });
content.push({ type: "image_url", image_url: { url: characterRef } }); // 违反互斥约束
```

**GOOD** — pro 模型只传首帧/尾帧，参考图融入首帧：
```typescript
content.push({ type: "image_url", image_url: { url: firstFrameUrl }, role: "first_frame" });
content.push({ type: "image_url", image_url: { url: lastFrameUrl }, role: "last_frame" });
// characterRef/sceneRef 通过 bake_into_first 融入首帧，不传给视频 API
```

**GOOD** — lite-i2v 模型使用参考图模式：
```typescript
content.push({ type: "image_url", image_url: { url: ref }, role: "reference_image" });
```

**Verification**: 检查 Volcengine provider 的 `buildVideoRequest`，确认 pro 模型（非 lite-i2v）不追加 `role: "reference_image"` 条目。

**Discovered in**: Volcengine provider 在 pro 模型的 content 数组中无条件追加 characterRef/sceneRef，违反了 Seedance API 三模式互斥约束。

### R94: Seedance API Role Field Is Required for First/Last Frame

Seedance API 的 content 数组中，`image_url` 对象必须包含 `role` 字段：首帧 `role: "first_frame"`，尾帧 `role: "last_frame"`，参考图 `role: "reference_image"`。缺少 role 字段会导致 API 无法区分首帧和尾帧，或请求失败。

**BAD** — 缺少 role 字段：
```typescript
content.push({ type: "image_url", image_url: { url: firstFrameUrl } });
content.push({ type: "image_url", image_url: { url: lastFrameUrl } });
```

**GOOD** — 带 role 字段：
```typescript
content.push({ type: "image_url", image_url: { url: firstFrameUrl }, role: "first_frame" });
content.push({ type: "image_url", image_url: { url: lastFrameUrl }, role: "last_frame" });
```

**Verification**: 检查 Volcengine provider 的 `buildVideoRequest`，确认所有 `image_url` 条目都包含 `role` 字段。

**Discovered in**: Volcengine provider 的首帧和尾帧 image_url 缺少 role 字段，导致首尾帧模式下 API 无法区分首帧和尾帧。

### R95: bake_into_first Mode MUST NOT Pass Reference Images to Video API

当 `characterRefMode` 或 `sceneRefMode` 为 `"bake_into_first"` 时，`getVideoGenerationStrategy` 返回 `useCharacterRef: false` / `useSceneRef: false`。视频生成时 characterRefs/sceneRef 必须设为 undefined，参考图信息通过"融入首帧"架构传递——首帧生成时将参考图 URL 传给图片生成模型（如 Seedream 的 `ref_image` 参数），让首帧图片本身就包含角色/场景特征。

**BAD** — bake_into_first 模式下仍传参考图给视频 API：
```typescript
const strategy = getVideoGenerationStrategy(modelId);
// strategy.useCharacterRef === false, 但仍传了 characterRefs
body.subject_reference = characterRefs[0];
```

**GOOD** — 根据策略过滤：
```typescript
const strategy = getVideoGenerationStrategy(modelId);
const effectiveCharacterRefs = strategy && !strategy.useCharacterRef
  ? undefined : characterRefs;
```

**Verification**: 检查 `beat-video-generator.ts` 和 `useVideoGenerator.ts`，确认 bake_into_first 模式下 characterRefs/sceneRef 被过滤为 undefined。

**Discovered in**: Seedance pro 模型的 characterRefMode 之前被错误声明为 "multimodal"（useCharacterRef=true），导致参考图被传给视频 API，违反了互斥约束。

### R96: Model Capability Declarations MUST Match Actual API Documentation

`supportsLastFrame`、`supportsCharacterRef`、`supportsSceneRef`、`nativeCharacterRef`、`nativeSceneRef` 必须反映 API 的实际支持情况。声明不支持的功能为 true 会导致系统传错误参数给 API；声明支持的功能为 false 会导致功能被意外过滤。

已知约束：
- Kling V1/V1.5/V1.6 不支持 `subject_reference`（仅 V2+ 支持），characterRefMode 应为 `"bake_into_first"`
- Google Veo 不支持尾帧和参考图，supportsLastFrame 应为 false，characterRefMode 应为 `"bake_into_first"`
- CogVideoX 不支持尾帧，supportsLastFrame 应为 false
- MiniMax 仅 S2V-01 模型支持 `subject_image_url`，其他模型不应传此字段
- Seedance pro 不支持参考图模式（仅 lite-i2v 支持），pro 的 characterRefMode 应为 `"bake_into_first"`

**BAD** — 声明与实际不符：
```typescript
"veo-3": { supportsLastFrame: true, supportsCharacterRef: true, nativeCharacterRef: true }
// Google Veo 实际不支持尾帧和参考图
```

**GOOD** — 声明与实际一致：
```typescript
"veo-3": { supportsLastFrame: false, supportsCharacterRef: true, nativeCharacterRef: false, characterRefMode: "bake_into_first" }
```

**Verification**: 对比 `BUILTIN_MODEL_CAPABILITIES` 中每个模型的能力声明与对应 API 的官方文档。

**Discovered in**: 多个模型的能力声明与 API 实际不符，导致系统传错误参数。

### R97: Provider buildVideoRequest MUST NOT Pass Fields the Model Doesn't Recognize

每个 provider 的 `buildVideoRequest` 只能传目标 API 文档中定义的字段。传模型不认识的字段可能导致 API 报错或字段被静默忽略。

已知约束：
- Kling V1 不传 `subject_reference` 和 `tail_image`（仅 V2+ 支持）
- Google Veo 不传 `lastFrame`、`referenceVideo`、`characterRef`、`sceneRef`（Veo 只支持首帧图生视频）
- MiniMax 非 S2V-01 模型不传 `subject_image_url`
- Seedance (Atlas) pro 模型不传 `ref_image`（参考图融入首帧）
- OpenAI 兼容 provider 不传 `ref_image`（通用格式无此字段）

**BAD** — 传模型不认识的字段：
```typescript
// Google Veo 不支持参考图，但传了
contents.push({ type: "image_url", image_url: { url: characterRef } });
```

**GOOD** — 根据模型能力过滤：
```typescript
const isS2V = model.includes("S2V-01");
if (isS2V && charRefs[0]) {
  body.subject_image_url = charRefs[0];
}
```

**Verification**: 检查每个 provider 的 `buildVideoRequest`，确认每个字段都有 API 文档依据。

**Discovered in**: Google Veo provider 传了 `lastFrame`/`referenceVideo`/`characterRef`/`sceneRef`，但 Veo API 不支持这些字段。MiniMax 所有模型都传 `subject_image_url`，但仅 S2V-01 支持。

### R98: Unknown Model Default Strategy MUST Be Conservative

`getModelCapabilities` 对未知模型（不在 `BUILTIN_MODEL_CAPABILITIES` 中的 modelId）返回默认能力时，必须保守地启用参考图支持（`supportsCharacterRef: true`、`characterRefMode: "text_append"`），而非禁用（`characterRefMode: "none"`）。未知模型可能是支持参考图的新模型，禁用会导致参考图被意外过滤。保守策略让 API 决定是否忽略不认识的字段。

**BAD** — 未知模型默认禁用参考图：
```typescript
return { supportsCharacterRef: false, characterRefMode: "none", ... };
// 新模型可能支持参考图，但被默认禁用了
```

**GOOD** — 未知模型默认启用参考图（保守策略）：
```typescript
return { supportsCharacterRef: true, characterRefMode: "text_append", ... };
// 让 API 决定是否忽略，而非前端主动过滤
```

**Verification**: 检查 `getDefaultCapabilities()` 返回值，确认 `supportsCharacterRef: true` 和 `characterRefMode: "text_append"`。

**Discovered in**: 未知模型默认 `characterRefMode: "none"` 导致 `getVideoGenerationStrategy` 返回 `useCharacterRef: false`，参考图被意外过滤。

### R99: bake_into_first Mode MUST Pass Reference Images to Image Generation

当视频模型使用 `bake_into_first` 模式时，首帧图片生成必须通过 `ref_image` 参数将参考图 URL 传给图片生成模型（如 Seedream），让首帧本身就包含角色/场景特征。如果首帧生成时不传参考图，"融入首帧"架构名存实亡——首帧图片不包含参考图信息，视频生成时也无法通过 API 传递参考图。

**BAD** — 首帧生成时不传参考图：
```typescript
buildImageRequest(ctx: ImageBuildContext) {
  return { body: { model, prompt, n: 1, size }, endpoint };
  // characterRef/sceneRef URL 被丢弃，首帧不包含参考图信息
}
```

**GOOD** — 首帧生成时传参考图：
```typescript
buildImageRequest(ctx: ImageBuildContext) {
  const body = { model, prompt, n: 1, size };
  const refImage = ctx.characterRef || ctx.sceneRef;
  if (refImage) body.ref_image = refImage;
  return { body, endpoint };
}
```

**Verification**: 检查 Volcengine/Seedance provider 的 `buildImageRequest`，确认支持 `ref_image` 参数。

**Discovered in**: Volcengine 和 Seedance provider 的 `buildImageRequest` 不支持 `ref_image` 参数，导致 bake_into_first 模式下首帧生成时参考图 URL 被丢弃。

## 八、系统安全（7 条）

> 核心关注：沙箱隔离防逃逸、IPC 通道注册检查、插件热加载缓存刷新、Blob URL 安全生命周期、异步重入守卫、批量并行执行、声明式 onError

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

### R81: Blob URL Lifecycle MUST Be Managed Safely

When creating `URL.createObjectURL(blob)`, the URL MUST be revoked to prevent memory leaks, but the revoke timing MUST NOT break active references. Two common patterns cause bugs:

1. **Revoke in useEffect cleanup with dependency** — revokes the URL on every change, but the old URL may still be referenced by `<video>` or `<img>` in the same render cycle, causing playback interruption.
2. **Immediate revoke after `a.click()`** — `a.click()` is asynchronous, immediate `URL.revokeObjectURL()` may cancel the download before it starts.

**BAD** — Revoke on every URL change (breaks active video):
```typescript
useEffect(() => {
  return () => {
    if (videoUrl?.startsWith("blob:")) URL.revokeObjectURL(videoUrl);
  };
}, [videoUrl]);
```

**BAD** — Immediate revoke after click (breaks download):
```typescript
const url = URL.createObjectURL(blob);
a.href = url;
a.click();
URL.revokeObjectURL(url);
```

**GOOD** — Collect blob URLs in ref, revoke on unmount only:
```typescript
const blobUrlsRef = useRef<Set<string>>(new Set());
useEffect(() => {
  return () => {
    for (const url of blobUrlsRef.current) URL.revokeObjectURL(url);
    blobUrlsRef.current.clear();
  };
}, []);
// Register each new blob URL
if (url.startsWith("blob:")) blobUrlsRef.current.add(url);
```

**GOOD** — Delayed revoke for downloads:
```typescript
const url = URL.createObjectURL(blob);
a.href = url;
a.click();
setTimeout(() => URL.revokeObjectURL(url), 5000);
```

**Verification**: Search for `URL.createObjectURL` calls. Verify: (1) every created URL is eventually revoked, (2) URLs used for display are NOT revoked on every change, (3) URLs used for download are revoked with a delay.

**Discovered in**: QuickGenerateState revoked cachedVideoUrl on every change, interrupting video playback. Asset-library export revoked blob URL immediately after `a.click()`, causing download failures.

### R82: Async Operations With Loading State MUST Guard Against Re-entry

When an async operation has a loading state (e.g., `isDeleting`, `isExporting`, `isSaving`), the handler MUST check the loading flag at the top and return early if already in progress. Without this guard, rapid double-clicks or repeated triggers can execute the operation multiple times concurrently, causing duplicate deletions, duplicate exports, or data corruption.

**BAD** — No re-entry guard:
```typescript
const handleBatchDelete = async () => {
  const ids = Array.from(selectedIds);
  if (ids.length === 0) return;
  setIsBatchDeleting(true);
  // User double-clicks → two concurrent batch deletes
```

**GOOD** — Guard with loading flag:
```typescript
const handleBatchDelete = async () => {
  const ids = Array.from(selectedIds);
  if (ids.length === 0 || isBatchDeleting) return;
  setIsBatchDeleting(true);
```

**Verification**: Search for async handlers that set a loading state (`setIs*ing(true)`). Verify each handler checks the loading flag at the top before proceeding.

**Discovered in**: Asset-library batch delete had no re-entry guard. Double-clicking "批量删除" could trigger two concurrent batch delete operations.

### R83: Batch Related-Entity Updates MUST Use Parallel Execution

When deleting an entity requires updating related entities (e.g., deleting a character requires updating all stories that reference it), the updates MUST use `Promise.allSettled` for parallel execution rather than `for...of await` serial execution. Serial updates are O(n) in latency — with 10 related stories, the user waits 10x longer than necessary. Parallel execution with `allSettled` also provides better error isolation: one failure doesn't prevent the rest from completing.

**BAD** — Serial updates, O(n) latency:
```typescript
for (const story of affectedStories) {
  try {
    const result = await storyService.update(story.id, story);
    if (!result.ok) failedStories.push(story.title);
  } catch (e) {
    failedStories.push(story.title);
  }
}
```

**GOOD** — Parallel updates with error isolation:
```typescript
const results = await Promise.allSettled(
  affectedStories.map((story) => storyService.update(story.id, story))
);
results.forEach((result, i) => {
  if (result.status === "rejected" || (result.status === "fulfilled" && !result.value.ok)) {
    failedStories.push(affectedStories[i]!.title);
  }
});
```

**Verification**: Search for `for.*of.*await` patterns in delete handlers that update related entities. Replace with `Promise.allSettled`. Verify error handling still collects failures correctly.

**Discovered in**: Characters, scenes, and asset-library pages all used serial `for...of await` for related-story updates after entity deletion. With 5+ affected stories, the operation took 5x longer than necessary.

### R84: Video/Image onError MUST Use React State, Not DOM Manipulation

When a `<video>` or `<img>` element fails to load, the error handler MUST use React state to render a fallback UI, not direct DOM manipulation (`document.createElement`, `appendChild`, `style.display`). DOM manipulation in React event handlers violates the declarative paradigm, causes issues in React 18+ concurrent mode, and makes the fallback UI untestable. Additionally, the error state MUST be reset when the `src` changes (e.g., video regenerated), otherwise the fallback persists even after the source is fixed.

**BAD** — DOM manipulation in onError:
```typescript
<video
  onError={(e) => {
    const target = e.currentTarget;
    target.style.display = "none";
    const fallback = document.createElement("div");
    fallback.className = "video-fallback";
    fallback.innerHTML = "<svg>...</svg>";
    target.parentElement!.appendChild(fallback);
  }}
/>
```

**GOOD** — React state with src-change reset:
```typescript
const [videoError, setVideoError] = useState(false);
useEffect(() => { setVideoError(false); }, [task.videoUrl]);

return videoError ? (
  <div className="video-fallback"><VideoOff /></div>
) : (
  <video src={task.videoUrl} onError={() => setVideoError(true)} />
);
```

**Verification**: Search for `onError` handlers on `<video>` and `<img>` elements. Verify they use `useState` + `e.currentTarget` (not `e.target`), and that the error state resets when `src` changes. No `document.createElement` or `appendChild` should appear in onError handlers.

**Discovered in**: VideoPreview component used 25 lines of DOM manipulation in `onError` to create a fallback SVG. The fallback was not reset when `videoUrl` changed, and the DOM manipulation was incompatible with React concurrent mode.

**Verification**: Add a new plugin via the plugin manager, then check if the API config panel shows the new provider template without requiring a page refresh.

**Discovered in**: After adding a new plugin through the plugin manager, the API config panel didn't show the new provider until the user closed and reopened the settings page.

### R100: FramePair URL Access MUST Use getFirstFrameUrl/getLastFrameUrl Utility Functions

When accessing `firstFrameUrl` or `lastFrameUrl` from a `StoryBeatFramePair` object, code MUST use the `getFirstFrameUrl()` and `getLastFrameUrl()` utility functions from `@/domain/utils` instead of directly accessing `framePair.firstFrameUrl || framePair.firstFrame?.imageUrl`. Direct access risks: (1) missing the fallback to `firstFrame.imageUrl`/`lastFrame.imageUrl`, (2) incorrect priority order (`imageUrl || firstFrameUrl` instead of `firstFrameUrl || imageUrl`).

**BAD** — Direct access with fallback inconsistency risk:
```typescript
const url = beat.framePair?.firstFrameUrl || beat.framePair?.firstFrame?.imageUrl;
// New code might forget the fallback, or reverse the priority
```

**GOOD** — Use utility function:
```typescript
import { getFirstFrameUrl, getLastFrameUrl } from "@/domain/utils";
const url = getFirstFrameUrl(beat.framePair);
```

**Verification**: Search for `firstFrameUrl || firstFrame?.imageUrl` or `lastFrameUrl || lastFrame?.imageUrl` patterns in production code. All such patterns must be replaced with `getFirstFrameUrl()`/`getLastFrameUrl()` calls.

**Discovered in**: 10+ locations had inconsistent `firstFrameUrl || firstFrame?.imageUrl` patterns. `beat-chain-generator.ts` had reversed priority (`lastFrame?.imageUrl || lastFrameUrl`), causing data loss when `lastFrameUrl` was set but `lastFrame.imageUrl` was not.

### R101: lastFrameUrl Priority MUST Match firstFrameUrl (Top-Level Field First)

When accessing `lastFrameUrl` from `StoryBeatFramePair`, the priority MUST be `lastFrameUrl || lastFrame?.imageUrl` (top-level field first, nested field as fallback). This matches the `firstFrameUrl` priority pattern. Reversing the priority (`lastFrame?.imageUrl || lastFrameUrl`) causes data loss when the top-level field is set but the nested field is not.

**BAD** — Reversed priority:
```typescript
const lastUrl = framePair.lastFrame?.imageUrl || framePair.lastFrameUrl;
// If lastFrameUrl is set but lastFrame.imageUrl is not, returns undefined
```

**GOOD** — Correct priority (use utility function):
```typescript
import { getLastFrameUrl } from "@/domain/utils";
const lastUrl = getLastFrameUrl(framePair); // lastFrameUrl || lastFrame?.imageUrl
```

**Verification**: Any direct `lastFrameUrl` access must follow `lastFrameUrl || lastFrame?.imageUrl` order. Prefer using `getLastFrameUrl()`.

**Discovered in**: `beat-chain-generator.ts` used `framePairResult.value.lastFrame?.imageUrl || framePairResult.value.lastFrameUrl`, causing chain breaks when only `lastFrameUrl` was populated.

### R102: Batch Generation skip_completed Filters MUST Use Utility Functions

When batch generation hooks (`useBatchGenerator`) filter beats by completion status (skip_completed strategy), the filter condition MUST use `getFirstFrameUrl()`/`getLastFrameUrl()` utility functions. Direct field access (e.g., `b.framePair?.lastFrame?.imageUrl`) misses the top-level `lastFrameUrl`/`firstFrameUrl` fields, causing: (1) completed beats to be incorrectly included for regeneration, or (2) completed beats to be incorrectly skipped.

**BAD** — Direct field access in skip_completed filter:
```typescript
targetBeats = targetBeats.filter((b) => !b.framePair?.lastFrame?.imageUrl && !b.uploadedFramePair?.lastFrame);
// Misses beats that have lastFrameUrl but not lastFrame.imageUrl
```

**GOOD** — Use utility function:
```typescript
import { getLastFrameUrl } from "@/domain/utils";
targetBeats = targetBeats.filter((b) => !getLastFrameUrl(b.framePair) && !b.uploadedFramePair?.lastFrame);
```

**Verification**: Search for `skip_completed` logic in batch generation hooks. Verify all filter conditions use `getFirstFrameUrl()`/`getLastFrameUrl()`.

**Discovered in**: `useBatchGenerator.ts` framepair skip_completed filter only checked `lastFrame?.imageUrl`, missing `lastFrameUrl`. Beats with only `lastFrameUrl` set were incorrectly regenerated.

### R103: getPrevBeatForChain MUST Use getLastFrameUrl for Chain Reference

When `getPrevBeatForChain` determines whether a previous beat can serve as a chain reference for framepair generation, it MUST use `getLastFrameUrl()` to check if the previous beat has a valid last frame. Direct field access (`prevBeat.framePair?.lastFrame?.imageUrl`) misses the top-level `lastFrameUrl` field, causing chain breaks.

**BAD** — Direct field access:
```typescript
case "framepair":
  if (prevBeat.framePair?.lastFrame?.imageUrl || prevBeat.uploadedFramePair?.lastFrame) return prevBeat;
  break;
```

**GOOD** — Use utility function:
```typescript
import { getLastFrameUrl } from "@/domain/utils";
case "framepair":
  if (getLastFrameUrl(prevBeat.framePair) || prevBeat.uploadedFramePair?.lastFrame) return prevBeat;
  break;
```

**Verification**: Search for `getPrevBeatForChain` in batch generation hooks. Verify framepair-level chain reference check uses `getLastFrameUrl()`.

**Discovered in**: `useBatchGenerator.ts` `getPrevBeatForChain` framepair case only checked `lastFrame?.imageUrl`, missing `lastFrameUrl`. Chain reference was not found when only `lastFrameUrl` was set, causing chain breaks in batch generation.

### R104: Domain Layer Error Messages MUST Use English Error Codes, Not Chinese

When domain layer services (`src/domain/services/`) throw `ValidationError` or `GenerationError`, the error message MUST be an English error code (e.g., `"BEAT_NOT_FOUND"`, `"KEYFRAME_REQUIRED_FOR_FRAME_PAIR"`) rather than a Chinese string. The domain layer cannot import `t()` from `@/shared/constants` (violates dependency direction: `domain/ → NOTHING`). Error codes are mapped to i18n keys via `mapUserFacingError` in `@/shared/utils/user-facing-error`.

**BAD** — Chinese error message in domain layer:
```typescript
return err(new ValidationError("分镜不存在"));
```

**GOOD** — English error code mapped to i18n:
```typescript
// domain/services/story-generation-service.ts
return err(new ValidationError("BEAT_NOT_FOUND"));

// shared/utils/user-facing-error.ts
{ pattern: /BEAT_NOT_FOUND/, messageKey: "error.beatNotFound" },
```

**Verification**: Search for `ValidationError` and `GenerationError` in `src/domain/`. All error messages must be English error codes, not Chinese strings. Each error code must have a corresponding pattern in `mapUserFacingError`'s `EXTRA_PATTERNS`.

**Discovered in**: `story-generation-service.ts` had 3 Chinese `ValidationError` messages ("分镜不存在", "预览图不存在，无法生成首尾帧", "首尾帧不存在，无法生成视频"). These were invisible to `mapUserFacingError`, so users saw raw Chinese error codes instead of properly formatted messages.

### R105: SSRF Guard MUST Validate Non-Loopback User-Configured Hosts

When the app makes outbound HTTP/HTTPS requests to user-configured hosts (e.g., AI provider endpoints), the SSRF guard MUST validate non-loopback hosts for DNS rebinding protection. Loopback addresses (`127.0.0.1`, `localhost`, `::1`) are trusted and bypass SSRF validation. Non-loopback user-configured hosts go through `ssrfGuard.validate`, which checks resolved IPs against `PRIVATE_IP_PATTERNS` to prevent DNS rebinding attacks. If `ssrfGuard.validate` returns `unsafe`, the request MUST be blocked.

**BAD** — Bypass SSRF validation for user-configured hosts:
```typescript
const response = await fetch(userConfiguredUrl);
```

**GOOD** — Validate non-loopback hosts via ssrfGuard:
```typescript
const parsed = new URL(userConfiguredUrl);
const isLoopback = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost" || parsed.hostname === "::1";
if (!isLoopback) {
  const validation = await ssrfGuard.validate(parsed);
  if (!validation.safe) {
    return { ok: false, error: new Error(`SSRF blocked: ${validation.reason}`) };
  }
}
return await makeRequest(userConfiguredUrl);
```

**Verification**: Check `test-connection` handler and any code path making outbound requests to user-configured hosts. Verify: (1) loopback hosts bypass SSRF, (2) non-loopback hosts call `ssrfGuard.validate`, (3) `unsafe` result blocks the request.

**Discovered in**: Security audit found `ssrfGuard` was available but not enforced for user-configured AI provider endpoints. Test: `electron/src/__tests__/r105-ssrf-user-host-dns-rebinding.test.ts`.

### R106: (Reserved — see regression/async-safety.md if applicable)

### R107: Upload File Size MUST Be Limited to 50MB

When uploading files via `uploadFile` (in `src/infrastructure/ai-providers/utils.ts`), the file size MUST be checked against `MAX_UPLOAD_FILE_BYTES` (50MB) before initiating the network upload. Files exceeding the limit MUST be rejected with an error message containing both the actual size and the limit size, and MUST NOT trigger any network upload call.

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
    return err(new Error(`文件大小 ${formatBytes(file.size)} 超过限制 ${formatBytes(MAX_UPLOAD_FILE_BYTES)}`));
  }
  const base64 = await fileToBase64(file);
  return ok(await apiCallWithRetry(() => uploadToProvider(base64)));
}
```

**Verification**: Call `uploadFile` with a File object whose `size` exceeds 50MB. Verify: (1) returns an error without calling `apiCallWithRetry`, (2) error message contains both sizes.

**Discovered in**: Security audit identified that file uploads had no size limit. Test: `src/infrastructure/ai-providers/__tests__/r107-upload-file-size-limit.test.ts`.

### R108: API Client MUST Use Result Pattern (No Throw)

The `apiClient` in `src/infrastructure/api/client.ts` MUST follow the Result pattern — its `request` function (and convenience methods `get`/`post`/`put`/`delete`) MUST return `Result<T, AppError>` and MUST NOT throw on any error condition, including network errors, `AppApiClientError` instances, or unexpected exceptions.

**BAD** — Throwing on network error:
```typescript
async function request<T>(url: string): Promise<T> {
  const response = await fetch(url); // throws on network failure
  if (!response.ok) throw new AppApiClientError(...);
  return await response.json();
}
```

**GOOD** — Result pattern, never throws:
```typescript
async function request<T>(url: string): Promise<Result<T, AppError>> {
  try {
    const response = await fetch(url);
    if (!response.ok) return err(new ApiError(`HTTP ${response.status}`));
    return ok(await response.json());
  } catch (e) {
    if (e instanceof AppApiClientError) return err(e);
    return err(new NetworkError(e instanceof Error ? e.message : String(e)));
  }
}
```

**Verification**: Mock `fetch` to reject with `TypeError` and with `AppApiClientError`. Verify `apiClient.get(...)` returns `{ ok: false, error: ... }` rather than throwing.

**Discovered in**: API client audit found some error paths could throw, breaking the Result pattern contract. Test: `src/infrastructure/api/__tests__/r108-api-client-result-no-throw.test.ts`.

### R109: Transactional Delete MUST Track Orphan Files on Failure

When `cleanupLocalFiles` (in `src/modules/persistence/services/transactional-delete.ts`) fails to delete a local file, the file path MUST be recorded in the `orphan_files` table via `recordOrphanFile` for later cleanup. `recordOrphanFile` itself MUST NOT throw or affect the main flow. Non-local paths (`http://`, `https://`, `data:`) MUST be skipped.

**BAD** — Silent failure, no orphan tracking:
```typescript
async function cleanupLocalFiles(filePaths: string[]) {
  for (const path of filePaths) {
    try { await fileStorage.deleteFile(path); }
    catch (e) { errorLogger.warn("Failed to delete file", e); }
  }
}
```

**GOOD** — Track orphans for later cleanup:
```typescript
async function cleanupLocalFiles(filePaths: string[]) {
  for (const path of filePaths) {
    if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("data:")) continue;
    try { await fileStorage.deleteFile(path); }
    catch (e) {
      errorLogger.warn("Failed to delete file, tracking as orphan", e);
      await recordOrphanFile(path);
    }
  }
}
```

**Verification**: Mock `fileStorage.deleteFile` to reject. Verify: (1) path recorded in `orphan_files` table, (2) `recordOrphanFile` failure does not throw, (3) non-local paths skipped.

**Discovered in**: Persistence service audit found file deletion failures were silently swallowed, leaving dangling files. Test: `src/modules/persistence/services/__tests__/r109-transactional-delete-orphan-tracking.test.ts`.

### R110: schedulePolling MUST Clear Old Timer Before Setting New One

`schedulePolling` in the polling engine MUST clear the existing `pollingTimeoutId` before setting a new timer. If `pollingTimeoutId` is `null`, the function MUST NOT throw. This prevents timer leaks that cause multiple polls to run concurrently.

**BAD** — Timer leak, multiple concurrent polls:
```typescript
function schedulePolling(delay: number) {
  pollingTimeoutId = setTimeout(poll, delay); // ❌ Old timer not cleared
}
```

**GOOD** — Clear old timer first:
```typescript
function schedulePolling(delay: number) {
  if (pollingTimeoutId) clearTimeout(pollingTimeoutId);
  pollingTimeoutId = setTimeout(poll, delay);
}
```

**Verification**: Call `schedulePolling` twice rapidly. Verify `clearTimeout` is called once before the second `setTimeout`. Verify calling with `pollingTimeoutId === null` does not throw.

**Discovered in**: Polling engine audit found timer leaks causing duplicate poll cycles. Test: `src/modules/video/task-management/hooks/internals/__tests__/r110-polling-schedule-clear-old-timer.test.ts`.

### R111: Video Recovery MUST Dispatch Single Notification

`recoverVideoByTaskId` in `src/modules/video/recovery/services/video-recovery-service.ts` MUST dispatch exactly one `"video-task-recovered"` event on success. It MUST NOT call `recoverTask` directly (which would cause double notification). After successful recovery, storage MUST be updated via `updateVideoTask`.

**BAD** — Double notification:
```typescript
async function recoverVideoByTaskId(taskId: string) {
  await recoverTask(taskId, status, url); // ❌ Dispatches event internally
  window.dispatchEvent(new CustomEvent("video-task-recovered", ...)); // ❌ Duplicate
}
```

**GOOD** — Single notification:
```typescript
async function recoverVideoByTaskId(taskId: string) {
  await updateVideoTask(taskId, { status, videoUrl: url });
  window.dispatchEvent(new CustomEvent("video-task-recovered", ...)); // Single dispatch
}
```

**Verification**: Mock `recoverTask` and `updateVideoTask`. Verify `recoverVideoByTaskId` calls `updateVideoTask` (not `recoverTask`) and dispatches exactly one event.

**Discovered in**: Video recovery audit found double notifications causing UI inconsistency. Test: `src/modules/video/recovery/services/__tests__/r111-video-recovery-single-notification.test.ts`.

### R112: objectUrlRegistry MUST Enforce LRU 100-Entry Limit

`registerObjectUrl` in `src/infrastructure/storage/video-cache.ts` MUST enforce `MAX_OBJECT_URLS` (100) limit. When the limit is exceeded, the oldest entry MUST be evicted and its blob URL MUST be revoked via `URL.revokeObjectURL`. Re-registering an existing `taskId` MUST update the entry (not create a new one, no eviction).

**BAD** — Unbounded registry, memory leak:
```typescript
function registerObjectUrl(taskId: string, url: string) {
  registry.set(taskId, url); // ❌ No limit, no eviction
}
```

**GOOD** — LRU with eviction:
```typescript
function registerObjectUrl(taskId: string, url: string) {
  if (registry.has(taskId)) {
    registry.delete(taskId); // Move to end (most recent)
  } else if (registry.size >= MAX_OBJECT_URLS) {
    const [oldestKey, oldestUrl] = registry.entries().next().value;
    URL.revokeObjectURL(oldestUrl);
    registry.delete(oldestKey);
  }
  registry.set(taskId, url);
}
```

**Verification**: Register 101 URLs. Verify: (1) registry size is 100, (2) first URL is evicted, (3) `URL.revokeObjectURL` called on evicted URL, (4) re-registering existing taskId does not trigger eviction.

**Discovered in**: Video cache audit found unbounded object URL registry causing memory leaks. Test: `src/infrastructure/storage/__tests__/r112-object-url-registry-lru.test.ts`.

### R113: cancelTask MUST Notify Provider (Best-Effort)

`cancelTask` in `src/modules/video/task-management/hooks/use-video-task-manager.ts` MUST best-effort notify the server via `provider.cancelTask` before updating local state. If `provider.cancelTask` is `undefined`, it MUST NOT throw. If `provider.cancelTask` throws, local cancellation MUST still proceed.

**BAD** — Local-only cancel, server keeps generating (token waste):
```typescript
async function cancelTask(taskId: string) {
  set({ allTasks: tasks.filter(t => t.taskId !== taskId) }); // ❌ No server notification
}
```

**GOOD** — Best-effort server notification:
```typescript
async function cancelTask(taskId: string) {
  try {
    await container.videoProvider?.cancelTask?.(taskId);
  } catch (e) {
    errorLogger.warn("Failed to cancel task on server side", e);
  }
  set({ allTasks: tasks.filter(t => t.taskId !== taskId) });
}
```

**Verification**: Mock `provider.cancelTask`. Verify: (1) called before state update, (2) undefined provider does not throw, (3) provider throw does not block local cancel.

**Discovered in**: Video task audit found local-only cancellation causing server to continue generating, wasting tokens. Test: `src/modules/video/task-management/hooks/__tests__/r113-cancel-task-notifies-provider.test.ts`.

### R114: Recovery MUST Guard Against NaN Timestamps

`startBackgroundRecovery` in `src/modules/video/recovery/services/video-recovery-service.ts` MUST validate `createdAt` and `lastPolledAt` timestamps when filtering eligible tasks. Tasks with `NaN` `createdAt` MUST be excluded from the recovery list. When `lastPolledAt` is `NaN`, the default `POLL_INTERVAL_MS` MUST be used as the interval. NaN `createdAt` tasks MUST log a warning.

**BAD** — NaN timestamp causes incorrect filtering:
```typescript
const eligible = tasks.filter(t => Date.now() - t.createdAt > RECOVERY_THRESHOLD);
// ❌ NaN createdAt passes filter (Date.now() - NaN = NaN, NaN > x = false, excluded incorrectly OR included if logic inverted)
```

**GOOD** — Explicit NaN guard:
```typescript
const eligible = tasks.filter(t => {
  const created = Number(t.createdAt);
  if (Number.isNaN(created)) {
    errorLogger.warn("Task has invalid createdAt, excluding from recovery", { taskId: t.taskId });
    return false;
  }
  return Date.now() - created > RECOVERY_THRESHOLD;
});
```

**Verification**: Mock tasks with `createdAt: NaN`, `createdAt: "invalid"`, valid `createdAt`. Verify NaN tasks excluded, valid tasks included, warn logged.

**Discovered in**: Recovery service audit found NaN timestamps causing incorrect recovery eligibility. Test: `src/modules/video/recovery/services/__tests__/r114-recovery-timestamp-nan-guard.test.ts`.

### R115: useVideoTaskCommands MUST Delegate to Store Actions

`useVideoTaskCommands` in `src/modules/video/task-management/hooks/use-video-task-commands.ts` MUST delegate all write operations (addTask, removeTask, createTask, cancelTask, clearActiveTasks, recoverTask, etc.) to `store.getState().xxx()`. It MUST NOT directly call `store.setState()` or `getStore().setAllTasks()`. This ensures `scheduleSync` and `checkAndStartOrStopPolling` are correctly invoked by the store actions.

**BAD** — Bypass store actions, sync/polling not triggered:
```typescript
export function useVideoTaskCommands() {
  const store = useVideoTaskStore;
  return {
    addTask: (task) => {
      store.setState(state => ({ allTasks: [...state.allTasks, task] })); // ❌ No scheduleSync
    },
  };
}
```

**GOOD** — Delegate to store actions:
```typescript
export function useVideoTaskCommands() {
  const store = useVideoTaskStore;
  return {
    addTask: (task) => store.getState().addTask(task), // ✅ Triggers scheduleSync + polling
  };
}
```

**Verification**: Mock `store.getState()`. Verify each command calls the corresponding store action method.

**Discovered in**: Commands layer audit found direct state mutation bypassing store actions, causing sync and polling to not trigger. Test: `src/modules/video/task-management/hooks/__tests__/regression-r115-commands-delegate-to-store.test.ts`.

### R116: Sync Push-Pull MUST Be Atomic (markChangesSynced After Full Success)

`markChangesSynced` MUST be called only after `push` + `pull` + `applyRemoteChanges` all succeed. It MUST NOT be called in the push phase. If pull or apply fails, local changes MUST NOT be marked as synced (otherwise data loss on next sync). `SyncPushResult` MUST include `syncedIds: string[]` for the caller to mark after full success.

**BAD** — Early markChangesSynced, data loss on pull failure:
```typescript
async function pushChanges(changes) {
  await proxyPush(changes);
  await markChangesSynced(changes.map(c => c.id)); // ❌ Too early
  const pullResult = await pullChanges(); // If this fails, changes marked as synced but not applied
}
```

**GOOD** — Atomic markChangesSynced:
```typescript
async function performSync() {
  const pushResult = await pushChanges(localChanges); // Returns syncedIds, does NOT mark
  const pullResult = await pullChanges();
  await applyRemoteChanges(pullResult.changes, deviceId);
  // Only now, all phases succeeded
  if (pushResult.syncedIds.length > 0) {
    await markChangesSynced(pushResult.syncedIds);
  }
}
```

**Verification**: Mock push success, pull failure. Verify `markChangesSynced` NOT called. Mock all success. Verify `markChangesSynced` called with `syncedIds`.

**Discovered in**: Sync engine audit found early `markChangesSynced` causing data loss when pull/apply fails. Test: `src/modules/sync/engine/__tests__/regression-r116-sync-push-pull-atomicity.test.ts`.

### R117: Setup Functions MUST Be Idempotent

The 4 setup functions in `src/modules/video/task-management/hooks/internals/task-initializer.ts` (`setupRecoveredEventListener`, `setupBackgroundRecoveryInterval`, `setupCacheCleanupInterval`, `setupBeforeUnloadHandler`) MUST be idempotent. Repeated calls MUST first clean up old resources (removeEventListener / clearInterval) before registering new ones. This prevents duplicate listeners and interval leaks.

**BAD** — Duplicate listeners on repeated setup:
```typescript
export function setupRecoveredEventListener(store) {
  window.addEventListener("video-task-recovered", handler); // ❌ No cleanup, duplicates on re-call
}
```

**GOOD** — Idempotent with cleanup:
```typescript
export function setupRecoveredEventListener(store) {
  if (pollingState.recoveredEventHandler) {
    window.removeEventListener("video-task-recovered", pollingState.recoveredEventHandler);
  }
  pollingState.recoveredEventHandler = handler;
  window.addEventListener("video-task-recovered", handler);
}
```

**Verification**: Call each setup function twice. Verify `removeEventListener`/`clearInterval` called before second registration. Verify only one listener/interval active.

**Discovered in**: Task initializer audit found non-idempotent setup functions causing duplicate listeners and interval leaks on HMR or re-initialization. Test: `src/modules/video/task-management/hooks/internals/__tests__/regression-r117-setup-functions-idempotent.test.ts`.

### R118: HTTP Redirect MUST Validate SSRF (Protocol + Private Address)

`cacheRemoteImageLocally` in `electron/src/api-gateway-utils.ts` MUST validate redirect targets when following HTTP redirects: (1) protocol MUST be `http://` or `https://` (block `file://`, `ftp://`, etc.), (2) target URL MUST NOT be a private/internal address (call `isPrivateUrl`). This prevents SSRF attacks via malicious redirect chains.

**BAD** — Blind redirect following, SSRF vulnerability:
```typescript
if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
  client.get(res.headers.location, handleResponse); // ❌ No protocol or SSRF check
}
```

**GOOD** — Validate redirect target:
```typescript
if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
  const redirectUrl = res.headers.location;
  if (!redirectUrl.startsWith("http://") && !redirectUrl.startsWith("https://")) {
    reject(new Error("Redirect to non-http protocol blocked"));
    return;
  }
  if (await isPrivateUrl(redirectUrl)) {
    reject(new Error("Redirect to private/internal URL blocked by SSRF guard"));
    return;
  }
  // Follow redirect
}
```

**Verification**: Mock HTTP redirect to `file://`, `ftp://`, `http://127.0.0.1`, `http://10.0.0.1`. Verify all rejected. Mock redirect to public HTTPS. Verify followed.

**Discovered in**: Security audit found redirect SSRF vulnerability in image caching. Test: `electron/src/__tests__/regression-r118-redirect-ssrf-guard.test.ts`.

### R119: openPath IPC MUST Validate Path Whitelist

`shell:open-path` IPC handler in `electron/src/main-common.ts` MUST validate that the path is within user data directories or the system temp directory (`os.tmpdir()`). Paths outside allowed roots MUST be rejected. Empty or non-string paths MUST be rejected.

**BAD** — No path validation, arbitrary file access:
```typescript
ipcMain.handle("shell:open-path", async (_event, filePath: string) => {
  await shell.openPath(filePath); // ❌ No validation
  return { success: true };
});
```

**GOOD** — Whitelist validation:
```typescript
ipcMain.handle("shell:open-path", async (_event, filePath: string) => {
  if (!filePath || typeof filePath !== "string") return { success: false, error: "Invalid path" };
  const allowedRoots = [...getAllUserDataDirs(), os.tmpdir()];
  if (!isPathUnderAnyRoot(path.resolve(filePath), allowedRoots)) {
    return { success: false, error: "Path is outside allowed directories" };
  }
  await shell.openPath(filePath);
  return { success: true };
});
```

**Verification**: Test paths inside user data dir (allowed), outside (rejected), path traversal `../../../etc/passwd` (rejected), empty string (rejected).

**Discovered in**: IPC security audit found `openPath` with no path validation allowing arbitrary file access. Test: `electron/src/__tests__/regression-r119-openpath-whitelist.test.ts`.

### R120: Decryption Failure MUST NOT Fallback to Plaintext

`safe-storage.strategy.ts` `load` method MUST return `"{}"` (empty JSON object) when `safeStorage.decryptString` fails. It MUST NOT return the raw (potentially plaintext) data. This prevents reading unencrypted data that may have been tampered with or planted.

**BAD** — Plaintext fallback, security risk:
```typescript
try {
  decrypted = safeStorage.decryptString(Buffer.from(raw, "base64"));
} catch {
  decrypted = raw; // ❌ Returns plaintext, attacker could plant unencrypted data
}
```

**GOOD** — No plaintext fallback:
```typescript
try {
  decrypted = safeStorage.decryptString(Buffer.from(raw, "base64"));
} catch {
  logger.warn("Failed to decrypt with safeStorage, returning empty (no plaintext fallback)");
  decrypted = "{}"; // ✅ Safe default
}
```

**Verification**: Mock `safeStorage.decryptString` to throw. Verify return value is `"{}"` (not raw). Verify warn logged.

**Discovered in**: Key storage audit found plaintext fallback allowing attacker-planted unencrypted data to be read. Test: `electron/src/security/key-storage/strategies/__tests__/regression-r120-no-plaintext-fallback.test.ts`.

### R121: pending→completed State Transition MUST Be Allowed

`VALID_TRANSITIONS` in `src/modules/video/task-management/domain/task-machine.ts` MUST include `"completed"` in the `pending` array. This allows synchronous generation scenarios where the server returns a completed result immediately.

**BAD** — Missing transition, false failure:
```typescript
const VALID_TRANSITIONS = {
  pending: ["generating", "failed", "cancelled", "timeout"], // ❌ No "completed"
};
// Synchronous generation returns completed → transition rejected → false failure
```

**GOOD** — Allow pending→completed:
```typescript
const VALID_TRANSITIONS = {
  pending: ["generating", "failed", "cancelled", "timeout", "completed"], // ✅
};
```

**Verification**: `isValidTransition("pending", "completed")` MUST return `true`.

**Discovered in**: State machine audit found missing `pending→completed` transition causing false failures in synchronous generation. Tests: `src/modules/video/task-management/domain/__tests__/task-machine.test.ts`, `src/__tests__/integration/full-pipeline.test.ts`.

### R122: Batch Clear Tasks MUST Notify Server (cancelTask per Active Task)

`clearActiveTasks` and `clearAllTasks` in `src/modules/video/task-management/hooks/use-video-task-manager.ts` MUST call `cancelTask` for each active (pending/generating) task before deleting. This is best-effort: if `cancelTask` fails, subsequent tasks MUST still be cancelled. This prevents the server from continuing to generate, wasting tokens.

**BAD** — Local-only clear, server keeps generating:
```typescript
clearActiveTasks: async () => {
  set({ allTasks: [] }); // ❌ No server notification, tokens wasted
},
```

**GOOD** — Notify server per task:
```typescript
clearActiveTasks: async () => {
  const activeTasks = filterTasksByStatus(get().allTasks, ["pending", "generating"]);
  for (const task of activeTasks) {
    if (TaskMachine.isPollable(task.status)) {
      try { await get().cancelTask(task.taskId); }
      catch (e) { errorLogger.warn("clearActiveTasks cancel failed", e); }
    }
  }
  // Then delete
},
```

**Verification**: Mock tasks with mixed statuses. Verify `cancelTask` called for each pending/generating task. Verify failure does not block subsequent cancels.

**Discovered in**: Video task audit found batch clear without server notification causing token waste. Test: `src/modules/video/task-management/hooks/__tests__/regression-r122-clear-tasks-notifies-server.test.ts`.

### R123: VM Sandbox MUST Lock Object.prototype.constructor

`plugin-worker.ts` `SANITIZED_CODE_PREFIX` MUST lock `Object.prototype.constructor` to `Object` with `writable: false, configurable: false`. This prevents plugins from escaping the sandbox via the constructor chain (`({}).constructor.constructor("return process")()`).

**BAD** — Constructor chain escape:
```typescript
// Without locking, plugin can escape:
const process = ({}).constructor.constructor("return process")();
process.exit(0); // ❌ Sandbox escaped
```

**GOOD** — Lock constructor:
```typescript
const SANITIZED_CODE_PREFIX = `
(function() {
  'use strict';
  try {
    Object.defineProperty(Object.prototype, 'constructor', {
      value: Object, writable: false, configurable: false
    });
  } catch (e) { console.warn('Failed to lock constructor:', e); }
`;
```

**Verification**: Verify `SANITIZED_CODE_PREFIX` contains `Object.defineProperty(Object.prototype, 'constructor', ...)`. Verify `writable: false, configurable: false`. Verify sandbox execution does not allow constructor chain escape.

**Discovered in**: Plugin sandbox audit found constructor chain escape vulnerability. Test: `electron/src/plugins/__tests__/regression-r123-sandbox-constructor-lock.test.ts`.

### R124: API Key MUST Be Passed via Header, Not URL Query

Google provider in `electron/src/plugins/providers/google.ts` MUST pass the API key via `x-goog-api-key` header (`getAuthHeaders`), NOT via URL query parameter (`appendAuthToUrl` MUST return the URL unchanged). This prevents credentials from leaking into server logs, proxy caches, and browser history.

**BAD** — API key in URL, leaks everywhere:
```typescript
appendAuthToUrl(url, apiKey) {
  return `${url}?key=${apiKey}`; // ❌ Leaks to logs, caches, history
}
```

**GOOD** — API key in header:
```typescript
getAuthHeaders(apiKey) {
  return { "x-goog-api-key": apiKey }; // ✅ Not in URL
}
appendAuthToUrl(url, _apiKey) {
  return url; // ✅ URL unchanged
}
```

**Verification**: Verify `getAuthHeaders` returns `{ "x-goog-api-key": apiKey }`. Verify `appendAuthToUrl` returns URL without `key=` or `api_key=`.

**Discovered in**: Plugin provider audit found API key in URL query causing credential leakage. Test: `electron/src/plugins/providers/__tests__/regression-r124-apikey-header-not-url.test.ts`.

### R125: Import MUST Use ON CONFLICT DO UPDATE, Not INSERT OR REPLACE

ASA import functions in `src/modules/asset/asset-library/asa-export-service.ts` MUST use `INSERT ... ON CONFLICT(id) DO UPDATE SET` (updating only imported fields). They MUST NOT use `INSERT OR REPLACE` (which replaces the entire row, clearing non-imported fields like metadata, user tags, etc.).

**BAD** — INSERT OR REPLACE, metadata lost:
```sql
INSERT OR REPLACE INTO characters (id, name, ...) VALUES (?, ?, ...)
-- ❌ Replaces entire row, non-imported fields (metadata, tags) set to NULL
```

**GOOD** — ON CONFLICT DO UPDATE, only imported fields updated:
```sql
INSERT INTO characters (id, name, ...) VALUES (?, ?, ...)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name, ... -- ✅ Only imported fields, metadata preserved
```

**Verification**: Mock `safeTransaction`, capture SQL. Verify SQL contains `ON CONFLICT(id) DO UPDATE SET` and does NOT contain `INSERT OR REPLACE`.

**Discovered in**: Asset import audit found `INSERT OR REPLACE` clearing metadata on re-import. Test: `src/modules/asset/asset-library/__tests__/regression-r125-import-on-conflict.test.ts`.

### R126: IPC Handler MUST NOT Return Credentials

`handleSyncTest` in `electron/src/handlers/sync.ts` MUST NOT include `token` in its return value. The token is a long-lived sync server credential that should only be stored in the main process. Even if the server response includes `token`, it MUST be stripped before returning to the renderer.

**BAD** — Token leaked to renderer:
```typescript
return {
  success: true,
  token: data.token, // ❌ Credential leak
  message: "CONNECTION_SUCCESS",
};
```

**GOOD** — No token in return:
```typescript
return {
  success: true,
  message: "CONNECTION_SUCCESS",
  serverVersion: data.version,
  latency,
  // ✅ No token
};
```

**Verification**: Mock server response with `token`. Verify return value does NOT have `token` property. Verify `success`, `message`, `serverVersion`, `latency` present.

**Discovered in**: Sync handler audit found token returned to renderer, risking credential exposure. Test: `electron/src/__tests__/regression-r126-ipc-no-credential-leak.test.ts`.

### R127: Persistence Operations MUST Be Debounced

`useStoryPersistence` in `src/app/story/useStoryPersistence.ts` MUST debounce `updateVideoUrls` (500ms) to merge rapid successive changes. This prevents concurrent persistence race conditions. On unmount, the debounce timer MUST be cleared.

**BAD** — No debounce, concurrent persistence race:
```typescript
useEffect(() => {
  updateVideoUrls(); // ❌ Called on every change, concurrent writes
}, [completedTaskUrls]);
```

**GOOD** — Debounced:
```typescript
const PERSIST_DEBOUNCE_MS = 500;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
useEffect(() => {
  let cancelled = false;
  debounceTimer = setTimeout(() => {
    if (!cancelled) updateVideoUrls();
  }, PERSIST_DEBOUNCE_MS);
  return () => {
    cancelled = true;
    if (debounceTimer) clearTimeout(debounceTimer);
  };
}, [completedTaskUrls]);
```

**Verification**: Use fake timers. Trigger multiple rapid changes. Verify `updateVideoUrls` called once after 500ms. Verify unmount clears timer.

**Discovered in**: Story persistence audit found concurrent writes causing race conditions. Test: `src/app/story/__tests__/regression-r127-persistence-debounce.test.ts`.

### R128: IPC Handlers MUST Validate Input

IPC handlers in `electron/src/handlers/config-storage.ts` and `electron/src/handlers/secure-config.ts` MUST runtime-validate input structure:
- `config:metadata:save`: validate `providers` is object, `updatedAt` is finite number, `version` is non-negative integer
- `config:history:restore`: validate `version` is non-negative integer
- `secure-config:save`: validate `apiKey` is non-empty string, length ≤ 4096

**BAD** — No validation, arbitrary object stored:
```typescript
ipcMain.handle("config:metadata:save", (_event, metadata) => {
  return saveConfigMetadata(metadata); // ❌ Any object accepted
});
```

**GOOD** — Runtime validation:
```typescript
function isValidConfigMetadata(v: unknown): v is ConfigMetadata {
  // Validate structure
}
ipcMain.handle("config:metadata:save", (_event, metadata: unknown) => {
  if (!isValidConfigMetadata(metadata)) return false;
  return saveConfigMetadata(metadata);
});
```

**Verification**: Pass invalid metadata (missing providers, string updatedAt). Verify returns `false`. Pass negative version. Verify returns `false`. Pass oversized apiKey. Verify returns `{ success: false }`.

**Discovered in**: IPC security audit found handlers accepting arbitrary objects without validation. Test: `electron/src/__tests__/regression-r128-ipc-input-validation.test.ts`.

### R129: JSON.parse on External Data MUST Be Wrapped in try/catch

`processPendingRequests` in `src/infrastructure/ai-providers/offline-queue-ops.ts` MUST wrap `JSON.parse(request.payload)` in try/catch. On parse failure, the task MUST be marked as `failed` (permanent failure, not retried). The error MUST be logged. The exception MUST NOT propagate, which would abort the entire queue processing.

**BAD** — Uncaught JSON.parse, queue stalls:
```typescript
const payload = JSON.parse(request.payload); // ❌ Throws on corrupt data, stops queue
const success = await processor(request.type, payload);
```

**GOOD** — try/catch, mark as failed:
```typescript
let payload: Record<string, unknown>;
try {
  payload = JSON.parse(request.payload);
} catch (e) {
  await safeRun("UPDATE generation_tasks SET status = 'failed' WHERE id = ?", [request.id]);
  errorLogger.warn("Payload parse failed", e);
  continue; // ✅ Process next task
}
```

**Verification**: Mock `safeQuery` to return task with corrupt JSON payload. Verify task marked as `failed`. Verify no exception thrown. Verify subsequent tasks still processed.

**Discovered in**: Offline queue audit found corrupt payload stalling entire queue. Test: `src/infrastructure/ai-providers/__tests__/regression-r129-json-parse-try-catch.test.ts`.

### R130: Timers MUST Be Cleared on Database Close

`closeDatabase` in `electron/src/database/db-connection.ts` MUST clear all 4 timers: `backupStartupTimer`, `softDeleteStartupTimer`, `backupInterval`, `softDeleteCleanupInterval`. `startScheduledBackup` and `startSoftDeleteCleanup` MUST be idempotent (not create duplicate timers on repeated calls).

**BAD** — Timers not cleared, fire after close:
```typescript
function startScheduledBackup() {
  setTimeout(() => { createBackup(); }, 5000); // ❌ Not saved, can't clear
}
export function closeDatabase() {
  // ❌ No timer cleanup
  db.close();
}
```

**GOOD** — Save and clear timers:
```typescript
let backupStartupTimer: ReturnType<typeof setTimeout> | null = null;
function startScheduledBackup() {
  if (backupStartupTimer || backupInterval) return; // Idempotent
  backupStartupTimer = setTimeout(() => { ... }, 5000);
}
export function closeDatabase() {
  if (backupStartupTimer) { clearTimeout(backupStartupTimer); backupStartupTimer = null; }
  if (softDeleteStartupTimer) { clearTimeout(softDeleteStartupTimer); softDeleteStartupTimer = null; }
  if (backupInterval) { clearInterval(backupInterval); backupInterval = null; }
  if (softDeleteCleanupInterval) { clearInterval(softDeleteCleanupInterval); softDeleteCleanupInterval = null; }
  db.close();
}
```

**Verification**: Spy on `clearTimeout`/`clearInterval`. Call `closeDatabase`. Verify all 4 timers cleared. Call `startScheduledBackup` twice. Verify only one timer created.

**Discovered in**: Database lifecycle audit found startup timers not cleared on close, causing backup to fire after shutdown. Test: `electron/src/database/__tests__/regression-r130-timer-cleanup-on-close.test.ts`.

### R131: PageErrorBoundary.getDerivedStateFromError MUST Be Single-Argument

`getDerivedStateFromError` in `src/shared/presentation/PageErrorBoundary.tsx` MUST accept only a single `error` parameter. The `errorCount` accumulation MUST happen in `componentDidCatch` via `this.setState((prev) => ({ errorCount: prev.errorCount + 1 }))`, NOT in `getDerivedStateFromError`. React only passes `error` to `getDerivedStateFromError` — any second parameter (e.g., `prev`) will always be `undefined`, so reading `prev.errorCount` there would never accumulate.

**BAD** — Two-parameter signature, errorCount never increments:
```typescript
public static getDerivedStateFromError(error: Error, prev: State): Partial<State> {
  // ❌ React only passes `error`, so `prev` is always undefined
  return { hasError: true, error, errorCount: (prev?.errorCount ?? 0) + 1 };
}
```

**GOOD** — Single-argument, accumulate in componentDidCatch:
```typescript
public static getDerivedStateFromError(error: Error): Partial<State> {
  // ✅ Only return hasError + error; do not touch errorCount here
  return { hasError: true, error };
}

public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
  // ✅ errorCount accumulated here using functional setState
  this.setState((prev) => ({ errorCount: prev.errorCount + 1 }));
  errorLogger.error(...);
}
```

**Verification**: Check `getDerivedStateFromError.length === 1`. Trigger multiple errors (with retry in between). Verify `errorCount` increments by 1 each time and `canRetry` flips to `false` once `errorCount >= MAX_RETRY_ATTEMPTS`.

**Discovered in**: P0 fix audit found `getDerivedStateFromError(error, prev)` accepting two parameters, but React only passes `error`, causing `errorCount` to never accumulate and `canRetry` to stay `true` forever. Test: `src/shared/presentation/__tests__/regression-r131-error-boundary-error-count.test.tsx`.

### R132: VideoTasksPage Filter and Refresh MUST Be Wired Up

`useVideoTasksPage` in `src/app/video-tasks/hooks/useVideoTasksPage.ts` MUST expose a working `statusFilter` state, `setStatusFilter` setter, `filteredTasks` (filtered by `statusFilter`), and `handleRefresh` (calls `window.location.reload()`). The `<select>` element MUST bind `value={statusFilter}` and `onChange={setStatusFilter}`. The refresh button MUST bind `onClick={handleRefresh}`.

**BAD** — No state, no binding, refresh button dead:
```typescript
// ❌ No statusFilter state, no setter returned
return { allTasks: tasks, /* no filter, no refresh */ };
// In JSX:
<select>...</select> // ❌ No value/onChange
<button>刷新</button>  // ❌ No onClick
```

**GOOD** — State + filtering + refresh wired:
```typescript
const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
const filteredTasks = useMemo(() => {
  if (statusFilter === "all") return tasks;
  if (statusFilter === "processing") return tasks.filter(t => t.status === "generating" || t.status === "pending");
  // ...
}, [tasks, statusFilter]);
const handleRefresh = () => { window.location.reload(); };
return { allTasks: filteredTasks, statusFilter, setStatusFilter, handleRefresh, ... };
```

**Verification**: Render hook with mixed-status tasks. Verify `setStatusFilter("completed")` filters out non-completed tasks. Verify `handleRefresh` calls `window.location.reload()`. Verify all three (`statusFilter`, `setStatusFilter`, `handleRefresh`) are returned.

**Discovered in**: P0 fix audit found VideoTasksPage `<select>` had no `value`/`onChange` binding and refresh button had no `onClick`, making both controls dead. Test: `src/app/video-tasks/hooks/__tests__/regression-r132-status-filter-and-refresh.test.ts`.

### R133: AssetUploadSection Drag Handlers MUST Not Be Empty Stubs

`AssetUploadSection` in `src/app/asset-library/AssetUploadSection.tsx` MUST actually handle `onDrop`, `onDragOver`, `onDragEnter`, `onDragLeave` events. Empty stub handlers (`() => {}`) are forbidden on the drop zone. The `onDrop` handler MUST either call `onDropFiles(files)` prop or fallback to setting `fileInputRef.current.files` and dispatching a `change` event. The drop zone MUST have `role="button"`, `tabIndex={0}`, and `onKeyDown` handling Enter/Space for keyboard accessibility.

**BAD** — Empty drag handlers, no keyboard support:
```typescript
<div
  onDrop={() => {}}        // ❌ Empty stub
  onDragOver={() => {}}    // ❌ Empty stub
  onDragEnter={() => {}}   // ❌ Empty stub
  onDragLeave={() => {}}   // ❌ Empty stub
>
  拖拽文件到此处
</div>
```

**GOOD** — Real handlers + keyboard support:
```typescript
const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
  e.preventDefault();
  setIsDragOver(false);
  const files = e.dataTransfer.files;
  if (files && files.length > 0) {
    if (onDropFiles) onDropFiles(files);
    else if (fileInputRef.current) {
      // Fallback: transfer files to hidden input and dispatch change
      const dt = new DataTransfer();
      for (const f of files) dt.items.add(f);
      fileInputRef.current.files = dt.files;
      fileInputRef.current.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }
};
<div
  onDrop={handleDrop}
  onDragOver={(e) => e.preventDefault()}
  onDragEnter={(e) => { e.preventDefault(); setIsDragOver(true); }}
  onDragLeave={(e) => { e.preventDefault(); setIsDragOver(false); }}
  role="button"
  tabIndex={0}
  onKeyDown={(e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  }}
>
```

**Verification**: Render with `visible={true}`. Fire `drop` event with files, verify `onDropFiles` called with `FileList`. Fire `dragEnter`/`dragLeave`, verify `borderColor` toggles between `"var(--primary)"` and default. Fire `keyDown` with Enter/Space, verify `fileInputRef.current.click()` called.

**Discovered in**: P0 fix audit found drag handlers were empty stubs — users dragging files into the upload zone got no response. Test: `src/app/asset-library/__tests__/regression-r133-upload-drop-zone.test.tsx`.

### R134: DeleteConfirmDialog MUST Disable Confirm When Entity Is Referenced

`DeleteConfirmDialog` in `src/shared/presentation/DeleteConfirmDialog.tsx` MUST disable the confirm button when `referenceCheck.references.length > 0`. Deleting an entity that is still referenced by other elements would create dangling references. The button MUST also have a `title` attribute explaining why deletion is blocked.

**BAD** — Confirm button always enabled:
```typescript
<button onClick={onConfirm}>  // ❌ No disabled check, user can delete referenced entity
  {isDeleting ? "删除中" : "确认删除"}
</button>
```

**GOOD** — Disable when referenced:
```typescript
<button
  disabled={isDeleting || (referenceCheck?.references.length ?? 0) > 0}
  onClick={onConfirm}
  title={
    (referenceCheck?.references.length ?? 0) > 0
      ? t("delete.cannotDeleteReferenced", { entityLabel })
      : undefined
  }
>
```

**Verification**: Render with `referenceCheck.references.length === 2`. Verify confirm button is disabled and has `title`. Click the disabled button — verify `onConfirm` is NOT called. Render with `references.length === 0`, verify button is enabled and `onConfirm` IS called on click.

**Discovered in**: P0 fix audit found confirm button remained clickable even when the entity had active references, allowing users to delete referenced entities and create dangling references. Test: `src/shared/presentation/__tests__/regression-r134-delete-dialog-disable-on-referenced.test.tsx`.

### R135: useBeatDetail MUST Subscribe via Zustand Selector, NOT Custom setInterval Polling

`useBeatDetail` in `src/app/story/beat/$beatId/use-beat-detail.ts` MUST subscribe to the video task via `useVideoTaskStore((s) => s.allTasks.find((t) => t.beatId === beatId))` selector. The polling-engine is the single source of truth for task status updates. Custom `setInterval` polling in hooks is forbidden because it duplicates the polling-engine's work, wastes API quota, and can desynchronize from the store.

**BAD** — Custom 5s setInterval, duplicates polling-engine:
```typescript
export function useBeatDetail() {
  const [task, setTask] = useState<VideoTask>();
  useEffect(() => {
    const interval = setInterval(async () => {  // ❌ Duplicate polling
      const result = await provider.getTask(beatId);
      if (result.ok) setTask(result.value);
    }, 5000);
    return () => clearInterval(interval);
  }, [beatId]);
}
```

**GOOD** — Zustand selector subscription:
```typescript
export function useBeatDetail() {
  // ✅ Subscribe to store; polling-engine updates the store, this re-renders
  const task = useVideoTaskStore((s) => {
    if (!beatId) return undefined;
    return s.allTasks.find((t) => t.beatId === beatId);
  });
  // No setInterval — polling-engine owns the polling lifecycle
}
```

**Verification**: Spy on `global.setInterval`. Render the hook with mocked `useVideoTaskStore`. Verify `setInterval` is NEVER called. Verify `useVideoTaskStore` is called with a selector function. Call the selector with a state containing matching `beatId` — verify it returns the right task.

**Discovered in**: P0 fix audit found `useBeatDetail` ran a custom 5-second `setInterval` polling task status, duplicating polling-engine work and causing double API calls. Test: `src/app/story/beat/$beatId/__tests__/regression-r135-no-setinterval-polling.test.ts`.

### R136: network-monitor MUST Defer Side Effects to startMonitoring()

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

**Discovered in**: P0 fix audit found `network-monitor.ts` registered `window.__NETWORK_MONITOR_STATE__` at module scope, causing the side effect to fire on any import (including tests and HMR). Test: `src/infrastructure/network/__tests__/regression-r136-no-top-level-side-effects.test.ts`.

### R137: video-cache MUST Defer beforeunload Registration to registerObjectUrl()

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

**Discovered in**: P0 fix audit found `video-cache.ts` registered `beforeunload` at module scope, causing duplicate listeners on HMR and making the module untestable in isolation. Test: `src/infrastructure/storage/__tests__/regression-r137-no-top-level-beforeunload.test.ts`.

### R154: useAssetLoader MUST Load Characters/Scenes/StoryboardAssets via Promise.all

`useAssetLoader` in `src/modules/story/beat-editor/hooks/useAssetLoader.ts` MUST load the three asset sources (`getAllCharacters`, `getAllScenes`, `getStoryboardAssets`) concurrently via `Promise.all([services.A(), services.B(), services.C()])`. Sequential `await` chains are FORBIDDEN — they make first-screen latency equal to `T(chars) + T(scenes) + T(storyboard)` instead of `max(...)`, degrading performance by 50–60%.

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

**Discovered in**: Batch 2 performance optimization audit found sequential `await` chain causing 50–60% first-screen latency regression in the story editor. Test: `src/modules/story/beat-editor/hooks/__tests__/regression-r154-asset-loader-parallel.test.ts`.

### R155: StoryProvider MUST Memoize the services Object Passed to useAssetLoader

`StoryProvider` in `src/app/story/StoryProvider.tsx` MUST wrap the `services` object passed to `useAssetLoader` in `useMemo(..., [])`. The services object literal MUST NOT be inlined at the `useAssetLoader(services)` call site, because `useAssetLoader` has an internal `useEffect` with `[services]` dependency — every re-render would create a new object reference, re-triggering the effect and re-fetching characters/scenes/storyboard from the database.

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

**Discovered in**: Batch 2 performance optimization audit found inline services object causing `useAssetLoader` effect to re-fire on every state change (beat edits, saveStatus toggle), triggering redundant database queries and UI flicker. Test: `src/app/story/__tests__/regression-r155-story-provider-services-memo.test.tsx`.

### R156: useVideoTasksPage Statistics MUST Be Memoized (Single Pass) and timeout Counts as failed

`useVideoTasksPage` in `src/app/video-tasks/hooks/useVideoTasksPage.ts` MUST compute the five statistics (`totalTasks`, `completedTasks`, `processingTasks`, `pendingTasks`, `failedTasks`) via a single `useMemo`-wrapped pass with a `switch` over `task.status`. Five separate `tasks.filter(...)` calls are FORBIDDEN (5× O(n) allocations per render). Additionally, `timeout` status tasks MUST be counted under `failedTasks` (not omitted, not a separate category).

**BAD** — Five filters + missing timeout:
```typescript
const completedTasks = tasks.filter(t => t.status === "completed").length;   // ❌ 5 passes
const processingTasks = tasks.filter(t => t.status === "generating").length; // ❌ 5 passes
const pendingTasks = tasks.filter(t => t.status === "pending").length;      // ❌ 5 passes
const failedTasks = tasks.filter(t => t.status === "failed").length;         // ❌ drops timeout!
// totalTasks also recomputed separately
```

**GOOD** — Single useMemo pass, timeout folded into failed:
```typescript
const { totalTasks, completedTasks, processingTasks, pendingTasks, failedTasks } = useMemo(() => {
  let completed = 0, processing = 0, pending = 0, failed = 0;
  for (const task of tasks) {
    switch (task.status) {
      case "completed": completed++; break;
      case "generating": processing++; break;
      case "pending": pending++; break;
      case "failed":
      case "timeout":   // ✅ timeout folded into failed
        failed++; break;
    }
  }
  return { totalTasks: tasks.length, completedTasks: completed, processingTasks: processing, pendingTasks: pending, failedTasks: failed };
}, [tasks]);
```

**Verification**: Pass mixed-status tasks (pending/generating/completed/failed/timeout) and verify counts are correct, `failedTasks` includes timeout tasks, sum of categories equals `totalTasks`. Change tasks and `rerender` — verify stats recompute (memoize invalidates correctly). Verify `statusFilter='failed'` returns both `failed` and `timeout` tasks.

**Discovered in**: Batch 2 performance optimization audit found 5 sequential `filter` calls creating 5 intermediate arrays per render; also found `timeout` tasks were not folded into `failedTasks`, causing the failed count to disagree with the filtered task list. Test: `src/app/video-tasks/hooks/__tests__/regression-r156-tasks-stats-memo.test.ts`.

### R157: video-cache Size Limits MUST Be Consistent Between Infrastructure and Services Layers

The `MAX_CACHE_BYTES` constant in `src/infrastructure/storage/video-cache.ts` (inside `cacheVideoFile`) MUST be byte-equal to `MAX_TOTAL_BLOB_SIZE_MB * 1024 * 1024` in `src/modules/video/cache/services/video-cache.ts`. Both MUST equal `10 * 1024 * 1024 * 1024` (10 GB). The infrastructure-layer constant serves as a defensive fallback after the services layer (which fires at 90% threshold, ≈9 GB) — if the two constants drift, either the infra limit becomes unreachable dead code (regression to old 2 GB bug) or the two layers disagree on the eviction threshold.

The infrastructure-layer source MUST also retain a comment near `MAX_CACHE_BYTES` mentioning `MAX_TOTAL_BLOB_SIZE_MB`, so future maintainers know to update both together.

**BAD** — Constants drifted (infrastructure layer reverted to 2 GB dead code):
```typescript
// src/infrastructure/storage/video-cache.ts (cacheVideoFile body)
const MAX_CACHE_BYTES = 2 * 1024 * 1024 * 1024; // ❌ 2 GB — services layer already
                                                //     evicts at 9 GB, this never fires
```

```typescript
// src/modules/video/cache/services/video-cache.ts
const MAX_TOTAL_BLOB_SIZE_MB = 10240; // 10 GB — different from infra layer
```

**GOOD** — Both layers aligned at 10 GB with explanatory comment:
```typescript
// src/infrastructure/storage/video-cache.ts (cacheVideoFile body)
// 与 services/video-cache.ts 的 MAX_TOTAL_BLOB_SIZE_MB (10240MB = 10GB) 保持一致。
// services 层在 cacheVideoBlob 调用本方法之前会先做大小检查（保留 70% 阈值），
// 因此此处的 MAX_CACHE_BYTES 主要作为防御性 fallback。
const MAX_CACHE_BYTES = 10 * 1024 * 1024 * 1024; // ✅ 10 GB
```

```typescript
// src/modules/video/cache/services/video-cache.ts
const MAX_TOTAL_BLOB_SIZE_MB = 10240; // ✅ 10 GB
```

**Verification**: Both constants are module-private (not exported), so use `fs.readFileSync` + regex extraction (see R146 domain-purity test pattern). Read both source files, extract `MAX_CACHE_BYTES` (eval the arithmetic expression safely) and `MAX_TOTAL_BLOB_SIZE_MB` (literal number). Assert `MAX_CACHE_BYTES === MAX_TOTAL_BLOB_SIZE_MB * 1024 * 1024`, both equal 10 GB, and the infra source contains a `MAX_TOTAL_BLOB_SIZE_MB` mention within 300 chars of `MAX_CACHE_BYTES`.

**Discovered in**: Batch 2 performance optimization audit found `MAX_CACHE_BYTES` was 2 GB while `MAX_TOTAL_BLOB_SIZE_MB` was 10 GB — the infrastructure-layer limit was dead code (services layer evicted first), masking the inconsistency. Test: `src/infrastructure/storage/__tests__/regression-r157-video-cache-limits-consistency.test.ts`.

---

## R158-R166: Batch 3 UI/UX + i18n 优化回归防护

> 以下规则为批次 3 UI/UX 与国际化优化的回归防护，详细 BAD/GOOD 示例见本节及对应测试文件。

### R158: Toast Hover Pause MUST Use useRef + useState Pattern (Single Timer, No Double Timing)

`ToastItem` in `src/shared/presentation/Toast.tsx` MUST manage auto-dismiss with a single timer driven by `useState(paused)` + `useRef(remainingRef)` + `useRef(startedAtRef)` + `useRef(timerRef)`. On `mouseenter` set `paused=true`; the effect decrements `remainingRef` by the elapsed wall-clock since `startedAtRef`, then clears `timerRef`. On `mouseleave` set `paused=false`; the effect resets `startedAtRef = Date.now()` and schedules a new `setTimeout` for the remaining duration. The progress bar (`animation: toast-progress ${duration}ms linear`) MUST use `animationPlayState: paused ? "paused" : "running"` so the visual bar stays in sync with the logical timer. `ToastProvider.showToast` MUST NOT set its own auto-dismiss `setTimeout` for the same toast — that would create a double timer that fires `onClose` even while paused.

**BAD** — Two timers, hover pause has no effect on dismiss:
```tsx
function ToastItem({ toast, onClose }) {
  const duration = toast.duration ?? 3000;
  // ❌ Provider also sets setTimeout(onClose, duration) — fires while paused
  useEffect(() => {
    const t = setTimeout(onClose, duration);
    return () => clearTimeout(t);
  }, [duration, onClose]);
  // ❌ No paused state, no remainingRef, progress bar keeps animating on hover
}
```

**GOOD** — Single source of truth, paused state controls both timer and progress bar:
```tsx
function ToastItem({ toast, onClose }) {
  const duration = toast.duration ?? DEFAULT_DURATION[toast.type];
  const [paused, setPaused] = useState(false);
  const remainingRef = useRef(duration);
  const startedAtRef = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (toast.exiting || duration === 0) return;
    if (paused) {
      remainingRef.current -= Date.now() - startedAtRef.current;
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    } else {
      startedAtRef.current = Date.now();
      timerRef.current = setTimeout(onClose, remainingRef.current);
    }
    return () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } };
  }, [paused, toast.exiting, duration, onClose]);
  // progress bar:
  <div style={{ animation: `toast-progress ${duration}ms linear forwards`, animationPlayState: paused ? "paused" : "running" }} />
}
```

**Verification**: Render a Toast with fake timers. Verify hovering sets `paused=true` and the progress bar's `animationPlayState` is `"paused"`. Advance fake timers past `duration` while hovered — assert `onClose` NOT called. Un-hover — assert a new timer scheduled for the remaining time, and after that elapses `onClose` IS called. Verify `ToastProvider.showToast` does not register a separate auto-dismiss timer for the same toast id.

**Discovered in**: Batch 3 P0-1 Toast hover pause optimization. Test: `src/shared/presentation/__tests__/regression-r158-toast-hover-pause.test.tsx`.

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

### R160: Modal Components MUST Use the Unified `<Modal>` Component

Dialog components that render an overlay + centered panel + Escape-to-close + aria-modal MUST use the shared `Modal` component at `src/shared/presentation/Modal.tsx`. The `Modal` component provides `role="dialog"`, `aria-modal="true"`, `aria-label` (or `aria-labelledby`), `tabIndex={-1}` on the container (for screen reader focus), Escape key handling, and overlay-click-to-close. New dialog components MUST NOT re-implement these primitives inline (custom `<div className="modal-overlay">` + manual `keydown` listener + manual `aria-modal`).

**BAD** — Re-implements overlay/Escape/aria inline:
```tsx
function MyDialog({ open, onClose }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
        {/* ... */}
      </div>
    </div>
  ); // ❌ Duplicated boilerplate, no container focus, drift across dialogs
}
```

**GOOD** — Delegates to unified `<Modal>`:
```tsx
import { Modal } from "@/shared/presentation/Modal";
function MyDialog({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} ariaLabel="My dialog" style={{ maxWidth: 480 }}>
      {/* ... */}
    </Modal>
  ); // ✅ Single source of truth for overlay/Escape/aria-modal/focus
}
```

**Verification**: Grep the migrated modal files (OutfitDialog, SwitchConfirmDialog, BulkDeleteDialog, DeleteConfirmDialog, TaskDetailDialog, TaskTrackingDialog, VideoPreviewDialog, task-detail-dialog, TemplateSelectDialog, AssetEditDialog, AssetCollectionDialogs, VersionDialog, SyncConflictPanel, SyncSettingsPanel, BatchOperations, ReferenceVideoUploader, ProjectExportImport, confirm.tsx, story/page.tsx) for an `import` of `Modal` from `@/shared/presentation/Modal`. Assert the `Modal` component renders `role="dialog"`, `aria-modal="true"`, and a focusable container (`tabIndex={-1}`) when `open=true`.

**Discovered in**: Batch 3 P0-6 + P2-11 unified Modal component migration. Test: `src/shared/presentation/__tests__/regression-r160-modal-component-required.test.tsx`.

### R161: IconButton MUST Require aria-label (No Unlabeled Icon-Only Buttons)

`IconButton` in `src/shared/presentation/IconButton.tsx` MUST declare `aria-label: string` as a REQUIRED prop in `IconButtonProps`. It MUST NOT render an icon-only `<button>` without an `aria-label`. Icon-only buttons (close, delete, settings, etc.) are invisible to screen readers without an accessible name; the only purpose of `IconButton` over a plain `<button>` is to enforce the accessible-name contract. The component MUST pass `aria-label` through to the underlying `<button>` element so assistive tech can announce it.

**BAD** — Optional aria-label, silent a11y regression:
```tsx
interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  aria-label?: string; // ❌ optional — caller can omit, button has no accessible name
  variant?: IconButtonVariant;
}
export function IconButton({ "aria-label": label, ...rest }) {
  return <button {...rest}>{/* icon */}</button>; // ❌ label may be undefined
}
// caller:
<IconButton onClick={close}><X /></IconButton> // ❌ screen reader: "button" with no name
```

**GOOD** — Required aria-label enforced at compile time:
```tsx
export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  "aria-label": string; // ✅ required — TS error if omitted
  variant?: IconButtonVariant;
  children: ReactNode;
}
export function IconButton({ "aria-label": ariaLabel, variant = "ghost", type = "button", className = "", children, ...rest }) {
  return <button type={type} aria-label={ariaLabel} className={...} {...rest}>{children}</button>;
}
// caller MUST supply:
<IconButton aria-label="关闭" onClick={close}><X /></IconButton> // ✅ screen reader: "关闭"
```

**Verification**: Read `IconButton.tsx` source — assert the `IconButtonProps["aria-label"]` type is `string` (not `string | undefined`, not optional). Render `<IconButton aria-label="删除"><X /></IconButton>` and assert the rendered button has `getAttribute("aria-label") === "删除"` and is queryable via `getByRole("button", { name: "删除" })`. Verify a missing `aria-label` is a TypeScript compile error (covered by `typecheck:test`).

**Discovered in**: Batch 3 P2-12 IconButton a11y component. Test: `src/shared/presentation/__tests__/regression-r161-icon-button-aria-required.test.tsx`.

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

### R163: Global :focus-visible Style MUST Live in globals.css (Single Source for Keyboard Focus Ring)

The keyboard focus ring for interactive elements (`button`, `a`, `[tabindex]`) MUST be defined once in `src/app/globals.css` as a `:focus-visible` rule, using `outline: 2px solid var(--ring, var(--primary))` and `outline-offset: 2px`. A companion `button:focus:not(:focus-visible), a:focus:not(:focus-visible) { outline: none }` rule MUST suppress the ring for mouse clicks. Individual components MUST NOT override `:focus-visible` per-component (per-component overrides cause drift: some buttons get a ring, others don't). Components MAY add a `border-radius` via the shared rule, but MUST NOT set their own `outline` for focus.

**BAD** — Per-component focus styles, inconsistent ring:
```css
/* Foo.module.css */
.btn-foo:focus { outline: 1px solid blue; } /* ❌ mouse click shows ring, different color */
```
```tsx
<button className="..." style={{ outline: '2px solid red' }}>...</button> /* ❌ hardcoded */
```

**GOOD** — Global rule, all interactive elements inherit:
```css
/* src/app/globals.css */
:focus-visible {
  outline: 2px solid var(--ring, var(--primary));
  outline-offset: 2px;
  border-radius: 4px;
}
button:focus:not(:focus-visible),
a:focus:not(:focus-visible) {
  outline: none;
}
```

**Verification**: Read `src/app/globals.css` and assert (via regex) a `:focus-visible` rule exists with `outline` declaration, AND a `button:focus:not(:focus-visible)` / `a:focus:not(:focus-visible)` rule exists with `outline: none`. Grep `src/**/*.css` and `src/**/*.tsx` for inline `outline:` style props on focusable elements and flag any non-global focus ring definitions.

**Discovered in**: Batch 3 P0-3 global focus-visible style. Test: `src/app/__tests__/regression-r163-focus-visible-style.test.ts`.

### R164: Modal MUST Focus Its Container on Open (tabIndex={-1}) for Screen Readers

When `Modal` opens (`open` transitions false→true), it MUST call `modalRef.current?.focus()` so the dialog container receives keyboard focus. The container MUST have `tabIndex={-1}` so a `<div>` is focusable programmatically (a normal div cannot receive `.focus()`). This is required by WAI-ARIA for screen reader users: without container focus, the screen reader stays on the trigger element and the modal content is not announced. The Escape handler and overlay-click handler MUST be registered only while `open===true`.

**BAD** — No container focus, screen reader stranded on trigger:
```tsx
function Modal({ open, onClose, children }) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true">{children}</div>
      {/* ❌ no tabIndex, no focus() call — SR stays on trigger */}
    </div>
  );
}
```

**GOOD** — Container focuses on open:
```tsx
function Modal({ open, onClose, children, ariaLabel }) {
  const modalRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose); onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", handleKeyDown);
    modalRef.current?.focus(); // ✅ SR announces dialog
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div ref={modalRef} className="modal" role="dialog" aria-modal="true" aria-label={ariaLabel} tabIndex={-1}>{children}</div>
    </div>
  );
}
```

**Verification**: Render `<Modal open={true} ...>` and assert the container element (found via `role="dialog"`) has `tabIndex === -1` and is `document.activeElement` after the open effect runs. Toggle `open` false→true and assert focus moves to the container. Verify the Escape key handler is only attached while `open===true` (spy on `window.addEventListener`).

**Discovered in**: Batch 3 P0-6 + R164 a11y hardening of unified Modal. Test: `src/shared/presentation/__tests__/regression-r164-modal-focus-trap.test.tsx`.

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

---

## R167-R180: 深度审计全量修复回归防护

> 以下规则为深度审计 P0+P1+P2 全量修复的无障碍（a11y）、i18n、工程质量回归防护。
> 详细 BAD/GOOD 示例及测试文件见各规则下文。

### R167: 自定义模态框必须使用 Modal 组件或补 role/aria-modal

当组件需要渲染模态对话框（fixed inset-0 overlay + 居中面板）时，必须使用统一的 `<Modal>` 组件（`src/shared/presentation/Modal.tsx`），该组件已内置 `role="dialog"`、`aria-modal="true"`、`aria-label`、`tabIndex={-1}`、Escape 关闭、overlay 点击关闭。若因特殊原因不能使用 `<Modal>`，则必须手动补齐 `role="dialog" aria-modal="true" aria-label={...}`。裸 `<div className="fixed inset-0 z-50">` 无 ARIA 语义，屏幕阅读器无法识别为对话框。

**BAD** — 裸 div overlay 无 ARIA 语义：
```tsx
<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
  <div className="bg-white rounded-lg p-6">{children}</div>
</div>
```

**GOOD** — 使用统一 Modal 组件：
```tsx
<Modal open={open} onClose={onClose} ariaLabel={t("dialog.title")}>
  {children}
</Modal>
```

**GOOD** — 手动补齐 ARIA（仅在无法使用 Modal 时）：
```tsx
<div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={t("dialog.title")}>
  <div className="bg-white rounded-lg p-6">{children}</div>
</div>
```

**Verification**: Grep `src/**/*.tsx` for `fixed inset-0` 的 div，确认每个匹配项要么使用 `<Modal>` 组件，要么有 `role="dialog" aria-modal="true"`。

**Discovered in**: 深度审计 a11y 修复。Test: `src/shared/presentation/__tests__/regression-r167-custom-modal-role.test.tsx`。

### R168: 纯图标按钮必须有 aria-label

纯图标按钮（按钮内仅含图标无文字）必须提供 `aria-label`，使屏幕阅读器能朗读按钮用途。使用 `<IconButton>` 组件（强制 aria-label prop）或手动在 `<button>` 上添加 `aria-label`。无 aria-label 的纯图标按钮对屏幕阅读器用户不可用。

**BAD** — 纯图标按钮无 aria-label：
```tsx
<button onClick={onClose}>
  <X className="h-4 w-4" />
</button>
```

**GOOD** — 使用 IconButton 组件（强制 aria-label）：
```tsx
<IconButton aria-label={t("aria.close")} onClick={onClose}>
  <X className="h-4 w-4" />
</IconButton>
```

**GOOD** — 手动补 aria-label：
```tsx
<button aria-label={t("aria.close")} onClick={onClose}>
  <X className="h-4 w-4" />
</button>
```

**Verification**: Grep `src/**/*.tsx` for 含 lucide 图标的 `<button>`，确认每个纯图标按钮有 `aria-label` 或使用 `<IconButton>`。

**Discovered in**: 深度审计 a11y 修复。Test: `src/shared/presentation/__tests__/regression-r168-icon-button-aria.test.tsx`。

### R169: div onClick 必须补 role="button"/tabIndex/onKeyDown

当 `<div>` 用作可点击按钮（有 `onClick`）时，必须补齐 `role="button"`、`tabIndex={0}`、`onKeyDown`（处理 Enter/Space），以及 `aria-label`。裸 `<div onClick>` 对键盘用户不可达，对屏幕阅读器用户不可识别为按钮。

**BAD** — div onClick 无 ARIA/键盘支持：
```tsx
<div onClick={handleClick} className="cursor-pointer">
  {label}
</div>
```

**GOOD** — 补齐 role/tabIndex/onKeyDown/aria-label：
```tsx
<div
  role="button"
  tabIndex={0}
  onClick={handleClick}
  onKeyDown={(e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  }}
  aria-label={label}
  className="cursor-pointer"
>
  {label}
</div>
```

**Verification**: Grep `src/**/*.tsx` for `<div` + `onClick`，确认每个匹配项有 `role="button"` 和 `tabIndex`。

**Discovered in**: 深度审计 a11y 修复。Test: `src/shared/presentation/__tests__/regression-r169-div-onclick-role.test.tsx`。

### R170: Tab 模式必须使用 Tabs 组件

当 UI 实现标签页切换（多个 button 切换 active 状态）时，必须使用统一的 `<Tabs>` 组件（`src/shared/presentation/Tabs.tsx`），该组件已内置 `role="tablist"`、`role="tab"`、`aria-selected`、roving tabindex、键盘导航（ArrowLeft/Right/Home/End）。手写多个 button 作为 tab 缺少 ARIA 语义和键盘支持。

**BAD** — 手写 tab 按钮无 ARIA 语义：
```tsx
<div className="top-tabs">
  {tabs.map((tab) => (
    <button
      key={tab.id}
      className={cn("top-tab", activeTab === tab.id && "active")}
      onClick={() => onChange(tab.id)}
    >
      {tab.label}
    </button>
  ))}
</div>
```

**GOOD** — 使用统一 Tabs 组件：
```tsx
<Tabs
  tabs={[{ id: "all", label: t("tab.all") }, { id: "done", label: t("tab.done") }]}
  activeTab={activeTab}
  onChange={onChange}
/>
```

**Verification**: Grep `src/**/*.tsx` for `top-tab-btn` 或手写 tab 模式，确认使用 `<Tabs>` 组件。

**Discovered in**: 深度审计 a11y 修复。Test: `src/shared/presentation/__tests__/regression-r170-tabs-component.test.tsx`。

### R171: 表单控件必须有 label 关联

表单控件（`<input>`、`<select>`、`<textarea>`）必须有可见 label 关联（`<label htmlFor={id}>` + `id`）或 `aria-label`/`aria-labelledby`。无 label 的表单控件对屏幕阅读器用户不可用。

**BAD** — input 无 label：
```tsx
<input
  type="text"
  value={value}
  onChange={(e) => onChange(e.target.value)}
  placeholder="输入名称"
/>
```

**GOOD** — label + htmlFor 关联：
```tsx
<label htmlFor="char-name">{t("form.name")}</label>
<input
  id="char-name"
  type="text"
  value={value}
  onChange={(e) => onChange(e.target.value)}
/>
```

**GOOD** — aria-label（当可见 label 不适用时）：
```tsx
<input
  type="text"
  aria-label={t("form.name")}
  value={value}
  onChange={(e) => onChange(e.target.value)}
/>
```

**Verification**: Grep `src/**/*.tsx` for `<input`、`<select`、`<textarea`，确认每个控件有 label 关联或 aria-label。

**Discovered in**: 深度审计 a11y 修复。Test: `src/app/__tests__/regression-r171-form-label-association.test.tsx`。

### R172: 进度条必须有 role="progressbar"

进度条（`<div className="progress-bar">`）必须有 `role="progressbar"`、`aria-valuenow`、`aria-valuemin={0}`、`aria-valuemax={100}`，使屏幕阅读器能朗读进度。裸 div 进度条对屏幕阅读器用户不可感知。

**BAD** — 进度条无 ARIA：
```tsx
<div className="progress-bar h-2">
  <div className="progress-fill" style={{ width: `${progress}%` }} />
</div>
```

**GOOD** — 补齐 role 和 aria 属性：
```tsx
<div
  className="progress-bar h-2"
  role="progressbar"
  aria-label={t("common.generating")}
  aria-valuenow={progress}
  aria-valuemin={0}
  aria-valuemax={100}
>
  <div className="progress-fill" style={{ width: `${progress}%` }} />
</div>
```

**Verification**: Grep `src/**/*.tsx` for `progress-bar`，确认每个进度条有 `role="progressbar"`。

**Discovered in**: 深度审计 a11y 修复。Test: `src/modules/asset/presentation/__tests__/regression-r172-progressbar-role.test.tsx`。

### R173: 动态状态变化必须有 aria-live

动态变化的状态文本（如任务计数、进度百分比、轮询结果）必须放在 `role="status" aria-live="polite"` 容器中，使屏幕阅读器在内容变化时自动朗读。无 aria-live 的动态文本对屏幕阅读器用户不可感知。

**BAD** — 动态计数无 aria-live：
```tsx
<div className="flex items-center gap-4 text-sm">
  <span>已完成 {completedCount}</span>
  <span>失败 {failedCount}</span>
</div>
```

**GOOD** — 容器补 role="status" aria-live="polite"：
```tsx
<div className="flex items-center gap-4 text-sm" role="status" aria-live="polite">
  <span>{t("asset.completedCount", { count: completedCount })}</span>
  <span>{t("asset.failedCount", { count: failedCount })}</span>
</div>
```

**Verification**: Grep `src/**/*.tsx` for 动态数字容器，确认有 `role="status" aria-live="polite"`。

**Discovered in**: 深度审计 a11y 修复。Test: `src/modules/asset/presentation/__tests__/regression-r173-aria-live.test.tsx`。

### R174: 装饰性 emoji 必须 aria-hidden

装饰性 emoji（如 🗑、🌅、📤）必须添加 `aria-hidden="true"`，防止屏幕阅读器朗读 emoji 的冗长描述。当 emoji 旁有文字 label 时，emoji 纯装饰；当 emoji 是唯一内容时，应补 aria-label 或改用图标组件。

**BAD** — 装饰性 emoji 无 aria-hidden：
```tsx
<button onClick={onDelete}>
  <span>🗑</span> 删除
</button>
```

**GOOD** — emoji aria-hidden：
```tsx
<button onClick={onDelete}>
  <span aria-hidden="true">🗑</span> {t("common.delete")}
</button>
```

**Verification**: Grep `src/**/*.tsx` for emoji 字符（🗑🌅📤📥✨▶️ 等），确认装饰性 emoji 有 `aria-hidden="true"`。

**Discovered in**: 深度审计 a11y 修复。Test: `src/modules/story/beat-editor/presentation/__tests__/regression-r174-emoji-aria-hidden.test.tsx`。

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
