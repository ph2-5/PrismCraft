export {
  getUserDataPath,
  getDbPaths,
  ensureDbDir,
  getSchemaSQL,
  CURRENT_SCHEMA_VERSION,
} from "./db-schema";
export type { DbPaths } from "./db-schema";

export {
  initDatabase,
  getDb,
  getDbType,
  getDbPath,
  saveDatabase,
  closeDatabase,
  query,
  run,
  exec,
} from "./db-connection";
