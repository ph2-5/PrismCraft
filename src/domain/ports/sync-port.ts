export interface DbRunResult {
  changes?: number;
  lastInsertRowid?: number;
}

export interface ISyncStorage {
  safeQuery<T>(sql: string, params?: unknown[]): Promise<T[]>;
  safeRun(sql: string, params?: unknown[]): Promise<DbRunResult>;
  safeTransaction(statements: { sql: string; params: unknown[] }[]): Promise<unknown[]>;
  registerChangeTracker(tracker: (entityType: string, entityId: string, operation: string) => Promise<void>): void;
}
