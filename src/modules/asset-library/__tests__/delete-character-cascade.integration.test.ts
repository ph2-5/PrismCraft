import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Character, Story, StoryBeat } from "@/domain/schemas";
import type { Result } from "@/domain/types/result";
import type { InMemoryDatabase } from "@/__tests__/mocks/in-memory-db";

// ───────────────────────────────────────────────────────────────────────────
// Hoisted test state: referenced by vi.mock factories (which are hoisted
// above imports). Mutated in beforeEach to drive each scenario.
// ───────────────────────────────────────────────────────────────────────────
const { testState } = vi.hoisted(() => ({
  testState: {
    characters: [] as Character[],
    stories: [] as Story[],
    confirmValue: true,
    storyUpdateResult: { ok: true, value: undefined } as Result<void>,
  },
}));

// ───────────────────────────────────────────────────────────────────────────
// Route safeQuery/safeRun/safeTransaction to the shared InMemoryDatabase.
// getTestDatabase() is resolved at call-time so beforeEach can reset it.
// ───────────────────────────────────────────────────────────────────────────
vi.mock("@/infrastructure/storage/sqlite-core", async () => {
  const { getTestDatabase } = await import("@/__tests__/mocks/in-memory-db");
  return {
    safeQuery: vi.fn((sql: string, params: unknown[] = []) =>
      Promise.resolve(getTestDatabase().query(sql, params)),
    ),
    safeRun: vi.fn((sql: string, params: unknown[] = []) =>
      Promise.resolve(getTestDatabase().run(sql, params)),
    ),
    safeTransaction: vi.fn(
      (statements: { sql: string; params: unknown[] }[]) =>
        Promise.resolve(getTestDatabase().transaction(statements)),
    ),
    withRetry: vi.fn(<T>(fn: () => Promise<T>) => fn()),
  };
});

// ───────────────────────────────────────────────────────────────────────────
// DI container: real characterStorage (uses mocked sqlite-core → InMemoryDB)
// plus a mock eventBus. characterService.delete thus exercises the real
// storage transaction path.
// ───────────────────────────────────────────────────────────────────────────
vi.mock("@/infrastructure/di", async () => {
  const { characterStorage } = await import("@/infrastructure/storage/characters");
  return {
    container: {
      characterStorage,
      eventBus: { emit: vi.fn(), on: vi.fn(), off: vi.fn() },
    },
    resolve: vi.fn(),
  };
});

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/shared/utils/confirm", () => ({
  confirm: vi.fn(() => Promise.resolve(testState.confirmValue)),
}));

vi.mock("@/shared/presentation/Toast", () => ({
  useToastHelpers: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }),
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: {
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
  },
  extractErrorMessage: vi.fn((e: unknown) =>
    e instanceof Error ? e.message : String(e),
  ),
}));

vi.mock("@/shared/utils/user-facing-error", () => ({
  mapUserFacingError: vi.fn((e: unknown) =>
    e instanceof Error ? e.message : String(e),
  ),
}));

vi.mock("@/shared/constants/messages", () => ({
  t: vi.fn((key: string) => key),
}));

// Keep checkCharacterReferences/checkSceneReferences real (pure functions)
// without loading the heavy generation services from the domain barrel.
vi.mock("@/domain/services", async () => {
  const refCheck = await import("@/domain/services/reference-check");
  return {
    checkCharacterReferences: refCheck.checkCharacterReferences,
    checkSceneReferences: refCheck.checkSceneReferences,
    checkElementReferences: refCheck.checkElementReferences,
    StoryGenerationService: {},
    BeatWorkflowService: {},
    resolveCharacterRef: vi.fn(),
    resolveCharacterRefs: vi.fn(),
    resolveSceneRef: vi.fn(),
  };
});

// Real characterService (so delete → container.characterStorage.deleteCharacter
// runs against the InMemoryDB) + mocked useCharacters hook.
vi.mock("@/modules/character", async () => {
  const { characterService } = await import("@/modules/character/services");
  return {
    characterService,
    useCharacters: vi.fn(() => ({ data: testState.characters })),
  };
});

vi.mock("@/modules/scene", () => ({
  sceneService: {
    delete: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
  },
  useScenes: vi.fn(() => ({ data: [] })),
}));

vi.mock("@/modules/asset", () => ({
  storyboardAssetService: { remove: vi.fn().mockResolvedValue(undefined) },
}));

// Mocked useStories (controlled data) + mocked storyService.update (verify call).
vi.mock("@/modules/storyboard", () => ({
  useStories: vi.fn(() => ({ data: testState.stories })),
  storyService: {
    update: vi.fn(() => Promise.resolve(testState.storyUpdateResult)),
  },
}));

// ───────────────────────────────────────────────────────────────────────────
// Imports (after mocks are registered)
// ───────────────────────────────────────────────────────────────────────────
import { useAssetDeleteHandlers } from "../use-asset-delete-handlers";
import { checkCharacterReferences } from "@/domain/services";
import { confirm } from "@/shared/utils/confirm";
import { storyService } from "@/modules/storyboard";
import {
  getTestDatabase,
  resetTestDatabase,
} from "@/__tests__/mocks/in-memory-db";

const mockedConfirm = vi.mocked(confirm);
const mockedStoryUpdate = vi.mocked(storyService.update);

// ───────────────────────────────────────────────────────────────────────────
// DB seed helpers (operate directly on the InMemoryDB)
// ───────────────────────────────────────────────────────────────────────────
function seedCharacter(db: InMemoryDatabase, id: string, name: string) {
  db.run("INSERT INTO characters (id, name) VALUES (?, ?)", [id, name]);
}

function seedStory(db: InMemoryDatabase, id: string, title: string) {
  db.run("INSERT INTO stories (id, title) VALUES (?, ?)", [id, title]);
}

function seedBeat(
  db: InMemoryDatabase,
  beatId: string,
  storyId: string,
  characterIds: string[],
  sequence = 0,
) {
  db.run(
    "INSERT INTO story_beats (id, story_id, sequence, character_ids_json) VALUES (?, ?, ?, ?)",
    [beatId, storyId, sequence, JSON.stringify(characterIds)],
  );
}

function seedStoryCharacter(
  db: InMemoryDatabase,
  storyId: string,
  characterId: string,
) {
  db.run(
    "INSERT INTO story_characters (story_id, character_id) VALUES (?, ?)",
    [storyId, characterId],
  );
}

// ───────────────────────────────────────────────────────────────────────────
// JS-level object builders (for the useStories/useCharacters mocks)
// ───────────────────────────────────────────────────────────────────────────
function buildCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: "char_1",
    name: "主角",
    description: "",
    gender: "male",
    age: 25,
    style: "写实",
    source: "ai-generated",
    personality: [],
    appearance: {
      hairColor: "",
      hairStyle: "",
      eyeColor: "",
      height: "",
      build: "",
      clothing: "",
    },
    outfits: [],
    prompt: "",
    traits: [],
    tags: [],
    useCount: 0,
    ...overrides,
  } as Character;
}

function buildBeat(overrides: Partial<StoryBeat> = {}): StoryBeat {
  return {
    id: "beat_1",
    sequence: 0,
    description: "开场分镜",
    characterIds: ["char_1"],
    ...overrides,
  } as StoryBeat;
}

function buildStory(overrides: Partial<Story> = {}): Story {
  return {
    id: "story_1",
    title: "测试故事",
    description: "",
    characters: ["char_1"],
    scenes: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    beats: [buildBeat()],
    elementIds: [],
    status: "in_progress",
    ...overrides,
  } as Story;
}

// ───────────────────────────────────────────────────────────────────────────
// Helpers to render the hook and invoke handleDeleteCharacter
// ───────────────────────────────────────────────────────────────────────────
async function runDeleteCharacter(id: string) {
  const { result } = renderHook(() =>
    useAssetDeleteHandlers({ loadSecondaryData: vi.fn() }),
  );
  await act(async () => {
    await result.current.handleDeleteCharacter(id);
  });
}

describe("delete-character-cascade integration", () => {
  let db: InMemoryDatabase;

  beforeEach(() => {
    resetTestDatabase();
    db = getTestDatabase();
    testState.characters = [];
    testState.stories = [];
    testState.confirmValue = true;
    testState.storyUpdateResult = { ok: true, value: undefined };
    // clearAllMocks (setup) only clears call history; re-assert the impl once
    // to be resilient against any restoreAllMocks interactions.
    mockedStoryUpdate.mockImplementation(() =>
      Promise.resolve(testState.storyUpdateResult),
    );
    mockedConfirm.mockImplementation(() => Promise.resolve(testState.confirmValue));
  });

  // ── Case 1: 无引用删除 ────────────────────────────────────────────────
  it("角色无 story 引用时删除成功且不调用 storyService.update", async () => {
    seedCharacter(db, "char_1", "主角");
    testState.characters = [buildCharacter({ id: "char_1", name: "主角" })];
    testState.stories = []; // 无引用

    await runDeleteCharacter("char_1");

    expect(mockedConfirm).toHaveBeenCalled();
    // DB 中角色已不存在
    const rows = db.query("SELECT id FROM characters WHERE id = ?", ["char_1"]);
    expect(rows).toHaveLength(0);
    // 无 story 需要更新
    expect(mockedStoryUpdate).not.toHaveBeenCalled();
  });

  // ── Case 2: 有引用阻止删除 ────────────────────────────────────────────
  it("角色被 story.beats 引用时 checkCharacterReferences 返回 canDelete:false 且用户取消后不删除", async () => {
    seedCharacter(db, "char_1", "主角");
    const story = buildStory({
      characters: ["char_1"],
      beats: [buildBeat({ id: "beat_1", characterIds: ["char_1"] })],
    });
    testState.characters = [buildCharacter({ id: "char_1", name: "主角" })];
    testState.stories = [story];
    testState.confirmValue = false; // 用户取消

    // 纯函数：引用检查
    const checkResult = checkCharacterReferences("char_1", "主角", [story]);
    expect(checkResult.canDelete).toBe(false);
    expect(checkResult.references.length).toBeGreaterThan(0);
    expect(checkResult.warningMessage).toContain("主角");

    await runDeleteCharacter("char_1");

    // 用户取消 → 未删除
    const rows = db.query("SELECT id FROM characters WHERE id = ?", ["char_1"]);
    expect(rows).toHaveLength(1);
    expect(mockedStoryUpdate).not.toHaveBeenCalled();
  });

  // ── Case 3: 有引用但用户确认 ──────────────────────────────────────────
  it("用户确认后删除角色并调用 storyService.update 清理引用", async () => {
    seedCharacter(db, "char_1", "主角");
    seedStory(db, "story_1", "测试故事");
    seedBeat(db, "beat_1", "story_1", ["char_1"]);

    const story = buildStory({
      id: "story_1",
      characters: ["char_1"],
      beats: [buildBeat({ id: "beat_1", characterIds: ["char_1"] })],
    });
    testState.characters = [buildCharacter({ id: "char_1", name: "主角" })];
    testState.stories = [story];
    testState.confirmValue = true;

    await runDeleteCharacter("char_1");

    // characterService.delete 执行 → DB 中角色不存在
    const rows = db.query("SELECT id FROM characters WHERE id = ?", ["char_1"]);
    expect(rows).toHaveLength(0);

    // updateStoriesAfterEntityDelete → storyService.update 被调用
    expect(mockedStoryUpdate).toHaveBeenCalledTimes(1);
    const [storyId, updatedStory] = mockedStoryUpdate.mock.calls[0] as [
      string,
      Story,
    ];
    expect(storyId).toBe("story_1");
    // 级联清理：characters 与 beats[].characterIds 不再包含 char_1
    expect(updatedStory.characters).not.toContain("char_1");
    expect(updatedStory.beats[0]!.characterIds).not.toContain("char_1");
  });

  // ── Case 4: 级联清理（DB + JS 双层）──────────────────────────────────
  it("删除角色后 story_beats.character_ids_json 与 story_characters 中该 ID 被移除", async () => {
    seedCharacter(db, "char_1", "主角");
    seedStory(db, "story_1", "测试故事");
    // beat 同时引用 char_1 与 char_2，删除 char_1 后应保留 char_2
    seedBeat(db, "beat_1", "story_1", ["char_1", "char_2"]);
    seedStoryCharacter(db, "story_1", "char_1");

    const story = buildStory({
      id: "story_1",
      characters: ["char_1"],
      beats: [buildBeat({ id: "beat_1", characterIds: ["char_1", "char_2"] })],
    });
    testState.characters = [buildCharacter({ id: "char_1", name: "主角" })];
    testState.stories = [story];
    testState.confirmValue = true;

    await runDeleteCharacter("char_1");

    // DB 层：story_beats.character_ids_json 不再包含 char_1，保留 char_2
    const beats = db.query(
      "SELECT character_ids_json FROM story_beats WHERE id = ?",
      ["beat_1"],
    );
    expect(beats).toHaveLength(1);
    const beatsRow = beats[0] as { character_ids_json: string | null };
    const remaining = JSON.parse(beatsRow.character_ids_json || "[]") as string[];
    expect(remaining).not.toContain("char_1");
    expect(remaining).toContain("char_2");

    // DB 层：story_characters 中该角色关联已删除
    const sc = db.query(
      "SELECT * FROM story_characters WHERE character_id = ?",
      ["char_1"],
    );
    expect(sc).toHaveLength(0);

    // JS 层：传给 storyService.update 的 story 已清理 char_1
    expect(mockedStoryUpdate).toHaveBeenCalledTimes(1);
    const [, updatedStory] = mockedStoryUpdate.mock.calls[0] as [string, Story];
    expect(updatedStory.characters).not.toContain("char_1");
    expect(updatedStory.beats[0]!.characterIds).not.toContain("char_1");
    expect(updatedStory.beats[0]!.characterIds).toContain("char_2");
  });

  // ── Case 5: 事务性（Storage 单事务删除多表）──────────────────────────
  it("Storage 删除是事务性的：story_characters/asset_tags/character_outfits/media_assets/collection_assets/characters 同事务清理", async () => {
    seedCharacter(db, "char_1", "主角");
    seedStory(db, "story_1", "测试故事");
    seedBeat(db, "beat_1", "story_1", ["char_1"]);
    seedStoryCharacter(db, "story_1", "char_1");
    db.run(
      "INSERT INTO asset_tags (asset_id, asset_type, tag) VALUES (?, ?, ?)",
      ["char_1", "character", "主角"],
    );
    db.run(
      "INSERT INTO character_outfits (id, character_id, name) VALUES (?, ?, ?)",
      ["outfit_1", "char_1", "默认服装"],
    );
    db.run(
      "INSERT INTO media_assets (id, name, bound_to_type, bound_to_id, bound_to_name) VALUES (?, ?, ?, ?, ?)",
      ["media_1", "角色图", "character", "char_1", "主角"],
    );
    db.run(
      "INSERT INTO collections (id, name) VALUES (?, ?)",
      ["col_1", "收藏夹"],
    );
    db.run(
      "INSERT INTO collection_assets (collection_id, asset_type, asset_id) VALUES (?, ?, ?)",
      ["col_1", "character", "char_1"],
    );

    testState.characters = [buildCharacter({ id: "char_1", name: "主角" })];
    testState.stories = [];
    testState.confirmValue = true;

    await runDeleteCharacter("char_1");

    // characters 已删除
    expect(
      db.query("SELECT id FROM characters WHERE id = ?", ["char_1"]),
    ).toHaveLength(0);
    // story_characters 已清理
    expect(
      db.query(
        "SELECT * FROM story_characters WHERE character_id = ?",
        ["char_1"],
      ),
    ).toHaveLength(0);
    // asset_tags 已清理
    expect(
      db.query(
        "SELECT * FROM asset_tags WHERE asset_id = ? AND asset_type = ?",
        ["char_1", "character"],
      ),
    ).toHaveLength(0);
    // character_outfits 已清理
    expect(
      db.query(
        "SELECT * FROM character_outfits WHERE character_id = ?",
        ["char_1"],
      ),
    ).toHaveLength(0);
    // collection_assets 已清理
    expect(
      db.query(
        "SELECT * FROM collection_assets WHERE asset_id = ? AND asset_type = ?",
        ["char_1", "character"],
      ),
    ).toHaveLength(0);
    // media_assets：解绑（bound_to_* 置空），记录仍存在
    const media = db.query(
      "SELECT bound_to_type, bound_to_id, bound_to_name FROM media_assets WHERE id = ?",
      ["media_1"],
    );
    expect(media).toHaveLength(1);
    const mediaRow = media[0] as {
      bound_to_type: string | null;
      bound_to_id: string | null;
      bound_to_name: string | null;
    };
    expect(mediaRow.bound_to_type).toBeNull();
    expect(mediaRow.bound_to_id).toBeNull();
    expect(mediaRow.bound_to_name).toBeNull();
  });
});
