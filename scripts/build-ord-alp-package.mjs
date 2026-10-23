// Builds the "ORD Future ALP" project package from the ALP xref folder by driving Atlas (dist/Atlas-GIS.html) in headless Chromium,
// so the import is exactly what a user gets. Nothing is uploaded; the output .atlas.zip is written locally.
// Usage: node scripts/build-ord-alp-package.mjs "<...>/01-04_ORD-Future - Standard/Xrefs" "<out>/ORD-Future-ALP.atlas.zip"
// Needs: npm i --no-save playwright-core (and a Playwright Chromium, as for tests/smoke.browser.mjs).
import { chromium } from 'playwright-core';
import { readdirSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const [SRC, OUT] = process.argv.slice(2);
if (!SRC || !OUT) { console.error('Usage: node scripts/build-ord-alp-package.mjs <Xrefs folder> <out .atlas.zip>'); process.exit(2); }
const APP = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'Atlas-GIS.html').replace(/\\/g, '/');

// Top-level groups, top of the list (drawn on top) first: [name, icon, color, fill opacity, drawings]
const GROUPS = [
  ['ORD Future – Map labels', 'bookmark', '#e5e7eb', 0, ['FUT-TXT-Miscellaneous']],
  ['ORD Future – FAA & Imaginary Surfaces', 'area', '#fb923c', 0.06, ['FUT-RWY-AREAS', 'FUT-RWY-TSS', 'FUT-BRL', 'FUT-AVG-EASMT']],
  ['ORD Future – Structures', 'layers', '#a78bfa', 0.35, ['FUT-BLDG', 'FUT-BLDG-NEW', 'FUT-BLDG-NUM', 'FUT-Guard Posts', 'FUT-Miscellaneous (Monuments)']],
  ['ORD Future – Security & Property', 'lock', '#f87171', 0.1, ['FUT-FENCE', 'FUT-PROP']],
  ['ORD Future – Airfield', 'polygon', '#cbd5e1', 0.25, ['FUT-RWY', 'FUT-RWY-HTCH', 'FUT-TWY', 'FUT-TWY-HTCH', 'FUT-TWY-DEMO-HTCH', 'FUT-TAS-GATE POSITIONS', 'FUT-APPCH-LTS', 'FUT-NAV']],
  ['ORD Future – Landside', 'map', '#fbbf24', 0.2, ['FUT-RD', 'FUT-RD_EAST_Revised to T5', 'FUT-APM-ATS', 'FUT-WATER', 'FUT-DEVELOPMENT']],
  ['ORD Existing – ALP base', 'globe', '#64748b', 0.15, ['ALP-RWY', 'ALP-RWY-HTCH', 'ALP-TWY', 'ALP-TWY-HTCH', 'ALP-TWY-NAMES', 'ALP-RD', 'ALP-RAIL', 'ALP-BERM', 'ALP-PROP', 'ALP-COUNTY-LINE']],
];
const HIDDEN_GROUPS = ['ORD Future – Map labels'];
if (GROUPS.some(g => g[0].includes('/'))) throw new Error('Group names cannot contain "/" (Atlas uses it for nesting)');
const COLOR = { 'FUT-WATER': '#60a5fa' };                                        // per-drawing exceptions
const TEXT_ON = ['ALP-TWY-NAMES', 'FUT-BLDG-NUM', 'FUT-RWY'];                     // label layers left on
const POINTS_ON = ['FUT-TAS-GATE POSITIONS', 'FUT-Guard Posts'];                  // point layers left on (the rest are block markers)
// CAD layers / blocks for things removed, demolished, relocated or retired that the ALP still draws
const REMOVED = 'DEMO|UNUSE?ABLE|RELOCAT|_RELO\\b|PAST[_ ]|REMOVED|ABANDON';
const MARKINGS = 'MRK|MARKING|HLD-LNS|SFC-PNTD';                                  // pavement paint: tens of thousands of lines

const wanted = new Set(GROUPS.flatMap(g => g[4]));
const files = [SRC, join(SRC, 'FUTURE')].flatMap(d => readdirSync(d).map(f => join(d, f)))
  .filter(f => /\.dwg$/i.test(f) && wanted.has(basename(f).replace(/\.dwg$/i, '')));
const missing = [...wanted].filter(n => !files.some(f => basename(f).replace(/\.dwg$/i, '') === n));
if (missing.length) console.warn('not found:', missing.join(', '));
console.log(`importing ${files.length} drawings (${Math.round(files.reduce((s, f) => s + statSync(f).size, 0) / 1e6)} MB)…`);

const pw = join(process.env.LOCALAPPDATA || '', 'ms-playwright');
const chromiumDir = (() => { try { return readdirSync(pw).filter(d => /^chromium-\d+$/.test(d)).sort().pop(); } catch (e) { return null; } })();
const browser = await chromium.launch({ executablePath: process.env.CHROME || (chromiumDir ? join(pw, chromiumDir, 'chrome-win64', 'chrome.exe') : undefined), args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true })).newPage();
page.on('pageerror', e => console.error('page error:', e.message));
page.on('console', m => /error|warn/.test(m.type()) && console.error(`page ${m.type()}:`, m.text().slice(0, 300)));
await page.goto(`file:///${APP}`);
await page.waitForFunction(() => window.__atlasBooted && window.Atlas.map?.loaded(), null, { timeout: 60000 });
await page.evaluate(() => { delete window.showSaveFilePicker; delete window.showOpenFilePicker; }); // headless: save as a plain download, never a dialog

// 1. import every drawing; one CRS answer (EPSG:3435, the default) for the batch
await page.setInputFiles('#file-input', files);
await page.waitForSelector('.modal [data-ok]', { timeout: 300000 });
await page.click('.modal [data-ok]');
await page.waitForFunction(() => [...document.querySelectorAll('#toasts .toast')].some(t => /Imported \d+ of \d+ files/.test(t.textContent)), null, { timeout: 900000 });
console.log(await page.evaluate(() => [...document.querySelectorAll('#toasts .toast')].map(t => t.textContent.replace(/\s+/g, ' ')).find(t => /Imported/.test(t))));

// 2. regroup, split out removed elements and markings, set visibility and a calm palette, then reload as a workspace
const summary = await page.evaluate(({ GROUPS, HIDDEN_GROUPS, COLOR, TEXT_ON, POINTS_ON, REMOVED, MARKINGS }) => {
  const A = window.Atlas, ws = A.serialize(), removedRe = new RegExp(REMOVED, 'i'), markRe = new RegExp(MARKINGS, 'i');
  const top = Object.fromEntries(GROUPS.flatMap(([g, , color, fo, dwgs]) => dwgs.map(d => [d, { g, color, fo }])));
  const ORDER = ['Text', 'Points', 'Pavement markings', 'Polylines', 'Polygons', 'Removed / demolition'];
  const out = [], extra = {}; // extra[dwg][kind]: removed elements and markings merged across geometry types
  for (const l of ws.layers) {
    const dwg = l.group, t = top[dwg]; if (!t) continue; // drawings outside the plan are left out
    const kind = l.name.split(' — ').pop(), feats = l.data.features;
    const isRemoved = f => removedRe.test(f.properties.Layer || '') || removedRe.test(f.properties.BlockName || '');
    const isMark = f => kind !== 'Text' && kind !== 'Points' && markRe.test(f.properties.Layer || '');
    const parts = [[kind, feats.filter(f => !isRemoved(f) && !isMark(f))], ['Pavement markings', feats.filter(f => !isRemoved(f) && isMark(f))], ['Removed / demolition', feats.filter(isRemoved)]];
    for (const [k, fs] of parts) {
      if (!fs.length) continue;
      if (k !== kind) { const e = ((extra[dwg] ||= {})[k] ||= { ...l, features: [], allFields: [] }); e.features.push(...fs); e.allFields.push(...l.fields); continue; }
      const color = COLOR[dwg] || (k === 'Removed / demolition' ? '#f87171' : t.color);
      const visible = k === 'Text' ? TEXT_ON.includes(dwg) : k === 'Points' ? POINTS_ON.includes(dwg) : k === 'Polylines' || k === 'Polygons';
      out.push({ ...l, id: k === kind ? l.id : `${l.id}_${k === 'Pavement markings' ? 'mrk' : 'rem'}`, name: `${dwg} — ${k}`, group: `${t.g}/${dwg}`, visible, legendOpen: false,
        style: { ...l.style, fill: color, stroke: null, fillOpacity: t.fo, strokeWidth: k === 'Pavement markings' ? 0.8 : 1.2, styleBy: null, labelField: k === 'Text' ? 'Text' : null },
        data: { type: 'FeatureCollection', features: fs }, _sort: [GROUPS.findIndex(g => g[0] === t.g), GROUPS.find(g => g[0] === t.g)[4].indexOf(dwg), ORDER.indexOf(k)] });
    }
  }
  for (const [dwg, kinds] of Object.entries(extra)) for (const [k, e] of Object.entries(kinds)) {
    const t = top[dwg], keys = [...new Set(e.features.flatMap(f => Object.keys(f.properties)))].filter(x => x !== '_fid');
    out.push({ ...e, features: undefined, id: `${e.id}_${k === 'Pavement markings' ? 'mrk' : 'rem'}`, name: `${dwg} — ${k}`, group: `${t.g}/${dwg}`, visible: false, legendOpen: false,
      fields: keys.map(n => e.allFields.find(f => f.name === n) || { name: n, type: 'text' }), allFields: undefined,
      style: { ...e.style, fill: COLOR[dwg] || (k === 'Removed / demolition' ? '#f87171' : t.color), stroke: null, fillOpacity: t.fo, strokeWidth: k === 'Pavement markings' ? 0.8 : 1.2, styleBy: null, labelField: null },
      data: { type: 'FeatureCollection', features: e.features.map((f, i) => ({ ...f, id: i + 1, properties: { ...f.properties, _fid: i + 1 } })) },
      nextId: e.features.length + 1, _sort: [GROUPS.findIndex(g => g[0] === t.g), GROUPS.find(g => g[0] === t.g)[4].indexOf(dwg), ORDER.indexOf(k)] });
  }
  out.sort((a, b) => a._sort[0] - b._sort[0] || a._sort[1] - b._sort[1] || a._sort[2] - b._sort[2]);
  out.forEach(l => delete l._sort);
  const all = { type: 'FeatureCollection', features: out.filter(l => l.visible).flatMap(l => l.data.features) };
  const bbox = window.turf.bbox(all), pad = [(bbox[2] - bbox[0]) * 0.08, (bbox[3] - bbox[1]) * 0.08];
  Object.assign(ws, { name: 'ORD Future ALP', layers: out, emptyGroups: [], hiddenGroups: HIDDEN_GROUPS,
    groupStyle: Object.fromEntries(GROUPS.map(([g, icon, color]) => [g, { icon, color }])) });
  ws.ui = { ...ws.ui, area: { name: 'ORD Future ALP', bbox: [bbox[0] - pad[0], bbox[1] - pad[1], bbox[2] + pad[0], bbox[3] + pad[1]] }, mask: false, legend: false,
    activeLayer: null, closedGroups: [...new Set(out.map(l => l.group))], panels: { left: true, right: true, bottom: false } };
  A.loadWorkspace(ws);
  A.map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 30, duration: 0 });
  const S = A.S;
  return { layers: S.layers.length, visible: S.layers.filter(l => l.visible).length, features: S.layers.reduce((s, l) => s + l.data.features.length, 0),
    removed: S.layers.filter(l => /Removed/.test(l.name)).map(l => `${l.name} (${l.data.features.length})`), markings: S.layers.filter(l => /markings/.test(l.name)).reduce((s, l) => s + l.data.features.length, 0) };
}, { GROUPS, HIDDEN_GROUPS, COLOR, TEXT_ON, POINTS_ON, REMOVED, MARKINGS });
console.log(JSON.stringify(summary, null, 1));
await page.waitForTimeout(3000);
await page.screenshot({ path: OUT.replace(/\.atlas\.zip$/i, '') + '-preview.png' });

// 3. project package (.atlas.json + shapefiles) via the app's own exporter
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 900000 }),
  page.evaluate(() => window.Atlas.makePackage({ update(f) { const p = Math.round(f * 20); if (p !== this.p) { this.p = p; console.warn(`packaging ${p * 5}%`); } } }, { file: 'ORD-Future-ALP', shapefiles: false }))]); // opened in Atlas; shapefile copies of ~100k-feature layers stall shp-write
await dl.saveAs(OUT);
console.log('wrote', OUT, `${Math.round(statSync(OUT).size / 1e6)} MB`);
await browser.close();
