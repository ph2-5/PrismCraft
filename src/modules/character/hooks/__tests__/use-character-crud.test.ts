import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Character, Story } from "@/domain/schemas";
import type { Result } from "@/domain/types";
import { ok, err, AppError } from "@/domain/types";

const { mockInvalidateQueries, mockServiceCreate, mockServiceUpdate, mockServiceDelete, confirmResult } = vi.hoisted(() => ({
  mockInvalidateQueries: vi.fn(),
  mockServiceCreate: vi.fn<(entity: Character) => Promise<Result<Character>>>(),
  mockServiceUpdate: vi.fn<(id: string, entity: Character) => Promise<Result<void>>>(),
  mockServiceDelete: vi.fn<(id: string) => Promise<Result<void>>>(),
  confirmResult: { value: false },
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: { error: vi.fn(), warn: vi.fn() },
}));

vi.mock("@/shared/utils/confirm", () => ({
  confirm: vi.fn(() => Promise.resolve(confirmResult.value)),
}));

vi.mock("@/shared/constants/messages", () => ({
  t: vi.fn((key: string) => key),
}));

vi.mock("@/shared/utils/user-facing-error", () => ({
  mapUserFacingError: vi.fn((err: unknown) => err instanceof Error ? err.message : String(err)),
}));

vi.mock("@/domain/services", () => ({
  checkCharacterReferences: vi.fn(() => ({ canDelete: true, references: [] })),
}));

vi.mock("@/modules/character/services", () => ({
  characterService: {
    create: mockServiceCreate,
    update: mockServiceUpdate,
    delete: mockServiceDelete,
  },
}));

vi.mock("@/modules/character/constants", () => ({
  defaultCharacter: {
    id: "", name: "", description: "", gender: "", age: 25, style: "",
    personality: [], appearance: { hairColor: "", hairStyle: "", eyeColor: "", height: "", build: "", clothing: "" },
    outfits: [], prompt: "", traits: [], tags: [], useCount: 0,
  },
  normalizeGender: vi.fn((v: string) => v || "unknown"),
}));

import { useCharacterCRUD } from "../use-character-crud";

function buildCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: "char_1",
    name: "测试角色",
    description: "描述",
    gender: "male",
    age: 25,
    style: "写实",
    personality: ["勇敢", "聪明"],
    appearance: { hairColor: "black", hairStyle: "short", eyeColor: "brown", height: "180cm", build: "athletic", clothing: "suit" },
    outfits: [],
    prompt: "测试提示词",
    traits: [],
    tags: [],
    useCount: 0,
    ...overrides,
  };
}

interface BuildPropsOverrides {
  currentCharacter?: Character;
  generatedImage?: string | null;
  stories?: Story[];
  [key: string]: unknown;
}

function buildProps(overrides: BuildPropsOverrides = {}) {
  const currentCharacter = overrides.currentCharacter ?? buildCharacter();

  return {
    currentCharacter,
    setCurrentCharacter: vi.fn<(update: Character | ((prev: Character) => Character), shouldMarkDirty?: boolean) => void>(),
    generatedImage: (overrides.generatedImage ?? null) as string | null,
    setCustomTrait: vi.fn<React.Dispatch<React.SetStateAction<string>>>(),
    setCustomStyle: vi.fn<React.Dispatch<React.SetStateAction<string>>>(),
    setGeneratedImage: vi.fn<React.Dispatch<React.SetStateAction<string | null>>>(),
    addAssetToLibrary: vi.fn<(url: string, type: "image" | "video", name: string, boundTo?: { type: "character" | "scene"; id: string; name: string }) => void>(),
    generatePrompt: vi.fn<(char: Character) => string>(() => "generated prompt"),
    success: vi.fn<(title: string, description?: string) => void>(),
    showError: vi.fn<(title: string, description?: string) => void>(),
    stories: (overrides.stories ?? []) as Story[],
    markDirty: vi.fn<(key: string) => void>(),
    markClean: vi.fn<(key: string) => void>(),
    onUpdateStoriesAfterDelete: vi.fn<(characterId: string, stories: Story[]) => Promise<void>>(),
    ...overrides,
  };
}

describe("useCharacterCRUD", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    confirmResult.value = false;
    mockServiceCreate.mockResolvedValue(ok(buildCharacter({ id: "char_new" })));
    mockServiceUpdate.mockResolvedValue(ok(undefined));
    mockServiceDelete.mockResolvedValue(ok(undefined));
  });

  describe("handleSave - 创建角色", () => {
    it("新建角色时应调用 service.create 并 invalidate queries", async () => {
      const newChar = buildCharacter({ id: "" });
      const props = buildProps({ currentCharacter: newChar });

      const { result } = renderHook(() => useCharacterCRUD(props));

      await act(async () => {
        await result.current.handleSave();
      });

      expect(mockServiceCreate).toHaveBeenCalledTimes(1);
      expect(mockServiceUpdate).not.toHaveBeenCalled();
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["characters"] });
      expect(props.success).toHaveBeenCalled();
      expect(props.markClean).toHaveBeenCalledWith("characters");
    });

    it("新建角色有图片时应添加到资产库", async () => {
      const newChar = buildCharacter({ id: "" });
      const props = buildProps({ currentCharacter: newChar, generatedImage: "https://img.example.com/char.png" });

      const { result } = renderHook(() => useCharacterCRUD(props));

      await act(async () => {
        await result.current.handleSave();
      });

      expect(props.addAssetToLibrary).toHaveBeenCalledWith(
        "https://img.example.com/char.png",
        "image",
        expect.any(String),
        expect.objectContaining({ type: "character" }),
      );
    });
  });

  describe("handleSave - 更新角色", () => {
    it("已有ID的角色应调用 service.update 并 invalidate queries", async () => {
      const existingChar = buildCharacter({ id: "char_1" });
      const props = buildProps({ currentCharacter: existingChar });

      const { result } = renderHook(() => useCharacterCRUD(props));

      await act(async () => {
        await result.current.handleSave();
      });

      expect(mockServiceUpdate).toHaveBeenCalledWith("char_1", expect.anything());
      expect(mockServiceCreate).not.toHaveBeenCalled();
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["characters"] });
      expect(props.success).toHaveBeenCalled();
    });

    it("更新失败时应显示错误并标记脏状态", async () => {
      const existingChar = buildCharacter({ id: "char_1" });
      mockServiceUpdate.mockResolvedValueOnce(err(new AppError("DATABASE_ERROR", "更新失败")));

      const props = buildProps({ currentCharacter: existingChar });

      const { result } = renderHook(() => useCharacterCRUD(props));

      await act(async () => {
        await result.current.handleSave();
      });

      expect(props.showError).toHaveBeenCalled();
      expect(props.markDirty).toHaveBeenCalledWith("characters");
      expect(result.current.saveStatus).toBe("error");
    });
  });

  describe("handleSave - 验证", () => {
    it("名称为空时应显示验证错误且不调用 service", async () => {
      const emptyChar = buildCharacter({ id: "", name: "" });
      const props = buildProps({ currentCharacter: emptyChar });

      const { result } = renderHook(() => useCharacterCRUD(props));

      await act(async () => {
        await result.current.handleSave();
      });

      expect(props.showError).toHaveBeenCalled();
      expect(mockServiceCreate).not.toHaveBeenCalled();
      expect(mockServiceUpdate).not.toHaveBeenCalled();
    });
  });

  describe("performDelete - 删除角色", () => {
    it("删除成功时应调用 service.delete 并 invalidate queries", async () => {
      const char = buildCharacter({ id: "char_1" });
      const props = buildProps({ currentCharacter: char });

      const { result } = renderHook(() => useCharacterCRUD(props));

      await act(async () => {
        await result.current.performDelete("char_1");
      });

      expect(mockServiceDelete).toHaveBeenCalledWith("char_1");
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["characters"] });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["stories"] });
      expect(props.onUpdateStoriesAfterDelete).toHaveBeenCalledWith("char_1", []);
      expect(props.success).toHaveBeenCalled();
      expect(result.current.isDeleting).toBe(false);
    });

    it("删除当前编辑的角色时应重置为默认值", async () => {
      const char = buildCharacter({ id: "char_1" });
      const props = buildProps({ currentCharacter: char });

      const { result } = renderHook(() => useCharacterCRUD(props));

      await act(async () => {
        await result.current.performDelete("char_1");
      });

      expect(props.setCurrentCharacter).toHaveBeenCalledWith(
        expect.objectContaining({ id: "" }),
      );
    });

    it("删除失败时应显示错误", async () => {
      const char = buildCharacter({ id: "char_1" });
      mockServiceDelete.mockResolvedValueOnce(err(new AppError("DATABASE_ERROR", "删除失败")));

      const props = buildProps({ currentCharacter: char });

      const { result } = renderHook(() => useCharacterCRUD(props));

      await act(async () => {
        await result.current.performDelete("char_1");
      });

      expect(props.showError).toHaveBeenCalled();
      expect(result.current.isDeleting).toBe(false);
    });
  });

  describe("addTrait / removeTrait", () => {
    it("addTrait 应向 personality 添加新特征并清空 customTrait", () => {
      const char = buildCharacter({ personality: ["勇敢"] });
      const props = buildProps({ currentCharacter: char });

      const { result } = renderHook(() => useCharacterCRUD(props));

      act(() => {
        result.current.addTrait("温柔");
      });

      expect(props.setCurrentCharacter).toHaveBeenCalledWith(
        expect.any(Function),
        true,
      );
      const updater = props.setCurrentCharacter.mock.calls[0]![0] as (prev: Character) => Character;
      const updated = updater(char);
      expect(updated.personality).toEqual(["勇敢", "温柔"]);
      expect(props.setCustomTrait).toHaveBeenCalledWith("");
    });

    it("addTrait 重复特征时不应添加", () => {
      const char = buildCharacter({ personality: ["勇敢"] });
      const props = buildProps({ currentCharacter: char });

      const { result } = renderHook(() => useCharacterCRUD(props));

      act(() => {
        result.current.addTrait("勇敢");
      });

      const updater = props.setCurrentCharacter.mock.calls[0]![0] as (prev: Character) => Character;
      const updated = updater(char);
      expect(updated.personality).toEqual(["勇敢"]);
      expect(props.setCustomTrait).toHaveBeenCalledWith("");
    });

    it("addTrait 空字符串时不应修改 personality 但仍清空 customTrait", () => {
      const char = buildCharacter({ personality: ["勇敢"] });
      const props = buildProps({ currentCharacter: char });

      const { result } = renderHook(() => useCharacterCRUD(props));

      act(() => {
        result.current.addTrait("");
      });

      expect(props.setCurrentCharacter).not.toHaveBeenCalled();
      expect(props.setCustomTrait).toHaveBeenCalledWith("");
    });

    it("removeTrait 应从 personality 中移除指定特征", () => {
      const char = buildCharacter({ personality: ["勇敢", "聪明"] });
      const props = buildProps({ currentCharacter: char });

      const { result } = renderHook(() => useCharacterCRUD(props));

      act(() => {
        result.current.removeTrait("勇敢");
      });

      expect(props.setCurrentCharacter).toHaveBeenCalledWith(
        expect.any(Function),
        true,
      );
      const updater = props.setCurrentCharacter.mock.calls[0]![0] as (prev: Character) => Character;
      const updated = updater(char);
      expect(updated.personality).toEqual(["聪明"]);
    });
  });

  describe("初始状态", () => {
    it("应返回正确的初始状态", () => {
      const props = buildProps();

      const { result } = renderHook(() => useCharacterCRUD(props));

      expect(result.current.deleteDialogOpen).toBe(false);
      expect(result.current.characterToDelete).toBe(null);
      expect(result.current.referenceCheck).toBe(null);
      expect(result.current.saveStatus).toBe("idle");
      expect(result.current.saveError).toBe("");
      expect(result.current.isDeleting).toBe(false);
    });
  });
});
