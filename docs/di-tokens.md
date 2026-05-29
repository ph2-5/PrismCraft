# DI Container Token Reference

> Auto-generated from `src/infrastructure/di/container.ts` at 2026-05-29T15:26:17.698Z

## Token Categories

| Category | Description | Count |
|----------|-------------|-------|
| A. Domain Port 实现 | Domain Port 实现 | 9 |
| B. 有状态服务 | 有状态服务 | 6 |
| C. Storage 实例 | Storage 实例 | 11 |
| D. Repository 实例 | Repository 实例 | 1 |
| E. 懒加载模块 | 懒加载模块 | 2 |

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
| `versionStorage` | `unknown` |  | `@/infrastructure/storage/versions` |
| `elementStorage` | `unknown` |  | `@/infrastructure/storage/elements` |
| `videoCacheStorage` | `unknown` |  | `@/infrastructure/storage/video-cache` |
| `imageCacheStorage` | `unknown` |  | `@/infrastructure/storage/image-cache` |
| `collectionStorage` | `unknown` |  | `@/infrastructure/storage/collections` |
| `storyboardStorage` | `unknown` |  | `@/infrastructure/storage/storyboard` |
| `importExportStorage` | `unknown` |  | `@/infrastructure/storage/import-export` |
| `templateStorage` | `unknown` |  | `@/infrastructure/storage/templates` |
| `autoSaveStorage` | `unknown` |  | `@/infrastructure/storage/auto-save` |
| `errorLogStorage` | `unknown` |  | `@/infrastructure/storage/error-logs` |
| `sessionStorage` | `unknown` |  | `@/infrastructure/storage/sessions` |

### D. Repository 实例

| Token | Type | Lazy | Source |
|-------|------|------|--------|
| `mediaAssetRepository` | `unknown` |  | - |

### E. 懒加载模块

| Token | Type | Lazy | Source |
|-------|------|------|--------|
| `elementManager` | `unknown` | ✓ | - |
| `referenceEngine` | `unknown` | ✓ | - |

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
1. Determine the category (A-F)
2. Add `createToken()` in the appropriate section of `container.ts`
3. If category E, add a comment explaining why the module cannot import directly
4. Run `npm run di-docs` to update this document
