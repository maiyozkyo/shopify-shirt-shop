// Renders homepage hero and story images from the product PNGs: images/hero.png, images/story.png.
// Usage: node scripts/render-hero.mjs
import { chromium } from 'playwright-core';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const img = async (f) => 'data:image/png;base64,' + (await readFile(path.join(root, 'images', 'cutout', f))).toString('base64');

const hero = [
  ['linen-blend-shirt-sand.png', 3, 8, -8],
  ['everyday-cotton-tee-sage.png', 20, 16, 6],
  ['oversized-fleece-hoodie-mocha.png', 37, 4, -4],
  ['saigon-skyline-graphic-tee-white.png', 54, 14, 7],
  ['classic-pique-polo-navy.png', 71, 6, -6],
];
const story = [
  ['heavyweight-boxy-tee-cream.png', 8, 14, -10],
  ['womens-relaxed-v-neck-lavender.png', 38, 4, 8],
  ['kids-basic-tee-sunflower.png', 62, 30, -5],
];

const scene = async (w, h, bg, items, size) => `<!doctype html><html><body style="margin:0;width:${w}px;height:${h}px;overflow:hidden;
  background:${bg};position:relative">
  ${(await Promise.all(items.map(async ([f, x, y, r]) =>
    `<img src="${await img(f)}" style="position:absolute;left:${x}%;top:${y}%;width:${size}px;transform:rotate(${r}deg);
     filter:saturate(1.05)">`))).join('')}
</body></html>`;

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const tab = await browser.newPage();
await tab.setViewportSize({ width: 2400, height: 1100 });
await tab.setContent(await scene(2400, 1100, 'radial-gradient(circle at 30% 30%, #efe3cf, #d9c4a3)', hero, 640));
await tab.screenshot({ path: path.join(root, 'images', 'hero.png') });
await tab.setViewportSize({ width: 1400, height: 1400 });
await tab.setContent(await scene(1400, 1400, 'radial-gradient(circle at 50% 40%, #f0e9dd, #ddd0bb)', story, 640));
await tab.screenshot({ path: path.join(root, 'images', 'story.png') });
await browser.close();
console.log('hero.png, story.png');
