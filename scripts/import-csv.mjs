// Imports a Shopify-format product CSV (the admin export/import layout) via the Admin GraphQL API.
// Upserts by handle, keeps variant options/prices/SKUs/stock, attaches images that can be fetched,
// and tags every product with `csv-import` so a test batch is easy to find or remove.
// Usage: node --env-file=.env scripts/import-csv.mjs <file.csv> [--dry-run]
import { readFile } from 'node:fs/promises';

const { SHOP, CLIENT_ID, CLIENT_SECRET, API_VERSION = '2026-10' } = process.env;
const file = process.argv[2];
const dryRun = process.argv.includes('--dry-run');
if (!file) throw new Error('usage: import-csv.mjs <file.csv> [--dry-run]');

// RFC 4180 parser: quoted fields, escaped quotes, newlines inside quotes.
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows.filter((r) => r.some((c) => c.trim()));
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

// Group rows by handle into products; the first row of a handle carries product fields and option names.
function toProducts(rows) {
  const byHandle = new Map();
  for (const r of rows) {
    if (!r.Handle) continue;
    let p = byHandle.get(r.Handle);
    if (!p) {
      p = { handle: r.Handle, title: r.Title, body: r['Body (HTML)'], vendor: r.Vendor, type: r.Type,
        tags: r.Tags ? r.Tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
        status: (r.Status || 'active').toUpperCase(), optionNames: [], variants: [], images: [] };
      for (const n of [1, 2, 3]) if (r[`Option${n} Name`]) p.optionNames.push(r[`Option${n} Name`]);
      byHandle.set(r.Handle, p);
    }
    const values = p.optionNames.map((_, i) => r[`Option${i + 1} Value`]);
    if (values.some(Boolean) || r['Variant SKU'] || r['Variant Price']) {
      p.variants.push({ values, sku: r['Variant SKU'], price: r['Variant Price'], compareAt: r['Variant Compare At Price'] || null,
        qty: Number(r['Variant Inventory Qty'] || 0), tracked: r['Variant Inventory Tracker'] === 'shopify',
        policy: (r['Variant Inventory Policy'] || 'deny').toUpperCase(), requiresShipping: r['Variant Requires Shipping'] !== 'FALSE',
        taxable: r['Variant Taxable'] !== 'FALSE' });
    }
    if (r['Image Src']) p.images.push({ src: r['Image Src'], alt: r['Image Alt Text'] || p.title, pos: Number(r['Image Position'] || 99) });
  }
  return [...byHandle.values()];
}

async function reachable(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(8000) });
    return res.ok && (res.headers.get('content-type') || '').startsWith('image/');
  } catch { return false; }
}

const products = toProducts(parseCsv(await readFile(file, 'utf8')));
const problems = [];
for (const p of products) {
  if (!p.title) problems.push(`${p.handle}: missing Title on first row`);
  for (const v of p.variants) if (!v.price || isNaN(Number(v.price))) problems.push(`${p.handle} ${v.sku}: bad price "${v.price}"`);
  const combos = p.variants.map((v) => v.values.join(' / '));
  const dupes = combos.filter((c, i) => combos.indexOf(c) !== i);
  if (dupes.length) problems.push(`${p.handle}: duplicate variants ${dupes.join(', ')}`);
}
for (const p of products) console.log(`${p.handle}: ${p.variants.length} variants, options [${p.optionNames.join(', ')}], ${p.images.length} images`);
if (problems.length) { console.log('problems:\n  ' + problems.join('\n  ')); process.exit(1); }
if (dryRun) process.exit(0);

// --- API
const tokenRes = await fetch(`https://${SHOP}/admin/oauth/access_token`, { method: 'POST',
  body: new URLSearchParams({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET }) });
const { access_token: token } = await tokenRes.json();
if (!token) throw new Error(`token: ${tokenRes.status}`);
async function gql(query, variables = {}) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://${SHOP}/admin/api/${API_VERSION}/graphql.json`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token }, body: JSON.stringify({ query, variables }) });
    const body = await res.json();
    if (body.errors?.some((e) => e.extensions?.code === 'THROTTLED') && attempt < 5) { await new Promise((r) => setTimeout(r, 2000)); continue; }
    if (body.errors) throw new Error(JSON.stringify(body.errors));
    return body.data;
  }
}
const ctx = await gql(`{ locations(first: 1) { nodes { id } } publications(first: 20) { nodes { id name } } }`);
const locationId = ctx.locations.nodes[0].id;
const onlineStore = ctx.publications.nodes.find((p) => p.name === 'Online Store');

const skipped = [];
for (const p of products) {
  const images = [];
  for (const img of p.images.sort((a, b) => a.pos - b.pos)) {
    if (await reachable(img.src)) images.push(img); else skipped.push(img.src);
  }
  // Products without options still need Shopify's default "Title" option.
  const optionNames = p.optionNames.length ? p.optionNames : ['Title'];
  const variants = p.variants.map((v) => ({
    optionValues: optionNames.map((name, i) => ({ optionName: name, name: v.values[i] || 'Default Title' })),
    price: v.price, compareAtPrice: v.compareAt, sku: v.sku || null, taxable: v.taxable, inventoryPolicy: v.policy,
    inventoryItem: { tracked: v.tracked, requiresShipping: v.requiresShipping },
    inventoryQuantities: v.tracked ? [{ locationId, name: 'available', quantity: v.qty }] : undefined,
  }));
  const input = {
    handle: p.handle, title: p.title, descriptionHtml: p.body, vendor: p.vendor, productType: p.type,
    tags: [...new Set([...p.tags, 'csv-import'])], status: p.status,
    productOptions: optionNames.map((name, i) => ({ name, values: [...new Set(variants.map((v) => v.optionValues[i].name))].map((n) => ({ name: n })) })),
    files: images.map((img) => ({ originalSource: img.src, alt: img.alt, contentType: 'IMAGE' })),
    variants,
  };
  const r = (await gql(`mutation($identifier: ProductSetIdentifiers, $input: ProductSetInput!) {
      productSet(synchronous: true, identifier: $identifier, input: $input) { product { id } userErrors { field message } } }`,
    { identifier: { handle: p.handle }, input })).productSet;
  if (r.userErrors.length) { console.log(`FAIL ${p.handle}: ${JSON.stringify(r.userErrors)}`); continue; }
  if (onlineStore && p.status === 'ACTIVE') {
    await gql(`mutation($id: ID!, $input: [PublicationInput!]!) { publishablePublish(id: $id, input: $input) { userErrors { message } } }`,
      { id: r.product.id, input: [{ publicationId: onlineStore.id }] });
  }
  console.log(`ok ${p.handle}: ${variants.length} variants, ${images.length}/${p.images.length} images`);
}
if (skipped.length) console.log(`images skipped (not reachable or not an image):\n  ${skipped.join('\n  ')}`);
