// Renders one flat-lay product image per product x colour from SVG, to images/<handle>-<color>.png.
// Usage: node scripts/render-images.mjs
import { chromium } from 'playwright-core';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const data = JSON.parse(await readFile(path.join(root, 'data/products.json'), 'utf8'));
const outDir = path.join(root, 'images');
await mkdir(path.join(outDir, 'cutout'), { recursive: true });

export const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v + amt * 255))));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}
const isLight = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 150;
};

// Garment outlines in a 400x500 box.
const SHORT_SLEEVE = 'M140,58 Q200,92 260,58 L330,84 L388,172 L336,198 L310,168 L312,462 Q200,472 88,462 L90,168 L64,198 L12,172 L70,84 Z';
const CROP = 'M146,70 Q200,100 254,70 L318,92 L366,166 L322,188 L300,166 L302,360 Q200,372 98,360 L100,166 L78,188 L34,166 L82,92 Z';
const LONG_SLEEVE = 'M140,58 Q200,92 260,58 L332,84 L372,250 L392,420 L346,430 L318,268 L312,200 L312,462 Q200,472 88,462 L88,200 L82,268 L54,430 L8,420 L28,250 L68,84 Z';
const HOODIE = 'M132,70 Q200,104 268,70 L338,96 L376,260 L394,430 L346,440 L320,280 L314,210 L316,468 Q200,478 84,468 L86,210 L80,280 L54,440 L6,430 L24,260 L62,96 Z';

function garment(p, colorName, hex) {
  const dark = shade(hex, -0.12);
  const darker = shade(hex, -0.22);
  const ink = isLight(hex) ? '#2b2b2b' : '#f1efe9';
  const fill = p.stripe && colorName === 'Blue Stripe' ? 'url(#stripe)' : hex;
  const shapes = { tee: SHORT_SLEEVE, vneck: SHORT_SLEEVE, polo: SHORT_SLEEVE, crop: CROP, shirt: LONG_SLEEVE, hoodie: HOODIE };
  const body = shapes[p.shape];
  let extra = '';

  if (p.shape === 'tee') extra += `<path d="M140,58 Q200,92 260,58 Q200,108 140,58 Z" fill="${darker}"/>`;
  if (p.shape === 'crop') extra += `<path d="M146,70 Q200,100 254,70 Q200,112 146,70 Z" fill="${darker}"/>`;
  if (p.shape === 'vneck') extra += `<path d="M140,58 L200,140 L260,58 L246,58 L200,122 L154,58 Z" fill="${darker}"/><path d="M154,58 L200,122 L246,58 Q200,80 154,58 Z" fill="${shade(hex, -0.3)}" opacity=".5"/>`;
  if (p.shape === 'polo') {
    extra += `<path d="M140,58 L118,96 L178,118 L200,86 Z" fill="${dark}" stroke="${darker}" stroke-width="2"/>
      <path d="M260,58 L282,96 L222,118 L200,86 Z" fill="${dark}" stroke="${darker}" stroke-width="2"/>
      <rect x="190" y="88" width="20" height="86" rx="3" fill="${dark}"/>
      <circle cx="200" cy="120" r="4" fill="${ink}" opacity=".7"/><circle cx="200" cy="150" r="4" fill="${ink}" opacity=".7"/>
      <path d="M312,166 L336,196" stroke="${darker}" stroke-width="8"/><path d="M88,166 L64,196" stroke="${darker}" stroke-width="8"/>`;
  }
  if (p.shape === 'shirt') {
    extra += `<path d="M140,58 L122,100 L184,124 L200,88 Z" fill="${dark}" stroke="${darker}" stroke-width="2"/>
      <path d="M260,58 L278,100 L216,124 L200,88 Z" fill="${dark}" stroke="${darker}" stroke-width="2"/>
      <line x1="200" y1="96" x2="200" y2="466" stroke="${darker}" stroke-width="2"/>
      ${[150, 210, 270, 330, 390].map((y) => `<circle cx="207" cy="${y}" r="4.5" fill="${shade(hex, -0.35)}"/>`).join('')}
      <path d="M346,430 L392,420 L388,398 L344,406 Z" fill="${dark}"/><path d="M54,430 L8,420 L12,398 L56,406 Z" fill="${dark}"/>
      <rect x="232" y="150" width="46" height="52" rx="4" fill="none" stroke="${darker}" stroke-width="2"/>`;
  }
  if (p.shape === 'hoodie') {
    extra += `<path d="M132,70 Q120,10 200,6 Q280,10 268,70 Q200,112 132,70 Z" fill="${dark}"/>
      <path d="M150,70 Q150,30 200,28 Q250,30 250,70 Q200,98 150,70 Z" fill="${shade(hex, -0.3)}"/>
      <line x1="184" y1="92" x2="180" y2="190" stroke="${ink}" stroke-width="4" stroke-linecap="round" opacity=".75"/>
      <line x1="216" y1="92" x2="220" y2="190" stroke="${ink}" stroke-width="4" stroke-linecap="round" opacity=".75"/>
      <path d="M132,330 L268,330 L292,420 L108,420 Z" fill="${dark}" stroke="${darker}" stroke-width="2"/>
      <rect x="84" y="446" width="232" height="24" fill="${dark}"/>
      <path d="M346,440 L394,430 L390,404 L344,412 Z" fill="${dark}"/><path d="M54,440 L6,430 L10,404 L56,412 Z" fill="${dark}"/>`;
  }
  if (p.graphic) {
    // Simple skyline line drawing on the chest.
    extra += `<g fill="none" stroke="${ink}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" transform="translate(130,170)">
      <path d="M0,110 L0,70 L18,70 L18,48 L34,48 L34,82 L50,82 L50,30 L58,30 L58,12 L66,0 L74,12 L74,30 L82,30 L82,90 L96,90 L96,58 L112,58 L112,40 L122,40 L122,76 L140,76 L140,92 L140,110 Z"/>
      <path d="M-10,110 L150,110"/><path d="M-4,122 Q20,116 40,122 T80,122 T120,122 T146,122"/>
      </g>
      <text x="200" y="330" text-anchor="middle" font-family="Georgia, serif" font-size="20" letter-spacing="6" fill="${ink}">SAIGON</text>`;
  }
  // Soft folds for a fabric feel.
  const folds = `<g stroke="${shade(hex, -0.18)}" stroke-width="2" fill="none" opacity=".35" stroke-linecap="round">
      <path d="M150,240 Q160,320 140,420"/><path d="M262,260 Q250,340 268,430"/></g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -20 440 520" width="840" height="990">
    <defs>
      <pattern id="stripe" width="14" height="14" patternUnits="userSpaceOnUse"><rect width="14" height="14" fill="#f6f8fb"/><rect width="5" height="14" fill="#7d9cc6"/></pattern>
      <linearGradient id="light" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".12"/></linearGradient>
      <filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="14" stdDeviation="14" flood-color="#000" flood-opacity=".18"/></filter>
    </defs>
    <g filter="url(#sh)"><path d="${body}" fill="${fill}" stroke="${darker}" stroke-width="1.5"/></g>
    ${folds}${extra}
    <path d="${body}" fill="url(#light)"/>
  </svg>`;
}

const page = (svg, bg) => `<!doctype html><html><body style="margin:0;width:1200px;height:1500px;display:grid;place-items:center;
  background:radial-gradient(circle at 50% 40%, ${bg} 0%, ${shade(bg, -0.06)} 100%)">${svg}</body></html>`;

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const tab = await browser.newPage({ viewport: { width: 1200, height: 1500 } });
let n = 0;
for (const p of data.products) {
  for (const c of p.colors) {
    const hex = data.colors[c];
    const bg = isLight(hex) && c !== 'Sunflower' ? '#e7e3db' : '#f3f0ea';
    await tab.setContent(page(garment(p, c, hex), bg));
    await tab.screenshot({ path: path.join(outDir, `${p.handle}-${slug(c)}.png`) });
    // Transparent cut-out for composites (hero, story).
    await tab.setContent(`<!doctype html><html><body style="margin:0;width:1200px;height:1500px;display:grid;place-items:center;background:transparent">${garment(p, c, hex)}</body></html>`);
    await tab.screenshot({ path: path.join(outDir, 'cutout', `${p.handle}-${slug(c)}.png`), omitBackground: true });
    n++;
  }
}
await browser.close();
console.log(`rendered ${n} images to ${outDir}`);
