# 八、系统安全

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
// Directly use user-configured URL without SSRF check
const response = await fetch(userConfiguredUrl);
```

**BAD** — Trust all user-configured endpoints without validation:
```typescript
// Skip SSRF check because "user configured it"
if (isUserConfigured(url)) {
  return makeRequest(url); // ❌ DNS rebinding vulnerability
}
```

**GOOD** — Validate non-loopback hosts via ssrfGuard:
```typescript
import { ssrfGuard } from "../security/ssrf-guard/ssrf-guard";

const parsed = new URL(userConfiguredUrl);
const isLoopback = parsed.hostname === "127.0.0.1"
  || parsed.hostname === "localhost"
  || parsed.hostname === "::1";

if (!isLoopback) {
  const validation = await ssrfGuard.validate(parsed);
  if (!validation.safe) {
    return { ok: false, error: new Error(`SSRF blocked: ${validation.reason}`) };
  }
}
return await makeRequest(userConfiguredUrl);
```

**Verification**: Check `electron/src/api/route-groups/core-routes.ts` `test-connection` handler and any code path that makes outbound requests to user-configured hosts. Verify: (1) loopback hosts bypass SSRF, (2) non-loopback hosts call `ssrfGuard.validate`, (3) `unsafe` result blocks the request.

**Discovered in**: Security audit found that `ssrfGuard` module was available but not enforced for user-configured AI provider endpoints. DNS rebinding could allow attackers to redirect requests to internal network addresses. Test: `electron/src/__tests__/r105-ssrf-user-host-dns-rebinding.test.ts`.

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

### R131: SQLite 外键约束必须启用（PRAGMA foreign_keys = ON）

数据库连接创建后必须执行 `PRAGMA foreign_keys = ON`，确保 SQLite 外键约束被启用。`initDatabase` 在执行 schema SQL 前必须调用 `db.pragma("foreign_keys = ON")`。外键约束未启用时，可以插入违反外键关系的数据（如指向不存在的 `story_id` 的 `video_task`），导致数据库一致性被破坏，可能引发数据泄漏、孤儿记录或应用逻辑错误。数据库恢复路径（关闭后重新初始化）也必须重新启用外键约束。

**BAD** — 外键约束未启用：
```typescript
function initDatabase() {
  const db = new BetterSqlite3(DB_PATH);
  db.exec(getSchemaSQL()); // ❌ 未先执行 PRAGMA foreign_keys = ON
  return db;
}
```

**GOOD** — 启用外键约束：
```typescript
function initDatabase() {
  const db = new BetterSqlite3(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON"); // ✅ 在 schema 执行前启用
  db.exec(getSchemaSQL());
  return db;
}
```

**Verification**: 调用 `initDatabase`，验证 `db.pragma` 被调用且参数包含 `"foreign_keys = ON"`。验证 `getSchemaSQL()` 输出包含 `foreign_keys = ON`。验证数据库恢复路径也调用 `pragma("foreign_keys = ON")`。

**Discovered in**: 数据库完整性审计发现外键约束未启用，允许插入违反外键关系的孤儿记录。Test: `electron/src/database/__tests__/regression-r131-foreign-keys-enabled.test.ts`。

### R132: sync-http-client 发起 HTTP 请求前必须调用 SSRF 校验

`makeSyncRequest` in `electron/src/sync-http-client.ts` MUST call `ssrfGuard.validate(url)` before initiating any HTTP/HTTPS request. If `ssrfGuard.validate` returns `{ safe: false }`, the request MUST be rejected with an error containing "URL blocked by SSRF guard", and no HTTP request MUST be initiated. 攻击者配置恶意同步服务器 URL（如 `http://169.254.169.254/latest/meta-data/`），若不校验则可访问云元数据端点获取敏感凭证，或访问内网服务（如 `http://127.0.0.1:8080/admin`）造成内网探测。

**BAD** — 不校验 SSRF，直接发起请求：
```typescript
async function makeSyncRequest(url: string, options) {
  const req = http.request(url, options); // ❌ 未调用 ssrfGuard.validate
  return handleResponse(req);
}
```

**GOOD** — 发起请求前校验 SSRF：
```typescript
async function makeSyncRequest(url: string, options) {
  const validation = await ssrfGuard.validate(url);
  if (!validation.safe) {
    throw new Error(`URL blocked by SSRF guard: ${validation.reason}`);
  }
  const req = http.request(url, options); // ✅ 校验通过后才请求
  return handleResponse(req);
}
```

**Verification**: Mock `ssrfGuard.validate` 返回 `{ safe: false }`，调用 `makeSyncRequest`，验证抛出包含 "URL blocked by SSRF guard" 的错误，且 `http.request`/`https.request` 未被调用。Mock 返回 `{ safe: true }` 时验证请求正常发起。

**Discovered in**: 同步客户端 SSRF 审计发现 `makeSyncRequest` 未校验 URL，允许访问内网和云元数据端点。Test: `electron/src/__tests__/regression-r132-sync-http-client-ssrf.test.ts`。

### R133: SSRF 校验异常时必须 fail-close（视为私有 URL）

`isPrivateUrl` MUST return `true` (treat as private URL) when `ssrfGuard.validate` throws an exception, blocking the request. This is the fail-close strategy — when validation fails, the request MUST be blocked. A fail-open implementation (returning `false` on exception) would let an attacker craft a URL that crashes the SSRF resolver (e.g. via DNS timeout on a non-existent domain) to bypass the private-URL check and reach internal services or cloud metadata endpoints.

**BAD** — Fail-open（异常时放行）：
```typescript
async function isPrivateUrl(url: string): Promise<boolean> {
  try {
    const result = await ssrfGuard.validate(url);
    return !result.safe;
  } catch (e) {
    return false; // ❌ fail-open — 攻击者通过构造异常 URL 绕过 SSRF
  }
}
```

**GOOD** — Fail-close（异常时阻止）：
```typescript
async function isPrivateUrl(url: string): Promise<boolean> {
  try {
    const result = await ssrfGuard.validate(url);
    return !result.safe;
  } catch (e) {
    return true; // ✅ fail-close — 视为私有 URL，阻止请求
  }
}
```

**Verification**: Mock `ssrfGuard.validate` 抛出异常，调用 `isPrivateUrl`，验证返回 `true`。验证异常情况下请求被阻止。

**Discovered in**: SSRF fail-close 一致性审计发现 `isPrivateUrl` 在异常时 fail-open，允许攻击者通过构造 DNS 解析异常的 URL 绕过 SSRF 防护。Test: `electron/src/__tests__/regression-r133-ssrf-fail-close.test.ts`。

### R137: db-interface 错误消息中的 params 必须经 sanitizeParams 脱敏

`BetterSqlite3Statement` (and related db-interface error paths) MUST pass `params` through `sanitizeParams` before including them in error messages. `sanitizeParams` MUST truncate long strings (>100 characters) to prevent sensitive information (API Keys, passwords, long payloads) from leaking into log files or error messages. Raw `params` MUST NOT appear in any error message or log entry.

**BAD** — 错误消息包含原始 params：
```typescript
function safeRun(sql: string, params: unknown[]) {
  try {
    return stmt.run(...params);
  } catch (e) {
    throw new Error(`SQL failed: ${sql}, params: ${JSON.stringify(params)}`); // ❌ 原始 params 泄漏
  }
}
```

**GOOD** — params 经 sanitizeParams 脱敏：
```typescript
function safeRun(sql: string, params: unknown[]) {
  try {
    return stmt.run(...params);
  } catch (e) {
    const sanitized = sanitizeParams(params); // ✅ 长字符串截断
    throw new Error(`SQL failed: ${sql}, params: ${JSON.stringify(sanitized)}`);
  }
}
```

**Verification**: Mock 数据库操作抛出异常，params 包含长字符串（>100 字符）。验证错误消息中的 params 已被截断，不包含完整原始字符串。验证短字符串 params 正常显示。

**Discovered in**: 数据库错误消息审计发现原始 params 包含 API Key 等敏感信息，泄漏到日志文件。Test: `electron/src/database/__tests__/regression-r137-param-sanitization.test.ts`。

### R138: schema-builder Identifiers MUST Be Wrapped in Double Quotes

`generateTableSQL` and `generateJunctionTableSQL` in `electron/src/database/schema-builder.ts` MUST wrap all table names and column names in double quotes (`"`) in the generated SQL — including `CREATE TABLE`, `INDEX`, and `CHECK` constraint clauses. Double quotes are SQLite's standard identifier quoting mechanism. Without quoting, a maliciously crafted table/column name (e.g. `users; DROP TABLE users--`) could inject arbitrary SQL.

**BAD** — Identifiers unquoted (SQL injection risk):
```typescript
function generateTableSQL(def: TableDef): string {
  // ❌ table/column names concatenated raw, no quoting
  let sql = `CREATE TABLE IF NOT EXISTS ${def.name} (id TEXT PRIMARY KEY)`;
  for (const [col, conf] of Object.entries(def.columns)) {
    sql += `, ${col} ${conf.type}`; // ❌ unquoted column
  }
  return sql;
}
```

**GOOD** — Identifiers wrapped in double quotes:
```typescript
function generateTableSQL(def: TableDef): string {
  let sql = `CREATE TABLE IF NOT EXISTS "${def.name}" ("id" TEXT PRIMARY KEY)`;
  for (const [col, conf] of Object.entries(def.columns)) {
    sql += `, "${col}" ${conf.type}`; // ✅ quoted identifier
  }
  // INDEX clauses also quoted: ON "test_table"("ref_id")
  return sql;
}
```

**Verification**: Call `generateTableSQL` / `generateJunctionTableSQL` with sample `TableDef`. Assert output contains `"table_name"` in `CREATE TABLE`, quoted column names, quoted `INDEX` clauses (`ON "table"("col")`), and quoted columns inside `CHECK` constraints.

**Discovered in**: SQL injection hardening audit of schema-builder. Test: `electron/src/database/__tests__/regression-r138-schema-builder-quotes.test.ts`.

### R139: validateSqlIdentifier MUST Use `^[a-zA-Z_][a-zA-Z0-9_]*$` Regex

`VALID_TABLE_IDENTIFIER` (and `validateSqlIdentifier`) in `electron/src/database/db-connection.ts` MUST use the regex `/^[a-zA-Z_][a-zA-Z0-9_]*$/` to validate identifiers. The regex MUST reject any identifier containing special characters (`;`, quotes, spaces, hyphens). Weakening the regex (e.g. allowing semicolons or quotes) would allow a crafted table name like `users; DROP TABLE users--` to pass validation and enable SQL injection. The regex only permits letters, digits, and underscores, and MUST start with a letter or underscore.

**BAD** — Overly permissive regex (allows injection):
```typescript
// ❌ allows spaces, semicolons, hyphens → injection possible
const VALID_TABLE_IDENTIFIER = /^[a-zA-Z_][\w\s;-]*$/;
```

**GOOD** — Strict regex (letters/digits/underscore only):
```typescript
// ✅ only letters, digits, underscore; must start with letter/underscore
const VALID_TABLE_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export function validateSqlIdentifier(name: string): boolean {
  return VALID_TABLE_IDENTIFIER.test(name);
}
```

**Verification**: Read `db-connection.ts` source, extract the `VALID_TABLE_IDENTIFIER` regex literal. Assert the pattern equals `^[a-zA-Z_][a-zA-Z0-9_]*$`. Feed malicious identifiers (`users; DROP TABLE`, `"weird"name`, `a-b`) and verify all are rejected.

**Discovered in**: SQL identifier validation hardening audit. Test: `electron/src/database/__tests__/regression-r139-identifier-validation.test.ts`.

### R142: api-gateway-utils isPrivateUrl MUST Fail-Close on Exceptions

`isPrivateUrl` in `electron/src/api-gateway-utils.ts` MUST return `true` (treat as private) when `ssrfGuard.validate` throws an exception, blocking the request — consistent with the fail-close behavior in `test-connection.ts`. A fail-open implementation (returning `false` on exception) would let an attacker craft a URL that crashes the SSRF resolver to bypass the private-URL check and reach internal services.

**BAD** — Fail-open (exception bypasses SSRF):
```typescript
async function isPrivateUrl(url: string): Promise<boolean> {
  try {
    const result = await ssrfGuard.validate(url);
    return !result.safe;
  } catch (e) {
    return false; // ❌ fail-open — attacker bypasses SSRF by crashing resolver
  }
}
```

**GOOD** — Fail-close (exception blocks request):
```typescript
async function isPrivateUrl(url: string): Promise<boolean> {
  try {
    const result = await ssrfGuard.validate(url);
    return !result.safe;
  } catch (e) {
    return true; // ✅ fail-close — treat as private, block the request
  }
}
```

**Verification**: Mock `ssrfGuard.validate` to reject with an error. Call `makeRequest`. Assert it throws `/private|internal/i`. Then mock `validate` to resolve with `{ safe: false }`; assert the request is still blocked.

**Discovered in**: SSRF fail-close consistency audit found api-gateway-utils diverging from test-connection.ts. Test: `electron/src/__tests__/regression-r142-api-gateway-ssrf-fail-close.test.ts`.

### R143: validateSql MUST Defend Against Double-Quote Table-Name Whitelist Bypass

`validateSql` in `electron/src/handlers/database.ts` MUST correctly extract table names wrapped in double quotes when checking against `ALLOWED_TABLES`. The table-name extraction regex MUST tolerate optional double quotes (`"?`) so that `SELECT * FROM "secret_table"` is still matched and rejected for non-whitelisted tables. Without the quote-tolerant regex, the pattern `FROM\s+([a-zA-Z_][a-zA-Z0-9_]*)` fails to match quoted identifiers, letting non-whitelisted tables bypass the whitelist.

**BAD** — Regex misses quoted table names:
```typescript
// ❌ does not match "secret_table" → non-whitelisted table bypasses check
const fromRegex = /FROM\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi;
```

**GOOD** — Regex tolerates optional double quotes:
```typescript
// ✅ optional "? captures table name whether quoted or not
const fromRegex = /FROM\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?(?:\s|$)/gi;
// "secret_table" now matched → rejected as non-whitelisted
```

**Verification**: Call `validateSql` with `SELECT * FROM "secret_table"`. Assert it throws `/not in the allowed list/i`. Repeat with unquoted `secret_table`, `INSERT INTO "secret_table" ...`, and `UPDATE "secret_table" ...` — all must throw. Whitelisted tables (e.g. `users`) with quotes must pass.

**Discovered in**: SQL whitelist bypass audit found quoted table names evading the `FROM` regex. Test: `electron/src/handlers/__tests__/regression-r143-validate-sql-quote-bypass.test.ts`.

### R144: SSRF Guard MUST Perform Dual-Stack DNS Resolution (IPv4 + IPv6)

`ssrfGuard.validate` in `electron/src/security/ssrf-guard/ssrf-guard.ts` MUST resolve both IPv4 (`dns.resolve4`) and IPv6 (`dns.resolve6`) addresses in parallel via `Promise.all` and check both for private IP ranges. Checking only IPv4 lets an attacker configure DNS to return a public IPv4 + private IPv6; the client may then connect over IPv6 to an internal service (DNS rebinding). If either stack resolves to a private address, the request MUST be rejected.

**BAD** — Only IPv4 checked (IPv6 rebinding):
```typescript
async validate(url: string) {
  const v4 = await resolve4(hostname); // ❌ IPv6 never checked
  if (v4.some(isPrivateV4)) return { safe: false };
  return { safe: true }; // attacker's public-v4 + private-v6 domain passes
}
```

**GOOD** — Parallel dual-stack check:
```typescript
async validate(url: string) {
  const [v4, v6] = await Promise.all([ // ✅ both stacks resolved
    resolve4(hostname),
    resolve6(hostname),
  ]);
  if (v4.some(isPrivateV4) || v6.some(isPrivateV6)) {
    return { safe: false, reason: "private IP detected" };
  }
  return { safe: true };
}
```

**Verification**: Mock `dns.resolve4` to return a private IPv4 (`10.0.0.1`) and `resolve6` to return empty; assert `safe === false`. Reverse: mock `resolve4` empty and `resolve6` to return `::1`; assert `safe === false`. Mock both public; assert `safe === true`.

**Discovered in**: SSRF dual-stack audit found single-stack (IPv4-only) resolution vulnerable to DNS rebinding. Test: `electron/src/__tests__/regression-r144-ssrf-dual-stack-check.test.ts`.

### R145: isSensitiveQuery MUST Detect CTE and RETURNING Clauses for Redaction

`isSensitiveQuery` in `electron/src/handlers/database.ts` MUST recognize CTE (`WITH ... SELECT`) and `RETURNING` clauses that reference sensitive tables (`sessions`, `error_logs`, `sync_conflict_backup`), and flag such queries for result redaction. Checking only simple `SELECT` lets an attacker exfiltrate sensitive data via `WITH x AS (SELECT * FROM sessions) SELECT * FROM x` or `UPDATE sessions SET ... RETURNING key, value`, bypassing redaction.

**BAD** — Only simple SELECT checked:
```typescript
function isSensitiveQuery(sql: string): boolean {
  // ❌ misses CTE-wrapped and RETURNING access to sensitive tables
  return /SELECT\s+\*\s+FROM\s+(sessions|error_logs)/i.test(sql);
}
```

**GOOD** — CTE + RETURNING covered:
```typescript
function isSensitiveQuery(sql: string): boolean {
  const SENSITIVE = /sessions|error_logs|sync_conflict_backup/i;
  // ✅ detect sensitive table anywhere: CTE body, RETURNING, direct FROM
  if (SENSITIVE.test(sql)) {
    return /WITH\s|SELECT|INSERT|UPDATE|DELETE|RETURNING/i.test(sql);
  }
  return false;
}
// "WITH x AS (SELECT * FROM sessions) SELECT * FROM x" → true
// "UPDATE sessions SET ... RETURNING key" → true
```

**Verification**: Call `isSensitiveQuery` with CTE forms (`WITH x AS (SELECT * FROM sessions) SELECT * FROM x`, `... error_logs ...`, `... sync_conflict_backup ...`) and `RETURNING` forms. Assert all return `true`. Non-sensitive table queries must return `false`.

**Discovered in**: Sensitive-data redaction audit found CTE/RETURNING clauses bypassing `isSensitiveQuery`. Test: `electron/src/handlers/__tests__/regression-r145-cte-returning-redact.test.ts`.

### R148: Backup Database Connection MUST Be Closed in finally Block

In `createBackup` (`electron/src/database/db-connection.ts`), the `verifyDb` connection opened to validate backup integrity MUST be closed inside a `finally` block wrapping the verification queries. If `verifyDb.close()` sits inside the `try` block (or outside `finally`), an exception thrown by the verification query leaks the file handle; long-running processes can exhaust resources. `try { ...verifyDb.prepare... } finally { verifyDb.close() }` guarantees closure regardless of exceptions.

**BAD** — close() not protected by finally:
```typescript
async function createBackup(...) {
  const verifyDb = new BetterSqlite3(backupPath);
  // ❌ if prepare() throws, close() never runs → handle leak
  const row = verifyDb.prepare("PRAGMA integrity_check").get();
  verifyDb.close();
}
```

**GOOD** — close() in finally:
```typescript
async function createBackup(...) {
  const verifyDb = new BetterSqlite3(backupPath);
  try {
    const row = verifyDb.prepare("PRAGMA integrity_check").get(); // ✅ may throw
  } finally {
    verifyDb.close(); // ✅ always runs, even on exception
  }
}
```

**Verification**: Structural check on `db-connection.ts` source: assert `createBackup` exists, a `verifyDb` is created via `new BetterSqlite3`, and `verifyDb.close()` appears inside a `finally` block that follows a `try` block containing `verifyDb.prepare`. Assert the `try { ... } finally { verifyDb.close() }` pattern matches.

**Discovered in**: Database connection lifecycle audit found backup verification leaking handles on query exceptions. Test: `electron/src/database/__tests__/regression-r148-backup-connection-leak.test.ts`.

### R149: file/read Route MUST Enforce 50MB Size Limit

The `file/read` HTTP route in `electron/src/api/route-groups/file-routes.ts` MUST check file size via `fsp.stat` BEFORE calling `fsp.readFile`, and reject reads of files larger than 50MB (`MAX_READ_SIZE = 50 * 1024 * 1024`) by returning the `FILE_TOO_LARGE` error code without reading the file. Reading without a size check lets an attacker supply a multi-GB file (e.g. a video) and exhaust main-process memory (OOM crash). Files of exactly 50MB (boundary) MUST be allowed (`<=`).

**BAD** — Read without size check:
```typescript
"file/read": defineRoute({
  handler: async (_method, body) => {
    const path = resolveKey(body.key);
    // ❌ no size check — multi-GB file OOMs the main process
    const content = await fsp.readFile(path);
    return { success: true, data: content };
  },
})
```

**GOOD** — Stat before read, reject > 50MB:
```typescript
const MAX_READ_SIZE = 50 * 1024 * 1024; // 50MB
"file/read": defineRoute({
  handler: async (_method, body) => {
    const path = resolveKey(body.key);
    const stat = await fsp.stat(path);
    if (stat.size > MAX_READ_SIZE) { // ✅ reject oversized files
      return { success: false, error: "FILE_TOO_LARGE" };
    }
    const content = await fsp.readFile(path); // only read if <= 50MB
    return { success: true, data: content };
  },
})
```

**Verification**: Mock `fsp.stat` to return `size: 10MB`; invoke handler; assert `success === true` and `readFile` called. Mock `stat` to return `size: 60MB`; assert `success === false`, `error === "FILE_TOO_LARGE"`, and `readFile` NOT called. Boundary: `size: 50MB` exactly must succeed.

**Discovered in**: Main-process OOM audit found `file/read` reading unbounded file sizes. Test: `electron/src/api/__tests__/regression-r149-file-read-size-limit.test.ts`.

