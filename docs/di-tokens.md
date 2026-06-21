# DI Container Token Reference

> Auto-generated from `src/infrastructure/di/container.ts` at 2026-06-18T05:12:29.880Z

## Token Categories

| Category | Description | Count |
|----------|-------------|-------|
| A. Domain Port 实现 | Domain Port 实现 | 10 |
| B. 有状态服务 | 有状态服务 | 6 |
| C. Storage 实例 | Storage 实例 | 11 |
| D. Repository 实例 | Repository 实例 | 1 |
| E. 懒加载模块 | 懒加载模块 | 3 |

## Token Details

### A. Domain Port 实现

| Token | Type | Lazy | Source |
|-------|------|------|--------|
| `videoTaskStorage` | IVideoTaskStorage |  | `@/infrastructure/storage/video-tasks` |
| `characterStorage` | ICharacterStorage |  | `@/infrastructure/storage/characters` |
| `sceneStorage` | ISceneStorage |  | `@/infrastructure/storage/scenes` |
| `storyStorage` | IStoryStorage |  | `@/infrastructure/storage/stories` |
| `videoProvider` | IVideoProvider |  | - |
| `imageProvider` | IImageProvider |  | - |
| `textProvider` | ITextProvider |  | - |
| `fileUploader` | IFileUploader |  | - |
| `syncStorage` | ISyncStorage |  | - |
| `fileStorage` | `unknown` | ✓ | - |

### B. 有状态服务

| Token | Type | Lazy | Source |
|-------|------|------|--------|
| `eventBus` | `unknown` |  | `@/shared/event-bus` |
| `apiClient` | `unknown` |  | `@/infrastructure/api` |
| `imageApi` | `unknown` |  | `@/infrastructure/api` |
| `videoApi` | `unknown` |  | `@/infrastructure/api` |
| `textApi` | `unknown` |  | `@/infrastructure/api` |
| `preferencesStorage` | `unknown` |  | `@/shared/utils/preferences` |

### C. Storage 实例

| Token | Type | Lazy | Source |
|-------|------|------|--------|
| `versionStorage` | IVersionStorage |  | `@/infrastructure/storage/versions` |
| `elementStorage` | IElementStorage |  | `@/infrastructure/storage/elements` |
| `videoCacheStorage` | `unknown` |  | `@/infrastructure/storage/video-cache` |
| `imageCacheStorage` | `unknown` |  | `@/infrastructure/storage/image-cache` |
| `collectionStorage` | `unknown` |  | `@/infrastructure/storage/collections` |
| `storyboardStorage` | `unknown` |  | `@/infrastructure/storage/storyboard` |
| `importExportStorage` | `unknown` |  | `@/infrastructure/storage/import-export` |
| `templateStorage` | ITemplateStorage |  | `@/infrastructure/storage/templates` |
| `autoSaveStorage` | `unknown` |  | `@/infrastructure/storage/auto-save` |
| `errorLogStorage` | `unknown` |  | `@/infrastructure/storage/error-logs` |
| `sessionStorage` | `unknown` |  | `@/infrastructure/storage/sessions` |

### D. Repository 实例

| Token | Type | Lazy | Source |
|-------|------|------|--------|
| `mediaAssetRepository` | IMediaAssetRepository |  | - |

### E. 懒加载模块

| Token | Type | Lazy | Source |
|-------|------|------|--------|
| `elementManager` | `unknown` | ✓ | - |
| `referenceEngine` | `unknown` | ✓ | - |
| `syncEngine` | `unknown` | ✓ | - |

## Usage Examples

### Accessing a token
```typescript
import { container } from "@/infrastructure/di";
const storage = container.videoTaskStorage;
```

### Overriding a token in tests
```typescript
import { overrideToken } from "@/infrastructure/di";
import { container } from "@/infrastructure/di";
overrideToken(container.videoTaskStorage, () => mockStorage);
```

### Adding a new token
1. Determine the category (A-E)
2. Add `createToken()` in the appropriate section of `container.ts`
3. If category E, add a comment explaining why the module cannot import directly
4. Run `npm run di-docs` to update this document
