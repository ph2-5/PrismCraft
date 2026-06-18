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
