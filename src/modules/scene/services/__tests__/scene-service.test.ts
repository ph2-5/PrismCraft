import { describe, it, expect, vi, beforeEach } from "vitest";
import { expectOk, expectErr } from "@/__tests__/utils/result-helpers";
import { NotFoundError, ValidationError } from "@/domain/types";
import { DomainEvents } from "@/shared/event-types";
import type { Scene } from "@/domain/schemas";

vi.mock("@/infrastructure/di", () => ({
  container: {
    sceneStorage: {
      getScenes: vi.fn(),
      getSceneById: vi.fn(),
      createScene: vi.fn(),
      updateScene: vi.fn(),
      deleteScene: vi.fn(),
    },
    eventBus: { emit: vi.fn() },
  },
}));

const mockScene: Scene = {
  id: "scene-1",
  name: "测试场景",
  description: "测试描述",
  type: "室内",
  timeOfDay: "白天",
  weather: "晴天",
  mood: "轻松",
  lighting: "自然光",
  elements: [],
  colors: [],
  prompt: "测试提示词",
};

const validCreateInput = {
  name: "测试场景",
  description: "测试描述",
  type: "室内",
  timeOfDay: "白天",
  weather: "晴天",
  mood: "轻松",
  lighting: "自然光",
  elements: [] as string[],
  colors: [] as string[],
  prompt: "测试提示词",
};

describe("sceneService", () => {
  let sceneService: typeof import("../index").sceneService;
  let container: typeof import("@/infrastructure/di").container;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("../index");
    sceneService = mod.sceneService;
    const di = await import("@/infrastructure/di");
    container = di.container;
  });

  describe("create 合法输入", () => {
    it("返回 ok 并发布 SCENE_CREATED 事件", async () => {
      (container.sceneStorage.createScene as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const result = await sceneService.create(validCreateInput);

      expectOk(result);
      expect(result.value.name).toBe("测试场景");
      expect(result.value.id).toBeDefined();
      expect(container.eventBus.emit).toHaveBeenCalledWith(
        DomainEvents.SCENE_CREATED,
        expect.objectContaining({ id: result.value.id, sceneName: "测试场景" }),
      );
    });
  });

  describe("create 非法输入", () => {
    it("缺少 name 字段时返回 err(ValidationError)", async () => {
      const result = await sceneService.create({} as unknown as Parameters<typeof sceneService.create>[0]);

      expectErr(result);
      expect(result.error).toBeInstanceOf(ValidationError);
    });
  });

  describe("getById 存在", () => {
    it("返回 ok(Scene)", async () => {
      (container.sceneStorage.getSceneById as ReturnType<typeof vi.fn>).mockResolvedValue(mockScene);

      const result = await sceneService.getById("scene-1");

      expectOk(result);
      expect(result.value).toEqual(mockScene);
    });
  });

  describe("getById 不存在", () => {
    it("返回 err(NotFoundError)", async () => {
      (container.sceneStorage.getSceneById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await sceneService.getById("nonexistent");

      expectErr(result);
      expect(result.error).toBeInstanceOf(NotFoundError);
    });
  });

  describe("update 不存在", () => {
    it("返回 err(NotFoundError)", async () => {
      (container.sceneStorage.getSceneById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await sceneService.update("nonexistent", { id: "nonexistent", name: "新名称" });

      expectErr(result);
      expect(result.error).toBeInstanceOf(NotFoundError);
    });
  });

  describe("update 成功", () => {
    it("发布 SCENE_UPDATED 事件", async () => {
      (container.sceneStorage.getSceneById as ReturnType<typeof vi.fn>).mockResolvedValue(mockScene);
      (container.sceneStorage.updateScene as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const result = await sceneService.update("scene-1", { id: "scene-1", name: "更新场景" });

      expectOk(result);
      expect(container.eventBus.emit).toHaveBeenCalledWith(
        DomainEvents.SCENE_UPDATED,
        expect.objectContaining({ id: "scene-1", sceneName: "测试场景" }),
      );
    });
  });

  describe("delete 不存在", () => {
    it("返回 err(NotFoundError)", async () => {
      (container.sceneStorage.getSceneById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await sceneService.delete("nonexistent");

      expectErr(result);
      expect(result.error).toBeInstanceOf(NotFoundError);
    });
  });

  describe("delete 成功", () => {
    it("发布 SCENE_DELETED 事件", async () => {
      (container.sceneStorage.getSceneById as ReturnType<typeof vi.fn>).mockResolvedValue(mockScene);
      (container.sceneStorage.deleteScene as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const result = await sceneService.delete("scene-1");

      expectOk(result);
      expect(container.eventBus.emit).toHaveBeenCalledWith(
        DomainEvents.SCENE_DELETED,
        expect.objectContaining({ id: "scene-1", sceneName: "测试场景" }),
      );
    });
  });

  describe("存储层异常", () => {
    it("fromAsyncThrowable 包装后返回 err", async () => {
      (container.sceneStorage.getScenes as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("存储故障"));

      const result = await sceneService.getAll();

      expectErr(result);
    });
  });

  describe("count", () => {
    it("返回场景数量", async () => {
      (container.sceneStorage.getScenes as ReturnType<typeof vi.fn>).mockResolvedValue([mockScene, mockScene, mockScene]);

      const result = await sceneService.count();

      expectOk(result);
      expect(result.value).toBe(3);
    });
  });
});
