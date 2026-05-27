import fs from "fs";
import path from "path";
import BetterSqlite3 from "better-sqlite3";
import { app } from "electron";
import { getLogger } from "./logging/logger";
import type { DatabaseResult, QueryParams, RunResult, Statement, DatabaseAdapter } from "./types/database";

const logger = getLogger("db-interface");

interface DbOptions {
  filePath?: string;
  performance?: boolean;
}

export class DatabaseInterface {
  db: unknown;
  type: string | null = null;
  filePath?: string;

  init(_options: DbOptions = {}): this | Promise<this> {
    throw new Error("init() must be implemented by subclass");
  }

  exec(_sql: string): void {
    throw new Error("exec() must be implemented by subclass");
  }

  prepare(_sql: string): Statement {
    throw new Error("prepare() must be implemented by subclass");
  }

  transaction(_fn: () => unknown): unknown {
    throw new Error("transaction() must be implemented by subclass");
  }

  close(): void {
    throw new Error("close() must be implemented by subclass");
  }

  pragma(_name: string, _value?: unknown): unknown {
    throw new Error("pragma() must be implemented by subclass");
  }

  checkpoint(): void {
    throw new Error("checkpoint() must be implemented by subclass");
  }

  backup(_destination: string): unknown {
    throw new Error("backup() must be implemented by subclass");
  }

  isOpen(): boolean {
    return this.db !== null;
  }
}

export class BetterSqlite3Database extends DatabaseInterface {
  declare db: import("better-sqlite3").Database | null;

  override init(options: DbOptions = {}): this {
    let nativeBindingPath: string | null = null;

    try {
      const nodeFileSearchPaths = [
        path.join(
          process.resourcesPath,
          "app.asar.unpacked",
          "node_modules",
          "better-sqlite3",
          "build",
          "Release",
          "better_sqlite3.node",
        ),
        path.join(
          process.resourcesPath,
          "app",
          "node_modules",
          "better-sqlite3",
          "build",
          "Release",
          "better_sqlite3.node",
        ),
        path.join(
          app.getAppPath(),
          "node_modules",
          "better-sqlite3",
          "build",
          "Release",
          "better_sqlite3.node",
        ),
      ];

      for (const p of nodeFileSearchPaths) {
        if (fs.existsSync(p)) {
          nativeBindingPath = p;
          logger.info("[DB] Found native binding at:", { path: p });
          break;
        }
      }
    } catch (e) {
      logger.warn("[DB] Failed to locate native binding:", { error: (e as Error).message });
    }

    const dbOptions: Record<string, unknown> = {};
    if (nativeBindingPath) {
      dbOptions.nativeBinding = nativeBindingPath;
    }
    if (options.performance !== false) {
      dbOptions.timeout = 10000;
    }

    logger.info("[DB] Opening database at:", { path: options.filePath || ":memory:" });
    if (options.filePath) {
      this.db = new BetterSqlite3(options.filePath, dbOptions);
    } else {
      this.db = new BetterSqlite3(":memory:", dbOptions);
    }
    logger.info("[DB] Database opened successfully");

    this.type = "better-sqlite3";
    this.filePath = options.filePath;

    if (options.performance !== false) {
      try {
        (this.db as import("better-sqlite3").Database).pragma("journal_mode = WAL");
        logger.info("[DB] WAL mode enabled");
      } catch (walError) {
        logger.warn("[DB] WAL mode failed, using DELETE mode:", { error: (walError as Error).message });
        try {
          (this.db as import("better-sqlite3").Database).pragma("journal_mode = DELETE");
        } catch (e) { logger.warn("数据库操作失败", { error: e instanceof Error ? e.message : String(e) }); }
      }
      try {
        (this.db as import("better-sqlite3").Database).pragma("synchronous = NORMAL");
      } catch (e) { logger.warn("数据库操作失败", { error: e instanceof Error ? e.message : String(e) }); }
      try {
        (this.db as import("better-sqlite3").Database).pragma("cache_size = -64000");
      } catch (e) { logger.warn("数据库操作失败", { error: e instanceof Error ? e.message : String(e) }); }
      try {
        (this.db as import("better-sqlite3").Database).pragma("temp_store = memory");
      } catch (e) { logger.warn("数据库操作失败", { error: e instanceof Error ? e.message : String(e) }); }
      try {
        (this.db as import("better-sqlite3").Database).pragma("mmap_size = 268435456");
      } catch (e) { logger.warn("数据库操作失败", { error: e instanceof Error ? e.message : String(e) }); }
    }

    return this;
  }

  override exec(sql: string): void {
    if (!this.db) throw new Error("Database not initialized");
    (this.db as import("better-sqlite3").Database).exec(sql);
  }

  override prepare(sql: string): BetterSqlite3Statement {
    if (!this.db) throw new Error("Database not initialized");
    return new BetterSqlite3Statement(this.db as import("better-sqlite3").Database, sql);
  }

  override transaction(fn: () => unknown): unknown {
    if (!this.db) throw new Error("Database not initialized");
    const t = (this.db as import("better-sqlite3").Database).transaction(fn);
    return t();
  }

  override close(): void {
    if (this.db) {
      (this.db as import("better-sqlite3").Database).close();
      this.db = null;
    }
  }

  override pragma(name: string, value?: unknown): unknown {
    if (!this.db) throw new Error("Database not initialized");
    if (value !== undefined) {
      return (this.db as import("better-sqlite3").Database).pragma(`${name} = ${value}`);
    }
    return (this.db as import("better-sqlite3").Database).pragma(name);
  }

  backup(destination: string): unknown {
    if (!this.db) throw new Error("Database not initialized");
    return (this.db as import("better-sqlite3").Database).backup(destination);
  }

  checkpoint(): unknown {
    if (!this.db) throw new Error("Database not initialized");
    return (this.db as import("better-sqlite3").Database).pragma("wal_checkpoint(TRUNCATE)");
  }
}

export class BetterSqlite3Statement implements Statement {
  private stmt: import("better-sqlite3").Statement;
  private sql: string;

  constructor(db: import("better-sqlite3").Database, sql: string) {
    this.stmt = db.prepare(sql);
    this.sql = sql;
  }

  run(...params: QueryParams): RunResult {
    try {
      const result = this.stmt.run(...params);
      return {
        changes: result.changes,
        lastInsertRowid: result.lastInsertRowid,
      };
    } catch (error) {
      throw new Error(
        `SQL execution failed: ${(error as Error).message}\nSQL: ${this.sql}\nParams: ${JSON.stringify(params)}`,
      );
    }
  }

  get(...params: QueryParams): DatabaseResult | undefined {
    try {
      return this.stmt.get(...params) as DatabaseResult | undefined;
    } catch (error) {
      throw new Error(
        `SQL query failed: ${(error as Error).message}\nSQL: ${this.sql}\nParams: ${JSON.stringify(params)}`,
      );
    }
  }

  all(...params: QueryParams): DatabaseResult[] {
    try {
      return this.stmt.all(...params) as DatabaseResult[];
    } catch (error) {
      throw new Error(
        `SQL query failed: ${(error as Error).message}\nSQL: ${this.sql}\nParams: ${JSON.stringify(params)}`,
      );
    }
  }
}

export function createDatabase(_type: string, _options: DbOptions = {}): DatabaseInterface {
  return createOptimalDatabase(_options);
}

export function createOptimalDatabase(_options: DbOptions = {}): DatabaseInterface {
  let nativeBindingPath: string | null = null;
  const nodeFileSearchPaths = [
    path.join(
      process.resourcesPath,
      "app.asar.unpacked",
      "node_modules",
      "better-sqlite3",
      "build",
      "Release",
      "better_sqlite3.node",
    ),
    path.join(
      process.resourcesPath,
      "app",
      "node_modules",
      "better-sqlite3",
      "build",
      "Release",
      "better_sqlite3.node",
    ),
    path.join(
      app.getAppPath(),
      "node_modules",
      "better-sqlite3",
      "build",
      "Release",
      "better_sqlite3.node",
    ),
  ];

  for (const p of nodeFileSearchPaths) {
    if (fs.existsSync(p)) {
      nativeBindingPath = p;
      logger.info("[DB] Found native binding at:", { path: p });
      break;
    }
  }

  logger.info("[DB] Using better-sqlite3 for optimal performance");
  if (nativeBindingPath) {
    logger.info("[DB] Native binding path:", { path: nativeBindingPath });
  }
  return new BetterSqlite3Database();
}
