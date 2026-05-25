export interface DatabaseResult {
  [key: string]: unknown;
}

export type QueryParams = unknown[];

export interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export interface Statement {
  get(...params: QueryParams): DatabaseResult | undefined;
  all(...params: QueryParams): DatabaseResult[];
  run(...params: QueryParams): RunResult;
}

export interface DatabaseAdapter {
  exec(sql: string): void;
  prepare(sql: string): Statement;
  transaction(fn: () => void): void;
  pragma(name: string, value?: unknown): unknown;
  close(): void;
}
