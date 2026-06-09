import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Scene, Story } from "@/domain/schemas";
import type { Result } from "@/domain/types";
import { ok, err, AppError } from "@/domain/types";
import type { DeleteCheckResult } from "@/domain/services";

const { mockSceneService, mockCheckSceneReferences, mockInvalidateQueries, mockErrorLogger } = vi.hoisted(() => ({
  mockSceneService: {
    create: vi.fn<(entity: Scene) => Promise<Result<Scene>>>(),
    update: vi.fn<(id: string, entity: Scene) => Promise<Result<void>>>(),
    delete: vi.fn<(id: string) => Promise<Result<void>>>(),
  },
  mockCheckSceneReferences: vi.fn<(id: string, name: string, stories: Story[]) => DeleteCheckResult>(),
  mockInvalidateQueries: vi.fn(),
  mockErrorLogger: { error: vi.fn(), warn: vi.fn() },
}));

let confirmResult = false;

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

vi.mock("@/modules/scene/services", () => ({
  sceneService: mockSceneService,
}));

vi.mock("@/domain/services", () => ({
  checkSceneReferences: mockCheckSceneReferences,
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: mockErrorLogger,
}));

vi.mock("@/shared/utils/confirm", () => ({
  confirm: vi.fn(() => Promise.resolve(confirmResult)),
}));

vi.mock("@/shared/constants/messages", () => ({
  t: vi.fn((key: string) => key),
}));

vi.mock("@/shared/utils/user-facing-error", () => ({
  mapUserFacingError: vi.fn((err: unknown) => err instanceof Error ? err.message : String(err)),
}));

vi.mock("../constants", () => ({
  defaultScene: {
    id: "",
    name: "",
    description: "",
    type: "",
    timeOfDay: "",
    weather: "",
    mood: "",
    lighting: "",
    elements: [],
    colors: [],
    camera: { angle: "", distance: "", movement: "" },
    prompt: "",
    tags: [],
    useCount: 0,
  },
}));

import { useSceneCRUD } from "../use-scene-crud";

const defaultScene: Scene = {
  id: "",
  name: "",
  description: "",
  type: "",
  timeOfDay: "",
  weather: "",
  mood: "",
  lighting: "",
  elements: [],
  colors: [],
  camera: { angle: "", distance: "", movement: "" },
  prompt: "",
  tags: [],
  useCount: 0,
};

function buildProps(overrides: Record<string, unknown> = {}) {
  const scene: Scene = {
    ...defaultScene,
    id: "",
    name: "测试场景",
    description: "描述",
    type: "室内",
    prompt: "测试提示词",
  };

  return {
    currentScene: scene,
    setCurrentScene: vi.fn<(update: Scene | ((prev: Scene) => Scene), shouldMarkDirty?: boolean) => void>(),
    generatedImage: null as string | null,
    setCustomElement: vi.fn<React.Dispatch<React.SetStateAction<string>>>(),
    setCustomColor: vi.fn<React.Dispatch<React.SetStateAction<string>>>(),
    setGeneratedImage: vi.fn<React.Dispatch<React.SetStateAction<string | null>>>(),
    addAssetToLibrary: vi.fn(),
    generatePrompt: vi.fn<(scene: Scene) => string>(() => "generated prompt"),
    success: vi.fn<(title: string, description?: string) => void>(),
    showError: vi.fn<(title: string, description?: string) => void>(),
    stories: [] as Story[],
    markDirty: vi.fn<(key: string) => void>(),
    markClean: vi.fn<(key: string) => void>(),
    onUpdateStoriesAfterDelete: vi.fn<(sceneId: string, stories: Story[]) => Promise<void>>(),
    ...overrides,
  };
}

type UseSceneCRUDProps = Parameters<typeof useSceneCRUD>[0];

describe("useSceneCRUD", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    confirmResult = false;
    mockSceneService.create.mockResolvedValue(ok({ ...defaultScene, id: "scene_new", name: "测试场景", prompt: "测试提示词" }));
    mockSceneService.update.mockResolvedValue(ok(undefined));
    mockSceneService.delete.mockResolvedValue(ok(undefined));
    mockCheckSceneReferences.mockReturnValue({ canDelete: true, references: [] });
  });

  describe("handleSave — createScene", () => {
    it("新建场景成功时应调用 sceneService.create 并 invalidate queries", async () => {
      const props = buildProps();
      const { result } = renderHook(() => useSceneCRUD(props as UseSceneCRUDProps));

      await act(async () => {
        await result.current.handleSave();
      });

      expect(mockSceneService.create).toHaveBeenCalled();
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["scenes"] });
      expect(props.markClean).toHaveBeenCalledWith("scenes");
      expect(props.success).toHaveBeenCalled();
    });

    it("新建场景有图片时应添加到资产库", async () => {
      const props = buildProps({ generatedImage: "https://example.com/scene.png" });
      const { result } = renderHook(() => useSceneCRUD(props as UseSceneCRUDProps));

      await act(async () => {
        await result.current.handleSave();
      });

      expect(props.addAssetToLibrary).toHaveBeenCalledWith(
        "https://example.com/scene.png",
        "image",
        "测试场景",
        expect.objectContaining({ type: "scene" }),
      );
    });

    it("名称为空时应显示验证错误且不调用 service", async () => {
      const props = buildProps({ currentScene: { ...defaultScene, id: "", name: "", prompt: "" } });
      const { result } = renderHook(() => useSceneCRUD(props as UseSceneCRUDProps));

      await act(async () => {
        await result.current.handleSave();
      });

      expect(props.showError).toHaveBeenCalled();
      expect(mockSceneService.create).not.toHaveBeenCalled();
    });
  });

  describe("handleSave — updateScene", () => {
    it("更新场景成功时应调用 sceneService.update 并 invalidate queries", async () => {
      const props = buildProps({
        currentScene: { ...defaultScene, id: "scene-1", name: "已有场景", prompt: "prompt" },
      });
      const { result } = renderHook(() => useSceneCRUD(props as UseSceneCRUDProps));

      await act(async () => {
        await result.current.handleSave();
      });

      expect(mockSceneService.update).toHaveBeenCalledWith("scene-1", expect.anything());
      expect(mockSceneService.create).not.toHaveBeenCalled();
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["scenes"] });
      expect(props.markClean).toHaveBeenCalledWith("scenes");
      expect(props.success).toHaveBeenCalled();
    });

    it("更新失败时应显示错误并标记脏状态", async () => {
      mockSceneService.update.mockResolvedValueOnce(err(new AppError("DATABASE_ERROR", "数据库错误")));
      const props = buildProps({
        currentScene: { ...defaultScene, id: "scene-1", name: "已有场景", prompt: "prompt" },
      });
      const { result } = renderHook(() => useSceneCRUD(props as UseSceneCRUDProps));

      await act(async () => {
        await result.current.handleSave();
      });

      expect(props.showError).toHaveBeenCalled();
      expect(props.markDirty).toHaveBeenCalledWith("scenes");
      expect(result.current.saveStatus).toBe("error");
    });
  });

  describe("performDelete — deleteScene", () => {
    it("删除场景成功时应调用 service.delete 并 invalidate queries", async () => {
      const props = buildProps({
        currentScene: { ...defaultScene, id: "scene-1", name: "待删除场景", prompt: "prompt" },
      });
      const { result } = renderHook(() => useSceneCRUD(props as UseSceneCRUDProps));

      await act(async () => {
        await result.current.performDelete("scene-1");
      });

      expect(mockSceneService.delete).toHaveBeenCalledWith("scene-1");
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["scenes"] });
      expect(props.onUpdateStoriesAfterDelete).toHaveBeenCalledWith("scene-1", []);
      expect(props.success).toHaveBeenCalled();
      expect(result.current.isDeleting).toBe(false);
    });

    it("删除当前编辑的场景时应重置为默认值", async () => {
      const props = buildProps({
        currentScene: { ...defaultScene, id: "scene-1", name: "待删除场景", prompt: "prompt" },
      });
      const { result } = renderHook(() => useSceneCRUD(props as UseSceneCRUDProps));

      await act(async () => {
        await result.current.performDelete("scene-1");
      });

      expect(props.setCurrentScene).toHaveBeenCalled();
    });

    it("删除非当前场景时不应重置 currentScene", async () => {
      const props = buildProps({
        currentScene: { ...defaultScene, id: "scene-2", name: "其他场景", prompt: "prompt" },
      });
      const { result } = renderHook(() => useSceneCRUD(props as UseSceneCRUDProps));

      await act(async () => {
        await result.current.performDelete("scene-1");
      });

      expect(mockSceneService.delete).toHaveBeenCalledWith("scene-1");
      expect(props.setCurrentScene).not.toHaveBeenCalled();
    });

    it("删除失败时应显示错误", async () => {
      mockSceneService.delete.mockResolvedValueOnce(err(new AppError("DATABASE_ERROR", "删除失败")));
      const props = buildProps({
        currentScene: { ...defaultScene, id: "scene-1", name: "待删除场景", prompt: "prompt" },
      });
      const { result } = renderHook(() => useSceneCRUD(props as UseSceneCRUDProps));

      await act(async () => {
        await result.current.performDelete("scene-1");
      });

      expect(props.showError).toHaveBeenCalled();
      expect(result.current.isDeleting).toBe(false);
    });
  });

  describe("handleDelete — 引用检查", () => {
    it("有引用时应打开删除确认对话框而不执行删除", async () => {
      mockCheckSceneReferences.mockReturnValue({
        canDelete: false,
        references: [{ elementId: "scene-1", elementType: "scene", elementName: "场景A", usedInBeats: ["beat-1"], usedInStories: ["故事1"] }],
      });
      const props = buildProps({
        currentScene: { ...defaultScene, id: "scene-1", name: "场景A", prompt: "prompt" },
      });
      const { result } = renderHook(() => useSceneCRUD(props as UseSceneCRUDProps));

      await act(async () => {
        await result.current.handleDelete("scene-1");
      });

      expect(result.current.deleteDialogOpen).toBe(true);
      expect(result.current.sceneToDelete).toBe("scene-1");
      expect(mockSceneService.delete).not.toHaveBeenCalled();
    });

    it("无引用且用户确认时应执行删除", async () => {
      confirmResult = true;
      const props = buildProps({
        currentScene: { ...defaultScene, id: "scene-1", name: "场景A", prompt: "prompt" },
      });
      const { result } = renderHook(() => useSceneCRUD(props as UseSceneCRUDProps));

      await act(async () => {
        await result.current.handleDelete("scene-1");
      });

      expect(mockSceneService.delete).toHaveBeenCalledWith("scene-1");
    });

    it("无引用且用户取消时不应执行删除", async () => {
      confirmResult = false;
      const props = buildProps({
        currentScene: { ...defaultScene, id: "scene-1", name: "场景A", prompt: "prompt" },
      });
      const { result } = renderHook(() => useSceneCRUD(props as UseSceneCRUDProps));

      await act(async () => {
        await result.current.handleDelete("scene-1");
      });

      expect(mockSceneService.delete).not.toHaveBeenCalled();
    });
  });

  describe("addItem / removeItem", () => {
    it("addItem 应向 elements 添加新元素", () => {
      const props = buildProps({
        currentScene: { ...defaultScene, id: "scene-1", name: "场景", prompt: "p", elements: ["建筑"] },
      });
      const { result } = renderHook(() => useSceneCRUD(props as UseSceneCRUDProps));

      act(() => {
        result.current.addItem("elements", "水体");
      });

      expect(props.setCurrentScene).toHaveBeenCalledWith(
        expect.any(Function),
        true,
      );
      const updater = props.setCurrentScene.mock.calls[0]![0] as (prev: Scene) => Scene;
      const updated = updater({ ...defaultScene, id: "scene-1", name: "场景", prompt: "p", elements: ["建筑"] });
      expect(updated.elements).toEqual(["建筑", "水体"]);
      expect(props.setCustomElement).toHaveBeenCalledWith("");
    });

    it("addItem 不应添加重复元素", () => {
      const props = buildProps({
        currentScene: { ...defaultScene, id: "scene-1", name: "场景", prompt: "p", elements: ["建筑"] },
      });
      const { result } = renderHook(() => useSceneCRUD(props as UseSceneCRUDProps));

      act(() => {
        result.current.addItem("elements", "建筑");
      });

      expect(props.setCurrentScene).not.toHaveBeenCalled();
    });

    it("addItem 不应添加空值", () => {
      const props = buildProps({
        currentScene: { ...defaultScene, id: "scene-1", name: "场景", prompt: "p", elements: [] },
      });
      const { result } = renderHook(() => useSceneCRUD(props as UseSceneCRUDProps));

      act(() => {
        result.current.addItem("elements", "");
      });

      expect(props.setCurrentScene).not.toHaveBeenCalled();
    });

    it("addItem 向 colors 添加时应清空 customColor", () => {
      const props = buildProps({
        currentScene: { ...defaultScene, id: "scene-1", name: "场景", prompt: "p", colors: [] },
      });
      const { result } = renderHook(() => useSceneCRUD(props as UseSceneCRUDProps));

      act(() => {
        result.current.addItem("colors", "暖色调");
      });

      expect(props.setCustomColor).toHaveBeenCalledWith("");
    });

    it("removeItem 应从列表中移除指定元素", () => {
      const props = buildProps({
        currentScene: { ...defaultScene, id: "scene-1", name: "场景", prompt: "p", elements: ["建筑", "水体"] },
      });
      const { result } = renderHook(() => useSceneCRUD(props as UseSceneCRUDProps));

      act(() => {
        result.current.removeItem("elements", "建筑");
      });

      expect(props.setCurrentScene).toHaveBeenCalledWith(expect.any(Function), true);
      const updater = props.setCurrentScene.mock.calls[0]![0] as (prev: Scene) => Scene;
      const updated = updater({ ...defaultScene, id: "scene-1", name: "场景", prompt: "p", elements: ["建筑", "水体"] });
      expect(updated.elements).toEqual(["水体"]);
    });
  });

  describe("非 Electron 环境", () => {
    it("handleSave 在非 Electron 环境下仍可执行（useEntityCRUD 不依赖 isElectron）", async () => {
      const props = buildProps();
      const { result } = renderHook(() => useSceneCRUD(props as UseSceneCRUDProps));

      await act(async () => {
        await result.current.handleSave();
      });

      expect(mockSceneService.create).toHaveBeenCalled();
    });
  });
});
