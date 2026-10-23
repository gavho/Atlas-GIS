// Browser smoke test for the ORD ALP over file://: the plain app, then a client folder (scripts/build-client-folder.mjs)
// built from the synthetic samples/ord_alp_sample.atlas.json. Run: node scripts/build-ord-app.mjs && node tests/smoke.ord.mjs
import { chromium } from 'playwright-core';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const OUT = join(tmpdir(), 'ord-smoke'); mkdirSync(OUT, { recursive: true });
const FOLDER = join(OUT, 'client folder').replace(/\\/g, '/');
execFileSync(process.execPath, [`${ROOT}/scripts/build-client-folder.mjs`, '--app', `${ROOT}/dist/ORD-ALP.html`, '--project', `${ROOT}/samples/ord_alp_sample.atlas.json`, '--out', FOLDER, '--changes-only'], { stdio: 'inherit' });

const pw = join(process.env.LOCALAPPDATA || '', 'ms-playwright');
const chromiumDir = (() => { try { return readdirSync(pw).filter(d => /^chromium-\d+$/.test(d)).sort().pop(); } catch (e) { return null; } })();
const browser = await chromium.launch({ executablePath: process.env.CHROME || (chromiumDir ? join(pw, chromiumDir, 'chrome-win64', 'chrome.exe') : undefined), args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
const step = async (name, fn) => { try { await fn(); console.log('ok  ', name); } catch (e) { console.log('FAIL', name, '-', e.message.split('\n')[0]); errors.push(`${name}: ${e.message.split('\n')[0]}`); } };
const shot = n => page.screenshot({ path: join(OUT, `${n}.png`) });
const A = (fn, arg) => page.evaluate(fn, arg);
const booted = () => page.waitForFunction(() => window.__atlasBooted && window.Atlas.map?.loaded(), null, { timeout: 60000 });
const findF = (dwg, cad) => A(([dwg, cad]) => { const l = window.Atlas.S.layers.find(x => x.group?.endsWith('/' + dwg)); return { id: l.id, fid: l.data.features.find(f => f.properties.Layer === cad).properties._fid }; }, [dwg, cad]);
const drawn = dwg => A(dwg => { // distinct features the map actually draws for a drawing's layer
  const m = window.Atlas.map, l = window.Atlas.S.layers.find(x => x.group?.endsWith('/' + dwg));
  const ids = ['fill', 'line', 'pt'].map(k => `u-${l.id}-${k}`).filter(id => m.getLayer(id) && m.getLayoutProperty(id, 'visibility') === 'visible');
  return ids.length ? new Set(m.queryRenderedFeatures({ layers: ids }).map(f => f.properties._fid)).size : 0;
}, dwg);
const settle = () => page.waitForTimeout(900);
const fitAll = () => A(() => { const b = window.turf.bbox({ type: 'FeatureCollection', features: window.Atlas.S.layers.flatMap(l => l.data.features) }); window.Atlas.map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 40, duration: 0 }); });

await step('plain app: ORD branding and start screen', async () => {
  await page.goto(`file:///${ROOT}/dist/ORD-ALP.html`); await booted();
  const r = await A(() => ({ title: document.title, brand: document.querySelector('.brand-name').textContent, h1: document.querySelector('#empty-state h1')?.textContent }));
  if (!r.title.startsWith('ORD ALP') || r.brand !== 'ORD ALP' || !/ORD ALP/.test(r.h1 || '')) throw new Error(JSON.stringify(r));
  await shot('01-start');
});
await step('Open Project imports generated JSON and ZIP project.js bundles without executing scripts', async () => {
  await page.setInputFiles('#ws-input', join(FOLDER, 'project.js'));
  await page.waitForFunction(() => window.Atlas.S.layers.length === 8, null, { timeout: 30000 });
  const sample = JSON.parse(readFileSync(`${ROOT}/samples/ord_alp_sample.atlas.json`, 'utf8'));
  sample.name = 'ORD ALP ZIP sample';
  const zipData = await A(async text => {
    const zip = new JSZip();
    zip.file('ORD ALP/ORD ALP.atlas.json', text);
    return zip.generateAsync({ type: 'base64' });
  }, JSON.stringify(sample));
  const zippedBundle = { id: 'smoke-zip-bundle', name: 'ORD ALP ZIP sample', zip: zipData };
  const zipScript = join(OUT, 'project-zip.js');
  writeFileSync(zipScript, `/* smoke test */\nwindow.ATLAS_BUNDLE = ${JSON.stringify(zippedBundle)};\n`);
  await page.setInputFiles('#ws-input', zipScript);
  await page.waitForFunction(() => window.Atlas.S.workspace.name === 'ORD ALP ZIP sample' && window.Atlas.S.layers.length === 8, null, { timeout: 30000 });
  const malicious = join(OUT, 'not-a-project.js');
  writeFileSync(malicious, 'window.__atlasBundleImportExecuted = true;');
  await page.setInputFiles('#ws-input', malicious);
  await page.waitForFunction(() => [...document.querySelectorAll('#toasts .toast')].some(t => /Couldn't open not-a-project\.js/.test(t.textContent)));
  const executed = await A(() => window.__atlasBundleImportExecuted === true);
  if (executed) throw new Error('a JavaScript file was executed while importing');
});
await step('client folder shows a loading card, then opens its project automatically', async () => {
  await page.goto(`file:///${FOLDER}/Open ORD ALP.html`); await booted();
  const readme = readFileSync(join(FOLDER, 'README.txt'), 'utf8');
  if (!/only your added, imported and sketched layers/.test(readme) || !/Add its layers to the open ALP/.test(readme) || !/separate project\.js bundle/.test(readme)) throw new Error('client instructions do not explain saving and project bundles');
  const card = await A(() => document.querySelector('#empty-state:not(.hidden) h1')?.textContent || 'gone');
  if (!/Loading the ORD ALP|gone/.test(card)) throw new Error('start screen instead of loading card: ' + card);
  await page.waitForFunction(() => window.Atlas.S.layers.length === 8, null, { timeout: 30000 });
  if (await A(() => window.Atlas.getBundleLayerIds()?.size) !== 8) throw new Error('delivered layer IDs were not recorded');
  await page.waitForTimeout(1500);
  const v = await A(() => { const m = window.Atlas.map, c = m.getCenter(); return { lng: +c.lng.toFixed(3), lat: +c.lat.toFixed(3), zoom: +m.getZoom().toFixed(1) }; });
  console.log('      launch view', JSON.stringify(v));
  if (v.zoom < 11 || v.lng < -87.94 || v.lng > -87.87 || v.lat < 41.946 || v.lat > 42.009) throw new Error('did not open on the airport view');
  await fitAll(); await settle();
  if (await drawn('FUT-BLDG-NEW') !== 4) throw new Error('buildings not drawn');
  if (await A(() => !document.querySelector('#empty-state').classList.contains('hidden'))) throw new Error('loading card left open');
  const bad = await A(() => [...document.querySelectorAll('#toasts .toast')].map(t => t.textContent).filter(t => /Couldn/.test(t)));
  if (bad.length) throw new Error(bad.join(' | '));
});
await step('project.js import in the bundled viewer defaults to adding layers', async () => {
  const before = await A(() => window.Atlas.S.layers.length);
  await page.setInputFiles('#ws-input', join(FOLDER, 'project.js'));
  await page.waitForSelector('#modal-root [name="workspace-import"]');
  const selected = await A(() => document.querySelector('#modal-root input[value="merge"]').checked);
  await page.click('#modal-root [data-ok]');
  await page.waitForFunction(n => window.Atlas.S.layers.length === n, before);
  const skipped = await A(() => [...document.querySelectorAll('#toasts .toast')].some(t => /already exist and were skipped/.test(t.textContent)));
  if (!selected || !skipped) throw new Error('project.js did not follow the bundled workspace merge flow');
});
await step('default view: first in Views, cannot be deleted, Home returns to it', async () => {
  await page.click('#btn-views');
  const m = await A(() => { const items = [...document.querySelectorAll('.menu [role=menuitem]')]; return { first: items[0]?.textContent.trim(), del: !!items[0]?.querySelector('.del') }; });
  await page.keyboard.press('Escape');
  if (!/O’Hare airfield \(default\)/.test(m.first) || m.del) throw new Error(JSON.stringify(m));
  await A(() => window.Atlas.map.jumpTo({ center: [-80, 35], zoom: 4 }));
  await page.mouse.move(700, 450); await page.keyboard.press('Home'); await page.waitForTimeout(2500);
  const z = await A(() => window.Atlas.map.getZoom());
  if (z < 11) throw new Error('Home did not return to the airport view: zoom ' + z);
  await fitAll(); await settle();
});
await step('a camera lock never traps the map: refused in this app, released by the default view', async () => {
  const r = await A(() => { const A2 = window.Atlas, ws = JSON.parse(JSON.stringify(A2.serialize()));
    ws.ui.area = { name: 'tiny', bbox: [-87.91, 41.97, -87.90, 41.98] }; A2.loadWorkspace(ws);
    const afterLoad = A2.S.ui.area;                                   // a package or older session carrying a lock
    A2.setArea({ name: 'tiny', bbox: [-87.91, 41.97, -87.90, 41.98] }, { quiet: true });
    const afterSet = A2.S.ui.area;                                    // someone setting one by hand
    A2.S.ui.area = { name: 'tiny', bbox: [-87.91, 41.97, -87.90, 41.98] };   // a lock that slipped in anyway
    return { afterLoad, afterSet }; });
  await page.mouse.move(700, 450); await page.keyboard.press('Home'); await page.waitForTimeout(2500);
  const after = await A(() => ({ area: window.Atlas.S.ui.area, max: window.Atlas.map.getMaxBounds(), zoom: window.Atlas.map.getZoom(), toast: [...document.querySelectorAll('#toasts .toast')].some(t => /Camera lock released/.test(t.textContent)) }));
  console.log('      ', JSON.stringify({ ...r, home: after }));
  if (r.afterLoad || r.afterSet || after.area || after.max || !after.toast || after.zoom < 11) throw new Error('camera lock');
  await fitAll(); await settle();
});
await step('click a safety area → plain-language card, read-only values', async () => {
  const r = await findF('FUT-RWY-AREAS', 'RWY-OFA');
  await A(r => window.Atlas.select(r.id, [r.fid]), r); await page.waitForTimeout(500);
  const c = await A(() => ({ h2: document.querySelector('#right-body .insp h2')?.textContent, card: document.querySelector('#right-body .alp-card')?.textContent.replace(/\s+/g, ' '),
    editBtn: !!document.querySelector('#right-body [data-a=edit]'), readonly: document.querySelector('#right-body .attrs .input')?.readOnly }));
  if (c.h2 !== 'Runway Object Free Area' || !/Future/.test(c.card) || !/Why it matters/.test(c.card) || c.editBtn || !c.readonly) throw new Error(JSON.stringify(c));
  await shot('02-explain');
  await page.keyboard.press('Escape');
});
await step('describe hook: demolition and unknown layers', async () => {
  const r = await A(() => { const S = window.Atlas.S, h = window.ATLAS_EXT.hooks, l = S.layers.find(x => x.group.endsWith('/FUT-TWY-DEMO-HTCH')), u = S.layers.find(x => x.group.endsWith('/ALP-RD'));
    return { demo: h.describe(l.data.features[0], l), unknown: h.inspector(u.data.features[0], u).textContent }; });
  if (r.demo.title !== 'Pavement to be demolished' || !/To be demolished/.test(r.demo.sub) || !/isn’t in the ORD dictionary/.test(r.unknown)) throw new Error(JSON.stringify(r.demo));
});
await step('show all like this selects every feature on the same CAD layer', async () => {
  const r = await findF('FUT-BLDG-NEW', 'FUT-BLDG-SUPPORT');
  await A(r => window.Atlas.select(r.id, [r.fid]), r); await page.waitForTimeout(300);
  await page.click('#right-body .alp-card [data-a=like]'); await page.waitForTimeout(600);
  const n = await A(() => window.Atlas.S.selection?.fids.length);
  await A(() => { window.Atlas.setFocus(null); window.Atlas.select(null, null); });
  if (n !== 2) throw new Error(`selected ${n}`);
});
await step('ALP layers are read-only', async () => {
  const r = await findF('FUT-BLDG-NEW', 'FUT-BLDG-TERMINAL');
  await A(r => window.Atlas.deleteFeatures(r.id, [r.fid]), r);
  const left = await A(id => window.Atlas.S.layers.find(l => l.id === id).data.features.length, r.id);
  if (left !== 4) throw new Error('ALP feature was deleted');
});
await step('lens: Safety areas shows safety areas, runway as faint context, no buildings', async () => {
  await fitAll();
  await page.click('#ord-lens [data-l="safety"]'); await settle();
  const r = { safety: await drawn('FUT-RWY-AREAS'), runway: await drawn('FUT-RWY-HTCH'), bldg: await drawn('FUT-BLDG-NEW'),
    legend: await A(() => document.querySelector('#map-legend')?.textContent || ''), hint: await A(() => document.querySelector('#ord-lens .ord-lens-h span').textContent) };
  console.log('     ', JSON.stringify({ ...r, legend: r.legend.slice(0, 80) }));
  if (r.safety !== 3 || r.runway !== 1 || r.bldg !== 0 || !/Runway Safety Area/.test(r.legend) || /Airport support|Terminal/.test(r.legend)) throw new Error('safety lens');
  await shot('03-lens-safety');
  await page.click('#ord-lens [data-l="all"]'); await settle();
});
await step('Existing / Future: demolition and future features swap', async () => {
  await page.click('#ord-lens [data-l="all"]'); await fitAll();
  await page.click('#ord-mode [data-m="existing"]'); await settle();
  const ex = { demo: await drawn('FUT-TWY-DEMO-HTCH'), runway: await drawn('FUT-RWY-HTCH'), twy: await drawn('ALP-TWY') };
  await page.click('#ord-mode [data-m="future"]'); await settle();
  const fu = { demo: await drawn('FUT-TWY-DEMO-HTCH'), runway: await drawn('FUT-RWY-HTCH'), twy: await drawn('ALP-TWY') };
  console.log('      existing', JSON.stringify(ex), 'future', JSON.stringify(fu));
  if (ex.demo !== 1 || ex.runway !== 0 || ex.twy !== 1 || fu.demo !== 0 || fu.runway !== 1 || fu.twy !== 1) throw new Error('plan views');
});
await step('Changes colors new / removed / unchanged and explains them in the legend', async () => {
  await page.click('#ord-mode [data-m="changes"]'); await settle();
  const r = await A(() => { const l = window.Atlas.S.layers.find(x => x.group.endsWith('/FUT-BLDG-NEW')); return { fill: JSON.stringify(window.Atlas.map.getPaintProperty(`u-${l.id}-fill`, 'fill-color')), legend: document.querySelector('#map-legend').textContent }; });
  if (!/case/.test(r.fill) || !/New in the future plan/.test(r.legend) || !/Removed, demolished or relocated/.test(r.legend)) throw new Error('changes');
  if (await drawn('FUT-TWY-DEMO-HTCH') !== 1) throw new Error('demolition hidden in Changes');
  await shot('04-changes');
  await page.click('#ord-mode [data-m="all"]'); await settle();
  if (await drawn('FUT-TWY-DEMO-HTCH') !== 0) throw new Error('As drawn should respect the delivered hidden layer');
});
await step('legend: restyle a category everywhere (new color, dashed, thicker), then reset', async () => {
  await fitAll(); await settle();
  if (!(await page.isVisible('#map-legend .lg-btn'))) await page.click('#map-legend .lg-head');
  const btn = '#map-legend .lg-btn:has(span:text-is("Airport support building"))';
  for (const item of ['New color', 'Dashed lines', /^Thicker/]) { await page.click(btn); await page.locator('.menu [role=menuitem]', { hasText: item }).first().click(); await page.waitForTimeout(400); }
  const r = await A(() => { const m = window.Atlas.map, l = window.Atlas.S.layers.find(x => x.group.endsWith('/FUT-BLDG-NEW'));
    return { fill: JSON.stringify(m.getPaintProperty(`u-${l.id}-fill`, 'fill-color')), width: JSON.stringify(m.getPaintProperty(`u-${l.id}-line`, 'line-width')),
      dash: m.getLayoutProperty(`u-${l.id}-dash`, 'visibility'), saved: localStorage.getItem('ord-alp-symbology') }; });
  console.log('      saved', r.saved);
  await shot('09-legend-style');
  if (!/Airport support building/.test(r.saved) || !/"dash":true/.test(r.saved) || !/"width":2.2/.test(r.saved) || !/case/.test(r.fill) || !/case/.test(r.width) || r.dash !== 'visible') throw new Error('legend symbology');
  await page.click(btn); await page.locator('.menu [role=menuitem]', { hasText: 'Reset this style' }).first().click(); await page.waitForTimeout(400);
  if (await A(() => localStorage.getItem('ord-alp-symbology')) !== '{}') throw new Error('reset');
});
await step('layers panel highlights the layers the view uses; color by CAD layer from the legend', async () => {
  await fitAll(); await page.click('#ord-lens [data-l="buildings"]'); await settle();
  const q = await A(() => { const row = g => document.querySelector(`#layer-list .lrow[data-id="${window.Atlas.S.layers.find(x => x.group.endsWith('/' + g)).id}"]`)?.className || 'collapsed';
    return { bldg: row('FUT-BLDG-NEW'), areas: row('FUT-RWY-AREAS'), groups: [...document.querySelectorAll('#layer-list .ghead.q-on .nm')].map(e => e.textContent) }; });
  console.log('      ', JSON.stringify(q));
  if (!/q-on/.test(q.bldg) || !/q-off/.test(q.areas) || !q.groups.includes('FUT-BLDG-NEW')) throw new Error('layer highlight');
  if (!(await page.isVisible('#map-legend .lg-btn'))) await page.click('#map-legend .lg-head');
  await page.click('#map-legend .lg-btn:has(span:text-is("Airport support building"))');
  await page.locator('.menu [role=menuitem]', { hasText: 'CAD layer' }).first().click(); await settle();
  const r = await A(() => { const l = window.Atlas.S.layers.find(x => x.group.endsWith('/FUT-BLDG-NEW'));
    return { fill: JSON.stringify(window.Atlas.map.getPaintProperty(`u-${l.id}-fill`, 'fill-color')), sub: [...document.querySelectorAll('#map-legend .lg-row.sub span')].map(e => e.textContent) }; });
  console.log('       sub', r.sub.join(', '));
  await shot('10-color-by');
  if (r.sub.join() !== 'FUT-BLDG-SUPPORT,FUT-SUPPORT' || !/#3EB3E3/.test(r.fill) || !/#E91D2C/.test(r.fill)) throw new Error('color by');
  await page.click('#map-legend .lg-btn:has(span:text-is("Airport support building"))');
  await page.locator('.menu [role=menuitem]', { hasText: 'Reset this style' }).first().click(); await settle();
  await page.click('#ord-lens [data-l="all"]'); await settle();
});
await step('categories: untick, show only one, show all', async () => {
  await fitAll(); await page.click('#ord-lens [data-l="buildings"]'); await settle();
  const before = await drawn('FUT-BLDG-NEW');
  await page.click('#ord-cats label:has(span:text-is("Airport support building")) input'); await settle();
  const unticked = await drawn('FUT-BLDG-NEW');
  await page.dblclick('#ord-cats label:has(span:text-is("Terminal building"))'); await settle();
  const only = { n: await drawn('FUT-BLDG-NEW'), summary: await A(() => document.querySelector('#ord-cats summary').textContent) };
  await shot('06-categories');
  await page.click('#ord-cats [data-c="all"]'); await settle();
  const all = await drawn('FUT-BLDG-NEW');
  console.log('      buildings', before, '→ untick support', unticked, '→ only terminal', JSON.stringify(only), '→ show all', all);
  if (before !== 4 || unticked !== 1 || only.n !== 1 || !/1 of 2 shown/.test(only.summary) || all !== 4) throw new Error('category toggles');
  await page.click('#ord-lens [data-l="all"]'); await settle();
});
await step('CDA theme in dark and light, CDA mark, ORD tours', async () => {
  const dark = await A(() => ({ primary: getComputedStyle(document.documentElement).getPropertyValue('--primary').trim(), canvas: getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim(), mark: !!document.querySelector('.brand-mark polygon'), icon: document.querySelector('link[rel=icon]').href.includes('E91D2C') }));
  await page.click('#btn-theme'); await page.waitForTimeout(1500);
  const light = await A(() => getComputedStyle(document.documentElement).getPropertyValue('--primary').trim());
  await shot('07-light'); await page.click('#btn-theme'); await page.waitForTimeout(1000);
  console.log('      ', JSON.stringify({ ...dark, light }));
  if (dark.primary !== '#3EB3E3' || dark.canvas !== '#06182A' || !dark.mark || !dark.icon || light !== '#2385C7') throw new Error('theme');
  await page.click('#sb-help'); await page.click('.menu >> text=Guided tours…');
  const cards = await A(() => [...document.querySelectorAll('.card[data-t]')].map(c => c.dataset.t).join(','));
  await page.click('.card[data-t="ord-read"]');
  let n = 0; while (await page.isVisible('#tour')) { if (n === 2) await shot('08-tour-categories'); await page.click('#tour [data-a="next"]'); if (++n > 10) throw new Error('tour did not end'); }
  console.log('       tours', cards, '| Read the ALP steps', n);
  if (cards !== 'ord-read,ord-sketch,nav,groups,ord-share' || n !== 5) throw new Error('tours');
});
await step('drawing goes to “My proposals — Polygons”, which is editable', async () => {
  await page.keyboard.press('Escape'); await page.keyboard.press('r'); await page.waitForTimeout(300);
  await page.mouse.click(650, 420); await page.mouse.move(760, 500, { steps: 5 }); await page.mouse.click(760, 500);
  await page.waitForTimeout(800);
  const r = await A(() => { const l = window.Atlas.S.layers.find(x => x.source?.format === 'proposal'); return l && { n: l.data.features.length, editable: window.Atlas.canEdit(l), edit: !!document.querySelector('#right-body [data-a=edit]') }; });
  if (!r || r.n !== 1 || !r.editable || !r.edit) throw new Error(JSON.stringify(r));
  await shot('05-proposal');
});
await step('relaunching the folder resumes the session (proposal kept)', async () => {
  await page.waitForTimeout(3000); // autosave is debounced 2 s
  await page.reload(); await booted();
  await page.waitForFunction(() => window.Atlas.S.layers.length === 9, null, { timeout: 30000 });
  const n = await A(() => window.Atlas.S.layers.find(x => x.source?.format === 'proposal')?.data.features.length);
  if (n !== 1) throw new Error(`proposals after relaunch: ${n}`);
});

const opened = await A(() => [...document.querySelectorAll('#toasts .toast')].map(t => t.textContent).filter(t => /Couldn/.test(t)));
if (opened.length) errors.push('toasts: ' + opened.join(' | '));
await step('lines and points split into their own proposal layers; a layer of your own takes shapes instead', async () => {
  await page.keyboard.press('Escape'); await page.keyboard.press('l'); await page.waitForTimeout(300);
  await page.mouse.click(600, 600); await page.mouse.click(700, 640); await page.waitForTimeout(700); await page.mouse.click(700, 640); await page.waitForTimeout(600); // two clicks too close together would be a double-click (edit)
  await A(() => document.activeElement.blur()); await page.keyboard.press('Escape'); await page.waitForTimeout(200); // a finished shape focuses its name field
  await page.mouse.move(820, 600); await page.keyboard.press('m'); await page.waitForTimeout(300);
  await page.mouse.click(820, 620); await page.waitForTimeout(600);
  const kinds = () => A(() => window.Atlas.S.layers.filter(l => l.source?.format === 'proposal').map(l => `${l.source.kind}:${l.data.features.map(f => f.geometry.type).join('+')}`).sort().join(' | '));
  const k1 = await kinds();
  const grp = await A(() => [...new Set(window.Atlas.S.layers.filter(l => l.source?.format === 'proposal').map(l => l.group))].join());
  await A(() => { const A2 = window.Atlas; A2.addLayer(A2.newLayer({ name: 'Mine', fields: [{ name: 'name', type: 'text' }] })); });
  await A(() => document.activeElement.blur()); await page.keyboard.press('Escape'); await page.mouse.move(540, 300); await page.keyboard.press('r'); await page.waitForTimeout(300);
  await page.mouse.click(540, 300); await page.mouse.move(640, 380, { steps: 4 }); await page.mouse.click(640, 380); await page.waitForTimeout(600);
  await A(async () => {
    const data = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: 'Imported context' }, geometry: { type: 'Point', coordinates: [-87.9, 42.0] } }] };
    await window.Atlas.handleFiles([new File([JSON.stringify(data)], 'client-context.geojson', { type: 'application/geo+json' })]);
  });
  const mine = await A(() => window.Atlas.S.layers.find(l => l.name === 'Mine').data.features.length);
  const k2 = await kinds();
  console.log('      ', k1, '| group', grp, '| Mine', mine);
  if (k1 !== 'Lines:LineString | Points:Point | Polygons:Polygon' || grp !== 'My proposals' || mine !== 1 || k2 !== k1) throw new Error('proposal split / user layer');
});
let changeFile = join(OUT, 'client-changes.atlas.json');
await step('Save changes exports every client layer and omits delivered ALP layers', async () => {
  await page.evaluate(() => { delete window.showSaveFilePicker; });
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#btn-save')]);
  await download.saveAs(changeFile);
  const ws = JSON.parse(readFileSync(changeFile, 'utf8'));
  const names = ws.layers.map(l => l.name);
  if (!ws.atlasChangeSet || ws.layers.length !== 5 || !names.includes('Mine') || !names.includes('client-context') || !names.some(n => n.startsWith('My proposals')) || ws.layers.some(l => l.group?.includes('FUT-'))) throw new Error(JSON.stringify({ tag: ws.atlasChangeSet, names }));
});
await step('returned changes file defaults to adding layers to the open ALP', async () => {
  const ws = JSON.parse(readFileSync(changeFile, 'utf8')), layer = JSON.parse(JSON.stringify(ws.layers.find(l => l.name === 'Mine')));
  layer.id = 'client-returned-layer'; layer.name = 'Returned layer';
  ws.layers = [layer];
  changeFile = join(OUT, 'returned-changes.atlas.json'); writeFileSync(changeFile, JSON.stringify(ws));
  const before = await A(() => window.Atlas.S.layers.length);
  await page.setInputFiles('#file-input', changeFile);
  await page.waitForSelector('#modal-root [name="workspace-import"]');
  const selected = await A(() => document.querySelector('#modal-root input[value="merge"]').checked);
  await page.click('#modal-root [data-ok]');
  await page.waitForFunction(n => window.Atlas.S.layers.length === n + 1, before);
  const added = await A(() => window.Atlas.S.layers.some(l => l.id === 'client-returned-layer'));
  if (!selected || !added) throw new Error('returned layers were not merged into the open ALP');
});
await step('Open lets the user replace the ALP with a workspace file', async () => {
  const ws = await A(() => JSON.stringify(window.Atlas.serialize()));
  const f = join(OUT, 'copy.atlas (1).json'); writeFileSync(f, ws);
  const before = await A(() => window.Atlas.S.layers.length);
  await page.setInputFiles('#file-input', f);
  await page.waitForSelector('#modal-root [name="workspace-import"]');
  await page.check('#modal-root input[value="replace"]');
  await page.click('#modal-root [data-ok]'); await page.waitForTimeout(1000);
  const n = await A(() => window.Atlas.S.layers.length);
  if (n !== before) throw new Error('replace choice did not load the workspace: ' + n);
});
await step('an empty saved session falls back to the delivered ALP', async () => {
  await A(async () => {
    const A2 = window.Atlas, request = indexedDB.open('keyval-store');
    const db = await new Promise((resolve, reject) => {
      request.onupgradeneeded = () => request.result.createObjectStore('keyval');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('keyval', 'readwrite');
      tx.objectStore('keyval').put({ savedAt: Date.now(), bundle: A2.bundleId, ws: { schemaVersion: 2, app: 'Atlas', name: 'Empty', layers: [] }, bundleLayerIds: [] }, 'ord-alp-autosave');
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.reload(); await booted();
  await page.waitForFunction(() => window.Atlas.S.layers.length === 8, null, { timeout: 30000 });
  const r = await A(() => ({ count: window.Atlas.S.layers.length, bundled: window.Atlas.getBundleLayerIds()?.size }));
  if (r.count !== 8 || r.bundled !== 8) throw new Error(JSON.stringify(r));
});
await step('no sample-data entry points', async () => {
  const r = await A(() => ({ text: document.body.innerText, fn: typeof window.loadSamples }));
  await page.click('#btn-more'); const menu = await A(() => document.querySelector('.menu')?.innerText || ''); await page.keyboard.press('Escape');
  if (/sample data/i.test(menu) || /sample data/i.test(r.text)) throw new Error('sample entry point still present');
});
console.log(errors.length ? `\nERRORS (${errors.length}):\n` + errors.join('\n') : '\nNo console errors');
console.log(`Screenshots: ${OUT}`);
await browser.close();
process.exit(errors.length ? 1 : 0);
