# Testing Rules (Layer 1)

> This file is loaded when the task involves writing or modifying tests.
> For core rules and quick reference, see `quick-start.md`.

---

## Test Framework

- **Unit tests**: Vitest
- **E2E tests**: Playwright
- **Run**: `npx vitest run` (unit), `npx playwright test` (e2e)

## Test File Location

- Services: `src/modules/{module}/{subdomain}/services/__tests__/{service}.test.ts`
- Hooks: `src/modules/{module}/{subdomain}/hooks/__tests__/{hook}.test.ts`
- Components: `src/modules/{module}/presentation/__tests__/{Component}.test.tsx`

## Test Structure Template

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// 1. Hoisted mocks (before any imports that use them)
const { mockFn } = vi.hoisted(() => ({ mockFn: vi.fn() }));

// 2. Module mocks
vi.mock("@/infrastructure/di", () => ({ container: { ...mockFn } }));

// 3. Import SUT (system under test)
import { ComponentName } from "../ComponentName";

// 4. Factory functions
function buildProps(overrides = {}) { return { ...defaults, ...overrides }; }

// 5. Test suite
describe("ComponentName", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it("does something", () => { ... });
});
```

## Mock Strategy

- `vi.hoisted()` — for mock functions that must exist before module import
- `vi.mock()` — for module-level mocking (DI container, external packages, UI components)
- `overrideToken()` from DI — to replace specific container tokens in tests
- Mock UI components (`@/shared/ui/*`) as simple HTML elements in component tests
- Mock `react-router-dom` Link as `<a>` tag in component tests
- Test files CAN use `@/infrastructure/*` imports (warn level, not error)

## Coverage Thresholds

- Branches: 80%, Functions: 80%, Lines: 80%, Statements: 80%
- Per-file enforcement (`perFile: true` in vitest.config.ts)
- Coverage includes: domain schemas, services, infrastructure core, shared utils

## E2E Testing

Three modes:

1. **Browser mode** (`npx playwright test`) — Uses `electron-mock.ts` to simulate Electron APIs. No Electron build required.
2. **Electron mode** (`npx playwright test --config=playwright.electron.config.ts`) — Launches real Electron app. Requires `npm run build:electron` first, then `npm run rebuild`.
3. **Page load tests** (`npx playwright test --config=playwright.electron-pages.config.ts`) — Checks each page loads without critical console errors.

Test infrastructure:
- `tests/helpers/electron-fixture.ts` — Custom Playwright fixture
- `tests/helpers/electron-page-helpers.ts` — Navigation helpers
- `tests/electron/` — Electron-specific test files

### E2E Selector Strategy: data-testid

E2E tests use `data-testid` attributes for element selection instead of placeholder text or CSS selectors. This provides:

- **Stability**: Test IDs don't change when UI text or styling changes
- **Explicitness**: Clear contract between test and component
- **No i18n coupling**: Tests work regardless of language settings

When adding new testable elements:
1. Add `data-testid="descriptive-name"` to the element in the component
2. Use `page.getByTestId("descriptive-name")` in the test
3. Follow naming convention: `{entity}-{action}-{element}` (e.g., `character-name-input`, `story-title-input`)

Current data-testid locations:
- `CharacterBasicInfo.tsx`: `data-testid="character-name-input"`
- `BasicTab.tsx` (scenes): `data-testid="scene-name-input"`
- `StoryHeader.tsx`: `data-testid="story-title-input"`

## better-sqlite3 in Tests

- Must be rebuilt for Node.js before testing: `npm rebuild better-sqlite3`
- Before Electron packaging, auto-rebuilt by `electron-rebuild`

## Regression Test Template

When adding a regression test (after evaluating Q1-Q5 from `regression-guard-automation.md`):

测试文件命名：`r{n}-{kebab-name}.test.ts`（推荐）或 `regression-r{n}.test.ts`

```typescript
// r{n}-{kebab-name}.test.ts  (推荐)  或  regression-r{n}.test.ts
import { describe, it, expect } from "vitest";

describe("R{n}: {bug description}", () => {
  it("positive case: {expected behavior}", () => {
    // Test the correct behavior
  });

  it("negative case: {what was broken before}", () => {
    // Test that the bug no longer occurs
  });

  it("boundary case: {edge condition}", () => {
    // Test edge cases
  });
});
```

## Testing file-http

`@/shared/file-http` 是 HTTP+IPC 双轨统一层，测试时需注意：

- 使用 `_resetHttpCache()`（从 `@/shared/file-http` 导入）在测试之间重置 HTTP 可用性缓存，避免上一个测试的探测结果污染下一个测试
- HTTP 路径测试：mock `fetch`，验证 HTTP 请求参数与响应处理
- IPC 回退路径测试：mock `electronAPI`（`writeFile`/`readFile`/`getConfig`/`setConfig` 等），验证 HTTP 不可用时正确回退到 IPC
- 公开 API 共 7 个：`writeFile`, `readFile`, `getFileInfo`, `getCacheDirectory`, `getDiskSpace`, `fileExists`, `deleteFile`

## Running Tests

```bash
# All unit tests
npx vitest run

# Specific module
npx vitest run src/modules/{module-name}

# Watch mode
npx vitest watch

# With coverage
npx vitest run --coverage

# Full validation (typecheck + lint + arch + tests)
npm run validate:full
```
