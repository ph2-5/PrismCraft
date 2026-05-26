import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfigCheckBanner } from "../ConfigCheckBanner";

const mockInitConfig = vi.fn();
const mockCheckConfigStatus = vi.fn();
const mockLocalStorageGetItem = vi.fn<(key: string) => string | null>().mockReturnValue(null);
const mockLocalStorageSetItem = vi.fn<(key: string, value: string) => void>();
const mockLocalStorageRemoveItem = vi.fn<(key: string) => void>();

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

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
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
    mockLocalStorageGetItem.mockReturnValue(null);
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

  it("dismisses banner when 忽略 button is clicked", async () => {
    const user = userEvent.setup();
    mockCheckConfigStatus.mockResolvedValue(makeConfigStatus());
    render(<ConfigCheckBanner />);
    await act(() => Promise.resolve());
    const dismissBtn = screen.getByText("忽略");
    expect(dismissBtn).toBeInTheDocument();
    await user.click(dismissBtn);
    expect(screen.queryByText("API 配置不完整")).not.toBeInTheDocument();
  });

  it("saves dismiss state to localStorage with 24h expiry", async () => {
    const user = userEvent.setup();
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    mockCheckConfigStatus.mockResolvedValue(makeConfigStatus());
    render(<ConfigCheckBanner />);
    await act(() => Promise.resolve());
    await user.click(screen.getByText("忽略"));
    expect(mockLocalStorageSetItem).toHaveBeenCalledWith(
      "config-banner-dismissed",
      JSON.stringify({
        dismissed: true,
        expiresAt: now + 24 * 60 * 60 * 1000,
      }),
    );
    vi.spyOn(Date, "now").mockRestore();
  });

  it("does not show banner if previously dismissed and not expired", async () => {
    const futureExpiry = Date.now() + 12 * 60 * 60 * 1000;
    mockLocalStorageGetItem.mockReturnValue(
      JSON.stringify({ dismissed: true, expiresAt: futureExpiry }),
    );
    mockCheckConfigStatus.mockResolvedValue(makeConfigStatus());
    const { container } = render(<ConfigCheckBanner />);
    await act(() => Promise.resolve());
    expect(container.innerHTML).toBe("");
  });

  it("shows banner again if previously dismissed but expired", async () => {
    const pastExpiry = Date.now() - 12 * 60 * 60 * 1000;
    mockLocalStorageGetItem.mockReturnValue(
      JSON.stringify({ dismissed: true, expiresAt: pastExpiry }),
    );
    mockCheckConfigStatus.mockResolvedValue(makeConfigStatus());
    render(<ConfigCheckBanner />);
    await act(() => Promise.resolve());
    expect(screen.getByText("API 配置不完整")).toBeInTheDocument();
  });

  it("cleans up localStorage entry if dismissed but no expiresAt", async () => {
    mockLocalStorageGetItem.mockReturnValue(
      JSON.stringify({ dismissed: true }),
    );
    mockCheckConfigStatus.mockResolvedValue(makeConfigStatus());
    render(<ConfigCheckBanner />);
    await act(() => Promise.resolve());
    expect(mockLocalStorageRemoveItem).toHaveBeenCalledWith("config-banner-dismissed");
    expect(screen.getByText("API 配置不完整")).toBeInTheDocument();
  });

  it("cleans up localStorage entry on parse error", async () => {
    mockLocalStorageGetItem.mockReturnValue("not-valid-json{{{");
    mockCheckConfigStatus.mockResolvedValue(makeConfigStatus());
    render(<ConfigCheckBanner />);
    await act(() => Promise.resolve());
    expect(mockLocalStorageRemoveItem).toHaveBeenCalledWith("config-banner-dismissed");
    expect(screen.getByText("API 配置不完整")).toBeInTheDocument();
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
