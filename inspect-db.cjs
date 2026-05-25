const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(process.env.APPDATA || '', 'ai-animation-studio', 'database', 'studio.db');
const db = new Database(dbPath);

const version = db.prepare("SELECT MAX(version) as v FROM schema_version").get();
console.log('Schema version:', version.v);

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
console.log('Tables:', tables.map(t => t.name).join(', '));

for (const t of tables) {
  const info = db.prepare(`PRAGMA table_info("${t.name}")`).all();
  console.log(`\n${t.name}: ${info.map(c => c.name).join(', ')}`);
}

db.close();
