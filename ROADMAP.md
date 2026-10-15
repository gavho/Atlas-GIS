# Roadmap — Atlas

**v2** = built in the Atlas overhaul. **Next** = recommended later, smallest first.

Principles: one obvious path, sensible defaults, fast first (GIS Area, workers, lazy libraries), and no data leaving the machine.

## 1. Data and editing
| Tool | What it does | Status |
|---|---|---|
| Import SHP / KML / KMZ / GeoJSON / CSV | Picker, drag-drop, auto-reprojection from .prj or a chosen CRS | v1 |
| Edit any layer | Draw into the target layer, double-click to edit vertices, snapping, explode multi-part | **v2** |
| Attribute table editing | Inline typed cell editing, multi-select, set a value for the selection, delete | **v2** |
| Field management | Add, rename, change type and delete fields, with full undo | **v2** |
| Shapefile round-trip | Export with 10-char DBF names de-duplicated, WGS84 .prj | **v2** |
| Snap to edges (not just vertices) | | Next |
| Expression calculator (`[a] * 2`, concat) | | Next |
| Export Shapefile in the source CRS | | Next |
| Split / merge / reshape tools | | Next |

## 2. Speed and focus
| Tool | What it does | Status |
|---|---|---|
| GIS Area | Lock to the view, a box, a layer, coordinates or a saved area. Tiles outside are never requested | **v2** |
| Performance mode | Pixel ratio 1, no 3D buildings, terrain, blur or motion | **v2** |
| Vector tiles for huge layers (PMTiles) | 500k+ features | Next |

## 3. Output
| Tool | What it does | Status |
|---|---|---|
| Map print | Letter / Tabloid / ANSI D, PDF or PNG, title block, legend, north, scale in ft or mi | **v2** (generic) |
| Data export | SHP, GeoJSON, KML, CSV; all or selected | **v2** |
| Copy map image | Clipboard | v1 |
| Presentation | Saved views or the features of a layer | **v2** (generic) |

## 4. Removed in v2 (ORD CIP)
Program dashboard, Gantt schedule, timeline playback, conflict check and report, project sheets, program summary, the CIP field-mapping schema, airport categories, and the ORD demo. Old ORD workspaces still open. Their fields are kept as plain attributes.
