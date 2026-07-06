import { describe, it, expect, vi, beforeEach } from "vitest";
import type { StoryElement, AssetBinding, ElementLibrary } from "@/domain/schemas";

const { elementStorage, errorLoggerMock, extractErrorMessageMock } = vi.hoisted(() => {
  const elementStorage = {
    getLibrary: vi.fn(),
    createElement: vi.fn(),
    getElement: vi.fn(),
    updateElement: vi.fn(),
    deleteElement: vi.fn(),
    getAllElements: vi.fn(),
    getElementsByType: vi.fn(),
  };
  const errorLoggerMock = {
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  const extractErrorMessageMock = vi.fn((e: unknown) => String(e));
  return { elementStorage, errorLoggerMock, extractErrorMessageMock };
});

vi.mock("@/infrastructure/di", () => ({
  container: { elementStorage },
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: errorLoggerMock,
  extractErrorMessage: extractErrorMessageMock,
}));

import { ElementManager } from "../element-manager";

function makeElement(overrides: Partial<StoryElement> = {}): StoryElement {
  return {
    id: "elm-1",
    type: "character",
    name: "主角",
    description: "男主角",
    bindings: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeAssetBinding(overrides: Partial<AssetBinding> = {}): AssetBinding {
  return {
    type: "image",
    url: "https://example.com/asset.png",
    name: "asset.png",
    uploadedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("element-manager (CRUD)", () => {
  let manager: ElementManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new ElementManager();
  });

  describe("createElement", () => {
    it("成功时调用 storage.createElement 并 notify 后返回 element", async () => {
      const created = makeElement({ id: "new-1", name: "新角色" });
      elementStorage.createElement.mockResolvedValue(created);
      const listener = vi.fn();
      manager.subscribe(listener);

      const result = await manager.createElement("character", "新角色", "描述");

      expect(elementStorage.createElement).toHaveBeenCalledWith("character", "新角色", "描述");
      expect(result).toBe(created);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("未传 description 时使用默认空字符串", async () => {
      const created = makeElement();
      elementStorage.createElement.mockResolvedValue(created);

      await manager.createElement("prop", "道具");

      expect(elementStorage.createElement).toHaveBeenCalledWith("prop", "道具", "");
    });

    it("storage 抛错时调用 errorLogger.warn 并 rethrow", async () => {
      const error = new Error("DB write failed");
      elementStorage.createElement.mockRejectedValue(error);

      await expect(manager.createElement("character", "x")).rejects.toThrow("DB write failed");

      expect(errorLoggerMock.warn).toHaveBeenCalledWith(
        "[ElementManager] 创建元素失败:",
        expect.any(String),
      );
      expect(extractErrorMessageMock).toHaveBeenCalledWith(error);
    });

    it("storage 抛错时不触发 notify", async () => {
      const error = new Error("DB write failed");
      elementStorage.createElement.mockRejectedValue(error);
      const listener = vi.fn();
      manager.subscribe(listener);

      await expect(manager.createElement("character", "x")).rejects.toThrow();

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("bindAsset", () => {
    it("element 不存在时抛错 'Element xxx not found'", async () => {
      elementStorage.getElement.mockResolvedValue(undefined);

      await expect(
        manager.bindAsset("missing-id", makeAssetBinding()),
      ).rejects.toThrow("Element missing-id not found");

      expect(elementStorage.updateElement).not.toHaveBeenCalled();
      expect(errorLoggerMock.warn).toHaveBeenCalledWith(
        "[ElementManager] 绑定资源失败:",
        "Element missing-id not found",
      );
    });

    it("成功时追加 asset 到 bindings 数组并 notify", async () => {
      const existing = makeElement({ id: "elm-1", bindings: [makeAssetBinding({ url: "u1" })] });
      const newAsset = makeAssetBinding({ url: "u2" });
      const updated = makeElement({
        id: "elm-1",
        bindings: [makeAssetBinding({ url: "u1" }), newAsset],
      });
      elementStorage.getElement.mockResolvedValue(existing);
      elementStorage.updateElement.mockResolvedValue(updated);
      const listener = vi.fn();
      manager.subscribe(listener);

      const result = await manager.bindAsset("elm-1", newAsset);

      expect(elementStorage.updateElement).toHaveBeenCalledWith("elm-1", {
        bindings: [makeAssetBinding({ url: "u1" }), newAsset],
      });
      expect(result).toBe(updated);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("原有 bindings 为空时直接以新 asset 作为单元素数组", async () => {
      const existing = makeElement({ id: "elm-1", bindings: [] });
      const newAsset = makeAssetBinding({ url: "u" });
      elementStorage.getElement.mockResolvedValue(existing);
      elementStorage.updateElement.mockResolvedValue(makeElement());

      await manager.bindAsset("elm-1", newAsset);

      expect(elementStorage.updateElement).toHaveBeenCalledWith("elm-1", {
        bindings: [newAsset],
      });
    });
  });

  describe("unbindAsset", () => {
    it("element 不存在时抛错", async () => {
      elementStorage.getElement.mockResolvedValue(undefined);

      await expect(manager.unbindAsset("missing-id", "u")).rejects.toThrow(
        "Element missing-id not found",
      );

      expect(elementStorage.updateElement).not.toHaveBeenCalled();
      expect(errorLoggerMock.warn).toHaveBeenCalledWith(
        "[ElementManager] 解绑资源失败:",
        expect.any(String),
      );
    });

    it("成功时从 bindings 过滤掉匹配 url 的项并 notify", async () => {
      const existing = makeElement({
        id: "elm-1",
        bindings: [
          makeAssetBinding({ url: "u1" }),
          makeAssetBinding({ url: "u2" }),
          makeAssetBinding({ url: "u3" }),
        ],
      });
      const updated = makeElement({
        id: "elm-1",
        bindings: [makeAssetBinding({ url: "u1" }), makeAssetBinding({ url: "u3" })],
      });
      elementStorage.getElement.mockResolvedValue(existing);
      elementStorage.updateElement.mockResolvedValue(updated);
      const listener = vi.fn();
      manager.subscribe(listener);

      const result = await manager.unbindAsset("elm-1", "u2");

      expect(elementStorage.updateElement).toHaveBeenCalledWith("elm-1", {
        bindings: [makeAssetBinding({ url: "u1" }), makeAssetBinding({ url: "u3" })],
      });
      expect(result).toBe(updated);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("url 不匹配时 bindings 数组保持原样（仅过滤）", async () => {
      const existing = makeElement({
        id: "elm-1",
        bindings: [makeAssetBinding({ url: "u1" }), makeAssetBinding({ url: "u2" })],
      });
      elementStorage.getElement.mockResolvedValue(existing);
      elementStorage.updateElement.mockResolvedValue(existing);

      await manager.unbindAsset("elm-1", "not-exist");

      expect(elementStorage.updateElement).toHaveBeenCalledWith("elm-1", {
        bindings: [makeAssetBinding({ url: "u1" }), makeAssetBinding({ url: "u2" })],
      });
    });
  });

  describe("getElement", () => {
    it("透传 storage.getElement", async () => {
      const elm = makeElement({ id: "elm-1" });
      elementStorage.getElement.mockResolvedValue(elm);

      const result = await manager.getElement("elm-1");

      expect(elementStorage.getElement).toHaveBeenCalledWith("elm-1");
      expect(result).toBe(elm);
    });

    it("storage 返回 undefined 时透传 undefined", async () => {
      elementStorage.getElement.mockResolvedValue(undefined);

      const result = await manager.getElement("missing");

      expect(result).toBeUndefined();
    });
  });

  describe("getAllElements", () => {
    it("透传 storage.getAllElements", async () => {
      const list = [makeElement({ id: "a" }), makeElement({ id: "b" })];
      elementStorage.getAllElements.mockResolvedValue(list);

      const result = await manager.getAllElements();

      expect(elementStorage.getAllElements).toHaveBeenCalledWith();
      expect(result).toBe(list);
    });
  });

  describe("getElementsByType", () => {
    it("透传 storage.getElementsByType 并保留 type 参数", async () => {
      const list = [makeElement({ id: "a", type: "prop" })];
      elementStorage.getElementsByType.mockResolvedValue(list);

      const result = await manager.getElementsByType("prop");

      expect(elementStorage.getElementsByType).toHaveBeenCalledWith("prop");
      expect(result).toBe(list);
    });
  });

  describe("deleteElement", () => {
    it("成功时调用 storage.deleteElement 并 notify", async () => {
      elementStorage.deleteElement.mockResolvedValue(undefined);
      const listener = vi.fn();
      manager.subscribe(listener);

      await manager.deleteElement("elm-1");

      expect(elementStorage.deleteElement).toHaveBeenCalledWith("elm-1");
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("失败时调用 errorLogger.warn 并 rethrow 且不 notify", async () => {
      const error = new Error("delete failed");
      elementStorage.deleteElement.mockRejectedValue(error);
      const listener = vi.fn();
      manager.subscribe(listener);

      await expect(manager.deleteElement("elm-1")).rejects.toThrow("delete failed");

      expect(errorLoggerMock.warn).toHaveBeenCalledWith(
        "[ElementManager] 删除元素失败:",
        "delete failed",
      );
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("updateElement", () => {
    it("成功时调用 storage.updateElement 并 notify 后返回 updated", async () => {
      const updated = makeElement({ id: "elm-1", name: "改名后" });
      elementStorage.updateElement.mockResolvedValue(updated);
      const listener = vi.fn();
      manager.subscribe(listener);

      const result = await manager.updateElement("elm-1", { name: "改名后" });

      expect(elementStorage.updateElement).toHaveBeenCalledWith("elm-1", { name: "改名后" });
      expect(result).toBe(updated);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("失败时调用 errorLogger.warn 并 rethrow 且不 notify", async () => {
      const error = new Error("update failed");
      elementStorage.updateElement.mockRejectedValue(error);
      const listener = vi.fn();
      manager.subscribe(listener);

      await expect(manager.updateElement("elm-1", { name: "x" })).rejects.toThrow("update failed");

      expect(errorLoggerMock.warn).toHaveBeenCalledWith(
        "[ElementManager] 更新元素失败:",
        expect.any(String),
      );
      expect(extractErrorMessageMock).toHaveBeenCalledWith(error);
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("getLibrary", () => {
    it("透传 storage.getLibrary", async () => {
      const library: ElementLibrary = {
        elements: [makeElement({ id: "a" })],
        nextCode: { character: 1, prop: 0, effect: 0, scene: 0 },
      };
      elementStorage.getLibrary.mockResolvedValue(library);

      const result = await manager.getLibrary();

      expect(elementStorage.getLibrary).toHaveBeenCalledWith();
      expect(result).toBe(library);
    });
  });

  describe("subscribe / notify 集成", () => {
    it("多个订阅者都能收到 notify", async () => {
      elementStorage.createElement.mockResolvedValue(makeElement());
      const l1 = vi.fn();
      const l2 = vi.fn();
      manager.subscribe(l1);
      manager.subscribe(l2);

      await manager.createElement("character", "x");

      expect(l1).toHaveBeenCalledTimes(1);
      expect(l2).toHaveBeenCalledTimes(1);
    });

    it("取消订阅后不再收到 notify", async () => {
      elementStorage.createElement.mockResolvedValue(makeElement());
      const l1 = vi.fn();
      const unsubscribe = manager.subscribe(l1);

      unsubscribe();
      await manager.createElement("character", "x");

      expect(l1).not.toHaveBeenCalled();
    });
  });
});
