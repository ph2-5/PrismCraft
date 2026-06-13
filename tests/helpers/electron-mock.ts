import type { Page } from "@playwright/test";

const MOCK_SCRIPT = `
localStorage.setItem("ai_anim_studio_onboarding-completed", "true");
localStorage.setItem("ai_anim_studio_ai-animation-studio-onboarding-complete", "true");

var _dbJson = sessionStorage.getItem("__electron_mock_db__");
var db = new Map();
if (_dbJson) {
  try {
    var parsed = JSON.parse(_dbJson);
    for (var i = 0; i < parsed.length; i++) {
      db.set(parsed[i][0], new Map(parsed[i][1]));
    }
  } catch(e) {}
}

function _saveDb() {
  try {
    var entries = [];
    db.forEach(function(v, k) { entries.push([k, Array.from(v.entries())]); });
    sessionStorage.setItem("__electron_mock_db__", JSON.stringify(entries));
  } catch(e) {}
}

window.addEventListener("beforeunload", _saveDb);

var knownTables = new Set([
  "stories", "characters", "scenes", "storyboard", "video_tasks",
  "media_assets", "storyboard_assets", "collections", "story_versions",
  "video_cache", "auto_saves", "error_logs", "templates", "sync_log",
  "story_beats", "story_characters", "story_scenes", "story_elements",
]);

function getTable(name) {
  var table = db.get(name);
  if (!table) {
    table = new Map();
    db.set(name, table);
  }
  return table;
}

function replaceParams(sql, params) {
  var idx = 0;
  var template = sql.replace(/\\?/g, function() {
    idx++;
    return "__PARAM_" + idx + "__";
  });
  return { template: template, paramValues: params };
}

function parseSelect(sql, params) {
  var rp = replaceParams(sql, params);
  var template = rp.template;
  var paramValues = rp.paramValues;
  var tableName = "";
  var tableMatch = template.match(/FROM\\s+"?(\\w+)"?/i);
  if (tableMatch) tableName = tableMatch[1];
  var table = db.get(tableName);
  if (!table) return { success: true, data: [] };

  var rows = Array.from(table.values());
  var whereEqMatch = template.match(/WHERE\\s+"?(\\w+)"?\\s*=\\s*__PARAM_(\\d+)__/i);
  if (whereEqMatch) {
    var wCol = whereEqMatch[1];
    var pIdx = parseInt(whereEqMatch[2]);
    var wVal = paramValues[pIdx - 1];
    rows = rows.filter(function(r) { return r[wCol] === wVal; });
  }
  var whereInMatch = template.match(/WHERE\\s+"?(\\w+)"?\\s+IN\\s*\\(([^)]+)\\)/i);
  if (whereInMatch && !whereEqMatch) {
    var inCol = whereInMatch[1];
    var inParams = whereInMatch[2].match(/__PARAM_(\\d+)__/g);
    if (inParams) {
      var inVals = inParams.map(function(p) { var m = p.match(/__PARAM_(\\d+)__/); return paramValues[parseInt(m[1]) - 1]; });
      rows = rows.filter(function(r) { return inVals.indexOf(r[inCol]) !== -1; });
    }
  }

  var isCount = /count\\s*\\(\\s*\\*\\s*\\)\\s+as\\s+(\\w+)/i.test(template);
  if (isCount) {
    var countAliasMatch = template.match(/count\\s*\\(\\s*\\*\\s*\\)\\s+as\\s+(\\w+)/i);
    var alias = countAliasMatch[1];
    var obj = {};
    obj[alias] = rows.length;
    return { success: true, data: [obj] };
  }

  var colMatch = template.match(/^SELECT\\s+(.+?)\\s+FROM/i);
  var colStr = colMatch ? colMatch[1] : "*";
  var columns = colStr === "*" ? null : colStr.split(",").map(function(c) { return c.trim(); });

  if (columns) {
    rows = rows.map(function(r) {
      var obj = {};
      for (var i = 0; i < columns.length; i++) { obj[columns[i]] = r[columns[i]]; }
      return obj;
    });
  }
  return { success: true, data: rows };
}

function parseInsert(sql, params) {
  try {
    var rp = replaceParams(sql, params);
    var template = rp.template;
    var paramValues = rp.paramValues;
    var tableMatch = template.match(/^INSERT\\s+(?:OR\\s+\\w+\\s+)?INTO\\s+"?(\\w+)"?\\s*\\((.+?)\\)\\s*VALUES\\s*\\(/i);
    if (!tableMatch) return { success: false, error: "Unsupported INSERT format" };
    var tableName = tableMatch[1];
    if (!knownTables.has(tableName.toLowerCase())) return { success: false, error: "Table not found: " + tableName };
    var columns = tableMatch[2].split(",").map(function(c) { return c.trim().replace(/^"|"$/g, ""); });
    var valuesStart = template.indexOf("VALUES");
    var parenStart = template.indexOf("(", valuesStart);
    var depth = 0;
    var valuesStr = "";
    for (var i = parenStart + 1; i < template.length; i++) {
      if (template[i] === "(") depth++;
      else if (template[i] === ")") { if (depth === 0) break; depth--; }
      valuesStr += template[i];
    }
    var valueTokens = splitValueTokens(valuesStr);
    var table = getTable(tableName);
    var row = {};
    for (var i = 0; i < columns.length && i < valueTokens.length; i++) {
      var token = valueTokens[i].trim();
      var paramMatch = token.match(/^__PARAM_(\\d+)__$/);
      if (paramMatch) {
        row[columns[i]] = paramValues[parseInt(paramMatch[1]) - 1];
      } else {
        row[columns[i]] = token.replace(/^['"]|['"]$/g, "");
      }
    }
    var pk = row.id || row[columns[0]];
    if (pk !== undefined) table.set(String(pk), row);
    else table.set("__row_" + Date.now() + "_" + Math.random() + "__", row);
    _saveDb();
    return { success: true };
  } catch (e) {
    return { success: false, error: "parseInsert error: " + e.message };
  }
}

function splitValueTokens(str) {
  var tokens = [];
  var current = "";
  var depth = 0;
  for (var i = 0; i < str.length; i++) {
    if (str[i] === "(") depth++;
    else if (str[i] === ")") depth--;
    if (str[i] === "," && depth === 0) {
      tokens.push(current);
      current = "";
    } else {
      current += str[i];
    }
  }
  if (current.trim()) tokens.push(current);
  return tokens;
}

function parseDelete(sql, params) {
  var rp = replaceParams(sql, params);
  var template = rp.template;
  var paramValues = rp.paramValues;
  var match = template.match(/^DELETE\\s+FROM\\s+"?(\\w+)"?(?:\\s+WHERE\\s+"?(\\w+)"?\\s+IN\\s*\\((.+?)\\))?$/i);
  if (!match) return { success: true };
  var tableName = match[1];
  var whereCol = match[2];
  var inClause = match[3];
  var table = db.get(tableName);
  if (!table) return { success: true };
  if (whereCol && inClause) {
    var inParams = inClause.match(/__PARAM_(\\d+)__/g);
    if (inParams) {
      var inVals = inParams.map(function(p) { var m = p.match(/__(\\d+)__/); return paramValues[parseInt(m[1]) - 1]; });
      var keysToDelete = [];
      table.forEach(function(row, key) {
        if (inVals.indexOf(row[whereCol]) !== -1) keysToDelete.push(key);
      });
      keysToDelete.forEach(function(key) { table.delete(key); });
      _saveDb();
    }
  }
  return { success: true };
}

var noop = function() {};
var noopAsync = async function() { return { success: true, data: null }; };

window.electronAPI = {
  dbQuery: async function(sql, params) {
    try {
      var result = parseSelect(sql, params || []);
      return { success: true, data: result.data || [] };
    } catch (e) {
      return { success: true, data: [], _error: e.message };
    }
  },
  dbRun: async function(sql, params) {
    try {
      var upper = sql.trim().toUpperCase();
      if (upper.startsWith("INSERT")) {
        parseInsert(sql, params || []);
        return { success: true, data: { changes: 1, lastInsertRowid: Date.now() } };
      }
      if (upper.startsWith("DELETE")) {
        parseDelete(sql, params || []);
        return { success: true, data: { changes: 1, lastInsertRowid: 0 } };
      }
      if (upper.startsWith("UPDATE")) {
        return { success: true, data: { changes: 1, lastInsertRowid: 0 } };
      }
      return { success: true, data: { changes: 0, lastInsertRowid: 0 } };
    } catch (e) {
      return { success: true, data: { changes: 0, lastInsertRowid: 0 }, _error: e.message };
    }
  },
  dbTransaction: async function(statements) {
    var snapshot = new Map();
    db.forEach(function(tData, tName) { snapshot.set(tName, new Map(tData)); });
    try {
      for (var i = 0; i < statements.length; i++) {
        var stmt = statements[i];
        var upper = stmt.sql.trim().toUpperCase();
        if (upper.startsWith("INSERT")) {
          var insResult = parseInsert(stmt.sql, stmt.params || []);
          if (!insResult.success) throw new Error("INSERT failed at stmt " + i + ": " + (insResult.error || "unknown"));
        } else if (upper.startsWith("DELETE")) {
          parseDelete(stmt.sql, stmt.params || []);
        }
      }
      return { success: true, data: [] };
    } catch (e) {
      db.clear();
      snapshot.forEach(function(tData, tName) { db.set(tName, tData); });
      return { success: false, error: e.message || "Transaction failed" };
    }
  },
  exportData: async function() {
    var data = {};
    db.forEach(function(tData, tName) { data[tName] = Array.from(tData.values()); });
    return { success: true, data: data };
  },
  getConfig: async function() { return { success: true, data: null }; },
  setConfig: async function() { return { success: true }; },
  secureConfigSave: async function() { return { success: true }; },
  secureConfigLoad: async function() { return { success: true, data: null }; },
  secureConfigDelete: async function() { return { success: true }; },
  secureConfigResolve: async function() { return { success: true, data: null }; },
  secureConfigHas: async function() { return { success: true, data: false }; },
  saveImage: async function() { return { success: true, data: "" }; },
  deleteFile: async function() { return { success: true }; },
  readFileAsBase64: async function() { return { success: true, data: "" }; },
  getAssetsDir: async function() { return { success: true, data: "" }; },
  saveBuffer: async function() { return { success: true, data: "" }; },
  fileExists: async function() { return { success: true, data: false }; },
  copyFile: async function() { return { success: true }; },
  openFileDialog: async function() { return { success: true, data: null }; },
  saveFileDialog: async function() { return { success: true, filePath: "/tmp/test-export.json" }; },
  writeFile: async function() { return { success: true }; },
  readFile: async function() { return { success: true, data: "" }; },
  getCacheDirectory: async function() { return { success: true, data: "" }; },
  getFileInfo: async function() { return { success: true, data: {} }; },
  getDiskSpace: async function() { return { success: true, data: { free: 107374182400, total: 536870912000 } }; },
  normalizeImage: async function() { return { success: true, data: "" }; },
  imageToBase64IPC: async function() { return { success: true, data: "" }; },
  openExternal: async function() { return { success: true }; },
  onNavigate: noop,
  onMenuNewCharacter: noop,
  onMenuNewScene: noop,
  onMenuExport: noop,
  removeMenuListeners: noop,
  platform: "win32",
  versions: { node: "20.11.0", chrome: "120.0.0", electron: "28.0.0" },
};
`;

export async function installElectronMock(page: Page) {
  await page.addInitScript({ content: MOCK_SCRIPT });
}
