# AI Agent Quick Start

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
| DI container | `src/infrastructure/di/container.ts` |
| i18n messages | `src/shared/constants/messages.ts` |
| Regression guards | `.trae/rules/regression-guards.md` |
| Module contracts | `src/modules/{module}/MODULE.md` |
| Storage layer | `src/infrastructure/storage/` |
| Electron main | `electron/src/main.ts` |
| Vite config | `vite.config.ts` |
| Plugin system | `electron/src/plugins/` |
| API config facade | `src/infrastructure/api-config-facade.ts` |
| Model capabilities | `src/infrastructure/ai-providers/model-capabilities.ts` |
| Optimistic lock error | `src/shared/errors/version-conflict.ts` |
| SQL sanitizer | `src/shared/sql-safety/sql-sanitizer.ts` |

## Modification Workflow
1. Read `MODULE.md` → `contract.json` → `.ai/modules/{module}.md` → `index.ts`
2. Make changes (respect dependency direction: app → modules → domain)
3. Run: `typecheck` → `typecheck:electron` → `typecheck:test` → `lint` → `test` → `validate`

## Common Scenarios
- **Add new API**: Define port in `domain/ports` → Implement in `infrastructure/` → Register in DI → Use in module via `container.xxx`
- **Add new i18n key**: Add to `messages.ts` → Use `t()` in code
- **Add new module**: Create under `src/modules/` → Add codeSplitting group in `vite.config.ts` → Add `MODULE.md` + `contract.json`
- **Add storage module**: Create in `src/infrastructure/storage/` → Register columns in `core.ts` → Register DI token in `container.ts` → Create `json-schemas.ts` with `parseXxx()` functions → Add roundtrip test
- **Add shared util**: Create in `src/shared/` → If from infrastructure, use proxy export pattern
- **Add plugin provider**: Create in `electron/src/plugins/providers/` → Extend `BaseAIProviderPlugin` → Register in `registry.ts`
- **Add user plugin**: Create `.plugin.json` in `~/AI Animation Studio/UserPlugins/` or `.plugin.js` in `~/AI Animation Studio/CodePlugins/`
- **Use optimistic locking**: Pass `version` param to storage update methods → Handle `VersionConflictError` in UI

## Critical Rules
- `domain/` imports NOTHING from other layers
- `shared/` MUST NOT import from `@/modules/*`
- `modules/` MUST NOT import from `@/infrastructure/*` except DI container
- All errors must be honestly reported (no "安慰剂" error handling)
- Use `usePreference` instead of `localStorage` in `useState`
- All `<video>` tags need `onError` guard with `data-retried`
- User-facing strings MUST use `t()` from `@/shared/constants`
- Critical updates MUST use optimistic locking (pass `version` to storage methods)
- Code plugin sandbox blocks prototype chain escape (`__proto__`, `Reflect`, `Proxy`)
- Plugin hot-reload MUST invalidate frontend caches (detection-rules, templates, model-profiles)
