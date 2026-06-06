const VALID_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export function sanitizeIdentifier(name: string): string {
  if (!VALID_IDENTIFIER.test(name)) {
    throw new Error(`Invalid SQL identifier: ${name}`);
  }
  return `"${name}"`;
}

export function sanitizeTable(table: string): string {
  return sanitizeIdentifier(table);
}

export function buildSafeInsert(
  table: string,
  columns: string[],
  values: unknown[],
) {
  if (columns.length !== values.length) {
    throw new Error(
      `Column count (${columns.length}) does not match value count (${values.length}) for table "${table}"`,
    );
  }
  const safeTable = sanitizeTable(table);
  const safeColumns = columns.map(sanitizeIdentifier).join(", ");
  const placeholders = columns.map(() => "?").join(", ");
  return {
    sql: `INSERT INTO ${safeTable} (${safeColumns}) VALUES (${placeholders})`,
    params: values,
  };
}

export interface BuildSafeUpdateOptions {
  version?: number;
}

export interface BuildSafeUpdateResult {
  sql: string;
  params: unknown[];
  versionMismatch: boolean;
}

export function buildSafeUpdate(
  table: string,
  columns: string[],
  values: unknown[],
  whereColumns: string[],
  whereParams: unknown[] = [],
  options?: BuildSafeUpdateOptions,
): BuildSafeUpdateResult {
  if (columns.length !== values.length) {
    throw new Error(
      `Column count (${columns.length}) does not match value count (${values.length}) for table "${table}"`,
    );
  }
  const safeTable = sanitizeTable(table);
  const setParts = columns.map((col) => `${sanitizeIdentifier(col)} = ?`);
  if (options?.version !== undefined) {
    setParts.push("version = version + 1");
  }
  const setClause = setParts.join(", ");
  const whereParts = whereColumns.map((col) => `${sanitizeIdentifier(col)} = ?`);
  if (options?.version !== undefined) {
    whereParts.push("version = ?");
  }
  const whereClause = whereParts.join(" AND ");
  const allParams = [
    ...values,
    ...whereParams,
    ...(options?.version !== undefined ? [options.version] : []),
  ];
  return {
    sql: `UPDATE ${safeTable} SET ${setClause} WHERE ${whereClause}`,
    params: allParams,
    versionMismatch: false,
  };
}

export function buildSafeDelete(
  table: string,
  whereColumns: string[],
  whereParams: unknown[] = [],
) {
  const safeTable = sanitizeTable(table);
  const whereClause = whereColumns
    .map((col) => `${sanitizeIdentifier(col)} = ?`)
    .join(" AND ");
  return {
    sql: `DELETE FROM ${safeTable} WHERE ${whereClause}`,
    params: whereParams,
  };
}

export function toSqlValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Math.floor(value.getTime() / 1000);
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  }
  return value;
}
