import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { mockFetchPlugins, mockDeletePlugin, mockReloadPlugins, mockReloadCodePlugins, mockFetchPluginSchema, mockFetchPluginSpecification, mockFetchCodePluginsDir, mockLoadPluginDetectionRules, mockLoadPluginTemplates, mockLoadModelProfilesFromServer, mockConfirm, mockShowError, mockShowSuccess, mockIsElectron, mockErrorLogger } = vi.hoisted(() => ({
  mockFetchPlugins: vi.fn(),
  mockDeletePlugin: vi.fn(),
  mockReloadPlugins: vi.fn(),
  mockReloadCodePlugins: vi.fn(),
  mockFetchPluginSchema: vi.fn(),
  mockFetchPluginSpecification: vi.fn(),
  mockFetchCodePluginsDir: vi.fn(),
  mockLoadPluginDetectionRules: vi.fn(),
  mockLoadPluginTemplates: vi.fn(),
  mockLoadModelProfilesFromServer: vi.fn(),
  mockConfirm: vi.fn(),
  mockShowError: vi.fn(),
  mockShowSuccess: vi.fn(),
  mockIsElectron: vi.fn(),
  mockErrorLogger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("../plugin-api", () => ({
  fetchPlugins: mockFetchPlugins,
  deletePlugin: mockDeletePlugin,
  reloadPlugins: mockReloadPlugins,
  reloadCodePlugins: mockReloadCodePlugins,
  fetchPluginSchema: mockFetchPluginSchema,
  fetchPluginSpecification: mockFetchPluginSpecification,
  fetchCodePluginsDir: mockFetchCodePluginsDir,
}));

vi.mock("@/infrastructure/api-config-facade", () => ({
  loadPluginDetectionRules: mockLoadPluginDetectionRules,
  loadPluginTemplates: mockLoadPluginTemplates,
}));

vi.mock("@/shared/model-capabilities", () => ({
  loadModelProfilesFromServer: mockLoadModelProfilesFromServer,
}));

vi.mock("@/shared/utils/confirm", () => ({
  confirm: mockConfirm,
}));

vi.mock("@/shared/presentation/Toast", () => ({
  useToastHelpers: () => ({ error: mockShowError, success: mockShowSuccess }),
}));

vi.mock("@/shared/utils/platform", () => ({
  isElectron: mockIsElectron,
}));

vi.mock("@/shared/utils/user-facing-error", () => ({
  mapUserFacingError: vi.fn((err: unknown) => err instanceof Error ? err.message : String(err)),
}));

vi.mock("@/shared/hooks/use-model-capabilities", () => ({
  useInvalidateModelCapabilities: () => vi.fn(),
}));

vi.mock("@/shared/hooks/use-provider-templates", () => ({
  useInvalidateProviderTemplates: () => vi.fn(),
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: mockErrorLogger,
}));

vi.mock("@/shared/constants", () => ({
  t: (key: string, params?: Record<string, unknown>) => {
    if (params) {
      return `${key}:${JSON.stringify(params)}`;
    }
    return key;
  },
}));

vi.mock("../PluginList", () => ({
  PluginList: ({ builtInPlugins, declarativePlugins, codePlugins, onDelete, onToggleExpand: _onToggleExpand, expandedPlugin }: {
    builtInPlugins: Array<{ id: string; displayName: string }>;
    declarativePlugins: Array<{ id: string; displayName: string }>;
    codePlugins: Array<{ id: string; displayName: string }>;
    onDelete: (id: string, name: string) => void;
    onToggleExpand: (id: string | null) => void;
    expandedPlugin: string | null;
  }) => (
    <div data-testid="plugin-list">
      <span data-testid="builtin-count">{builtInPlugins.length}</span>
      <span data-testid="declarative-count">{declarativePlugins.length}</span>
      <span data-testid="code-count">{codePlugins.length}</span>
      <span data-testid="expanded-plugin">{expandedPlugin}</span>
      {builtInPlugins.map((p) => <div key={p.id} data-testid={`builtin-${p.id}`}>{p.displayName}</div>)}
      {declarativePlugins.map((p) => (
        <div key={p.id} data-testid={`declarative-${p.id}`}>
          {p.displayName}
          <button data-testid={`delete-${p.id}`} onClick={() => onDelete(p.id, p.displayName)}>Delete</button>
        </div>
      ))}
      {codePlugins.map((p) => (
        <div key={p.id} data-testid={`code-${p.id}`}>
          {p.displayName}
          <button data-testid={`delete-${p.id}`} onClick={() => onDelete(p.id, p.displayName)}>Delete</button>
        </div>
      ))}
    </div>
  ),
}));

vi.mock("../plugin-add-form", () => ({
  PluginAddForm: ({ onAdded, onCancel }: { onAdded: () => void; onCancel: () => void }) => (
    <div data-testid="plugin-add-form">
      <button data-testid="add-form-added" onClick={onAdded}>Added</button>
      <button data-testid="add-form-cancel" onClick={onCancel}>Cancel</button>
    </div>
  ),
}));

vi.mock("../plugin-creator", () => ({
  default: ({ onComplete }: { onComplete: () => void }) => (
    <div data-testid="plugin-creator">
      <button data-testid="creator-complete" onClick={onComplete}>Complete</button>
    </div>
  ),
}));

vi.mock("../plugin-schema-viewer", () => ({
  PluginSchemaViewer: ({ schemaData }: { schemaData: Record<string, unknown> }) => (
    <div data-testid="plugin-schema-viewer">{JSON.stringify(schemaData)}</div>
  ),
}));

vi.mock("../plugin-spec-viewer", () => ({
  PluginSpecViewer: ({ specContent }: { specContent: string }) => (
    <div data-testid="plugin-spec-viewer">{specContent}</div>
  ),
}));

vi.mock("lucide-react", () => ({
  Loader2: () => <span data-testid="loader-icon">Loading</span>,
  Puzzle: () => <span data-testid="puzzle-icon">Puzzle</span>,
  Upload: () => <span data-testid="upload-icon">Upload</span>,
  RefreshCw: () => <span data-testid="refresh-icon">Refresh</span>,
  BookOpen: () => <span data-testid="book-icon">Book</span>,
  FileText: () => <span data-testid="filetext-icon">FileText</span>,
  FolderOpen: () => <span data-testid="folder-icon">Folder</span>,
}));

import PluginManager from "../plugin-manager";

function buildPluginInfo(overrides: Partial<{
  id: string;
  displayName: string;
  isUserPlugin: boolean;
  isCodePlugin: boolean;
  capabilities: { video: boolean; image: boolean; text: boolean; vision: boolean };
}> = {}) {
  return {
    id: "plugin-1",
    displayName: "Test Plugin",
    isUserPlugin: false,
    isCodePlugin: false,
    capabilities: { video: true, image: false, text: false, vision: false },
    videoCapabilities: { supportsLastFrame: false, supportsReferenceVideo: false, supportsMimicryLevel: false, defaultModel: "model-1", maxDuration: 10 },
    imageCapabilities: { supportsReferenceImage: false, defaultModel: "img-model" },
    ...overrides,
  };
}

function buildPluginListData(overrides: Partial<{
  plugins: ReturnType<typeof buildPluginInfo>[];
  userPluginFiles: Array<{ id: string; fileName: string; filePath: string; displayName: string; version: string; valid: boolean; errors: string[] }>;
}> = {}) {
  return {
    plugins: [],
    userPluginFiles: [],
    ...overrides,
  };
}

describe("PluginManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsElectron.mockReturnValue(true);
    mockFetchPlugins.mockResolvedValue(buildPluginListData());
    mockLoadPluginDetectionRules.mockResolvedValue(undefined);
    mockLoadPluginTemplates.mockResolvedValue(undefined);
    mockLoadModelProfilesFromServer.mockResolvedValue(undefined);
    mockConfirm.mockResolvedValue(true);
  });

  it("shows loading state initially", () => {
    mockFetchPlugins.mockReturnValue(new Promise(() => {}));
    render(<PluginManager />);

    expect(screen.getByTestId("loader-icon")).toBeInTheDocument();
  });

  it("loads plugins on mount and renders plugin list", async () => {
    const plugins = [
      buildPluginInfo({ id: "builtin-1", displayName: "Built-in Plugin", isUserPlugin: false, isCodePlugin: false }),
      buildPluginInfo({ id: "declarative-1", displayName: "Declarative Plugin", isUserPlugin: true, isCodePlugin: false }),
      buildPluginInfo({ id: "code-1", displayName: "Code Plugin", isUserPlugin: false, isCodePlugin: true }),
    ];
    mockFetchPlugins.mockResolvedValue(buildPluginListData({ plugins }));

    render(<PluginManager />);

    await waitFor(() => {
      expect(screen.getByTestId("plugin-list")).toBeInTheDocument();
    });

    expect(screen.getByTestId("builtin-count")).toHaveTextContent("1");
    expect(screen.getByTestId("declarative-count")).toHaveTextContent("1");
    expect(screen.getByTestId("code-count")).toHaveTextContent("1");
  });

  it("does not load plugins when not in Electron", async () => {
    mockIsElectron.mockReturnValue(false);

    render(<PluginManager />);

    await waitFor(() => {
      expect(screen.getByTestId("plugin-list")).toBeInTheDocument();
    });

    expect(mockFetchPlugins).not.toHaveBeenCalled();
  });

  it("shows Add Plugin buttons", async () => {
    mockFetchPlugins.mockResolvedValue(buildPluginListData());

    render(<PluginManager />);

    await waitFor(() => {
      expect(screen.getByTestId("plugin-list")).toBeInTheDocument();
    });

    expect(screen.getByText("plugin.createPlugin")).toBeInTheDocument();
    expect(screen.getByText("plugin.importJson")).toBeInTheDocument();
  });

  it("shows PluginAddForm when import JSON button is clicked", async () => {
    const user = userEvent.setup();
    mockFetchPlugins.mockResolvedValue(buildPluginListData());

    render(<PluginManager />);

    await waitFor(() => {
      expect(screen.getByTestId("plugin-list")).toBeInTheDocument();
    });

    await user.click(screen.getByText("plugin.importJson"));

    expect(screen.getByTestId("plugin-add-form")).toBeInTheDocument();
  });

  it("hides add form and reloads plugins when onAdded is called", async () => {
    const user = userEvent.setup();
    mockFetchPlugins.mockResolvedValue(buildPluginListData());

    render(<PluginManager />);

    await waitFor(() => {
      expect(screen.getByTestId("plugin-list")).toBeInTheDocument();
    });

    await user.click(screen.getByText("plugin.importJson"));
    expect(screen.getByTestId("plugin-add-form")).toBeInTheDocument();

    await user.click(screen.getByTestId("add-form-added"));

    expect(screen.queryByTestId("plugin-add-form")).not.toBeInTheDocument();
    expect(mockFetchPlugins).toHaveBeenCalledTimes(2);
  });

  it("hides add form when onCancel is called", async () => {
    const user = userEvent.setup();
    mockFetchPlugins.mockResolvedValue(buildPluginListData());

    render(<PluginManager />);

    await waitFor(() => {
      expect(screen.getByTestId("plugin-list")).toBeInTheDocument();
    });

    await user.click(screen.getByText("plugin.importJson"));
    await user.click(screen.getByTestId("add-form-cancel"));

    expect(screen.queryByTestId("plugin-add-form")).not.toBeInTheDocument();
  });

  it("calls deletePlugin when onDelete is called and confirmed", async () => {
    const user = userEvent.setup();
    const plugins = [
      buildPluginInfo({ id: "decl-1", displayName: "My Plugin", isUserPlugin: true, isCodePlugin: false }),
    ];
    mockFetchPlugins.mockResolvedValue(buildPluginListData({ plugins }));
    mockDeletePlugin.mockResolvedValue(undefined);
    mockConfirm.mockResolvedValue(true);

    render(<PluginManager />);

    await waitFor(() => {
      expect(screen.getByTestId("plugin-list")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("delete-decl-1"));

    const confirmCall = mockConfirm.mock.calls[0]!;
    expect(confirmCall[0]).toContain("plugin.confirmDelete");
    expect(confirmCall[1]).toBe("plugin.confirmDeleteTitle");
    expect(mockDeletePlugin).toHaveBeenCalledWith("decl-1");
    expect(mockShowSuccess).toHaveBeenCalled();
  });

  it("does not delete when confirm is cancelled", async () => {
    const user = userEvent.setup();
    const plugins = [
      buildPluginInfo({ id: "decl-1", displayName: "My Plugin", isUserPlugin: true, isCodePlugin: false }),
    ];
    mockFetchPlugins.mockResolvedValue(buildPluginListData({ plugins }));
    mockConfirm.mockResolvedValue(false);

    render(<PluginManager />);

    await waitFor(() => {
      expect(screen.getByTestId("plugin-list")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("delete-decl-1"));

    expect(mockDeletePlugin).not.toHaveBeenCalled();
  });

  it("shows error toast when deletePlugin fails", async () => {
    const user = userEvent.setup();
    const plugins = [
      buildPluginInfo({ id: "decl-1", displayName: "My Plugin", isUserPlugin: true, isCodePlugin: false }),
    ];
    mockFetchPlugins.mockResolvedValue(buildPluginListData({ plugins }));
    mockConfirm.mockResolvedValue(true);
    mockDeletePlugin.mockRejectedValue(new Error("Delete failed"));

    render(<PluginManager />);

    await waitFor(() => {
      expect(screen.getByTestId("plugin-list")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("delete-decl-1"));

    expect(mockShowError).toHaveBeenCalledWith("plugin.deleteFailed", "Delete failed");
  });

  it("calls reloadPlugins when reload button is clicked", async () => {
    const user = userEvent.setup();
    mockFetchPlugins.mockResolvedValue(buildPluginListData());
    mockReloadPlugins.mockResolvedValue({ loaded: 3, errors: [] });

    render(<PluginManager />);

    await waitFor(() => {
      expect(screen.getByTestId("plugin-list")).toBeInTheDocument();
    });

    await user.click(screen.getByText("plugin.reload"));

    expect(mockReloadPlugins).toHaveBeenCalled();
    await waitFor(() => {
      expect(mockShowSuccess).toHaveBeenCalled();
    });
  });

  it("shows error toast when reloadPlugins fails", async () => {
    const user = userEvent.setup();
    mockFetchPlugins.mockResolvedValue(buildPluginListData());
    mockReloadPlugins.mockRejectedValue(new Error("Reload failed"));

    render(<PluginManager />);

    await waitFor(() => {
      expect(screen.getByTestId("plugin-list")).toBeInTheDocument();
    });

    await user.click(screen.getByText("plugin.reload"));

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith("plugin.reloadFailed", "Reload failed");
    });
  });

  it("shows error toast when fetchPlugins fails on mount", async () => {
    mockFetchPlugins.mockRejectedValue(new Error("Network error"));

    render(<PluginManager />);

    await waitFor(() => {
      expect(screen.getByTestId("plugin-list")).toBeInTheDocument();
    });

    expect(mockErrorLogger.error).toHaveBeenCalled();
  });

  it("shows invalid plugins alert when userPluginFiles have invalid entries", async () => {
    const userPluginFiles = [
      { id: "bad-1", fileName: "bad.plugin.json", filePath: "/bad", displayName: "Bad Plugin", version: "1.0", valid: false, errors: ["Invalid schema"] },
    ];
    mockFetchPlugins.mockResolvedValue(buildPluginListData({ userPluginFiles }));

    render(<PluginManager />);

    await waitFor(() => {
      expect(screen.getByText(/plugin.invalidPluginsExist/)).toBeInTheDocument();
    });

    expect(screen.getByText(/bad\.plugin\.json/)).toBeInTheDocument();
  });

  it("shows PluginCreator when create plugin button is clicked", async () => {
    const user = userEvent.setup();
    mockFetchPlugins.mockResolvedValue(buildPluginListData());

    render(<PluginManager />);

    await waitFor(() => {
      expect(screen.getByTestId("plugin-list")).toBeInTheDocument();
    });

    await user.click(screen.getByText("plugin.createPlugin"));

    expect(screen.getByTestId("plugin-creator")).toBeInTheDocument();
  });

  it("shows code plugin reload buttons when code plugins exist", async () => {
    const plugins = [
      buildPluginInfo({ id: "code-1", displayName: "Code Plugin", isUserPlugin: false, isCodePlugin: true }),
    ];
    mockFetchPlugins.mockResolvedValue(buildPluginListData({ plugins }));

    render(<PluginManager />);

    await waitFor(() => {
      expect(screen.getByText("plugin.reloadCodePlugins")).toBeInTheDocument();
    });
    expect(screen.getByText("plugin.openCodePluginDir")).toBeInTheDocument();
  });

  it("calls reloadCodePlugins when code plugin reload button is clicked", async () => {
    const user = userEvent.setup();
    const plugins = [
      buildPluginInfo({ id: "code-1", displayName: "Code Plugin", isUserPlugin: false, isCodePlugin: true }),
    ];
    mockFetchPlugins.mockResolvedValue(buildPluginListData({ plugins }));
    mockReloadCodePlugins.mockResolvedValue({ loaded: 1, errors: [] });

    render(<PluginManager />);

    await waitFor(() => {
      expect(screen.getByText("plugin.reloadCodePlugins")).toBeInTheDocument();
    });

    await user.click(screen.getByText("plugin.reloadCodePlugins"));

    expect(mockReloadCodePlugins).toHaveBeenCalled();
    await waitFor(() => {
      expect(mockShowSuccess).toHaveBeenCalled();
    });
  });

  it("fetches and shows schema when schema button is clicked", async () => {
    const user = userEvent.setup();
    mockFetchPlugins.mockResolvedValue(buildPluginListData());
    mockFetchPluginSchema.mockResolvedValue({ type: "object", properties: {} });

    render(<PluginManager />);

    await waitFor(() => {
      expect(screen.getByTestId("plugin-list")).toBeInTheDocument();
    });

    const schemaButtons = screen.getAllByText("plugin.showSpec");
    await user.click(schemaButtons[0]!);

    expect(mockFetchPluginSchema).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByTestId("plugin-schema-viewer")).toBeInTheDocument();
    });
  });

  it("fetches and shows spec when spec button is clicked", async () => {
    const user = userEvent.setup();
    mockFetchPlugins.mockResolvedValue(buildPluginListData());
    mockFetchPluginSpecification.mockResolvedValue("# Plugin Specification");

    render(<PluginManager />);

    await waitFor(() => {
      expect(screen.getByTestId("plugin-list")).toBeInTheDocument();
    });

    const specButtons = screen.getAllByText("plugin.showDoc");
    await user.click(specButtons[0]!);

    expect(mockFetchPluginSpecification).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByTestId("plugin-spec-viewer")).toBeInTheDocument();
    });
  });

  it("shows error toast when schema fetch fails", async () => {
    const user = userEvent.setup();
    mockFetchPlugins.mockResolvedValue(buildPluginListData());
    mockFetchPluginSchema.mockRejectedValue(new Error("Schema fetch failed"));

    render(<PluginManager />);

    await waitFor(() => {
      expect(screen.getByTestId("plugin-list")).toBeInTheDocument();
    });

    const schemaButtons = screen.getAllByText("plugin.showSpec");
    await user.click(schemaButtons[0]!);

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalled();
    });
  });

  it("categorizes plugins into built-in, declarative, and code", async () => {
    const plugins = [
      buildPluginInfo({ id: "b1", displayName: "Built-in 1", isUserPlugin: false, isCodePlugin: false }),
      buildPluginInfo({ id: "b2", displayName: "Built-in 2", isUserPlugin: false, isCodePlugin: false }),
      buildPluginInfo({ id: "d1", displayName: "Declarative 1", isUserPlugin: true, isCodePlugin: false }),
      buildPluginInfo({ id: "c1", displayName: "Code 1", isUserPlugin: false, isCodePlugin: true }),
      buildPluginInfo({ id: "c2", displayName: "Code 2", isUserPlugin: false, isCodePlugin: true }),
    ];
    mockFetchPlugins.mockResolvedValue(buildPluginListData({ plugins }));

    render(<PluginManager />);

    await waitFor(() => {
      expect(screen.getByTestId("plugin-list")).toBeInTheDocument();
    });

    expect(screen.getByTestId("builtin-count")).toHaveTextContent("2");
    expect(screen.getByTestId("declarative-count")).toHaveTextContent("1");
    expect(screen.getByTestId("code-count")).toHaveTextContent("2");
  });
});
