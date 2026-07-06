import { vi } from "vitest";

function createElectronApiMock() {
  return {
    onNavigate: vi.fn(),
    onMenuNewCharacter: vi.fn(),
    onMenuNewScene: vi.fn(),
    onMenuExport: vi.fn(),
    openExternal: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    openPath: vi.fn<() => Promise<{ success: boolean; error?: string }>>().mockResolvedValue({ success: true }),
    removeMenuListeners: vi.fn(),
    platform: "win32",
    versions: { node: "20.0.0", electron: "28.0.0", chrome: "120.0.0" },

    getConfig: vi.fn<(key: string) => string | null>().mockReturnValue(null),
    setConfig: vi.fn<(key: string, value: unknown) => boolean>().mockReturnValue(true),

    deleteFile: vi.fn().mockResolvedValue(undefined),
    readFileAsBase64: vi.fn().mockResolvedValue("data:image/png;base64,"),
    getAssetsDir: vi.fn().mockResolvedValue("/mock/assets"),
    saveBuffer: vi.fn().mockResolvedValue("/mock/path"),
    fileExists: vi.fn().mockResolvedValue(true),
    copyFile: vi.fn().mockResolvedValue("/mock/copy"),

    openFileDialog: vi.fn().mockResolvedValue({ canceled: true, filePaths: [] }),
    saveFileDialog: vi.fn().mockResolvedValue({ canceled: true, filePath: "" }),

    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(Buffer.from("")),

    getCacheDirectory: vi.fn().mockResolvedValue("/mock/cache"),

    normalizeImage: vi.fn().mockResolvedValue("/mock/normalized.png"),
    imageToBase64IPC: vi.fn().mockResolvedValue("data:image/png;base64,"),

    dbQuery: vi.fn<(sql: string, params?: unknown[]) => Promise<{ success: boolean; data?: unknown[]; error?: string }>>()
      .mockResolvedValue({ success: true, data: [] }),
    dbRun: vi.fn<(sql: string, params?: unknown[]) => Promise<{ success: boolean; data?: unknown; error?: string }>>()
      .mockResolvedValue({ success: true, data: { changes: 0 } }),
    dbTransaction: vi.fn().mockResolvedValue({ success: true, data: [] }),
  };
}

let electronApiMock: ReturnType<typeof createElectronApiMock>;

export function getElectronApiMock() {
  if (!electronApiMock) {
    electronApiMock = createElectronApiMock();
  }
  return electronApiMock;
}

export function setupElectronApiMock() {
  const mock = getElectronApiMock();
  (window as unknown as Record<string, unknown>).electronAPI = mock;
  return mock;
}

export function resetElectronApiMock() {
  const mock = getElectronApiMock();
  for (const value of Object.values(mock)) {
    if (vi.isMockFunction(value)) {
      value.mockClear();
    }
  }
}
