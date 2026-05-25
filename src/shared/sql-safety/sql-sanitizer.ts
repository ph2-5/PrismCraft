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

export function buildSafeUpdate(
  table: string,
  columns: string[],
  values: unknown[],
  whereColumns: string[],
  whereParams: unknown[] = [],
) {
  if (columns.length !== values.length) {
    throw new Error(
      `Column count (${columns.length}) does not match value count (${values.length}) for table "${table}"`,
    );
  }
  const safeTable = sanitizeTable(table);
  const setClause = columns
    .map((col) => `${sanitizeIdentifier(col)} = ?`)
    .join(", ");
  const whereClause = whereColumns
    .map((col) => `${sanitizeIdentifier(col)} = ?`)
    .join(" AND ");
  return {
    sql: `UPDATE ${safeTable} SET ${setClause} WHERE ${whereClause}`,
    params: [...values, ...whereParams],
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
