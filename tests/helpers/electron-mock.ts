import type { Page } from "@playwright/test";

const MOCK_SCRIPT = `
localStorage.setItem("ai_anim_studio_onboarding-completed", "true");
localStorage.setItem("ai_anim_studio_ai-animation-studio-onboarding-complete", "true");

var db = new Map();

var knownTables = new Set([
  "stories", "characters", "scenes", "storyboard", "video_tasks",
  "media_assets", "storyboard_assets", "collections", "story_versions",
  "video_cache", "auto_saves", "error_logs", "templates", "sync_log",
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

  var countMatch = template.match(/^SELECT\\s+count\\(\\*\\)\\s+as\\s+(\\w+)\\s+FROM\\s+(\\w+)(?:\\s+WHERE\\s+(\\w+)\\s*=\\s*__PARAM_(\\d+)__)?$/i);
  if (countMatch) {
    var alias = countMatch[1];
    var tableName = countMatch[2];
    var whereCol = countMatch[3];
    var paramIdx = countMatch[4] ? parseInt(countMatch[4]) : 0;
    var table = db.get(tableName);
    if (!table) return { success: true, data: [{}] };
    var obj = {};
    obj[alias] = 0;
    return { success: true, data: [obj] };
  }

  var selectAllMatch = template.match(/^SELECT\\s+\\*\\s+FROM\\s+(\\w+)(?:\\s+ORDER\\s+BY\\s+(\\w+)\\s+(ASC|DESC))?$/i);
  if (selectAllMatch) {
    var tableName = selectAllMatch[1];
    var table = db.get(tableName);
    if (!table) return { success: true, data: [] };
    return { success: true, data: Array.from(table.values()) };
  }

  return { success: true, data: [] };
}

function parseInsert(sql, params) {
  var rp = replaceParams(sql, params);
  var template = rp.template;
  var paramValues = rp.paramValues;
  var match = template.match(/^INSERT\\s+INTO\\s+(\\w+)\\s*\\((.+?)\\)\\s*VALUES\\s*\\((.+?)\\)$/i);
  if (!match) return { success: false, error: "Unsupported INSERT" };
  var tableName = match[1];
  if (!knownTables.has(tableName.toLowerCase())) return { success: false, error: "Table not found" };
  var columns = match[2].split(",").map(function(c) { return c.trim(); });
  var valueTokens = match[3].split(",").map(function(v) { return v.trim(); });
  var table = getTable(tableName);
  var row = {};
  for (var i = 0; i < columns.length; i++) {
    var token = valueTokens[i];
    var paramMatch = token.match(/^__PARAM_(\\d+)__$/);
    if (paramMatch) {
      row[columns[i]] = paramValues[parseInt(paramMatch[1]) - 1];
    } else {
      row[columns[i]] = token;
    }
  }
  var pk = row.id || row[columns[0]];
  if (pk !== undefined) table.set(String(pk), row);
  else table.set("__row_" + Date.now() + "_" + Math.random() + "__", row);
  return { success: true };
}

function parseDelete(sql, params) {
  return { success: true };
}

var noop = function() {};
var noopAsync = async function() { return { success: true, data: null }; };

window.electronAPI = {
  dbQuery: async function(sql, params) {
    var result = parseSelect(sql, params || []);
    return { success: true, data: result.data || [] };
  },
  dbRun: async function(sql, params) {
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
  },
  dbTransaction: async function(statements) {
    for (var i = 0; i < statements.length; i++) {
      var stmt = statements[i];
      var upper = stmt.sql.trim().toUpperCase();
      if (upper.startsWith("INSERT")) {
        parseInsert(stmt.sql, stmt.params || []);
      }
    }
    return { success: true, data: [] };
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
  saveFileDialog: async function() { return { success: true, data: null }; },
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
