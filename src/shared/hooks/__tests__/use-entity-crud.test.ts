import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const mockInvalidateQueries = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: { error: vi.fn(), warn: vi.fn() },
}));

let confirmResult = false;
vi.mock("@/shared/utils/confirm", () => ({
  confirm: vi.fn(() => Promise.resolve(confirmResult)),
}));

import { useEntityCRUD } from "../use-entity-crud";
import { ok, err } from "@/domain/types";

interface TestEntity {
  id: string;
  name: string;
  prompt: string;
}

function buildConfig(overrides: Record<string, unknown> = {}) {
  const entity: TestEntity = { id: "", name: "测试角色", prompt: "test prompt" };
  const defaultEntity: TestEntity = { id: "", name: "", prompt: "" };
  const mockCreate = vi.fn(() => Promise.resolve(ok({ ...entity, id: "new-id" })));
  const mockUpdate = vi.fn(() => Promise.resolve(ok(undefined)));
  const mockDelete = vi.fn(() => Promise.resolve(ok(undefined)));

  return {
    entity,
    setEntity: vi.fn(),
    generatedImage: null as string | null,
    setGeneratedImage: vi.fn(),
    resetCustomFields: vi.fn(),
    applyImageToEntity: vi.fn((e: TestEntity, url: string) => ({ ...e, imageUrl: url })),
    prepareEntityForSave: vi.fn((e: TestEntity) => e),
    service: { create: mockCreate, update: mockUpdate, delete: mockDelete },
    queryKey: ["characters"],
    entityLabel: "角色",
    entityIdPrefix: "char",
    nameValidationMessage: "名称不能为空",
    assetLabel: "角色图片",
    checkReferences: vi.fn(() => ({ references: [] })),
    defaultEntity,
    generatePrompt: vi.fn(() => "generated prompt"),
    addAssetToLibrary: vi.fn(),
    assetBindType: "character" as const,
    success: vi.fn(),
    showError: vi.fn(),
    stories: [],
    markDirty: vi.fn(),
    markClean: vi.fn(),
    onUpdateStoriesAfterDelete: vi.fn(),
    ...overrides,
  };
}

describe("useEntityCRUD", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    confirmResult = false;
  });

  describe("初始状态", () => {
    it("应返回正确的初始状态", () => {
      const config = buildConfig();
      const { result } = renderHook(() => useEntityCRUD(config));

      expect(result.current.deleteDialogOpen).toBe(false);
      expect(result.current.entityToDelete).toBe(null);
      expect(result.current.referenceCheck).toBe(null);
      expect(result.current.saveStatus).toBe("idle");
      expect(result.current.saveError).toBe("");
      expect(result.current.isDeleting).toBe(false);
    });
  });

  describe("handleSave", () => {
    it("名称为空时应显示验证错误", async () => {
      const config = buildConfig({ entity: { id: "", name: "", prompt: "" } });
      const { result } = renderHook(() => useEntityCRUD(config));

      await act(async () => {
        await result.current.handleSave();
      });

      expect(config.showError).toHaveBeenCalledWith("保存失败", "名称不能为空");
      expect(config.service.create).not.toHaveBeenCalled();
    });

    it("名称为纯空格时应显示验证错误", async () => {
      const config = buildConfig({ entity: { id: "", name: "   ", prompt: "" } });
      const { result } = renderHook(() => useEntityCRUD(config));

      await act(async () => {
        await result.current.handleSave();
      });

      expect(config.showError).toHaveBeenCalledWith("保存失败", "名称不能为空");
    });

    it("新建实体时应调用 service.create", async () => {
      const config = buildConfig();
      const { result } = renderHook(() => useEntityCRUD(config));

      await act(async () => {
        await result.current.handleSave();
      });

      expect(config.service.create).toHaveBeenCalled();
      expect(config.success).toHaveBeenCalledWith("创建成功", "新角色已添加");
      expect(config.markClean).toHaveBeenCalledWith("characters");
      expect(config.resetCustomFields).toHaveBeenCalled();
      expect(config.setGeneratedImage).toHaveBeenCalledWith(null);
      expect(result.current.saveStatus).toBe("saved");
    });

    it("新建实体有图片时应添加到资产库", async () => {
      const config = buildConfig({ generatedImage: "https://example.com/img.png" });
      const { result } = renderHook(() => useEntityCRUD(config));

      await act(async () => {
        await result.current.handleSave();
      });

      expect(config.addAssetToLibrary).toHaveBeenCalledWith(
        "https://example.com/img.png",
        "image",
        "测试角色",
        expect.objectContaining({ type: "character" }),
      );
    });

    it("已有ID的实体应调用 service.update", async () => {
      const config = buildConfig({ entity: { id: "existing-id", name: "已有角色", prompt: "prompt" } });
      const { result } = renderHook(() => useEntityCRUD(config));

      await act(async () => {
        await result.current.handleSave();
      });

      expect(config.service.update).toHaveBeenCalledWith("existing-id", expect.anything());
      expect(config.service.create).not.toHaveBeenCalled();
      expect(config.success).toHaveBeenCalledWith("保存成功", "角色信息已更新");
    });

    it("保存失败时应显示错误并标记脏状态", async () => {
      const config = buildConfig();
      config.service.create = vi.fn(() => Promise.resolve(err(new Error("数据库错误"))));

      const { result } = renderHook(() => useEntityCRUD(config));

      await act(async () => {
        await result.current.handleSave();
      });

      expect(config.showError).toHaveBeenCalledWith("保存失败", "数据库错误");
      expect(config.markDirty).toHaveBeenCalledWith("characters");
      expect(result.current.saveStatus).toBe("error");
      expect(result.current.saveError).toBe("数据库错误");
    });

    it("保存中重复调用应被忽略（防抖）", async () => {
      let resolveCreate: () => void = () => {};
      const config = buildConfig();
      config.service.create = vi.fn(() => new Promise<{ ok: boolean; value: TestEntity }>((resolve) => {
        resolveCreate = () => resolve({ ok: true, value: { id: "new-id", name: "测试角色", prompt: "test" } });
      }));

      const { result } = renderHook(() => useEntityCRUD(config));

      act(() => { result.current.handleSave(); });
      act(() => { result.current.handleSave(); });

      await act(async () => { resolveCreate(); });

      expect(config.service.create).toHaveBeenCalledTimes(1);
    });

    it("应自动生成ID（新建时无ID）", async () => {
      const config = buildConfig({ entity: { id: "", name: "新角色", prompt: "" } });
      const { result } = renderHook(() => useEntityCRUD(config));

      await act(async () => {
        await result.current.handleSave();
      });

      const createdEntity = config.service.create.mock.calls[0][0] as TestEntity;
      expect(createdEntity.id).toMatch(/^char_/);
    });
  });

  describe("handleDelete", () => {
    it("有引用时应打开删除确认对话框", async () => {
      const config = buildConfig({
        entity: { id: "char-1", name: "角色A", prompt: "prompt" },
        checkReferences: vi.fn(() => ({
          references: [{ storyId: "s1", storyName: "故事1" }],
        })),
      });
      const { result } = renderHook(() => useEntityCRUD(config));

      await act(async () => {
        await result.current.handleDelete("char-1");
      });

      expect(result.current.deleteDialogOpen).toBe(true);
      expect(result.current.entityToDelete).toBe("char-1");
      expect(result.current.referenceCheck).toEqual({
        references: [{ storyId: "s1", storyName: "故事1" }],
      });
    });

    it("无引用且用户确认时应执行删除", async () => {
      confirmResult = true;
      const config = buildConfig({
        entity: { id: "char-1", name: "角色A", prompt: "prompt" },
      });
      const { result } = renderHook(() => useEntityCRUD(config));

      await act(async () => {
        await result.current.handleDelete("char-1");
      });

      expect(config.service.delete).toHaveBeenCalledWith("char-1");
    });

    it("无引用且用户取消时不应执行删除", async () => {
      confirmResult = false;
      const config = buildConfig({
        entity: { id: "char-1", name: "角色A", prompt: "prompt" },
      });
      const { result } = renderHook(() => useEntityCRUD(config));

      await act(async () => {
        await result.current.handleDelete("char-1");
      });

      expect(config.service.delete).not.toHaveBeenCalled();
    });
  });

  describe("performDelete", () => {
    it("删除成功时应清理状态并通知用户", async () => {
      const config = buildConfig({
        entity: { id: "char-1", name: "角色A", prompt: "prompt" },
      });
      const { result } = renderHook(() => useEntityCRUD(config));

      await act(async () => {
        await result.current.performDelete("char-1");
      });

      expect(config.service.delete).toHaveBeenCalledWith("char-1");
      expect(mockInvalidateQueries).toHaveBeenCalled();
      expect(config.onUpdateStoriesAfterDelete).toHaveBeenCalledWith("char-1", []);
      expect(config.success).toHaveBeenCalledWith("删除成功", "角色已删除");
      expect(result.current.isDeleting).toBe(false);
      expect(result.current.deleteDialogOpen).toBe(false);
    });

    it("删除当前编辑的实体时应重置为默认值", async () => {
      const config = buildConfig({
        entity: { id: "char-1", name: "角色A", prompt: "prompt" },
      });
      const { result } = renderHook(() => useEntityCRUD(config));

      await act(async () => {
        await result.current.performDelete("char-1");
      });

      expect(config.setEntity).toHaveBeenCalledWith(config.defaultEntity);
    });

    it("删除非当前实体时不应重置", async () => {
      const config = buildConfig({
        entity: { id: "char-2", name: "角色B", prompt: "prompt" },
      });
      const { result } = renderHook(() => useEntityCRUD(config));

      await act(async () => {
        await result.current.performDelete("char-1");
      });

      expect(config.setEntity).not.toHaveBeenCalledWith(config.defaultEntity);
    });

    it("删除失败时应显示错误", async () => {
      const config = buildConfig({
        entity: { id: "char-1", name: "角色A", prompt: "prompt" },
      });
      config.service.delete = vi.fn(() => Promise.resolve(err(new Error("删除失败"))));

      const { result } = renderHook(() => useEntityCRUD(config));

      await act(async () => {
        await result.current.performDelete("char-1");
      });

      expect(config.showError).toHaveBeenCalledWith("删除失败", "删除失败");
      expect(result.current.isDeleting).toBe(false);
    });
  });

  describe("setDeleteDialogOpen", () => {
    it("应能手动关闭对话框", async () => {
      const config = buildConfig({
        entity: { id: "char-1", name: "角色A", prompt: "prompt" },
        checkReferences: vi.fn(() => ({
          references: [{ storyId: "s1", storyName: "故事1" }],
        })),
      });
      const { result } = renderHook(() => useEntityCRUD(config));

      await act(async () => {
        await result.current.handleDelete("char-1");
      });
      expect(result.current.deleteDialogOpen).toBe(true);

      act(() => {
        result.current.setDeleteDialogOpen(false);
      });
      expect(result.current.deleteDialogOpen).toBe(false);
    });
  });
});
