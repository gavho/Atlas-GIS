/* ORD ALP: the Atlas extension (window.ATLAS_EXT). Uses ORD_DICT (dictionary.js) and classify/drawingOf (ord-logic.js).
   ALP layers are read-only; the only editable layer is "My proposals" (source.format = 'proposal'). */
let A = null; // the Atlas API, set in onBoot
const isProposal = l => l?.source?.format === 'proposal';
const memo = new Map();
const alpInfo = (f, l) => { // classification is per CAD layer, so cache by layer + block + drawing
  const p = f.properties || {}, d = drawingOf(l), k = `${p.Layer}|${p.BlockName || ''}|${d}`;
  if (!memo.has(k)) memo.set(k, classify(p.Layer, p.BlockName, d));
  return memo.get(k);
};
const PROP_KINDS = { Polygon: 'Polygons', LineString: 'Lines', Point: 'Points' };
const propKind = g => PROP_KINDS[String(g).replace(/^Multi/, '')] || 'Polygons';
async function saveChanges(api) {
  const bundled = api.getBundleLayerIds();
  if (!api.bundleId || !bundled) return api.toast('error', 'Can’t identify the delivered ALP', 'Open this app from the client folder, then try again.');
  const ws = api.serialize(), changes = ws.layers.filter(l => !bundled.has(l.id));
  if (!changes.length) return api.toast('info', 'No client layers to save', 'Add or import a layer or sketch first.');
  const name = `${String(api.S.workspace.name || 'ORD-ALP').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-changes.atlas.json`;
  ws.name = `${api.S.workspace.name} changes`;
  ws.layers = changes;
  ws.presets = { views: [], styles: [] };
  ws.areas = [];
  ws.groupStyle = {};
  ws.emptyGroups = [];
  ws.hiddenGroups = [];
  ws.atlasChangeSet = { version: 1, bundleId: api.bundleId };
  await api.saveWorkspaceData(ws, name);
}
/* "My proposals" is a group with one layer per geometry type, created on first use (the same split as a DWG import) */
function proposalsLayer(kind) {
  let l = A.S.layers.find(x => isProposal(x) && x.source.kind === kind);
  if (!l) {
    l = A.newLayer({ name: `My proposals — ${kind}`, source: { fileName: null, format: 'proposal', kind, crs: 'EPSG:4326', importedAt: new Date().toISOString() },
      fields: [{ name: 'name', type: 'text' }, { name: 'type', type: 'text' }, { name: 'height_ft', type: 'number' }, { name: 'notes', type: 'text' }],
      style: { fill: '#38bdf8', fillOpacity: 0.35, strokeWidth: 2 } });
    A.addLayer(l); A.setGroup(l, 'My proposals');
    A.toast('info', `Created “My proposals — ${kind}”`, 'Your sketches go here, split by shape type. The ALP layers stay as they came from CAD. To draw into a layer of your own, create it with + and keep it highlighted.');
  }
  return l;
}
function alpCard(f, l) {
  const i = alpInfo(f, l), like = l.data.features.filter(x => x.properties.Layer === f.properties.Layer).map(x => x.properties._fid);
  const card = A.el(`<div class="alp-card texture">
    <div class="alp-k"><span class="alp-status s-${i.status}">${A.esc(i.statusLabel)}</span><span class="pill">${A.esc(ORD_THEMES[i.theme] || i.theme)}</span>${i.known ? `<span class="pill mono">${A.esc(i.code)}</span>` : ''}</div>
    ${i.known ? `${i.what ? `<p class="alp-what">${A.esc(i.what)}</p>` : ''}${i.why ? `<p class="alp-why"><b>Why it matters.</b> ${A.esc(i.why)}</p>` : ''}`
      : `<p class="alp-what">This CAD layer isn’t in the ORD dictionary yet.</p>`}
    <dl class="alp-src"><dt>Drawing</dt><dd>${A.esc(i.drawing)}</dd><dt>CAD layer</dt><dd class="mono">${A.esc(i.cad || '—')}</dd>${i.block ? `<dt>Block</dt><dd class="mono">${A.esc(i.block)}</dd>` : ''}</dl>
    ${like.length > 1 ? `<button class="btn sm" data-a="like">${A.icon('target', 13)} Show all ${like.length} like this</button>` : ''}
  </div>`);
  card.querySelector('[data-a=like]')?.addEventListener('click', () => { // highlight every feature on the same CAD layer, everything else steps back
    if (A.S.ui.focus !== l.id) A.setFocus(l.id);
    A.select(l.id, like, { zoom: true });
  });
  return card;
}

/* ---------- Phase 2: lenses (themes) and plan views (As drawn / Existing / Future / Changes) ---------- */
const view = { lens: 'all', mode: 'all', off: {} }; // off: lens id → Set of category names switched off in that lens
const isAlp = l => !!l && !isProposal(l) && l.fields?.some(f => f.name === 'Layer');
const isRemovedLayer = l => l.name.endsWith('Removed / demolition');
const KEY = ['concat', ['to-string', ['coalesce', ['get', 'Layer'], '']], '|', ['to-string', ['coalesce', ['get', 'BlockName'], '']]];
const keyOf = p => `${p.Layer ?? ''}|${p.BlockName ?? ''}`;
const keyCache = new Map(); // layer id → { v, infos: Map key → info, counts: Map key → n }
function layerKeys(l) {
  let c = keyCache.get(l.id);
  if (!c || c.v !== l._v) {
    c = { v: l._v, infos: new Map(), counts: new Map() };
    for (const f of l.data.features) { const k = keyOf(f.properties); if (!c.infos.has(k)) c.infos.set(k, alpInfo(f, l)); c.counts.set(k, (c.counts.get(k) || 0) + 1); }
    keyCache.set(l.id, c);
  }
  return c;
}
const lensOf = id => ORD_LENSES.find(x => x.id === id);
const offSet = () => view.off[view.lens] ||= new Set();
const planOf = l => lensPlan(layerKeys(l).infos, lensOf(view.lens), view.mode, offSet());
const viewActive = () => view.lens !== 'all' || view.mode !== 'all' || offSet().size > 0;
const inKeys = keys => ['in', KEY, ['literal', keys]];
function setView(patch) {
  Object.assign(view, patch);
  if (viewActive()) A.S.ui.legend = true; // a lens or plan view describes its categories in the legend
  A.syncAllLayers(); A.emit('layers');
}
function subOf(name) { // legend rows under a category colored by an attribute
  const by = sym[name]?.by; if (!by) return null;
  const cm = [...byColors(name, by)];
  return [...cm.slice(0, 12).map(([v, c]) => ({ label: v, color: c })), ...(cm.length > 12 ? [{ label: `+${cm.length - 12} more`, color: 'transparent' }] : [])];
}
function lensLegend() {
  if (!A) return null; // Atlas renders once before onBoot
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  if (view.mode === 'changes') return [
    { label: 'New in the future plan', kind: 'fill', color: css('--success'), stroke: css('--success'), opacity: 0.3 },
    { label: 'Removed, demolished or relocated', kind: 'fill', color: css('--danger'), stroke: css('--danger'), opacity: 0.3 },
    { label: 'Unchanged (existing)', kind: 'fill', color: css('--ink-subtle'), stroke: css('--ink-subtle'), opacity: 0.3 }];
  const seen = new Map();
  for (const l of A.S.layers) {
    if (!isAlp(l) || !(ORD_HOOKS.visible(l) ?? l.visible)) continue;
    const { infos } = layerKeys(l);
    for (const k of planOf(l).show) { const i = infos.get(k), c = sym[i.name]?.color || l.style.fill; if (!seen.has(i.name)) seen.set(i.name, { key: i.name, label: i.name, color: c, stroke: c, opacity: 0.3, sub: subOf(i.name),
      kind: /pavement|protection|structure/.test(i.role) ? 'fill' : i.role === 'line' ? 'line' : 'point' }); }
  }
  const items = [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
  if (!items.length) return null;
  return items.length > 60 ? [...items.slice(0, 60), { label: `+${items.length - 60} more (pick a view to narrow)`, kind: 'point', color: 'transparent', stroke: 'transparent' }] : items;
}
const compact = n => n < 1000 ? String(n) : n < 1e6 ? `${(n / 1000).toFixed(n < 10000 ? 1 : 0)}k` : `${(n / 1e6).toFixed(1)}M`;
function renderLensPanel() {
  let box = document.getElementById('ord-lens');
  if (!box) { box = A.el('<div id="ord-lens" class="ord-lens" role="group" aria-label="Views"></div>'); document.getElementById('layer-list').before(box); }
  const alp = A.S.layers.filter(isAlp);
  if (!alp.length) { box.innerHTML = ''; return; }
  const counts = Object.fromEntries(ORD_LENSES.map(x => [x.id, 0]));
  for (const l of alp) { const { infos, counts: c } = layerKeys(l); for (const [k, i] of infos) if (statusShown(view.mode, i.status)) for (const x of ORD_LENSES) if (!x.themes || x.themes.includes(i.theme)) counts[x.id] += c.get(k); }
  box.innerHTML = `<div class="ord-lens-h">Views<span>${A.esc(lensOf(view.lens).hint)}</span></div><div class="ord-lens-g">${ORD_LENSES.map(x => `<button class="${view.lens === x.id ? 'on' : ''}" data-l="${x.id}" aria-pressed="${view.lens === x.id}" title="${A.esc(x.hint)}">${A.icon(x.icon, 14)}<span>${A.esc(x.name)}</span><em>${compact(counts[x.id])}</em></button>`).join('')}</div>`;
  box.querySelectorAll('[data-l]').forEach(b => b.onclick = () => setView({ lens: b.dataset.l }));
  renderCategories(box, alp);
}
/* Categories inside the current view and plan mode: switch any off across every drawing, double-click to show only one, Show all reverts */
function renderCategories(box, alp) {
  const lens = lensOf(view.lens), off = offSet(), n = new Map();
  for (const l of alp) { const { infos, counts } = layerKeys(l); for (const [k, i] of infos) if (statusShown(view.mode, i.status) && (!lens.themes || lens.themes.includes(i.theme))) n.set(i.name, (n.get(i.name) || 0) + counts.get(k)); }
  const names = [...n.keys()].sort((a, b) => n.get(b) - n.get(a) || a.localeCompare(b)), shown = names.filter(x => !off.has(x)).length;
  const cats = A.el(`<details id="ord-cats" class="ord-cats" ${view.catsClosed ? '' : 'open'}><summary>Categories <span>${shown} of ${names.length} shown</span></summary>
    <div class="ord-cats-a"><button class="btn sm ghost" data-c="all" ${off.size ? '' : 'disabled'}>Show all</button><button class="btn sm ghost" data-c="none" ${shown ? '' : 'disabled'}>Hide all</button><span>Double-click a category to show only it</span></div>
    <div class="ord-cats-l">${names.map(x => `<label class="ord-cat ${off.has(x) ? 'off' : ''}" title="${A.esc(x)}"><input type="checkbox" data-n="${A.esc(x)}" ${off.has(x) ? '' : 'checked'}><span>${A.esc(x)}</span><em>${compact(n.get(x))}</em></label>`).join('')}</div></details>`);
  cats.addEventListener('toggle', () => { view.catsClosed = !cats.open; });
  cats.querySelectorAll('[data-n]').forEach(c => {
    c.onchange = () => { c.checked ? off.delete(c.dataset.n) : off.add(c.dataset.n); setView({}); };
    c.parentElement.ondblclick = e => { e.preventDefault(); off.clear(); names.forEach(x => x !== c.dataset.n && off.add(x)); setView({}); };
  });
  cats.querySelector('[data-c=all]').onclick = () => { off.clear(); setView({}); };
  cats.querySelector('[data-c=none]').onclick = () => { names.forEach(x => off.add(x)); setView({}); };
  box.append(cats);
}
function renderModeSwitch() {
  let seg = document.getElementById('ord-mode');
  if (!seg) { seg = A.el('<div class="seg ord-seg" id="ord-mode" role="group" aria-label="Plan view"></div>'); document.getElementById('seg-mode').before(seg); }
  seg.innerHTML = ORD_MODES.map(([k, t]) => `<button data-m="${k}" class="${view.mode === k ? 'on' : ''}" aria-pressed="${view.mode === k}">${t}</button>`).join('');
  seg.querySelectorAll('[data-m]').forEach(b => b.onclick = () => setView({ mode: b.dataset.m }));
}
const ORD_HOOKS = {
  filter: l => !isAlp(l) || !viewActive() ? true : (p => inKeys([...p.show, ...p.dim]))(planOf(l)),
  dim: l => !isAlp(l) || !viewActive() ? null : (p => p.dim.length ? inKeys(p.dim) : null)(planOf(l)),
  paint: l => {
    if (!A || !isAlp(l)) return null;
    if (view.mode === 'changes') {
      const p = planOf(l), css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
      return { color: ['case', inKeys(p.add), css('--success'), inKeys(p.rem), css('--danger'), css('--ink-subtle')] };
    }
    const by = {}, infos = layerKeys(l).infos;
    for (const [k, i] of infos) if (sym[i.name]) (by[i.name] ||= { name: i.name, s: sym[i.name], keys: [] }).keys.push(k);
    const g = Object.values(by); if (!g.length) return null;
    const pairs = [];
    for (const x of g) {
      if (x.s.by) { const cm = byColors(x.name, x.s.by); for (const k of x.keys) pairs.push(inKeys([k]), cm.get(valueOf(infos.get(k), x.s.by))); }
      else if (x.s.color) pairs.push(inKeys(x.keys), x.s.color);
    }
    const pick = (prop, base) => { const c = g.filter(x => x.s[prop] != null); return c.length ? ['case', ...c.flatMap(x => [inKeys(x.keys), x.s[prop]]), base] : undefined; };
    const dash = g.filter(x => x.s.dash).flatMap(x => x.keys);
    return { color: pairs.length ? ['case', ...pairs, l.style.fill || '#888888'] : undefined, width: pick('width', l.style.strokeWidth), fillOpacity: pick('fillOpacity', l.style.fillOpacity), dash: dash.length ? inKeys(dash) : undefined };
  },
  legendClick: (item, el) => symMenu(item, el),
  layerState: l => {
    if (!isAlp(l) || !viewActive()) return null;
    const p = planOf(l), { counts } = layerKeys(l), shownLayer = ORD_HOOKS.visible(l) ?? l.visible;
    return { on: shownLayer && p.show.length > 0, n: p.show.reduce((t, k) => t + counts.get(k), 0) };
  },
  // removed/demolished layers are hidden as delivered; Existing and Changes need them, Future never shows them
  visible: l => !isRemovedLayer(l) || view.mode === 'all' ? undefined : view.mode !== 'future',
  legend: lensLegend,
};

/* Category symbology set from the map legend: name → { color, width, fillOpacity, dash }, applied to every feature of that
   category in every drawing. Kept in this browser (a per-viewer preference, not project data). */
const SYM_KEY = 'ord-alp-symbology';
const sym = (() => { try { return JSON.parse(localStorage.getItem(SYM_KEY)) || {}; } catch (e) { return {}; } })();
const SYM_COLORS = ['#3EB3E3', '#E91D2C', '#F5A623', '#7ED321', '#BD10E0', '#50E3C2', '#F8E71C', '#FF7F50', '#2385C7', '#B8E986', '#9013FE', '#C0C0C0'];
const BY = { cad: 'CAD layer', drawing: 'Source drawing', status: 'Plan status' };
const valueOf = (i, by) => by === 'drawing' ? i.drawing : by === 'status' ? i.statusLabel : i.cad || i.block || '—';
function byColors(name, by) { // every value of this category across all ALP drawings, sorted, so a value keeps its color everywhere
  const vals = new Set();
  for (const l of A.S.layers) if (isAlp(l)) for (const i of layerKeys(l).infos.values()) if (i.name === name) vals.add(valueOf(i, by));
  return new Map([...vals].sort().map((v, j) => [v, SYM_COLORS[j % SYM_COLORS.length]]));
}
function setSym(name, patch) {
  const v = { ...sym[name], ...patch }; for (const k of Object.keys(v)) if (v[k] == null) delete v[k];
  if (Object.keys(v).length) sym[name] = v; else delete sym[name];
  try { localStorage.setItem(SYM_KEY, JSON.stringify(sym)); } catch (e) {}
  setView({});
}
function pickColor(start, done) { // the native color picker, attached only while open
  const inp = Object.assign(document.createElement('input'), { type: 'color', value: /^#[0-9a-f]{6}$/i.test(start) ? start : '#3EB3E3' });
  inp.style.cssText = 'position:fixed;left:-99px;opacity:0';
  inp.oninput = () => done(inp.value);
  inp.onchange = inp.onblur = () => inp.remove();
  document.body.append(inp); inp.click();
}
function symMenu(item, el) {
  const name = item.key, s = sym[name] || {}, w = s.width ?? 1.2, f = s.fillOpacity ?? 0.25;
  const used = new Set([...document.querySelectorAll('#map-legend .lg-btn i')].map(i => (i.style.borderColor || i.style.background).toLowerCase()));
  const fresh = SYM_COLORS.find(c => !used.has(c.toLowerCase()) && c !== item.color) || SYM_COLORS[Math.floor(Math.random() * SYM_COLORS.length)];
  A.openMenu(el, [
    { header: name },
    { label: 'New color', icon: 'style', fn: () => setSym(name, { color: fresh, by: null }) },
    { label: 'Choose color…', icon: 'style', fn: () => pickColor(item.color, c => setSym(name, { color: c, by: null })) },
    { header: 'Color by' },
    { label: 'One color', icon: 'style', checked: !s.by, fn: () => setSym(name, { by: null }) },
    ...Object.entries(BY).map(([k, t]) => ({ label: t, icon: 'layers', checked: s.by === k, fn: () => setSym(name, { by: k }) })),
    { sep: true },
    { label: 'Solid lines', icon: 'line', checked: !s.dash, fn: () => setSym(name, { dash: null }) },
    { label: 'Dashed lines', icon: 'line', checked: !!s.dash, fn: () => setSym(name, { dash: true }) },
    { label: `Thicker (${w} → ${w + 1})`, icon: 'plus', fn: () => setSym(name, { width: w + 1 }) },
    { label: `Thinner (${w} → ${Math.max(0.5, w - 1)})`, icon: 'line', disabled: w <= 0.5, fn: () => setSym(name, { width: Math.max(0.5, w - 1) }) },
    { label: 'Stronger fill', icon: 'area', disabled: f >= 0.9, fn: () => setSym(name, { fillOpacity: Math.min(0.9, +(f + 0.2).toFixed(2)) }) },
    { label: 'Lighter fill', icon: 'area', disabled: f <= 0, fn: () => setSym(name, { fillOpacity: Math.max(0, +(f - 0.15).toFixed(2)) }) },
    { sep: true },
    { label: 'Hide this category', icon: 'eyeOff', fn: () => { offSet().add(name); setView({}); } },
    { label: 'Show only this', icon: 'target', fn: () => { const off = offSet(); off.clear(); document.querySelectorAll('#ord-cats [data-n]').forEach(c => c.dataset.n !== name && off.add(c.dataset.n)); setView({}); } },
    sym[name] && { label: 'Reset this style', icon: 'undo', fn: () => setSym(name, { color: null, width: null, fillOpacity: null, dash: null, by: null }) },
    Object.keys(sym).length > 1 && { label: 'Reset all category styles', icon: 'undo', fn: () => { for (const k of Object.keys(sym)) delete sym[k]; setSym(name, {}); } },
  ]);
}

/* Guided tours for this layout (the Atlas navigation and groups tours are reused) */
const ORD_TOURS = [
  { id: 'ord-read', icon: 'map', title: 'Read the ALP', desc: 'Plan views, views by topic, categories, the legend and click-to-explain.', steps: [
    { el: '#ord-mode', title: 'Plan view', text: '<b>As drawn</b> shows the ALP as delivered. <b>Existing</b> shows today’s airport, including what will be removed. <b>Future</b> shows the plan once built. <b>Changes</b> colors new work green and removals red.' },
    { el: '#ord-lens .ord-lens-g', title: 'Views', text: 'Pick a topic: Airfield, Safety areas, Imaginary surfaces, NAVAIDs, Buildings, Landside or Security. Only that topic is drawn, with runways and taxiways kept faint for orientation. The number is how many features it holds in the current plan view. In the layer list below, the drawings this view uses are highlighted with their counts; the rest fade.' },
    { el: '#ord-cats', title: 'Categories', text: 'Everything in the current view, by plain name, across all drawings. Untick a category to hide it everywhere; <b>double-click</b> one to show only it. <b>Show all</b> reverts. Each view remembers its own choices.' },
    { el: '#map-legend', title: 'Legend', text: 'Lists what is on the map by plain name (or the Changes colors). <b>Click a category</b> to restyle it everywhere at once: new or custom color, <b>color by</b> CAD layer, source drawing or plan status, dashed or solid, thicker or thinner lines, stronger or lighter fill, hide it or show only it. <i>Reset</i> puts it back.' },
    { el: '#map', title: 'Click anything', text: 'Hover for its name and status; click for a card that says what it is, why it matters (with the FAA reference), its status and the CAD drawing it came from. <b>Show all like this</b> highlights every feature of that kind.' },
  ] },
  { id: 'ord-sketch', icon: 'polygon', title: 'Sketch a proposal', desc: 'Draw ideas on top of the ALP without changing it.', steps: [
    { el: '#draw-toolbar', title: 'Draw', text: 'Polygon <kbd>P</kbd>, rectangle <kbd>R</kbd>, line <kbd>L</kbd> or point <kbd>M</kbd>. Polygons and lines finish when you click the last point again. Shapes go into <b>My proposals</b> (one layer each for polygons, lines and points, created the first time you draw). To draw into a layer of your own, create it with <b>+</b> and keep it highlighted.' },
    { el: '#layer-list', title: 'The ALP stays as delivered', text: 'ALP layers come from the CAD drawings and are read-only. <b>My proposals</b> and any layer you create are yours: double-click a shape to reshape it, <kbd>Ctrl Z</kbd> undoes.' },
    { el: '#right', title: 'Describe it', text: 'With a proposal selected, fill in its name, type, height (ft) and notes here. Its size in acres and perimeter appears at the top.', before: () => A.showPanel('right', true) },
  ] },
  { id: 'ord-share', icon: 'download', title: 'Save & share', desc: 'Where your work is kept and how to send it.', steps: [
    { el: '#btn-save', title: 'Saved as you go', text: 'Your full session, including the ALP and your layers, is saved in this browser and comes back next time. <b>Save changes</b> downloads only your added and imported layers as an .atlas.json file to send back.' },
    { el: '#btn-export', title: 'Export', text: '<b>Map print</b> makes a PDF or PNG sheet of what is on screen. To send your work back, use <b>Save changes</b>; it does not include the delivered ALP.' },
    { el: '#btn-more', title: 'Start over', text: '<b>Reload the original project</b> (under ⋯) puts the ALP back exactly as delivered.' },
  ] },
];

window.ATLAS_EXT = {
  brand: { name: 'ORD ALP', title: 'ORD ALP — Chicago Department of Aviation',
    // CDA logo: sky-blue flag square, Chicago star and the CDA wordmark (from the CDA identity)
    mark: '<svg viewBox="120 70 1125 375" role="img" aria-label="CDA"><rect x="130.2" y="135.1" width="312" height="244.2" style="fill:var(--cda-sky)"/><polygon style="fill:var(--cda-red)" points="630.4 77.2 597.4 200.2 474.4 167.2 564.4 257.2 474.4 347.2 597.4 314.2 630.4 437.2 663.4 314.2 786.4 347.2 696.4 257.2 786.4 167.2 663.4 200.2"/><g style="fill:var(--hero-ink)"><path d="M888.9,381.9c-20.7,0-35.5-4.3-44.2-13-8.7-8.6-13.3-22.9-13.7-42.9-.4-13.2-.6-28-.6-44.4v-49.1c0-16.4.2-31.3.6-44.7.2-17.3,4.8-30.9,13.9-40.7,9-9.9,23.7-14.8,44.1-14.8s34.4,4.3,43.3,13c8.9,8.6,13.7,22.9,14.3,42.9v18.3c0,7.1-.1,13.3-.3,18.6h-39.3c.2-6.3.3-13.7.3-22.1v-22.1c-.4-10.8-6.5-16.2-18.3-16.2s-18.4,5.4-18.6,16.2c-.6,15.7-1,32.3-1.1,49.9s-.1,35.1,0,52.6.5,34.1,1.1,49.7c.2,11.2,6.4,16.8,18.6,16.8s19.1-5.6,19.5-16.8v-44.5h39.3c0,5.7,0,11.9.2,18.6,0,6.7,0,13-.2,18.9-.6,19.9-5.5,34.2-14.6,42.9-9.2,8.6-23.9,13-44.2,13l-.1-.1Z"/><path d="M969.5,379.1v-244h56.1c20.7,0,35.7,4.4,45,13.3,9.2,8.8,14.1,23.4,14.5,43.8.2,15.5.4,30.1.5,44.1.1,13.9.1,27.8,0,41.6-.1,13.8-.3,28.5-.5,43.9-.4,20.5-5.2,35.2-14.5,44.1-9.3,8.8-24.2,13.3-45,13.3h-56.1v-.1ZM1008.8,344.4h16.8c13,0,19.7-6,20.1-18,1-46.2,1-92.4,0-138.8-.4-11.8-7.1-17.7-20.1-17.7h-16.8v174.5Z"/><path d="M1105.8,379.1l31.7-244h63.4l32,244h-40.6l-5.5-55.8h-35.4l-5.5,55.8h-40.3.2ZM1155.2,288.5h28.1l-5.2-54-4.6-64.7h-8.5l-4.3,64.7-5.5,54Z"/></g></svg>',
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='465 70 330 375'%3E%3Cpolygon fill='%23E91D2C' points='630.4 77.2 597.4 200.2 474.4 167.2 564.4 257.2 474.4 347.2 597.4 314.2 630.4 437.2 663.4 314.2 786.4 347.2 696.4 257.2 786.4 167.2 663.4 200.2'/%3E%3C/svg%3E" },
  tours: base => [ORD_TOURS[0], ORD_TOURS[1], { ...base.find(t => t.id === 'nav'), steps: base.find(t => t.id === 'nav').steps.filter(x => x.el !== '#btn-area') }, base.find(t => t.id === 'groups'), ORD_TOURS[2]],
  autosaveKey: 'ord-alp-autosave',
  saveLabel: 'Save changes',
  saveAction: saveChanges,
  // the airfield (runways, taxiways, terminals) from the ALP drawings, with a little slack; built in so it can't be deleted
  defaultView: { name: 'O’Hare airfield', bbox: [-87.9400, 41.9460, -87.8700, 42.0090] },
  loading: { title: 'Loading the <em>ORD ALP</em>…', text: 'Opening the Airport Layout Plan data delivered with this app. This takes a few seconds.' },
  readOnlyHint: 'ALP layers come from the CAD drawings. Sketch ideas in “My proposals” instead.',
  empty: { title: 'Read the <em>ORD ALP</em>',
    text: 'Open the ORD ALP package (ORD-Future-ALP.atlas.zip) to explore the Airport Layout Plan. Click anything for a plain-language explanation, and sketch your own proposals. Everything stays on this computer.' },
  hooks: {
    ...ORD_HOOKS,
    editable: l => !isAlp(l), // only the CAD-derived ALP layers are locked
    drawTarget: g => { const a = A.layerById(A.S.ui.activeLayer); return a && !isAlp(a) && !isProposal(a) ? a : proposalsLayer(propKind(g)); },
    describe: (f, l) => !l || isProposal(l) || f.properties?.Layer == null ? null : (i => ({ title: i.name, sub: `${i.statusLabel} · ${i.drawing}` }))(alpInfo(f, l)),
    inspector: (f, l) => !l || isProposal(l) || f.properties?.Layer == null ? null : alpCard(f, l),
  },
  onBoot(api) {
    A = api;
    // this app has no GIS-area lock (its button is hidden): drop any lock a package or an older session carries
    A.on('workspace', () => { if (A.S.ui.area) A.setArea(null, { quiet: true }); });
    renderModeSwitch(); renderLensPanel();
    A.on('layers', () => { renderLensPanel(); renderModeSwitch(); });
  },
};
