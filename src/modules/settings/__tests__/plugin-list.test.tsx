import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/shared/constants", () => ({
  t: (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`;
    return key;
  },
}));

vi.mock("../PluginDetail", () => ({
  PluginDetail: ({ plugin }: { plugin: { id: string } }) => (
    <div data-testid={`plugin-detail-${plugin.id}`}>Detail for {plugin.id}</div>
  ),
}));

vi.mock("lucide-react", () => ({
  Trash2: () => <span data-testid="trash-icon">Trash</span>,
  ChevronDown: ({ className }: { className?: string }) => <span data-testid="chevron-icon" className={className}>Chevron</span>,
  Puzzle: () => <span data-testid="puzzle-icon">Puzzle</span>,
  Code: () => <span data-testid="code-icon">Code</span>,
}));

import { PluginList } from "../PluginList";

function buildPluginInfo(overrides: Partial<{
  id: string;
  displayName: string;
  isUserPlugin: boolean;
  isCodePlugin: boolean;
  capabilities: { video: boolean; image: boolean; text: boolean; vision: boolean };
  videoCapabilities: { supportsLastFrame: boolean; supportsReferenceVideo: boolean; supportsMimicryLevel: boolean; defaultModel: string; maxDuration: number };
  imageCapabilities: { supportsReferenceImage: boolean; defaultModel: string };
}> = {}) {
  return {
    id: "plugin-1",
    displayName: "Test Plugin",
    isUserPlugin: false,
    isCodePlugin: false,
    capabilities: { video: true, image: true, text: false, vision: false },
    videoCapabilities: { supportsLastFrame: false, supportsReferenceVideo: false, supportsMimicryLevel: false, defaultModel: "model-1", maxDuration: 10 },
    imageCapabilities: { supportsReferenceImage: false, defaultModel: "img-model" },
    ...overrides,
  };
}

function buildUserPluginFile(overrides: Partial<{
  id: string; fileName: string; filePath: string; displayName: string; version: string; valid: boolean; errors: string[];
}> = {}) {
  return {
    id: "plugin-1",
    fileName: "test.plugin.json",
    filePath: "/test/test.plugin.json",
    displayName: "Test Plugin",
    version: "1.0.0",
    valid: true,
    errors: [],
    ...overrides,
  };
}

function buildProps(overrides: Partial<{
  builtInPlugins: ReturnType<typeof buildPluginInfo>[];
  declarativePlugins: ReturnType<typeof buildPluginInfo>[];
  codePlugins: ReturnType<typeof buildPluginInfo>[];
  userPluginFiles: ReturnType<typeof buildUserPluginFile>[];
  expandedPlugin: string | null;
  onToggleExpand: (id: string | null) => void;
  onDelete: (id: string, name: string) => void;
}> = {}) {
  return {
    builtInPlugins: [],
    declarativePlugins: [],
    codePlugins: [],
    userPluginFiles: [],
    expandedPlugin: null,
    onToggleExpand: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
}

describe("PluginList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders built-in plugins with correct badge", () => {
    const builtInPlugins = [
      buildPluginInfo({ id: "b1", displayName: "Built-in Plugin", isUserPlugin: false, isCodePlugin: false }),
    ];
    render(<PluginList {...buildProps({ builtInPlugins })} />);

    expect(screen.getByText("Built-in Plugin")).toBeInTheDocument();
    expect(screen.getByText("plugin.builtin")).toBeInTheDocument();
  });

  it("renders declarative plugins with correct badge", () => {
    const declarativePlugins = [
      buildPluginInfo({ id: "d1", displayName: "Declarative Plugin", isUserPlugin: true, isCodePlugin: false }),
    ];
    render(<PluginList {...buildProps({ declarativePlugins })} />);

    expect(screen.getByText("Declarative Plugin")).toBeInTheDocument();
    expect(screen.getByText("plugin.declarative")).toBeInTheDocument();
  });

  it("renders code plugins with correct badge", () => {
    const codePlugins = [
      buildPluginInfo({ id: "c1", displayName: "Code Plugin", isUserPlugin: false, isCodePlugin: true }),
    ];
    render(<PluginList {...buildProps({ codePlugins })} />);

    expect(screen.getByText("Code Plugin")).toBeInTheDocument();
    expect(screen.getByText("plugin.codePlugin")).toBeInTheDocument();
  });

  it("shows no plugins message when all lists are empty", () => {
    render(<PluginList {...buildProps()} />);

    expect(screen.getByText("plugin.noPlugins")).toBeInTheDocument();
  });

  it("does not show no plugins message when plugins exist", () => {
    const builtInPlugins = [buildPluginInfo({ id: "b1" })];
    render(<PluginList {...buildProps({ builtInPlugins })} />);

    expect(screen.queryByText("plugin.noPlugins")).not.toBeInTheDocument();
  });

  it("shows default model badge for built-in plugins with video model", () => {
    const builtInPlugins = [
      buildPluginInfo({ id: "b1", displayName: "Plugin With Model", videoCapabilities: { supportsLastFrame: false, supportsReferenceVideo: false, supportsMimicryLevel: false, defaultModel: "kling-1.0", maxDuration: 10 } }),
    ];
    render(<PluginList {...buildProps({ builtInPlugins })} />);

    expect(screen.getByText("kling-1.0")).toBeInTheDocument();
  });

  it("shows version for declarative plugins with matching userPluginFile", () => {
    const declarativePlugins = [
      buildPluginInfo({ id: "d1", displayName: "Declarative Plugin", isUserPlugin: true, isCodePlugin: false }),
    ];
    const userPluginFiles = [
      buildUserPluginFile({ id: "d1", version: "2.0.0" }),
    ];
    render(<PluginList {...buildProps({ declarativePlugins, userPluginFiles })} />);

    expect(screen.getByText("v2.0.0")).toBeInTheDocument();
  });

  it("calls onDelete when delete button is clicked on declarative plugin", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const declarativePlugins = [
      buildPluginInfo({ id: "d1", displayName: "My Plugin", isUserPlugin: true, isCodePlugin: false }),
    ];
    render(<PluginList {...buildProps({ declarativePlugins, onDelete })} />);

    const deleteButton = screen.getByTestId("trash-icon").closest("button");
    expect(deleteButton).toBeInTheDocument();
    await user.click(deleteButton!);

    expect(onDelete).toHaveBeenCalledWith("d1", "My Plugin");
  });

  it("calls onDelete with stopPropagation on declarative plugin delete button", async () => {
    const user = userEvent.setup();
    const onToggleExpand = vi.fn();
    const onDelete = vi.fn();
    const declarativePlugins = [
      buildPluginInfo({ id: "d1", displayName: "My Plugin", isUserPlugin: true, isCodePlugin: false }),
    ];
    render(<PluginList {...buildProps({ declarativePlugins, onDelete, onToggleExpand })} />);

    const deleteButton = screen.getByTestId("trash-icon").closest("button");
    await user.click(deleteButton!);

    expect(onDelete).toHaveBeenCalledWith("d1", "My Plugin");
    expect(onToggleExpand).not.toHaveBeenCalled();
  });

  it("calls onDelete when delete button is clicked on code plugin", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const codePlugins = [
      buildPluginInfo({ id: "c1", displayName: "Code Plugin", isUserPlugin: false, isCodePlugin: true }),
    ];
    render(<PluginList {...buildProps({ codePlugins, onDelete })} />);

    const deleteButtons = screen.getAllByTestId("trash-icon");
    await user.click(deleteButtons[0]!.closest("button")!);

    expect(onDelete).toHaveBeenCalledWith("c1", "Code Plugin");
  });

  it("expands detail when declarative plugin row is clicked", async () => {
    const user = userEvent.setup();
    const onToggleExpand = vi.fn();
    const declarativePlugins = [
      buildPluginInfo({ id: "d1", displayName: "My Plugin", isUserPlugin: true, isCodePlugin: false }),
    ];
    render(<PluginList {...buildProps({ declarativePlugins, onToggleExpand })} />);

    await user.click(screen.getByText("My Plugin"));

    expect(onToggleExpand).toHaveBeenCalledWith("d1");
  });

  it("collapses detail when expanded plugin row is clicked again", async () => {
    const user = userEvent.setup();
    const onToggleExpand = vi.fn();
    const declarativePlugins = [
      buildPluginInfo({ id: "d1", displayName: "My Plugin", isUserPlugin: true, isCodePlugin: false }),
    ];
    render(<PluginList {...buildProps({ declarativePlugins, onToggleExpand, expandedPlugin: "d1" })} />);

    await user.click(screen.getByText("My Plugin"));

    expect(onToggleExpand).toHaveBeenCalledWith(null);
  });

  it("shows PluginDetail when declarative plugin is expanded", () => {
    const declarativePlugins = [
      buildPluginInfo({ id: "d1", displayName: "My Plugin", isUserPlugin: true, isCodePlugin: false }),
    ];
    render(<PluginList {...buildProps({ declarativePlugins, expandedPlugin: "d1" })} />);

    expect(screen.getByTestId("plugin-detail-d1")).toBeInTheDocument();
  });

  it("shows PluginDetail when code plugin is expanded", () => {
    const codePlugins = [
      buildPluginInfo({ id: "c1", displayName: "Code Plugin", isUserPlugin: false, isCodePlugin: true }),
    ];
    render(<PluginList {...buildProps({ codePlugins, expandedPlugin: "c1" })} />);

    expect(screen.getByTestId("plugin-detail-c1")).toBeInTheDocument();
  });

  it("does not show PluginDetail when plugin is not expanded", () => {
    const declarativePlugins = [
      buildPluginInfo({ id: "d1", displayName: "My Plugin", isUserPlugin: true, isCodePlugin: false }),
    ];
    render(<PluginList {...buildProps({ declarativePlugins, expandedPlugin: null })} />);

    expect(screen.queryByTestId("plugin-detail-d1")).not.toBeInTheDocument();
  });

  it("renders section headers with correct counts", () => {
    const builtInPlugins = [
      buildPluginInfo({ id: "b1", displayName: "B1" }),
      buildPluginInfo({ id: "b2", displayName: "B2" }),
    ];
    const declarativePlugins = [
      buildPluginInfo({ id: "d1", displayName: "D1", isUserPlugin: true }),
    ];
    const codePlugins = [
      buildPluginInfo({ id: "c1", displayName: "C1", isCodePlugin: true }),
      buildPluginInfo({ id: "c2", displayName: "C2", isCodePlugin: true }),
      buildPluginInfo({ id: "c3", displayName: "C3", isCodePlugin: true }),
    ];
    render(<PluginList {...buildProps({ builtInPlugins, declarativePlugins, codePlugins })} />);

    expect(screen.getByText(/plugin\.builtinPlugins/)).toBeInTheDocument();
    expect(screen.getByText(/plugin\.declarativePlugins/)).toBeInTheDocument();
    expect(screen.getByText(/plugin\.codePlugins/)).toBeInTheDocument();
  });

  it("does not render section for empty plugin groups", () => {
    const builtInPlugins = [buildPluginInfo({ id: "b1" })];
    render(<PluginList {...buildProps({ builtInPlugins })} />);

    expect(screen.queryByText(/plugin.declarativePlugins/)).not.toBeInTheDocument();
    expect(screen.queryByText(/plugin.codePlugins/)).not.toBeInTheDocument();
  });
});
