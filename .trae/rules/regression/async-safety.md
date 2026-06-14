# 二、异步安全

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
