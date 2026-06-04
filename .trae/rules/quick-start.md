# AI Agent Quick Start

## Development Commands
- Dev server: `npm run dev`
- Type check: `npm run typecheck && npm run typecheck:electron`
- Lint: `npm run lint`
- Test: `npm run test`
- Full validate: `npm run validate:full`
- Build: `npm run build:electron`

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

## Modification Workflow
1. Read `MODULE.md` → `contract.json` → `.ai/modules/{module}.md` → `index.ts`
2. Make changes (respect dependency direction: app → modules → domain)
3. Run: `typecheck` → `lint` → `test` → `validate`

## Common Scenarios
- **Add new API**: Define port in `domain/ports` → Implement in `infrastructure/` → Register in DI → Use in module via `container.xxx`
- **Add new i18n key**: Add to `messages.ts` → Use `t()` in code
- **Add new module**: Create under `src/modules/` → Add codeSplitting group in `vite.config.ts` → Add `MODULE.md` + `contract.json`
- **Add storage module**: Create in `src/infrastructure/storage/` → Register columns in `core.ts` → Register DI token in `container.ts`
- **Add shared util**: Create in `src/shared/` → If from infrastructure, use proxy export pattern

## Critical Rules
- `domain/` imports NOTHING from other layers
- `shared/` MUST NOT import from `@/modules/*`
- `modules/` MUST NOT import from `@/infrastructure/*` except DI container
- All errors must be honestly reported (no "安慰剂" error handling)
- Use `usePreference` instead of `localStorage` in `useState`
- All `<video>` tags need `onError` guard with `data-retried`
- User-facing strings MUST use `t()` from `@/shared/constants`
