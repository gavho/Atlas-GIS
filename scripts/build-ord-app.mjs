// Generates dist/ORD-ALP.html = dist/Atlas-GIS.html + the ORD extension (ord/*). Never edit the output; edit Atlas or ord/ and re-run.
// Usage: node scripts/build-ord-app.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = f => readFileSync(join(ROOT, f), 'utf8');
const atlas = read('dist/Atlas-GIS.html');
const MODULE = '<script type="module">';
if (atlas.split(MODULE).length !== 2 || !atlas.includes('<title>Atlas</title>')) throw new Error('Atlas layout changed: expected one <title>Atlas</title> and one module script');

const js = `(() => {\n${read('ord/dictionary.js')}\n${read('ord/ord-logic.js')}\n${read('ord/ord.js')}\n})();`;
new Function(js); // parse check: a syntax error fails the build, not the client's browser
// ord/assets/* referenced from the CSS as url("assets/...") are inlined as data URIs (the app stays one file)
const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', svg: 'image/svg+xml' };
const css = read('ord/ord.css').replace(/url\("assets\/([^"]+)"\)/g, (_, f) => `url("data:${MIME[f.split('.').pop()]};base64,${readFileSync(join(ROOT, 'ord', 'assets', f)).toString('base64')}")`);
const ext = `<style>\n${css}</style>
<script>/* ORD ALP extension, generated from ord/ by scripts/build-ord-app.mjs. Edit ord/, not this file. */
${js}
</script>
`;
const out = atlas.replace('<title>Atlas</title>', () => '<title>ORD ALP</title>').replace(MODULE, () => ext + MODULE);
writeFileSync(join(ROOT, 'dist', 'ORD-ALP.html'), out);
console.log(`wrote dist/ORD-ALP.html (${Math.round(out.length / 1024)} KB)`);
