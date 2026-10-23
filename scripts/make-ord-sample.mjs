// Writes samples/ord_alp_sample.atlas.json: a SYNTHETIC mini-ALP (fake runway, safety areas, buildings) laid out like the real ORD package
// (DWG-style layers with Layer/EntityType fields, nested groups) so the ORD ALP can be tested without real data.
// Usage: node scripts/make-ord-sample.mjs
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ORIGIN = [-87.9048, 41.9786], FT = 0.3048, M_LAT = 111132, M_LON = 111320 * Math.cos(ORIGIN[1] * Math.PI / 180);
const ll = (x, y) => [+(ORIGIN[0] + x * FT / M_LON).toFixed(7), +(ORIGIN[1] + y * FT / M_LAT).toFixed(7)]; // feet east/north of ORIGIN
const ring = pts => { const r = pts.map(([x, y]) => ll(x, y)); return [[...r, r[0]]]; };
const rect = (cx, cy, w, h) => ring([[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]]);
const poly = (Layer, coordinates) => ({ Layer, geometry: { type: 'Polygon', coordinates } });
const line = (Layer, pts) => ({ Layer, geometry: { type: 'LineString', coordinates: pts.map(([x, y]) => ll(x, y)) } });

const FAA = 'ORD Future – FAA & Imaginary Surfaces', AIR = 'ORD Future – Airfield', STR = 'ORD Future – Structures', BASE = 'ORD Existing – ALP base';
const LAYERS = [ // [top group, drawing, kind, visible, color, features]
  [FAA, 'FUT-RWY-AREAS', 'Polygons', true, '#fb923c', [
    poly('RWY-OFA', rect(0, 0, 12000, 800)), poly('RWY-RSA', rect(0, 0, 12000, 500)),
    poly('RWY-RPZ', ring([[6000, -500], [8500, -875], [8500, 875], [6000, 500]]))]],
  [FAA, 'FUT-BRL', 'Polylines', true, '#fb923c', [line('BRL', [[-5000, -1100], [5000, -1100]])]],
  [STR, 'FUT-BLDG-NEW', 'Polygons', true, '#a78bfa', [
    poly('FUT-BLDG-SUPPORT', rect(2000, 350, 200, 120)),   // planted conflict: inside the OFA
    poly('FUT-BLDG-SUPPORT', rect(-2600, -1500, 300, 200)),
    poly('FUT-BLDG-TERMINAL', rect(-1000, -1600, 600, 300)),
    poly('FUT-SUPPORT', rect(2400, -2600, 250, 180))]],     // same category, another CAD layer
  [AIR, 'FUT-RWY-HTCH', 'Polygons', true, '#cbd5e1', [poly('FUT-RWY-HTCH', rect(0, 0, 10000, 150))]],
  [AIR, 'FUT-RWY', 'Polylines', true, '#cbd5e1', [line('RWY-CENTERLINE', [[-5000, 0], [5000, 0]])]],
  [AIR, 'FUT-TWY-DEMO-HTCH', 'Removed / demolition', false, '#f87171', [poly('FUT-TWY-DEMO', rect(-3000, -900, 800, 200))]],
  [BASE, 'ALP-TWY', 'Polylines', true, '#64748b', [line('TWY-CL-EX', [[-4000, -600], [4000, -600]])]],
  [BASE, 'ALP-RD', 'Polylines', true, '#64748b', [line('C-ANNO-REFR', [[-4500, -2200], [-3500, -2200]])]], // not in the dictionary on purpose
];
const layers = LAYERS.map(([top, dwg, kind, visible, color, feats], i) => ({
  id: `lyr_ordsample${i}`, name: `${dwg} — ${kind}`, group: `${top}/${dwg}`, visible, legendOpen: false, excludeFromSave: false,
  source: { fileName: `${dwg}.dwg`, format: 'dwg', crs: 'EPSG:3435', importedAt: '2026-10-22T00:00:00.000Z' },
  style: { fill: color, stroke: null, fillOpacity: 0.2, strokeWidth: 1.2, opacity: 1, labelField: null, styleBy: null, extrude: false, heightField: null, height: null },
  fields: [{ name: 'Layer', type: 'text' }, { name: 'EntityType', type: 'text' }],
  nextId: feats.length + 1,
  data: { type: 'FeatureCollection', features: feats.map((f, j) => ({ type: 'Feature', id: j + 1,
    properties: { _fid: j + 1, Layer: f.Layer, EntityType: f.geometry.type === 'Polygon' ? 'LWPOLYLINE' : 'LINE' }, geometry: f.geometry })) },
}));
const ws = { schemaVersion: 2, app: 'Atlas', name: 'ORD ALP sample (synthetic)', savedAt: '2026-10-22T00:00:00.000Z',
  view: { center: ORIGIN, zoom: 13.2, pitch: 0, bearing: 0, mode: '2d' },
  ui: { theme: 'dark', basemap: 'dark', basemapAuto: true, activeLayer: null, mask: false, legend: false, area: null, coord: 'wgs', closedGroups: [], panels: { left: true, right: true, bottom: false } },
  layers, presets: { views: [], styles: [] }, areas: [], groupStyle: {}, emptyGroups: [], hiddenGroups: [], settings: {} };
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'samples', 'ord_alp_sample.atlas.json');
writeFileSync(out, JSON.stringify(ws));
console.log('wrote', out);
