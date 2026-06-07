import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Character, CharacterOutfit } from "@/domain/schemas";

const {
  mockSynthesizeOutfit,
  mockBatchSynthesizeOutfits,
} = vi.hoisted(() => ({
  mockSynthesizeOutfit: vi.fn(),
  mockBatchSynthesizeOutfits: vi.fn(),
}));

vi.mock("@/shared/outfit", () => ({
  synthesizeOutfit: mockSynthesizeOutfit,
  batchSynthesizeOutfits: mockBatchSynthesizeOutfits,
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("@/shared/error-handler", () => ({
  getErrorMessage: vi.fn((err: unknown) => (err instanceof Error ? err.message : String(err))),
}));

vi.mock("@/shared/constants/messages", () => ({
  t: vi.fn((key: string) => key),
}));

vi.mock("@/domain/types/result", () => ({
  AppError: class AppError extends Error { code: string; constructor(code: string, message: string) { super(message); this.code = code; } },
}));

import { useOutfitManagement } from "../use-outfit-management";

function buildOutfit(overrides: Partial<CharacterOutfit> = {}): CharacterOutfit {
  return {
    id: "outfit_1",
    name: "休闲装",
    description: "日常休闲服装",
    clothing: "T恤和牛仔裤",
    accessories: ["手表"],
    isDefault: false,
    createdAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function buildCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: "char_1",
    name: "测试角色",
    description: "描述",
    gender: "male",
    age: 25,
    style: "写实",
    personality: ["勇敢"],
    appearance: { hairColor: "black", hairStyle: "short", eyeColor: "brown", height: "180cm", build: "athletic", clothing: "suit" },
    outfits: [buildOutfit()],
    prompt: "测试提示词",
    traits: [],
    tags: [],
    useCount: 0,
    ...overrides,
  };
}

interface BuildPropsOverrides {
  currentCharacter?: Character;
  [key: string]: unknown;
}

function buildProps(overrides: BuildPropsOverrides = {}) {
  const currentCharacter = overrides.currentCharacter ?? buildCharacter();
  return {
    currentCharacter,
    setCurrentCharacter: vi.fn<(update: Character | ((prev: Character) => Character), shouldMarkDirty?: boolean) => void>(),
    setIsGenerating: vi.fn<React.Dispatch<React.SetStateAction<boolean>>>(),
    addAssetToLibrary: vi.fn<(url: string, type: "image" | "video", name: string, boundTo?: { type: "character" | "scene"; id: string; name: string }) => void>(),
    success: vi.fn<(title: string, description?: string) => void>(),
    showError: vi.fn<(title: string, description?: string) => void>(),
    ...overrides,
  };
}

describe("useOutfitManagement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSynthesizeOutfit.mockResolvedValue({
      success: true,
      data: { imageUrl: "https://img.example.com/outfit.png" },
    });
    mockBatchSynthesizeOutfits.mockResolvedValue([
      { outfitId: "outfit_1", success: true, imageUrl: "https://img.example.com/outfit1.png" },
    ]);
  });

  describe("初始状态", () => {
    it("应返回正确的初始状态", () => {
      const props = buildProps();
      const { result } = renderHook(() => useOutfitManagement(props));

      expect(result.current.showOutfitDialog).toBe(false);
      expect(result.current.editingOutfit).toBe(null);
      expect(result.current.outfitForm).toEqual({ name: "", description: "", clothing: "", accessories: [] });
      expect(result.current.customAccessory).toBe("");
    });
  });

  describe("handleAddOutfit", () => {
    it("名称和服装为空时应显示验证错误", () => {
      const props = buildProps();
      const { result } = renderHook(() => useOutfitManagement(props));

      act(() => {
        result.current.setOutfitForm({ name: "", description: "", clothing: "", accessories: [] });
      });

      act(() => {
        result.current.handleAddOutfit();
      });

      expect(props.showError).toHaveBeenCalled();
      expect(props.setCurrentCharacter).not.toHaveBeenCalled();
    });

    it("名称为空时应显示验证错误", () => {
      const props = buildProps();
      const { result } = renderHook(() => useOutfitManagement(props));

      act(() => {
        result.current.setOutfitForm({ name: "", description: "描述", clothing: "衣服", accessories: [] });
      });

      act(() => {
        result.current.handleAddOutfit();
      });

      expect(props.showError).toHaveBeenCalled();
    });

    it("服装为空时应显示验证错误", () => {
      const props = buildProps();
      const { result } = renderHook(() => useOutfitManagement(props));

      act(() => {
        result.current.setOutfitForm({ name: "名称", description: "描述", clothing: "", accessories: [] });
      });

      act(() => {
        result.current.handleAddOutfit();
      });

      expect(props.showError).toHaveBeenCalled();
    });

    it("新增服装时应通过 setCurrentCharacter 添加到 outfits", () => {
      const props = buildProps({ currentCharacter: buildCharacter({ outfits: [] }) });
      const { result } = renderHook(() => useOutfitManagement(props));

      act(() => {
        result.current.setOutfitForm({ name: "正装", description: "正式场合", clothing: "西装", accessories: [] });
      });

      act(() => {
        result.current.handleAddOutfit();
      });

      expect(props.setCurrentCharacter).toHaveBeenCalledWith(expect.any(Function));
      const updater = props.setCurrentCharacter.mock.calls[0]![0] as (prev: Character) => Character;
      const updated = updater(buildCharacter({ outfits: [] }));
      expect(updated.outfits).toHaveLength(1);
      expect(updated.outfits[0].name).toBe("正装");
      expect(updated.outfits[0].clothing).toBe("西装");
      expect(result.current.showOutfitDialog).toBe(false);
      expect(result.current.editingOutfit).toBe(null);
      expect(props.success).toHaveBeenCalled();
    });

    it("编辑已有服装时应替换对应 outfit", () => {
      const existingOutfit = buildOutfit({ id: "outfit_1", name: "旧服装" });
      const props = buildProps({ currentCharacter: buildCharacter({ outfits: [existingOutfit] }) });
      const { result } = renderHook(() => useOutfitManagement(props));

      act(() => {
        result.current.handleEditOutfit(existingOutfit);
      });

      expect(result.current.showOutfitDialog).toBe(true);
      expect(result.current.editingOutfit).toEqual(existingOutfit);

      act(() => {
        result.current.setOutfitForm({ name: "新服装", description: "更新描述", clothing: "新衣服", accessories: [] });
      });

      act(() => {
        result.current.handleAddOutfit();
      });

      const updater = props.setCurrentCharacter.mock.calls[0]![0] as (prev: Character) => Character;
      const updated = updater(buildCharacter({ outfits: [existingOutfit] }));
      expect(updated.outfits).toHaveLength(1);
      expect(updated.outfits[0].name).toBe("新服装");
    });
  });

  describe("handleDeleteOutfit", () => {
    it("应从 outfits 中移除指定服装", () => {
      const outfit1 = buildOutfit({ id: "outfit_1" });
      const outfit2 = buildOutfit({ id: "outfit_2", name: "运动装" });
      const props = buildProps({ currentCharacter: buildCharacter({ outfits: [outfit1, outfit2] }) });
      const { result } = renderHook(() => useOutfitManagement(props));

      act(() => {
        result.current.handleDeleteOutfit("outfit_1");
      });

      expect(props.setCurrentCharacter).toHaveBeenCalledWith(expect.any(Function));
      const updater = props.setCurrentCharacter.mock.calls[0]![0] as (prev: Character) => Character;
      const updated = updater(buildCharacter({ outfits: [outfit1, outfit2] }));
      expect(updated.outfits).toHaveLength(1);
      expect(updated.outfits[0].id).toBe("outfit_2");
      expect(props.success).toHaveBeenCalled();
    });
  });

  describe("handleSetDefaultOutfit", () => {
    it("应设置指定服装为默认并更新 appearance.clothing", () => {
      const outfit1 = buildOutfit({ id: "outfit_1", clothing: "T恤" });
      const outfit2 = buildOutfit({ id: "outfit_2", clothing: "西装", isDefault: true });
      const props = buildProps({ currentCharacter: buildCharacter({ outfits: [outfit1, outfit2] }) });
      const { result } = renderHook(() => useOutfitManagement(props));

      act(() => {
        result.current.handleSetDefaultOutfit("outfit_1");
      });

      expect(props.setCurrentCharacter).toHaveBeenCalledWith(expect.any(Function));
      const updater = props.setCurrentCharacter.mock.calls[0]![0] as (prev: Character) => Character;
      const updated = updater(buildCharacter({ outfits: [outfit1, outfit2] }));
      expect(updated.outfits.find((o) => o.id === "outfit_1")?.isDefault).toBe(true);
      expect(updated.outfits.find((o) => o.id === "outfit_2")?.isDefault).toBe(false);
      expect(updated.appearance.clothing).toBe("T恤");
      expect(props.success).toHaveBeenCalled();
    });
  });

  describe("handleEditOutfit", () => {
    it("应设置编辑状态并打开对话框", () => {
      const outfit = buildOutfit({ id: "outfit_1", name: "休闲装", clothing: "T恤" });
      const props = buildProps({ currentCharacter: buildCharacter({ outfits: [outfit] }) });
      const { result } = renderHook(() => useOutfitManagement(props));

      act(() => {
        result.current.handleEditOutfit(outfit);
      });

      expect(result.current.showOutfitDialog).toBe(true);
      expect(result.current.editingOutfit).toEqual(outfit);
      expect(result.current.outfitForm.name).toBe("休闲装");
      expect(result.current.outfitForm.clothing).toBe("T恤");
    });
  });

  describe("handleGenerateOutfitImage", () => {
    it("角色无ID时应显示错误", async () => {
      const props = buildProps({ currentCharacter: buildCharacter({ id: "" }) });
      const { result } = renderHook(() => useOutfitManagement(props));

      await act(async () => {
        await result.current.handleGenerateOutfitImage(buildOutfit());
      });

      expect(props.showError).toHaveBeenCalled();
      expect(mockSynthesizeOutfit).not.toHaveBeenCalled();
    });

    it("角色无参考图片时应显示错误", async () => {
      const props = buildProps({
        currentCharacter: buildCharacter({
          id: "char_1",
          generatedImage: undefined,
          refImagePath: undefined,
        } as Partial<Character>),
      });
      const { result } = renderHook(() => useOutfitManagement(props));

      await act(async () => {
        await result.current.handleGenerateOutfitImage(buildOutfit());
      });

      expect(props.showError).toHaveBeenCalled();
      expect(mockSynthesizeOutfit).not.toHaveBeenCalled();
    });

    it("合成成功时应更新服装图片并添加到资产库", async () => {
      const outfit = buildOutfit({ id: "outfit_1" });
      const props = buildProps({
        currentCharacter: buildCharacter({
          id: "char_1",
          outfits: [outfit],
          generatedImage: "https://img.example.com/char.png",
        }),
      });
      const { result } = renderHook(() => useOutfitManagement(props));

      await act(async () => {
        await result.current.handleGenerateOutfitImage(outfit);
      });

      expect(mockSynthesizeOutfit).toHaveBeenCalledWith(expect.objectContaining({
        characterImageUrl: "https://img.example.com/char.png",
        outfitDescription: "T恤和牛仔裤",
      }));
      expect(props.setCurrentCharacter).toHaveBeenCalledWith(expect.any(Function));
      expect(props.addAssetToLibrary).toHaveBeenCalled();
      expect(props.success).toHaveBeenCalled();
      expect(props.setIsGenerating).toHaveBeenCalledWith(true);
      expect(props.setIsGenerating).toHaveBeenCalledWith(false);
    });

    it("合成失败时应显示错误", async () => {
      mockSynthesizeOutfit.mockResolvedValueOnce({ success: false, error: "合成失败" });
      const outfit = buildOutfit({ id: "outfit_1" });
      const props = buildProps({
        currentCharacter: buildCharacter({
          id: "char_1",
          outfits: [outfit],
          generatedImage: "https://img.example.com/char.png",
        }),
      });
      const { result } = renderHook(() => useOutfitManagement(props));

      await act(async () => {
        await result.current.handleGenerateOutfitImage(outfit);
      });

      expect(props.showError).toHaveBeenCalled();
      expect(props.setIsGenerating).toHaveBeenCalledWith(false);
    });

    it("合成抛出异常时应显示错误", async () => {
      mockSynthesizeOutfit.mockRejectedValueOnce(new Error("网络错误"));
      const outfit = buildOutfit({ id: "outfit_1" });
      const props = buildProps({
        currentCharacter: buildCharacter({
          id: "char_1",
          outfits: [outfit],
          generatedImage: "https://img.example.com/char.png",
        }),
      });
      const { result } = renderHook(() => useOutfitManagement(props));

      await act(async () => {
        await result.current.handleGenerateOutfitImage(outfit);
      });

      expect(props.showError).toHaveBeenCalled();
      expect(props.setIsGenerating).toHaveBeenCalledWith(false);
    });

    it("应优先使用 generatedImage 而非 refImagePath", async () => {
      const outfit = buildOutfit({ id: "outfit_1" });
      const props = buildProps({
        currentCharacter: buildCharacter({
          id: "char_1",
          outfits: [outfit],
          generatedImage: "https://img.example.com/generated.png",
          refImagePath: "https://img.example.com/ref.png",
        }),
      });
      const { result } = renderHook(() => useOutfitManagement(props));

      await act(async () => {
        await result.current.handleGenerateOutfitImage(outfit);
      });

      expect(mockSynthesizeOutfit).toHaveBeenCalledWith(expect.objectContaining({
        characterImageUrl: "https://img.example.com/generated.png",
      }));
    });
  });

  describe("handleBatchSynthesizeOutfits", () => {
    it("角色无ID时应显示错误", async () => {
      const props = buildProps({ currentCharacter: buildCharacter({ id: "" }) });
      const { result } = renderHook(() => useOutfitManagement(props));

      await act(async () => {
        await result.current.handleBatchSynthesizeOutfits();
      });

      expect(props.showError).toHaveBeenCalled();
      expect(mockBatchSynthesizeOutfits).not.toHaveBeenCalled();
    });

    it("角色无参考图片时应显示错误", async () => {
      const props = buildProps({
        currentCharacter: buildCharacter({
          id: "char_1",
          generatedImage: undefined,
          refImagePath: undefined,
        } as Partial<Character>),
      });
      const { result } = renderHook(() => useOutfitManagement(props));

      await act(async () => {
        await result.current.handleBatchSynthesizeOutfits();
      });

      expect(props.showError).toHaveBeenCalled();
    });

    it("所有服装已有图片时应显示提示", async () => {
      const outfit = buildOutfit({ id: "outfit_1", imageUrl: "https://img.example.com/existing.png" });
      const props = buildProps({
        currentCharacter: buildCharacter({
          id: "char_1",
          outfits: [outfit],
          generatedImage: "https://img.example.com/char.png",
        }),
      });
      const { result } = renderHook(() => useOutfitManagement(props));

      await act(async () => {
        await result.current.handleBatchSynthesizeOutfits();
      });

      expect(props.showError).toHaveBeenCalled();
      expect(mockBatchSynthesizeOutfits).not.toHaveBeenCalled();
    });

    it("批量合成成功时应更新服装图片", async () => {
      const outfit1 = buildOutfit({ id: "outfit_1" });
      const outfit2 = buildOutfit({ id: "outfit_2", name: "正装", clothing: "西装" });
      mockBatchSynthesizeOutfits.mockResolvedValueOnce([
        { outfitId: "outfit_1", success: true, imageUrl: "https://img.example.com/outfit1.png" },
        { outfitId: "outfit_2", success: true, imageUrl: "https://img.example.com/outfit2.png" },
      ]);
      const props = buildProps({
        currentCharacter: buildCharacter({
          id: "char_1",
          outfits: [outfit1, outfit2],
          generatedImage: "https://img.example.com/char.png",
        }),
      });
      const { result } = renderHook(() => useOutfitManagement(props));

      await act(async () => {
        await result.current.handleBatchSynthesizeOutfits();
      });

      expect(mockBatchSynthesizeOutfits).toHaveBeenCalled();
      expect(props.setCurrentCharacter).toHaveBeenCalledWith(expect.any(Function));
      expect(props.success).toHaveBeenCalled();
      expect(props.setIsGenerating).toHaveBeenCalledWith(true);
      expect(props.setIsGenerating).toHaveBeenCalledWith(false);
    });

    it("批量合成全部失败时应显示错误", async () => {
      const outfit1 = buildOutfit({ id: "outfit_1" });
      mockBatchSynthesizeOutfits.mockResolvedValueOnce([
        { outfitId: "outfit_1", success: false, imageUrl: undefined },
      ]);
      const props = buildProps({
        currentCharacter: buildCharacter({
          id: "char_1",
          outfits: [outfit1],
          generatedImage: "https://img.example.com/char.png",
        }),
      });
      const { result } = renderHook(() => useOutfitManagement(props));

      await act(async () => {
        await result.current.handleBatchSynthesizeOutfits();
      });

      expect(props.showError).toHaveBeenCalled();
    });

    it("批量合成抛出异常时应显示错误", async () => {
      const outfit1 = buildOutfit({ id: "outfit_1" });
      mockBatchSynthesizeOutfits.mockRejectedValueOnce(new Error("网络错误"));
      const props = buildProps({
        currentCharacter: buildCharacter({
          id: "char_1",
          outfits: [outfit1],
          generatedImage: "https://img.example.com/char.png",
        }),
      });
      const { result } = renderHook(() => useOutfitManagement(props));

      await act(async () => {
        await result.current.handleBatchSynthesizeOutfits();
      });

      expect(props.showError).toHaveBeenCalled();
      expect(props.setIsGenerating).toHaveBeenCalledWith(false);
    });
  });

  describe("addAccessory", () => {
    it("应向 outfitForm 添加新配饰", () => {
      const props = buildProps();
      const { result } = renderHook(() => useOutfitManagement(props));

      act(() => {
        result.current.setCustomAccessory("帽子");
      });

      act(() => {
        result.current.addAccessory();
      });

      expect(result.current.outfitForm.accessories).toContain("帽子");
      expect(result.current.customAccessory).toBe("");
    });

    it("重复配饰时不应添加", () => {
      const props = buildProps();
      const { result } = renderHook(() => useOutfitManagement(props));

      act(() => {
        result.current.setOutfitForm({ name: "", description: "", clothing: "", accessories: ["帽子"] });
      });

      act(() => {
        result.current.setCustomAccessory("帽子");
      });

      act(() => {
        result.current.addAccessory();
      });

      expect(result.current.outfitForm.accessories).toEqual(["帽子"]);
      expect(result.current.customAccessory).toBe("");
    });

    it("空字符串时不应添加", () => {
      const props = buildProps();
      const { result } = renderHook(() => useOutfitManagement(props));

      act(() => {
        result.current.setCustomAccessory("");
      });

      act(() => {
        result.current.addAccessory();
      });

      expect(result.current.outfitForm.accessories).toEqual([]);
    });
  });

  describe("removeAccessory", () => {
    it("应从 outfitForm 中移除指定配饰", () => {
      const props = buildProps();
      const { result } = renderHook(() => useOutfitManagement(props));

      act(() => {
        result.current.setOutfitForm({ name: "", description: "", clothing: "", accessories: ["帽子", "围巾"] });
      });

      act(() => {
        result.current.removeAccessory("帽子");
      });

      expect(result.current.outfitForm.accessories).toEqual(["围巾"]);
    });

    it("移除不存在的配饰时不应报错", () => {
      const props = buildProps();
      const { result } = renderHook(() => useOutfitManagement(props));

      act(() => {
        result.current.setOutfitForm({ name: "", description: "", clothing: "", accessories: ["帽子"] });
      });

      act(() => {
        result.current.removeAccessory("不存在的配饰");
      });

      expect(result.current.outfitForm.accessories).toEqual(["帽子"]);
    });
  });
});
