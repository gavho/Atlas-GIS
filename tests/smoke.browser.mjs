// Browser smoke test for Atlas (dist/Atlas-GIS.html) over file:// in headless Chromium.
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

await page.goto(`file:///${ROOT}/dist/Atlas-GIS.html`);
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
await step('DWG import: CRS dialog, split by geometry, one color per layer', async () => {
  const n0 = await A(() => window.Atlas.S.layers.length);
  await page.setInputFiles('#file-input', `${ROOT}/samples/cad_sample.dwg`);
  await page.waitForSelector('.modal [data-ok]', { timeout: 90000 }); // first use downloads the ~11 MB WASM reader
  await page.click('.modal [data-ok]'); // EPSG:3435 is the default choice
  await page.waitForFunction(n => window.Atlas.S.layers.length >= n + 4, n0, { timeout: 30000 });
  const r = await A(() => window.Atlas.S.layers.filter(l => l.source?.format === 'dwg').map(l => ({ name: l.name, n: l.data.features.length, by: l.style.styleBy,
    c: l.data.features[0].geometry.coordinates.flat(3).slice(0, 2).map(v => Math.round(v)) })));
  console.log('     dwg', JSON.stringify(r));
  const names = r.map(x => x.name.split(' — ')[1]).sort().join(',');
  if (names !== 'Points,Polygons,Polylines,Text' || r.some(x => x.by)) throw new Error('unexpected DWG layers');
  if (r.some(x => x.c[0] > -80 || x.c[0] < -100 || x.c[1] < 30 || x.c[1] > 45)) throw new Error('not reprojected into Illinois');
  const g = await A(() => ({ groups: [...document.querySelectorAll('#layer-list .lgroup')].map(b => [b.querySelector('.ghead .nm').textContent, b.querySelectorAll('.lrow:not(.ghead)').length]),
    saved: window.Atlas.S.layers.filter(l => l.source?.format === 'dwg').every(l => l.group === 'cad_sample') }));
  console.log('     groups', JSON.stringify(g));
  if (!g.saved || !g.groups.some(([n, k]) => n === 'cad_sample' && k === 4)) throw new Error('DWG layers not grouped');
  await A(() => window.Atlas.zoomToLayer?.(window.Atlas.S.layers[0])); await page.waitForTimeout(2000);
  await shot('10-dwg');
  await page.click('#layer-list .lgroup .ghead .menu-btn'); await page.click('.menu >> text=Focus on this group'); await page.waitForTimeout(500);
  const f = await A(() => ({ bar: !!document.querySelector('#layer-list .focus-bar'), dim: document.querySelectorAll('#layer-list .lrow.dim').length,
    others: window.Atlas.S.layers.filter(l => l.group !== 'cad_sample').length }));
  console.log('     focus', JSON.stringify(f));
  if (!f.bar || f.dim !== f.others) throw new Error('focus did not dim the other layers');
  await shot('11-dwg-focus');
  await page.click('#layer-list .focus-bar button');
  if (await A(() => !!document.querySelector('#layer-list .focus-bar, #layer-list .lrow.dim'))) throw new Error('Show all did not clear focus');
});
await step('category lists stay folded through focus; groups nest by drag', async () => {
  // color the DWG Polylines by CAD layer through the Style dialog
  const pid = await A(() => window.Atlas.S.layers.find(l => /Polylines$/.test(l.name)).id);
  await page.click(`#layer-list .lrow[data-id="${pid}"] .menu-btn`); await page.click('.menu >> text=Style & labels…');
  await page.selectOption('.modal select[data-k="styleBy"]', 'Layer'); await page.click('.modal [data-ok]');
  const lists = () => A(() => window.Atlas.S.layers.filter(l => l.group?.endsWith('cad_sample')).map(l => `${l.name.split(' — ')[1]}:${!!document.querySelector(`#layer-list .lrow[data-id="${l.id}"] + .legend`)}`).join(','));
  if (/true/.test(await lists())) throw new Error('DWG category lists should start folded');
  await page.click('#layer-list .lrow:has(.nm:text-is("Polylines")) .tw');
  const open1 = await lists();
  const other = await A(() => window.Atlas.S.layers.find(l => !l.group).id);
  await page.click(`#layer-list .lrow[data-id="${other}"] .menu-btn`); await page.click('.menu >> text=Focus on this layer');
  await page.click('#layer-list .focus-bar button');
  const open2 = await lists();
  console.log('     lists', open1, '→', open2);
  if (open1 !== open2 || !/Polylines:true/.test(open2)) throw new Error('focus changed which category lists are open');
  // new group "Site" from the layer menu, then drag the DWG group onto it
  await page.click(`#layer-list .lrow[data-id="${other}"] .menu-btn`); await page.click('.menu >> text=New group…');
  await page.fill('.modal input', 'Site'); await page.click('.modal [data-ok]');
  await page.dragAndDrop('#layer-list .ghead:has(.nm:text-is("cad_sample"))', '#layer-list .ghead:has(.nm:text-is("Site"))');
  const paths = await A(() => [...new Set(window.Atlas.S.layers.map(l => l.group))].join(','));
  console.log('     groups', paths);
  if (!/Site\/cad_sample/.test(paths)) throw new Error('drag did not nest the group');
  await shot('12-nested');
});
await step('empty groups from the panel button, filled by drag', async () => {
  await page.click('#btn-new-group'); await page.fill('.modal input', 'Fencing'); await page.click('.modal [data-ok]');
  const head = '#layer-list .ghead:has(.nm:text-is("Fencing"))';
  await page.click(`${head} .menu-btn`); await page.click('.menu >> text=New group inside…'); await page.fill('.modal input', 'Gates'); await page.click('.modal [data-ok]');
  const r1 = await A(() => ({ empty: window.Atlas.S.emptyGroups.join(','), hints: document.querySelectorAll('#layer-list .gempty').length, saved: window.Atlas.serialize().emptyGroups.join(',') }));
  await page.click('#layer-list .ghead:has(.nm:text-is("Site")) .tw'); // fold the long DWG lists so both rows are on screen
  const id = await A(() => window.Atlas.S.layers.find(l => !l.group).id);
  await page.dragAndDrop(`#layer-list .lrow[data-id="${id}"]`, '#layer-list .ghead:has(.nm:text-is("Gates"))');
  const r2 = await A(id => ({ group: window.Atlas.S.layers.find(l => l.id === id).group, hints: document.querySelectorAll('#layer-list .gempty').length }), id);
  console.log('     folders', JSON.stringify(r1), '→', JSON.stringify(r2));
  await shot('17-folders');
  await page.click('#layer-list .ghead:has(.nm:text-is("Site")) .tw');
  if (r1.empty !== 'Fencing,Fencing/Gates' || r1.hints !== 1 || r1.saved !== r1.empty || r2.group !== 'Fencing/Gates' || r2.hints !== 0) throw new Error('empty group flow failed');
});
await step('layer menu groups are collapsed into an expandable tree', async () => {
  const id = await A(() => document.querySelector('#layer-list .lrow[data-id]')?.dataset.id);
  if (!id) throw new Error('no visible layer row found');
  await page.click(`#layer-list .lrow[data-id="${id}"] .menu-btn`);
  const move = page.locator('.menu button[role="menuitem"]', { hasText: 'Move to group…' });
  if (!await move.count()) throw new Error('expandable group action is missing');
  if (/Move to “Site/.test(await page.locator('.menu').innerText())) throw new Error('group destinations still fill the layer menu');
  await move.click();
  if (!await page.locator('.menu-children:not([hidden])').count()) throw new Error('top-level groups did not expand');
  const site = page.locator('.menu-branch-row:has(> button[role="menuitem"]:text-is("Site")) .menu-expand');
  await site.click();
  if (!await page.locator('.menu-branch-row:has(> button[role="menuitem"]:text-is("cad_sample"))').count()) throw new Error('nested groups did not expand');
  await page.keyboard.press('Escape');
});
await step('right-click a category: dashed, thicker, new color', async () => {
  const id = await A(() => window.Atlas.S.layers.find(l => /Polylines$/.test(l.name)).id);
  const cat = page.locator(`#layer-list .lrow[data-id="${id}"] + .legend button`).first();
  const v = await cat.getAttribute('data-v');
  for (const item of ['Dashed line', /^Thicker/, 'New color']) { await cat.click({ button: 'right' }); await page.locator('.menu [role=menuitem]', { hasText: item }).first().click(); }
  const r = await A(([id, v]) => { const l = window.Atlas.S.layers.find(x => x.id === id); return { cat: l.style.cats[v], dashVis: window.Atlas.map.getLayoutProperty(`u-${id}-dash`, 'visibility') }; }, [id, v]);
  console.log('     category', v, JSON.stringify(r));
  if (!r.cat?.dash || !(r.cat.width > 1.6) || !/^#[0-9a-f]{6}$/i.test(r.cat.color || '') || r.dashVis !== 'visible') throw new Error('category style not applied');
  await shot('14-category-style');
});
await step('measure: readable chip and live distance at the cursor', async () => {
  await page.keyboard.press('Escape'); await page.keyboard.press('d');
  await page.mouse.click(700, 300); await page.mouse.click(800, 340); await page.mouse.move(860, 280, { steps: 3 }); await page.waitForTimeout(300);
  const r = await A(() => ({ tip: document.querySelector('#measure-tip:not(.hidden)')?.textContent, bg: getComputedStyle(document.querySelector('#measure-chip')).backgroundColor }));
  console.log('     measure', JSON.stringify(r));
  await shot('15-measure');
  await page.keyboard.press('Escape');
  if (!/\d.*(ft|mi)/.test(r.tip || '') || r.bg === 'rgb(0, 0, 0)') throw new Error('measure tip or chip contrast');
});
await step('export wizard text boxes start empty', async () => {
  await page.click('#btn-export'); await page.click('.card[data-d="print"]');
  await page.click('.modal [data-next]'); // Map → Title block
  const r = await A(() => [...document.querySelectorAll('.modal [data-k="title"], .modal [data-k="subtitle"], .modal [data-k="date"], .modal [data-k="notes"]')].map(i => [i.dataset.k, i.value, i.placeholder]));
  console.log('     title block', JSON.stringify(r));
  await page.keyboard.press('Escape');
  if (r.length !== 4 || r.some(([, val]) => val) || !r.find(([k]) => k === 'title')[2]) throw new Error('prefilled text in export wizard');
});
await step('guided tour walks every step', async () => {
  await page.click('#sb-help'); await page.click('.menu >> text=Guided tours…');
  await page.click('.card[data-t="groups"]');
  let n = 0;
  while (await page.isVisible('#tour')) { if (n === 1) await shot('16-tour'); await page.click('#tour [data-a="next"]'); if (++n > 20) throw new Error('tour did not end'); }
  console.log('     tour steps', n);
  if (n !== 5) throw new Error(`expected 5 steps, saw ${n}`);
});
await step('group eye keeps hidden sub-layers hidden; selection is a blue outline', async () => {
  const head = '#layer-list .ghead:has(.nm:text-is("cad_sample"))';
  const pts = await A(() => window.Atlas.S.layers.find(l => /Points$/.test(l.name)).id);
  await page.click(`#layer-list .lrow[data-id="${pts}"] .vis`); // hide one sub-layer on purpose
  await page.click(`${head} .vis`); await page.click(`${head} .vis`); // group off, then on
  const r = await A(id => { const S = window.Atlas.S, m = window.Atlas.map;
    return { ptsVisible: S.layers.find(l => l.id === id).visible, ptsOnMap: m.getLayoutProperty(`u-${id}-pt`, 'visibility'),
      others: S.layers.filter(l => l.group?.endsWith('cad_sample') && l.id !== id).every(l => l.visible), headerOff: !!document.querySelector('#layer-list .ghead.off') }; }, pts);
  console.log('     group eye', JSON.stringify(r));
  if (r.ptsVisible || r.ptsOnMap !== 'none' || !r.others || r.headerOff) throw new Error('group eye changed sub-layer visibility');
  const poly = await A(() => { const A = window.Atlas, l = A.S.layers.find(x => x.data.features.some(f => f.geometry.type === 'Polygon') && !x.group);
    A.select(l.id, [l.data.features.find(f => f.geometry.type === 'Polygon').properties._fid], { zoom: true }); return l.id; });
  await page.waitForTimeout(1200); await shot('18-selection');
  const paint = await A(id => ({ fill: JSON.stringify(window.Atlas.map.getPaintProperty(`u-${id}-fill`, 'fill-color')), line: JSON.stringify(window.Atlas.map.getPaintProperty(`u-${id}-line`, 'line-color')) }), poly);
  if (/feature-state/.test(paint.fill) || !/feature-state/.test(paint.line)) throw new Error('selection should outline, not fill: ' + JSON.stringify(paint));
  await page.keyboard.press('Escape');
});
await step('saved workspace keeps hidden layers, hidden groups, folded groups and hidden categories', async () => {
  const r = await A(() => {
    const A = window.Atlas, S = A.S, l = S.layers.find(x => /Polylines$/.test(x.name));
    l.visible = false; S.hiddenGroups = ['Site']; S.ui.closedGroups = ['Fencing']; l.style = { ...l.style, hidden: ['Dim'] };
    const ws = JSON.parse(JSON.stringify(A.serialize()));
    A.loadWorkspace(ws);
    const m = S.layers.find(x => x.id === l.id);
    return { visible: m.visible, hiddenGroups: S.hiddenGroups, closed: S.ui.closedGroups, cats: m.style.hidden,
      onMap: A.map.getLayoutProperty(`u-${S.layers.find(x => x.group === 'Site').id}-fill`, 'visibility') };
  });
  console.log('     reopened', JSON.stringify(r));
  if (r.visible !== false || r.hiddenGroups[0] !== 'Site' || r.closed[0] !== 'Fencing' || r.cats?.[0] !== 'Dim' || r.onMap !== 'none') throw new Error('visibility state lost on save');
  await A(() => { const S = window.Atlas.S; S.hiddenGroups = []; S.ui.closedGroups = []; S.layers.forEach(l => { l.visible = true; }); window.Atlas.loadWorkspace(JSON.parse(JSON.stringify(window.Atlas.serialize()))); });
});
await step('drag the panel edges to resize', async () => {
  const w = () => A(() => [getComputedStyle(document.documentElement).getPropertyValue('--left-w'), getComputedStyle(document.documentElement).getPropertyValue('--bottom-h')].join(' '));
  const before = await w();
  for (const [sel, dx, dy] of [['#left > .rsz', 120, 0], ['#bottom > .rsz', 0, -80]]) {
    const b = await page.locator(sel).boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy, { steps: 5 }); await page.mouse.up();
  }
  const after = await w();
  console.log('     sizes', before, '→', after);
  const [l0, b0] = before.split(' ').map(parseFloat), [l1, b1] = after.split(' ').map(parseFloat);
  if (!(l1 > l0 + 100 && b1 > b0 + 60)) throw new Error('panels did not resize');
  await shot('13-resized');
  await A(() => { for (const v of ['--left-w', '--bottom-h']) { document.documentElement.style.removeProperty(v); localStorage.removeItem('atlas' + v); } });
});
await step('lone .shp finds its .dbf/.prj in a granted folder', async () => {
  // The private file system (a stand-in for the folder the user grants) is blocked on file://, so serve this step over http.
  const types = { '.html': 'text/html', '.zip': 'application/zip' };
  const srv = createServer((q, s) => { try { const f = join(ROOT, decodeURIComponent(q.url.split('?')[0])); s.writeHead(200, { 'content-type': types[extname(f)] || 'application/octet-stream' }); s.end(readFileSync(f)); } catch (e) { s.writeHead(404); s.end(); } });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const p2 = await ctx.newPage();
  p2.on('pageerror', e => errors.push('pageerror (http): ' + e.message));
  try {
    await p2.goto(`http://127.0.0.1:${srv.address().port}/dist/Atlas-GIS.html`);
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
