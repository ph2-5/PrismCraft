export interface ColumnDef {
  type: string;
  notNull?: boolean;
  default?: string;
  check?: string;
  ref?: string;
  onDelete?: string;
  unique?: boolean;
  index?: boolean;
}

export interface TableDef {
  name: string;
  columns: Record<string, ColumnDef>;
  baseColumns?: boolean;
  uniqueConstraints?: string[][];
  primaryKey?: string;
  featureGroup?: string;
}

const BASE_COLUMNS: Record<string, ColumnDef> = {
  owner_id: { type: "INTEGER", notNull: true, default: "1" },
  created_at: { type: "INTEGER", default: "(strftime('%s','now'))" },
  updated_at: { type: "INTEGER", default: "(strftime('%s','now'))" },
  is_deleted: { type: "INTEGER", default: "0" },
  deleted_at: { type: "INTEGER" },
  version: { type: "INTEGER", default: "1" },
  sync_id: { type: "TEXT" },
};

const BASE_INDEXES = ["is_deleted", "updated_at"];

function quoteRef(ref: string): string {
  const match = ref.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\(([a-zA-Z_][a-zA-Z0-9_]*)\)$/);
  if (match) {
    return `"${match[1]}"("${match[2]}")`;
  }
  const valid = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
  if (valid.test(ref)) {
    return `"${ref}"`;
  }
  return ref;
}

export function generateTableSQL(def: TableDef): string {
  const useBase = def.baseColumns !== false;
  const allColumns: Record<string, ColumnDef> = useBase
    ? { ...BASE_COLUMNS, ...def.columns }
    : { ...def.columns };

  const pk = def.primaryKey || "id";
  const lines: string[] = [];
  const indexes: string[] = [];

  if (!allColumns.id && pk === "id") {
    lines.push('"id" TEXT PRIMARY KEY');
  }

  for (const [name, col] of Object.entries(allColumns)) {
    if (name === "id" && pk === "id" && !allColumns.id) continue;
    let line = `    "${name}" ${col.type}`;
    if (name === pk && pk !== "id") line += " PRIMARY KEY";
    if (name === pk && pk === "id" && allColumns.id) line += " PRIMARY KEY";
    if (col.notNull) line += " NOT NULL";
    if (col.default !== undefined) line += ` DEFAULT ${col.default}`;
    if (col.check) line += ` CHECK("${name}" ${col.check})`;
    if (col.unique) line += " UNIQUE";
    if (col.ref) {
      const onDelete = col.onDelete || "CASCADE";
      const refQuoted = quoteRef(col.ref);
      line += ` REFERENCES ${refQuoted} ON DELETE ${onDelete}`;
    }
    lines.push(line);

    if (col.ref || col.index) {
      indexes.push(`CREATE INDEX IF NOT EXISTS idx_${def.name}_${name} ON "${def.name}"("${name}");`);
    }
  }

  if (def.uniqueConstraints) {
    for (const uc of def.uniqueConstraints) {
      lines.push(`    UNIQUE(${uc.map(c => `"${c}"`).join(', ')})`);
    }
  }

  if (useBase) {
    for (const col of BASE_INDEXES) {
      indexes.push(`CREATE INDEX IF NOT EXISTS idx_${def.name}_${col} ON "${def.name}"("${col}");`);
    }
  }

  let sql = `CREATE TABLE IF NOT EXISTS "${def.name}" (\n${lines.join(',\n')}\n);`;
  for (const idx of indexes) {
    sql += `\n${idx}`;
  }
  return sql;
}

export function generateJunctionTableSQL(
  name: string,
  columns: Record<string, ColumnDef>,
  primaryKey: string[],
  uniqueConstraints?: string[][]
): string {
  const lines: string[] = [];
  for (const [colName, col] of Object.entries(columns)) {
    let line = `    "${colName}" ${col.type}`;
    if (col.notNull) line += " NOT NULL";
    if (col.default !== undefined) line += ` DEFAULT ${col.default}`;
    if (col.ref) {
      const onDelete = col.onDelete || "CASCADE";
      const refQuoted = quoteRef(col.ref);
      line += ` REFERENCES ${refQuoted} ON DELETE ${onDelete}`;
    }
    lines.push(line);
  }
  lines.push(`    PRIMARY KEY(${primaryKey.map(c => `"${c}"`).join(', ')})`);
  if (uniqueConstraints) {
    for (const uc of uniqueConstraints) {
      lines.push(`    UNIQUE(${uc.map(c => `"${c}"`).join(', ')})`);
    }
  }

  let sql = `CREATE TABLE IF NOT EXISTS "${name}" (\n${lines.join(',\n')}\n);`;
  for (const [colName, col] of Object.entries(columns)) {
    if (col.ref) {
      sql += `\nCREATE INDEX IF NOT EXISTS idx_${name}_${colName} ON "${name}"("${colName}");`;
    }
  }
  return sql;
}

export const SCHEMA_FEATURES = {
  users: true,
  core: true,
  video: true,
  sync: true,
  templates: true,
  assets: true,
};
