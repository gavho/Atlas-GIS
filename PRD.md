# PRD — Atlas

**A simple, fast, browser-only GIS.** Open shapefiles, KML/KMZ, GeoJSON and CSV, then edit geometry and attributes, add fields, measure, buffer, print and export. Everything runs from one `index.html` opened by double-click. No install, no server, and no data leaves the machine.

Atlas replaces the earlier *ORD Spatial Model* (a CIP planning tool for O'Hare). The CIP features (program dashboard, schedule, timeline, conflict checks, CIP reports) were removed in v2. Old ORD workspaces still open (see FR-PST-4).

## 1. Goal
- One file that any GIS user can open and use in under a minute.
- Edit real data: shapes **and** attribute tables, including the schema (add, rename, retype and delete fields).
- Stay smooth on modest laptops. Users can lock the map to their **GIS Area**, so the map never streams tiles for the rest of the world.
- A modern look (lime on neutral, dark and light) that never gets in the way of the map.

### Success metrics
- Opening a shapefile and editing a cell takes < 30 s for a first-time user.
- A 10k-feature polygon layer pans at 60 fps in 2D on a mid-range laptop (performance mode allowed).
- A shapefile round-trip (import → edit → export → re-import) keeps geometry, values and field types.

## 2. Scope
**In:** viewing, styling, labeling, geometry editing, attribute and schema editing, measure, buffer, GIS Area, map print (PDF/PNG), data export (SHP/GeoJSON/KML/CSV), copy map image, presentation, workspaces with autosave.
**Out:** geoprocessing beyond buffer, joins, raster import, geocoding/place search (would send data off-machine), accounts and sync, vector tiles (PMTiles), expression-based field calculator.

## 3. Functional requirements

### 3.1 Map (FR-MAP)
- **FR-MAP-1** MapLibre map with Dark, Light (auto-follow theme), Streets and Imagery basemaps.
- **FR-MAP-2** First launch opens on an open-world view of the US. No limits until the user sets a GIS Area.
- **FR-MAP-3** 2D/3D toggle. 3D tilts and extrudes polygons with *Extrude* on. Terrain is opt-in.
- **FR-MAP-4** Coordinate readout in WGS84 decimal, DMS, Web Mercator or Illinois East (US ft). Right-click copies coordinates.
- **FR-MAP-5** Home zooms to the GIS Area, else all visible data, else the world. Alt+← goes to the previous extent.

### 3.2 GIS Area (FR-AREA)
- **FR-AREA-1** The user can lock the map to an area from the current view, a drawn box, a layer's extent, typed W/S/E/N coordinates, or a saved area.
- **FR-AREA-2** Locking sets `maxBounds` (area + 15%) and a minimum zoom. Tiles outside the area are never requested.
- **FR-AREA-3** Optional dim mask outside the area, also used on map prints.
- **FR-AREA-4** Saved areas are kept in the workspace. "Chicago O'Hare (ORD)" ships as a built-in preset.
- **FR-AREA-5** Unlock returns to the open world. Importing data outside a locked area warns and offers to fit the area.

### 3.3 Import (FR-IO)
- **FR-IO-1** Shapefile (.zip, or .shp+.dbf+.prj+.cpg picked together), KML, KMZ, GeoJSON and CSV (lat/lon columns are auto-detected, otherwise asked). Files can be opened with a picker, dropped anywhere, or opened as a workspace file.
- **FR-IO-2** Parsing runs in a Blob-URL worker. Projected data is reprojected with the .prj or a chosen CRS (EPSG:3435, 26971, 3857, or a custom proj4/WKT string).
- **FR-IO-3** Field types are inferred per column: text, number, date (YYYY-MM-DD), yes/no. Mixed columns become text.
- **FR-IO-5** Picking or dropping a lone `.shp` (Chrome/Edge) asks once for its folder, with the picker opened there. Atlas then reads the matching `.dbf`, `.prj` and `.cpg`. The folder is reused without asking for the rest of the session. Elsewhere, the user is told to pick the parts together or a `.zip`.
- **FR-IO-6** *Open folder* (Chrome/Edge) imports every dataset in a folder and two levels of subfolders, with all shapefile parts. A folder holding an `.atlas.json` opens as that project. Granted folders are remembered in IndexedDB, so a lone `.shp` from them loads its parts after at most a one-click browser permission.
- **FR-IO-4** Malformed input shows a toast with details and never crashes the app. Layers over 50k features show a performance tip.

### 3.4 Layers (FR-LYR)
- **FR-LYR-1** Flat, drag-ordered list with visibility toggle, feature count, attribute table button and a menu.
- **FR-LYR-2** The highlighted (*target*) layer receives new shapes. Drawing with no layers creates "Sketch".
- **FR-LYR-3** Style: fill, outline, opacities, width, label field, color-by-field (categorical), 3D height field and default height. Style presets.
- **FR-LYR-4** Layer menu: rename, style, table, fields, buffer, explode multi-part, use extent as GIS Area, quick export (SHP/GeoJSON/KML/CSV), exclude from save, remove.

### 3.5 Editing (FR-EDIT)
- **FR-EDIT-1** Every layer is editable. Draw polygon, rectangle, circle, line, point or freehand into the target layer.
- **FR-EDIT-2** Double-click a feature (or select it and press E) to edit vertices: drag, add midpoints, delete vertices, move the shape. Enter or Done saves; Esc cancels.
- **FR-EDIT-3** Snapping to vertices of visible layers within 10 px while drawing and editing (toggle).
- **FR-EDIT-4** Multi-part features can't be vertex-edited directly. "Explode" splits them into single parts.
- **FR-EDIT-5** Select with click, add with Shift/Ctrl-click (map or table), or select a range with Shift-click in the table. Delete removes the selection.
- **FR-EDIT-6** Undo/redo (60 steps) covers geometry, attributes, fields and deletes.

### 3.6 Attributes and fields (FR-FLD)
- **FR-FLD-1** Virtualized attribute table: sort, search, "selected only", zoom to row, double-click a cell to edit inline (typed input, Enter commits, Esc cancels).
- **FR-FLD-2** The inspector shows every field as a typed input. Changes commit on change.
- **FR-FLD-3** Add a field (name, type, default), rename, change type (values converted; values that can't convert are reported and undoable), and delete (confirmed).
- **FR-FLD-4** Set a field value for the selection, or for all features.
- **FR-FLD-5** Names are unique (case-insensitive), not empty, and `_fid` is reserved.

### 3.7 Analysis (FR-ANL)
- **FR-ANL-1** Measure distance (ft/mi) and area (acres, sq ft, perimeter).
- **FR-ANL-2** Buffer a feature, a selection or a layer by feet into a new layer that keeps the source fields.

### 3.8 Export (FR-EXP)
- **FR-EXP-1** Export center: Map print, Data export, Copy map image, Present.
- **FR-EXP-2** Map print: Letter, Tabloid or ANSI D sheet with title block, logo, legend, north arrow and scale bar (ft or mi), as PDF or PNG. Prints the view, the GIS Area, the selected feature or a saved view.
- **FR-EXP-3** Data export: Shapefile .zip (WGS84 .prj, one file per geometry type), GeoJSON, KML or CSV (with lat/lon, area and length). Can export the selection only. Field names are shortened and de-duplicated to 10 characters for DBF, and the user is told which names changed.
- **FR-EXP-4** Copy the map image to the clipboard (falls back to download).
- **FR-EXP-6** Project package: one `<name>.atlas.zip` holding `<name>/<name>.atlas.json` (the exact project) and `<name>/shapefiles/` (every layer as shapefiles, for any GIS). Dropping the zip on Atlas reopens the project.
- **FR-EXP-5** Presentation: full screen, stepping through saved views or the features of the target layer.

### 3.9 Persistence (FR-PST)
- **FR-PST-1** Workspace file `*.atlas.json`: layers (data, fields, style), view, GIS Area, saved areas and views, style presets, settings.
- **FR-PST-2** Autosave to IndexedDB, with "Restore last session" on launch.
- **FR-PST-3** Theme and settings are kept in localStorage (`atlas-*` keys).
- **FR-PST-4** v1 ORD workspaces (`*.ordws.json`) open: drawings merge into layers, `std_*` values become plain fields (`name`, `status`, `start_date`, …), and the focus ring becomes the GIS Area.

### 3.10 UI (FR-UI)
- **FR-UI-1** Dark default, light toggle, both from DESIGN.md tokens only.
- **FR-UI-2** Command palette (Ctrl+K) with every action, layer and feature search. Keyboard shortcuts (`?`).
- **FR-UI-3** Performance mode: pixel ratio 1, no 3D buildings or terrain, no blur or animation. `prefers-reduced-motion` is respected.
- **FR-UI-4** Panels (layers, inspector, table) toggle with `[`, `]` and `\`. A closed side panel leaves a tab on the map edge to reopen it. Responsive down to tablet width.

## 4. Non-functional
- Single `index.html`, no build, runs from `file://`. Workers come from Blob URLs, and there is no `fetch()` for local files (sample loading falls back to the picker).
- No telemetry and no uploads. Network traffic is limited to the pinned CDNs, basemap, terrain and font tiles.
- Units: US feet, miles and acres. Geometry is stored in WGS84.

## 5. Data model
- **Layer:** `{ id, name, visible, source, fields: [{ name, type }], style, nextId, data: FeatureCollection, excludeFromSave }`.
- **Feature:** GeoJSON with `properties._fid` (stable id, also the MapLibre feature id) plus one value per field. `null` means empty.
- **Workspace v2:** `{ schemaVersion: 2, app: 'Atlas', name, view, ui: { theme, basemap, area, … }, layers, presets, areas, settings }`.

## 6. Architecture
Sections inside `index.html`, each marked with a banner comment:
`CONFIG → UTIL → FIELDS → STATE → MAP → AREA → LAYERS(render) → IO → LAYERS(ui) → DRAW → ANALYSIS → TABLE → INSPECTOR → EXPORTS → PRESENT → PERSISTENCE → UI → BOOT`.

**State:** one `S` object. Changes go through `changed(...topics)` / `emit(...)`, and panels re-render from state. `select()` is the only writer of the selection. `syncLayer(layer, m, o)` is the one renderer for the main map and print maps.

### 6.1 Libraries (pinned)
| Purpose | Library | Version | Load |
|---|---|---|---|
| Map / 3D | maplibre-gl | 5.24.0 (UMD; v6's module worker is blocked on `file://`) | jsDelivr |
| Drawing | terra-draw + maplibre adapter | 1.36.0 / 1.4.1 | jsDelivr `+esm` |
| Geometry | @turf/turf | 7.4.0 | jsDelivr |
| Shapefile in | shpjs | 6.2.0 | worker |
| KML | @tmcw/togeojson | 7.1.2 | jsDelivr |
| Zip | jszip | 3.10.2 | jsDelivr |
| CSV | papaparse | 5.7.0 | worker |
| Reprojection | proj4 | 2.22.0 | jsDelivr + worker |
| Autosave | idb-keyval | 6.3.0 | jsDelivr `+esm` |
| PDF out | jspdf | 4.2.1 | lazy (`needLib`) |
| Shapefile out | @mapbox/shp-write | 0.4.3 | lazy (`needLib`) |
| Fonts | Inter, JetBrains Mono | — | Google Fonts |

### 6.2 External services (no keys)
OpenFreeMap styles and glyphs, Esri World Imagery, AWS Terrain Tiles (Terrarium). If tiles fail, data still renders.

## 7. Known limits
- Undo stores whole-layer snapshots. Fine to about 100k features.
- DBF column types are inferred by shp-write from the values. An empty first value in a number column can export as text.
- Shapefile export is WGS84 only (no reprojection back to the source CRS).
- Snapping is to vertices, not to edges.
