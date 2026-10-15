// Unit tests for the field-type logic in index.html (between the <fields-logic> markers).
// Run: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const src = html.split('// <fields-logic>')[1].split('// </fields-logic>')[0];
const toNum = v => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/,/g, '')); return isFinite(n) ? n : null; };
const { inferType, inferFields, coerce, validFieldName, shpFieldNames } =
  new Function('toNum', `${src}; return { inferType, inferFields, coerce, validFieldName, shpFieldNames };`)(toNum);

test('inferType picks one type per column, mixed falls back to text', () => {
  assert.equal(inferType([1, 2.5, null, '']), 'number');
  assert.equal(inferType([true, false]), 'bool');
  assert.equal(inferType(['2024-01-31', null]), 'date');
  assert.equal(inferType([1, 'a']), 'text');
  assert.equal(inferType([null, undefined]), 'text');
});

test('inferFields skips _fid and reads keys from all sampled features', () => {
  const f = inferFields([{ properties: { _fid: 1, a: 1 } }, { properties: { b: 'x' } }]);
  assert.deepEqual(f, [{ name: 'a', type: 'number' }, { name: 'b', type: 'text' }]);
});

test('coerce converts input to the field type, empty → null', () => {
  assert.equal(coerce('1,234.5', 'number'), 1234.5);
  assert.equal(coerce('abc', 'number'), null);
  assert.equal(coerce('', 'text'), null);
  assert.equal(coerce('Yes', 'bool'), true);
  assert.equal(coerce('0', 'bool'), false);
  assert.equal(coerce('maybe', 'bool'), null);
  assert.equal(coerce('2024-02-03', 'date'), '2024-02-03');
  assert.equal(coerce('not a date', 'date'), null);
  assert.equal(coerce(12, 'text'), '12');
});

test('validFieldName rejects empty, reserved and case-insensitive duplicates', () => {
  const fields = [{ name: 'Owner', type: 'text' }];
  assert.ok(validFieldName(fields, ' '));
  assert.ok(validFieldName(fields, '_fid'));
  assert.ok(validFieldName(fields, 'owner'));
  assert.equal(validFieldName(fields, 'owner', 'Owner'), null); // renaming a field to its own name in another case
  assert.equal(validFieldName(fields, 'parcel_id'), null);
});

test('shpFieldNames shortens to 10 chars and keeps names unique', () => {
  const m = shpFieldNames(['short', 'construction_start', 'construction_end', 'CONSTRUCTI', 'a b']);
  assert.equal(m.short, 'short');
  assert.equal(m.construction_start, 'constructi');
  assert.equal(m.construction_end, 'construct1');
  assert.equal(m.CONSTRUCTI, 'CONSTRUCT2'); // case kept, uniqueness is case-insensitive
  assert.equal(m['a b'], 'a_b');
  for (const v of Object.values(m)) assert.ok(v.length <= 10);
  assert.equal(new Set(Object.values(m).map(v => v.toLowerCase())).size, 5);
});
