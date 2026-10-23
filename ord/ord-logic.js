/* ORD ALP logic: pure functions over plain feature properties (no DOM, no map). Unit-tested by tests/ord.test.mjs. */
// <ord-logic>
const ORD_STATUS = { future: 'Future', existing: 'Existing', demolished: 'To be demolished', relocated: 'Relocated', unusable: 'Closed / unusable', past: 'Superseded' };
const ORD_THEMES = { airfield: 'Airfield', safety: 'Safety areas', part77: 'Imaginary surfaces', nav: 'NAVAIDs', buildings: 'Buildings', landside: 'Landside',
  security: 'Security', property: 'Property', water: 'Water', survey: 'Survey', labels: 'Labels', other: 'Other' };

/* Plan status from the CAD layer, block and source drawing. Removal words win; then "-EX"/"EXIST"; then FUT- prefixes. */
function alpStatus(cad = '', block = '', drawing = '') {
  const s = `${cad} ${block}`;
  if (/DEMO/i.test(s)) return 'demolished';
  if (/RELOCAT|_RELO\b/i.test(s)) return 'relocated';
  if (/UNUS(E)?ABLE/i.test(s)) return 'unusable';
  if (/PAST[_ ]/i.test(s)) return 'past';
  if (/_NEW\b|-NEW\b|\bNEW\b/i.test(s)) return 'future';
  if (/(^|[-_ ])EX(IST(ING)?)?($|[-_ ])/i.test(cad)) return 'existing';
  if (/^FUT/i.test(cad) || /FUTURE/i.test(cad) || /^FUT/i.test(drawing)) return 'future';
  return 'existing';
}

/* Plain-language description of one CAD entity. Unknown layers keep their raw name so planners can report gaps. */
function classify(cad = '', block = '', drawing = '') {
  const e = ORD_DICT.find(d => d.re.test(cad || '')) || (block ? ORD_DICT.find(d => d.re.test(block)) : null);
  const status = alpStatus(cad, block, drawing);
  return e ? { known: true, code: e.code, name: e.name, what: e.what, why: e.why, theme: e.theme, role: e.role, status, statusLabel: ORD_STATUS[status], cad, block, drawing }
    : { known: false, code: cad || block || '?', name: cad || block || 'Unnamed CAD object', what: '', why: '', theme: 'other', role: 'other', status, statusLabel: ORD_STATUS[status], cad, block, drawing };
}

/* Source drawing of an Atlas layer built from a DWG: its group's last segment, else the name before " — " */
const drawingOf = l => l.group ? l.group.slice(l.group.lastIndexOf('/') + 1) : String(l.name || '').split(' — ')[0];

/* Lenses: one-click views by theme. Runway/taxiway/apron pavement stays as faint context in every lens. */
const ORD_LENSES = [
  { id: 'all', name: 'Everything', icon: 'layers', themes: null, hint: 'The whole ALP as drawn.' },
  { id: 'airfield', name: 'Airfield', icon: 'polygon', themes: ['airfield'], hint: 'Runways, taxiways, aprons, markings and gates.' },
  { id: 'safety', name: 'Safety areas', icon: 'area', themes: ['safety'], hint: 'RSA, OFA, RPZ, TOFA, POFA, RVZ and the BRL.' },
  { id: 'part77', name: 'Imaginary surfaces', icon: 'zap', themes: ['part77'], hint: 'Part 77 surfaces and threshold siting surfaces (outlines only).' },
  { id: 'nav', name: 'NAVAIDs', icon: 'target', themes: ['nav'], hint: 'Approach lights, ILS, radar, weather and their critical areas.' },
  { id: 'buildings', name: 'Buildings', icon: 'layers', themes: ['buildings'], hint: 'Terminals, support, hotel, tanks and relocations.' },
  { id: 'landside', name: 'Landside', icon: 'map', themes: ['landside', 'water'], hint: 'Roads, people mover, rail, parking, development and water.' },
  { id: 'security', name: 'Security & property', icon: 'lock', themes: ['security', 'property', 'survey'], hint: 'Fences, gates, guard posts, property lines and easements.' },
];
const ORD_MODES = [['all', 'As drawn'], ['existing', 'Existing'], ['future', 'Future'], ['changes', 'Changes']];
const ORD_REMOVED = ['demolished', 'relocated', 'unusable'];
function statusShown(mode, status) { // which plan statuses each Existing / Future / Changes view shows
  if (mode === 'existing') return status !== 'future' && status !== 'past';
  if (mode === 'future') return !ORD_REMOVED.includes(status) && status !== 'past';
  if (mode === 'changes') return status !== 'past';
  return true;
}
const changeOf = status => status === 'future' ? 'new' : ORD_REMOVED.includes(status) ? 'removed' : 'same';
const isContext = i => i.theme === 'airfield' && i.role === 'pavement';
/* For one layer's classified keys (Map key → info): which keys to show, show faint (context), and color as new / removed in Changes.
   off: plain-language category names the planner switched off inside this lens (a Set), applied across every layer. */
function lensPlan(infos, lens, mode, off = null) {
  const plan = { show: [], dim: [], add: [], rem: [] };
  for (const [k, i] of infos) {
    if (!statusShown(mode, i.status)) continue;
    if (!lens.themes || lens.themes.includes(i.theme)) {
      if (off?.has(i.name)) continue;
      plan.show.push(k);
      if (mode === 'changes') { const c = changeOf(i.status); if (c === 'new') plan.add.push(k); else if (c === 'removed') plan.rem.push(k); }
    } else if (isContext(i)) plan.dim.push(k);
  }
  return plan;
}
// </ord-logic>
