import type { Page } from "@playwright/test";

export async function installElectronMock(page: Page) {
  await page.addInitScript(() => {
    const db = new Map();

    const knownTables = new Set([
      "stories", "characters", "scenes", "storyboard", "video_tasks",
      "media_assets", "storyboard_assets", "collections", "story_versions",
      "video_cache", "auto_saves", "error_logs", "templates", "sync_log",
    ]);

    function getTable(name) {
      let table = db.get(name);
      if (!table) {
        table = new Map();
        db.set(name, table);
      }
      return table;
    }

    function replaceParams(sql, params) {
      let idx = 0;
      const template = sql.replace(/\?/g, () => {
        idx++;
        return `__PARAM_${idx}__`;
      });
      return { template, paramValues: params };
    }

    function parseSelect(sql, params) {
      const { template, paramValues } = replaceParams(sql, params);

      const countMatch = template.match(/^SELECT\s+count\(\*\)\s+as\s+(\w+)\s+FROM\s+(\w+)(?:\s+WHERE\s+(\w+)\s*=\s*__PARAM_(\d+)__)?$/i);
      if (countMatch) {
        const alias = countMatch[1];
        const tableName = countMatch[2];
        const whereCol = countMatch[3];
        const paramIdx = countMatch[4] ? parseInt(countMatch[4]) : 0;

        const table = db.get(tableName);
        if (!table) {
          return { success: true, data: [{ [alias]: 0 }] };
        }

        let rows = Array.from(table.values());
        if (whereCol && paramIdx) {
          const whereVal = paramValues[paramIdx - 1];
          rows = rows.filter((row) => row[whereCol] === whereVal);
        }

        return { success: true, data: [{ [alias]: rows.length }] };
      }

      const countNoAliasMatch = template.match(/^SELECT\s+COUNT\(\*\)\s+as\s+(\w+)\s+FROM\s+(\w+)$/i);
      if (countNoAliasMatch) {
        const alias = countNoAliasMatch[1];
        const tableName = countNoAliasMatch[2];
        const table = db.get(tableName);
        return { success: true, data: [{ [alias]: table ? table.size : 0 }] };
      }

      const selectInMatch = template.match(/^SELECT\s+(.+?)\s+FROM\s+(\w+)\s+WHERE\s+(\w+)\s+IN\s*\((.+?)\)(?:\s+ORDER\s+BY\s+(\w+))?$/i);
      if (selectInMatch) {
        const columns = selectInMatch[1].split(",").map((c) => c.trim());
        const tableName = selectInMatch[2];
        const whereCol = selectInMatch[3];
        const inParamsStr = selectInMatch[4];
        const orderCol = selectInMatch[5];

        const paramIndices = [...inParamsStr.matchAll(/__PARAM_(\d+)__/g)].map((m) => parseInt(m[1]));
        const inValues = paramIndices.map((i) => paramValues[i - 1]);

        const table = db.get(tableName);
        if (!table) {
          return { success: true, data: [] };
        }

        let rows = Array.from(table.values()).filter((row) => inValues.includes(row[whereCol]));

        if (orderCol) {
          rows.sort((a, b) => String(a[orderCol] ?? "").localeCompare(String(b[orderCol] ?? "")));
        }

        const projected = rows.map((row) => {
          const out = {};
          for (const col of columns) {
            out[col] = row[col];
          }
          return out;
        });

        return { success: true, data: projected };
      }

      const simpleWhereMatch = template.match(/^SELECT\s+(.+?)\s+FROM\s+(\w+)\s+WHERE\s+(\w+)\s*=\s*__PARAM_(\d+)__$/i);
      if (simpleWhereMatch) {
        const columns = simpleWhereMatch[1].split(",").map((c) => c.trim());
        const tableName = simpleWhereMatch[2];
        const whereCol = simpleWhereMatch[3];
        const paramIdx = parseInt(simpleWhereMatch[4]);

        const table = db.get(tableName);
        if (!table) {
          return { success: true, data: [] };
        }

        const whereVal = paramValues[paramIdx - 1];
        const rows = Array.from(table.values()).filter((row) => row[whereCol] === whereVal);

        const projected = rows.map((row) => {
          const out = {};
          for (const col of columns) {
            out[col] = row[col];
          }
          return out;
        });

        return { success: true, data: projected };
      }

      const selectAllMatch = template.match(/^SELECT\s+\*\s+FROM\s+(\w+)(?:\s+ORDER\s+BY\s+(\w+)\s+(ASC|DESC))?$/i);
      if (selectAllMatch) {
        const tableName = selectAllMatch[1];
        const table = db.get(tableName);
        if (!table) {
          return { success: true, data: [] };
        }
        return { success: true, data: Array.from(table.values()) };
      }

      return { success: true, data: [] };
    }

    function parseInsert(sql, params) {
      const { template, paramValues } = replaceParams(sql, params);

      const match = template.match(/^INSERT\s+INTO\s+(\w+)\s*\((.+?)\)\s*VALUES\s*\((.+?)\)$/i);
      if (!match) {
        return { success: false, error: `Unsupported INSERT: ${sql}` };
      }

      const tableName = match[1];
      if (!knownTables.has(tableName.toLowerCase())) {
        return { success: false, error: `Table not found: ${tableName}` };
      }

      const columns = match[2].split(",").map((c) => c.trim());
      const valueTokens = match[3].split(",").map((v) => v.trim());

      const table = getTable(tableName);

      const row = {};

      for (let i = 0; i < columns.length; i++) {
        const token = valueTokens[i];
        const paramMatch = token.match(/^__PARAM_(\d+)__$/);
        if (paramMatch) {
          const idx = parseInt(paramMatch[1]);
          row[columns[i]] = paramValues[idx - 1];
        } else if (/^strftime/i.test(token)) {
          row[columns[i]] = Math.floor(Date.now() / 1000);
        } else {
          row[columns[i]] = token;
        }
      }

      const pk = row.id ?? row[columns[0]];
      if (pk !== undefined) {
        table.set(String(pk), row);
      } else {
        table.set(`__row_${Date.now()}_${Math.random()}__`, row);
      }

      return { success: true };
    }

    function parseDelete(sql, params) {
      const { template, paramValues } = replaceParams(sql, params);

      const inMatch = template.match(/^DELETE\s+FROM\s+(\w+)\s+WHERE\s+(\w+)\s+IN\s*\((.+?)\)$/i);
      if (inMatch) {
        const tableName = inMatch[1];
        const whereCol = inMatch[2];
        const inParamsStr = inMatch[3];

        const paramIndices = [...inParamsStr.matchAll(/__PARAM_(\d+)__/g)].map((m) => parseInt(m[1]));
        const inValues = paramIndices.map((i) => paramValues[i - 1]);

        const table = db.get(tableName);
        if (table) {
          for (const [key, row] of table.entries()) {
            if (inValues.includes(row[whereCol])) {
              table.delete(key);
            }
          }
        }

        return { success: true };
      }

      const eqMatch = template.match(/^DELETE\s+FROM\s+(\w+)\s+WHERE\s+(\w+)\s*=\s*__PARAM_(\d+)__$/i);
      if (eqMatch) {
        const tableName = eqMatch[1];
        const whereCol = eqMatch[2];
        const paramIdx = parseInt(eqMatch[3]);

        const table = db.get(tableName);
        if (table) {
          const whereVal = paramValues[paramIdx - 1];
          for (const [key, row] of table.entries()) {
            if (row[whereCol] === whereVal) {
              table.delete(key);
            }
          }
        }

        return { success: true };
      }

      return { success: true };
    }

    const noop = () => {};
    const noopAsync = async () => ({ success: true, data: null });

    window.electronAPI = {
      dbQuery: async (sql, params) => {
        const result = parseSelect(sql, params ?? []);
        return { success: true, data: result.data ?? [] };
      },

      dbRun: async (sql, params) => {
        const upper = sql.trim().toUpperCase();
        if (upper.startsWith("INSERT")) {
          parseInsert(sql, params ?? []);
          return { success: true, data: { changes: 1, lastInsertRowid: Date.now() } };
        }
        if (upper.startsWith("DELETE")) {
          parseDelete(sql, params ?? []);
          return { success: true, data: { changes: 1, lastInsertRowid: 0 } };
        }
        if (upper.startsWith("UPDATE")) {
          return { success: true, data: { changes: 1, lastInsertRowid: 0 } };
        }
        return { success: true, data: { changes: 0, lastInsertRowid: 0 } };
      },

      dbTransaction: async (statements) => {
        const snapshot = new Map();
        for (const [tName, tData] of db.entries()) {
          snapshot.set(tName, new Map(tData));
        }

        try {
          for (const stmt of statements) {
            const upper = stmt.sql.trim().toUpperCase();
            if (upper.startsWith("INSERT")) {
              const result = parseInsert(stmt.sql, stmt.params ?? []);
              if (!result.success) throw new Error(result.error);
            } else if (upper.startsWith("DELETE")) {
              const result = parseDelete(stmt.sql, stmt.params ?? []);
              if (!result.success) throw new Error(result.error);
            } else if (upper.startsWith("UPDATE")) {
              noop();
            } else {
              throw new Error(`Unsupported transaction SQL: ${stmt.sql}`);
            }
          }
          return { success: true, data: [] };
        } catch (err) {
          db.clear();
          for (const [tName, tData] of snapshot.entries()) {
            db.set(tName, tData);
          }
          throw err;
        }
      },

      exportData: async () => {
        const data = {};
        for (const [tName, tData] of db.entries()) {
          data[tName] = Array.from(tData.values());
        }
        return { success: true, data };
      },

      getConfig: async (_key) => ({ success: true, data: null }),
      setConfig: async (_key, _value) => ({ success: true }),
      secureConfigSave: async (_key, _value) => ({ success: true }),
      secureConfigLoad: async (_key) => ({ success: true, data: null }),
      secureConfigDelete: async (_key) => ({ success: true }),
      secureConfigResolve: async (_key) => ({ success: true, data: null }),
      secureConfigHas: async (_key) => ({ success: true, data: false }),

      saveImage: async () => ({ success: true, data: "" }),
      deleteFile: async () => ({ success: true }),
      readFileAsBase64: async () => ({ success: true, data: "" }),
      getAssetsDir: async () => ({ success: true, data: "" }),
      saveBuffer: async () => ({ success: true, data: "" }),
      fileExists: async () => ({ success: true, data: false }),
      copyFile: async () => ({ success: true }),
      openFileDialog: async () => ({ success: true, data: null }),
      saveFileDialog: async () => ({ success: true, data: null }),
      writeFile: async () => ({ success: true }),
      readFile: async () => ({ success: true, data: "" }),
      getCacheDirectory: async () => ({ success: true, data: "" }),
      getFileInfo: async () => ({ success: true, data: {} }),
      getDiskSpace: async () => ({ success: true, data: { free: 107374182400, total: 536870912000 } }),
      normalizeImage: async () => ({ success: true, data: "" }),
      imageToBase64IPC: async () => ({ success: true, data: "" }),
      openExternal: async () => ({ success: true }),

      onNavigate: noop,
      onMenuNewCharacter: noop,
      onMenuNewScene: noop,
      onMenuExport: noop,
      removeMenuListeners: noop,

      platform: "win32",

      versions: {
        node: "20.11.0",
        chrome: "120.0.0",
        electron: "28.0.0",
      },
    };
  });
}
