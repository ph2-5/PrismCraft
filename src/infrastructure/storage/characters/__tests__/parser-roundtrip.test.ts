import { describe, it, expect } from "vitest";
import { parseCharacter } from "../parser";
import { buildInsertFromTargets, buildUpdateSets } from "../../core";
import type { FieldTarget } from "../../core";
import type { Character } from "@/domain/schemas";

const CHARACTER_FIELD_TARGETS: Record<string, FieldTarget> = {
  name: { type: "fixed", column: "name" },
  description: { type: "fixed", column: "description" },
  refImagePath: { type: "fixed", column: "ref_image_path" },
  gender: { type: "fixed", column: "gender" },
  age: { type: "fixed", column: "age" },
  style: { type: "fixed", column: "style" },
  source: { type: "fixed", column: "source" },
  useCount: { type: "fixed", column: "use_count" },
  lastUsedAt: { type: "fixed", column: "last_used_at" },

  avatarPath: { type: "json", container: "appearance", key: "avatarPath" },
  thumbnailPath: { type: "json", container: "appearance", key: "thumbnailPath" },
  previewPath: { type: "json", container: "appearance", key: "previewPath" },
  generatedImage: { type: "json", container: "appearance", key: "generatedImage" },
  generatedVideo: { type: "json", container: "appearance", key: "generatedVideo" },
  videoGenerationStatus: { type: "json", container: "appearance", key: "videoGenerationStatus" },
  videoGenerationTaskId: { type: "json", container: "appearance", key: "videoGenerationTaskId" },
  imageGenerationPrompt: { type: "json", container: "appearance", key: "imageGenerationPrompt" },

  prompt: { type: "json", container: "generation", key: "prompt" },
  generationPrompt: { type: "json", container: "generation", key: "generationPrompt" },
  generationParams: { type: "json", container: "generation", key: "generationParams" },

  personality: { type: "json", container: "config", key: "personality" },
  traits: { type: "json", container: "config", key: "traits" },
  appearance: { type: "json", container: "config", key: "appearance" },

  tags: { type: "json", container: "meta", key: "tags" },
  outfits: { type: "json", container: "meta", key: "outfits" },
};

function serializeToDbRow(character: Partial<Character>): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000);
  const baseColumns = ["id", "owner_id", "created_at", "updated_at"];
  const baseValues = [character.id || "test-char-id", 1, now, now];

  const { sql, params } = buildInsertFromTargets(
    "characters",
    character as Record<string, unknown>,
    CHARACTER_FIELD_TARGETS,
    baseColumns,
    baseValues,
  );

  const row: Record<string, unknown> = {};
  const columnMatch = sql.match(/\(([^)]+)\)\s*VALUES/);
  if (!columnMatch) return row;

  const columns = columnMatch[1]!.split(", ").map((c) => c.replace(/"/g, ""));
  for (let i = 0; i < columns.length; i++) {
    row[columns[i]!] = params[i];
  }

  return row;
}

function buildFullCharacter(): Partial<Character> {
  return {
    id: "char_test_001",
    name: "测试角色",
    description: "一个用于测试的角色",
    gender: "female",
    age: 25,
    style: "anime",
    source: "ai-generated",
    useCount: 5,
    lastUsedAt: new Date(1700000000 * 1000).toISOString(),
    refImagePath: "/path/to/ref.png",
    avatarPath: "/path/to/avatar.png",
    thumbnailPath: "/path/to/thumb.png",
    previewPath: "/path/to/preview.png",
    generatedImage: "/path/to/gen.png",
    generatedVideo: "/path/to/gen.mp4",
    videoGenerationStatus: "completed",
    videoGenerationTaskId: "task_001",
    imageGenerationPrompt: "a beautiful character",
    prompt: "base prompt text",
    generationPrompt: "generation prompt text",
    generationParams: { key: "value", num: 42 },
    personality: ["勇敢", "聪明"],
    traits: ["领导力", "创造力"],
    appearance: {
      hairColor: "黑",
      hairStyle: "短发",
      eyeColor: "棕",
      height: "170",
      build: "中等",
      clothing: "休闲",
    },
    tags: ["主角", "重要"],
  };
}

describe("Character serialization roundtrip", () => {
  it("should preserve all fixed column fields after roundtrip", () => {
    const original = buildFullCharacter();
    const dbRow = serializeToDbRow(original);
    const parsed = parseCharacter(dbRow);

    expect(parsed.name).toBe("测试角色");
    expect(parsed.description).toBe("一个用于测试的角色");
    expect(parsed.gender).toBe("female");
    expect(parsed.age).toBe(25);
    expect(parsed.style).toBe("anime");
    expect(parsed.source).toBe("ai-generated");
    expect(parsed.useCount).toBe(5);
    expect(parsed.refImagePath).toBe("/path/to/ref.png");
  });

  it("should preserve appearance container fields after roundtrip", () => {
    const original = buildFullCharacter();
    const dbRow = serializeToDbRow(original);
    const parsed = parseCharacter(dbRow);

    expect(parsed.avatarPath).toBe("/path/to/avatar.png");
    expect(parsed.thumbnailPath).toBe("/path/to/thumb.png");
    expect(parsed.previewPath).toBe("/path/to/preview.png");
    expect(parsed.generatedImage).toBe("/path/to/gen.png");
    expect(parsed.generatedVideo).toBe("/path/to/gen.mp4");
    expect(parsed.videoGenerationStatus).toBe("completed");
    expect(parsed.videoGenerationTaskId).toBe("task_001");
    expect(parsed.imageGenerationPrompt).toBe("a beautiful character");
  });

  it("should preserve generation container fields after roundtrip", () => {
    const original = buildFullCharacter();
    const dbRow = serializeToDbRow(original);
    const parsed = parseCharacter(dbRow);

    expect(parsed.prompt).toBe("base prompt text");
    expect(parsed.generationPrompt).toBe("generation prompt text");
    expect(parsed.generationParams).toEqual({ key: "value", num: 42 });
  });

  it("should preserve config container fields after roundtrip", () => {
    const original = buildFullCharacter();
    const dbRow = serializeToDbRow(original);
    const parsed = parseCharacter(dbRow);

    expect(parsed.personality).toEqual(["勇敢", "聪明"]);
    expect(parsed.traits).toEqual(["领导力", "创造力"]);
    expect(parsed.appearance).toEqual({
      hairColor: "黑",
      hairStyle: "短发",
      eyeColor: "棕",
      height: "170",
      build: "中等",
      clothing: "休闲",
    });
  });

  it("should preserve meta container fields after roundtrip", () => {
    const original = buildFullCharacter();
    const dbRow = serializeToDbRow(original);
    const parsed = parseCharacter(dbRow);

    expect(parsed.tags).toEqual(["主角", "重要"]);
  });

  it("should not lose required fields for minimal character", () => {
    const minimal: Partial<Character> = { name: "最小角色" };
    const dbRow = serializeToDbRow(minimal);
    const parsed = parseCharacter(dbRow);

    expect(parsed.name).toBe("最小角色");
    expect(parsed.description).toBe("");
    expect(parsed.gender).toBe("unknown");
    expect(parsed.style).toBe("");
    expect(parsed.source).toBe("ai-generated");
    expect(parsed.personality).toEqual([]);
    expect(parsed.appearance).toEqual({
      hairColor: "",
      hairStyle: "",
      eyeColor: "",
      height: "",
      build: "",
      clothing: "",
    });
    expect(parsed.prompt).toBe("");
  });

  it("should normalize videoGenerationStatus 'processing' to 'generating'", () => {
    const original = buildFullCharacter();
    original.videoGenerationStatus = "processing" as Character["videoGenerationStatus"];
    const dbRow = serializeToDbRow(original);
    const parsed = parseCharacter(dbRow);

    expect(parsed.videoGenerationStatus).toBe("generating");
  });

  it("should preserve valid videoGenerationStatus values as-is", () => {
    const validStatuses: Array<Character["videoGenerationStatus"]> = [
      "pending",
      "generating",
      "completed",
      "failed",
    ];

    for (const status of validStatuses) {
      const original = buildFullCharacter();
      original.videoGenerationStatus = status;
      const dbRow = serializeToDbRow(original);
      const parsed = parseCharacter(dbRow);

      expect(parsed.videoGenerationStatus).toBe(status);
    }
  });

  it("should return undefined for invalid videoGenerationStatus", () => {
    const dbRow = serializeToDbRow(buildFullCharacter());
    const appearanceData = dbRow.appearance as Record<string, unknown>;
    dbRow.appearance = JSON.stringify({ ...appearanceData, videoGenerationStatus: "invalid_status" });
    const parsed = parseCharacter(dbRow);

    expect(parsed.videoGenerationStatus).toBeUndefined();
  });

  it("should not throw when optional fields are null", () => {
    const dbRow = serializeToDbRow(buildFullCharacter());
    const appearanceData = dbRow.appearance as Record<string, unknown>;
    dbRow.appearance = JSON.stringify({
      ...appearanceData,
      avatarPath: null,
      generatedImage: null,
    });
    const meta = dbRow.meta as Record<string, unknown>;
    dbRow.meta = JSON.stringify({ ...meta, tags: null });

    const parsed = parseCharacter(dbRow);

    expect(parsed.avatarPath).toBeUndefined();
    expect(parsed.generatedImage).toBeUndefined();
    expect(parsed.tags).toBeUndefined();
  });

  it("should correctly roundtrip generationParams object", () => {
    const original = buildFullCharacter();
    original.generationParams = { key: "value", num: 42, nested: { a: 1 } };
    const dbRow = serializeToDbRow(original);
    const parsed = parseCharacter(dbRow);

    expect(parsed.generationParams).toEqual({ key: "value", num: 42, nested: { a: 1 } });
  });

  it("should correctly roundtrip personality array", () => {
    const original = buildFullCharacter();
    original.personality = ["勇敢", "聪明", "善良"];
    const dbRow = serializeToDbRow(original);
    const parsed = parseCharacter(dbRow);

    expect(parsed.personality).toEqual(["勇敢", "聪明", "善良"]);
  });

  it("should correctly roundtrip appearance nested object", () => {
    const original = buildFullCharacter();
    original.appearance = {
      hairColor: "黑",
      hairStyle: "短发",
      eyeColor: "棕",
      height: "170",
      build: "中等",
      clothing: "休闲",
    };
    const dbRow = serializeToDbRow(original);
    const parsed = parseCharacter(dbRow);

    expect(parsed.appearance).toEqual({
      hairColor: "黑",
      hairStyle: "短发",
      eyeColor: "棕",
      height: "170",
      build: "中等",
      clothing: "休闲",
    });
  });

  it("should convert timestamps from seconds to ISO strings", () => {
    const now = Math.floor(Date.now() / 1000);
    const dbRow = serializeToDbRow(buildFullCharacter());
    dbRow.created_at = now;
    dbRow.updated_at = now;
    dbRow.last_used_at = now;

    const parsed = parseCharacter(dbRow);

    expect(parsed.createdAt).toBe(new Date(now * 1000).toISOString());
    expect(parsed.updatedAt).toBe(new Date(now * 1000).toISOString());
    expect(parsed.lastUsedAt).toBe(new Date(now * 1000).toISOString());
  });

  it("should not include JSON container columns in SET clause when updating only fixed columns", () => {
    const { sql } = buildUpdateSets(
      { name: "新名字" } as Record<string, unknown>,
      CHARACTER_FIELD_TARGETS,
    );

    expect(sql).toContain("name");
    expect(sql).not.toContain("appearance");
    expect(sql).not.toContain("generation");
    expect(sql).not.toContain("config");
    expect(sql).not.toContain("meta");
  });

  it("should use json_set for partial JSON container update", () => {
    const { sql, params } = buildUpdateSets(
      { avatarPath: "/new/avatar.png" } as Record<string, unknown>,
      CHARACTER_FIELD_TARGETS,
    );

    expect(sql).toContain("json_set");
    expect(sql).toContain("appearance");
    expect(sql).toContain("avatarPath");
    expect(params).toContain("/new/avatar.png");
  });
});
