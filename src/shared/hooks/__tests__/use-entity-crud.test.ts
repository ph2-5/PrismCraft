import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { SetStateAction } from "react";
import type { Story } from "@/domain/schemas";
import type { DeleteCheckResult } from "@/domain/services";
import type { Result } from "@/domain/types";
import { AppError, ok, err } from "@/domain/types";
import type { EntityCRUDConfig } from "../use-entity-crud";

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

interface TestEntity {
  id: string;
  name: string;
  prompt: string;
}

function buildConfig(overrides: Record<string, unknown> = {}) {
  const entity: TestEntity = { id: "", name: "测试角色", prompt: "test prompt" };
  const defaultEntity: TestEntity = { id: "", name: "", prompt: "" };
  const mockCreate = vi.fn<(entity: TestEntity) => Promise<Result<TestEntity>>>(() => Promise.resolve(ok({ ...entity, id: "new-id" })));
  const mockUpdate = vi.fn<(id: string, entity: TestEntity) => Promise<Result<void>>>(() => Promise.resolve(ok(undefined)));
  const mockDelete = vi.fn<(id: string) => Promise<Result<void>>>(() => Promise.resolve(ok(undefined)));

  return {
    entity,
    setEntity: vi.fn<(update: TestEntity | ((prev: TestEntity) => TestEntity), shouldMarkDirty?: boolean) => void>(),
    generatedImage: null as string | null,
    setGeneratedImage: vi.fn<(value: SetStateAction<string | null>) => void>(),
    resetCustomFields: vi.fn<() => void>(),
    applyImageToEntity: vi.fn<(entity: TestEntity, imageUrl: string) => TestEntity>((e, url) => ({ ...e, imageUrl: url } as TestEntity)),
    prepareEntityForSave: vi.fn<(entity: TestEntity, prompt: string) => TestEntity>((e) => e),
    service: { create: mockCreate, update: mockUpdate, delete: mockDelete },
    queryKey: ["characters"],
    entityLabel: "角色",
    entityIdPrefix: "char",
    nameValidationMessage: "名称不能为空",
    assetLabel: "角色图片",
    checkReferences: vi.fn<(id: string, name: string, stories: Story[]) => DeleteCheckResult>(() => ({ canDelete: true, references: [] })),
    defaultEntity,
    generatePrompt: vi.fn<(entity: TestEntity) => string>(() => "generated prompt"),
    addAssetToLibrary: vi.fn<(url: string, type: "image" | "video", name: string, boundTo?: { type: "character" | "scene"; id: string; name: string }) => void>(),
    assetBindType: "character" as const,
    success: vi.fn<(title: string, description?: string) => void>(),
    showError: vi.fn<(title: string, description?: string) => void>(),
    stories: [] as Story[],
    markDirty: vi.fn<(key: string) => void>(),
    markClean: vi.fn<(key: string) => void>(),
    onUpdateStoriesAfterDelete: vi.fn<(entityId: string, stories: Story[]) => Promise<void>>(),
    ...overrides,
  };
}

function renderCRUDHook(c: ReturnType<typeof buildConfig>) {
  return renderHook(() => useEntityCRUD(c as unknown as EntityCRUDConfig<TestEntity>));
}

describe("useEntityCRUD", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    confirmResult = false;
  });

  describe("初始状态", () => {
    it("应返回正确的初始状态", () => {
      const config = buildConfig();
      const { result } = renderCRUDHook(config);

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
      const { result } = renderCRUDHook(config);

      await act(async () => {
        await result.current.handleSave();
      });

      expect(config.showError).toHaveBeenCalledWith("保存失败", "名称不能为空");
      expect(config.service.create).not.toHaveBeenCalled();
    });

    it("名称为纯空格时应显示验证错误", async () => {
      const config = buildConfig({ entity: { id: "", name: "   ", prompt: "" } });
      const { result } = renderCRUDHook(config);

      await act(async () => {
        await result.current.handleSave();
      });

      expect(config.showError).toHaveBeenCalledWith("保存失败", "名称不能为空");
    });

    it("新建实体时应调用 service.create", async () => {
      const config = buildConfig();
      const { result } = renderCRUDHook(config);

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
      const { result } = renderCRUDHook(config);

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
      const { result } = renderCRUDHook(config);

      await act(async () => {
        await result.current.handleSave();
      });

      expect(config.service.update).toHaveBeenCalledWith("existing-id", expect.anything());
      expect(config.service.create).not.toHaveBeenCalled();
      expect(config.success).toHaveBeenCalledWith("保存成功", "角色信息已更新");
    });

    it("保存失败时应显示错误并标记脏状态", async () => {
      const config = buildConfig();
      config.service.create = vi.fn<(entity: TestEntity) => Promise<Result<TestEntity>>>(() =>
        Promise.resolve(err(new AppError("DATABASE_ERROR", "数据库错误"))),
      );

      const { result } = renderCRUDHook(config);

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
      config.service.create = vi.fn<(entity: TestEntity) => Promise<Result<TestEntity>>>(() =>
        new Promise<Result<TestEntity>>((resolve) => {
          resolveCreate = () => resolve(ok({ id: "new-id", name: "测试角色", prompt: "test" }));
        }),
      );

      const { result } = renderCRUDHook(config);

      act(() => { result.current.handleSave(); });
      act(() => { result.current.handleSave(); });

      await act(async () => { resolveCreate(); });

      expect(config.service.create).toHaveBeenCalledTimes(1);
    });

    it("应自动生成ID（新建时无ID）", async () => {
      const config = buildConfig({ entity: { id: "", name: "新角色", prompt: "" } });
      const { result } = renderCRUDHook(config);

      await act(async () => {
        await result.current.handleSave();
      });

      const createdEntity = config.service.create.mock.calls[0]![0] as TestEntity;
      expect(createdEntity.id).toMatch(/^char_/);
    });
  });

  describe("handleDelete", () => {
    it("有引用时应打开删除确认对话框", async () => {
      const config = buildConfig({
        entity: { id: "char-1", name: "角色A", prompt: "prompt" },
        checkReferences: vi.fn(() => ({
          canDelete: false,
          references: [{ storyId: "s1", storyName: "故事1" }],
        })),
      });
      const { result } = renderCRUDHook(config);

      await act(async () => {
        await result.current.handleDelete("char-1");
      });

      expect(result.current.deleteDialogOpen).toBe(true);
      expect(result.current.entityToDelete).toBe("char-1");
      expect(result.current.referenceCheck).toEqual({
        canDelete: false,
        references: [{ storyId: "s1", storyName: "故事1" }],
      });
    });

    it("无引用且用户确认时应执行删除", async () => {
      confirmResult = true;
      const config = buildConfig({
        entity: { id: "char-1", name: "角色A", prompt: "prompt" },
      });
      const { result } = renderCRUDHook(config);

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
      const { result } = renderCRUDHook(config);

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
      const { result } = renderCRUDHook(config);

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
      const { result } = renderCRUDHook(config);

      await act(async () => {
        await result.current.performDelete("char-1");
      });

      expect(config.setEntity).toHaveBeenCalledWith(config.defaultEntity);
    });

    it("删除非当前实体时不应重置", async () => {
      const config = buildConfig({
        entity: { id: "char-2", name: "角色B", prompt: "prompt" },
      });
      const { result } = renderCRUDHook(config);

      await act(async () => {
        await result.current.performDelete("char-1");
      });

      expect(config.setEntity).not.toHaveBeenCalledWith(config.defaultEntity);
    });

    it("删除失败时应显示错误", async () => {
      const config = buildConfig({
        entity: { id: "char-1", name: "角色A", prompt: "prompt" },
      });
      config.service.delete = vi.fn<(id: string) => Promise<Result<void>>>(() =>
        Promise.resolve(err(new AppError("DATABASE_ERROR", "删除失败"))),
      );

      const { result } = renderCRUDHook(config);

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
          canDelete: false,
          references: [{ storyId: "s1", storyName: "故事1" }],
        })),
      });
      const { result } = renderCRUDHook(config);

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
