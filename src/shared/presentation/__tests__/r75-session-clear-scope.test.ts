import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockConfirm, mockT, mockErrorLogger } = vi.hoisted(() => ({
  mockConfirm: vi.fn(),
  mockT: vi.fn((key: string) => {
    const map: Record<string, string> = {
      "errorBoundary.resetConfirm": "确定要重置吗？",
      "errorBoundary.resetConfirmTitle": "重置确认",
    };
    return map[key] ?? key;
  }),
  mockErrorLogger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("@/shared/utils/confirm", () => ({
  confirm: mockConfirm,
}));

vi.mock("@/shared/constants", () => ({
  t: mockT,
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: mockErrorLogger,
}));

function createHandleReset(sessionStorageMock: Storage, localStorageMock: Storage) {
  return async () => {
    if (!(await mockConfirm(mockT("errorBoundary.resetConfirm"), mockT("errorBoundary.resetConfirmTitle")))) {
      return;
    }
    try {
      localStorageMock.removeItem("ai-animation-last-session");
      for (let i = sessionStorageMock.length - 1; i >= 0; i--) {
        const key = sessionStorageMock.key(i);
        if (key?.startsWith("ai-animation-")) {
          sessionStorageMock.removeItem(key);
        }
      }
    } catch (e) {
      mockErrorLogger.warn("[ErrorBoundary] 清除会话数据失败", e instanceof Error ? e.message : e);
    }
  };
}

describe("R75: Session clearing must only delete application-prefixed keys", () => {
  let sessionStorageMock: Storage;
  let localStorageMock: Storage;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfirm.mockResolvedValue(true);

    const store: Record<string, string> = {};

    sessionStorageMock = {
      getItem: vi.fn((key: string) => store[key] ?? null),
      setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
      removeItem: vi.fn((key: string) => { delete store[key]; }),
      clear: vi.fn(() => { Object.keys(store).forEach((k) => delete store[k]); }),
      get length() { return Object.keys(store).length; },
      key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
    } as unknown as Storage;

    localStorageMock = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      get length() { return 0; },
      key: vi.fn(() => null),
    } as unknown as Storage;
  });

  it("only removes 'ai-animation-' prefixed keys from sessionStorage", async () => {
    const store: Record<string, string> = {
      "ai-animation-draft": "draft-data",
      "ai-animation-settings": "settings-data",
      "other-app-key": "other-data",
      "user-preference": "pref-data",
    };

    const mockStore = store;
    (sessionStorageMock as unknown as { getItem: ReturnType<typeof vi.fn> }).getItem = vi.fn((key: string) => mockStore[key] ?? null);
    (sessionStorageMock as unknown as { removeItem: ReturnType<typeof vi.fn> }).removeItem = vi.fn((key: string) => { delete mockStore[key]; });
    (sessionStorageMock as unknown as { key: ReturnType<typeof vi.fn> }).key = vi.fn((index: number) => Object.keys(mockStore)[index] ?? null);
    Object.defineProperty(sessionStorageMock, "length", { get: () => Object.keys(mockStore).length, configurable: true });

    const handleReset = createHandleReset(sessionStorageMock, localStorageMock);
    await handleReset();

    expect(mockStore).not.toHaveProperty("ai-animation-draft");
    expect(mockStore).not.toHaveProperty("ai-animation-settings");
    expect(mockStore).toHaveProperty("other-app-key");
    expect(mockStore).toHaveProperty("user-preference");
  });

  it("removes 'ai-animation-last-session' from localStorage", async () => {
    const handleReset = createHandleReset(sessionStorageMock, localStorageMock);
    await handleReset();

    expect(localStorageMock.removeItem).toHaveBeenCalledWith("ai-animation-last-session");
  });

  it("non-app keys remain intact after reset", async () => {
    const store: Record<string, string> = {
      "third-party-token": "abc123",
      "analytics-id": "xyz789",
      "ai-animation-temp": "temp-data",
    };

    (sessionStorageMock as unknown as { getItem: ReturnType<typeof vi.fn> }).getItem = vi.fn((key: string) => store[key] ?? null);
    (sessionStorageMock as unknown as { removeItem: ReturnType<typeof vi.fn> }).removeItem = vi.fn((key: string) => { delete store[key]; });
    (sessionStorageMock as unknown as { key: ReturnType<typeof vi.fn> }).key = vi.fn((index: number) => Object.keys(store)[index] ?? null);
    Object.defineProperty(sessionStorageMock, "length", { get: () => Object.keys(store).length, configurable: true });

    const handleReset = createHandleReset(sessionStorageMock, localStorageMock);
    await handleReset();

    expect(store).toHaveProperty("third-party-token");
    expect(store).toHaveProperty("analytics-id");
    expect(store).not.toHaveProperty("ai-animation-temp");
  });

  it("does not clear any session data when confirm is cancelled", async () => {
    mockConfirm.mockResolvedValue(false);

    const handleReset = createHandleReset(sessionStorageMock, localStorageMock);
    await handleReset();

    expect(localStorageMock.removeItem).not.toHaveBeenCalled();
    expect(sessionStorageMock.removeItem).not.toHaveBeenCalled();
  });
});
