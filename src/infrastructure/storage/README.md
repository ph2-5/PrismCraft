# Infrastructure Storage Layer

## Overview
Storage modules provide persistent data access via SQLite (better-sqlite3, WAL mode). All modules follow the JSON Container Pattern for volatile fields to avoid ALTER TABLE migrations.

## Storage Module Registry
| Module | File | Domain Port | DI Token | Description |
|--------|------|-------------|----------|-------------|
| video-tasks | `video-tasks.ts` + `video-tasks/` | `IVideoTaskStorage` | `container.videoTaskStorage` | Video task CRUD + bulk ops + JSON parsing |
| characters | `characters.ts` + `characters/` | `ICharacterStorage` | `container.characterStorage` | Character CRUD + outfit management |
| scenes | `scenes.ts` | `ISceneStorage` | `container.sceneStorage` | Scene CRUD |
| stories | `stories.ts` + `stories/` | `IStoryStorage` | `container.storyStorage` | Story + beat CRUD + beat transformer |
| elements | `elements.ts` + `elements/` | `IElementStorage` | `container.elementStorage` | Element CRUD + commands/queries |
| versions | `versions.ts` | `IVersionStorage` | `container.versionStorage` | Story version snapshots |
| templates | `templates.ts` | `ITemplateStorage` | `container.templateStorage` | Video template CRUD |
| collections | `collections.ts` | — | `container.collectionStorage` | Asset collection management |
| storyboard | `storyboard.ts` | — | `container.storyboardStorage` | Storyboard asset CRUD |
| video-cache | `video-cache.ts` | — | `container.videoCacheStorage` | Video cache read/write |
| image-cache | `image-cache.ts` | — | `container.imageCacheStorage` | Image cache read/write |
| import-export | `import-export.ts` | — | `container.importExportStorage` | Data import/export |
| auto-save | `auto-save.ts` | — | `container.autoSaveStorage` | Auto-save snapshots |
| error-logs | `error-logs.ts` | — | `container.errorLogStorage` | Error log persistence |
| sessions | `sessions.ts` | — | `container.sessionStorage` | Session key-value store |

## Core Infrastructure
| File | Purpose |
|------|---------|
| `db.ts` | Type definitions (`AutoSaveRecord`, `ErrorLog`, `SessionData`) |
| `sqlite-core.ts` | `safeQuery`, `safeRun`, `safeTransaction` — safe DB primitives |
| `core.ts` | `parseRecord`, `trackChange`, `buildUpdateSets`, `buildJsonSet`, `buildInsert` — column registry + JSON container ops |
| `sql-sanitizer.ts` | `sanitizeTable`, `sanitizeIdentifier` — SQL injection prevention |
| `schema-registry.ts` | `registerColumns`, `getColumnKind` — per-table column type metadata |

## JSON Container Pattern
- Volatile fields stored in JSON columns (config, provider, media_refs, tracking, appearance, generation, etc.)
- Column types registered via `registerColumns()` in `core.ts` (json / boolean)
- Partial updates: `json_set(COALESCE(container, '{}'), '$.key', ?)` for single field, `json_patch()` for multi-field
- Safe parsing: `parseXxx()` functions from `json-schemas.ts` (e.g., `parseConfig`, `parseProvider` in `video-tasks/`)
- Record parsing: `parseRecord(record, table)` auto-parses JSON columns and boolean flags based on schema registry

## Key Conventions
- All queries use parameterized statements (never string concatenation)
- Batch operations use `safeTransaction` for atomicity
- `trackChange()` called after mutations for sync engine awareness
- `buildUpdateSets()` + `FieldTarget` maps handle fixed columns and JSON containers uniformly
- Tables use 7-field base columns: `owner_id`, `created_at`, `updated_at`, `is_deleted`, `deleted_at`, `version`, `sync_id`

## Optimistic Locking

Critical update operations support optimistic locking via the `version` base column to prevent lost updates from concurrent modifications.

### How It Works

1. Client reads a record, obtaining its current `version` (e.g., `version = 3`)
2. Client sends an update with the expected version: `updateStory(id, data, 3)`
3. SQL: `UPDATE stories SET ... , version = version + 1 WHERE id = ? AND version = ?`
4. If `changes === 0`, the record was modified by another operation → throw `VersionConflictError`
5. If `changes === 1`, the update succeeded and `version` is now 4

### Supported Storage Modules

| Module | Method | Version Parameter |
|--------|--------|-------------------|
| stories | `updateStory(id, story, version?)` | Optional |
| characters | `updateCharacter(id, character, version?)` | Optional |
| elements | `updateElement(elementId, updates, version?)` | Optional |
| video-tasks | `updateVideoTask(taskId, updates, version?)` | Optional |
| video-tasks | `batchUpdateVideoTasks(updates)` | Each item can include `version` |

### Implementation

`buildSafeUpdate()` in `sql-sanitizer.ts` accepts an optional `options.version` parameter:

```typescript
import { buildSafeUpdate } from "@/shared/sql-safety";

const { sql, params } = buildSafeUpdate("stories", updates, {
  version: expectedVersion,
});
// SQL: UPDATE stories SET field1 = ?, version = version + 1 WHERE id = ? AND version = ?
```

`VersionConflictError` is defined in `@/shared/errors/version-conflict.ts` and handled by `mapUserFacingError()` for user-friendly messaging.

### When to Use

- **Auto-save**: Always use optimistic locking to prevent overwriting user edits (R42, R77)
- **Manual save**: Use when concurrent edits are possible (e.g., story editing)
- **Batch updates**: Each item in the batch can independently include a version

## Roundtrip Tests

Storage modules with JSON containers have roundtrip (serialization → deserialization) tests to ensure data integrity:

| Module | Test File | Coverage |
|--------|-----------|----------|
| characters | `characters/__tests__/parser-roundtrip.test.ts` | 4 JSON containers + 25+ fields roundtrip |
| characters | `characters/__tests__/video-gen-status-roundtrip.test.ts` | videoGenerationStatus bidirectional mapping |
| video-tasks | `video-tasks/__tests__/parser-roundtrip.test.ts` | 4 JSON containers + 30+ fields + `buildUpdateSets` partial updates |
| video-tasks | `video-tasks/__tests__/timestamp-roundtrip.test.ts` | ISO/ms/s timestamp conversion + edge cases |
| stories | `stories/__tests__/beat-transformer.test.ts` | `flattenBeat` + `buildBeatInsert` serialization |
| stories | `stories/__tests__/beat-roundtrip.test.ts` | StoryBeat full roundtrip |

These tests verify that: (1) `parseXxx()` correctly reconstructs domain objects from DB records, (2) `buildInsert`/`buildUpdateSets` correctly serializes domain objects to SQL parameters, (3) JSON container fields survive the roundtrip without loss or corruption.
