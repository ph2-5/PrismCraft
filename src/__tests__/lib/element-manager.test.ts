import { describe, it, expect, vi, beforeEach } from "vitest";
import type { IElementManager } from "@/domain/ports/element-manager-port";

describe("ElementStorage 通知职责", () => {
  it("ElementStorage 的 notify 方法应为 public", async () => {
    const { ElementStorage } = await import("@/infrastructure/storage/elements");
    const storage = new ElementStorage();

    expect(typeof storage.notify).toBe("function");
  });

  it("ElementStorage 的写方法不应自动调用 notify", async () => {
    const { ElementStorage } = await import("@/infrastructure/storage/elements");
    const storage = new ElementStorage();
    const notifySpy = vi.spyOn(storage, "notify");

    try {
      await storage.createElement("effect", "Test");
    } catch {
      // DB call may fail in test env, that's OK
    }

    expect(notifySpy).not.toHaveBeenCalled();
  });
});

describe("ElementManager 通知机制", () => {
  let elementManager: IElementManager;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    vi.doMock("@/infrastructure/storage/elements", () => ({
      ElementStorage: vi.fn().mockImplementation(() => ({
        createElement: vi.fn().mockResolvedValue({ id: "EFFECT_001", type: "effect", name: "Test" }),
        bindAsset: vi.fn().mockResolvedValue(undefined),
        unbindAsset: vi.fn().mockResolvedValue(undefined),
        updateElement: vi.fn().mockResolvedValue({ id: "EFFECT_001", name: "Updated" }),
        deleteElement: vi.fn().mockResolvedValue(undefined),
        getElement: vi.fn().mockResolvedValue({ id: "EFFECT_001", type: "effect", name: "Test", bindings: [] }),
        getAllElements: vi.fn().mockResolvedValue([]),
        getElementsByType: vi.fn().mockResolvedValue([]),
        subscribe: vi.fn(() => () => {}),
        notify: vi.fn(),
      })),
      elementStorage: {
        createElement: vi.fn().mockResolvedValue({ id: "EFFECT_001", type: "effect", name: "Test" }),
        bindAsset: vi.fn().mockResolvedValue(undefined),
        unbindAsset: vi.fn().mockResolvedValue(undefined),
        updateElement: vi.fn().mockResolvedValue({ id: "EFFECT_001", name: "Updated" }),
        deleteElement: vi.fn().mockResolvedValue(undefined),
        getElement: vi.fn().mockResolvedValue({ id: "EFFECT_001", type: "effect", name: "Test", bindings: [] }),
        getAllElements: vi.fn().mockResolvedValue([]),
        getElementsByType: vi.fn().mockResolvedValue([]),
        subscribe: vi.fn(() => () => {}),
        notify: vi.fn(),
      },
    }));

    const mod = await import("@/modules/shot");
    elementManager = mod.elementManager;
  });

  it("应支持订阅通知", () => {
    const listener = vi.fn();
    const unsubscribe = elementManager.subscribe(listener);

    expect(typeof unsubscribe).toBe("function");
    unsubscribe();
  });

  it("订阅回调应在 notify 时被调用", () => {
    const listener = vi.fn();
    elementManager.subscribe(listener);

    (elementManager as any)["notify"]();

    expect(listener).toHaveBeenCalled();
  });

  it("取消订阅后不应再收到通知", () => {
    const listener = vi.fn();
    const unsubscribe = elementManager.subscribe(listener);

    unsubscribe();
    (elementManager as any)["notify"]();

    expect(listener).not.toHaveBeenCalled();
  });

  it("createElement 应触发 notify", async () => {
    const listener = vi.fn();
    elementManager.subscribe(listener);

    await elementManager.createElement("effect", "Test");

    expect(listener).toHaveBeenCalled();
  });

  it("deleteElement 应触发 notify", async () => {
    const listener = vi.fn();
    elementManager.subscribe(listener);

    await elementManager.deleteElement("EFFECT_001");

    expect(listener).toHaveBeenCalled();
  });

  it("updateElement 应触发 notify", async () => {
    const listener = vi.fn();
    elementManager.subscribe(listener);

    await elementManager.updateElement("EFFECT_001", { name: "Updated" });

    expect(listener).toHaveBeenCalled();
  });
});
