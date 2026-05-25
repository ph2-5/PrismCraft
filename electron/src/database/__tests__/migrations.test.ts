import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runMigrations, CURRENT_SCHEMA_VERSION, MIGRATIONS, type MigrationDb } from "../migrations";

function createMockDb(): MigrationDb {
  return {
    prepare(sql: string) {
      return {
        get(...params: unknown[]) {
          if (sql.includes("schema_version")) {
            return { value: String(params[0] ?? "1") };
          }
          return undefined;
        },
        run(...params: unknown[]) {
          return undefined;
        },
      };
    },
    exec() {},
    transaction<T>(fn: () => T): T {
      return fn();
    },
  };
}

describe("runMigrations", () => {
  const savedMigrations = { ...MIGRATIONS };

  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(MIGRATIONS)) {
      delete MIGRATIONS[Number(key)];
    }
  });

  afterEach(() => {
    for (const key of Object.keys(MIGRATIONS)) {
      delete MIGRATIONS[Number(key)];
    }
    Object.assign(MIGRATIONS, savedMigrations);
  });

  it("should skip when current version equals target version", () => {
    const db = createMockDb();
    const spy = vi.spyOn(db, "transaction");
    runMigrations(db, CURRENT_SCHEMA_VERSION);
    expect(spy).not.toHaveBeenCalled();
  });

  it("should skip when current version exceeds target version", () => {
    const db = createMockDb();
    const spy = vi.spyOn(db, "transaction");
    runMigrations(db, CURRENT_SCHEMA_VERSION + 5);
    expect(spy).not.toHaveBeenCalled();
  });

  it("should skip transaction when no pending migrations exist", () => {
    const db = createMockDb();
    const spy = vi.spyOn(db, "transaction");
    runMigrations(db, 1);
    expect(spy).not.toHaveBeenCalled();
  });

  it("should run pending migrations within a transaction", () => {
    const migrationFn = vi.fn();
    MIGRATIONS[CURRENT_SCHEMA_VERSION] = migrationFn;

    const db = createMockDb();
    const spy = vi.spyOn(db, "transaction");
    runMigrations(db, CURRENT_SCHEMA_VERSION - 1);

    expect(spy).toHaveBeenCalled();
    expect(migrationFn).toHaveBeenCalledWith(db);
  });

  it("should propagate error when a migration fails inside transaction", () => {
    MIGRATIONS[CURRENT_SCHEMA_VERSION] = () => {
      throw new Error("Migration v2 failed");
    };

    const db = createMockDb();
    expect(() => runMigrations(db, CURRENT_SCHEMA_VERSION - 1)).toThrow("Migration v2 failed");
  });

  it("should run multiple migrations in order", () => {
    const order: number[] = [];
    MIGRATIONS[CURRENT_SCHEMA_VERSION - 1] = () => order.push(1);
    MIGRATIONS[CURRENT_SCHEMA_VERSION] = () => order.push(2);

    const db = createMockDb();
    runMigrations(db, CURRENT_SCHEMA_VERSION - 2);

    expect(order).toEqual([1, 2]);
  });
});
