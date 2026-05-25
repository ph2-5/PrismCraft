import { errorLogger } from "@/shared/error-logger";

export type ColumnKind = "json" | "boolean" | "number" | "string";

const columnRegistry = new Map<string, ColumnKind>();

export function registerColumn(
  table: string,
  column: string,
  kind: ColumnKind,
): void {
  const key = `${table}.${column}`;
  const existing = columnRegistry.get(key);
  if (existing !== undefined && existing !== kind) {
    errorLogger.warn(
      { code: "SCHEMA_REREGISTER", message: `Column "${key}" re-registered with different kind: "${existing}" → "${kind}". Using new value.` },
      "SchemaRegistry",
    );
  }
  columnRegistry.set(key, kind);
}

export function registerColumns(
  table: string,
  entries: Array<[string, ColumnKind]>,
): void {
  for (const [column, kind] of entries) {
    registerColumn(table, column, kind);
  }
}

export function getColumnKind(
  table: string,
  column: string,
): ColumnKind | undefined {
  return columnRegistry.get(`${table}.${column}`);
}

export function getAllRegisteredColumns(): Map<string, ColumnKind> {
  return new Map(columnRegistry);
}

export function isColumnRegistered(table: string, column: string): boolean {
  return columnRegistry.has(`${table}.${column}`);
}

export function _clearRegistry(): void {
  columnRegistry.clear();
}
