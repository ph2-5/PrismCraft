# AI Agent Quick Start

<!-- AI TOOL INSTRUCTIONS (read by Trae/Cursor/Copilot)
BEFORE writing ANY code, you MUST:
1. Read .ai/session-notes.md for recent context
2. Search for existing implementations (Grep/Glob) before creating new ones
3. Read the target file before editing it
4. Run typecheck after changes

FORBIDDEN patterns (will cause bugs):
- Never import from @/infrastructure/* in modules/ (use DI container or @/shared/ proxy)
- Never use electronAPI.dbQuery/dbRun in modules/ (use HTTP API)
- Never hardcode user-facing strings (use t() from @/shared/constants)
- Never use localStorage in useState (use usePreference)
- Never use `any` type in production code
- Never create new files when editing existing ones suffices
- Never guess DI token names — use TOKEN_IDS or getTokenRegistry() to verify
- Never guess shared-logic function signatures — read the file first
- Never show raw `e.message` to users — use mapUserFacingError from @/shared/user-facing-error
- Never wrap result.error with mapUserFacingError — it's already a processed string, use `result.error || t("...")` directly
- Never call electronAPI.writeFile/readFile/getConfig/setConfig directly in modules/ (use @/shared/file-http unified layer — HTTP first, IPC fallback)
- Never use os.homedir() or other Node.js APIs in browser-bound code — will crash as externalized empty objects in browser build
- Never static-import Node.js-only modules in browser-reachable code — use @/shared/file-http or Vite plugin stub

REGRESSION GUARDS: Search .trae/rules/regression/{category}.md for relevant rules before modifying code.
-->

## Development Commands
- Dev server: `npm run dev`
- Type check: `npm run typecheck && npm run typecheck:electron && npm run typecheck:test`
- Lint: `npm run lint`
- Lint (Electron): `npm run lint:electron`
- Lint (architecture): `npm run lint:arch`
- Test: `npm run test`
- Test (coverage): `npm run test:coverage`
- Test (watch): `npm run test:watch`
- Test (Electron): `npm run test:electron`
- E2E test: `npm run test:e2e`
- E2E test (Electron): `npm run test:e2e:electron`
- Full validate: `npm run validate:full`
- Build: `npm run build:electron`
- Build (Windows): `npm run build:win`
- Build (macOS): `npm run build:mac`
- Build (Linux): `npm run build:linux`

## Key File Paths
| Purpose | Path |
|---------|------|
| Domain types | `src/domain/schemas/` |
| Shared business logic | `src/shared-logic/` (shot, prompt, video, story) |
| DI container | `src/infrastructure/di/container.ts` |
| DI token registry | `TOKEN_IDS` + `getTokenRegistry()` in container.ts |
| i18n messages | `src/shared/constants/messages.ts` |
| Regression guards | `.trae/rules/regression-guards.md` |
| Module contracts | `src/modules/{module}/MODULE.md` |
| Storage layer | `src/infrastructure/storage/` |
| Electron main | `electron/src/main.ts` |
| Electron shared-logic resolve | `electron/src/shared-logic-resolve.ts` (Module._resolveFilename hook for @shared-logic in main process) |
| API server | `electron/src/api/` (types, middleware, schemas, routes, server) |
| API route types | `electron/src/api/types.ts` (defineRoute, Route<T>, ApiResponse<T>) |
| API schemas | `electron/src/api/schemas.ts` (Zod schemas + z.infer type exports) |
| Vite config | `vite.config.ts` |
| Plugin system | `electron/src/plugins/` |
| API config facade | `src/infrastructure/api-config-facade.ts` |
| Model capabilities | `src/infrastructure/ai-providers/model-capabilities.ts` |
| Optimistic lock error | `src/shared/errors/version-conflict.ts` |
| SQL sanitizer | `src/shared/sql-safety/sql-sanitizer.ts` |
| API route groups | `electron/src/api/route-groups/` |
| Provider templates data | `src/infrastructure/ai-providers/api-config/provider-templates-data.ts` |
| Unified file/config HTTP layer | `src/shared/file-http/` (writeFile, readFile, getFileInfo, getCacheDirectory, getDiskSpace, fileExists, deleteFile) |
| Video generation strategy | `src/shared/model-capabilities.ts` (re-export from infrastructure) |
| Sync engine class | `src/modules/sync/engine/sync-engine-class.ts` |
| Video task CQRS hooks | `src/modules/video/task-management/hooks/` (state, queries, commands, polling) |
| Regression guard automation | `.trae/rules/regression-guard-automation.md` (Q1-Q5 decision framework) |

## Modification Workflow
1. Read `MODULE.md` → `contract.json` → `.ai/modules/{module}.md` → `index.ts`
2. Make changes (respect dependency direction: app → modules → shared-logic → domain)
3. Run: `typecheck` → `typecheck:electron` → `typecheck:test` → `lint` → `test` → `validate`

## Common Scenarios
- **Add new API**: Define port in `domain/ports` → Implement in `infrastructure/` → Register in DI → Use in module via `container.xxx`
- **Add new API route**: Define Zod schema in `schemas.ts` (export schema + z.infer type) → Add route with `defineRoute()` in route group → Handler body auto-typed from schema
- **Add shared business logic**: Create in `src/shared-logic/` (zero external deps, self-contained types) → Import from `@/shared-logic/*` (renderer) or `@shared-logic/*` (main process)
- **Add new i18n key**: Add to `messages.ts` → Use `t()` in code
- **Add new module**: Create under `src/modules/` → Add codeSplitting group in `vite.config.ts` → Add `MODULE.md` + `contract.json`
- **Add storage module**: Create in `src/infrastructure/storage/` → Register columns in `core.ts` → Register DI token in `container.ts` → Create `json-schemas.ts` with `parseXxx()` functions → Add roundtrip test
- **Add shared util**: Create in `src/shared/` → If from infrastructure, use proxy export pattern
- **Add plugin provider**: Create in `electron/src/plugins/providers/` → Extend `BaseAIProviderPlugin` → Register in `registry.ts`
- **Add user plugin**: Create `.plugin.json` in `~/AI Animation Studio/UserPlugins/` or `.plugin.js` in `~/AI Animation Studio/CodePlugins/`
- **Use optimistic locking**: Pass `version` param to storage update methods → Handle `VersionConflictError` in UI
- **Check reference image strategy**: Use `getVideoGenerationStrategy(modelId)` from `@/shared/model-capabilities` → Check `strategy.useCharacterRef`/`strategy.useSceneRef` → Filter characterRefs/sceneRef before passing to video generation
- **Find available DI tokens**: Use `TOKEN_IDS` constant or `getTokenRegistry()` from `@/infrastructure/di`
- **Read/write files or config**: Use `@/shared/file-http` (HTTP `/api/file/*` + `/api/config/*` with IPC fallback) — never call `electronAPI.writeFile/getConfig` directly
- **Bug discovered → regression guard**: Fix bug → Evaluate Q1-Q5 in `regression-guard-automation.md` → Write test + rule if applicable

## Critical Rules
- `domain/` imports NOTHING from other layers
- `shared-logic/` imports NOTHING external (zero dependencies, self-contained types)
- `shared/` MUST NOT import from `@/modules/*`
- `modules/` MUST NOT import from `@/infrastructure/*` except DI container
- `modules/` MUST NOT use IPC database operations (`dbQuery`, `dbRun`, etc.) — use HTTP API instead
- `modules/` MUST use `@/shared/file-http` for file operations and config read/write — direct `electronAPI.writeFile/readFile/getConfig/setConfig` calls are forbidden
- File writes via HTTP `/api/file/write` are limited to 100MB
- SSRF guard is enforced for non-loopback user-configured hosts (R105)
- All API routes MUST use `defineRoute()` with Zod schema for type-safe body
- All errors must be honestly reported (no "安慰剂" error handling)
- Use `usePreference` instead of `localStorage` in `useState`
- All `<video>` tags need `onError` guard with `data-retried`
- User-facing strings MUST use `t()` from `@/shared/constants`
- Critical updates MUST use optimistic locking (pass `version` to storage methods)
- Code plugin sandbox blocks prototype chain escape (`__proto__`, `Reflect`, `Proxy`)
- Plugin hot-reload MUST invalidate frontend caches (detection-rules, templates, model-profiles)
- Native modules (better-sqlite3) MUST use exact version pins — never `^` or `~`
- Reference image parameters must be filtered by `getVideoGenerationStrategy()` before passing to video generation — models that don't support native reference images should receive `undefined` for characterRefs/sceneRef
- `useVideoTaskManager` uses stableActions pattern — action methods have stable references, don't depend on allTasks changes
- `setAllTasks` does NOT auto-trigger sync/polling — write operations explicitly call `scheduleSync()` + `checkAndStartOrStopPolling()`
- `useStableCompletedUrls` in `useStoryVideo` — completedTaskUrls Map only creates new reference when content changes
- API connection test failures show specific suggestions based on HTTP status code (401/403→check API key, 404→check base URL, 5xx→check network)
- E2E tests use `data-testid` attributes, not placeholder text — add `data-testid="{entity}-{action}-{element}"` to testable elements

## Layer 1 Rules (load by task type)
- **New feature / Refactoring / Architecture changes** → `architecture-rules.md`
- **Writing or modifying tests** → `testing-rules.md`
- **Bug fix** → `regression-guard-automation.md` + relevant `.trae/rules/regression/{category}.md`
- **AI tool workflow optimization** → `ai-tool-integration.md`

## Build Troubleshooting
- **`electron-rebuild` fails**: Run `npm run rebuild` manually. Ensure Visual Studio Build Tools (Windows) or Xcode CLI tools (macOS) are installed.
- **Electron download timeout**: Check `.npmrc` mirror config. For overseas builds, override with `ELECTRON_MIRROR=https://github.com/electron/electron/releases/download/`
- **`app.asar` locked during packaging**: Close all app instances and Electron processes, then retry `npm run build:win`
- **Native module version mismatch**: Run `node scripts/check-native-modules.mjs` to verify exact version pins
