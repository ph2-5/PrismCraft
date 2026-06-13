import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ICharacterStorage } from "@/domain/ports/storage-port";
import { factories } from "@/__tests__/mocks/factories";
import { expectOk, expectErr } from "@/__tests__/utils/result-helpers";

vi.mock("@/infrastructure/di", () => {
  const storage: ICharacterStorage = {
    getCharacters: vi.fn(),
    getCharacterById: vi.fn(),
    createCharacter: vi.fn(),
    updateCharacter: vi.fn(),
    deleteCharacter: vi.fn(),
    incrementCharacterUseCount: vi.fn(),
    getOutfitsForCharacter: vi.fn(),
    saveOutfitsForCharacter: vi.fn(),
    updateOutfitImage: vi.fn(),
    getCharacterVersion: vi.fn().mockResolvedValue(1),
  };
  const eventBus = { emit: vi.fn(), on: vi.fn(), off: vi.fn() };
  return {
    container: { characterStorage: storage, eventBus },
  };
});

import { characterService } from "@/modules/character/services";
import { normalizeGender } from "@/shared/utils/utils";
import { container } from "@/infrastructure/di";

const storage = vi.mocked(container.characterStorage);

const eventBus = vi.mocked(container.eventBus);

describe("characterService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getAll", () => {
    it("应返回所有角色", async () => {
      const chars = [factories.character(), factories.character()];
      storage.getCharacters.mockResolvedValue(chars);

      const result = await characterService.getAll();

      expectOk(result);
      expect(result.value).toHaveLength(2);
    });

    it("存储失败时应返回错误", async () => {
      storage.getCharacters.mockRejectedValue(new Error("DB locked"));

      const result = await characterService.getAll();

      expectErr(result);
    });
  });

  describe("getById", () => {
    it("应返回指定角色", async () => {
      const char = factories.character({ id: "char_1" });
      storage.getCharacterById.mockResolvedValue(char);

      const result = await characterService.getById("char_1");

      expectOk(result);
      expect(result.value.id).toBe("char_1");
    });

    it("角色不存在时应返回 NotFound 错误", async () => {
      storage.getCharacterById.mockResolvedValue(null);

      const result = await characterService.getById("nonexistent");

      expectErr(result);
    });
  });

  describe("create", () => {
    it("应成功创建角色并触发事件", async () => {
      storage.createCharacter.mockResolvedValue(undefined);

      const result = await characterService.create({
        name: "角色A",
        description: "描述",
        gender: "男",
        style: "写实",
        personality: [],
        appearance: { hairColor: "", hairStyle: "", eyeColor: "", height: "", build: "", clothing: "" },
        prompt: "提示词",
      });

      expectOk(result);
      expect(result.value.name).toBe("角色A");
      expect(storage.createCharacter).toHaveBeenCalled();
      expect(eventBus.emit).toHaveBeenCalled();
    });

    it("无效输入时应返回校验错误", async () => {
      const result = await characterService.create({
        name: "",
        description: "描述",
        gender: "男",
        style: "写实",
        personality: [],
        appearance: { hairColor: "", hairStyle: "", eyeColor: "", height: "", build: "", clothing: "" },
        prompt: "提示词",
      });

      expectErr(result);
      expect(storage.createCharacter).not.toHaveBeenCalled();
    });

    it("存储失败时应返回错误", async () => {
      storage.createCharacter.mockRejectedValue(new Error("写入失败"));

      const result = await characterService.create({
        name: "角色A",
        description: "描述",
        gender: "男",
        style: "写实",
        personality: [],
        appearance: { hairColor: "", hairStyle: "", eyeColor: "", height: "", build: "", clothing: "" },
        prompt: "提示词",
      });

      expectErr(result);
    });
  });

  describe("update", () => {
    it("应成功更新角色", async () => {
      const existing = factories.character({ id: "char_1" });
      storage.getCharacterById.mockResolvedValue(existing);
      storage.updateCharacter.mockResolvedValue(undefined);

      const result = await characterService.update("char_1", { id: "char_1", name: "新名称" });

      expectOk(result);
      expect(storage.updateCharacter).toHaveBeenCalledWith("char_1", expect.objectContaining({ name: "新名称" }), 1);
    });

    it("角色不存在时应返回 NotFound 错误", async () => {
      storage.getCharacterById.mockResolvedValue(null);

      const result = await characterService.update("nonexistent", { id: "nonexistent", name: "新名称" });

      expectErr(result);
      expect(storage.updateCharacter).not.toHaveBeenCalled();
    });
  });

  describe("delete", () => {
    it("应成功删除角色", async () => {
      const existing = factories.character({ id: "char_1" });
      storage.getCharacterById.mockResolvedValue(existing);
      storage.deleteCharacter.mockResolvedValue(undefined);

      const result = await characterService.delete("char_1");

      expectOk(result);
      expect(storage.deleteCharacter).toHaveBeenCalledWith("char_1");
      expect(eventBus.emit).toHaveBeenCalled();
    });

    it("角色不存在时应返回 NotFound 错误", async () => {
      storage.getCharacterById.mockResolvedValue(null);

      const result = await characterService.delete("nonexistent");

      expectErr(result);
      expect(storage.deleteCharacter).not.toHaveBeenCalled();
    });
  });

  describe("count", () => {
    it("应返回角色数量", async () => {
      storage.getCharacters.mockResolvedValue([factories.character(), factories.character()]);

      const result = await characterService.count();

      expectOk(result);
      expect(result.value).toBe(2);
    });
  });

  describe("normalizeGender", () => {
    it("should map 男性 → male", () => {
      expect(normalizeGender("男性")).toBe("male");
    });

    it("should map 女性 → female", () => {
      expect(normalizeGender("女性")).toBe("female");
    });

    it("should map 男 → male", () => {
      expect(normalizeGender("男")).toBe("male");
    });

    it("should map 女 → female", () => {
      expect(normalizeGender("女")).toBe("female");
    });

    it("should map 中性/无性别/双性/其他 → other", () => {
      expect(normalizeGender("中性")).toBe("other");
      expect(normalizeGender("无性别")).toBe("other");
      expect(normalizeGender("双性")).toBe("other");
      expect(normalizeGender("其他")).toBe("other");
    });

    it("should pass through male/female/other/unknown as-is", () => {
      expect(normalizeGender("male")).toBe("male");
      expect(normalizeGender("female")).toBe("female");
      expect(normalizeGender("other")).toBe("other");
      expect(normalizeGender("unknown")).toBe("unknown");
    });

    it("should map any unknown value → unknown", () => {
      expect(normalizeGender("外星人")).toBe("unknown");
    });

    it("should map null → unknown", () => {
      expect(normalizeGender(null)).toBe("unknown");
    });

    it("should map undefined → unknown", () => {
      expect(normalizeGender(undefined)).toBe("unknown");
    });
  });
});
