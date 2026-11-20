// Screenshots the storefront (desktop + mobile) for review and the portfolio, to shots/.
// Usage: node --env-file=.env scripts/shoot.mjs [themeId]
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { SHOP, STORE_PASSWORD } = process.env;
const themeId = process.argv[2];
const out = path.join(root, 'shots');
await mkdir(out, { recursive: true });
const q = themeId ? `?preview_theme_id=${themeId}` : '';
const pages = [
  ['home', '/'],
  ['collection', '/collections/men'],
  ['product', '/products/saigon-skyline-graphic-tee'],
];

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
for (const [device, viewport] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: device === 'mobile' ? 2 : 1 });
  const tab = await ctx.newPage();
  await tab.goto(`https://${SHOP}/password`);
  if (await tab.locator('input[type=password]').count()) {
    // Dawn hides the form behind a modal button.
    const opener = tab.locator('.password-modal__toggle, summary').first();
    if (await opener.isVisible().catch(() => false)) await opener.click();
    await tab.fill('input[type=password]', STORE_PASSWORD);
    await Promise.all([tab.waitForLoadState('networkidle'), tab.locator('input[type=password]').press('Enter')]);
  }
  for (const [name, url] of pages) {
    await tab.goto(`https://${SHOP}${url}${q}`, { waitUntil: 'networkidle' });
    await tab.evaluate(() => document.querySelector('#preview-bar-iframe, #PBarNextFrameWrapper')?.remove());
    // Full-page shots skip Dawn's reveal-on-scroll, so show everything up front.
    await tab.addStyleTag({ content: '.scroll-trigger{opacity:1!important;transform:none!important;animation:none!important}' });
    // Scroll through so lazy images and reveal animations load.
    await tab.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 400) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); } scrollTo(0, 0); });
    await tab.waitForTimeout(600);
    await tab.screenshot({ path: path.join(out, `${device}-${name}.png`), fullPage: true });
    console.log(`${device}-${name}`);
  }
  await ctx.close();
}
await browser.close();
