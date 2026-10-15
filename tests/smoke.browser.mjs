// Browser smoke test for Atlas (index.html) over file:// in headless Chromium.
// Run: npm i --no-save playwright-core && node tests/smoke.browser.mjs
// Uses an installed Playwright Chromium; set CHROME=<path to chrome.exe> to use another browser.
// Screenshots go to <tmp>/atlas-smoke. Exits non-zero on any failed step or console error.
import { chromium } from 'playwright-core';
import { readFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const OUT = join(tmpdir(), 'atlas-smoke'); mkdirSync(OUT, { recursive: true });
const pwDir = join(process.env.LOCALAPPDATA || '', 'ms-playwright');
const chromiumDir = (() => { try { return readdirSync(pwDir).filter(d => /^chromium-\d+$/.test(d)).sort().pop(); } catch (e) { return null; } })();
const exe = process.env.CHROME || (chromiumDir ? join(pwDir, chromiumDir, 'chrome-win64', 'chrome.exe') : undefined);
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
const step = async (name, fn) => { try { await fn(); console.log('ok  ', name); } catch (e) { console.log('FAIL', name, '-', e.message.split('\n')[0]); errors.push(`${name}: ${e.message.split('\n')[0]}`); } };
const shot = n => page.screenshot({ path: join(OUT, `${n}.png`) });
const A = (fn, arg) => page.evaluate(fn, arg);

await page.goto(`file:///${ROOT}/index.html`);
await page.waitForFunction(() => window.__atlasBooted && window.Atlas.map?.loaded(), null, { timeout: 60000 });
await page.evaluate(() => { delete window.showSaveFilePicker; delete window.showOpenFilePicker; });
await page.waitForTimeout(1500);
await shot('01-empty-dark');

await step('import samples', async () => {
  await page.setInputFiles('#file-input', ['alp_sample.zip', 'projects_sample.kmz', 'construction.geojson', 'navaids.csv'].map(f => `${ROOT}/samples/${f}`));
  await page.waitForFunction(() => window.Atlas.S.layers.length === 4, null, { timeout: 30000 });
  const info = await A(() => window.Atlas.S.layers.map(l => `${l.name}:${l.data.features.length}f/${l.fields.length}fl`));
  console.log('     layers', info.join(' | '));
});
await page.keyboard.press('Home'); await page.waitForTimeout(2500);
await shot('02-loaded');

await step('select feature + inspector', async () => {
  await A(() => { const l = window.Atlas.S.layers.find(x => x.data.features.some(f => /Polygon/.test(f.geometry.type))); window.Atlas.select(l.id, [l.data.features[0].properties._fid], { zoom: true }); });
  await page.waitForTimeout(1200);
  if (!(await page.$('#right-body .attrs'))) throw new Error('no attribute form');
});
await step('open table, add field via UI, edit cell inline', async () => {
  await page.keyboard.press('Backslash'); await page.waitForTimeout(300);
  await page.click('#tb-add');
  await page.fill('#nf-name', 'owner'); await page.fill('#nf-def', 'City');
  await page.click('.modal [data-ok]');
  const l = await A(() => { const l = window.Atlas.S.layers.find(x => x.id === window.Atlas.S.ui.tableLayer); return { n: l.fields.length, has: l.fields.some(f => f.name === 'owner'), v: l.data.features[0].properties.owner }; });
  if (!l.has || l.v !== 'City') throw new Error('add field failed ' + JSON.stringify(l));
  const td = page.locator('#tb-body tr.r').first().locator('td[data-k="owner"]');
  await td.dblclick(); await page.keyboard.press('Control+A'); await page.keyboard.type('Airport Authority'); await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  const v = await A(() => { const l = window.Atlas.S.layers.find(x => x.id === window.Atlas.S.ui.tableLayer); return window.Atlas.S.layers && l.data.features.find(f => f.properties.owner === 'Airport Authority') ? 1 : 0; });
  if (!v) throw new Error('inline edit failed');
});
await shot('03-table-edit');
await step('undo restores value; rename + retype field', async () => {
  await A(() => window.Atlas.undo());
  const back = await A(() => { const l = window.Atlas.S.layers.find(x => x.id === window.Atlas.S.ui.tableLayer); return l.data.features.every(f => f.properties.owner === 'City'); });
  if (!back) throw new Error('undo did not restore');
  const r = await A(() => { const A = window.Atlas, l = A.S.layers.find(x => x.id === A.S.ui.tableLayer); A.renameField(l, 'owner', 'owner_name'); A.addField(l, 'score', 'text', '7'); A.retypeField(l, 'score', 'number'); return [l.fields.map(f => f.name + ':' + f.type).join(','), l.data.features[0].properties.score]; });
  if (!/owner_name/.test(r[0]) || r[1] !== 7) throw new Error(JSON.stringify(r));
});
await step('edit shape via E then Enter', async () => {
  await page.keyboard.press('Escape');
  await A(() => { const l = window.Atlas.S.layers.find(x => x.data.features.some(f => f.geometry.type === 'Polygon')); window.Atlas.select(l.id, [l.data.features.find(f => f.geometry.type === 'Polygon').properties._fid], { zoom: true }); });
  await page.waitForTimeout(1000);
  await page.mouse.move(700, 450);
  await page.keyboard.press('e'); await page.waitForTimeout(500);
  if (!(await A(() => !!window.Atlas.S.editing))) throw new Error('not editing');
  await shot('04-editing');
  await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  if (await A(() => !!window.Atlas.S.editing)) throw new Error('still editing');
});
await step('draw a polygon into the target layer', async () => {
  const before = await A(() => window.Atlas.S.layers.find(l => l.id === window.Atlas.S.ui.activeLayer).data.features.length);
  await page.keyboard.press('Escape'); await page.keyboard.press('r'); await page.waitForTimeout(300);
  await page.mouse.click(600, 400); await page.mouse.move(700, 480, { steps: 5 }); await page.mouse.click(700, 480);
  await page.waitForTimeout(600);
  const after = await A(() => window.Atlas.S.layers.find(l => l.id === window.Atlas.S.ui.activeLayer).data.features.length);
  if (after !== before + 1) throw new Error(`features ${before} → ${after}`);
});
await step('GIS area lock / unlock', async () => {
  await A(() => window.Atlas.setArea({ name: 'Test area', bbox: [-87.95, 41.95, -87.86, 42.01] }));
  await page.waitForTimeout(1500);
  const mb = await A(() => window.Atlas.map.getMaxBounds()?.toArray());
  if (!mb) throw new Error('no max bounds');
  await shot('05-area-locked');
  await A(() => window.Atlas.setArea(null));
  if (await A(() => window.Atlas.map.getMaxBounds())) throw new Error('bounds not cleared');
});
await step('light theme', async () => { await page.keyboard.press('Escape'); await page.click('#btn-theme'); await page.waitForTimeout(2500); await shot('06-light'); });
await step('menus render (area, layer, export center)', async () => {
  await page.click('#btn-area'); await page.waitForTimeout(250); await shot('07-area-menu'); await page.keyboard.press('Escape');
  await page.click('#btn-export'); await page.waitForTimeout(400); await shot('08-export-center'); await page.keyboard.press('Escape');
});

let shpPath;
await step('shapefile export (download)', async () => {
  const id = await A(() => window.Atlas.S.layers.find(l => l.fields.some(f => f.name === 'owner_name')).id);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), A(id => window.Atlas.makeDataExport({ update() {} }, { layers: [id], format: 'shp', file: 't' }), id)]);
  shpPath = join(OUT, dl.suggestedFilename()); await dl.saveAs(shpPath);
  console.log('     saved', dl.suggestedFilename());
});
await step('shapefile round-trip re-import', async () => {
  const n0 = await A(() => window.Atlas.S.layers.length);
  await page.setInputFiles('#file-input', shpPath);
  await page.waitForFunction(n => window.Atlas.S.layers.length > n, n0, { timeout: 30000 });
  const r = await A(() => { const src = window.Atlas.S.layers.find(l => l.fields.some(f => f.name === 'owner_name')), back = window.Atlas.S.layers[0];
    return { src: src.data.features.length, back: back.data.features.length, fields: back.fields.map(f => f.name + ':' + f.type).join(','), v: back.data.features[0].properties.owner_name, score: back.data.features[0].properties.score }; });
  console.log('     round-trip', JSON.stringify(r));
  if (r.v !== 'City' || r.score !== 7) throw new Error('values changed');
});
await step('closed layers panel reopens from the edge tab', async () => {
  await page.keyboard.press('BracketLeft'); await page.waitForTimeout(200);
  if (!(await page.isVisible('#reopen-left'))) throw new Error('no edge tab');
  await page.click('#reopen-left'); await page.waitForTimeout(200);
  if (await A(() => document.body.classList.contains('no-left'))) throw new Error('panel still closed');
});
await step('project package: export, then reopen from the .zip', async () => {
  const before = await A(() => window.Atlas.S.layers.map(l => `${l.name}:${l.data.features.length}:${l.fields.length}`).sort().join('|'));
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), A(() => window.Atlas.makePackage({ update() {} }, { file: 'smoke-project' }))]);
  const pkg = join(OUT, dl.suggestedFilename()); await dl.saveAs(pkg);
  const listing = await A(async b64 => Object.keys((await JSZip.loadAsync(b64, { base64: true })).files).filter(n => !n.endsWith('/')), readFileSync(pkg).toString('base64'));
  console.log('     package', dl.suggestedFilename(), `${listing.length} files:`, listing.filter(n => /\.(json|txt)$|_polygons\.shp$/.test(n)).join(', '));
  if (!listing.some(n => /smoke-project\.atlas\.json$/.test(n)) || !listing.some(n => /shapefiles\/.+\.dbf$/.test(n))) throw new Error('package incomplete');
  await A(() => { window.Atlas.S.workspace.dirty = false; });
  await page.setInputFiles('#file-input', pkg);
  await page.waitForFunction(() => window.Atlas.S.workspace.name !== 'Untitled workspace' || window.Atlas.S.layers.length, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  const after = await A(() => window.Atlas.S.layers.map(l => `${l.name}:${l.data.features.length}:${l.fields.length}`).sort().join('|'));
  if (after !== before) throw new Error(`reopened project differs\n${before}\n${after}`);
});
await step('map print PNG', async () => {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 90000 }), A(() => window.Atlas.makeExhibit({ update() {} }, { page: 'letter', basemap: 'light', layers: window.Atlas.S.layers.map(l => l.id), labels: true, mask: false, area: 'view', title: 'Smoke', subtitle: '', org: '', by: '', number: '', date: 'today', notes: '', format: 'png', file: 'smoke' }))]);
  await dl.saveAs(join(OUT, 'print.png'));
});
await step('open old ORD v1 workspace (migration)', async () => {
  const ws = JSON.parse(readFileSync(`${ROOT}/tests/fixtures/ord-v1-workspace.json`, 'utf8'));
  await A(ws => window.Atlas.loadWorkspace(ws), ws);
  await page.waitForTimeout(3000);
  const r = await A(() => { const S = window.Atlas.S, d = S.layers.find(l => l.fields.some(f => f.name === 'start_date'));
    return { n: S.layers.length, std: S.layers.some(l => l.data.features.some(f => Object.keys(f.properties).some(k => k.startsWith('std_')))), area: S.ui.area?.name,
             drawingFields: d?.fields.map(f => f.name + ':' + f.type).join(',') }; });
  console.log('     migrated', JSON.stringify(r));
  if (r.n !== 3 || r.std || r.area !== 'Focus area' || !/name:text/.test(r.drawingFields || '') || !/start_date:date/.test(r.drawingFields || '')) throw new Error('migration incomplete');
  await shot('09-migrated');
});
await step('lone .shp finds its .dbf/.prj in a granted folder', async () => {
  // The private file system (a stand-in for the folder the user grants) is blocked on file://, so serve this step over http.
  const types = { '.html': 'text/html', '.zip': 'application/zip' };
  const srv = createServer((q, s) => { try { const f = join(ROOT, decodeURIComponent(q.url.split('?')[0])); s.writeHead(200, { 'content-type': types[extname(f)] || 'application/octet-stream' }); s.end(readFileSync(f)); } catch (e) { s.writeHead(404); s.end(); } });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const p2 = await ctx.newPage();
  p2.on('pageerror', e => errors.push('pageerror (http): ' + e.message));
  try {
    await p2.goto(`http://127.0.0.1:${srv.address().port}/index.html`);
    await p2.waitForFunction(() => window.__atlasBooted && window.Atlas.map?.loaded(), null, { timeout: 60000 });
    const zip = readFileSync(`${ROOT}/samples/alp_sample.zip`).toString('base64');
    const r = await p2.evaluate(async b64 => {
    // a private-file-system folder stands in for the folder the user granted with the picker
    const z = await JSZip.loadAsync(b64, { base64: true }), root = await navigator.storage.getDirectory(), dir = await root.getDirectoryHandle('shp-test', { create: true });
    let shpH;
    for (const n of Object.keys(z.files).filter(n => /\.(shp|dbf|prj)$/i.test(n))) {
      const h = await dir.getFileHandle(n.split('/').pop(), { create: true }), w = await h.createWritable();
      await w.write(await z.file(n).async('uint8array')); await w.close();
      if (/\.shp$/i.test(n)) shpH = h;
    }
    window.Atlas.shpDirs.push(dir);
    const n0 = window.Atlas.S.layers.length;
    await window.Atlas.handleFiles([Object.assign(await shpH.getFile(), { _handle: shpH })], { noZoom: true });
    const l = window.Atlas.S.layers[0];
    return { added: window.Atlas.S.layers.length - n0, fields: l.fields.length, crs: l.source.crs };
    }, zip);
    console.log('     sidecars', JSON.stringify(r));
    if (r.added !== 1 || !r.fields || r.crs !== 'from .prj') throw new Error('sidecars not loaded');
  } finally { await p2.close(); srv.close(); }
});
console.log(errors.length ? `\nERRORS (${errors.length}):\n` + errors.join('\n') : '\nNo console errors');
console.log(`Screenshots: ${OUT}`);
await browser.close();
process.exit(errors.length ? 1 : 0);
