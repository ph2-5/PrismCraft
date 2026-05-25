const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');
const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'ai-animation-studio', 'database', 'studio.db');
console.log('DB Path:', dbPath);
try {
  const db = new Database(dbPath, { readonly: true });
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
  console.log('Tables:', tables.map(t => t.name));
  const version = db.prepare('SELECT MAX(version) as v FROM schema_version').get();
  console.log('Schema version:', version.v);
  const storiesCols = db.prepare('PRAGMA table_info(stories)').all();
  console.log('Stories columns:', storiesCols.map(c => c.name));
  const charsCols = db.prepare('PRAGMA table_info(characters)').all();
  console.log('Characters columns:', charsCols.map(c => c.name));
  db.close();
} catch(e) {
  console.error('Error:', e.message);
}
