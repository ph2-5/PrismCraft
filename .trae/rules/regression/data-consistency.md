# 一、数据一致性

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
