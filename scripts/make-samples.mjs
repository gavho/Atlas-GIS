// Generates synthetic (FAKE) test data around O'Hare in /samples, one file per importer.
// Usage: node scripts/make-samples.mjs   (needs internet once, to fetch proj4 from jsDelivr)

import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'samples');
const ORIGIN = [-87.9048, 41.9786]; // ORD reference point

// ---- proj4 (UMD) loaded from the same pinned CDN version the app uses ----
const src = await (await fetch('https://cdn.jsdelivr.net/npm/proj4@2.22.0/dist/proj4.js')).text();
const mod = { exports: {} };
new Function('module', 'exports', src)(mod, mod.exports);
const proj4 = mod.exports.default || mod.exports;
const EPSG3435 = '+proj=tmerc +lat_0=36.66666666666666 +lon_0=-88.33333333333333 +k=0.999975 +x_0=300000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=us-ft +no_defs';
const PRJ_3435 = 'PROJCS["NAD_1983_StatePlane_Illinois_East_FIPS_1201_Feet",GEOGCS["GCS_North_American_1983",DATUM["D_North_American_1983",SPHEROID["GRS_1980",6378137.0,298.257222101]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",984249.9999999999],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",-88.33333333333333],PARAMETER["Scale_Factor",0.999975],PARAMETER["Latitude_Of_Origin",36.66666666666666],UNIT["Foot_US",0.3048006096012192]]';

// ---- geometry helpers: rectangles defined in feet east/north of ORIGIN ----
const FT = 0.3048, M_PER_DEG_LAT = 111132, M_PER_DEG_LON = 111320 * Math.cos(ORIGIN[1] * Math.PI / 180);
const ll = (xft, yft) => [+(ORIGIN[0] + xft * FT / M_PER_DEG_LON).toFixed(7), +(ORIGIN[1] + yft * FT / M_PER_DEG_LAT).toFixed(7)];
// returns a CLOCKWISE ring in lon/lat (shapefile outer-ring order)
function rect(cx, cy, w, h) {
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2;
  return [ll(x0, y0), ll(x0, y1), ll(x1, y1), ll(x1, y0), ll(x0, y0)];
}
const ccw = ring => [...ring].reverse(); // GeoJSON/KML outer rings are counter-clockwise

// ---- the data ----
const ALP = [
  { id: 'A1', DESC: 'Future Apron West',           STAT: 'ALP Future', PHASE: 'Ultimate', r: rect(-7200, -1200, 2000, 1200) },
  { id: 'A2', DESC: 'Future Taxiway A Extension',  STAT: 'ALP Future', PHASE: 'Ultimate', r: rect(-500, -2600, 5000, 250) },
  { id: 'A3', DESC: 'Future Hangar Site',          STAT: 'ALP Future', PHASE: 'Ultimate', r: rect(7500, -3500, 1200, 900) },
  { id: 'A4', DESC: 'Future Deicing Pad North',    STAT: 'ALP Future', PHASE: 'Ultimate', r: rect(-3000, 5600, 1400, 700) },
];
const PROJECTS = [
  { id: 'P1', PROJ_NAME: 'Terminal 5 Apron Expansion',  STAT: 'Planned', START_DT: '3/1/2027',  END_DT: '10/31/2028', CIP_NO: 'CIP-27-014', HGT: 0,  COST: '$48.5M', PROGRAM: 'Terminal',  r: rect(3000, -800, 1600, 1000) },
  { id: 'P2', PROJ_NAME: 'Taxiway Z Rehabilitation',    STAT: 'Planned', START_DT: '5/1/2026',  END_DT: '11/30/2026', CIP_NO: 'CIP-26-031', HGT: 0,  COST: '$12M',   PROGRAM: 'Airfield',  r: rect(-2500, 1500, 2400, 300) },
  { id: 'P3', PROJ_NAME: 'West Cargo Ramp',             STAT: 'Future',  START_DT: '4/1/2029',  END_DT: '12/31/2030', CIP_NO: 'CIP-29-002', HGT: 0,  COST: '$31.2M', PROGRAM: 'Cargo',  r: rect(-7000, -1500, 1500, 1500) },
  { id: 'P4', PROJ_NAME: 'Deicing Pad East',            STAT: 'Planned', START_DT: '1/1/2027',  END_DT: '12/31/2027', CIP_NO: 'CIP-27-022', HGT: 0,  COST: '$9.8M',  PROGRAM: 'Airfield',  r: rect(6000, 2000, 1000, 800) },
  { id: 'P5', PROJ_NAME: 'Satellite Concourse 1',       STAT: 'Planned', START_DT: '1/1/2028',  END_DT: '6/30/2031',  CIP_NO: 'CIP-28-001', HGT: 60, COST: '$420M',  PROGRAM: 'Terminal', r: rect(500, 600, 1200, 700) },
  { id: 'P6', PROJ_NAME: 'North Airfield Drainage',     STAT: 'Future',  START_DT: '',          END_DT: '',           CIP_NO: 'TBD',        HGT: 0,  COST: '',       PROGRAM: 'Airfield',  r: rect(1000, 4500, 3000, 400) },
  { id: 'P7', PROJ_NAME: 'Fuel Farm Relocation',        STAT: 'Planned', START_DT: '6/1/2027',  END_DT: '6/1/2028',   CIP_NO: 'CIP-27-040', HGT: 35, COST: '$27M',   PROGRAM: 'Support Facilities', r: rect(-4500, -4000, 800, 800) },
];
const CONSTRUCTION = [
  { id: 'C1', Name: 'T5 Landside Utilities',        Status: 'Under Construction', Start: '2026-01-15', Finish: '2027-09-30', Contractor: 'Sample Contractor A', Budget: 18500000, Program: 'Terminal', Height_ft: 20, r: rect(3400, -1100, 1000, 800) },
  { id: 'C2', Name: 'Taxiway Z Lighting',           Status: 'Under Construction', Start: '2024-04-01', Finish: '2025-10-31', Contractor: 'Sample Contractor B', Budget: 4200000, Program: 'Airfield', Height_ft: 10, r: rect(-2000, 1500, 800, 400) },
  { id: 'C3', Name: 'Concourse Connector Tunnel',   Status: 'Under Construction', Start: '2026-06-01', Finish: '2028-12-31', Contractor: 'Sample Contractor C', Budget: 96000000, Program: 'Terminal', Height_ft: 25, r: rect(1000, 900, 600, 600) },
  { id: 'C4', Name: 'North Perimeter Road',         Status: 'Under Construction', Start: '2026-03-01', Finish: null,         Contractor: 'Sample Contractor D', Budget: 7600000, Program: 'Landside', Height_ft: 10, r: rect(1500, 4200, 2000, 300) },
  { id: 'C5', Name: 'Fuel Hydrant Upgrade',         Status: 'Under Construction', Start: '2027-01-01', Finish: '2027-12-31', Contractor: 'Sample Contractor E', Budget: 5100000, Program: 'Support Facilities', Height_ft: 10, r: rect(-4500, -3300, 600, 300) },
];
const NAVAIDS = [
  ['N1', 'ILS Localizer 10L (sample)', 'LOC', -1500, 5200],
  ['N2', 'ILS Glideslope 28R (sample)', 'GS', 5200, 4800],
  ['N3', 'ASOS Station (sample)', 'WX', -900, -300],
  ['N4', 'VOR/DME (sample)', 'VOR', -5600, 2600],
  ['N5', 'ILS Localizer 27L (sample)', 'LOC', -8200, -2200],
  ['N6', 'RVR Sensor (sample)', 'RVR', 2600, 2900],
];

// ---- writers ----
const crcTable = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

function zip(entries) { // entries: [{name, data:Buffer}]
  const locals = [], centrals = []; let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name), comp = deflateRawSync(data), crc = crc32(data);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8);
    lh.writeUInt16LE(0x6000, 10); lh.writeUInt16LE(0x5b46, 12); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nameBuf.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10);
    ch.writeUInt16LE(0x6000, 12); ch.writeUInt16LE(0x5b46, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20);
    ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nameBuf.length, 28); ch.writeUInt32LE(offset, 42);
    locals.push(lh, nameBuf, comp); centrals.push(ch, nameBuf);
    offset += 30 + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

function shapefile(records, fields, project) { // polygons; records: [{ring:[[x,y]..], props}]
  const rings = records.map(r => r.ring.map(project));
  const bbox = pts => pts.reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
  const all = bbox(rings.flat());
  const header = len => { const h = Buffer.alloc(100); h.writeInt32BE(9994, 0); h.writeInt32BE(len / 2, 24); h.writeInt32LE(1000, 28); h.writeInt32LE(5, 32); all.forEach((v, i) => h.writeDoubleLE(v, 36 + i * 8)); return h; };
  const recs = [], shx = []; let off = 100;
  rings.forEach((ring, i) => {
    const content = Buffer.alloc(44 + 4 + ring.length * 16);
    content.writeInt32LE(5, 0); bbox(ring).forEach((v, k) => content.writeDoubleLE(v, 4 + k * 8));
    content.writeInt32LE(1, 36); content.writeInt32LE(ring.length, 40); content.writeInt32LE(0, 44);
    ring.forEach(([x, y], k) => { content.writeDoubleLE(x, 48 + k * 16); content.writeDoubleLE(y, 56 + k * 16); });
    const rh = Buffer.alloc(8); rh.writeInt32BE(i + 1, 0); rh.writeInt32BE(content.length / 2, 4);
    recs.push(rh, content);
    const sx = Buffer.alloc(8); sx.writeInt32BE(off / 2, 0); sx.writeInt32BE(content.length / 2, 4); shx.push(sx);
    off += 8 + content.length;
  });
  const shpBody = Buffer.concat(recs), shxBody = Buffer.concat(shx);
  // dbf
  const recLen = 1 + fields.reduce((s, f) => s + f.len, 0), hdrLen = 32 + 32 * fields.length + 1;
  const dh = Buffer.alloc(32); dh[0] = 3; dh[1] = 126; dh[2] = 10; dh[3] = 6;
  dh.writeUInt32LE(records.length, 4); dh.writeUInt16LE(hdrLen, 8); dh.writeUInt16LE(recLen, 10);
  const fds = fields.map(f => { const b = Buffer.alloc(32); b.write(f.name, 0, 10, 'ascii'); b.write(f.type, 11, 1, 'ascii'); b[16] = f.len; b[17] = 0; return b; });
  const rows = records.map(r => Buffer.concat([Buffer.from(' '), ...fields.map(f => {
    const v = String(r.props[f.name] ?? '');
    return Buffer.from((f.type === 'N' ? v.padStart(f.len) : v.padEnd(f.len)).slice(0, f.len), 'latin1');
  })]));
  const dbf = Buffer.concat([dh, ...fds, Buffer.from([0x0d]), ...rows, Buffer.from([0x1a])]);
  return { shp: Buffer.concat([header(100 + shpBody.length), shpBody]), shx: Buffer.concat([header(100 + shxBody.length), shxBody]), dbf };
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
function kml(name, placemarks) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(name)}</name>
<Folder><name>Capital Program (SAMPLE - FAKE DATA)</name>
${placemarks.map(p => `<Placemark><name>${esc(p.name)}</name><ExtendedData>${Object.entries(p.data).map(([k, v]) => `<Data name="${k}"><value>${esc(v)}</value></Data>`).join('')}</ExtendedData>
<Polygon><outerBoundaryIs><LinearRing><coordinates>${p.ring.map(c => c.join(',')).join(' ')}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`).join('\n')}
</Folder></Document></kml>`;
}

// ---- write everything ----
rmSync(ROOT, { recursive: true, force: true });
mkdirSync(join(ROOT, 'alp_noprj'), { recursive: true });

const to3435 = c => proj4('EPSG:4326', EPSG3435, c);
const alpFields = [{ name: 'ALP_ID', type: 'C', len: 6 }, { name: 'DESC', type: 'C', len: 40 }, { name: 'STAT', type: 'C', len: 20 }, { name: 'PHASE', type: 'C', len: 12 }];
const alp = shapefile(ALP.map(a => ({ ring: a.r, props: { ALP_ID: a.id, DESC: a.DESC, STAT: a.STAT, PHASE: a.PHASE } })), alpFields, to3435);
writeFileSync(join(ROOT, 'alp_sample.zip'), zip([
  { name: 'alp_sample.shp', data: alp.shp }, { name: 'alp_sample.shx', data: alp.shx }, { name: 'alp_sample.dbf', data: alp.dbf },
  { name: 'alp_sample.prj', data: Buffer.from(PRJ_3435) }, { name: 'alp_sample.cpg', data: Buffer.from('UTF-8') },
]));
for (const ext of ['shp', 'shx', 'dbf']) writeFileSync(join(ROOT, 'alp_noprj', `alp_noprj.${ext}`), alp[ext]);

writeFileSync(join(ROOT, 'projects_sample.kmz'), zip([{ name: 'doc.kml', data: Buffer.from(kml('Capital Projects (sample)', PROJECTS.map(p => ({
  name: p.PROJ_NAME, ring: ccw(p.r), data: { PROJ_NAME: p.PROJ_NAME, STAT: p.STAT, START_DT: p.START_DT, END_DT: p.END_DT, CIP_NO: p.CIP_NO, HGT: p.HGT, COST: p.COST, PROGRAM: p.PROGRAM },
})))) }]));

writeFileSync(join(ROOT, 'construction.geojson'), JSON.stringify({
  type: 'FeatureCollection', name: 'Active Construction (SAMPLE - FAKE DATA)',
  features: CONSTRUCTION.map(({ r, ...props }) => ({ type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: [ccw(r)] } })),
}, null, 1));

writeFileSync(join(ROOT, 'navaids.csv'), 'ID,Description,Type,Lat,Long\n' + NAVAIDS.map(([id, d, t, x, y]) => { const [lon, lat] = ll(x, y); return `${id},"${d}",${t},${lat},${lon}`; }).join('\n') + '\n');

writeFileSync(join(ROOT, 'README.md'), `# Sample data (synthetic — NOT real ORD data)

Generated by \`node scripts/make-samples.mjs\`. Positions are rough and made up.

| File | Format | Tests |
|---|---|---|
| alp_sample.zip | Shapefile (EPSG:3435, with .prj) | zipped SHP + reprojection |
| alp_noprj/ | Shapefile parts, **no .prj** | loose-file grouping + CRS dialog (pick EPSG:3435) |
| projects_sample.kmz | KMZ | KMZ unzip, ExtendedData, M/D/YYYY dates |
| construction.geojson | GeoJSON | ISO dates, open-ended end date, height field |
| navaids.csv | CSV (Lat/Long) | CSV lat/lon detection |

Field names deliberately differ from the standard schema (DESC, STAT, START_DT, Finish…) to exercise field mapping.

## Expected conflict check
Target **projects_sample** vs **construction** + **alp_sample**, buffer **200 ft**, *require date overlap* **on**:

| Severity | Target | Conflicts with |
|---|---|---|
| High | Terminal 5 Apron Expansion | T5 Landside Utilities |
| High | Satellite Concourse 1 | Concourse Connector Tunnel |
| Medium | North Airfield Drainage (undated) | North Perimeter Road |
| Medium | West Cargo Ramp | Future Apron West (ALP, undated) |
| Low | Fuel Farm Relocation | Fuel Hydrant Upgrade (150 ft apart — buffer only) |

Taxiway Z Rehabilitation × Taxiway Z Lighting overlaps in space but not in time, so it is excluded when *require date overlap* is on (and shown as Low when off). Deicing Pad East has no conflicts.
`);
console.log('Samples written to', ROOT);
