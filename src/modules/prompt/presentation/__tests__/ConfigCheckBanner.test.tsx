import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfigCheckBanner } from "../ConfigCheckBanner";

const mockInitConfig = vi.fn();
const mockCheckConfigStatus = vi.fn();
const localStorageStore: Record<string, string> = {};
const mockLocalStorageGetItem = vi.fn<(key: string) => string | null>((key) => localStorageStore[key] ?? null);
const mockLocalStorageSetItem = vi.fn<(key: string, value: string) => void>((key, value) => { localStorageStore[key] = value; });
const mockLocalStorageRemoveItem = vi.fn<(key: string) => void>((key) => { delete localStorageStore[key]; });

vi.mock("@/shared/api-config", () => ({
  initConfig: (...args: unknown[]) => mockInitConfig(...args),
  checkConfigStatus: (...args: unknown[]) => mockCheckConfigStatus(...args),
}));

vi.stubGlobal("localStorage", {
  getItem: mockLocalStorageGetItem,
  setItem: mockLocalStorageSetItem,
  removeItem: mockLocalStorageRemoveItem,
  clear: vi.fn(),
  get length() { return 0; },
  key: vi.fn(),
});

const mockSetDismissState = vi.fn();
vi.mock("@/shared/utils/preferences", () => ({
  usePreference: () => {
    const prefixedKey = "ai_anim_studio_config-banner-dismissed";
    let parsed: Record<string, unknown> = {};
    try {
      const raw = localStorageStore[prefixedKey];
      if (raw !== undefined && raw !== null) {
        parsed = JSON.parse(raw);
      }
    } catch { /* return empty */ }
    return [parsed, mockSetDismissState];
  },
  preferencesStorage: {
    get: (key: string, defaultValue: unknown) => {
      try {
        const raw = localStorageStore[`ai_anim_studio_${key}`];
        if (raw === undefined || raw === null) return defaultValue;
        return JSON.parse(raw);
      } catch {
        return defaultValue;
      }
    },
    set: (key: string, value: unknown) => {
      localStorageStore[`ai_anim_studio_${key}`] = JSON.stringify(value);
    },
    remove: (key: string) => {
      delete localStorageStore[`ai_anim_studio_${key}`];
    },
  },
}));

vi.mock("react-router-dom", () => ({
  Link: ({
    to,
    children,
    ...props
  }: {
    to: string;
    children: React.ReactNode;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

function makeConfigStatus(overrides: Partial<{
  allConfigured: boolean;
  configuredCount: number;
  totalCount: number;
  missing: string[];
}> = {}) {
  return {
    text: { configured: true, provider: "openai", available: true, model: "gpt-4" },
    image: { configured: true, provider: "openai", available: true, model: "dall-e-3" },
    vision: { configured: false, provider: "", available: false },
    video: { configured: false, provider: "", available: false },
    allConfigured: false,
    configuredCount: 2,
    totalCount: 4,
    missing: ["视觉理解", "视频生成"],
    ...overrides,
  };
}

function renderWithPending() {
  let resolveStatus: (value: unknown) => void;
  const statusPromise = new Promise((resolve) => {
    resolveStatus = resolve;
  });
  mockCheckConfigStatus.mockReturnValue(statusPromise);

  const result = render(<ConfigCheckBanner />);

  return {
    ...result,
    resolveStatus: resolveStatus!,
  };
}

describe("ConfigCheckBanner", () => {
  beforeEach(() => {
    mockInitConfig.mockReset();
    mockCheckConfigStatus.mockReset();
    mockSetDismissState.mockReset();
    for (const key of Object.keys(localStorageStore)) {
      delete localStorageStore[key];
    }
    mockLocalStorageGetItem.mockClear();
    mockLocalStorageSetItem.mockClear();
    mockLocalStorageRemoveItem.mockClear();
  });

  it("returns null when status is null (loading)", () => {
    mockCheckConfigStatus.mockReturnValue(new Promise(() => {}));
    const { container } = render(<ConfigCheckBanner />);
    expect(container.innerHTML).toBe("");
  });

  it("returns null when allConfigured is true", async () => {
    mockCheckConfigStatus.mockResolvedValue(
      makeConfigStatus({ allConfigured: true, configuredCount: 4, missing: [] }),
    );
    const { container } = render(<ConfigCheckBanner />);
    await act(() => Promise.resolve());
    expect(container.innerHTML).toBe("");
  });

  it("shows banner when config is incomplete", async () => {
    mockCheckConfigStatus.mockResolvedValue(makeConfigStatus());
    render(<ConfigCheckBanner />);
    await act(() => Promise.resolve());
    expect(screen.getByText("API 配置不完整")).toBeInTheDocument();
  });

  it("displays configured count and missing items", async () => {
    mockCheckConfigStatus.mockResolvedValue(makeConfigStatus());
    render(<ConfigCheckBanner />);
    await act(() => Promise.resolve());
    expect(screen.getByText(/已配置 2\/4 项功能/)).toBeInTheDocument();
    expect(screen.getByText(/缺少:.*视觉理解、视频生成/)).toBeInTheDocument();
  });

  it("calls initConfig on mount", () => {
    mockCheckConfigStatus.mockResolvedValue(makeConfigStatus());
    render(<ConfigCheckBanner />);
    expect(mockInitConfig).toHaveBeenCalledTimes(1);
  });

  it("calls checkConfigStatus on mount", () => {
    mockCheckConfigStatus.mockResolvedValue(makeConfigStatus());
    render(<ConfigCheckBanner />);
    expect(mockCheckConfigStatus).toHaveBeenCalledTimes(1);
  });

  it("calls setDismissState when 忽略 button is clicked", async () => {
    const user = userEvent.setup();
    mockCheckConfigStatus.mockResolvedValue(makeConfigStatus());
    render(<ConfigCheckBanner />);
    await act(() => Promise.resolve());
    const dismissBtn = screen.getByText("忽略");
    expect(dismissBtn).toBeInTheDocument();
    await user.click(dismissBtn);
    expect(mockSetDismissState).toHaveBeenCalledTimes(1);
    expect(mockSetDismissState.mock.calls[0]![0]!).toHaveProperty("dismissed", true);
    expect(mockSetDismissState.mock.calls[0]![0]!).toHaveProperty("expiresAt");
  });

  it("saves dismiss state with 24h expiry", async () => {
    const user = userEvent.setup();
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    mockCheckConfigStatus.mockResolvedValue(makeConfigStatus());
    render(<ConfigCheckBanner />);
    await act(() => Promise.resolve());
    await user.click(screen.getByText("忽略"));
    expect(mockSetDismissState).toHaveBeenCalledWith({
      dismissed: true,
      expiresAt: now + 24 * 60 * 60 * 1000,
    });
    vi.spyOn(Date, "now").mockRestore();
  });

  it("does not show banner if previously dismissed and not expired", async () => {
    const futureExpiry = Date.now() + 12 * 60 * 60 * 1000;
    localStorageStore["ai_anim_studio_config-banner-dismissed"] = JSON.stringify({ dismissed: true, expiresAt: futureExpiry });
    mockCheckConfigStatus.mockResolvedValue(makeConfigStatus());
    const { container } = render(<ConfigCheckBanner />);
    await act(() => Promise.resolve());
    expect(container.innerHTML).toBe("");
  });

  it("shows banner again if previously dismissed but expired", async () => {
    const pastExpiry = Date.now() - 12 * 60 * 60 * 1000;
    localStorageStore["ai_anim_studio_config-banner-dismissed"] = JSON.stringify({ dismissed: true, expiresAt: pastExpiry });
    mockCheckConfigStatus.mockResolvedValue(makeConfigStatus());
    render(<ConfigCheckBanner />);
    await act(() => Promise.resolve());
    expect(screen.getByText("API 配置不完整")).toBeInTheDocument();
  });

  it("cleans up dismiss state if dismissed but no expiresAt", async () => {
    localStorageStore["ai_anim_studio_config-banner-dismissed"] = JSON.stringify({ dismissed: true });
    mockCheckConfigStatus.mockResolvedValue(makeConfigStatus());
    render(<ConfigCheckBanner />);
    await act(() => Promise.resolve());
    expect(mockSetDismissState).toHaveBeenCalledWith({});
  });

  it("handles corrupt localStorage gracefully via usePreference", async () => {
    localStorageStore["ai_anim_studio_config-banner-dismissed"] = "not-valid-json{{{";
    mockCheckConfigStatus.mockResolvedValue(makeConfigStatus());
    render(<ConfigCheckBanner />);
    await act(() => Promise.resolve());
    expect(mockSetDismissState).not.toHaveBeenCalled();
  });

  it("cancels status load if component unmounts early", async () => {
    const { unmount } = renderWithPending();
    unmount();
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText("API 配置不完整")).not.toBeInTheDocument();
  });

  it("renders link to /settings", async () => {
    mockCheckConfigStatus.mockResolvedValue(makeConfigStatus());
    render(<ConfigCheckBanner />);
    await act(() => Promise.resolve());
    const link = screen.getByText("前往设置").closest("a");
    expect(link).toHaveAttribute("href", "/settings");
  });
});
