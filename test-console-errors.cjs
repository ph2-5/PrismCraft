const {chromium} = require('playwright');

const PAGES = [
  { name: 'Homepage', path: '/' },
  { name: 'Story', path: '/story' },
  { name: 'Characters', path: '/characters' },
  { name: 'Scenes', path: '/scenes' },
  { name: 'Video Tasks', path: '/video-tasks' },
  { name: 'Quick Generate', path: '/quick-generate' },
  { name: 'Settings', path: '/settings' },
  { name: 'Asset Library', path: '/asset-library' },
];

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  const allErrors = {};

  for (const { name, path } of PAGES) {
    const errors = [];
    const warnings = [];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text().substring(0, 300));
      } else if (msg.type() === 'warning') {
        warnings.push(msg.text().substring(0, 200));
      }
    });
    page.on('pageerror', err => {
      errors.push(`PAGEERROR: ${err.message.substring(0, 300)}`);
    });

    try {
      await page.goto(`http://localhost:3001${path}`, { timeout: 15000 });
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(3000);
    } catch (e) {
      errors.push(`NAVIGATION ERROR: ${e.message.substring(0, 200)}`);
    }

    allErrors[name] = { errors, warnings };

    page.removeAllListeners('console');
    page.removeAllListeners('pageerror');
  }

  await browser.close();

  console.log('\n========== CONSOLE ERROR REPORT ==========\n');
  let totalErrors = 0;
  let totalWarnings = 0;

  for (const [name, { errors, warnings }] of Object.entries(allErrors)) {
    if (errors.length > 0 || warnings.length > 0) {
      console.log(`\n--- ${name} ---`);
      if (errors.length > 0) {
        console.log(`  ERRORS (${errors.length}):`);
        const unique = [...new Set(errors)];
        for (const e of unique) {
          console.log(`    ${e}`);
          totalErrors++;
        }
      }
      if (warnings.length > 0) {
        console.log(`  WARNINGS (${warnings.length}):`);
        const unique = [...new Set(warnings)].slice(0, 10);
        for (const w of unique) {
          console.log(`    ${w}`);
          totalWarnings++;
        }
      }
    } else {
      console.log(`\n--- ${name} --- CLEAN ✓`);
    }
  }

  console.log(`\n========== SUMMARY ==========`);
  console.log(`Total unique errors: ${totalErrors}`);
  console.log(`Total unique warnings: ${totalWarnings}`);
})();
