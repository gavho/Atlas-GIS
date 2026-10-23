// Unit tests for the DWG entity → GeoJSON logic in dist/Atlas-GIS.html (between the <cad-logic> markers).
// Fixtures mimic the DwgDatabase shape returned by @mlightcad/libredwg-web convert().
// Run: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../dist/Atlas-GIS.html', import.meta.url), 'utf8');
const src = html.split('// <cad-logic>')[1].split('// </cad-logic>')[0];
const { dbToFC, cadBucket, aciHex, dropStrays } = new Function(`${src}; return { dbToFC, cadBucket, aciHex, dropStrays };`)();

const MS = '1F', PS = '1E';
const db = (entities, extra = {}) => ({
  tables: {
    LAYER: { entries: [{ name: 'FENCE-EXIST', colorIndex: 3, lineType: 'Continuous' }, { name: 'OLD', colorIndex: 1, off: true }] },
    BLOCK_RECORD: { entries: [{ name: '*Model_Space', handle: MS }, { name: '*Paper_Space', handle: PS }] },
  },
  objects: { DICTIONARY: [] }, entities, ...extra,
});
const ent = (type, o) => ({ type, handle: 'A' + Math.random().toString(16).slice(2, 6), ownerBlockRecordSoftId: MS, layer: 'FENCE-EXIST', colorIndex: 256, xdata: [], ...o });

test('closed LWPOLYLINE with a bulge becomes a Polygon with arc vertices', () => {
  const vertices = [{ x: 0, y: 0, bulge: 0 }, { x: 10, y: 0, bulge: 1 }, { x: 10, y: 10, bulge: 0 }, { x: 0, y: 10, bulge: 0 }];
  const { fc } = dbToFC(db([ent('LWPOLYLINE', { flag: 512, vertices })]));
  const g = fc.features[0].geometry;
  assert.equal(g.type, 'Polygon');
  const r = g.coordinates[0];
  assert.ok(r.length > 10, 'semicircle densified');
  assert.deepEqual(r[0], r.at(-1), 'ring closed');
  assert.ok(r.some(([x]) => x > 14.9), 'bulge=1 arc bulges right of the 10,0→10,10 chord (radius 5)');
});

test('LWPOLYLINE bit 1 is "has extrusion", not closed; 2-vertex closed stays a line', () => {
  const v = [{ x: 0, y: 0, bulge: 0 }, { x: 5, y: 0, bulge: 0 }, { x: 5, y: 5, bulge: 0 }];
  const { fc } = dbToFC(db([ent('LWPOLYLINE', { flag: 257, vertices: v }), ent('LWPOLYLINE', { flag: 512, vertices: v.slice(0, 2) }), ent('POLYLINE2D', { flag: 1, vertices: v })]));
  assert.deepEqual(fc.features.map(f => f.geometry.type), ['LineString', 'LineString', 'Polygon']);
});

test('open LWPOLYLINE stays a line; mirrored OCS flips x', () => {
  const { fc } = dbToFC(db([ent('LWPOLYLINE', { flag: 0, vertices: [{ x: 1, y: 2, bulge: 0 }, { x: 3, y: 4, bulge: 0 }], extrusionDirection: { x: 0, y: 0, z: -1 } })]));
  assert.deepEqual(fc.features[0].geometry, { type: 'LineString', coordinates: [[-1, 2], [-3, 4]] });
});

test('INSERT becomes a Point with its ATTRIB tags as fields; rotation in degrees', () => {
  const attribs = [{ tag: 'GATE_ID', text: { text: 'G-12' } }, { tag: 'Layer', text: { text: 'clash' } }];
  const { fc } = dbToFC(db([ent('INSERT', { name: 'GATE', insertionPoint: { x: 5, y: 6, z: 0 }, rotation: Math.PI / 2, attribs })]));
  const f = fc.features[0];
  assert.deepEqual(f.geometry, { type: 'Point', coordinates: [5, 6] });
  assert.equal(f.properties.BlockName, 'GATE');
  assert.equal(f.properties.GATE_ID, 'G-12');
  assert.equal(f.properties.ATT_Layer, 'clash', 'tag colliding with a base field is prefixed');
  assert.equal(f.properties.Layer, 'FENCE-EXIST');
  assert.equal(f.properties.Rotation, 90);
  assert.equal(cadBucket(f), 'Points');
});

test('ByLayer color resolves through the LAYER table; true color wins', () => {
  const { fc } = dbToFC(db([ent('POINT', { position: { x: 0, y: 0, z: 0 } }), ent('POINT', { position: { x: 0, y: 0, z: 0 }, color: 0x123456 })]));
  assert.equal(fc.features[0].properties.Color, '#00ff00');
  assert.equal(fc.features[1].properties.Color, '#123456');
  assert.equal(aciHex(10), '#ff0000');
  assert.equal(aciHex(11), '#ff8080');
});

test('paper-space entities, top-level ATTRIBs and non-geometry are skipped; skips are counted', () => {
  const { fc, skipped } = dbToFC(db([
    ent('LINE', { ownerBlockRecordSoftId: PS, startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 1 } }),
    ent('ATTRIB', {}), ent('DIMENSION', {}), ent('DIMENSION', {}),
    ent('LINE', { startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 1 } }),
  ]));
  assert.equal(fc.features.length, 1);
  assert.deepEqual(skipped, { DIMENSION: 2 });
});

test('XDATA flattens to XD_<app> text; MTEXT codes stripped', () => {
  const xdata = [{ appName: 'ACME.FENCE', value: [{ code: 1000, value: 'chain link' }, { code: 1040, value: 8 }, { code: 1010, value: { x: 1, y: 2, z: 0 } }] }];
  const { fc } = dbToFC(db([
    ent('LINE', { startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 1 }, xdata }),
    ent('MTEXT', { insertionPoint: { x: 0, y: 0 }, text: '{\\fArial|b1;GATE}\\PNORTH', textHeight: 2 }),
  ]));
  assert.equal(fc.features[0].properties['XD_ACME_FENCE'], 'chain link; 8; 1,2,0');
  assert.equal(fc.features[1].properties.Text, 'GATE NORTH');
  assert.equal(cadBucket(fc.features[1]), 'Text');
});

test('Defpoints, Deleted Elements and layers turned off in CAD are skipped and counted', () => {
  const ln = o => ent('LINE', { startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 1 }, ...o });
  const { fc, skipped } = dbToFC(db([ln({ layer: 'Defpoints' }), ln({ layer: 'DELETED ELEMENTS' }), ln({ layer: 'OLD' }), ln({})]));
  assert.equal(fc.features.length, 1);
  assert.deepEqual(skipped, { 'on Defpoints / Deleted layers': 2, 'on layers turned off in CAD': 1 });
});

test('circle → Polygon, arc → LineString, Map 3D dictionary detected', () => {
  const { fc, mapOD } = dbToFC(db([
    ent('CIRCLE', { center: { x: 0, y: 0, z: 0 }, radius: 1 }),
    ent('ARC', { center: { x: 0, y: 0, z: 0 }, radius: 1, startAngle: 0, endAngle: Math.PI / 2 }),
  ], { objects: { DICTIONARY: [{ entries: { ACMAPDATAEXTENSION: '2A' } }] } }));
  assert.equal(fc.features[0].geometry.type, 'Polygon');
  const a = fc.features[1].geometry.coordinates;
  assert.equal(fc.features[1].geometry.type, 'LineString');
  assert.ok(Math.abs(a.at(-1)[0]) < 1e-9 && Math.abs(a.at(-1)[1] - 1) < 1e-9, 'quarter arc ends at (0,1)');
  assert.equal(mapOD, true);
});

test('dropStrays removes objects far from the drawing (e.g. left at the origin)', () => {
  const pt = (x, y) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [x, y] } });
  const fc = { features: [...Array.from({ length: 30 }, (_, i) => pt(1100000 + i * 100, 1935000 + i * 50)), pt(0, 0), pt(12, 40)] };
  assert.equal(dropStrays(fc), 2);
  assert.equal(fc.features.length, 30);
});
