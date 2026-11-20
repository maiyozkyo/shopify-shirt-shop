// Seeds the store from data/products.json via the Admin GraphQL API. Safe to re-run (upserts by handle).
// Usage: node --env-file=.env scripts/import.mjs [--only=<handle>] [--steps=products,collections,files,pages,menus]
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { SHOP, CLIENT_ID, CLIENT_SECRET, API_VERSION = '2026-10' } = process.env;
if (!SHOP || !CLIENT_ID || !CLIENT_SECRET) throw new Error('Set SHOP, CLIENT_ID, CLIENT_SECRET in .env');
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
const stepsArg = process.argv.find((a) => a.startsWith('--steps='))?.slice(8);
const run = (step) => !stepsArg || stepsArg.split(',').includes(step);

const data = JSON.parse(await readFile(path.join(root, 'data/products.json'), 'utf8'));
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const STOCK = { S: 25, M: 40, L: 35, XL: 15, XS: 15, '4Y': 12, '6Y': 18, '8Y': 18, '10Y': 10 };

// Client credentials grant: works for an app installed on a store in the same organization.
async function getToken() {
  const res = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) throw new Error(`token: ${res.status} ${JSON.stringify(body)}`);
  console.log(`token ok, scopes: ${body.scope}`);
  return body;
}
const { access_token: token, scope: scopes = '' } = await getToken();

async function gql(query, variables = {}) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://${SHOP}/admin/api/${API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query, variables }),
    });
    const body = await res.json();
    const throttled = body.errors?.some((e) => e.extensions?.code === 'THROTTLED');
    if (throttled && attempt < 5) { await new Promise((r) => setTimeout(r, 2000)); continue; }
    if (body.errors) throw new Error(JSON.stringify(body.errors));
    return body.data;
  }
}
function check(result, label) {
  const errs = result?.userErrors ?? [];
  if (errs.length) throw new Error(`${label}: ${JSON.stringify(errs)}`);
  return result;
}

// --- store context
const ctx = await gql(`{ locations(first: 5) { nodes { id name } } publications(first: 20) { nodes { id name } } }`);
const locationId = ctx.locations.nodes[0].id;
const onlineStore = ctx.publications.nodes.find((p) => p.name === 'Online Store');
if (!onlineStore) throw new Error('Online Store publication not found (scope write_publications?)');
const publish = async (id) =>
  check((await gql(`mutation($id: ID!, $input: [PublicationInput!]!) { publishablePublish(id: $id, input: $input) { userErrors { field message } } }`,
    { id, input: [{ publicationId: onlineStore.id }] })).publishablePublish, `publish ${id}`);

// --- image upload via staged uploads
async function upload(file) {
  const full = path.join(root, 'images', file);
  const { size } = await stat(full);
  const r = check((await gql(`mutation($input: [StagedUploadInput!]!) { stagedUploadsCreate(input: $input) {
      stagedTargets { url resourceUrl parameters { name value } } userErrors { field message } } }`,
    { input: [{ filename: file, mimeType: 'image/png', httpMethod: 'POST', resource: 'IMAGE', fileSize: String(size) }] })).stagedUploadsCreate, 'staged');
  const t = r.stagedTargets[0];
  const form = new FormData();
  for (const p of t.parameters) form.append(p.name, p.value);
  form.append('file', new Blob([await readFile(full)], { type: 'image/png' }), file);
  const res = await fetch(t.url, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`upload ${file}: ${res.status} ${await res.text()}`);
  return t.resourceUrl;
}

// --- products
const PRODUCT_SET = `mutation($identifier: ProductSetIdentifiers, $input: ProductSetInput!) {
  productSet(synchronous: true, identifier: $identifier, input: $input) {
    product { id handle } userErrors { field message code } } }`;

for (const p of run('products') ? data.products : []) {
  if (only && p.handle !== only) continue;
  const files = {};
  for (const c of p.colors) {
    const filename = `${p.handle}-${slug(c)}.png`;
    files[c] = { originalSource: await upload(filename), alt: `${p.title} - ${c}`, contentType: 'IMAGE', filename };
  }
  const variants = p.colors.flatMap((c) => p.sizes.map((s) => ({
    optionValues: [{ optionName: 'Color', name: c }, { optionName: 'Size', name: s }],
    price: p.price,
    compareAtPrice: p.compareAt,
    sku: `ST-${p.handle.split('-').map((w) => w[0]).join('').toUpperCase()}-${slug(c).slice(0, 3).toUpperCase()}-${s}`,
    inventoryItem: { tracked: true },
    inventoryQuantities: [{ locationId, name: 'available', quantity: STOCK[s] ?? 20 }],
    file: files[c],
  })));
  const input = {
    handle: p.handle,
    title: p.title,
    vendor: data.brand,
    productType: p.type,
    tags: p.tags,
    status: 'ACTIVE',
    descriptionHtml: `<p>${p.description}</p><ul><li><strong>Material:</strong> ${p.material}</li><li><strong>Care:</strong> Machine wash cold, hang dry.</li></ul>`,
    productOptions: [
      { name: 'Color', values: p.colors.map((name) => ({ name })) },
      { name: 'Size', values: p.sizes.map((name) => ({ name })) },
    ],
    files: Object.values(files),
    variants,
  };
  const r = check((await gql(PRODUCT_SET, { identifier: { handle: p.handle }, input })).productSet, `productSet ${p.handle}`);
  await publish(r.product.id);
  console.log(`product ${p.handle}: ${variants.length} variants`);
}

// --- smart collections by tag
const collectionIds = {};
for (const c of data.collections) {
  const found = (await gql(`query($q: String!) { collections(first: 1, query: $q) { nodes { id } } }`, { q: `handle:${c.handle}` })).collections.nodes[0];
  const input = { handle: c.handle, title: c.title, descriptionHtml: `<p>${c.description}</p>`,
    ruleSet: { appliedDisjunctively: false, rules: [{ column: 'TAG', relation: 'EQUALS', condition: c.tag }] } };
  let id = found?.id;
  if (!run('collections')) { if (id) collectionIds[c.handle] = id; continue; }
  if (id) {
    check((await gql(`mutation($input: CollectionInput!) { collectionUpdate(input: $input) { userErrors { field message } } }`, { input: { ...input, id } })).collectionUpdate, `collection ${c.handle}`);
  } else {
    id = check((await gql(`mutation($input: CollectionInput!) { collectionCreate(input: $input) { collection { id } userErrors { field message } } }`, { input })).collectionCreate, `collection ${c.handle}`).collection.id;
  }
  await publish(id);
  collectionIds[c.handle] = id;
  console.log(`collection ${c.handle}`);
}

// --- theme images in Files (referenced by the theme as shopify://shop_images/<name>)
for (const name of run('files') ? ['hero.png', 'story.png'] : []) {
  const existing = (await gql(`query($q: String!) { files(first: 1, query: $q) { nodes { id } } }`, { q: `filename:${name}` })).files.nodes[0];
  if (existing) { console.log(`file ${name} exists`); continue; }
  const src = await upload(name);
  check((await gql(`mutation($files: [FileCreateInput!]!) { fileCreate(files: $files) { files { id } userErrors { field message } } }`,
    { files: [{ originalSource: src, filename: name, contentType: 'IMAGE', alt: 'Saigon Thread tees and shirts' }] })).fileCreate, `file ${name}`);
  console.log(`file ${name}`);
}

// --- pages (needs write_content)
const canPages = scopes.split(',').includes('write_content');
if (run('pages') && !canPages) console.log('pages skipped: app lacks write_content');
const PAGES = [
  { handle: 'about', title: 'About Saigon Thread', body: `<p><em>Saigon Thread is a fictional brand made for a Shopify demo store.</em></p><p>We make easy, breathable basics for hot days and cool air-conditioned evenings: honest fabrics, simple cuts, and colours that go with everything.</p>` },
  { handle: 'size-guide', title: 'Size Guide', body: `<table><thead><tr><th>Size</th><th>Chest (cm)</th><th>Length (cm)</th></tr></thead><tbody>
    <tr><td>XS</td><td>86–90</td><td>64</td></tr><tr><td>S</td><td>90–96</td><td>68</td></tr><tr><td>M</td><td>96–102</td><td>71</td></tr>
    <tr><td>L</td><td>102–108</td><td>74</td></tr><tr><td>XL</td><td>108–116</td><td>77</td></tr></tbody></table><p>Between sizes? Size up for a relaxed fit.</p>` },
];
const pageIds = {};
for (const pg of canPages ? PAGES : []) {
  const found = (await gql(`query($q: String!) { pages(first: 1, query: $q) { nodes { id } } }`, { q: `handle:${pg.handle}` })).pages.nodes[0];
  if (!run('pages')) { if (found) pageIds[pg.handle] = found.id; continue; }
  if (found) {
    check((await gql(`mutation($id: ID!, $page: PageUpdateInput!) { pageUpdate(id: $id, page: $page) { userErrors { field message } } }`,
      { id: found.id, page: { title: pg.title, body: pg.body, isPublished: true } })).pageUpdate, `page ${pg.handle}`);
    pageIds[pg.handle] = found.id;
  } else {
    pageIds[pg.handle] = check((await gql(`mutation($page: PageCreateInput!) { pageCreate(page: $page) { page { id } userErrors { field message } } }`,
      { page: { handle: pg.handle, title: pg.title, body: pg.body, isPublished: true } })).pageCreate, `page ${pg.handle}`).page.id;
  }
  console.log(`page ${pg.handle}`);
}

// --- navigation
if (!run('menus') || !canPages) { console.log(run('menus') ? 'menus skipped: need pages first' : 'done'); process.exit(0); }
const menus = (await gql(`{ menus(first: 10) { nodes { id handle title } } }`)).menus.nodes;
const setMenu = async (handle, items) => {
  const m = menus.find((x) => x.handle === handle);
  if (!m) return console.log(`menu ${handle} not found, skipped`);
  check((await gql(`mutation($id: ID!, $title: String!, $handle: String, $items: [MenuItemUpdateInput!]!) {
      menuUpdate(id: $id, title: $title, handle: $handle, items: $items) { userErrors { field message } } }`,
    { id: m.id, title: m.title, handle, items })).menuUpdate, `menu ${handle}`);
  console.log(`menu ${handle}`);
};
const col = (title, h) => ({ title, type: 'COLLECTION', resourceId: collectionIds[h] });
await setMenu('main-menu', [
  { title: 'Shop all', type: 'CATALOG' },
  col('Men', 'men'), col('Women', 'women'), col('Kids', 'kids'),
  col('New arrivals', 'new-arrivals'), col('Best sellers', 'best-sellers'),
  { title: 'About', type: 'PAGE', resourceId: pageIds.about },
]);
await setMenu('footer', [
  { title: 'Size guide', type: 'PAGE', resourceId: pageIds['size-guide'] },
  { title: 'About', type: 'PAGE', resourceId: pageIds.about },
  { title: 'Search', type: 'SEARCH' },
]);
console.log('done');
