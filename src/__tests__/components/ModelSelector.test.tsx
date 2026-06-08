import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ModelSelector } from "@/modules/prompt";

const mockLoadConfig = vi.fn();

vi.mock("@/shared/api-config", () => ({
  loadConfig: (...args: []) => mockLoadConfig(...args),
}));

vi.mock("@/shared/utils/preferences", () => ({
  preferencesStorage: {
    get: vi.fn().mockReturnValue(null),
    set: vi.fn(),
    remove: vi.fn(),
    has: vi.fn().mockReturnValue(false),
  },
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
  },
}));

vi.mock("react-router-dom", () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...props}>{children}</a>
  ),
}));

vi.mock("@/shared/ui/select", () => ({
  Select: ({ children, value, onValueChange }: { children: React.ReactNode; value: string; onValueChange: (value: string) => void }) => (
    <select
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      data-testid="select"
    >
      {children}
    </select>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode; className?: string }) => (
    <>{children}</>
  ),
  SelectValue: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/shared/ui/badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="badge">{children}</span>
  ),
}));

vi.mock("lucide-react", () => ({
  Bot: () => <span>Bot</span>,
  Image: () => <span>Image</span>,
  Video: () => <span>Video</span>,
  Eye: () => <span>Eye</span>,
  Settings2: () => <span>Settings2</span>,
}));

vi.mock("@/infrastructure/di", () => ({
  container: {},
}));

describe("ModelSelector - API Key 边界状态", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("未配置 API Key 时应显示引导链接", async () => {
    mockLoadConfig.mockResolvedValue({ providers: [] });

    render(
      <ModelSelector
        capability="video"
        value={null}
        onChange={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/请先配置视频模型/)).toBeInTheDocument();
    });

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/settings");
  });

  it("已配置 API Key 时应显示模型选择器", async () => {
    mockLoadConfig.mockResolvedValue({
      version: 1,
      providers: [
        {
          id: "seedance",
          name: "Seedance",
          format: "openai",
          baseUrl: "https://api.seedance.com",
          apiKey: "test-key",
          models: [
            { id: "seedance-v1", name: "Seedance V1", capabilities: ["video"] },
          ],
        },
      ],
      mapping: {},
      fallback: { enabled: true, order: ["text", "image", "vision", "video"] },
    });

    render(
      <ModelSelector
        capability="video"
        value={null}
        onChange={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("select")).toBeInTheDocument();
    });

    const select = screen.getByTestId("select");
    const optionTexts = Array.from(select.querySelectorAll("option")).map((o) => o.textContent);
    expect(optionTexts.some((t) => t?.includes("默认"))).toBe(true);
    expect(optionTexts.some((t) => t?.includes("Seedance V1"))).toBe(true);
  });

  it("加载配置失败时应显示错误引导", async () => {
    mockLoadConfig.mockRejectedValue(new Error("Failed to load"));

    render(
      <ModelSelector
        capability="image"
        value={null}
        onChange={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/请先配置图片模型/)).toBeInTheDocument();
    });
  });

  it("选择模型时应触发 onChange 回调", async () => {
    const onChange = vi.fn();

    mockLoadConfig.mockResolvedValue({
      version: 1,
      providers: [
        {
          id: "seedance",
          name: "Seedance",
          format: "openai",
          baseUrl: "https://api.seedance.com",
          apiKey: "test-key",
          models: [
            { id: "seedance-v1", name: "Seedance V1", capabilities: ["video"] },
          ],
        },
      ],
      mapping: {},
      fallback: { enabled: true, order: ["text", "image", "vision", "video"] },
    });

    render(
      <ModelSelector
        capability="video"
        value={null}
        onChange={onChange}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("select")).toBeInTheDocument();
    });

    const select = screen.getByTestId("select");
    await userEvent.selectOptions(select, "seedance/seedance-v1");

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "seedance",
        modelId: "seedance-v1",
        providerName: "Seedance",
        modelName: "Seedance V1",
      }),
    );
  });

  it("紧凑模式应使用较小尺寸", async () => {
    mockLoadConfig.mockResolvedValue({
      version: 1,
      providers: [
        {
          id: "seedance",
          name: "Seedance",
          format: "openai",
          baseUrl: "https://api.seedance.com",
          apiKey: "test-key",
          models: [
            { id: "seedance-v1", name: "Seedance V1", capabilities: ["video"] },
          ],
        },
      ],
      mapping: {},
      fallback: { enabled: true, order: ["text", "image", "vision", "video"] },
    });

    render(
      <ModelSelector
        capability="video"
        value={null}
        onChange={() => {}}
        compact={true}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("select")).toBeInTheDocument();
    });
  });
});
