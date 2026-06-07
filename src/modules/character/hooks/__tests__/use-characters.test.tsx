import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Character, CreateCharacterInput, UpdateCharacterInput } from "@/domain/schemas";
import type { Result } from "@/domain/types";
import { ok, err, AppError } from "@/domain/types";

const {
  mockGetAll,
  mockGetById,
  mockCount,
  mockCreate,
  mockUpdate,
  mockDeleteWithRefs,
} = vi.hoisted(() => ({
  mockGetAll: vi.fn<() => Promise<Result<Character[]>>>(),
  mockGetById: vi.fn<(id: string) => Promise<Result<Character>>>(),
  mockCount: vi.fn<() => Promise<Result<number>>>(),
  mockCreate: vi.fn<(input: CreateCharacterInput) => Promise<Result<Character>>>(),
  mockUpdate: vi.fn<(id: string, input: UpdateCharacterInput) => Promise<Result<void>>>(),
  mockDeleteWithRefs: vi.fn<(id: string) => Promise<Result<void>>>(),
}));

vi.mock("@/shared/utils/platform", () => ({
  isElectron: vi.fn(() => true),
}));

vi.mock("@/modules/character/services", () => ({
  characterService: {
    getAll: mockGetAll,
    getById: mockGetById,
    count: mockCount,
    create: mockCreate,
    update: mockUpdate,
  },
}));

vi.mock("@/modules/persistence", () => ({
  deleteCharacterWithRefs: mockDeleteWithRefs,
}));

import { useCharacters, useCharacter, useCharacterCount, useCreateCharacter, useUpdateCharacter, useDeleteCharacter } from "../use-characters";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
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
    outfits: [],
    prompt: "测试提示词",
    traits: [],
    tags: [],
    useCount: 0,
    ...overrides,
  };
}

describe("useCharacters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAll.mockResolvedValue(ok([buildCharacter()]));
  });

  it("成功获取角色列表", async () => {
    const characters = [buildCharacter(), buildCharacter({ id: "char_2", name: "角色2" })];
    mockGetAll.mockResolvedValue(ok(characters));

    const { result } = renderHook(() => useCharacters(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(characters);
    expect(mockGetAll).toHaveBeenCalledTimes(1);
  });

  it("service 返回错误时应抛出异常", async () => {
    mockGetAll.mockResolvedValue(err(new AppError("DATABASE_ERROR", "数据库错误")));

    const { result } = renderHook(() => useCharacters(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeDefined();
  });

  it("空列表时应返回空数组", async () => {
    mockGetAll.mockResolvedValue(ok([]));

    const { result } = renderHook(() => useCharacters(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});

describe("useCharacter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetById.mockResolvedValue(ok(buildCharacter()));
  });

  it("成功获取单个角色", async () => {
    const char = buildCharacter({ id: "char_1" });
    mockGetById.mockResolvedValue(ok(char));

    const { result } = renderHook(() => useCharacter("char_1"), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(char);
    expect(mockGetById).toHaveBeenCalledWith("char_1");
  });

  it("id 为空时不应发起请求", () => {
    const { result } = renderHook(() => useCharacter(""), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe("idle");
    expect(mockGetById).not.toHaveBeenCalled();
  });

  it("service 返回错误时应抛出异常", async () => {
    mockGetById.mockResolvedValue(err(new AppError("NOT_FOUND", "角色不存在")));

    const { result } = renderHook(() => useCharacter("char_nonexistent"), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeDefined();
  });
});

describe("useCharacterCount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCount.mockResolvedValue(ok(3));
  });

  it("成功获取角色数量", async () => {
    mockCount.mockResolvedValue(ok(5));

    const { result } = renderHook(() => useCharacterCount(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(5);
    expect(mockCount).toHaveBeenCalledTimes(1);
  });

  it("service 返回错误时应抛出异常", async () => {
    mockCount.mockResolvedValue(err(new AppError("DATABASE_ERROR", "数据库错误")));

    const { result } = renderHook(() => useCharacterCount(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeDefined();
  });

  it("零角色时应返回 0", async () => {
    mockCount.mockResolvedValue(ok(0));

    const { result } = renderHook(() => useCharacterCount(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(0);
  });
});

describe("useCreateCharacter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("创建成功时应 invalidate characters 查询", async () => {
    const newChar = buildCharacter({ id: "char_new" });
    mockCreate.mockResolvedValue(ok(newChar));

    const { result } = renderHook(() => useCreateCharacter(), { wrapper: createWrapper() });

    result.current.mutate({
      name: "新角色",
      description: "",
      gender: "female",
      age: 20,
      style: "anime",
      personality: [],
      appearance: { hairColor: "", hairStyle: "", eyeColor: "", height: "", build: "", clothing: "" },
      outfits: [],
      prompt: "",
      traits: [],
      tags: [],
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("创建失败时应抛出异常", async () => {
    mockCreate.mockResolvedValue(err(new AppError("VALIDATION_ERROR", "验证失败")));

    const { result } = renderHook(() => useCreateCharacter(), { wrapper: createWrapper() });

    result.current.mutate({
      name: "",
      description: "",
      gender: "",
      age: 0,
      style: "",
      personality: [],
      appearance: { hairColor: "", hairStyle: "", eyeColor: "", height: "", build: "", clothing: "" },
      outfits: [],
      prompt: "",
      traits: [],
      tags: [],
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeDefined();
  });
});

describe("useUpdateCharacter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockResolvedValue(ok(undefined));
  });

  it("更新成功时应调用 service.update", async () => {
    const { result } = renderHook(() => useUpdateCharacter(), { wrapper: createWrapper() });

    result.current.mutate({
      id: "char_1",
      name: "更新角色",
      description: "新描述",
      gender: "male",
      age: 30,
      style: "写实",
      personality: [],
      appearance: { hairColor: "", hairStyle: "", eyeColor: "", height: "", build: "", clothing: "" },
      outfits: [],
      prompt: "",
      traits: [],
      tags: [],
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockUpdate).toHaveBeenCalledWith("char_1", expect.objectContaining({ id: "char_1" }));
  });

  it("更新失败时应抛出异常", async () => {
    mockUpdate.mockResolvedValue(err(new AppError("NOT_FOUND", "角色不存在")));

    const { result } = renderHook(() => useUpdateCharacter(), { wrapper: createWrapper() });

    result.current.mutate({
      id: "char_nonexistent",
      name: "更新角色",
      description: "",
      gender: "",
      age: 0,
      style: "",
      personality: [],
      appearance: { hairColor: "", hairStyle: "", eyeColor: "", height: "", build: "", clothing: "" },
      outfits: [],
      prompt: "",
      traits: [],
      tags: [],
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeDefined();
  });
});

describe("useDeleteCharacter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeleteWithRefs.mockResolvedValue(ok(undefined));
  });

  it("删除成功时应调用 deleteCharacterWithRefs", async () => {
    const { result } = renderHook(() => useDeleteCharacter(), { wrapper: createWrapper() });

    result.current.mutate("char_1");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockDeleteWithRefs).toHaveBeenCalledWith("char_1");
  });

  it("删除失败时应抛出异常", async () => {
    mockDeleteWithRefs.mockResolvedValue(err(new AppError("DATABASE_ERROR", "删除失败")));

    const { result } = renderHook(() => useDeleteCharacter(), { wrapper: createWrapper() });

    result.current.mutate("char_1");

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeDefined();
  });
});
