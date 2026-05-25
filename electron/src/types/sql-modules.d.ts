declare module "better-sqlite3" {
  class Database {
    constructor(path: string, options?: Record<string, unknown>);
    exec(sql: string): Database;
    prepare(sql: string): Statement;
    transaction<T>(fn: () => T): () => T;
    close(): void;
    pragma(pragma: string): unknown;
    backup(destination: string): Promise<void>;
    checkpoint(): void;
  }

  class Statement {
    run(...params: unknown[]): RunResult;
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Record<string, unknown>[];
  }

  interface RunResult {
    changes: number;
    lastInsertRowid: number | bigint;
  }

  class SqliteError extends Error {
    code: string;
  }

  export { Database, Statement, RunResult, SqliteError };
  export default Database;
}
