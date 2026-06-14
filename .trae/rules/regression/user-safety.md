# 七、用户安全防护

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
