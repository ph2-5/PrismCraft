import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { mockValidatePluginConfig, mockAddPlugin, mockShowError, mockShowSuccess } = vi.hoisted(() => ({
  mockValidatePluginConfig: vi.fn(),
  mockAddPlugin: vi.fn(),
  mockShowError: vi.fn(),
  mockShowSuccess: vi.fn(),
}));

vi.mock("../plugin-api", () => ({
  validatePluginConfig: mockValidatePluginConfig,
  addPlugin: mockAddPlugin,
}));

vi.mock("@/shared/presentation/Toast", () => ({
  useToastHelpers: () => ({ error: mockShowError, success: mockShowSuccess }),
}));

vi.mock("@/shared/constants", () => ({
  t: (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`;
    return key;
  },
}));

vi.mock("@/shared/ui/button", () => ({
  Button: ({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) => (
    <button onClick={onClick} disabled={disabled}>{children}</button>
  ),
}));

vi.mock("@/shared/ui/textarea", () => ({
  Textarea: ({ value, onChange, placeholder }: { value: string; onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void; placeholder?: string }) => (
    <textarea value={value} onChange={onChange} placeholder={placeholder} data-testid="json-textarea" />
  ),
}));

vi.mock("@/shared/ui/alert", () => ({
  Alert: ({ children, variant }: { children: React.ReactNode; variant?: string }) => <div data-testid="alert" data-variant={variant}>{children}</div>,
  AlertDescription: ({ children }: { children: React.ReactNode }) => <div data-testid="alert-desc">{children}</div>,
}));

vi.mock("@/shared/ui/label", () => ({
  Label: ({ children }: { children: React.ReactNode }) => <label>{children}</label>,
}));

vi.mock("lucide-react", () => ({
  Loader2: () => <span data-testid="loader-icon">Loading</span>,
  Upload: () => <span>Upload</span>,
  CheckCircle: () => <span>CheckCircle</span>,
  XCircle: () => <span>XCircle</span>,
  FileJson: () => <span>FileJson</span>,
}));

import { PluginAddForm } from "../plugin-add-form";

function buildProps(overrides: Partial<{ onAdded: () => void; onCancel: () => void }> = {}) {
  return {
    onAdded: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
}

const VALID_JSON = JSON.stringify({
  id: "my-provider",
  version: "1.0.0",
  displayName: "My Provider",
});

function setInputValue(textarea: HTMLElement, value: string) {
  fireEvent.change(textarea, { target: { value } });
}

describe("PluginAddForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders JSON input textarea", () => {
    render(<PluginAddForm {...buildProps()} />);

    expect(screen.getByTestId("json-textarea")).toBeInTheDocument();
  });

  it("renders validate and add buttons", () => {
    render(<PluginAddForm {...buildProps()} />);

    expect(screen.getByText("plugin.validateConfig")).toBeInTheDocument();
    expect(screen.getByText("plugin.addPluginBtn")).toBeInTheDocument();
    expect(screen.getByText("common.cancel")).toBeInTheDocument();
  });

  it("disables validate and add buttons when input is empty", () => {
    render(<PluginAddForm {...buildProps()} />);

    expect(screen.getByText("plugin.validateConfig").closest("button")).toBeDisabled();
    expect(screen.getByText("plugin.addPluginBtn").closest("button")).toBeDisabled();
  });

  it("enables buttons when input has content", () => {
    render(<PluginAddForm {...buildProps()} />);

    setInputValue(screen.getByTestId("json-textarea"), VALID_JSON);

    expect(screen.getByText("plugin.validateConfig").closest("button")).not.toBeDisabled();
    expect(screen.getByText("plugin.addPluginBtn").closest("button")).not.toBeDisabled();
  });

  it("shows error for invalid JSON on validate", async () => {
    const user = userEvent.setup();
    render(<PluginAddForm {...buildProps()} />);

    setInputValue(screen.getByTestId("json-textarea"), "not valid json");
    await user.click(screen.getByText("plugin.validateConfig"));

    expect(screen.getByTestId("alert")).toBeInTheDocument();
    expect(screen.getByTestId("alert")).toHaveAttribute("data-variant", "destructive");
  });

  it("shows validation result from API on valid JSON", async () => {
    const user = userEvent.setup();
    mockValidatePluginConfig.mockResolvedValue({ valid: true, errors: [] });

    render(<PluginAddForm {...buildProps()} />);

    setInputValue(screen.getByTestId("json-textarea"), VALID_JSON);
    await user.click(screen.getByText("plugin.validateConfig"));

    await waitFor(() => {
      expect(screen.getByTestId("alert")).toBeInTheDocument();
    });
    expect(screen.getByTestId("alert")).toHaveAttribute("data-variant", "default");
  });

  it("shows validation errors from API when config is invalid", async () => {
    const user = userEvent.setup();
    mockValidatePluginConfig.mockResolvedValue({ valid: false, errors: ["Missing id field"] });

    render(<PluginAddForm {...buildProps()} />);

    setInputValue(screen.getByTestId("json-textarea"), VALID_JSON);
    await user.click(screen.getByText("plugin.validateConfig"));

    await waitFor(() => {
      expect(screen.getByTestId("alert")).toBeInTheDocument();
    });
    expect(screen.getByTestId("alert")).toHaveAttribute("data-variant", "destructive");
    expect(screen.getByText(/Missing id field/)).toBeInTheDocument();
  });

  it("calls addPlugin and onAdded when add button is clicked with valid config", async () => {
    const user = userEvent.setup();
    const onAdded = vi.fn();
    mockValidatePluginConfig.mockResolvedValue({ valid: true, errors: [] });
    mockAddPlugin.mockResolvedValue(undefined);

    render(<PluginAddForm {...buildProps({ onAdded })} />);

    setInputValue(screen.getByTestId("json-textarea"), VALID_JSON);
    await user.click(screen.getByText("plugin.addPluginBtn"));

    await waitFor(() => {
      expect(mockAddPlugin).toHaveBeenCalled();
    });
    expect(onAdded).toHaveBeenCalled();
    expect(mockShowSuccess).toHaveBeenCalled();
  });

  it("shows error toast and does not add when validation fails on add", async () => {
    const user = userEvent.setup();
    const onAdded = vi.fn();
    mockValidatePluginConfig.mockResolvedValue({ valid: false, errors: ["Invalid config"] });

    render(<PluginAddForm {...buildProps({ onAdded })} />);

    setInputValue(screen.getByTestId("json-textarea"), VALID_JSON);
    await user.click(screen.getByText("plugin.addPluginBtn"));

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalled();
    });
    expect(mockAddPlugin).not.toHaveBeenCalled();
    expect(onAdded).not.toHaveBeenCalled();
  });

  it("shows error toast when addPlugin API fails", async () => {
    const user = userEvent.setup();
    const onAdded = vi.fn();
    mockValidatePluginConfig.mockResolvedValue({ valid: true, errors: [] });
    mockAddPlugin.mockRejectedValue(new Error("Server error"));

    render(<PluginAddForm {...buildProps({ onAdded })} />);

    setInputValue(screen.getByTestId("json-textarea"), VALID_JSON);
    await user.click(screen.getByText("plugin.addPluginBtn"));

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith("plugin.addFailed", "Server error");
    });
    expect(onAdded).not.toHaveBeenCalled();
  });

  it("shows error toast for invalid JSON on add", async () => {
    const user = userEvent.setup();
    const onAdded = vi.fn();

    render(<PluginAddForm {...buildProps({ onAdded })} />);

    setInputValue(screen.getByTestId("json-textarea"), "invalid json content");
    await user.click(screen.getByText("plugin.addPluginBtn"));

    expect(mockShowError).toHaveBeenCalled();
    expect(mockAddPlugin).not.toHaveBeenCalled();
    expect(onAdded).not.toHaveBeenCalled();
  });

  it("calls onCancel when cancel button is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(<PluginAddForm {...buildProps({ onCancel })} />);

    await user.click(screen.getByText("common.cancel"));

    expect(onCancel).toHaveBeenCalled();
  });

  it("clears validation result when textarea content changes", async () => {
    const user = userEvent.setup();
    mockValidatePluginConfig.mockResolvedValue({ valid: true, errors: [] });

    render(<PluginAddForm {...buildProps()} />);

    setInputValue(screen.getByTestId("json-textarea"), VALID_JSON);
    await user.click(screen.getByText("plugin.validateConfig"));

    await waitFor(() => {
      expect(screen.getByTestId("alert")).toBeInTheDocument();
    });

    setInputValue(screen.getByTestId("json-textarea"), VALID_JSON + " updated");

    expect(screen.queryByTestId("alert")).not.toBeInTheDocument();
  });

  it("renders file upload button", () => {
    render(<PluginAddForm {...buildProps()} />);

    expect(screen.getByText("plugin.uploadJsonFile")).toBeInTheDocument();
  });
});
