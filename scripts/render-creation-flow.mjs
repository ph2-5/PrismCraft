import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

(async () => {
  const htmlPath = path.resolve(__dirname, '../docs/contest/creation-flow.html');
  const outPath = path.resolve(__dirname, '../docs/contest/images/creation-flow.png');

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1200, height: 800 },
    deviceScaleFactor: 2,
  });

  await page.goto('file:///' + htmlPath.replace(/\\/g, '/'));
  // 等待字体和布局稳定
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);

  // 截取 .wrap 元素（精确裁剪到内容）
  const wrap = await page.$('.wrap');
  if (!wrap) {
    console.error('未找到 .wrap 元素');
    await browser.close();
    process.exit(1);
  }
  await wrap.screenshot({ path: outPath, omitBackground: false });

  console.log('已生成:', outPath);
  await browser.close();
})();
