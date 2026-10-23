# PRD — Atlas

**A simple, fast, browser-only GIS.** Open shapefiles, KML/KMZ, GeoJSON, CSV and AutoCAD DWG, then edit geometry and attributes, add fields, measure, buffer, print and export. Everything runs from one `dist/Atlas-GIS.html` opened by double-click. No install, no server, and no data leaves the machine.

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
- **FR-IO-8** A workspace is recognised by its header (`{"schemaVersion":…,"app":"Atlas"`), not only by a `.atlas.json` name. A copy the browser renamed ("x.atlas (1).json") still opens as a workspace instead of failing as GeoJSON.
- **FR-IO-7** AutoCAD `.dwg` (R13–2018+) opens like any other file. The reader (LibreDWG WASM, about 11 MB) downloads on the first DWG only. Only model-space entities are read:
  - **Geometry:** LINE, (LW)POLYLINE, ARC, ELLIPSE and SPLINE become lines. Closed polylines, CIRCLE, HATCH, SOLID and 3DFACE become polygons. POINT and block INSERTs become points. TEXT and MTEXT become text points. Bulges and arcs are densified at 5°.
  - **Layers:** one drawing becomes up to four layers, `<file> — Polylines / Polygons / Points / Text`. Each layer gets one flat color (no color-by), the Text layer is labeled by `Text`, and category lists start folded. *Color by attribute → Layer* is one step away.
  - **Fields:** `Layer`, `EntityType`, `Handle`, `Color` (hex, ByLayer resolved), `Linetype` and `Elevation`. Blocks also get `BlockName`, `Rotation` (degrees) and one field per ATTRIB tag. Text also gets `Text`, `Height` and `Rotation`. XDATA becomes `XD_<app>` text.
  - **Not imported:**
    - Entities on `Defpoints` / `Deleted Elements` layers.
    - Entities on layers turned off or frozen in CAD.
    - Features over 20× the median distance from the drawing's median point (strays left at the origin).
    - Whole drawings whose coordinates aren't georeferenced (legends, tables, detail sheets drawn near 0,0).
  - **LWPOLYLINE closed flag:** LWPOLYLINE is closed on LibreDWG flag 512. Bit 1 means "has extrusion". A closed shape with fewer than 3 vertices stays a line.
  - **CRS:** DWG has no .prj, so the CRS is asked for (FR-IO-2). In a multi-file import the dialog offers *Use for the other N file(s)* (on by default), so a folder of DWGs asks once.
  - **Toasts:**
    - A single file reports skipped objects (dimensions, viewports, images, CAD housekeeping) in a toast. Map 3D object data and unreadable files also give a toast.
    - A multi-file import (any format) ends with one summary toast instead: files imported out of total, layers added, files not loaded with reasons (full list under *Details*), CAD objects left out, large and out-of-area layers. It then zooms once.

### 3.4 Layers (FR-LYR)
- **FR-LYR-1** Drag-ordered list with visibility toggle, feature count, attribute table button and a menu.
- **FR-LYR-5** Layer groups:
  - **Group visibility:** the group eye is its own switch (`S.hiddenGroups`, saved in the workspace). A layer shows only when its own eye and every group above it are on. Turning a group off and on never changes the layers' own eyes, and layers inside a hidden group are dimmed in the panel.
  - **Header:** a collapsible header with a group visibility toggle, an icon, the total feature count and a menu (focus, zoom to group, appearance, rename, move out to top level, ungroup one level, remove the group and its layers).
  - **Empty groups:** the *New group* button (folder +) in the Layers panel header creates an empty group, and *New group inside…* in a group menu creates an empty sub-group.
    - These are stored in `S.emptyGroups` and saved in the workspace. They render at the top of their level with an "Empty — drag layers or groups here" hint.
    - They stay listed after their last layer leaves.
    - Groups that came from layers only (e.g. DWG imports) disappear when they become empty.
  - **Appearance:** a group's icon (12 choices) and icon color are set from *Appearance…*.
  - **Nesting:** groups nest to any depth. `layer.group` is a path such as `ALP/Fencing`, and "/" in typed names becomes " - ".
  - **Joining:**
    - From the layer menu: *Move to “…”*, *New group…*, *New group inside “…”…*, *Remove from group*.
    - By dragging a layer onto a layer in the group, or onto the group header.
  - **Moving groups:** dragging a group header onto another header nests it there. Dropping it onto a layer moves it into that layer's group.
  - **Order:** members stay together in the draw order.
  - **DWG:** a DWG import is grouped automatically under the file name. Its layers show as Polygons / Polylines / Points / Text inside the group, with category lists folded.
  - **Category lists:** each layer's category list folds with its own arrow. The fold state (`legendOpen`) is saved, and focus never changes it.
  - **Saving:** groups, their appearance, hidden groups and collapsed groups (`ui.closedGroups`) are saved in the workspace.
- **FR-LYR-6** *Focus on this layer / group* from the layer or group menu.
  - **Map:** every other layer is drawn in one muted flat color at reduced opacity, with no labels. Their own style settings are not changed.
  - **Legends:** in the panel and the on-map legend, the other layers show without category lists.
  - **Exit:** a focus bar at the top of the panel names the focus, and *Show all* exits. Choosing the same focus again also exits.
  - **Scope:** the main map only (prints are not dimmed). Focus is not saved.
- **FR-LYR-2** The highlighted (*target*) layer receives new shapes. Drawing with no layers creates "Sketch".
- **FR-LYR-3** Style: fill, outline, opacities, width, label field, color-by-field (categorical), 3D height field and default height. Style presets.
  - **Category menu:** right-clicking a category in the layers panel offers a new unused color, a custom color, solid or dashed lines, thicker or thinner (±1), hide/show, *Show only this*, *Show all* and *Reset style*.
  - **Dashed lines:** dashed categories draw on a second line sublayer per layer, because `line-dasharray` can't vary per feature.
- **FR-LYR-4** Layer menu: rename, style, table, fields, buffer, explode multi-part, use extent as GIS Area, quick export (SHP/GeoJSON/KML/CSV), exclude from save, remove.

### 3.5 Editing (FR-EDIT)
- **FR-EDIT-0** Selection and hover are a blue outline (`--select`) around lines, polygon edges and points. Fills keep their own color.
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
  - **Chip:** the result shows in a chip that uses the theme surface, so it reads on dark and light basemaps.
  - **Cursor label:** while measuring, a label at the cursor shows the running total, the segment being drawn, and the area once there are 3 points.
- **FR-ANL-2** Buffer a feature, a selection or a layer by feet into a new layer that keeps the source fields.

### 3.8 Export (FR-EXP)
- **FR-EXP-1** Export center: Map print, Data export, Copy map image, Present. Wizard text boxes start empty. Title, date and file name show a grey suggestion that is used when the box is left blank. Optional boxes (subtitle, exhibit no., notes) stay empty.
- **FR-EXP-2** Map print: Letter, Tabloid or ANSI D sheet with title block, logo, legend, north arrow and scale bar (ft or mi), as PDF or PNG. Prints the view, the GIS Area, the selected feature or a saved view.
- **FR-EXP-3** Data export: Shapefile .zip (WGS84 .prj, one file per geometry type), GeoJSON, KML or CSV (with lat/lon, area and length). Can export the selection only. Field names are shortened and de-duplicated to 10 characters for DBF, and the user is told which names changed.
- **FR-EXP-4** Copy the map image to the clipboard (falls back to download).
- **FR-EXP-6** Project package: one `<name>.atlas.zip` holding `<name>/<name>.atlas.json` (the exact project) and `<name>/shapefiles/` (every layer as shapefiles, for any GIS). Dropping the zip on Atlas reopens the project. *Include shapefiles* (on by default) can be turned off for very large projects: shp-write can stall on layers of ~100k features, and the .atlas.json alone reopens the project.
- **FR-EXP-5** Presentation: full screen, stepping through saved views or the features of the target layer.

### 3.9 Persistence (FR-PST)
- **FR-PST-1** Workspace file `*.atlas.json`: layers (data, fields, style), view, GIS Area, saved areas and views, style presets, settings.
  - **Visibility state:** reopening a workspace or project package restores exactly what was on and off:
    - each layer's eye and its hidden categories;
    - hidden groups and empty groups;
    - which groups and category lists are folded.
  - **Hidden layers:** hidden layers are still saved and packaged; they are not dropped.
- **FR-PST-2** Autosave to IndexedDB, with "Restore last session" on launch.
- **FR-PST-3** Theme and settings are kept in localStorage (`atlas-*` keys).
- **FR-PST-4** v1 ORD workspaces (`*.ordws.json`) open: drawings merge into layers, `std_*` values become plain fields (`name`, `status`, `start_date`, …), and the focus ring becomes the GIS Area.

### 3.10 UI (FR-UI)
- **FR-UI-1** Dark default, light toggle, both from DESIGN.md tokens only.
- **FR-UI-2** Command palette (Ctrl+K) with every action, layer and feature search. Keyboard shortcuts (`?`).
- **FR-UI-3** Performance mode: pixel ratio 1, no 3D buildings or terrain, no blur or animation. `prefers-reduced-motion` is respected.
- **FR-UI-4** Panels (layers, inspector, table) toggle with `[`, `]` and `\`. A closed side panel leaves a tab on the map edge to reopen it. Responsive down to tablet width.
- **FR-UI-5** The layers panel, inspector and attribute table resize by dragging their inner edge.
  - **Keyboard:** the edge handles are focusable separators; the arrow keys move them by 16 px.
  - **Reset:** double-clicking a handle resets that panel.
  - **Limits:** side panels are clamped to 200–600 px (layers) and 260–680 px (inspector); the table to 120 px – 80% of the window height.
  - **Saving:** sizes are remembered per browser, not in the workspace.
- **FR-UI-6** Guided tours. The six tours are *Navigate the map*, *Create shapes*, *Edit attributes*, *Layers & groups*, *Symbology* and *Import & export*.
  - **Opening a tour:** from the `?` button in the status bar, *More → Guided tours…*, the command palette and the empty-state *Take a tour* button.
  - **Each step:** spotlights one control and explains the ways to use it.
  - **Controls:** Next/Back (or ← →); Esc ends the tour.
  - **Missing targets:** steps whose control isn't on screen show a centered card.

## 4. Non-functional
- Single `dist/Atlas-GIS.html`, no build, runs from `file://`. Workers come from Blob URLs, and there is no `fetch()` for local files (there is no sample-data loader).
- No telemetry and no uploads. Network traffic is limited to the pinned CDNs, basemap, terrain and font tiles.
- Units: US feet, miles and acres. Geometry is stored in WGS84.

## 5. Data model
- **Layer:** `{ id, name, visible, source, fields: [{ name, type }], style, nextId, data: FeatureCollection, excludeFromSave }`.
- **Feature:** GeoJSON with `properties._fid` (stable id, also the MapLibre feature id) plus one value per field. `null` means empty.
- **Workspace v2:** `{ schemaVersion: 2, app: 'Atlas', name, view, ui: { theme, basemap, area, … }, layers, presets, areas, settings }`.

## 6. Architecture
Sections inside `dist/Atlas-GIS.html`, each marked with a banner comment:
`CONFIG → UTIL → FIELDS → STATE → MAP → AREA → LAYERS(render) → IO → LAYERS(ui) → DRAW → ANALYSIS → TABLE → INSPECTOR → EXPORTS → PRESENT → PERSISTENCE → UI → BOOT`.

**Extensions:** an optional `window.ATLAS_EXT` (CONFIG section) lets an app built on Atlas set its brand, start-screen text, autosave key and save action. It also adds hooks: `filter`, `dim`, `paint`, `visible`, `legend`, `legendClick`, `describe`, `inspector`, `editable`, `drawTarget` and `onBoot`. Without it, nothing changes. The ORD ALP (ORD.md) is the first user.

**Bundled project:**
- **Loading:** a page can ship its project in a sibling `<script src="project.js">` that sets `window.ATLAS_BUNDLE = { id, name, zip | json }`. It opens on first launch, once the map style has loaded.
- **Relaunch:** later launches resume the autosave recorded for that bundle id.
- **Building one:** `scripts/build-client-folder.mjs` builds such a folder for any Atlas-based app.

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
| DWG in | @mlightcad/libredwg-web (GPL-3.0) | 0.8.1 | lazy (`needLib`, ES module + WASM) |
| Fonts | Inter, JetBrains Mono | — | Google Fonts |

### 6.2 External services (no keys)
OpenFreeMap styles and glyphs, Esri World Imagery, AWS Terrain Tiles (Terrarium). If tiles fail, data still renders.

## 7. Known limits
- Undo stores whole-layer snapshots. Fine to about 100k features.
- DBF column types are inferred by shp-write from the values. An empty first value in a number column can export as text.
- Shapefile export is WGS84 only (no reprojection back to the source CRS).
- Snapping is to vertices, not to edges.
- DWG import:
  - **Not read:** DXF/DGN, the geometry inside blocks (a block is one point), xrefs, Map 3D object data, DWG geolocation, and full OCS transforms (only mirrored z = −1 is handled).
  - **Approximated:** splines follow fit points.
  - **Main thread:** parsing runs on the main thread.
  - **Crashes:** some older DWGs crash the reader; they show a toast asking to re-save as 2018 DWG.
