import '@testing-library/jest-dom';
import { vi, beforeEach, afterEach } from 'vitest';
import { factories } from "@/domain/schemas/__tests__/helpers/factories";

// NOTE: All cleanup functions are dynamically imported in afterEach
// to avoid caching modules (sqlite-core, error-logger, safe-json, etc.)
// before test files run.
// Per Vitest 4 docs: "Vitest will not mock modules that were imported inside a setup file
// because they are cached by the time a test file is running."

type MockedFn<T extends (...args: never[]) => unknown = (...args: never[]) => unknown> = ReturnType<typeof vi.fn<T>>;

interface MockedLocalStorage {
  getItem: MockedFn<(key: string) => string | null>;
  setItem: MockedFn<(key: string, value: string) => void>;
  removeItem: MockedFn<(key: string) => void>;
  clear: MockedFn<() => void>;
}

interface MockedSubtleCrypto {
  generateKey: MockedFn;
  importKey: MockedFn;
  deriveKey: MockedFn;
  encrypt: MockedFn;
  decrypt: MockedFn;
}

interface MockedCrypto {
  subtle: MockedSubtleCrypto;
  getRandomValues: MockedFn<(array: Uint8Array) => Uint8Array>;
  randomUUID: MockedFn<() => string>;
}

const localStorageMock: MockedLocalStorage = {
  getItem: vi.fn<(key: string) => string | null>(),
  setItem: vi.fn<(key: string, value: string) => void>(),
  removeItem: vi.fn<(key: string) => void>(),
  clear: vi.fn<() => void>(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

const cryptoMock: MockedCrypto = {
  subtle: {
    generateKey: vi.fn(),
    importKey: vi.fn(),
    deriveKey: vi.fn(),
    encrypt: vi.fn(),
    decrypt: vi.fn(),
  },
  getRandomValues: vi.fn<(array: Uint8Array) => Uint8Array>((array: Uint8Array) => {
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
    return array;
  }),
  randomUUID: vi.fn<() => string>(() => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }),
};

Object.defineProperty(window, 'crypto', {
  value: cryptoMock,
  writable: true,
});

const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeEach(() => {
  vi.clearAllMocks();
  localStorageMock.getItem.mockReturnValue(null);
  localStorageMock.setItem.mockClear();
  localStorageMock.removeItem.mockClear();
  localStorageMock.clear.mockClear();
  factories.resetIdCounter();

  console.error = vi.fn((...args: unknown[]) => {
    const msg = args.map(String).join(" ");
    if (
      msg.includes("act(") ||
      msg.includes("Warning:") ||
      msg.includes("Not implemented:")
    ) {
      return;
    }
    originalConsoleError.apply(console, args);
  });

  console.warn = vi.fn((...args: unknown[]) => {
    const msg = args.map(String).join(" ");
    if (
      msg.includes("Not implemented:") ||
      msg.includes("DEPRECATED")
    ) {
      return;
    }
    originalConsoleWarn.apply(console, args);
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
  // 清理模块级 beforeunload 监听器
  try {
    const { cleanupDownloadManagerListener } = await import("@/infrastructure/network/download-manager");
    cleanupDownloadManagerListener();
  } catch {}
  try {
    const { cleanupVideoCache } = await import("@/infrastructure/storage/video-cache");
    cleanupVideoCache();
  } catch {}
  try {
    const { cleanupImageCache } = await import("@/infrastructure/storage/image-cache");
    cleanupImageCache();
  } catch {}
  // NOTE: cleanupPreferencesListener is NOT called here because it removes the
  // storage event listener (setting storageEventHandler = null) which is never
  // re-added. This breaks tests that rely on storage event cross-tab sync.
});

export { localStorageMock, cryptoMock };
