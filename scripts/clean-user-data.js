const fs = require("fs");
const path = require("path");
const os = require("os");

const DATA_DIR = path.join(os.homedir(), ".ai-animation-studio");

function cleanUserData() {
  if (!fs.existsSync(DATA_DIR)) {
    console.log("[Clean] No user data directory found, skipping");
    return;
  }

  console.log("[Clean] Cleaning user data directory:", DATA_DIR);

  const items = [
    "config.json",
    "config.json.backup",
    "config.json.tmp",
    "studio.db",
    "studio.db-wal",
    "studio.db-shm",
    "db-type.txt",
    "api-config.json",
    "secure/",
    "sync-server/",
  ];

  let cleaned = 0;
  for (const item of items) {
    const itemPath = path.join(DATA_DIR, item);
    try {
      if (fs.existsSync(itemPath)) {
        const stat = fs.statSync(itemPath);
        if (stat.isDirectory()) {
          fs.rmSync(itemPath, { recursive: true, force: true });
        } else {
          fs.unlinkSync(itemPath);
        }
        console.log("[Clean] Removed:", item);
        cleaned++;
      }
    } catch (e) {
      console.warn("[Clean] Failed to remove", item, ":", e.message);
    }
  }

  const remaining = fs.readdirSync(DATA_DIR).filter((f) => {
    return !f.endsWith(".corrupted.") && !f.startsWith("studio.db.backup.");
  });

  if (remaining.length === 0) {
    try {
      fs.rmdirSync(DATA_DIR);
      console.log("[Clean] Removed empty data directory");
    } catch {
      // ignore
    }
  }

  console.log(`[Clean] Done. Removed ${cleaned} items.`);
}

cleanUserData();
