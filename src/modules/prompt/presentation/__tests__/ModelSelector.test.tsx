import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderHook } from "@testing-library/react";

const { mockLoadConfig, mockPreferencesGet, mockPreferencesSet, mockPreferencesRemove, mockErrorLoggerWarn } = vi.hoisted(() => ({
  mockLoadConfig: vi.fn(),
  mockPreferencesGet: vi.fn(),
  mockPreferencesSet: vi.fn(),
  mockPreferencesRemove: vi.fn(),
  mockErrorLoggerWarn: vi.fn(),
}));

vi.mock("@/infrastructure/di", () => ({
  container: {
    loadConfig: mockLoadConfig,
  },
}));

vi.mock("@/shared/utils/preferences", () => ({
  preferencesStorage: {
    get: mockPreferencesGet,
    set: mockPreferencesSet,
    remove: mockPreferencesRemove,
    has: vi.fn().mockReturnValue(false),
  },
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: {
    warn: mockErrorLoggerWarn,
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
  },
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
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
  SelectTrigger: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="select-trigger" className={className}>{children}</div>
  ),
  SelectValue: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/shared/ui/badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="badge">{children}</span>
  ),
}));

vi.mock("lucide-react", () => ({
  Bot: () => <span data-testid="icon-bot">Bot</span>,
  Image: () => <span data-testid="icon-image">Image</span>,
  Video: () => <span data-testid="icon-video">Video</span>,
  Eye: () => <span data-testid="icon-eye">Eye</span>,
  Settings2: () => <span data-testid="icon-settings">Settings2</span>,
}));

import { ModelSelector, useModelSelection } from "@/modules/prompt/presentation/ModelSelector";
import type { ModelSelection } from "@/domain/schemas";

const mockConfig = {
  version: 1,
  providers: [
    {
      id: "openai",
      name: "OpenAI",
      format: "openai" as const,
      baseUrl: "https://api.openai.com",
      apiKey: "sk-test",
      models: [
        { id: "gpt-4", name: "GPT-4", capabilities: ["text" as const] },
        { id: "dall-e-3", name: "DALL-E 3", capabilities: ["image" as const] },
        { id: "gpt-4-vision", name: "GPT-4 Vision", capabilities: ["vision" as const, "text" as const] },
      ],
    },
    {
      id: "zhipu",
      name: "智谱AI",
      format: "zhipu" as const,
      baseUrl: "https://api.zhipuai.cn",
      apiKey: "zhipu-key",
      models: [
        { id: "cogvideox", name: "CogVideoX", capabilities: ["video" as const] },
        { id: "glm-4v", name: "GLM-4V", capabilities: ["vision" as const] },
      ],
    },
  ],
  mapping: {},
  fallback: { enabled: true, order: ["text", "image", "vision", "video"] as const },
};

describe("ModelSelector", () => {
  const defaultProps = {
    capability: "text" as const,
    onChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadConfig.mockResolvedValue(mockConfig);
  });

  it("shows loading state initially", () => {
    mockLoadConfig.mockReturnValue(new Promise(() => {}));

    render(<ModelSelector {...defaultProps} />);

    const pulseEl = document.querySelector(".animate-pulse");
    expect(pulseEl).toBeInTheDocument();
  });

  it("loads and displays models matching the capability", async () => {
    render(<ModelSelector {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByTestId("select")).toBeInTheDocument();
    });

    const select = screen.getByTestId("select");
    expect(select).toBeInTheDocument();

    const options = select.querySelectorAll("option");
    const optionTexts = Array.from(options).map((o) => o.textContent);

    expect(optionTexts).toContain("默认（使用设置中的配置）");
    expect(optionTexts.some((t) => t?.includes("OpenAI"))).toBe(true);
    expect(optionTexts.some((t) => t?.includes("GPT-4"))).toBe(true);
  });

  it("filters out models not matching capability", async () => {
    render(<ModelSelector {...defaultProps} capability="text" />);

    await waitFor(() => {
      expect(screen.getByTestId("select")).toBeInTheDocument();
    });

    const select = screen.getByTestId("select");
    const optionTexts = Array.from(select.querySelectorAll("option")).map((o) => o.textContent);

    expect(optionTexts.some((t) => t?.includes("GPT-4"))).toBe(true);
    expect(optionTexts.some((t) => t?.includes("GPT-4 Vision"))).toBe(true);
    expect(optionTexts.some((t) => t?.includes("DALL-E 3"))).toBe(false);
    expect(optionTexts.some((t) => t?.includes("CogVideoX"))).toBe(false);
  });

  it("shows config link when no models available", async () => {
    const emptyConfig = { ...mockConfig, providers: [] };
    mockLoadConfig.mockResolvedValue(emptyConfig);

    render(<ModelSelector {...defaultProps} capability="video" />);

    await waitFor(() => {
      expect(screen.getByText("请先配置视频模型")).toBeInTheDocument();
    });

    const link = screen.getByText("请先配置视频模型").closest("a");
    expect(link).toHaveAttribute("href", "/settings");
  });

  it("shows config link when loadConfig fails", async () => {
    mockLoadConfig.mockRejectedValue(new Error("Network error"));

    render(<ModelSelector {...defaultProps} capability="text" />);

    await waitFor(() => {
      expect(screen.getByText("请先配置文本模型")).toBeInTheDocument();
    });
  });

  it("calls onChange with null when default option selected", async () => {
    const onChange = vi.fn();
    render(<ModelSelector {...defaultProps} onChange={onChange} />);

    await waitFor(() => {
      expect(screen.getByTestId("select")).toBeInTheDocument();
    });

    const select = screen.getByTestId("select");
    await userEvent.selectOptions(select, "");

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("calls onChange with correct ModelSelection when a model is selected", async () => {
    const onChange = vi.fn();
    render(<ModelSelector {...defaultProps} capability="text" onChange={onChange} />);

    await waitFor(() => {
      expect(screen.getByTestId("select")).toBeInTheDocument();
    });

    const select = screen.getByTestId("select");
    await userEvent.selectOptions(select, "openai/gpt-4");

    expect(onChange).toHaveBeenCalledWith({
      providerId: "openai",
      modelId: "gpt-4",
      providerName: "OpenAI",
      modelName: "GPT-4",
      format: "openai",
    });
  });

  it("displays current value when value prop is provided", async () => {
    const value: ModelSelection = {
      providerId: "openai",
      modelId: "gpt-4",
      providerName: "OpenAI",
      modelName: "GPT-4",
      format: "openai",
    };

    render(<ModelSelector {...defaultProps} value={value} />);

    await waitFor(() => {
      expect(screen.getByTestId("select")).toBeInTheDocument();
    });

    const select = screen.getByTestId("select") as HTMLSelectElement;
    expect(select.value).toBe("openai/gpt-4");
  });

  it("shows Badge when value is set", async () => {
    const value: ModelSelection = {
      providerId: "openai",
      modelId: "gpt-4",
      providerName: "OpenAI",
      modelName: "GPT-4",
      format: "openai",
    };

    render(<ModelSelector {...defaultProps} capability="text" value={value} />);

    await waitFor(() => {
      expect(screen.getByTestId("badge")).toBeInTheDocument();
    });

    expect(screen.getByTestId("badge")).toHaveTextContent("GPT-4");
  });

  it("does not show Badge when value is null", async () => {
    render(<ModelSelector {...defaultProps} value={null} />);

    await waitFor(() => {
      expect(screen.getByTestId("select")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("badge")).not.toBeInTheDocument();
  });

  it("re-fetches models when capability changes", async () => {
    const { rerender } = render(<ModelSelector {...defaultProps} capability="text" />);

    await waitFor(() => {
      expect(screen.getByTestId("select")).toBeInTheDocument();
    });

    expect(mockLoadConfig).toHaveBeenCalledTimes(1);

    rerender(<ModelSelector {...defaultProps} capability="image" />);

    await waitFor(() => {
      expect(mockLoadConfig).toHaveBeenCalledTimes(2);
    });

    const select = screen.getByTestId("select");
    const optionTexts = Array.from(select.querySelectorAll("option")).map((o) => o.textContent);

    expect(optionTexts.some((t) => t?.includes("DALL-E 3"))).toBe(true);
    expect(optionTexts.some((t) => t?.includes("GPT-4"))).toBe(false);
  });

  it("shows correct capability label for image", async () => {
    const emptyConfig = { ...mockConfig, providers: [] };
    mockLoadConfig.mockResolvedValue(emptyConfig);

    render(<ModelSelector {...defaultProps} capability="image" />);

    await waitFor(() => {
      expect(screen.getByText("请先配置图片模型")).toBeInTheDocument();
    });
  });

  it("shows correct capability label for vision", async () => {
    mockLoadConfig.mockRejectedValue(new Error("fail"));

    render(<ModelSelector {...defaultProps} capability="vision" />);

    await waitFor(() => {
      expect(screen.getByText("请先配置视觉模型")).toBeInTheDocument();
    });
  });

  it("shows correct capability label for video", async () => {
    const emptyConfig = { ...mockConfig, providers: [] };
    mockLoadConfig.mockResolvedValue(emptyConfig);

    render(<ModelSelector {...defaultProps} capability="video" />);

    await waitFor(() => {
      expect(screen.getByText("请先配置视频模型")).toBeInTheDocument();
    });
  });

  it("renders compact mode by default", async () => {
    render(<ModelSelector {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByTestId("select")).toBeInTheDocument();
    });

    const trigger = screen.getByTestId("select-trigger");
    expect(trigger.className).toContain("w-[180px]");
  });

  it("renders non-compact mode with label", async () => {
    render(<ModelSelector {...defaultProps} compact={false} />);

    await waitFor(() => {
      expect(screen.getByTestId("select")).toBeInTheDocument();
    });

    expect(screen.getByText("文本模型:")).toBeInTheDocument();

    const trigger = screen.getByTestId("select-trigger");
    expect(trigger.className).toContain("w-[240px]");
  });

  it("includes format in ModelSelection when provider has format", async () => {
    const onChange = vi.fn();
    render(<ModelSelector {...defaultProps} capability="image" onChange={onChange} />);

    await waitFor(() => {
      expect(screen.getByTestId("select")).toBeInTheDocument();
    });

    const select = screen.getByTestId("select");
    await userEvent.selectOptions(select, "openai/dall-e-3");

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        format: "openai",
      }),
    );
  });

  it("handles select of model from second provider", async () => {
    const onChange = vi.fn();
    render(<ModelSelector {...defaultProps} capability="vision" onChange={onChange} />);

    await waitFor(() => {
      expect(screen.getByTestId("select")).toBeInTheDocument();
    });

    const select = screen.getByTestId("select");
    await userEvent.selectOptions(select, "zhipu/glm-4v");

    expect(onChange).toHaveBeenCalledWith({
      providerId: "zhipu",
      modelId: "glm-4v",
      providerName: "智谱AI",
      modelName: "GLM-4V",
      format: "zhipu",
    });
  });
});

describe("useModelSelection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPreferencesGet.mockReturnValue(null);
    mockPreferencesSet.mockReturnValue(undefined);
    mockPreferencesRemove.mockReturnValue(undefined);
  });

  it("returns null initially when no stored value", () => {
    const { result } = renderHook(() => useModelSelection("test-key"));

    expect(result.current[0]).toBeNull();
  });

  it("loads stored selection from preferencesStorage", () => {
    const stored: ModelSelection = {
      providerId: "openai",
      modelId: "gpt-4",
      providerName: "OpenAI",
      modelName: "GPT-4",
      format: "openai",
    };
    mockPreferencesGet.mockReturnValue(stored);

    const { result } = renderHook(() => useModelSelection("model-key"));

    expect(result.current[0]).toEqual(stored);
    expect(mockPreferencesGet).toHaveBeenCalledWith("model-key", null);
  });

  it("updates selection and saves to preferencesStorage", () => {
    const { result } = renderHook(() => useModelSelection("model-key"));

    const newSelection: ModelSelection = {
      providerId: "zhipu",
      modelId: "cogvideox",
      providerName: "智谱AI",
      modelName: "CogVideoX",
      format: "zhipu",
    };

    act(() => {
      result.current[1](newSelection);
    });

    expect(result.current[0]).toEqual(newSelection);
    expect(mockPreferencesSet).toHaveBeenCalledWith("model-key", newSelection);
  });

  it("removes from preferencesStorage when set to null", () => {
    const stored: ModelSelection = {
      providerId: "openai",
      modelId: "gpt-4",
      providerName: "OpenAI",
      modelName: "GPT-4",
    };
    mockPreferencesGet.mockReturnValue(stored);

    const { result } = renderHook(() => useModelSelection("model-key"));

    expect(result.current[0]).toEqual(stored);

    act(() => {
      result.current[1](null);
    });

    expect(result.current[0]).toBeNull();
    expect(mockPreferencesRemove).toHaveBeenCalledWith("model-key");
  });

  it("handles storage read errors gracefully", () => {
    mockPreferencesGet.mockImplementation(() => {
      throw new Error("Storage corrupted");
    });

    const { result } = renderHook(() => useModelSelection("bad-key"));

    expect(result.current[0]).toBeNull();
    expect(mockErrorLoggerWarn).toHaveBeenCalled();
  });
});
