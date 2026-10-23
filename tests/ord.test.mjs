// Unit tests for the ORD ALP dictionary and classification (ord/dictionary.js + ord/ord-logic.js).
// Run: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const logic = read('ord/ord-logic.js').split('// <ord-logic>')[1].split('// </ord-logic>')[0];
const { classify, alpStatus, drawingOf, ORD_DICT } = new Function(`${read('ord/dictionary.js')}\n${logic}\nreturn { classify, alpStatus, drawingOf, ORD_DICT };`)();

test('safety areas are named in plain language with the right theme and role', () => {
  const ofa = classify('RWY-OFA', '', 'FUT-RWY-AREAS');
  assert.equal(ofa.name, 'Runway Object Free Area');
  assert.equal(ofa.theme, 'safety'); assert.equal(ofa.role, 'protection-area'); assert.equal(ofa.status, 'future');
  assert.equal(classify('TWY-OFA', '', 'FUT-RWY-AREAS').code, 'TOFA');
  assert.equal(classify('Part77', '', 'FUT-RWY-AREAS').theme, 'part77');
  assert.equal(classify('RWY-RPZ', '', 'FUT-RWY-AREAS').name, 'Runway Protection Zone');
});

test('first match wins for look-alike layers', () => {
  assert.equal(classify('RWY-HTCH-Unuseable', '', 'ALP-RWY-HTCH').code, 'Unusable');
  assert.equal(classify('RWY-HTCH_Blast Pad', '', 'ALP-RWY-HTCH').code, 'Blast pad');
  assert.equal(classify('BRL-Past_PROP_LINE', '', 'FUT-BRL').name, 'Former property line');
  assert.equal(classify('FENCE-AOA-GATE', '', 'FUT-FENCE').name, 'Fence gate');
  assert.equal(classify('FENCE-AOA', '', 'FUT-FENCE').name, 'AOA security fence');
  assert.equal(classify('TWY-HLD-LNS-EX', '', 'ALP-TWY').code, 'Hold line');
});

test('status: removal words, then existing markers, then future drawings', () => {
  assert.equal(alpStatus('FUT-TWY-DEMO', '', 'FUT-TWY-DEMO-HTCH'), 'demolished');
  assert.equal(alpStatus('BLDG-RELOCATED', '', 'FUT-BLDG'), 'relocated');
  assert.equal(alpStatus('0', 'Guard Post_Relo', 'FUT-Guard Posts'), 'relocated');
  assert.equal(alpStatus('0', 'Guard Post_New', 'FUT-Guard Posts'), 'future');
  assert.equal(alpStatus('FENCE-EXIST', '', 'FUT-FENCE'), 'existing');
  assert.equal(alpStatus('RWY-HTCH-EX', '', 'FUT-RWY-HTCH'), 'existing');
  assert.equal(alpStatus('TWY-HTCH', '', 'ALP-TWY-HTCH'), 'existing');
  assert.equal(alpStatus('FUT-BLDG-TERMINAL', '', 'FUT-BLDG-NEW'), 'future');
});

test('blocks are used when the CAD layer says nothing; unknown layers keep their raw name', () => {
  assert.equal(classify('0', 'Guard Post', 'FUT-Guard Posts').name, 'Guard post');
  const u = classify('C-ANNO-REFR', '', 'ALP-RD');
  assert.equal(u.known, false); assert.equal(u.name, 'C-ANNO-REFR');
});

test('drawingOf reads the DWG group (nested or not) or the layer name', () => {
  assert.equal(drawingOf({ group: 'ORD Future – Airfield/FUT-TWY', name: 'FUT-TWY — Polygons' }), 'FUT-TWY');
  assert.equal(drawingOf({ group: null, name: 'ALP-RD — Polylines' }), 'ALP-RD');
});

test('every dictionary entry is complete', () => {
  for (const d of ORD_DICT) for (const k of ['re', 'code', 'name', 'theme', 'role']) assert.ok(d[k], `${d.code || d.re}: missing ${k}`);
});

const L = new Function(`${read('ord/dictionary.js')}\n${logic}\nreturn { lensPlan, statusShown, ORD_LENSES, classify };`)();
const infos = new Map([['RWY-OFA|', 'FUT-RWY-AREAS'], ['FUT-RWY-HTCH|', 'FUT-RWY-HTCH'], ['FUT-TWY-DEMO|', 'FUT-TWY-DEMO-HTCH'], ['TWY-HTCH|', 'ALP-TWY-HTCH'], ['FUT-BLDG-SUPPORT|', 'FUT-BLDG-NEW']]
  .map(([k, d]) => [k, L.classify(k.split('|')[0], '', d)]));
const lens = id => L.ORD_LENSES.find(x => x.id === id);

test('a lens shows its theme and keeps airfield pavement as faint context', () => {
  const p = L.lensPlan(infos, lens('safety'), 'all');
  assert.deepEqual(p.show, ['RWY-OFA|']);
  assert.deepEqual(p.dim.sort(), ['FUT-RWY-HTCH|', 'FUT-TWY-DEMO|', 'TWY-HTCH|']);
  assert.equal(L.lensPlan(infos, lens('all'), 'all').show.length, 5);
});

test('Existing hides future; Future hides demolished; Changes marks new and removed', () => {
  assert.deepEqual(L.lensPlan(infos, lens('airfield'), 'existing').show.sort(), ['FUT-TWY-DEMO|', 'TWY-HTCH|']);
  assert.deepEqual(L.lensPlan(infos, lens('airfield'), 'future').show.sort(), ['FUT-RWY-HTCH|', 'TWY-HTCH|']);
  const c = L.lensPlan(infos, lens('all'), 'changes');
  assert.deepEqual(c.add.sort(), ['FUT-BLDG-SUPPORT|', 'FUT-RWY-HTCH|', 'RWY-OFA|']);
  assert.deepEqual(c.rem, ['FUT-TWY-DEMO|']);
  assert.equal(L.statusShown('existing', 'past'), false);
});

test('categories switched off inside a lens drop out of every layer; context stays', () => {
  const p = L.lensPlan(infos, lens('all'), 'all', new Set(['Runway Object Free Area', 'Airport support building']));
  assert.deepEqual(p.show.sort(), ['FUT-RWY-HTCH|', 'FUT-TWY-DEMO|', 'TWY-HTCH|']);
  const s = L.lensPlan(infos, lens('safety'), 'all', new Set(['Runway Object Free Area']));
  assert.deepEqual(s.show, []); assert.equal(s.dim.length, 3);
});
