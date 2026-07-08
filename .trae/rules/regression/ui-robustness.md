# 四、UI 健壮性

> 核心关注：界面不崩、有反馈、无泄漏

### R7: Video onError Must Use data-retried Guard Against Infinite Retry Loops
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

### R16: ErrorBoundary Must Limit Retry Attempts
When an ErrorBoundary catches a rendering error, the retry mechanism MUST limit consecutive retry attempts (default: 3). After the limit, the UI MUST guide the user to refresh or reset instead of offering another retry button. This applies to ALL ErrorBoundary implementations, including page-level and component-level boundaries. Repeatedly retrying a deterministic error creates an infinite crash-retry loop that degrades the user experience.

**BAD**:
```tsx
<Button onClick={() => setState({ hasError: false })}>重试</Button>
// User can click this infinitely, each time the component crashes again
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
