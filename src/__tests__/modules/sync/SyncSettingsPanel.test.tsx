import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const {
  mockApiClientGet,
  mockApiClientPost,
  mockInitSyncEngine,
  mockUpdateSyncConfig,
  mockPerformSync,
  mockGetSyncStatus,
  mockSetConflictCallback,
} = vi.hoisted(() => ({
  mockApiClientGet: vi.fn(),
  mockApiClientPost: vi.fn(),
  mockInitSyncEngine: vi.fn(),
  mockUpdateSyncConfig: vi.fn(),
  mockPerformSync: vi.fn(),
  mockGetSyncStatus: vi.fn(),
  mockSetConflictCallback: vi.fn(),
}));

vi.mock("@/infrastructure/api/client", () => ({
  apiClient: {
    get: mockApiClientGet,
    post: mockApiClientPost,
  },
}));

vi.mock("@/modules/sync", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/sync")>();
  return {
    ...actual,
    initSyncEngine: mockInitSyncEngine,
    updateSyncConfig: mockUpdateSyncConfig,
    performSync: mockPerformSync,
    getSyncStatus: mockGetSyncStatus,
    setConflictCallback: mockSetConflictCallback,
  };
});

vi.mock("@/infrastructure/di", () => ({
  container: {
    safeRun: vi.fn().mockResolvedValue(undefined),
    safeQuery: vi.fn().mockResolvedValue([]),
    syncStorage: {
      registerChangeTracker: vi.fn(),
    },
    apiClient: {
      get: mockApiClientGet,
      post: mockApiClientPost,
    },
  },
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/shared/ui/dialog", () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog-content">{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog-header">{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog-title">{children}</div>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog-description">{children}</div>
  ),
  DialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog-footer">{children}</div>
  ),
}));

vi.mock("@/shared/ui/button", () => ({
  Button: ({ children, onClick, disabled, ...props }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; "data-testid"?: string }) => (
    <button onClick={onClick} disabled={disabled} data-testid={props["data-testid"] || "button"}>
      {children}
    </button>
  ),
}));

vi.mock("@/shared/ui/input", () => ({
  Input: ({ value, onChange, disabled, placeholder, type, ...props }: { value: string; onChange: (e: { target: { value: string } }) => void; disabled?: boolean; placeholder?: string; type?: string; "data-testid"?: string }) => (
    <input
      value={value}
      onChange={(e) => onChange({ target: { value: e.target.value } })}
      disabled={disabled}
      placeholder={placeholder}
      type={type}
      data-testid={props["data-testid"] || "input"}
    />
  ),
}));

vi.mock("@/shared/ui/switch", () => ({
  Switch: ({ checked, onCheckedChange, disabled }: { checked: boolean; onCheckedChange: (checked: boolean) => void; disabled?: boolean }) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onCheckedChange(e.target.checked)}
      disabled={disabled}
      data-testid="switch"
    />
  ),
}));

vi.mock("@/shared/ui/label", () => ({
  Label: ({ children }: { children: React.ReactNode }) => <label>{children}</label>,
}));

vi.mock("@/shared/ui/select", () => ({
  Select: ({ children, value, onValueChange, disabled }: { children: React.ReactNode; value: string; onValueChange: (value: string) => void; disabled?: boolean }) => (
    <select value={value} onChange={(e) => onValueChange(e.target.value)} disabled={disabled} data-testid="select">
      {children}
    </select>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: () => null,
}));

vi.mock("./SyncConflictPanel", () => ({
  SyncConflictPanel: () => <div data-testid="conflict-panel" />,
}));

import { SyncSettingsPanel } from "@/modules/sync";

describe("SyncSettingsPanel", () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockApiClientGet.mockResolvedValue({
      ok: true,
      value: {
        success: true,
        config: {
          enabled: false,
          autoSync: true,
          syncInterval: 30000,
          conflictStrategy: "last-write-wins",
          endpoint: "",
          deviceId: "",
          server: null,
        },
      },
    });
    mockGetSyncStatus.mockResolvedValue({
      lastSyncAt: null,
      pendingChanges: 0,
      conflicts: 0,
      isSyncing: false,
      deviceId: "device-1",
    });
    mockSetConflictCallback.mockImplementation(() => {});
  });

  it("应渲染服务器配置区域", async () => {
    render(<SyncSettingsPanel {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("服务器配置")).toBeInTheDocument();
    });
  });

  it("测试连接按钮应调用 API", async () => {
    const user = userEvent.setup();

    mockApiClientGet.mockResolvedValue({
      ok: true,
      value: {
        success: true,
        config: {
          enabled: true,
          autoSync: true,
          syncInterval: 30000,
          conflictStrategy: "last-write-wins",
          endpoint: "",
          deviceId: "device-1",
          server: {
            url: "https://sync.example.com",
            connected: false,
            lastConnectedAt: null,
            serverVersion: null,
          },
        },
      },
    });

    mockApiClientPost.mockResolvedValue({
      ok: true,
      value: {
        success: true,
        message: "连接成功",
        serverVersion: "v1.0.0",
        token: "auth-token-123",
        latency: 150,
      },
    });

    render(<SyncSettingsPanel {...defaultProps} />);

    await waitFor(() => {
      const urlInput = screen.getByPlaceholderText("https://sync.example.com") as HTMLInputElement;
      expect(urlInput.disabled).toBe(false);
    });

    const urlInput = screen.getByPlaceholderText("https://sync.example.com");
    const usernameInput = screen.getByPlaceholderText("admin");
    const passwordInput = screen.getByPlaceholderText("••••••••");

    await user.clear(urlInput);
    await user.type(urlInput, "https://sync.example.com");
    await user.clear(usernameInput);
    await user.type(usernameInput, "admin");
    await user.clear(passwordInput);
    await user.type(passwordInput, "password123");

    const testButton = screen.getByText("测试连接");
    await user.click(testButton);

    await waitFor(() => {
      expect(mockApiClientPost).toHaveBeenCalledWith(
        "sync/test",
        expect.objectContaining({
          url: "https://sync.example.com",
          username: "admin",
          password: "password123",
        }),
      );
    });
  });

  it("保存按钮应调用 API", async () => {
    const user = userEvent.setup();

    mockApiClientGet.mockResolvedValue({
      ok: true,
      value: {
        success: true,
        config: {
          enabled: true,
          autoSync: true,
          syncInterval: 30000,
          conflictStrategy: "last-write-wins",
          endpoint: "",
          deviceId: "device-1",
          server: {
            url: "https://sync.example.com",
            connected: true,
            lastConnectedAt: 1716193800,
            serverVersion: "v1.0.0",
          },
        },
      },
    });

    mockApiClientPost.mockResolvedValue({
      ok: true,
      value: { success: true },
    });

    render(<SyncSettingsPanel {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("保存设置")).toBeInTheDocument();
    });

    const saveButton = screen.getByText("保存设置");
    await user.click(saveButton);

    await waitFor(() => {
      expect(mockApiClientPost).toHaveBeenCalledWith(
        "sync/config",
        expect.objectContaining({
          config: expect.objectContaining({
            enabled: true,
          }),
        }),
      );
    });
  });

  it("连接状态应正确更新", async () => {
    const user = userEvent.setup();

    mockApiClientGet.mockResolvedValue({
      ok: true,
      value: {
        success: true,
        config: {
          enabled: true,
          autoSync: true,
          syncInterval: 30000,
          conflictStrategy: "last-write-wins",
          endpoint: "",
          deviceId: "device-1",
          server: {
            url: "https://sync.example.com",
            connected: false,
            lastConnectedAt: null,
            serverVersion: null,
          },
        },
      },
    });

    mockApiClientPost.mockResolvedValue({
      ok: true,
      value: {
        success: true,
        message: "连接成功",
        serverVersion: "v1.0.0",
        token: "auth-token-123",
        latency: 150,
      },
    });

    render(<SyncSettingsPanel {...defaultProps} />);

    await waitFor(() => {
      const urlInput = screen.getByPlaceholderText("https://sync.example.com") as HTMLInputElement;
      expect(urlInput.disabled).toBe(false);
    });

    const urlInput = screen.getByPlaceholderText("https://sync.example.com");
    const usernameInput = screen.getByPlaceholderText("admin");
    const passwordInput = screen.getByPlaceholderText("••••••••");

    await user.clear(urlInput);
    await user.type(urlInput, "https://sync.example.com");
    await user.clear(usernameInput);
    await user.type(usernameInput, "admin");
    await user.clear(passwordInput);
    await user.type(passwordInput, "password123");

    const testButton = screen.getByText("测试连接");
    await user.click(testButton);

    await waitFor(() => {
      expect(screen.getByText(/连接成功/)).toBeInTheDocument();
    });
  });

  it("同步关闭时输入框应为禁用状态", async () => {
    mockApiClientGet.mockResolvedValue({
      ok: true,
      value: {
        success: true,
        config: {
          enabled: false,
          autoSync: true,
          syncInterval: 30000,
          conflictStrategy: "last-write-wins",
          endpoint: "",
          deviceId: "",
          server: null,
        },
      },
    });

    render(<SyncSettingsPanel {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText("https://sync.example.com")).toBeInTheDocument();
    });

    const urlInput = screen.getByPlaceholderText("https://sync.example.com") as HTMLInputElement;
    expect(urlInput.disabled).toBe(true);
  });
});
