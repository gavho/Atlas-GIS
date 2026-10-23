// Builds a hand-off folder: the app + its project, opened automatically on double-click (file:// can't read files, but it can load a sibling <script>).
//   <out>/Open <Name>.html   the app, with <script src="project.js"> added
//   <out>/project.js         window.ATLAS_BUNDLE = { id, name, zip | json }: the project (.atlas.zip as base64, or .atlas.json text)
//   <out>/README.txt         how to open and use it
// Usage: node scripts/build-client-folder.mjs --app dist/ORD-ALP.html --project <project.atlas.zip|.atlas.json> --out "<folder>" [--name "ORD ALP"] [--changes-only]
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join, basename } from 'node:path';
import { createHash } from 'node:crypto';

const arg = k => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : null; };
const APP = arg('app') || 'dist/ORD-ALP.html', PROJECT = arg('project'), OUT = arg('out'), NAME = arg('name') || 'ORD ALP', CHANGES_ONLY = process.argv.includes('--changes-only');
if (!PROJECT || !OUT) { console.error('Usage: node scripts/build-client-folder.mjs --app <app.html> --project <.atlas.zip|.atlas.json> --out <folder> [--name <name>] [--changes-only]'); process.exit(2); }
if (!/\.atlas\.(zip|json)$/i.test(PROJECT)) throw new Error('The project must be an .atlas.zip project package or an .atlas.json workspace');

const html = readFileSync(APP, 'utf8'), data = readFileSync(PROJECT);
if (!html.includes('</title>')) throw new Error(`${APP} doesn't look like an Atlas app`);
const isZip = /\.zip$/i.test(PROJECT);
const projectName = isZip ? basename(PROJECT).replace(/\.atlas\.zip$/i, '') : JSON.parse(data.toString('utf8')).name || basename(PROJECT);
// the id changes with the content, so a new delivery replaces the recipient's saved session instead of being hidden behind it
const id = `${projectName}-${createHash('sha1').update(data).digest('hex').slice(0, 12)}`;
const bundle = `/* ${NAME}: the delivered project. Loaded by the app on first launch; do not edit. */\nwindow.ATLAS_BUNDLE = ${JSON.stringify({ id, name: projectName, ...(isZip ? { zip: data.toString('base64') } : { json: data.toString('utf8') }) })};\n`;

if (existsSync(OUT)) rmSync(OUT, { recursive: true });
mkdirSync(OUT, { recursive: true });
const page = `Open ${NAME}.html`;
writeFileSync(join(OUT, page), html.replace('</title>', () => '</title>\n<script src="project.js"></script>'));
writeFileSync(join(OUT, 'project.js'), bundle);
writeFileSync(join(OUT, 'README.txt'), [
  `${NAME}`, '',
  `To open: double-click "${page}". Use Google Chrome or Microsoft Edge.`,
  'The first launch loads the project automatically (large projects take up to a minute). Keep "project.js" next to the .html file.', '',
  'To open a separate project.js bundle, use Open Project in the app. Only generated Atlas bundles are accepted; scripts are not run.',
  'Internet: needed for the map libraries and the background map. Your data and drawings never leave this computer.',
  CHANGES_ONLY
    ? 'Your full session is saved in this browser and comes back the next time you open the file. Save changes (or press Ctrl+S) downloads an .atlas.json containing only your added, imported and sketched layers, not the delivered ALP. Send that file back to the project team.'
    : 'Your work: anything you sketch is saved in this browser and comes back the next time you open the file.',
  CHANGES_ONLY
    ? 'To add a returned changes file to the ALP, open it in this app and choose "Add its layers to the open ALP" (the default). To start over, use ... (More) > Reload the original project.'
    : 'To share your work, use Export > Project package and send the .zip. To start over, use ... (More) > Reload the original project.', '',
  'Help: click ? at the bottom right for guided tours.', '',
].join('\r\n'));
console.log(`wrote ${OUT} (${page}, project.js ${Math.round(bundle.length / 1e6)} MB, README.txt), bundle id ${id}`);
