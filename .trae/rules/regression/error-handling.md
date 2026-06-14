# 三、错误处理

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
