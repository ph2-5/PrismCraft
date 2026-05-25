const { app } = require('electron');
const path = require('path');

app.whenReady().then(() => {
  const dbPath = path.join(app.getPath('userData'), 'database', 'studio.db');
  console.log('DB Path:', dbPath);
  try {
    const Database = require('better-sqlite3');
    const db = new Database(dbPath, { readonly: true });
    const version = db.prepare('SELECT MAX(version) as v FROM schema_version').get();
    console.log('Schema version:', version.v);
    const storiesCols = db.prepare('PRAGMA table_info(stories)').all();
    console.log('Stories columns:', storiesCols.map(c => c.name).join(', '));
    console.log('Stories has owner_id:', storiesCols.some(c => c.name === 'owner_id'));
    const charsCols = db.prepare('PRAGMA table_info(characters)').all();
    console.log('Characters has owner_id:', charsCols.some(c => c.name === 'owner_id'));
    db.close();
  } catch(e) {
    console.error('Error:', e.message);
  }
  app.quit();
});
