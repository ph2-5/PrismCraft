import { describe, it, expect } from "vitest";
import { MIGRATIONS, type MigrationDb } from "../migrations";

/**
 * PR 3 Step 1: migration v8 测试
 *
 * 验证 camera JSON 中的 shotType/angle/movement 被正确复制到 shotInstruction 子字段。
 * 修正历史 bug：旧 shotType 可能是 angle 类（low/high/birdseye/wormseye），
 * 被误认为 size。migration v8 按语义重新分配。
 */

interface BeatRow {
  id: string;
  camera: string | null;
}

function createInMemoryDb(initialRows: BeatRow[]): {
  db: MigrationDb;
  getRows: () => BeatRow[];
  updates: Array<{ id: string; camera: string }>;
} {
  const rows = new Map<string, string | null>(initialRows.map((r) => [r.id, r.camera]));
  const updates: Array<{ id: string; camera: string }> = [];

  return {
    db: {
      prepare(sql: string) {
        return {
          get(..._params: unknown[]) {
            return undefined;
          },
          all(..._params: unknown[]) {
            if (sql.includes("SELECT id, camera FROM story_beats")) {
              return Array.from(rows.entries())
                .filter(([, camera]) => camera !== null)
                .map(([id, camera]) => ({ id, camera }));
            }
            return [];
          },
          run(...params: unknown[]) {
            // UPDATE story_beats SET camera = ? WHERE id = ?
            if (sql.startsWith("UPDATE story_beats")) {
              const newCamera = String(params[0]);
              const id = String(params[1]);
              rows.set(id, newCamera);
              updates.push({ id, camera: newCamera });
            }
            return undefined;
          },
        };
      },
      exec(_sql: string) {
        // no-op for v8 migration
      },
      transaction<T>(fn: () => T): T {
        return fn();
      },
    },
    getRows: () => Array.from(rows.entries()).map(([id, camera]) => ({ id, camera })),
    updates,
  };
}

describe("migration v8: shotInstruction backfill", () => {
  const migrate = MIGRATIONS[8];
  if (!migrate) {
    return;
  }

  it("应把 camera.shotType (size 类) 映射到 shotInstruction.shotSize", () => {
    const initial: BeatRow[] = [
      { id: "b1", camera: JSON.stringify({ shotType: "wide", angle: "eye_level", movement: "static" }) },
    ];
    const { db, updates } = createInMemoryDb(initial);
    migrate(db);

    expect(updates).toHaveLength(1);
    const updated = JSON.parse(updates[0].camera);
    expect(updated.shotInstruction).toEqual({
      shotSize: "wide",
      cameraAngle: "eye_level",
      cameraMovement: "static",
    });
    // 旧字段应保留（PR 3 不删除旧字段，PR 7 才删除）
    expect(updated.shotType).toBe("wide");
    expect(updated.angle).toBe("eye_level");
    expect(updated.movement).toBe("static");
  });

  it("应把 camera.shotType (angle 类) 映射到 shotInstruction.cameraAngle，shotSize 回退 medium", () => {
    // 历史 bug：旧实现把 angle 类 shotType 当成 size，丢失了角度信息
    const initial: BeatRow[] = [
      { id: "b1", camera: JSON.stringify({ shotType: "low" }) },
    ];
    const { db, updates } = createInMemoryDb(initial);
    migrate(db);

    expect(updates).toHaveLength(1);
    const updated = JSON.parse(updates[0].camera);
    expect(updated.shotInstruction).toEqual({
      shotSize: "medium", // angle 类 shotType 无 size 映射，回退默认 medium
      cameraAngle: "low", // angle 类 shotType 被正确映射到 cameraAngle
      cameraMovement: "static",
    });
  });

  it("应映射 birdseye/wormseye 旧拼写到 birds_eye/worms_eye 规范形式", () => {
    const initial: BeatRow[] = [
      { id: "b1", camera: JSON.stringify({ shotType: "birdseye" }) },
      { id: "b2", camera: JSON.stringify({ shotType: "wormseye" }) },
    ];
    const { db, updates } = createInMemoryDb(initial);
    migrate(db);

    expect(updates).toHaveLength(2);
    const b1 = JSON.parse(updates[0].camera);
    const b2 = JSON.parse(updates[1].camera);
    expect(b1.shotInstruction.cameraAngle).toBe("birds_eye");
    expect(b2.shotInstruction.cameraAngle).toBe("worms_eye");
  });

  it("应跳过已有 shotInstruction 的行（避免重复迁移）", () => {
    const existingInstruction = { shotSize: "close", cameraAngle: "high", cameraMovement: "push" };
    const initial: BeatRow[] = [
      { id: "b1", camera: JSON.stringify({ shotType: "wide", shotInstruction: existingInstruction }) },
    ];
    const { db, updates } = createInMemoryDb(initial);
    migrate(db);

    expect(updates).toHaveLength(0); // 跳过，不更新
  });

  it("应跳过 camera JSON 无 shotType/angle/movement 的行", () => {
    const initial: BeatRow[] = [
      { id: "b1", camera: JSON.stringify({ distance: 10, speed: 5 }) },
    ];
    const { db, updates } = createInMemoryDb(initial);
    migrate(db);

    expect(updates).toHaveLength(0); // 无可迁移字段，跳过
  });

  it("应跳过 camera 为 null 的行", () => {
    const initial: BeatRow[] = [
      { id: "b1", camera: null },
    ];
    const { db, updates } = createInMemoryDb(initial);
    migrate(db);

    expect(updates).toHaveLength(0);
  });

  it("应处理无效 JSON（跳过而不抛出）", () => {
    const initial: BeatRow[] = [
      { id: "b1", camera: "not-valid-json" },
    ];
    const { db, updates } = createInMemoryDb(initial);
    expect(() => migrate(db)).not.toThrow();
    expect(updates).toHaveLength(0);
  });

  it("应处理部分行失败（继续迁移剩余行）", () => {
    const initial: BeatRow[] = [
      { id: "b1", camera: JSON.stringify({ shotType: "wide" }) },
      { id: "b2", camera: "invalid-json" },
      { id: "b3", camera: JSON.stringify({ shotType: "close", movement: "pan" }) },
    ];
    const { db, updates } = createInMemoryDb(initial);
    migrate(db);

    expect(updates).toHaveLength(2); // b1 和 b3 成功，b2 跳过
    expect(updates[0].id).toBe("b1");
    expect(updates[1].id).toBe("b3");
  });

  it("应映射 movement 字段（如 push/pull/pan/tracking）", () => {
    const initial: BeatRow[] = [
      { id: "b1", camera: JSON.stringify({ movement: "tracking" }) },
    ];
    const { db, updates } = createInMemoryDb(initial);
    migrate(db);

    expect(updates).toHaveLength(1);
    const updated = JSON.parse(updates[0].camera);
    expect(updated.shotInstruction.cameraMovement).toBe("tracking");
    expect(updated.shotInstruction.shotSize).toBe("medium"); // 默认
    expect(updated.shotInstruction.cameraAngle).toBe("eye_level"); // 默认
  });

  it("应处理空 camera 字符串", () => {
    const initial: BeatRow[] = [
      { id: "b1", camera: "" },
    ];
    const { db, updates } = createInMemoryDb(initial);
    // JSON.parse("") 会抛错，应被 catch 跳过
    expect(() => migrate(db)).not.toThrow();
    expect(updates).toHaveLength(0);
  });

  it("应在 story_beats 表查询失败时优雅降级（不抛出）", () => {
    const failingDb: MigrationDb = {
      prepare(_sql: string) {
        return {
          get() { return undefined; },
          all() { throw new Error("table not found"); },
          run() { return undefined; },
        };
      },
      exec() {},
      transaction<T>(fn: () => T): T { return fn(); },
    };

    expect(() => migrate(failingDb)).not.toThrow();
  });
});
